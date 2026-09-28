/** Läs hela en etiketterad issue-historik, även efter sida 20. */
export async function hamtaIssueSidor<T>(
  repo: string,
  label: string,
  state: "all" | "open",
  api: (path: string) => Promise<unknown>,
): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; ; page++) {
    const path = `/repos/${repo}/issues?labels=${encodeURIComponent(label)}&state=${state}&per_page=100&page=${page}`;
    const batch = await api(path);
    if (!Array.isArray(batch)) throw new Error(`GitHub svarade inte med en issue-lista på sida ${page}`);
    result.push(...(batch as T[]));
    if (batch.length < 100) return result;
  }
}
