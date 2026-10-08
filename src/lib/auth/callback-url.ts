type Environment = Record<string, string | undefined>;
type HeaderReader = { get(name: string): string | null };

const safeLoginErrorCodes = new Set([
  "invalid-email",
  "auth-not-configured",
  "sign-in-unavailable",
  "oauth-callback",
]);

function normalizeOrigin(value: string | undefined, allowHostOnly = false): string | null {
  if (!value) return null;

  let candidate = value.trim();
  if (!candidate) return null;
  if (allowHostOnly && !candidate.includes("://")) candidate = `https://${candidate}`;

  try {
    const url = new URL(candidate);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (!url.hostname || (url.port && !isLocalhost)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Returns the trusted origin used for both OAuth and email callbacks.
 * Request Host headers are intentionally not consulted.
 */
export function getAuthApplicationOrigin(environment: Environment = process.env): string | null {
  if (environment.NEXT_PUBLIC_SITE_URL?.trim()) return normalizeOrigin(environment.NEXT_PUBLIC_SITE_URL);

  const deploymentEnvironment = environment.VERCEL_ENV ?? environment.VERCEL_TARGET_ENV;
  if (deploymentEnvironment === "preview") {
    const previewOrigin = normalizeOrigin(environment.VERCEL_URL, true);
    if (previewOrigin) return previewOrigin;
  }

  if (deploymentEnvironment === "production") {
    const productionOrigin = normalizeOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL, true);
    if (productionOrigin) return productionOrigin;
  }

  if (environment.NODE_ENV === "development") return "http://localhost:3000";
  return null;
}

export function getAuthCallbackUrl(environment: Environment = process.env): string | null {
  const origin = getAuthApplicationOrigin(environment);
  return origin ? new URL("/auth/callback", origin).toString() : null;
}

/** Only compares inbound host/proxy headers; none of them are used as a destination. */
export function requestMatchesAuthOrigin(headers: HeaderReader, trustedOrigin: string): boolean {
  let expected: URL;
  try {
    expected = new URL(trustedOrigin);
  } catch {
    return false;
  }

  const host = headers.get("host")?.trim().toLowerCase();
  if (!host || host.includes(",") || host !== expected.host.toLowerCase()) return false;

  const forwardedHost = headers.get("x-forwarded-host")?.trim().toLowerCase();
  if (forwardedHost && (forwardedHost.includes(",") || forwardedHost !== expected.host.toLowerCase())) return false;

  const forwardedProto = headers.get("x-forwarded-proto")?.trim().toLowerCase();
  const localHttp = expected.protocol === "http:" && (expected.hostname === "localhost" || expected.hostname === "127.0.0.1");
  if (forwardedProto) return forwardedProto === expected.protocol.slice(0, -1);
  return localHttp;
}

export function canonicalLoginUrl(
  origin: string,
  params: { error?: string | string[]; sent?: string | string[] },
): string {
  const query = new URLSearchParams();
  if (params.sent === "1") query.set("sent", "1");
  else if (typeof params.error === "string") {
    query.set("error", safeLoginErrorCodes.has(params.error) ? params.error : "sign-in-unavailable");
  }
  const url = new URL("/login", origin);
  url.search = query.toString();
  return url.toString();
}

export function safePostAuthPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return "/dashboard";
  }

  try {
    const resolved = new URL(value, "https://money-machine.invalid");
    if (resolved.origin !== "https://money-machine.invalid") return "/dashboard";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/dashboard";
  }
}
