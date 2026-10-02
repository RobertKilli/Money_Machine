import "server-only";
import { COINBASE_SMOKE_AUTHORITY_REGISTRIES, COINBASE_SMOKE_STATUS, isRuntimeCoinbaseSmokeAuthorization, planCoinbaseSmoke, smokeError, smokeFreeze, smokeRecord, smokeTime } from "./m5-coinbase-smoke-contract";

/** Operational entrypoint. No caller-provided registry, credentials, transport or persistence wiring. */
export function executeCoinbaseSmoke(input: unknown) {
  const root = smokeRecord(input, ["authorization", "config", "environment", "evaluationAt"]);
  planCoinbaseSmoke(root.config);
  if (root.environment !== "LOCAL_SMOKE") return smokeError("ENVIRONMENT_INVALID");
  const evaluationAt = smokeTime(root.evaluationAt);
  if (!isRuntimeCoinbaseSmokeAuthorization(root.authorization)) return smokeError("AUTHORITY_NOT_RUNTIME_TRUSTED");
  const auth = root.authorization;
  if (evaluationAt < auth.effectiveFrom || evaluationAt < auth.reviewedAt || evaluationAt >= auth.expiresAt) return smokeError("AUTHORITY_EXPIRED");
  const pinned = COINBASE_SMOKE_AUTHORITY_REGISTRIES.LOCAL_SMOKE.find(entry => entry.authorizationId === auth.authorizationId && entry.fingerprint === auth.fingerprint);
  if (!pinned) return smokeFreeze({ status: "BLOCKED", code: "M5_COINBASE_SMOKE_AUTHORITY_NOT_PINNED", authorityStatus: COINBASE_SMOKE_STATUS, productionStatus: "BLOCKED_BACKEND_UNAPPROVED", requestCount: 0 });
  // No executable authority or live adapter is installed, even if a later edit adds an entry.
  return smokeFreeze({ status: "BLOCKED", code: "M5_COINBASE_SMOKE_OPERATIONAL_ADAPTER_NOT_APPROVED", authorityStatus: COINBASE_SMOKE_STATUS, productionStatus: "BLOCKED_BACKEND_UNAPPROVED", requestCount: 0 });
}
