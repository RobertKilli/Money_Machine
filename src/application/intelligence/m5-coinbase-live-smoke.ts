import "server-only";
import { COINBASE_SMOKE_STATUS, checkCoinbaseSmokeAuthorization, planCoinbaseSmoke, smokeError, smokeFailureCode, smokeFreeze, smokeRecord } from "./m5-coinbase-smoke-contract";

/** Operational entrypoint. No caller-provided registry, credentials, transport or persistence wiring. */
export function executeCoinbaseSmoke(input: unknown) {
  const root = smokeRecord(input, ["authorization", "config", "environment", "evaluationAt", "signal"], ["authorization", "config", "environment", "evaluationAt"]);
  const plan = planCoinbaseSmoke(root.config);
  if (root.environment !== "LOCAL_SMOKE") return smokeError("ENVIRONMENT_INVALID");
  const pinned = checkCoinbaseSmokeAuthorization(root.authorization, root.evaluationAt);
  if (!pinned) return smokeFreeze({ status: "BLOCKED", code: "M5_COINBASE_SMOKE_AUTHORITY_NOT_PINNED", authorityStatus: COINBASE_SMOKE_STATUS, productionStatus: "BLOCKED_BACKEND_UNAPPROVED", requestCount: 0 });
  // Native module loading and all resources occur only after the private registry gate.
  return import("@/infrastructure/intelligence/m5-coinbase-node-smoke-transport")
    .then(async module => await module.executeCoinbaseNodeSmoke({ authorization: root.authorization, plan, environment: root.environment, evaluationAt: root.evaluationAt, signal: root.signal }))
    .catch(error => smokeError(smokeFailureCode(error) ?? "TRANSPORT_FAILED"));
}
