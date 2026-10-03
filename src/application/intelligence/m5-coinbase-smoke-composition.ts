import "server-only";
import { executeCoinbaseSmoke } from "./m5-coinbase-live-smoke";
import { COINBASE_SMOKE_AUTHORITY_REGISTRIES, COINBASE_SMOKE_STATUS, planCoinbaseSmoke, smokeError, smokeFreeze, smokeRecord } from "./m5-coinbase-smoke-contract";

/** Pure composition factory: no resolver, agent, lease, socket, environment or credential lookup. */
export function createCoinbaseSmokeExecutor() {
  return Object.freeze({
    execute: executeCoinbaseSmoke,
    executeReference(input: unknown) {
      const row = smokeRecord(input, ["config", "environment", "authorizationReference"]);
      planCoinbaseSmoke(row.config);
      if (row.environment !== "LOCAL_SMOKE") return smokeError("ENVIRONMENT_INVALID");
      if (typeof row.authorizationReference !== "string" || !/^review:[a-zA-Z0-9_-]{1,80}$/.test(row.authorizationReference) || /secret|token|password|credential|https?|api[_-]?key|bearer/i.test(row.authorizationReference)) return smokeError("REFERENCE_INVALID");
      // A CLI reference is never an authority. No file, fallback authority or registry entry exists.
      if (COINBASE_SMOKE_AUTHORITY_REGISTRIES.LOCAL_SMOKE.length === 0) return smokeFreeze({ status: "BLOCKED", code: "M5_COINBASE_SMOKE_AUTHORITY_NOT_PINNED", authorityStatus: COINBASE_SMOKE_STATUS, productionStatus: "BLOCKED_BACKEND_UNAPPROVED", requestCount: 0 });
      return smokeError("AUTHORITY_REFERENCE_UNRESOLVED");
    },
  });
}
