import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import { M5_DEFAULT_REQUIRED_CAPABILITIES, M5_DEFAULT_REQUESTED_USAGES, evaluateM5ProviderReadinessConfig } from "@/application/intelligence/evaluate-m5-provider-readiness";
import { buildCoinGeckoMarketRequestPlan, parseCoinGeckoFixture, parseEtherscanFixture } from "@/application/intelligence/m5-provider-adapter-contracts";
import {
  M5_PROVIDER_EXECUTION_PLAN_VERSION,
  M5_PROVIDER_EXECUTION_POLICY_VERSION,
  executeM5ProviderPagination,
  executeM5ProviderPlan,
  providerPlanFingerprint,
  requestPlanFromAdapterPlan,
  validateM5ProviderExecutionPlan,
  type M5ProviderExecutionPlan,
  type M5ProviderHttpTransport,
} from "@/application/intelligence/m5-provider-execution-boundary";

const reviewedAt = "2026-09-25T12:00:00.000Z";
const expiry = "2027-09-25T12:00:00.000Z";
const docs = ["https://docs.example.test/provider"];
const terms = ["https://provider.example.test/terms"];
const capabilities = M5_DEFAULT_REQUIRED_CAPABILITIES.map(item => ({ capability: item.capability, status: "SUPPORTED", completeness: "COMPLETE", reviewedAt, reviewReference: "review/execution/v1", documentationUrls: docs, termsUrls: terms, limitations: [], ...(item.capability === "VENUE_COMPLETE_UNIVERSE" ? { zeroVenuePolicy: "ALLOWED_EMPTY" } : {}) }));
const usages = M5_DEFAULT_REQUESTED_USAGES.map(usage => ({ usage, approval: "APPROVED", reviewedAt, reviewReference: "review/execution/v1", limitations: [] }));

function readiness(providerId: string, datasetId: string, datasetVersion: string, requiredCapabilities = M5_DEFAULT_REQUIRED_CAPABILITIES) {
  return evaluateM5ProviderReadinessConfig({
    config: { configVersion: "m5-provider-readiness-config/v1", providerNamespace: `${providerId}:synthetic`, providerId, datasetId, datasetVersion, reviewedAt, reviewReference: "review/execution/v1", documentationUrls: docs, termsUrls: terms, capabilities, usageDecisions: usages, limitations: [], approvalExpiresAt: expiry, metadata: { sourceKind: "SYNTHETIC_FIXTURE", policyVersion: "m5-provider-readiness-policy/v1" } },
    evaluatedAt: reviewedAt,
    requiredCapabilities,
    requestedUsages: ["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING"],
  });
}

function plan(overrides: Record<string, unknown> = {}): M5ProviderExecutionPlan {
  return validateM5ProviderExecutionPlan({
    planVersion: M5_PROVIDER_EXECUTION_PLAN_VERSION,
    policyVersion: M5_PROVIDER_EXECUTION_POLICY_VERSION,
    providerId: "coingecko",
    datasetId: "coingecko-market-chart",
    datasetVersion: "coingecko-market-chart/v1",
    providerSourceNamespace: "coingecko:eth",
    adapterContractVersion: "m5-provider-adapter/v1",
    parserContractVersion: "m5-provider-fixture-parser/v1",
    requiredCapabilities: [{ capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" }],
    requestedUsages: ["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING"],
    credential: { kind: "API_KEY", reference: "coingecko-primary" },
    request: { method: "GET", hostname: "api.coingecko.com", path: "/api/v3/coins/ethereum/market_chart/range", query: [{ key: "contract_address", value: "0x1111111111111111111111111111111111111111" }, { key: "from", value: "1760000000" }, { key: "interval", value: "daily" }, { key: "to", value: "1760086400" }, { key: "vs_currency", value: "usd" }] },
    limits: { timeoutMs: 10_000, maxResponseBytes: 1024 },
    retry: { maxAttempts: 3, totalBudgetMs: 10_000, maxRetryAfterMs: 500 },
    ...overrides,
  });
}

function parser(input: Parameters<NonNullable<Parameters<typeof executeM5ProviderPlan>[0]["parser"]>>[0]) {
  const text = new TextDecoder().decode(input.body);
  const projection = JSON.parse(text || "null") as unknown;
  const pagination = projection && typeof projection === "object" && !Array.isArray(projection) ? projection as { nextCursor?: unknown; isFinal?: unknown } : {};
  return {
    projection,
    payloadFingerprint: canonicalSha256({ bytes: [...input.body] }),
    effectiveAvailableAt: input.retrievedAt,
    ...(typeof pagination.nextCursor === "string" ? { nextCursor: pagination.nextCursor } : {}),
    ...(typeof pagination.isFinal === "boolean" ? { isFinal: pagination.isFinal } : {}),
  };
}

function transport(responses: readonly Readonly<{ status: number; body?: string; headers?: Record<string, string>; retrievedAt?: string }>[], seen: M5ProviderHttpTransport["send"] extends (request: infer R) => Promise<unknown> ? R[] : never, credentials: string[]) {
  let index = 0;
  const value: M5ProviderHttpTransport = { send: async request => { seen.push(request); credentials.push(request.credential.value ?? ""); const response = responses[Math.min(index++, responses.length - 1)]!; return { status: response.status, headers: response.headers ?? { "content-type": "application/json" }, body: new TextEncoder().encode(response.body ?? "{}"), retrievedAt: response.retrievedAt ?? "2026-09-25T13:00:00.000Z", providerRequestId: "safe-request-id" }; } };
  return value;
}

describe("M5 provider execution boundary", () => {
  it("accepts only authentic scope-bound readiness and executes through injected transport", async () => {
    const currentPlan = plan();
    const auth = readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", [{ capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" }]);
    expect(auth.result).toBe("READY");
    const seen: Parameters<M5ProviderHttpTransport["send"]>[0][] = [];
    const credentials: string[] = [];
    const result = await executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 200, body: '{"prices":[]}' }], seen, credentials), credentials: { resolve: async () => ({ kind: "API_KEY", value: "synthetic-secret" }) }, parser });
    expect(result.status).toBe("EXECUTED");
    if (result.status === "EXECUTED") {
      expect(result.scope).toEqual({ providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/v1" });
      expect(result.receipt).not.toHaveProperty("credential");
      expect(JSON.stringify(result)).not.toContain("synthetic-secret");
      expect(seen[0]!.credential.value).toBe("synthetic-secret");
      expect(seen[0]!.request.protocol).toBe("https:");
      expect(providerPlanFingerprint(currentPlan)).toHaveLength(64);
      expect(providerPlanFingerprint(validateM5ProviderExecutionPlan({ ...currentPlan, credential: { kind: "BEARER_TOKEN", reference: "rotated-reference" } }))).toBe(providerPlanFingerprint(currentPlan));
      expect(providerPlanFingerprint(validateM5ProviderExecutionPlan({ ...currentPlan, request: { ...currentPlan.request, query: currentPlan.request.query.map(item => item.key === "from" ? { ...item, value: "1760000001" } : item) } }))).not.toBe(providerPlanFingerprint(currentPlan));
    }
    expect(await executeM5ProviderPlan({ plan: currentPlan, readiness: { ...auth }, transport: transport([{ status: 200 }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser })).toEqual({ status: "BLOCKED", code: "M5_PROVIDER_READINESS_BLOCKED" });
  });

  it("blocks scope, capability and usage mismatches", async () => {
    const currentPlan = plan();
    const wrongScope = readiness("etherscan", "etherscan-contract-authority", "etherscan-api-v2/v1", [{ capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" }]);
    expect((await executeM5ProviderPlan({ plan: currentPlan, readiness: wrongScope, transport: transport([{ status: 200 }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser })).status).toBe("BLOCKED");
    const missingCapability = readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", []);
    expect((await executeM5ProviderPlan({ plan: currentPlan, readiness: missingCapability, transport: transport([{ status: 200 }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser })).status).toBe("BLOCKED");
    const blocked = readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", [{ capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" }]);
    expect((await executeM5ProviderPlan({ plan: { ...currentPlan, requestedUsages: ["NETWORK_ACQUISITION"] } as M5ProviderExecutionPlan, readiness: blocked, transport: transport([{ status: 200 }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser })).status).toBe("INVALID_PLAN");
  });

  it.each([
    ["http host", { request: { ...plan().request, hostname: "localhost" } }, "M5_PROVIDER_EXECUTION_HOST_REJECTED"],
    ["wrong host", { request: { ...plan().request, hostname: "example.com" } }, "M5_PROVIDER_EXECUTION_HOST_REJECTED"],
    ["path traversal", { request: { ...plan().request, path: "/api/v3/coins/../secret" } }, "M5_PROVIDER_EXECUTION_PATH_TRAVERSAL"],
    ["encoded slash", { request: { ...plan().request, path: "/api/v3/coins/%2fsecret" } }, "M5_PROVIDER_EXECUTION_PATH_TRAVERSAL"],
    ["duplicate query", { request: { ...plan().request, query: [...plan().request.query, { key: "from", value: "1760000001" }] } }, "M5_PROVIDER_EXECUTION_QUERY_DUPLICATE"],
    ["secret query", { request: { ...plan().request, query: [...plan().request.query, { key: "api_key", value: "x" }] } }, "M5_PROVIDER_EXECUTION_SECRET_QUERY_REJECTED"],
    ["oversized limit", { limits: { timeoutMs: 10_000, maxResponseBytes: 20_000_000 } }, "M5_PROVIDER_EXECUTION_LIMITS_INVALID"],
    ["unknown capability", { requiredCapabilities: [{ capability: "UNKNOWN_CAPABILITY", completeness: "COMPLETE" }] }, "M5_PROVIDER_EXECUTION_CAPABILITY_INVALID"],
    ["unknown usage", { requestedUsages: ["NETWORK_ACQUISITION", "RAW_PAYLOAD_PROCESSING", "RAW_PAYLOAD_STORAGE"] }, "M5_PROVIDER_EXECUTION_USAGE_INVALID"],
    ["timeout beyond retry budget", { limits: { timeoutMs: 10_001, maxResponseBytes: 1024 }, retry: { maxAttempts: 3, totalBudgetMs: 10_000, maxRetryAfterMs: 500 } }, "M5_PROVIDER_EXECUTION_RETRY_INVALID"],
  ] as const)("rejects SSRF and unsafe request plan: %s", (_name, override, code) => {
    expect(() => validateM5ProviderExecutionPlan(override === undefined ? plan() : { ...plan(), ...override })).toThrow(code);
  });

  it("sanitizes credential failures and enforces response policy", async () => {
    const currentPlan = plan();
    const auth = readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", [{ capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" }]);
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 200, body: "<html>" }], [], []), credentials: { resolve: async () => { throw new Error("secret-value"); } }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_CREDENTIAL_FAILED");
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 200, headers: { "content-type": "text/html" }, body: "<html>" }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_CONTENT_TYPE_REJECTED");
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 200, body: "x".repeat(2048) }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE");
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 200, body: "{}" }], [], []), credentials: { resolve: async () => ({ kind: "NONE", value: "unexpected" }) }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_CREDENTIAL_KIND_MISMATCH");
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 200, body: "{}" }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY" }) }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_CREDENTIAL_INVALID");
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 200, body: "{}" }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: " secret " }) }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_CREDENTIAL_INVALID");
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 200, body: "{}" }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, rateLimit: { acquire: async () => { throw new Error("secret-rate-limit-detail"); } }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_RATE_LIMIT_FAILED");
    const invalidUtf8: M5ProviderHttpTransport = { send: async () => ({ status: 200, headers: { "content-type": "application/json" }, body: new Uint8Array([0xff]), retrievedAt: "2026-09-25T13:00:00.000Z" }) };
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: invalidUtf8, credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_UTF8_INVALID");
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 200, body: "{}", retrievedAt: "2026-09-25T13:00:00.000Z" }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser: input => ({ ...parser(input), effectiveAvailableAt: "2026-09-25T13:00:00.001Z" }) })).rejects.toThrow("M5_PROVIDER_EXECUTION_AVAILABILITY_INVALID");
  });

  it("retries only transient responses with bounded injected sleep and rate leases", async () => {
    const currentPlan = plan({ retry: { maxAttempts: 3, totalBudgetMs: 10_000, maxRetryAfterMs: 500 } });
    const auth = readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", [{ capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" }]);
    const seen: Parameters<M5ProviderHttpTransport["send"]>[0][] = [];
    const sleeps: number[] = [];
    let leases = 0;
    const result = await executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 503, headers: { "content-type": "application/json", "retry-after": "999" } }, { status: 200, body: "{}" }], seen, []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, rateLimit: { acquire: async () => { leases += 1; return true; } }, sleep: async milliseconds => { sleeps.push(milliseconds); }, parser });
    expect(result.status).toBe("EXECUTED");
    expect(seen).toHaveLength(2);
    expect(leases).toBe(2);
    expect(sleeps).toEqual([500]);
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 400 }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, sleep: async () => { throw new Error("must not sleep"); }, parser })).rejects.toThrow("M5_PROVIDER_HTTP_400");
    await expect(executeM5ProviderPlan({ plan: currentPlan, readiness: auth, transport: transport([{ status: 503 }, { status: 400 }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, sleep: async () => undefined, parser })).rejects.toThrow("M5_PROVIDER_HTTP_400");
  });

  it("bounds streaming responses and validates pagination cursors", async () => {
    const first = plan({ pagination: { pageOrdinal: 0, maxPages: 2, cursorKey: "cursor" } });
    const auth = readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", [{ capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" }]);
    const pages = await executeM5ProviderPagination({ initialPlan: first, nextPlan: (cursor, pageOrdinal) => plan({ pagination: { pageOrdinal, maxPages: 2, cursorKey: "cursor" }, request: { ...first.request, query: [...first.request.query.filter(item => item.key !== "cursor"), { key: "cursor", value: cursor }] } }), readiness: auth, transport: { send: async request => { const hasCursor = request.request.query.some(item => item.key === "cursor"); return { status: 200, headers: { "content-type": "application/json" }, body: new TextEncoder().encode(hasCursor ? '{"isFinal":true}' : '{"isFinal":false,"nextCursor":"next"}'), retrievedAt: hasCursor ? "2026-09-25T13:01:00.000Z" : "2026-09-25T13:00:00.000Z" }; } }, credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser });
    expect(pages.pages).toHaveLength(2);
    expect(pages.effectiveAvailableAt).toBe("2026-09-25T13:01:00.000Z");
    await expect(executeM5ProviderPagination({ initialPlan: first, nextPlan: () => first, readiness: auth, transport: transport([{ status: 200, body: '{"isFinal":false,"nextCursor":"same"}' }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_PAGINATION_PLAN_MISMATCH");
    await expect(executeM5ProviderPagination({ initialPlan: first, nextPlan: (cursor, pageOrdinal) => plan({ pagination: { pageOrdinal, maxPages: 2, cursorKey: "cursor" }, request: { ...first.request, query: [...first.request.query.filter(item => item.key !== "cursor"), { key: "cursor", value: cursor }] } }), readiness: auth, transport: transport([{ status: 200, body: '{"isFinal":false,"nextCursor":"https://evil.invalid/next"}' }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_CURSOR_INVALID");
    await expect(executeM5ProviderPagination({ initialPlan: first, nextPlan: (cursor, pageOrdinal) => plan({ pagination: { pageOrdinal, maxPages: 3, cursorKey: "cursor" }, request: { ...first.request, query: [...first.request.query, { key: "cursor", value: cursor }] } }), readiness: auth, transport: transport([{ status: 200, body: '{"isFinal":false,"nextCursor":"next"}' }], [], []), credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) }, parser })).rejects.toThrow("M5_PROVIDER_EXECUTION_PAGINATION_PLAN_MISMATCH");
  });

  it("uses parser pagination metadata rather than projection fields", async () => {
    const first = plan({ pagination: { pageOrdinal: 0, maxPages: 2, cursorKey: "cursor" } });
    const auth = readiness("coingecko", "coingecko-market-chart", "coingecko-market-chart/v1", [{ capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" }]);
    let page = 0;
    const pages = await executeM5ProviderPagination({
      initialPlan: first,
      nextPlan: (cursor, pageOrdinal) => plan({ pagination: { pageOrdinal, maxPages: 2, cursorKey: "cursor" }, request: { ...first.request, query: [...first.request.query, { key: "cursor", value: cursor }] } }),
      readiness: auth,
      transport: transport([{ status: 200 }, { status: 200, retrievedAt: "2026-09-25T13:01:00.000Z" }], [], []),
      credentials: { resolve: async () => ({ kind: "API_KEY", value: "secret" }) },
      parser: input => page++ === 0
        ? { ...parser(input), projection: { isFinal: true, nextCursor: "untrusted" }, isFinal: false, nextCursor: "trusted-next" }
        : { ...parser(input), projection: { isFinal: false, nextCursor: "untrusted" }, isFinal: true },
    });
    expect(pages.pages).toHaveLength(2);
    expect(pages.pages[0]!.pagination).toEqual({ isFinal: false, nextCursor: "trusted-next" });
    expect(pages.pages[1]!.pagination).toEqual({ isFinal: true });
  });

  it("accepts existing adapter plans without creating a parallel request format", () => {
    const adapterPlan = buildCoinGeckoMarketRequestPlan({ coinId: "ethereum", contractAddress: "0x1111111111111111111111111111111111111111", from: "2026-01-01T00:00:00.000Z", to: "2026-01-02T00:00:00.000Z" });
    const executionPlan = requestPlanFromAdapterPlan({ plan: adapterPlan, requiredCapabilities: [{ capability: "DAILY_CLOSE_SERIES", completeness: "COMPLETE" }], credential: { kind: "API_KEY", reference: "coingecko-fixture" } });
    expect(executionPlan.request.hostname).toBe("api.coingecko.com");
    expect(executionPlan.request.method).toBe("GET");
    expect(() => parseCoinGeckoFixture({ providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/v1", network: "eth", contractAddress: "0x1111111111111111111111111111111111111111", coinId: "ethereum", receipt: { receivedAt: "2026-01-02T00:00:00.000Z" }, prices: [{ timestamp: 1760000000000, price: "1" }], marketCaps: [{ timestamp: 1760000000000, price: "2" }], totalVolumes: [{ timestamp: 1760000000000, price: "3" }], pools: [] })).not.toThrow();
    expect(parseEtherscanFixture({ providerId: "etherscan", datasetId: "etherscan-contract-authority", datasetVersion: "etherscan-api-v2/v1", chainid: "1", address: "0x1111111111111111111111111111111111111111", receipt: { receivedAt: "2026-01-02T00:00:00.000Z" }, creation: { blockNumber: "100", blockHash: `0x${"a".repeat(64)}`, timestamp: 1760000000000 }, sourceCode: { status: "VERIFIED", proxy: false }, apiStatus: "1", apiMessage: "OK" }).verification.state).toBe("VERIFIED");
  });
});
