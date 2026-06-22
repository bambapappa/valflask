export interface LlmOptions {
  systemPrompt?: string;
  temperature?: number;
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
  private timeoutMs: number;
  private maxRetries: number;
  private baseDelayMs: number;
  private minIntervalMs: number;
  private httpFetch: HttpFetch;
  private sleep: (ms: number) => Promise<void>;
  private now: () => number;
  private lastCallAt = 0;

  constructor(opts: {
    apiKey: string;
    baseUrl?: string;
    fallbackBaseUrl?: string;
    fallbackApiKey?: string;
    /** Per-anrops-timeout (ms). Default 90s. */
    timeoutMs?: number;
    /** Max antal extra försök per endpoint vid retrybara fel. Default 4. */
    maxRetries?: number;
    /** Bas för exponentiell backoff (ms). Default 2000. */
    baseDelayMs?: number;
    /** Proaktiv throttle: minsta tid mellan anrop (ms). Default 1200. */
    minIntervalMs?: number;
    httpFetch?: HttpFetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://openrouter.ai/api/v1";
    this.fallbackBaseUrl = opts.fallbackBaseUrl;
    this.fallbackApiKey = opts.fallbackApiKey;
    this.timeoutMs = opts.timeoutMs ?? 90_000;
    this.maxRetries = opts.maxRetries ?? 4;
    this.baseDelayMs = opts.baseDelayMs ?? 2_000;
    this.minIntervalMs = opts.minIntervalMs ?? 1_200;
    this.httpFetch =
      opts.httpFetch ?? (globalThis.fetch.bind(globalThis) as HttpFetch);
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? (() => Date.now());
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
    const body: Record<string, unknown> = {
      model: opts?.model ?? "",
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

    const endpoints: Array<{ url: string; key: string }> = [
      { url: `${this.baseUrl}/chat/completions`, key: this.apiKey },
    ];
    if (this.fallbackBaseUrl && this.fallbackApiKey) {
      endpoints.push({
        url: `${this.fallbackBaseUrl}/chat/completions`,
        key: this.fallbackApiKey,
      });
    }

    let lastError: Error | undefined;

    for (const ep of endpoints) {
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
            break; // slut på försök på denna endpoint → prova nästa
          }

          // Icke-retrybart (t.ex. 401/402 utan kredit, 400, 404) → nästa endpoint direkt.
          if (!res.ok) {
            lastError = new Error(
              `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
            );
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
    }

    throw lastError ?? new Error("Ingen LLM-endpoint tillgänglig");
  }
}
