export interface LlmOptions {
  systemPrompt?: string;
  temperature?: number;
  responseFormat?: { type: "json_object" };
  model?: string;
  /**
   * Sätt när svaret MÅSTE vara reproducerbart — samma underlag ska ge samma
   * utfall. Då görs inget omförsök utan `temperature`: hellre inget svar än
   * ett svar på ett default vi inte styr.
   *
   * Verifieringen är fallet det finns för. Den är den oberoende kontrollen
   * av att ett citat återges ord för ord, och en grind som svarar olika på
   * samma indata är ingen grind. Att tyst köra den på modellens eget
   * default vore att lossa citatgrinden utan att någon bett om det.
   */
  kravReproducerbart?: boolean;
}

export interface LlmClient {
  complete(prompt: string, opts?: LlmOptions): Promise<string>;
}

type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Tolkar Retry-After (sekunder eller HTTP-datum) till ms, kapat. */
function parseRetryAfterMs(h: string | null, capMs: number): number | null {
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(capMs, Math.max(0, secs * 1000));
  const date = Date.parse(h);
  if (Number.isFinite(date)) return Math.min(capMs, Math.max(0, date - Date.now()));
  return null;
}

/**
 * Värdnamnet ur en endpoint-URL, för felmeddelanden. Bara värden — aldrig
 * sökvägen, och aldrig nyckeln: felet hamnar i körningsloggen, som är
 * publik.
 */
function vardnamn(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "okänd endpoint";
  }
}

/**
 * Ett led i anropskedjan. Ingen leverantör är inbyggd någonstans i koden —
 * adress, nyckel och modellnamn kommer alla utifrån, så en leverantör kan
 * bytas ut genom att ändra variabler.
 */
export interface LlmLed {
  /** Vad ledet heter i loggar och fel, t.ex. "primär". Aldrig nyckeln. */
  namn: string;
  baseUrl: string;
  apiKey: string;
  /**
   * Ledets egna modell-ID:n, slagna på den model-sträng anropet skickar.
   * Leverantörerna har olika namnscheman (`leverantör/modell` mot rena
   * namn), och samma sträng till alla ger 4xx hos den som inte känner igen
   * den. Saknas en nyckel skickas strängen som den är.
   */
  modell?: Record<string, string>;
}

export class OpenRouterClient implements LlmClient {
  private led: LlmLed[];
  private timeoutMs: number;
  private maxRetries: number;
  private baseDelayMs: number;
  private minIntervalMs: number;
  private httpFetch: HttpFetch;
  private sleep: (ms: number) => Promise<void>;
  private now: () => number;
  private lastCallAt = 0;
  private nedkylningMs: number;
  private maxNedkylningMs: number;
  /**
   * Led som tagits ur spel, och till när (tidsstämpel i ms).
   *
   * Utan den här kartan betalar VARJE anrop om hela omförsöksstegen mot ett
   * led som redan sagt nej. Handlingsvågens kopia av den här filen har haft
   * kartan sedan länge; den här hade den inte, och skillnaden syntes i drift:
   * `pipeline`-körningen 31939465474 stod tre timmar i modellsteget mot en
   * strypt leverantör, och kostnadsomkörningen 31946300185 tog 12,5 minuter
   * för EN post — nästan allt av det var omförsök mot två led som redan
   * svarat 429.
   *
   * Nyckeln är ledet, inte adressen: primär och reserv får peka på samma
   * bas-URL med var sin nyckel — två konton hos samma leverantör, med var
   * sin kvot. Samma lärdom som valflask#1858, där den förväxlingen stängde
   * ute en påfylld reserv.
   */
  private urSpelTill = new Map<string, number>();
  /**
   * Löpnummer per nyckel, så att två led mot samma adress går att skilja åt
   * utan att nyckeln själv används som kartnyckel. Nycklar är hemligheter;
   * numret säger bara "konto 1" och "konto 2".
   */
  private kontonummer = new Map<string, number>();

  constructor(opts: {
    /**
     * Kedjan, i den ordning leden ska provas. Minst ett led. Ordningen
     * bestäms av den som bygger kedjan (`cli-run`), inte här — det är den
     * som läser variablerna och vet vilket led som ska ligga först.
     */
    led: LlmLed[];
    /** Per-anrops-timeout (ms). Default 90s. */
    timeoutMs?: number;
    /** Max antal extra försök per endpoint vid retrybara fel. Default 4. */
    maxRetries?: number;
    /** Bas för exponentiell backoff (ms). Default 2000. */
    baseDelayMs?: number;
    /** Proaktiv throttle: minsta tid mellan anrop (ms). Default 1200. */
    minIntervalMs?: number;
    /**
     * Hur länge ett led hålls ur spel efter att omförsöken tagit slut på ett
     * 429, när leverantören inte sagt något själv (ms). Default 60s.
     */
    nedkylningMs?: number;
    /**
     * Tak för hur länge ett led får hållas ur spel när leverantören SJÄLV
     * angett en tid i `Retry-After` (ms). Default 15 min.
     *
     * TVÅ SKILDA STORHETER, och att blanda ihop dem kostade en körning.
     * Omförsökens väntan kapas vid `timeoutMs` (90s) — ett enskilt försök ska
     * inte sova längre än ett anrop får ta. Avstängningen är något annat: den
     * ska överleva MELLAN anrop, annars betalar varje nytt anrop om hela
     * omförsöksstegen mot ett led som redan sagt nej.
     *
     * Första versionen kapade avstängningen vid `timeoutMs`. En kvotspärr som
     * sa «kom tillbaka om 4,4 dygn» tog då ledet ur spel i nittio sekunder,
     * och eftersom en post tog längre tid än så hade spärren alltid hunnit
     * lossna till nästa post. Kostnadsomkörningen 31949952846 betalade därför
     * 12,5 minuter per post, jämnt, i två timmar — mot 49 sekunder när
     * leverantören svarade normalt. Taket ska vara långt nog att en spärr
     * överlever mellan poster, kort nog att ett orimligt svarshuvud inte
     * dödar hela körningen.
     */
    maxNedkylningMs?: number;
    httpFetch?: HttpFetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  }) {
    if (opts.led.length === 0) throw new Error("Ingen LLM-endpoint konfigurerad.");
    this.led = opts.led;
    this.timeoutMs = opts.timeoutMs ?? 90_000;
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseDelayMs = opts.baseDelayMs ?? 2_000;
    this.minIntervalMs = opts.minIntervalMs ?? 2_500;
    this.nedkylningMs = opts.nedkylningMs ?? 60_000;
    this.maxNedkylningMs = opts.maxNedkylningMs ?? 15 * 60_000;
    this.httpFetch =
      opts.httpFetch ?? (globalThis.fetch.bind(globalThis) as HttpFetch);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => Date.now());
  }

  /**
   * Ledets identitet i spärrkartan: adress + modell + konto.
   *
   * Nyckeln själv går aldrig in i kartnyckeln — den byts mot ett löpnummer,
   * så att inget hemligt kan följa med ut i en felutskrift eller en dump.
   */
  private spärrnyckel(ep: { url: string; key: string; model: string }): string {
    let n = this.kontonummer.get(ep.key);
    if (n === undefined) {
      n = this.kontonummer.size + 1;
      this.kontonummer.set(ep.key, n);
    }
    return `${ep.url}\u0000${ep.model}\u0000konto${n}`;
  }

  private backoff(attempt: number): number {
    return (
      this.baseDelayMs * 2 ** attempt +
      Math.floor(Math.random() * this.baseDelayMs)
    );
  }

  /** Säkerställer minst minIntervalMs mellan anrop (proaktiv rate-limit-hänsyn). */
  private async throttle(): Promise<void> {
    const wait = this.minIntervalMs - (this.now() - this.lastCallAt);
    if (wait > 0) await this.sleep(wait);
    this.lastCallAt = this.now();
  }

  async complete(prompt: string, opts?: LlmOptions): Promise<string> {
    const primaryModel = opts?.model ?? "";
    const body: Record<string, unknown> = {
      model: primaryModel,
      messages: [
        ...(opts?.systemPrompt
          ? [{ role: "system" as const, content: opts.systemPrompt }]
          : []),
        { role: "user" as const, content: prompt },
      ],
      temperature: opts?.temperature ?? 0,
    };
    if (opts?.responseFormat) {
      body.response_format = opts.responseFormat;
    }

    // Modell per led: varje led bär sina egna namn. Saknas en nyckel skickas
    // strängen som den är — samma bakåtkompatibla beteende som förut.
    const endpoints = this.led.map((l) => ({
      namn: l.namn,
      url: `${l.baseUrl}/chat/completions`,
      key: l.apiKey,
      model: l.modell?.[primaryModel] ?? primaryModel,
    }));

    // Ett fel PER endpoint, inte ett gemensamt. Tidigare låg det en enda
    // `lastError` här som varje endpoint skrev över, och eftersom reserven
    // provas sist var det alltid RESERVENS fel som kastades. Primärens
    // orsak försvann spårlöst — i drift såg varje misslyckande ut att bero
    // på reservens kreditsaldo, oavsett vad som egentligen fällde primären.
    // Nu bär felet hela kedjan, i den ordning endpointerna provades.
    const felPerEndpoint: string[] = [];

    for (const ep of endpoints) {
      const nyckel = this.spärrnyckel(ep);
      const spärrTill = this.urSpelTill.get(nyckel) ?? 0;
      if (this.now() < spärrTill) {
        const kvar = spärrTill - this.now();
        felPerEndpoint.push(
          `${ep.namn} (${vardnamn(ep.url)}, ${ep.model}) → ur spel${
            Number.isFinite(kvar) ? ` ${Math.ceil(kvar / 1000)}s till` : ""
          } (hoppas över)`,
        );
        continue;
      }

      let lastError: Error | undefined;
      body.model = ep.model;
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        await this.throttle();
        try {
          const res = await this.httpFetch(ep.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${ep.key}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeoutMs),
          });

          // Retrybara serverfel / rate limit.
          if (res.status === 429 || res.status >= 500) {
            lastError = new Error(`HTTP ${res.status} (retrybar) från ${ep.url}`);
            if (attempt < this.maxRetries) {
              const ra = parseRetryAfterMs(
                res.headers.get("retry-after"),
                this.timeoutMs,
              );
              await this.sleep(ra ?? this.backoff(attempt));
              continue;
            }
            // Slut på försök: ta ledet ur spel, så att nästa anrop slipper
            // betala om hela stegen. Leverantörens egen Retry-After gäller om
            // den finns, kapad — annars nedkylningen.
            const ned =
              parseRetryAfterMs(
                res.headers.get("retry-after"),
                this.maxNedkylningMs,
              ) ?? this.nedkylningMs;
            this.urSpelTill.set(nyckel, this.now() + ned);
            lastError = new Error(
              `HTTP ${res.status} (kvot/överbelastning, ur spel ${Math.ceil(ned / 1000)}s)`,
            );
            break; // prova nästa led
          }

          if (!res.ok) {
            const text = await res.text();

            // En del modeller tillåter bara sitt eget default-temperature och
            // avvisar allt annat: "invalid temperature: only 1 is allowed for
            // this model". Vi skickar 0 för att svaren ska bli reproducerbara,
            // men hellre ett svar med modellens eget värde än inget svar alls.
            // Prova om utan parametern EN gång på samma endpoint — det kostar
            // ett anrop och räddas hela ledet.
            if (
              res.status === 400 &&
              /temperature/i.test(text) &&
              "temperature" in body &&
              !opts?.kravReproducerbart
            ) {
              delete body.temperature;
              console.warn(
                `LLM: ${vardnamn(ep.url)} (${ep.model}) avvisar temperature — ` +
                  `provar om utan den. Svaret blir modellens eget default, alltså ` +
                  `inte nödvändigtvis reproducerbart.`,
              );
              continue; // samma försöksnummer: det här är ingen retry på ett fel
            }

            // Ett reproducerbarhetskrav som möter en modell som inte tar
            // emot temperature är ingen teknikalitet utan ett modellval som
            // inte håller. Säg det, i stället för att svaret ska se ut som
            // vilket 400 som helst.
            if (res.status === 400 && /temperature/i.test(text) && opts?.kravReproducerbart) {
              lastError = new Error(
                `HTTP ${res.status}: modellen ${ep.model} tar inte emot temperature, och ` +
                  `anropet kräver ett reproducerbart svar. Inget omförsök görs — byt modell ` +
                  `för den rollen i stället. Svar: ${text.slice(0, 160)}`,
              );
              break;
            }

            // Övrigt icke-retrybart (401, 402 utan kredit, 404) → nästa endpoint.
            // En död nyckel eller slut kredit läker inte av sig självt under
            // körningen — ta ledet ur spel helt i stället för att fråga om
            // och om vid varje anrop.
            if (res.status === 401 || res.status === 402 || res.status === 403) {
              this.urSpelTill.set(nyckel, Number.POSITIVE_INFINITY);
            }
            lastError = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
            break;
          }

          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: unknown } }>;
          };
          const content = data?.choices?.[0]?.message?.content;
          if (typeof content !== "string") {
            throw new Error("Inget innehåll i LLM-svaret");
          }
          return content;
        } catch (e) {
          // Timeout / nätfel / parsefel → retrybart.
          lastError = e instanceof Error ? e : new Error(String(e));
          if (attempt < this.maxRetries) {
            await this.sleep(this.backoff(attempt));
            continue;
          }
          break;
        }
      }
      if (lastError) {
        felPerEndpoint.push(`${ep.namn} (${vardnamn(ep.url)}, ${ep.model}) → ${lastError.message}`);
      }
    }

    if (felPerEndpoint.length === 0) throw new Error("Ingen LLM-endpoint tillgänglig");
    throw new Error(felPerEndpoint.join("  |  "));
  }
}
