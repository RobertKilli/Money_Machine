import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { createM5ProviderSmokeAuthorization, isTrustedM5ProviderSmokeAuthorization, M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY, parseM5ProviderSmokeAuthorization, resolveTrustedM5ProviderSmokeAuthorization } from "@/application/intelligence/m5-provider-live-smoke-authorization";
import { executeM5ProviderLiveSmoke, parseM5ProviderSmokeConfig, previewM5ProviderLiveSmoke } from "@/application/intelligence/m5-provider-live-smoke";
import { buildManualIngestionToLineagePlan } from "@/application/intelligence/manual-ingestion-to-lineage";
import { assertM5ProviderReadinessForExecution } from "@/application/intelligence/evaluate-m5-provider-readiness";
import { isTrustedM5ProviderReadinessAggregate } from "@/application/intelligence/evaluate-m5-provider-readiness-aggregate";
import { isTrustedM5ProviderReadinessEvaluation, type ProviderReadinessEvaluation } from "@/domain/intelligence/m5-provider-readiness";
import type { M5ProviderCredentialPort, M5ProviderHttpTransport, M5ProviderHttpTransportResponse, M5ProviderRateLimitLease } from "@/application/intelligence/m5-provider-execution-boundary";
import { isM5ProviderSmokeAuthorizationPath, m5ProviderSmokeSupport, parseM5ProviderSmokeArgs } from "../../scripts/m5-provider-smoke";

const asOf = "2026-09-26T10:00:00.000Z";
const later = "2026-09-26T10:01:00.000Z";
const address = "0x1111111111111111111111111111111111111111";
function auth(overrides: Partial<Parameters<typeof createM5ProviderSmokeAuthorization>[0]> = {}) {
  const common = {
    environment: "LOCAL_SMOKE" as const,
    providerId: "coingecko" as const,
    chainId: "ethereum" as const,
    assetId: address,
    datasetId: "coingecko-market-chart",
    datasetVersion: "coingecko-market-chart/range-v1",
    endpointProfile: "COINGECKO_ETHEREUM_CONTRACT_MARKET_CHART_RANGE_DEMO" as const,
    capabilities: ["DAILY_CLOSE_SERIES", "MARKET_CAP", "VOLUME_24H"],
    usages: ["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING"] as const,
    forbiddenUsages: ["RAW_PAYLOAD_STORAGE", "NORMALIZED_STORAGE", "AUTHORITY_PERSISTENCE", "REDISTRIBUTION", "COMMERCIAL_USE"] as const,
    retention: "PROCESS_MEMORY_ONLY" as const,
    effectiveFrom: "2026-09-26T09:00:00.000Z",
    reviewedAt: "2026-09-26T09:30:00.000Z",
    expiresAt: "2026-09-26T11:00:00.000Z",
    maximumRequests: 1,
    maximumPages: 1,
    maximumResponseBytes: 16_384,
    operatorReference: "operator:review-77",
    reviewReference: "review:M5-smoke-77",
    recordedAt: "2026-09-26T09:30:00.000Z",
    ...overrides,
  };
  return createM5ProviderSmokeAuthorization(common);
}
function config(providerId: "coingecko" | "etherscan" = "coingecko") {
  return providerId === "coingecko"
    ? { schemaVersion: "m5-provider-live-smoke-config/v1", providerId, contractAddress: address, coinId: "ethereum", from: "2026-09-25T00:00:00.000Z", to: "2026-09-26T00:00:00.000Z" }
    : { schemaVersion: "m5-provider-live-smoke-config/v1", providerId, contractAddress: address };
}
function deps(overrides: Partial<Parameters<typeof executeM5ProviderLiveSmoke>[0]> = {}) {
  const authorization = auth();
  const events: string[] = [];
  const credentialReferences: string[] = [];
  const requestHosts: string[] = [];
  const credentials: M5ProviderCredentialPort = { resolve: vi.fn(async reference => { events.push("credential"); credentialReferences.push(reference.reference); return { kind: "API_KEY" as const, value: "canary-secret-smoke-77" }; }) };
  const rateLimit: M5ProviderRateLimitLease = { acquire: vi.fn(async () => { events.push("lease"); return true; }) };
  const transport: M5ProviderHttpTransport = { send: vi.fn(async request => {
    events.push("http");
    requestHosts.push(request.request.hostname);
    return { status: 200, headers: { "content-type": "application/json" }, body: Buffer.from('{"prices":[[1790294400000,1.250000]],"market_caps":[[1790294400000,100]],"total_volumes":[[1790294400000,20]]}'), retrievedAt: asOf } satisfies M5ProviderHttpTransportResponse;
  }) };
  return { authorization, events, credentialReferences, requestHosts, credentials, rateLimit, transport, input: {
    config: config(), authorization, providerId: "coingecko", environment: "LOCAL_SMOKE", asOf,
    currentTime: () => asOf, trustedRegistry: [{ authorizationId: authorization.authorizationId, fingerprint: authorization.fingerprint }],
    credentials, rateLimit, transport, ...overrides,
  } };
}

describe("M5 provider live smoke authorization", () => {
  it("uses deterministic material identity and excludes recordedAt", () => {
    const first = auth();
    const second = auth({ recordedAt: later });
    expect(first.authorizationId).toBe(second.authorizationId);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.capabilities)).toBe(true);
    expect(first.forbiddenUsages).toContain("RAW_PAYLOAD_STORAGE");
    expect(first.retention).toBe("PROCESS_MEMORY_ONLY");
  });

  it("rejects unknown, symbol, accessor, inherited, and altered prototype fields", () => {
    const valid = auth();
    expect(() => parseM5ProviderSmokeAuthorization({ ...valid, extra: true })).toThrow();
    expect(() => parseM5ProviderSmokeAuthorization({ ...valid, chainId: "polygon" })).toThrow("M5_PROVIDER_SMOKE_AUTHORIZATION_SCOPE_INVALID");
    expect(() => parseM5ProviderSmokeAuthorization({ ...valid, reviewedAt: "2026-09-26T09:20:00.000Z" })).toThrow("M5_PROVIDER_SMOKE_AUTHORIZATION_FINGERPRINT_INVALID");
    expect(() => parseM5ProviderSmokeAuthorization({ ...valid, capabilities: ["CONTRACT_VERIFICATION"] })).toThrow("M5_PROVIDER_SMOKE_AUTHORIZATION_CAPABILITY_INVALID");
    expect(() => parseM5ProviderSmokeAuthorization(Object.assign(Object.create({ inherited: true }), valid))).toThrow();
    expect(() => parseM5ProviderSmokeAuthorization(Object.assign({ ...valid }, { [Symbol("hidden")]: 1 }))).toThrow();
    const accessor = { ...valid } as Record<string, unknown>;
    Object.defineProperty(accessor, "operatorReference", { enumerable: true, get: () => "operator:review-77" });
    expect(() => parseM5ProviderSmokeAuthorization(accessor)).toThrow();
    expect(() => parseM5ProviderSmokeAuthorization(Object.assign(Object.create(null), valid))).not.toThrow();
  });

  it("enforces effective and expiry boundaries and runtime trust is lost on copy/serialization", () => {
    const value = auth();
    const registry = [{ authorizationId: value.authorizationId, fingerprint: value.fingerprint }];
    expect(() => resolveTrustedM5ProviderSmokeAuthorization({ authorization: value, registry, asOf: value.effectiveFrom })).toThrow("M5_PROVIDER_SMOKE_AUTHORIZATION_EXPIRED");
    expect(() => resolveTrustedM5ProviderSmokeAuthorization({ authorization: value, registry, asOf: "2026-09-26T09:15:00.000Z" })).toThrow("M5_PROVIDER_SMOKE_AUTHORIZATION_EXPIRED");
    expect(() => resolveTrustedM5ProviderSmokeAuthorization({ authorization: value, registry, asOf: value.reviewedAt })).not.toThrow();
    expect(() => resolveTrustedM5ProviderSmokeAuthorization({ authorization: { ...value, recordedAt: value.effectiveFrom }, registry, asOf: "2026-09-26T09:15:00.000Z" })).toThrow("M5_PROVIDER_SMOKE_AUTHORIZATION_TIME_INVALID");
    expect(() => resolveTrustedM5ProviderSmokeAuthorization({ authorization: value, registry, asOf: value.expiresAt })).toThrow("M5_PROVIDER_SMOKE_AUTHORIZATION_EXPIRED");
    const trusted = resolveTrustedM5ProviderSmokeAuthorization({ authorization: value, registry, asOf });
    expect(isTrustedM5ProviderSmokeAuthorization(trusted)).toBe(true);
    expect(isTrustedM5ProviderSmokeAuthorization({ ...trusted })).toBe(false);
    expect(isTrustedM5ProviderSmokeAuthorization(JSON.parse(JSON.stringify(trusted)))).toBe(false);
  });

  it("rejects duplicate/conflicting registry authority and wrong scope", () => {
    const value = auth();
    const entry = { authorizationId: value.authorizationId, fingerprint: value.fingerprint };
    expect(() => resolveTrustedM5ProviderSmokeAuthorization({ authorization: value, registry: [entry, entry], asOf })).toThrow("M5_PROVIDER_SMOKE_AUTHORITY_CONFLICT");
    expect(() => resolveTrustedM5ProviderSmokeAuthorization({ authorization: value, registry: [{ ...entry, fingerprint: "f".repeat(64) }], asOf })).toThrow("M5_PROVIDER_SMOKE_AUTHORITY_NOT_TRUSTED");
    expect(() => parseM5ProviderSmokeAuthorization({ ...value, providerId: "etherscan" })).toThrow("M5_PROVIDER_SMOKE_UNSUPPORTED_AUTHENTICATION_TRANSPORT");
    expect(() => parseM5ProviderSmokeAuthorization({ ...value, reviewReference: "review:api-key-leak" })).toThrow("M5_PROVIDER_SMOKE_AUTHORIZATION_REFERENCE_INVALID");
    expect(() => parseM5ProviderSmokeAuthorization({ ...value, operatorReference: "operator:https" })).toThrow("M5_PROVIDER_SMOKE_AUTHORIZATION_REFERENCE_INVALID");
    expect(() => parseM5ProviderSmokeAuthorization({ ...value, operatorReference: "operator:example.com" })).toThrow("M5_PROVIDER_SMOKE_AUTHORIZATION_REFERENCE_INVALID");
    expect(M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY).toEqual([]);
    expect(Object.isFrozen(M5_PROVIDER_SMOKE_AUTHORITY_REGISTRY)).toBe(true);
  });

  it("keeps the smoke boundary free of persistence, storage, DB, and scheduler wiring", async () => {
    const source = await readFile(new URL("../../src/application/intelligence/m5-provider-live-smoke.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/(?:Repository|UnitOfWork|unitOfWork|supabase|SourceLineage|manifest|scheduler|writeFile|save\s*\()/i);
    expect(source).not.toContain("projectCoinGeckoToNormalizedPackage");
    expect(source).not.toContain("projectEtherscanToNormalizedPackage");
  });
});

describe("M5 provider live smoke service", () => {
  it("does lease then credential then fake HTTP and returns only NON_AUTHORITATIVE_SMOKE summary", async () => {
    const state = deps();
    const result = await executeM5ProviderLiveSmoke(state.input);
    expect(result.status).toBe("VERIFIED");
    expect(result.authorityStatus).toBe("NON_AUTHORITATIVE_SMOKE");
    expect(result.requestCount).toBe(1);
    expect(result.parsedRecordCount).toBe(1);
    expect(result.capabilityObservations.every(item => item.outcome === "OBSERVED")).toBe(true);
    expect(state.events).toEqual(["lease", "credential", "http"]);
    expect(state.credentialReferences).toEqual(["env:coingecko-demo-api-key"]);
    expect(state.requestHosts).toEqual(["api.coingecko.com"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.responseTimestamps)).toBe(true);
    expect(Object.isFrozen(result.capabilityObservations)).toBe(true);
    expect(Object.isFrozen(result.capabilityObservations[0])).toBe(true);
    expect(JSON.stringify(result)).not.toContain("canary-secret-smoke-77");
    expect(JSON.stringify(result)).not.toContain("prices");
    expect(result).not.toHaveProperty("normalizedPackage");
    expect(result).not.toHaveProperty("body");
    expect(() => buildManualIngestionToLineagePlan(result)).toThrow();
    expect(() => assertM5ProviderReadinessForExecution(result as unknown as ProviderReadinessEvaluation)).toThrow();
    expect(isTrustedM5ProviderReadinessEvaluation(result as unknown as ProviderReadinessEvaluation)).toBe(false);
    expect(isTrustedM5ProviderReadinessAggregate(result)).toBe(false);
  });

  it("makes zero lease, credential, and HTTP calls for untrusted, wrong-environment, or wrong-provider inputs", async () => {
    const state = deps();
    const blocked = await executeM5ProviderLiveSmoke({ ...state.input, trustedRegistry: [] });
    expect(blocked.status).toBe("BLOCKED");
    expect(state.events).toEqual([]);
    const wrongEnvironment = await executeM5ProviderLiveSmoke({ ...state.input, environment: "PRODUCTION" });
    expect(wrongEnvironment.status).toBe("BLOCKED");
    const wrongProvider = await executeM5ProviderLiveSmoke({ ...state.input, providerId: "etherscan" });
    expect(wrongProvider.status).toBe("BLOCKED");
    const wrongAsset = await executeM5ProviderLiveSmoke({ ...state.input, config: { ...config(), contractAddress: "0x2222222222222222222222222222222222222222" } });
    expect(wrongAsset.status).toBe("BLOCKED");
    expect(wrongAsset.code).toBe("M5_PROVIDER_SMOKE_SCOPE_INVALID");
    expect(state.events).toEqual([]);
  });

  it("blocks Etherscan config and execution before lease, credential, DNS, or HTTP", async () => {
    const authorization = auth();
    const events: string[] = [];
    const result = await executeM5ProviderLiveSmoke({ config: config("etherscan"), authorization: { providerId: "etherscan" }, providerId: "etherscan", environment: "LOCAL_SMOKE", asOf, currentTime: () => asOf,
      trustedRegistry: [{ authorizationId: authorization.authorizationId, fingerprint: authorization.fingerprint }],
      credentials: { resolve: vi.fn(async () => { events.push("credential"); return { kind: "API_KEY" as const, value: "eth-canary-77" }; }) },
      rateLimit: { acquire: vi.fn(async () => { events.push("lease"); return true; }) },
      transport: { isCredentialUrlSafeForSmoke: () => { events.push("dns-policy-check"); return true; }, send: vi.fn(async () => { events.push("http"); throw new Error("must not be called"); }) } });
    expect(result.status).toBe("BLOCKED");
    expect(result.code).toBe("M5_PROVIDER_SMOKE_UNSUPPORTED_AUTHENTICATION_TRANSPORT");
    expect(events).toEqual([]);
    const disguisedConfig = await executeM5ProviderLiveSmoke({ config: config("etherscan"), authorization, providerId: "coingecko", environment: "LOCAL_SMOKE", asOf, currentTime: () => asOf,
      trustedRegistry: [{ authorizationId: authorization.authorizationId, fingerprint: authorization.fingerprint }],
      credentials: { resolve: vi.fn(async () => { events.push("credential"); return { kind: "API_KEY" as const, value: "eth-canary-77" }; }) },
      rateLimit: { acquire: vi.fn(async () => { events.push("lease"); return true; }) },
      transport: { isCredentialUrlSafeForSmoke: () => { events.push("dns-policy-check"); return true; }, send: vi.fn(async () => { events.push("http"); throw new Error("must not be called"); }) } });
    expect(disguisedConfig.status).toBe("BLOCKED");
    expect(disguisedConfig.code).toBe("M5_PROVIDER_SMOKE_UNSUPPORTED_AUTHENTICATION_TRANSPORT");
    expect(events).toEqual([]);
    expect(parseM5ProviderSmokeArgs(["--authorization", "auth.json", "--provider", "etherscan", "--execute", "--environment", "LOCAL_SMOKE"]).provider).toBe("etherscan");
    expect(parseM5ProviderSmokeArgs(["--authorization", "auth.json", "--provider", "etherscan"])).toMatchObject({ execute: false, provider: "etherscan" });
    expect(m5ProviderSmokeSupport("coingecko")).toMatchObject({ status: "SUPPORTED", requirement: "VALID_TRUSTED_SMOKE_AUTHORITY" });
    expect(m5ProviderSmokeSupport("etherscan")).toMatchObject({ status: "BLOCKED", code: "M5_PROVIDER_SMOKE_UNSUPPORTED_AUTHENTICATION_TRANSPORT", executableSmoke: false });
  });

  it("keeps source observation timestamps, receipt time, and payload fingerprint independent", async () => {
    const firstState = deps();
    const first = await executeM5ProviderLiveSmoke(firstState.input);
    const secondState = deps({ transport: { send: vi.fn(async () => ({ status: 200, headers: { "content-type": "application/json" }, body: Buffer.from('{"prices":[[1790294400000,1.250000]],"market_caps":[[1790294400000,100]],"total_volumes":[[1790294400000,20]]}'), retrievedAt: "2026-09-26T10:00:01.000Z" })) } });
    const second = await executeM5ProviderLiveSmoke(secondState.input);
    expect(first.payloadFingerprints).toEqual(second.payloadFingerprints);
    expect(first.responseTimestamps).toEqual(second.responseTimestamps);
    expect(first.receiptTimestamps).not.toEqual(second.receiptTimestamps);
  });

  it("bounds response bytes and converts provider/parser failures to sanitized infrastructure failures", async () => {
    const state = deps({ transport: { send: vi.fn(async () => ({ status: 200, headers: { "content-type": "application/json" }, body: new Uint8Array(16_385), retrievedAt: asOf })) } });
    const tooLarge = await executeM5ProviderLiveSmoke(state.input);
    expect(tooLarge.status).toBe("INFRASTRUCTURE_FAILURE");
    expect(tooLarge.code).toBe("M5_PROVIDER_SMOKE_RESPONSE_BUDGET_EXCEEDED");
    const raw = Buffer.from("provider-secret-raw-body");
    const send = vi.fn(async () => ({ status: 200, headers: { "content-type": "application/json" }, body: raw, retrievedAt: asOf }));
    const malformed = deps({ transport: { send } });
    const failed = await executeM5ProviderLiveSmoke(malformed.input);
    expect(failed.status).toBe("INFRASTRUCTURE_FAILURE");
    expect(JSON.stringify(failed)).not.toContain("provider-secret-raw-body");
    expect(send).toHaveBeenCalledTimes(1);
    expect(raw.every(byte => byte === 0)).toBe(true);
  });

  it("rejects redirects, non-JSON content, and invalid UTF-8 without retry or leaking response material", async () => {
    const redirectBody = Buffer.from("redirect-secret-body");
    const redirectSend = vi.fn(async () => ({ status: 302, headers: { location: "https://attacker.invalid/?token=secret", "content-type": "text/plain" }, body: redirectBody, retrievedAt: asOf }));
    const redirect = await executeM5ProviderLiveSmoke(deps({ transport: { send: redirectSend } }).input);
    expect(redirect.code).toBe("M5_PROVIDER_SMOKE_REDIRECT_REJECTED");
    expect(redirectSend).toHaveBeenCalledTimes(1);
    expect(redirectBody.every(byte => byte === 0)).toBe(true);
    expect(JSON.stringify(redirect)).not.toMatch(/attacker|token=|redirect-secret/);

    const html = await executeM5ProviderLiveSmoke(deps({ transport: { send: vi.fn(async () => ({ status: 200, headers: { "content-type": "text/html" }, body: Buffer.from("<html>secret</html>"), retrievedAt: asOf })) } }).input);
    expect(html.code).toBe("M5_PROVIDER_SMOKE_PROVIDER_RESPONSE_INVALID");
    const utf8 = await executeM5ProviderLiveSmoke(deps({ transport: { send: vi.fn(async () => ({ status: 200, headers: { "content-type": "application/json" }, body: new Uint8Array([0xff, 0xfe]), retrievedAt: asOf })) } }).input);
    expect(utf8.status).toBe("INFRASTRUCTURE_FAILURE");
    expect(utf8.code).toBe("M5_PROVIDER_SMOKE_PROVIDER_RESPONSE_INVALID");
  });

  it("applies a total request timeout and never retries", async () => {
    vi.useFakeTimers();
    try {
      let markStarted!: () => void;
      const started = new Promise<void>(resolve => { markStarted = resolve; });
      const send = vi.fn(async () => { markStarted(); return await new Promise<M5ProviderHttpTransportResponse>(() => {}); });
      const state = deps({ transport: { send } });
      const pending = executeM5ProviderLiveSmoke(state.input);
      await started;
      await vi.advanceTimersByTimeAsync(5_000);
      const result = await pending;
      expect(result.status).toBe("INFRASTRUCTURE_FAILURE");
      expect(result.code).toBe("M5_PROVIDER_SMOKE_TIMEOUT");
      expect(send).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("sanitizes missing credential failures and does not send HTTP", async () => {
    const attempted: string[] = [];
    const state = deps({ credentials: { resolve: vi.fn(async () => { attempted.push("credential"); throw new Error("canary-secret-credential-error"); }) } });
    const result = await executeM5ProviderLiveSmoke(state.input);
    expect(result.status).toBe("INFRASTRUCTURE_FAILURE");
    expect(result.code).toBe("M5_PROVIDER_SMOKE_CREDENTIAL_UNAVAILABLE");
    expect(state.events).toEqual(["lease"]);
    expect(attempted).toEqual(["credential"]);
    expect(JSON.stringify(result)).not.toContain("canary-secret-credential-error");
  });

  it("validates bounded smoke config and previews no credential, DNS, HTTP, or writes", () => {
    expect(() => parseM5ProviderSmokeConfig({ ...config(), unexpected: 1 })).toThrow();
    expect(() => parseM5ProviderSmokeConfig({ ...config(), to: "2026-09-30T00:00:00.000Z" })).toThrow("M5_PROVIDER_SMOKE_CONFIG_BUDGET_INVALID");
    const authorization = auth();
    const plan = previewM5ProviderLiveSmoke({ config: config(), authorization, providerId: "coingecko" });
    expect(plan.requestCount).toBe(1);
    expect(plan.credentialReferences).toEqual(["env:coingecko-demo-api-key"]);
    expect(plan.requests[0]?.hostname).toBe("api.coingecko.com");
    expect(plan.requests[0]?.hostname).not.toBe("pro-api.coingecko.com");
    expect(plan.requests[0]?.path).toBe(`/api/v3/coins/ethereum/contract/${address}/market_chart/range`);
    expect(JSON.stringify(plan)).not.toContain("canary-secret-smoke-77");
    expect(parseM5ProviderSmokeArgs(["--authorization", "auth.json", "--provider", "coingecko"])).toMatchObject({ execute: false });
    expect(() => parseM5ProviderSmokeArgs(["--authorization", "auth.json", "--provider", "coingecko", "--execute"])).toThrow();
    expect(() => parseM5ProviderSmokeArgs(["--authorization", "auth.json", "--provider", "coingecko", "--execute", "--environment", "PRODUCTION"])).toThrow();
    expect(parseM5ProviderSmokeArgs(["--authorization", "auth.json", "--provider", "coingecko", "--execute", "--environment", "LOCAL_SMOKE"]).execute).toBe(true);
    expect(isM5ProviderSmokeAuthorizationPath("config/m5/provider-live-smoke/auth.json")).toBe(true);
    expect(isM5ProviderSmokeAuthorizationPath(".env.local")).toBe(false);
    expect(isM5ProviderSmokeAuthorizationPath("config/m5/provider-live-smoke/../../../../.env")).toBe(false);
  });
});
