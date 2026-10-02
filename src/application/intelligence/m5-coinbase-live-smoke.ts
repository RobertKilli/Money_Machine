import "server-only";
import { COINBASE_SMOKE_STATUS, checkCoinbaseSmokeAuthorization, planCoinbaseSmoke, smokeError, smokeFreeze, smokeRecord } from "./m5-coinbase-smoke-contract";

/** Operational entrypoint. No caller-provided registry, credentials, transport or persistence wiring. */
export function executeCoinbaseSmoke(input: unknown) {
  const root = smokeRecord(input, ["authorization", "config", "environment", "evaluationAt"]);
  planCoinbaseSmoke(root.config);
  if (root.environment !== "LOCAL_SMOKE") return smokeError("ENVIRONMENT_INVALID");
  const pinned = checkCoinbaseSmokeAuthorization(root.authorization, root.evaluationAt);
  if (!pinned) return smokeFreeze({ status: "BLOCKED", code: "M5_COINBASE_SMOKE_AUTHORITY_NOT_PINNED", authorityStatus: COINBASE_SMOKE_STATUS, productionStatus: "BLOCKED_BACKEND_UNAPPROVED", requestCount: 0 });
  // No executable authority or live adapter is installed, even if a later edit adds an entry.
  return smokeFreeze({ status: "BLOCKED", code: "M5_COINBASE_SMOKE_OPERATIONAL_ADAPTER_NOT_APPROVED", authorityStatus: COINBASE_SMOKE_STATUS, productionStatus: "BLOCKED_BACKEND_UNAPPROVED", requestCount: 0 });
}
