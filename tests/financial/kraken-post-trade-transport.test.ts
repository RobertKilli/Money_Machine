import { afterEach, describe, expect, it, vi } from "vitest";
import { request as nodeHttpsRequest } from "node:https";
import {
  createKrakenPostTradeTransport,
  fetchKrakenPostTradeEvidence,
  KRAKEN_POST_TRADE_MAX_BODY_BYTES,
  type KrakenPostTradeBinding,
  type KrakenPostTradeHttpRequest,
  type KrakenPostTradeHttpResponse,
  type KrakenPostTradeRequester,
} from "@/infrastructure/paper-trading/kraken-post-trade-transport";
import { KRAKEN_POST_TRADE_PARSER_VERSION } from "@/application/paper-trading/kraken-post-trade-parser";

const { nodeHttpsRequestMock } = vi.hoisted(() => ({ nodeHttpsRequestMock: vi.fn() }));
vi.mock("node:https", () => ({ request: nodeHttpsRequestMock }));

const binding = {
  instrument: {
    instrumentId: "paper.external.eth-usd-kraken", baseAssetId: "ETH", quoteCurrency: "USD",
    venueId: "PGSL", venueProductId: "ETH/USD",
  },
  source: { providerId: "kraken-spot", datasetVersion: "post-trade/v1", adapterVersion: KRAKEN_POST_TRADE_PARSER_VERSION },
} as const satisfies KrakenPostTradeBinding;
const input = { ...binding, tradeId: "trade-001" };
const trade = (overrides: Record<string, unknown> = {}) => ({
  trade_id: "trade-001", symbol: "ETH/USD", base_asset: "ETH", quote_asset: "USD", trade_venue: "PGSL", publication_venue: "PGSL",
  price: "2043.123456789", quantity: "0.01250000", trade_ts: "2026-11-26T12:34:56.123456789Z",
  publication_ts: "2026-11-26T12:34:56.123999999Z", ...overrides,
});
const raw = (item: Record<string, unknown> = trade()) => JSON.stringify({ error: [], result: {
  count: 1, last_ts: item.trade_ts, trades: [item],
} });
const reply = (options: Partial<KrakenPostTradeHttpResponse> = {}): KrakenPostTradeHttpResponse => ({
  statusCode: 200,
  headers: { "content-type": "application/json; charset=utf-8", "content-encoding": "identity" },
  body: Buffer.from(raw(), "utf8"),
  ...options,
});

let fakeNow = Date.now();
const advance = (milliseconds = 1_001) => { fakeNow += milliseconds; };
const allowSynthetic = () => ({ sourceApproval: "APPROVED" as const, runtimePermission: "AUTHORIZED" as const });
function testTransport(requester: KrakenPostTradeRequester, bindings: readonly KrakenPostTradeBinding[] = [binding]) {
  return createKrakenPostTradeTransport({ bindings, requester, authorize: allowSynthetic, now: () => fakeNow });
}
async function fetchNext(transport: ReturnType<typeof createKrakenPostTradeTransport>) {
  advance();
  return transport.fetchEvidence(input);
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("server-only Kraken Post-Trade transport boundary", () => {
  it("defaults closed before network and has no configured binding or operational permission", async () => {
    const result = await fetchKrakenPostTradeEvidence(input);
    expect(result).toEqual({ status: "BLOCKED", reason: "SOURCE_NOT_APPROVED" });
    expect(nodeHttpsRequest).not.toHaveBeenCalled();
  });

  it("binds a fixed HTTPS request through parse and evidence packaging with traceable fingerprints", async () => {
    const requests: KrakenPostTradeHttpRequest[] = [];
    let injectedCalls = 0;
    const transport = testTransport(async (request) => {
      requests.push(request);
      injectedCalls += 1;
      return reply();
    });
    const result = await fetchNext(transport);
    expect(injectedCalls).toBe(1);
    expect(requests[0]).toMatchObject({
      protocol: "https:", hostname: "api.kraken.com", method: "GET",
      path: "/0/public/PostTrade?symbol=ETH%2FUSD&count=1", rejectUnauthorized: true,
      connectTimeoutMs: 2_000, totalTimeoutMs: 5_000, maxResponseBytes: KRAKEN_POST_TRADE_MAX_BODY_BYTES,
    });
    expect(result).toMatchObject({ status: "EVIDENCE", sourceApproval: "NOT_APPROVED", decisionReadiness: "BLOCKED_UNCLASSIFIED_PRICE_TYPE",
      evidence: { priceType: "UNCLASSIFIED_POST_TRADE", origin: "CALLER_SUPPLIED_UNVERIFIED", sourceApproval: "NOT_APPROVED" },
      transport: { requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/), responseFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        transportFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    if (result.status !== "EVIDENCE") throw new Error(result.reason);
    expect(result.transport.responseFingerprint).toBe(result.evidence.parser.payloadFingerprint);
    expect(result.transport.retrievedAt).toBe(new Date(Date.parse(result.transport.receivedAt) + 1).toISOString());
    expect(result.evidence.selectedTrade.tradeId).toBe("trade-001");
  });

  it.each([
    ["redirect", { statusCode: 302 }, "HTTP_REDIRECT"],
    ["rate-limit response", { statusCode: 429 }, "HTTP_STATUS"],
    ["non-JSON content type", { headers: { "content-type": "text/html" } }, "CONTENT_TYPE_INVALID"],
    ["compressed content", { headers: { "content-type": "application/json", "content-encoding": "gzip" } }, "CONTENT_ENCODING_INVALID"],
    ["invalid UTF-8", { body: Uint8Array.from([0xff, 0xfe]) }, "UTF8_INVALID"],
    ["invalid JSON", { body: Buffer.from("{", "utf8") }, "JSON_INVALID"],
    ["oversized body", { body: Buffer.alloc(KRAKEN_POST_TRADE_MAX_BODY_BYTES + 1) }, "RESPONSE_TOO_LARGE"],
    ["wrong product identity", { body: Buffer.from(raw(trade({ symbol: "BTC/USD", base_asset: "BTC" })), "utf8") }, "PROVIDER_RESPONSE_INVALID"],
  ] as const)("rejects %s without retry or fallback", async (_label, responseOptions, expectedReason) => {
    let calls = 0;
    const transport = testTransport(async () => { calls += 1; return reply(responseOptions); });
    const result = await fetchNext(transport);
    expect(result).toEqual({ status: "BLOCKED", reason: expectedReason });
    expect(calls).toBe(1);
  });

  it("fails closed on a missing explicit instrument/source binding before calling the requester", async () => {
    let calls = 0;
    const transport = testTransport(async () => { calls += 1; return reply(); }, []);
    const result = await fetchNext(transport);
    expect(result).toEqual({ status: "BLOCKED", reason: "INSTRUMENT_NOT_BOUND" });
    expect(calls).toBe(0);
  });

  it("aborts on total timeout and releases the active request resource", async () => {
    vi.useFakeTimers();
    let aborts = 0;
    const transport = testTransport((_request, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborts += 1; reject(new Error("aborted")); }, { once: true });
    }));
    advance();
    const pending = transport.fetchEvidence(input);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toEqual({ status: "BLOCKED", reason: "TIMEOUT" });
    expect(aborts).toBe(1);
  });

  it("honors caller abort immediately and clears the global in-flight marker", async () => {
    const controller = new AbortController();
    let calls = 0;
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const transport = testTransport((request, signal) => {
      calls += 1;
      if (calls === 1) return new Promise((_resolve, reject) => {
        markStarted();
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
      return Promise.resolve(reply());
    });
    advance();
    const pending = transport.fetchEvidence({ ...input, signal: controller.signal });
    await started;
    expect(await transport.fetchEvidence(input)).toEqual({ status: "BLOCKED", reason: "REQUEST_IN_FLIGHT" });
    expect(calls).toBe(1);
    controller.abort();
    expect(await pending).toEqual({ status: "BLOCKED", reason: "ABORTED" });
    advance();
    expect((await transport.fetchEvidence(input)).status).toBe("EVIDENCE");
    expect(calls).toBe(2);
  });

  it("limits one in-flight call and one request per second, without queuing or retries", async () => {
    let calls = 0;
    const transport = testTransport(async () => { calls += 1; return reply(); });
    advance();
    expect((await transport.fetchEvidence(input)).status).toBe("EVIDENCE");
    expect(await transport.fetchEvidence(input)).toEqual({ status: "BLOCKED", reason: "RATE_LIMITED" });
    advance(1_000);
    expect((await transport.fetchEvidence(input)).status).toBe("EVIDENCE");
    expect(calls).toBe(2);
  });
});
