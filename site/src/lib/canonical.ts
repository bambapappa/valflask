import { createHash } from "node:crypto";

export function canonicalStringify(data: unknown): string {
  if (data === null || data === undefined) return "null";
  if (typeof data === "boolean") return data ? "true" : "false";
  if (typeof data === "number") return JSON.stringify(data);
  if (typeof data === "string") return JSON.stringify(data);
  if (Array.isArray(data)) {
    const items = data.map((v) => canonicalStringify(v));
    return `[${items.join(",")}]`;
  }
  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((k) => {
      const val = canonicalStringify(obj[k]);
      return `${JSON.stringify(k)}:${val}`;
    });
    return `{${pairs.join(",")}}`;
  }
  return "null";
}

export function computeDataHash(promises: unknown[]): string {
  const canonical = canonicalStringify(promises);
  return createHash("sha256").update(canonical).digest("hex");
}
