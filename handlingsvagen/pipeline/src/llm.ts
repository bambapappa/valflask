/**
 * LLM-klient — kopierad ur valflask pipeline/src/llm.ts (håll i synk;
 * vid HV5-flytten återanvänds valflasks original). Timeout, retry med
 * backoff, throttle och primär→fallback-endpoint med modell per endpoint.
 */

export interface LlmOptions {
  systemPrompt?: string;
  temperature?: number;
  /** Tak på svarets längd. Utan tak reserverar leverantören modellens maximum. */
  maxTokens?: number;
  responseFormat?: { type: "json_object" };
  model?: string;
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

export class OpenRouterClient implements LlmClient {
  private apiKey: string;
  private baseUrl: string;
  private fallbackBaseUrl: string | undefined;
  private fallbackApiKey: string | undefined;
  private fallbackModelMap: Record<string, string>;
  private timeoutMs: number;
  private maxRetries: number;
  private baseDelayMs: number;
  private maxBackoffMs: number;
  private nedkylningMs: number;
  private maxNedkylningMs: number;
  private minIntervalMs: number;
  private httpFetch: HttpFetch;
  private sleep: (ms: number) => Promise<void>;
  private now: () => number;
  private onReservSvarade: (skal: string) => void;
  /** Sant när reservläget redan rapporterats — varningen ska komma en gång. */
  private reservRapporterad = false;
  private lastCallAt = 0;
  /**
   * Endpoints som tagits ur spel, och till när (tidsstämpel i ms).
   * En död nyckel eller slut kredit (401/402/403) gäller resten av
   * processen; en kvotspärr (429) till dess leverantören sagt att den
   * lossnar. Poängen: kostnaden betalas EN gång, inte per par — annars
   * betalar varje efterföljande par om hela omförsöksstegen i onödan.
   *
   * NYCKELN ÄR LEDET, INTE ADRESSEN. Primär och reserv får peka på samma
   * bas-URL med var sin nyckel — två konton hos samma leverantör, med var
   * sin kvot. Kartan var förut nycklad på adressen, och då räckte det att
   * primären slog i sin kvot för att reserven skulle hoppas över utan ett
   * enda anrop: `foreslag`-körningen 2026-08-16 föll så, med en påfylld
   * reserv som aldrig fick frågan. Adress + modell + konto skiljer dem åt.
   */
  private urSpelTill = new Map<string, number>();
  /**
   * Löpnummer per nyckel, så att två led mot SAMMA adress ändå går att
   * skilja åt i spärrkartan utan att nyckeln själv används som kartnyckel.
   * Nycklar är hemligheter; de ska inte kunna läcka ur en felutskrift eller
   * en dump. Numret säger bara "konto 1" och "konto 2".
   */
  private kontonummer = new Map<string, number>();

  constructor(opts: {
    apiKey: string;
    baseUrl?: string;
    fallbackBaseUrl?: string;
    fallbackApiKey?: string;
    /**
     * Översätter primärmodell-ID (OpenRouters leverantör/modell-slug) till
     * fallback-endpointens eget modell-ID (t.ex. OpenCode Zens namn). Samma
     * model-sträng skickas annars till båda endpoints, vilket gör att den ena
     * inte känner igen den → 4xx. Saknas en nyckel används primär-strängen.
     */
    fallbackModelMap?: Record<string, string>;
    /** Per-anrops-timeout (ms). Default 90s. */
    timeoutMs?: number;
    /** Max antal extra försök per endpoint vid retrybara fel. Default 4. */
    maxRetries?: number;
    /** Bas för exponentiell backoff (ms). Default 2000. */
    baseDelayMs?: number;
    /**
     * Tak för hur länge ETT omförsök får sova (ms). Default 20s. En
     * leverantör som slagit i kvoten svarar 429 med ett långt Retry-After
     * ("kom igen om en timme"); utan eget tak sover klienten den tiden per
     * försök och varje par kostar minuter i stället för sekunder. Väntan
     * hör hemma i nedkylningen nedan, inte i omförsöken.
     */
    maxBackoffMs?: number;
    /**
     * Nedkylning när en endpoint sagt 429 och omförsöken tagit slut, om
     * leverantören inte angett Retry-After (ms). Default 60s.
     */
    nedkylningMs?: number;
    /**
     * Tak för hur länge ett led får hållas ur spel när leverantören SJÄLV
     * angett en tid i `Retry-After` (ms). Default 15 min.
     *
     * Den här filen hade inget tak alls: `Retry-After` lästes med
     * Number.MAX_SAFE_INTEGER som gräns, så ett svar om «4,4 dygn» tog ledet
     * ur spel i 4,4 dygn — resten av körningen, oavsett om spärren i själva
     * verket lossnat. Valflasks kopia hade motsatt fel och kapade vid
     * anropstimeouten, 90 sekunder, vilket gjorde avstängningen verkningslös.
     * Ingen av ytterligheterna är rätt: taket ska överleva mellan anrop utan
     * att kunna döda en körning.
     */
    maxNedkylningMs?: number;
    /** Proaktiv throttle: minsta tid mellan anrop (ms). Default 1200. */
    minIntervalMs?: number;
    /**
     * Ropas EN gång per körning första gången reserven svarar i primärens
     * ställe, med primärens fel som skäl. Utan den är ett tyst
     * reservläge osynligt: en död primär ser precis ut som en frisk
     * körning ända till reserven också tar slut. Default: skriv till
     * console.error.
     */
    onReservSvarade?: (skal: string) => void;
    httpFetch?: HttpFetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://openrouter.ai/api/v1";
    this.fallbackBaseUrl = opts.fallbackBaseUrl;
    this.fallbackApiKey = opts.fallbackApiKey;
    this.fallbackModelMap = opts.fallbackModelMap ?? {};
    this.timeoutMs = opts.timeoutMs ?? 90_000;
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseDelayMs = opts.baseDelayMs ?? 2_000;
    this.maxBackoffMs = opts.maxBackoffMs ?? 20_000;
    this.nedkylningMs = opts.nedkylningMs ?? 60_000;
    this.maxNedkylningMs = opts.maxNedkylningMs ?? 15 * 60_000;
    this.minIntervalMs = opts.minIntervalMs ?? 2_500;
    this.httpFetch =
      opts.httpFetch ?? (globalThis.fetch.bind(globalThis) as HttpFetch);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => Date.now());
    this.onReservSvarade =
      opts.onReservSvarade ??
      ((skal) =>
        console.error(
          `OBS: reserven svarar i primärens ställe — primären föll: ${skal}`,
        ));
  }

  /**
   * Ledets identitet i spärrkartan: adress + modell + konto.
   *
   * Två led mot samma adress med var sin nyckel är två konton med var sin
   * kvot, och en spärr på det ena får inte stänga det andra. Nyckeln själv
   * går aldrig in i kartnyckeln — den byts mot ett löpnummer, så att inget
   * hemligt kan följa med ut i en felutskrift.
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
      // TAK PÅ SVARET. Sattes aldrig förut, och då fyller leverantören i
      // modellens maximum — 65 536 tokens hos den fallback vi använder.
      // OpenRouter RESERVERAR kredit mot det talet, inte mot vad svaret
      // faktiskt blir, och avvisade därför anrop med "you requested up to
      // 65536 tokens, but can only afford 18283" trots att svaret är ett
      // litet JSON-objekt på några hundra tokens. Mätt 2026-08-20, samma dag
      // förslagskörningen fallit tre dygn i rad på kredit.
      //
      // Taket är generöst mot alla våra svar: extraktionen ger högst fem
      // löften med citat på 40 ord, kopplingen ett objekt, kostnaden en
      // uträkning på 800 tecken. Slår ett svar ändå i taket blir JSON:en
      // trunkerad och paret räknas som fallet — det prövas om nästa körning,
      // precis som vid vilket annat fel som helst.
      max_tokens: opts?.maxTokens ?? Number(process.env["LLM_MAX_TOKENS"] ?? "4096"),
    };
    if (opts?.responseFormat) {
      body.response_format = opts.responseFormat;
    }

    // Modell per endpoint: primären får model-strängen som den är; fallbacken
    // översätts via fallbackModelMap (saknas nyckel → primär-strängen).
    // Namnet står med i varje felrad. Utan det är två led mot samma adress
    // omöjliga att skilja åt i loggen — felet läses då som att en och samma
    // endpoint svarat två gånger, i stället för att reserven hoppats över.
    const endpoints: Array<{ namn: string; url: string; key: string; model: string }> = [
      {
        namn: "primär",
        url: `${this.baseUrl}/chat/completions`,
        key: this.apiKey,
        model: primaryModel,
      },
    ];
    if (this.fallbackBaseUrl && this.fallbackApiKey) {
      endpoints.push({
        namn: "reserv",
        url: `${this.fallbackBaseUrl}/chat/completions`,
        key: this.fallbackApiKey,
        model: this.fallbackModelMap[primaryModel] ?? primaryModel,
      });
    }

    // Ett fel PER endpoint, inte bara det sista: annars maskerar
    // reservvägens svar primärvägens, och loggen säger "402 slut kredit"
    // när felet i själva verket var att primären slagit i kvoten.
    const fel: string[] = [];

    for (const [lednummer, ep] of endpoints.entries()) {
      const nyckel = this.spärrnyckel(ep);
      const spärrTill = this.urSpelTill.get(nyckel) ?? 0;
      if (this.now() < spärrTill) {
        const kvar = spärrTill - this.now();
        fel.push(
          `${ep.namn} ${ep.url}: ur spel${
            Number.isFinite(kvar) ? ` ${Math.ceil(kvar / 1000)}s till` : ""
          } (hoppas över)`,
        );
        continue;
      }

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
            const ra = parseRetryAfterMs(
              res.headers.get("retry-after"),
              Number.MAX_SAFE_INTEGER,
            );
            if (attempt < this.maxRetries) {
              // Sov kort även när leverantören ber om lång väntan — den
              // långa väntan hanteras av nedkylningen, inte här.
              await this.sleep(
                Math.min(ra ?? this.backoff(attempt), this.maxBackoffMs),
              );
              continue;
            }
            // Slut på försök: ta endpointen ur spel tills spärren lossnar,
            // så nästa par slipper betala om hela stegen.
            const ned = Math.min(ra ?? this.nedkylningMs, this.maxNedkylningMs);
            this.urSpelTill.set(nyckel, this.now() + ned);
            fel.push(
              `${ep.namn} ${ep.url}: HTTP ${res.status} (kvot/överbelastning, ur spel ${Math.ceil(ned / 1000)}s)`,
            );
            break;
          }

          // Icke-retrybart (t.ex. 401/402 utan kredit, 400, 404) → nästa endpoint direkt.
          if (!res.ok) {
            const kropp = (await res.text()).slice(0, 200);
            // Nyckel-/kreditfel läker inte av sig självt under körningen —
            // ta endpointen ur spel helt i stället för att fråga om och om.
            if (res.status === 401 || res.status === 402 || res.status === 403) {
              this.urSpelTill.set(nyckel, Number.POSITIVE_INFINITY);
              fel.push(
                `${ep.namn} ${ep.url}: HTTP ${res.status} (nyckel/kredit, ur spel) ${kropp}`,
              );
            } else {
              fel.push(`${ep.namn} ${ep.url}: HTTP ${res.status}: ${kropp}`);
            }
            break;
          }

          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: unknown } }>;
          };
          const content = data?.choices?.[0]?.message?.content;
          if (typeof content !== "string") {
            throw new Error("Inget innehåll i LLM-svaret");
          }
          // Svarade någon annan än primären? Då är primären nere, och det
          // syns annars ingenstans: körningen ser frisk ut ända till
          // reserven också tar slut. Rapportera en gång, med skälet.
          // Ledets ordning avgör, inte adressen: pekar reserven på samma
          // bas-URL som primären skulle en jämförelse på adress göra ett
          // reservsvar osynligt.
          if (lednummer > 0 && !this.reservRapporterad) {
            this.reservRapporterad = true;
            this.onReservSvarade(
              fel.length > 0 ? fel.join(" | ") : "okänt skäl",
            );
          }
          return content;
        } catch (e) {
          // Timeout / nätfel / parsefel → retrybart.
          const msg = e instanceof Error ? e.message : String(e);
          if (attempt < this.maxRetries) {
            await this.sleep(this.backoff(attempt));
            continue;
          }
          fel.push(`${ep.namn} ${ep.url}: ${msg}`);
          break;
        }
      }
    }

    throw new Error(
      fel.length > 0
        ? `alla endpoints föll — ${fel.join(" | ")}`
        : "Ingen LLM-endpoint tillgänglig",
    );
  }
}
