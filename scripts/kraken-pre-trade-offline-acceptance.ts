import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { Socket } from "node:net";
import tls from "node:tls";
import { syncBuiltinESMExports } from "node:module";
import { KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES, parseKrakenPreTradeResponse } from "../src/application/paper-trading/kraken-pre-trade-parser";
import {
  createKrakenPreTradeEvidencePackage, readKrakenPreTradeEvidencePackage,
  serializeKrakenPreTradeEvidencePackage, verifyKrakenPreTradeEvidencePackage,
} from "../src/application/paper-trading/kraken-pre-trade-evidence-package";

// Synthetic assertions only: these do not qualify a real pair or venue.
const instrument = {
  instrumentId: "paper.external.eth-usd-kraken", baseAssetId: "ETH", quoteCurrency: "USD",
  venueId: "PGSL", venueProductId: "ETH/USD",
} as const;
const source = { providerId: "kraken", datasetVersion: "pre-trade/synthetic-demo-v1", adapterVersion: "offline-parser/v1" };
const retrievedAt = "2026-11-27T12:34:56.124000001Z";
const level = (side: "BUY" | "SELL", price: string) => ({
  side, price, qty: "0.01250000", count: 2,
  submission_ts: "2026-11-27T12:34:56.123456789Z", publication_ts: "2026-11-27T12:34:56.123999999Z",
});
const payload = () => ({ error: [] as string[], result: {
  symbol: "ETH/USD", base_asset: "ETH", quote_asset: "USD", venue: "PGSL", system: "CLOB",
  base_notation: "UNIT", quote_notation: "MONE",
  // Intentionally unsorted bids: the demo must not pick or sort a best quote.
  bids: [level("BUY", "2042.000"), level("BUY", "2043.123456789000")],
  asks: [level("SELL", "2044.000")],
} });
const create = (rawResponse: string) => createKrakenPreTradeEvidencePackage({ rawResponse, retrievedAt, instrument, source });

function runScenarios() {
  const rawResponse = JSON.stringify(payload());
  const parsed = parseKrakenPreTradeResponse({ rawResponse, retrievedAt, expected: {
    symbol: instrument.venueProductId, baseAsset: instrument.baseAssetId,
    quoteAsset: instrument.quoteCurrency, venueMic: instrument.venueId,
  } });
  assert.equal(parsed.status, "VALID");
  const created = create(rawResponse);
  if (created.status !== "VALID") throw new Error("CREATION_FAILED");
  assert.equal(created.evidence.parser.payloadFingerprint, parsed.status === "VALID" ? parsed.payloadFingerprint : null);
  const serialized = serializeKrakenPreTradeEvidencePackage(created.evidence);
  const replay = readKrakenPreTradeEvidencePackage(serialized, created.evidence.fingerprint);
  assert.deepEqual(replay, created);
  if (replay.status !== "VALID") throw new Error("REPLAY_FAILED");
  assert.equal(serializeKrakenPreTradeEvidencePackage(replay.evidence), serialized);
  assert.deepEqual(replay.evidence.book.bids.map(item => item.price.original), ["2042.000", "2043.123456789000"]);

  const tampered = structuredClone(replay.evidence);
  Reflect.set(tampered.book.bids[0].price, "coefficient", "1");
  const tamperResult = verifyKrakenPreTradeEvidencePackage(tampered, created.evidence.fingerprint);
  assert.deepEqual(tamperResult, { status: "INVALID", reason: "PACKAGE_INVALID" });
  const wrongFingerprint = readKrakenPreTradeEvidencePackage(serialized, "0".repeat(64));
  assert.deepEqual(wrongFingerprint, { status: "INVALID", reason: "FINGERPRINT_MISMATCH" });

  const wrongIdentity = payload();
  wrongIdentity.result.quote_asset = "NOK";
  assert.deepEqual(create(JSON.stringify(wrongIdentity)), { status: "INVALID", reason: "PARSE_INVALID" });
  const reversedTime = payload();
  reversedTime.result.bids[0].publication_ts = "2026-11-27T12:34:56.123456788Z";
  assert.deepEqual(create(JSON.stringify(reversedTime)), { status: "INVALID", reason: "PARSE_INVALID" });
  const wrongSide = payload();
  wrongSide.result.asks[0].side = "BUY";
  assert.deepEqual(create(JSON.stringify(wrongSide)), { status: "INVALID", reason: "PARSE_INVALID" });
  const providerError = payload();
  providerError.error.push("SYNTHETIC_PROVIDER_ERROR");
  assert.deepEqual(create(JSON.stringify(providerError)), { status: "INVALID", reason: "PARSE_INVALID" });
  assert.deepEqual(create("{ invalid JSON"), { status: "INVALID", reason: "PARSE_INVALID" });
  assert.deepEqual(create(" ".repeat(KRAKEN_PRE_TRADE_MAX_RESPONSE_BYTES + 1)), { status: "INVALID", reason: "PACKAGE_TOO_LARGE" });

  const empty = payload();
  empty.result.bids = [];
  empty.result.asks = [];
  const emptyCreated = create(JSON.stringify(empty));
  if (emptyCreated.status !== "VALID") throw new Error("EMPTY_BOOK_EVIDENCE_FAILED");
  assert.deepEqual(readKrakenPreTradeEvidencePackage(serializeKrakenPreTradeEvidencePackage(emptyCreated.evidence), emptyCreated.evidence.fingerprint), emptyCreated);
  assert.equal(emptyCreated.evidence.decisionReadiness, "BLOCKED_UNVERIFIED_QUOTE_SEMANTICS");

  const evidence = replay.evidence;
  return {
    result: "PASS", executionGate: "SYNTHETIC_TEST_ONLY",
    scope: "OFFLINE_PARSER_AND_EVIDENCE_ONLY; NO_TRANSPORT_OR_WORKER",
    scenarios: {
      validResponseToVerifiedReplay: "PASS", stableSerialization: "PASS", responseOrderPreserved: "PASS",
      manipulatedProjection: "BLOCKED_PACKAGE_INVALID", wrongExpectedFingerprint: "BLOCKED_FINGERPRINT_MISMATCH",
      wrongIdentity: "BLOCKED_PARSE_INVALID", reversedTimestamp: "BLOCKED_PARSE_INVALID",
      wrongSide: "BLOCKED_PARSE_INVALID", providerError: "BLOCKED_PARSE_INVALID",
      malformedJson: "BLOCKED_PARSE_INVALID", oversizedRawResponse: "BLOCKED_PACKAGE_TOO_LARGE",
      emptyBook: "VALID_EVIDENCE_WITHOUT_DECISION_PRICE",
    },
    evidence: {
      contractVersion: evidence.contractVersion, sourceOrigin: evidence.origin, sourceApproval: evidence.sourceApproval,
      snapshotSemantics: evidence.snapshotSemantics, decisionReadiness: evidence.decisionReadiness,
      instrument: evidence.instrument, source: evidence.source, parser: evidence.parser,
      timestamps: evidence.timestamps, book: evidence.book, evidenceFingerprint: evidence.fingerprint,
    },
  };
}

// Guard the synchronous scenario window only. This is a regression canary for
// these Node APIs, not an OS sandbox or evidence about any real data service.
function runOffline() {
  let attempts = 0;
  const deny = () => { attempts += 1; throw new Error("OFFLINE_NETWORK_ATTEMPT"); };
  const saved = { httpRequest: http.request, httpGet: http.get, httpsRequest: https.request, httpsGet: https.get,
    socketConnect: Socket.prototype.connect, tlsConnect: tls.connect, fetch: globalThis.fetch };
  try {
    http.request = deny;
    http.get = deny;
    https.request = deny;
    https.get = deny;
    Socket.prototype.connect = deny;
    tls.connect = deny;
    globalThis.fetch = deny;
    syncBuiltinESMExports();
    const report = runScenarios();
    assert.equal(attempts, 0);
    return { ...report, networkGuard: "HTTP_HTTPS_FETCH_TCP_TLS; SCENARIO_WINDOW_ONLY", networkRequests: attempts };
  } finally {
    http.request = saved.httpRequest;
    http.get = saved.httpGet;
    https.request = saved.httpsRequest;
    https.get = saved.httpsGet;
    Socket.prototype.connect = saved.socketConnect;
    tls.connect = saved.tlsConnect;
    globalThis.fetch = saved.fetch;
    syncBuiltinESMExports();
  }
}

try {
  process.stdout.write(`${JSON.stringify(runOffline(), null, 2)}\n`);
} catch {
  // Do not print arbitrary assertion payloads, caller values or raw responses.
  process.stderr.write("KRAKEN_PRE_TRADE_OFFLINE_ACCEPTANCE_FAILED\n");
  process.exitCode = 1;
}
