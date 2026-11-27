import "server-only";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { type TLSSocket } from "node:tls";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";
import {
  createKrakenPostTradeEvidencePackage,
  type EvidencePackageResult,
  type KrakenPostTradeEvidencePackage,
} from "@/application/paper-trading/external-paper-price-evidence-package";
import { KRAKEN_POST_TRADE_PARSER_VERSION, parseKrakenPostTradeResponse } from "@/application/paper-trading/kraken-post-trade-parser";
import type { ExternalPaperInstrument, PaperPriceSource } from "@/application/paper-trading/standing-paper-market-price";

export const KRAKEN_POST_TRADE_TRANSPORT_VERSION = "kraken-post-trade-transport/v1" as const;
export const KRAKEN_POST_TRADE_MAX_BODY_BYTES = 64 * 1024;
export const KRAKEN_POST_TRADE_CONNECT_TIMEOUT_MS = 2_000;
export const KRAKEN_POST_TRADE_TOTAL_TIMEOUT_MS = 5_000;
export const KRAKEN_POST_TRADE_MIN_INTERVAL_MS = 1_000;
const KRAKEN_HOST = "api.kraken.com";
const KRAKEN_PATH = "/0/public/PostTrade";
const KRAKEN_COUNT = "1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?$/i;

export type KrakenPostTradeBinding = Readonly<{
  instrument: Readonly<ExternalPaperInstrument>;
  source: Readonly<PaperPriceSource>;
}>;

export type KrakenPostTradeAccess = Readonly<{
  sourceApproval: "APPROVED" | "NOT_APPROVED";
  runtimePermission: "AUTHORIZED" | "NOT_AUTHORIZED";
}>;

export type KrakenPostTradeRequestScope = Readonly<{
  transportVersion: typeof KRAKEN_POST_TRADE_TRANSPORT_VERSION;
  instrument: Readonly<ExternalPaperInstrument>;
  source: Readonly<PaperPriceSource>;
  method: "GET";
  hostname: typeof KRAKEN_HOST;
  path: typeof KRAKEN_PATH;
  symbol: string;
  count: typeof KRAKEN_COUNT;
}>;

export type KrakenPostTradeHttpResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string | undefined>>;
  body: Uint8Array;
}>;

export type KrakenPostTradeHttpRequest = Readonly<{
  protocol: "https:";
  method: "GET";
  hostname: typeof KRAKEN_HOST;
  path: string;
  rejectUnauthorized: true;
  connectTimeoutMs: typeof KRAKEN_POST_TRADE_CONNECT_TIMEOUT_MS;
  totalTimeoutMs: typeof KRAKEN_POST_TRADE_TOTAL_TIMEOUT_MS;
  maxResponseBytes: typeof KRAKEN_POST_TRADE_MAX_BODY_BYTES;
}>;

export type KrakenPostTradeTransportFailureCode =
  | "INPUT_INVALID" | "SOURCE_NOT_APPROVED" | "RUNTIME_NOT_PERMITTED" | "INSTRUMENT_NOT_BOUND"
  | "REQUEST_IN_FLIGHT" | "RATE_LIMITED" | "ABORTED" | "CONNECT_TIMEOUT" | "TIMEOUT"
  | "NETWORK_ERROR" | "HTTP_REDIRECT" | "HTTP_STATUS" | "CONTENT_TYPE_INVALID"
  | "CONTENT_ENCODING_INVALID" | "RESPONSE_TOO_LARGE" | "UTF8_INVALID" | "JSON_INVALID"
  | "PROVIDER_RESPONSE_INVALID" | "EVIDENCE_INVALID";

export type KrakenPostTradeTransportResult =
  | { readonly status: "BLOCKED" | "INVALID"; readonly reason: KrakenPostTradeTransportFailureCode }
  | { readonly status: "EVIDENCE"; readonly sourceApproval: "NOT_APPROVED"; readonly decisionReadiness: "BLOCKED_UNCLASSIFIED_PRICE_TYPE";
      readonly evidence: KrakenPostTradeEvidencePackage; readonly transport: Readonly<{
        requestFingerprint: string; responseFingerprint: string; transportFingerprint: string;
        receivedAt: string; retrievedAt: string;
      }> };

export type KrakenPostTradeRequester = (request: KrakenPostTradeHttpRequest, signal: AbortSignal) => Promise<KrakenPostTradeHttpResponse>;
export type KrakenPostTradeAuthorizer = (scope: KrakenPostTradeRequestScope) => Promise<KrakenPostTradeAccess> | KrakenPostTradeAccess;

type Dependencies = Readonly<{
  /** Explicit exact instrument/source allowlist. Production remains empty until separately qualified. */
  bindings?: readonly KrakenPostTradeBinding[];
  /** Test injection only; the default calls Node HTTPS after the access and binding gates. */
  requester?: KrakenPostTradeRequester;
  /** Low-level Node HTTPS injection for deterministic transport tests. */
  nodeHttpsRequest?: typeof httpsRequest;
  /** Default denies both independently required operational gates. */
  authorize?: KrakenPostTradeAuthorizer;
  /** Receiving-side wall-clock source. The default is captured inside this transport. */
  now?: () => number;
}>;

const activeRequests = new Set<AbortController>();
let lastRequestStartedAt = Number.NEGATIVE_INFINITY;

function failure(reason: KrakenPostTradeTransportFailureCode, status: "BLOCKED" | "INVALID" = "BLOCKED"): KrakenPostTradeTransportResult {
  return Object.freeze({ status, reason });
}

function safeIdentifier(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function snapshotInstrument(value: ExternalPaperInstrument): Readonly<ExternalPaperInstrument> {
  return Object.freeze({
    instrumentId: value.instrumentId, baseAssetId: value.baseAssetId, quoteCurrency: value.quoteCurrency,
    venueId: value.venueId, venueProductId: value.venueProductId,
  });
}

function snapshotSource(value: PaperPriceSource): Readonly<PaperPriceSource> {
  return Object.freeze({ providerId: value.providerId, datasetVersion: value.datasetVersion, adapterVersion: value.adapterVersion });
}

function validBindingShape(instrument: ExternalPaperInstrument, source: PaperPriceSource): boolean {
  return safeIdentifier(instrument.instrumentId) && instrument.instrumentId.startsWith("paper.external.") &&
    safeIdentifier(instrument.baseAssetId) && !instrument.baseAssetId.toLowerCase().startsWith("mm.fixture.") &&
    safeIdentifier(instrument.venueId) && safeIdentifier(instrument.venueProductId) &&
    safeIdentifier(instrument.quoteCurrency) && /^[A-Z]{3}$/.test(instrument.quoteCurrency) &&
    safeIdentifier(source.providerId) && source.providerId === "kraken-spot" &&
    safeIdentifier(source.datasetVersion) && source.datasetVersion === "post-trade/v1" &&
    safeIdentifier(source.adapterVersion) && source.adapterVersion === KRAKEN_POST_TRADE_PARSER_VERSION;
}

function exactBindingMatches(candidate: KrakenPostTradeBinding, instrument: ExternalPaperInstrument, source: PaperPriceSource): boolean {
  return candidate.instrument.instrumentId === instrument.instrumentId && candidate.instrument.baseAssetId === instrument.baseAssetId &&
    candidate.instrument.quoteCurrency === instrument.quoteCurrency && candidate.instrument.venueId === instrument.venueId &&
    candidate.instrument.venueProductId === instrument.venueProductId && candidate.source.providerId === source.providerId &&
    candidate.source.datasetVersion === source.datasetVersion && candidate.source.adapterVersion === source.adapterVersion;
}

function bodyHeader(headers: KrakenPostTradeHttpResponse["headers"], headerName: string): string | undefined {
  const name = Object.keys(headers).find((key) => key.toLowerCase() === headerName);
  return name ? headers[name] : undefined;
}

function responseError(response: KrakenPostTradeHttpResponse): KrakenPostTradeTransportFailureCode | null {
  if (response.statusCode >= 300 && response.statusCode < 400) return "HTTP_REDIRECT";
  if (response.statusCode !== 200) return "HTTP_STATUS";
  const contentType = bodyHeader(response.headers, "content-type");
  if (!contentType || !JSON_CONTENT_TYPE.test(contentType)) return "CONTENT_TYPE_INVALID";
  const contentEncoding = bodyHeader(response.headers, "content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") return "CONTENT_ENCODING_INVALID";
  if (!(response.body instanceof Uint8Array)) return "PROVIDER_RESPONSE_INVALID";
  if (response.body.byteLength > KRAKEN_POST_TRADE_MAX_BODY_BYTES) return "RESPONSE_TOO_LARGE";
  return null;
}

function isoMillis(epochMs: number): string | null {
  if (!Number.isSafeInteger(epochMs) || Math.abs(epochMs) > 8_640_000_000_000_000) return null;
  try { return new Date(epochMs).toISOString(); } catch { return null; }
}

function nodeHttpsRequester(
  requestPlan: KrakenPostTradeHttpRequest,
  signal: AbortSignal,
  makeHttpsRequest: typeof httpsRequest = httpsRequest,
): Promise<KrakenPostTradeHttpResponse> {
  const options: RequestOptions = {
    protocol: "https:", hostname: KRAKEN_HOST, servername: KRAKEN_HOST, port: 443,
    method: "GET", path: requestPlan.path, rejectUnauthorized: true, agent: false,
    headers: { accept: "application/json", "accept-encoding": "identity", connection: "close" }, signal,
  };
  return new Promise((resolve, reject) => {
    let settled = false;
    let size = 0;
    let connectTimedOut = false;
    const chunks: Buffer[] = [];
    const connectTimer: { current?: ReturnType<typeof setTimeout> } = {};
    const clearConnectTimer = () => { if (connectTimer.current !== undefined) clearTimeout(connectTimer.current); };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearConnectTimer();
      reject(error);
    };
    const req = makeHttpsRequest(options, (res) => {
      clearConnectTimer();
      const headers: Record<string, string | undefined> = {
        "content-type": typeof res.headers["content-type"] === "string" ? res.headers["content-type"] : undefined,
        "content-encoding": typeof res.headers["content-encoding"] === "string" ? res.headers["content-encoding"] : undefined,
        "content-length": typeof res.headers["content-length"] === "string" ? res.headers["content-length"] : undefined,
      };
      const declaredSize = headers["content-length"];
      if (declaredSize && /^\d+$/.test(declaredSize) && BigInt(declaredSize) > BigInt(requestPlan.maxResponseBytes)) {
        res.destroy(); req.destroy(new Error("RESPONSE_TOO_LARGE")); fail(new Error("RESPONSE_TOO_LARGE")); return;
      }
      if (res.statusCode !== 200) {
        const statusCode = res.statusCode ?? 0;
        res.destroy();
        if (!settled) { settled = true; resolve(Object.freeze({ statusCode, headers: Object.freeze(headers), body: new Uint8Array() })); }
        return;
      }
      if (headers["content-encoding"] && headers["content-encoding"]!.toLowerCase() !== "identity") {
        res.destroy(); req.destroy(new Error("CONTENT_ENCODING_INVALID")); fail(new Error("CONTENT_ENCODING_INVALID")); return;
      }
      res.on("data", (chunk: Buffer | Uint8Array) => {
        if (settled) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.byteLength;
        if (size > requestPlan.maxResponseBytes) {
          res.destroy(); req.destroy(new Error("RESPONSE_TOO_LARGE")); fail(new Error("RESPONSE_TOO_LARGE")); return;
        }
        chunks.push(bytes);
      });
      res.on("aborted", () => fail(new Error("NETWORK_ERROR")));
      res.on("error", () => fail(new Error("NETWORK_ERROR")));
      res.on("end", () => {
        if (settled) return;
        if (!res.complete) { fail(new Error("NETWORK_ERROR")); return; }
        settled = true;
        resolve(Object.freeze({ statusCode: 200, headers: Object.freeze(headers), body: Buffer.concat(chunks, size) }));
      });
    });
    connectTimer.current = setTimeout(() => {
      connectTimedOut = true;
      req.destroy(new Error("CONNECT_TIMEOUT"));
    }, requestPlan.connectTimeoutMs);
    req.on("socket", (socket) => {
      const tlsSocket = socket as TLSSocket;
      if (tlsSocket.authorized) clearConnectTimer();
      else tlsSocket.once("secureConnect", clearConnectTimer);
    });
    req.on("error", (error: Error) => fail(connectTimedOut ? new Error("CONNECT_TIMEOUT") : error));
    req.end();
  });
}

function mapNetworkFailure(error: unknown, signal: AbortSignal): KrakenPostTradeTransportFailureCode {
  if (signal.aborted) return "ABORTED";
  if (error instanceof Error && error.message === "CONNECT_TIMEOUT") return "CONNECT_TIMEOUT";
  if (error instanceof Error && error.message === "RESPONSE_TOO_LARGE") return "RESPONSE_TOO_LARGE";
  if (error instanceof Error && error.message === "CONTENT_ENCODING_INVALID") return "CONTENT_ENCODING_INVALID";
  return "NETWORK_ERROR";
}

const noOperationalAccess: KrakenPostTradeAuthorizer = () => Object.freeze({ sourceApproval: "NOT_APPROVED", runtimePermission: "NOT_AUTHORIZED" });

/**
 * Server-only bounded transport. Its default access gate denies source use and
 * runtime execution. Synthetic tests inject a requester and an explicit test
 * gate; no worker or product entrypoint constructs an enabled instance.
 */
export function createKrakenPostTradeTransport(dependencies: Dependencies = {}) {
  const bindings = Object.freeze((dependencies.bindings ?? []).map((binding) => Object.freeze({
    instrument: snapshotInstrument(binding.instrument), source: snapshotSource(binding.source),
  })));
  const nodeRequest = dependencies.nodeHttpsRequest ?? httpsRequest;
  const requester = dependencies.requester ?? ((request: KrakenPostTradeHttpRequest, signal: AbortSignal) => nodeHttpsRequester(request, signal, nodeRequest));
  const authorize = dependencies.authorize ?? noOperationalAccess;
  const now = dependencies.now ?? Date.now;

  async function fetchEvidence(input: {
    readonly instrument: ExternalPaperInstrument;
    readonly source: PaperPriceSource;
    /** Explicit source record selected by ID. This does not mean latest or LAST_TRADE. */
    readonly tradeId: string;
    readonly signal?: AbortSignal;
  }): Promise<KrakenPostTradeTransportResult> {
    // Snapshot all caller-controlled data before the first await.
    if (!input) return failure("INPUT_INVALID", "INVALID");
    const instrumentInput = input.instrument;
    const sourceInput = input.source;
    const tradeId = input.tradeId;
    const signal = input.signal;
    if (!instrumentInput || !sourceInput) return failure("INPUT_INVALID", "INVALID");
    const instrument = snapshotInstrument(instrumentInput);
    const source = snapshotSource(sourceInput);
    if (typeof tradeId !== "string" || !safeIdentifier(tradeId) || !validBindingShape(instrument, source) ||
      (signal !== undefined && !(signal instanceof AbortSignal))) {
      return failure("INPUT_INVALID", "INVALID");
    }
    if (signal?.aborted) return failure("ABORTED");
    const symbolParts = instrument.venueProductId.split("/");
    if (symbolParts.length !== 2 || symbolParts[0] !== instrument.baseAssetId || symbolParts[1] !== instrument.quoteCurrency) return failure("INPUT_INVALID", "INVALID");
    const scope: KrakenPostTradeRequestScope = Object.freeze({
      transportVersion: KRAKEN_POST_TRADE_TRANSPORT_VERSION,
      instrument, source,
      method: "GET", hostname: KRAKEN_HOST, path: KRAKEN_PATH,
      symbol: instrument.venueProductId, count: KRAKEN_COUNT,
    });
    let access: KrakenPostTradeAccess;
    try { access = await authorize(scope); }
    catch { access = Object.freeze({ sourceApproval: "NOT_APPROVED", runtimePermission: "NOT_AUTHORIZED" }); }
    if (access.sourceApproval !== "APPROVED") return failure("SOURCE_NOT_APPROVED");
    if (access.runtimePermission !== "AUTHORIZED") return failure("RUNTIME_NOT_PERMITTED");
    if (!bindings.some((binding) => exactBindingMatches(binding, instrument, source))) return failure("INSTRUMENT_NOT_BOUND");
    if (signal?.aborted) return failure("ABORTED");
    if (activeRequests.size > 0) return failure("REQUEST_IN_FLIGHT");
    const startedAt = now();
    if (!Number.isFinite(startedAt) || startedAt - lastRequestStartedAt < KRAKEN_POST_TRADE_MIN_INTERVAL_MS) return failure("RATE_LIMITED");

    const controller = new AbortController();
    activeRequests.add(controller);
    lastRequestStartedAt = startedAt;
    let didTimeout = false;
    let didAbort = false;
    let totalTimer: ReturnType<typeof setTimeout> | undefined;
    const abortFromCaller = () => { didAbort = true; controller.abort(); };
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = new Promise<never>((_, reject) => {
      totalTimer = setTimeout(() => { didTimeout = true; reject(new Error("TOTAL_TIMEOUT")); controller.abort(); }, KRAKEN_POST_TRADE_TOTAL_TIMEOUT_MS);
    });
    let abortListener: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      abortListener = () => reject(new Error(didTimeout ? "TOTAL_TIMEOUT" : "ABORTED"));
      controller.signal.addEventListener("abort", abortListener, { once: true });
    });
    const requestPlan: KrakenPostTradeHttpRequest = Object.freeze({
      protocol: "https:", method: "GET", hostname: KRAKEN_HOST,
      path: `${KRAKEN_PATH}?symbol=${encodeURIComponent(scope.symbol)}&count=${KRAKEN_COUNT}`,
      rejectUnauthorized: true,
      connectTimeoutMs: KRAKEN_POST_TRADE_CONNECT_TIMEOUT_MS,
      totalTimeoutMs: KRAKEN_POST_TRADE_TOTAL_TIMEOUT_MS,
      maxResponseBytes: KRAKEN_POST_TRADE_MAX_BODY_BYTES,
    });
    const requestFingerprint = canonicalSha256(scope);
    try {
      const response = await Promise.race([requester(requestPlan, controller.signal), timeout, aborted]);
      if (controller.signal.aborted) return failure(didTimeout ? "TIMEOUT" : "ABORTED");
      const responseFailure = responseError(response);
      if (responseFailure) return failure(responseFailure);
      let rawResponse: string;
      try { rawResponse = new TextDecoder("utf-8", { fatal: true }).decode(response.body); }
      catch { return failure("UTF8_INVALID"); }

      // Capture receiver time at response completion; add one millisecond to conservatively bound a millisecond-only clock.
      const receivedAtMs = now();
      const receivedAt = isoMillis(receivedAtMs);
      const retrievedAt = isoMillis(receivedAtMs + 1);
      if (!receivedAt || !retrievedAt) return failure("NETWORK_ERROR");
      const parsed = parseKrakenPostTradeResponse({ rawResponse, retrievedAt, expected: {
        symbol: instrument.venueProductId, baseAsset: instrument.baseAssetId,
        quoteAsset: instrument.quoteCurrency, tradeVenueMic: instrument.venueId,
        publicationVenueMic: instrument.venueId,
      } });
      if (parsed.status !== "VALID") return failure(parsed.reason === "JSON_INVALID" ? "JSON_INVALID" : "PROVIDER_RESPONSE_INVALID");
      const packaged: EvidencePackageResult = createKrakenPostTradeEvidencePackage({
        parsed, instrument, source, tradeId,
      });
      if (packaged.status !== "VALID") return failure(packaged.reason === "IDENTITY_MISMATCH" ? "PROVIDER_RESPONSE_INVALID" : "EVIDENCE_INVALID");
      const transport = Object.freeze({
        requestFingerprint, responseFingerprint: parsed.payloadFingerprint,
        receivedAt, retrievedAt,
        transportFingerprint: canonicalSha256({ requestFingerprint, responseFingerprint: parsed.payloadFingerprint, receivedAt, retrievedAt, evidenceFingerprint: packaged.evidence.fingerprint }),
      });
      return Object.freeze({ status: "EVIDENCE", sourceApproval: "NOT_APPROVED", decisionReadiness: "BLOCKED_UNCLASSIFIED_PRICE_TYPE", evidence: packaged.evidence, transport });
    } catch (error) {
      if (didTimeout) return failure("TIMEOUT");
      if (didAbort || signal?.aborted) return failure("ABORTED");
      return failure(mapNetworkFailure(error, controller.signal));
    } finally {
      if (totalTimer !== undefined) clearTimeout(totalTimer);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
      signal?.removeEventListener("abort", abortFromCaller);
      controller.abort();
      activeRequests.delete(controller);
    }
  }

  return Object.freeze({ fetchEvidence });
}

const defaultTransport = createKrakenPostTradeTransport();

/** Ordinary execution stays blocked until both operational gates and a mapped instrument are configured. */
export function fetchKrakenPostTradeEvidence(input: {
  readonly instrument: ExternalPaperInstrument;
  readonly source: PaperPriceSource;
  readonly tradeId: string;
  readonly signal?: AbortSignal;
}): Promise<KrakenPostTradeTransportResult> {
  return defaultTransport.fetchEvidence(input);
}
