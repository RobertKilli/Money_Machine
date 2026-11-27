import assert from "node:assert/strict";
import type { request as NodeHttpsRequest } from "node:https";
import {
  readKrakenPostTradeEvidencePackage,
  serializeKrakenPostTradeEvidencePackage,
  verifyKrakenPostTradeEvidencePackage,
} from "../src/application/paper-trading/external-paper-price-evidence-package";
import { KRAKEN_POST_TRADE_PARSER_VERSION } from "../src/application/paper-trading/kraken-post-trade-parser";
import {
  createKrakenPostTradeTransport,
  type KrakenPostTradeBinding,
  type KrakenPostTradeHttpResponse,
  type KrakenPostTradeRequester,
  type KrakenPostTradeTransportResult,
} from "../src/infrastructure/paper-trading/kraken-post-trade-transport";

const binding = Object.freeze({
  instrument: Object.freeze({
    instrumentId: "paper.external.eth-usd-kraken",
    baseAssetId: "ETH",
    quoteCurrency: "USD",
    venueId: "PGSL",
    venueProductId: "ETH/USD",
  }),
  source: Object.freeze({
    providerId: "kraken-spot",
    datasetVersion: "post-trade/v1",
    adapterVersion: KRAKEN_POST_TRADE_PARSER_VERSION,
  }),
}) satisfies KrakenPostTradeBinding;

const trade = (overrides: Record<string, unknown> = {}) => ({
  trade_id: "offline-001",
  symbol: "ETH/USD",
  base_asset: "ETH",
  quote_asset: "USD",
  trade_venue: "PGSL",
  publication_venue: "PGSL",
  price: "2043.123456789000",
  quantity: "0.01250000",
  trade_ts: "2026-11-26T12:34:56.123456789Z",
  publication_ts: "2026-11-26T12:34:56.123999999Z",
  ...overrides,
});

const responseBody = (item = trade()) => Buffer.from(JSON.stringify({
  error: [],
  result: { count: 1, last_ts: item.trade_ts, trades: [item] },
}), "utf8");

const syntheticResponse = (body = responseBody()): KrakenPostTradeHttpResponse => Object.freeze({
  statusCode: 200,
  headers: Object.freeze({ "content-type": "application/json; charset=utf-8", "content-encoding": "identity" }),
  body,
});

let clockMs = Date.parse("2026-11-26T12:34:57.000Z");
let syntheticRequestCount = 0;
let nodeHttpsCallCount = 0;

const syntheticAuthorizer = () => Object.freeze({ sourceApproval: "APPROVED" as const, runtimePermission: "AUTHORIZED" as const });
const neverNodeHttpsRequest = (() => {
  nodeHttpsCallCount += 1;
  throw new Error("Unexpected node:https.request call in offline acceptance");
}) as typeof NodeHttpsRequest;

function makeTransport(requester: KrakenPostTradeRequester) {
  return createKrakenPostTradeTransport({
    bindings: [binding],
    authorize: syntheticAuthorizer,
    requester,
    nodeHttpsRequest: neverNodeHttpsRequest,
    now: () => clockMs,
  });
}

function successfulRequester(body = responseBody()): KrakenPostTradeRequester {
  return async () => {
    syntheticRequestCount += 1;
    return syntheticResponse(body);
  };
}

function assertBlocked(result: KrakenPostTradeTransportResult, reason: string): void {
  assert.deepEqual(result, { status: "BLOCKED", reason });
}

async function main(): Promise<void> {
  // This clock is synthetic and advances beyond the process-local rate limit between examples.
  const transport = makeTransport(successfulRequester());
  const accepted = await transport.fetchEvidence({ ...binding, tradeId: "offline-001" });
  if (accepted.status !== "EVIDENCE") throw new Error(`Expected EVIDENCE, received ${JSON.stringify(accepted)}`);

  const serialized = serializeKrakenPostTradeEvidencePackage(accepted.evidence);
  const replay = readKrakenPostTradeEvidencePackage(serialized, accepted.evidence.fingerprint);
  if (replay.status !== "VALID") throw new Error(`Expected valid replay, received ${JSON.stringify(replay)}`);

  const tampered = structuredClone(replay.evidence) as unknown as Record<string, unknown> & {
    selectedTrade: { price: { original: string } };
  };
  tampered.selectedTrade.price.original = "1.00";
  const tamperResult = verifyKrakenPostTradeEvidencePackage(tampered, replay.evidence.fingerprint);
  assert.deepEqual(tamperResult, { status: "INVALID", reason: "FINGERPRINT_MISMATCH" }, "changed price must fail fingerprint verification");

  clockMs += 1_001;
  const wrongIdentity = await makeTransport(successfulRequester(responseBody(trade({ symbol: "ETH/EUR", quote_asset: "EUR" })))).fetchEvidence({
    ...binding,
    tradeId: "offline-001",
  });
  assertBlocked(wrongIdentity, "PROVIDER_RESPONSE_INVALID");

  clockMs += 1_001;
  const timeoutRequester: KrakenPostTradeRequester = (_request, signal) => new Promise((_resolve, reject) => {
    syntheticRequestCount += 1;
    signal.addEventListener("abort", () => reject(new Error("synthetic timeout observed")), { once: true });
  });
  const timedOut = await makeTransport(timeoutRequester).fetchEvidence({ ...binding, tradeId: "offline-001" });
  assertBlocked(timedOut, "TIMEOUT");

  clockMs += 1_001;
  const callerAbort = new AbortController();
  const abortRequester: KrakenPostTradeRequester = (_request, signal) => new Promise((_resolve, reject) => {
    syntheticRequestCount += 1;
    signal.addEventListener("abort", () => reject(new Error("synthetic abort observed")), { once: true });
    setTimeout(() => callerAbort.abort(), 0);
  });
  const aborted = await makeTransport(abortRequester).fetchEvidence({
    ...binding,
    tradeId: "offline-001",
    signal: callerAbort.signal,
  });
  assertBlocked(aborted, "ABORTED");

  assert.equal(nodeHttpsCallCount, 0, "offline acceptance must never call node:https.request");
  assert.equal(syntheticRequestCount, 4, "all four transport scenarios must use only the synthetic requester");

  const selected = replay.evidence.selectedTrade;
  const report = {
    result: "PASS",
    executionGate: "SYNTHETIC_TEST_ONLY",
    scenarios: {
      validResponseToVerifiedReplay: "PASS",
      manipulatedEvidence: "BLOCKED_FINGERPRINT_MISMATCH",
      wrongIdentity: "BLOCKED_PROVIDER_RESPONSE_INVALID",
      timeout: "BLOCKED_TIMEOUT",
      callerAbort: "BLOCKED_ABORTED",
      realNetworkCalls: nodeHttpsCallCount,
    },
    evidence: {
      parsing: "VALID",
      contentIntegrity: "VERIFIED_REPLAY; MUTATION REJECTED",
      sourceOrigin: replay.evidence.origin,
      sourceApproval: replay.evidence.sourceApproval,
      decisionReadiness: replay.evidence.decisionReadiness,
      priceType: replay.evidence.priceType,
      tradeId: selected.tradeId,
      exactPrice: selected.price.original,
      exactPriceCoefficient: selected.price.coefficient,
      priceScale: selected.price.scale,
      timestamps: selected.timestamps,
      evidenceFingerprint: replay.evidence.fingerprint,
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Offline Kraken PAPER acceptance failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
