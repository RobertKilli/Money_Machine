type Environment = Record<string, string | undefined>;

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
