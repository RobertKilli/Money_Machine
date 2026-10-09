/** Target checks for the opt-in hosted PAPER worker. Credentials never enter
 * this module as logged or serialized values; callers provide process env. */
export function parseNokAmountMinor(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(value)) throw new Error("PAPER_WORKER_CAPITAL_FORMAT_INVALID");
  const [whole, fraction = ""] = value.split(".");
  const minor = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (minor <= 0n) throw new Error("PAPER_WORKER_CAPITAL_MUST_BE_POSITIVE");
  return minor;
}

export function assertSupabaseProjectBinding(connectionString: string, projectId: string): void {
  if (!/^[a-z0-9]{20}$/.test(projectId)) throw new Error("PAPER_WORKER_PROJECT_ID_INVALID");
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error("PAPER_WORKER_DATABASE_URL_INVALID"); }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("PAPER_WORKER_DATABASE_URL_INVALID");
  if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("PAPER_WORKER_HOSTED_ENTRYPOINT_REFUSES_LOCAL_DATABASE");
  const directHost = `db.${projectId}.supabase.co`;
  const decodedUser = (() => { try { return decodeURIComponent(url.username); } catch { return ""; } })();
  const poolerHost = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname);
  const directBound = url.hostname === directHost;
  const poolerBound = poolerHost && decodedUser === `postgres.${projectId}`;
  if (!directBound && !poolerBound) throw new Error("PAPER_WORKER_PROJECT_BINDING_MISMATCH");
}

/** Existing local worker entrypoint uses this independent loopback boundary. */
export function assertLoopbackWorkerDatabase(connectionString: string): void {
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error("PAPER_WORKER_DATABASE_URL_INVALID"); }
  if (!(["postgres:", "postgresql:"].includes(url.protocol)) || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("PAPER_WORKER_REFUSES_NON_LOCAL_DATABASE");
  }
}

export function parseBoundedWorkerOptions(input: { readonly maxRounds: string; readonly roundIntervalMs: string }): { readonly maxRounds: number; readonly roundIntervalMs: number } {
  if (!/^[1-3]$/.test(input.maxRounds)) throw new Error("PAPER_WORKER_MAX_ROUNDS_INVALID");
  if (!/^\d+$/.test(input.roundIntervalMs)) throw new Error("PAPER_WORKER_ROUND_INTERVAL_INVALID");
  const roundIntervalMs = Number(input.roundIntervalMs);
  if (!Number.isSafeInteger(roundIntervalMs) || roundIntervalMs < 1_000 || roundIntervalMs > 86_400_000) throw new Error("PAPER_WORKER_ROUND_INTERVAL_INVALID");
  return { maxRounds: Number(input.maxRounds), roundIntervalMs };
}
