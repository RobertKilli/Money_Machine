const allowedQueryKeys = new Set(["category", "event", "candidateId", "correlationId"]);

export function safeNotificationPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 300 || /[\\\u0000-\u001f]/.test(value) || !value.startsWith("/") || value.startsWith("//")) return null;
  try {
    const parsed = new URL(value, "https://money-machine.invalid");
    if (parsed.origin !== "https://money-machine.invalid" || parsed.pathname !== "/admin/activity") return null;
    for (const [key, item] of parsed.searchParams) if (!allowedQueryKeys.has(key) || item.length > 100) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch { return null; }
}
