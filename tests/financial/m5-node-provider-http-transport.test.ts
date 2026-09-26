import { describe, expect, it } from "vitest";
import { isM5PublicProviderIpv4, m5ProviderAuthenticationHeaders, validateM5ProviderTransportRequestShape } from "@/infrastructure/intelligence/m5-node-provider-http-transport";

const address = "0x1111111111111111111111111111111111111111";
function request(overrides: Record<string, unknown> = {}) {
  return {
    request: { protocol: "https:", method: "GET", hostname: "pro-api.coingecko.com", path: `/api/v3/coins/ethereum/contract/${address}/market_chart/range`, query: [
      { key: "from", value: "1767225600" }, { key: "interval", value: "daily" }, { key: "to", value: "1769904000" }, { key: "vs_currency", value: "usd" },
    ] },
    credential: { kind: "API_KEY", value: "test-canary-secret" }, timeoutMs: 1000, maxResponseBytes: 1024, redirectPolicy: "ERROR", attemptOrdinal: 1,
    ...overrides,
  };
}

describe("M5 Node provider transport request boundary (pure validation only)", () => {
  it("binds CoinGecko Demo and Pro credentials to distinct exact hosts and headers", () => {
    expect(m5ProviderAuthenticationHeaders("api.coingecko.com", "canary-header-77")).toEqual({ "x-cg-demo-api-key": "canary-header-77" });
    expect(m5ProviderAuthenticationHeaders("pro-api.coingecko.com", "canary-header-77")).toEqual({ "x-cg-pro-api-key": "canary-header-77" });
    expect(m5ProviderAuthenticationHeaders("api.etherscan.io", "canary-header-77")).toEqual({});
    expect(() => m5ProviderAuthenticationHeaders("evil.test", "canary-header-77")).toThrow();
  });
  it("accepts only exact provider request shapes without performing DNS or HTTP", () => {
    expect(() => validateM5ProviderTransportRequestShape(request())).not.toThrow();
    expect(() => validateM5ProviderTransportRequestShape(request({ request: { ...request().request, hostname: "api.coingecko.com" } }))).not.toThrow();
    expect(() => validateM5ProviderTransportRequestShape(request({ request: { ...request().request, hostname: "api.etherscan.io", path: "/v2/api", query: [
      { key: "action", value: "getsourcecode" }, { key: "address", value: address }, { key: "chainid", value: "1" }, { key: "module", value: "contract" },
    ] } }))).not.toThrow();
  });

  it.each([
    ["alternate host", { hostname: "127.0.0.1" }],
    ["suffix bypass", { hostname: "pro-api.coingecko.com.evil.test" }],
    ["subdomain", { hostname: "x.pro-api.coingecko.com" }],
    ["trailing dot", { hostname: "pro-api.coingecko.com." }],
    ["unicode lookalike", { hostname: "prо-api.coingecko.com" }],
  ])("rejects %s before DNS", (_name, host) => {
    expect(() => validateM5ProviderTransportRequestShape(request({ request: { ...request().request, ...host } }))).toThrow();
  });

  it.each([
    ["wrong protocol", { protocol: "http:" }],
    ["wrong method", { method: "POST" }],
    ["arbitrary path", { path: "/api/v3/ping" }],
    ["path traversal", { path: `/api/v3/coins/ethereum/contract/${address}/../market_chart/range` }],
    ["encoded separator", { path: `/api/v3/coins/ethereum/contract%2f${address}/market_chart/range` }],
    ["extra query", { query: [...request().request.query, { key: "api_key", value: "test-canary-secret" }] }],
    ["duplicate query", { query: [...request().request.query, { key: "from", value: "1767225600" }] }],
    ["port injection", { port: 8443 }],
    ["userinfo injection", { username: "attacker", password: "secret" }],
    ["credential query dump", { query: [...request().request.query, { key: "apikey", value: "test-canary-secret" }] }],
  ])("rejects %s without request construction", (_name, override) => {
    let error: unknown;
    try { validateM5ProviderTransportRequestShape(request({ request: { ...request().request, ...override } })); } catch (caught) { error = caught; }
    expect(error).toBeDefined();
    expect(String(error)).not.toContain("test-canary-secret");
  });

  it("rejects sparse arrays and accessor query entries without evaluating getters", () => {
    const sparse = request().request.query.slice();
    delete sparse[1];
    expect(() => validateM5ProviderTransportRequestShape(request({ request: { ...request().request, query: sparse } }))).toThrow();
    const accessor = request().request.query.slice();
    Object.defineProperty(accessor, "0", { enumerable: true, get: () => { throw new Error("getter executed"); } });
    expect(() => validateM5ProviderTransportRequestShape(request({ request: { ...request().request, query: accessor } }))).toThrow();
  });

  it("fails closed for loopback, private, link-local, shared and reserved IPv4 ranges", () => {
    for (const ip of ["0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1", "172.16.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.1.1.1", "::1", "not-an-ip"]) expect(isM5PublicProviderIpv4(ip)).toBe(false);
    expect(isM5PublicProviderIpv4("8.8.8.8")).toBe(true);
  });
});
