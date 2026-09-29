import "server-only";
import smokeConfig from "../../../config/m5/provider-live-smoke/coingecko-demo-first-call.json";
import type { M5ProviderSmokeAuthorizationRegistryEntry } from "./m5-provider-live-smoke-authorization";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const M5_PROVIDER_LIVE_SMOKE_AUTHORIZATION_CONFIG = deepFreeze(smokeConfig);
const registry: readonly M5ProviderSmokeAuthorizationRegistryEntry[] = Object.freeze([
  Object.freeze({ authorizationId: smokeConfig.authorization.authorizationId, fingerprint: smokeConfig.authorization.fingerprint }),
]);

/** The sole active server-only LOCAL_SMOKE trust anchor; never consumed by production readiness. */
export const M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY = registry;
