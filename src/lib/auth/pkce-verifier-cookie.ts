export type CookieValue = { name: string; value: string };

function isVerifierCookieName(name: string, storageKey: string): boolean {
  const escaped = storageKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const verifierSuffix = "-code-verifier";
  const chunkSuffix = "(?:\\.\\d+)?";
  const fixedVerifier = new RegExp(`^${escaped}${verifierSuffix}${chunkSuffix}$`);
  const flowVerifier = new RegExp(`^${escaped}-flow-[A-Za-z0-9_-]{8,64}${verifierSuffix}${chunkSuffix}$`);
  return fixedVerifier.test(name) || flowVerifier.test(name);
}

/** Checks only cookie names and non-emptiness; callers must never log cookie material. */
export function hasExpectedPkceVerifierCookie(
  cookies: readonly CookieValue[],
  supabaseUrl: string,
): boolean {
  let projectRef: string;
  try {
    projectRef = new URL(supabaseUrl).hostname.split(".")[0] ?? "";
  } catch {
    return false;
  }
  if (!/^[a-z0-9-]+$/i.test(projectRef)) return false;

  const storageKey = `sb-${projectRef}-auth-token`;
  return cookies.some(
    ({ name, value }) => isVerifierCookieName(name, storageKey) && value.length > 0,
  );
}
