export interface LlmOptions {
  systemPrompt?: string;
  temperature?: number;
  responseFormat?: { type: "json_object" };
  model?: string;
}

export interface LlmClient {
  complete(prompt: string, opts?: LlmOptions): Promise<string>;
}

export class OpenRouterClient implements LlmClient {
  private apiKey: string;
  private baseUrl: string;
  private fallbackBaseUrl: string | undefined;
  private fallbackApiKey: string | undefined;

  constructor(opts: {
    apiKey: string;
    baseUrl?: string;
    fallbackBaseUrl?: string;
    fallbackApiKey?: string;
  }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://openrouter.ai/api/v1";
    this.fallbackBaseUrl = opts.fallbackBaseUrl;
    this.fallbackApiKey = opts.fallbackApiKey;
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
      {
        url: `${this.baseUrl}/chat/completions`,
        key: this.apiKey,
      },
    ];
    if (this.fallbackBaseUrl && this.fallbackApiKey) {
      endpoints.push({
        url: `${this.fallbackBaseUrl}/chat/completions`,
        key: this.fallbackApiKey,
      });
    }

    let lastError: Error | undefined;
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ep.key}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }
        const data = (await res.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        const content = data.choices[0]?.message?.content;
        if (typeof content !== "string") {
          throw new Error("No content in LLM response");
        }
        return content;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    throw lastError ?? new Error("No LLM endpoint available");
  }
}
