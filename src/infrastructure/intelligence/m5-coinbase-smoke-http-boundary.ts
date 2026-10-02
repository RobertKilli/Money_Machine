import "server-only";
import { types } from "node:util";
import { isM5PublicProviderIpv4 } from "./m5-node-provider-http-transport";
import { COINBASE_SMOKE_LIMITS, COINBASE_SMOKE_SCOPE, COINBASE_SMOKE_STATUS, isRuntimeCoinbaseSmokePlan, smokeArray, smokeByteSnapshot, smokeFailure, smokeFailureCode, smokeError, smokeFreeze, smokeRecord, smokeTime, validateCoinbaseSmokeRequest, type CoinbaseSmokeRequest } from "@/application/intelligence/m5-coinbase-smoke-contract";
import { parseCoinbaseSmokeResponse } from "@/application/intelligence/m5-coinbase-smoke-parser";

export type CoinbaseSmokeHttpPorts = Readonly<{
  acquireLease(scope: Readonly<{ provider: "coinbase-exchange"; hostname: "api.exchange.coinbase.com"; profile: string }>, signal: AbortSignal): Promise<Readonly<{ release(): void }> | null>;
  resolveIpv4(hostname: string, signal: AbortSignal): Promise<readonly string[]>;
  /** Infrastructure must use pinnedAddress for lookup, retain TLS servername, and never follow redirects. */
  open(input: Readonly<{ request: CoinbaseSmokeRequest; pinnedAddress: string; tlsServername: string; headers: Readonly<{ accept: "application/json"; "accept-encoding": "identity" }>; redirectPolicy: "ERROR"; signal: AbortSignal }>): Promise<Readonly<{ status: number; contentType: string; contentEncoding: string | null; body: AsyncIterable<Uint8Array>; cancel(): void }>>;
  currentTime(): string;
}>;
const SAFE_FAILURES = new Set(["TIMEOUT", "CANCELLED", "RATE_LEASE_DENIED", "DNS_REJECTED", "REDIRECT_REJECTED", "HTTP_REJECTED", "CONTENT_TYPE_REJECTED", "CONTENT_ENCODING_REJECTED", "RESPONSE_TOO_LARGE", "STREAM_INVALID", "TIME_INVALID", "RECEIPT_INVALID", "JSON_INVALID", "UTF8_INVALID", "BODY_INVALID", "SHAPE_INVALID", "DECIMAL_INVALID", "PRODUCT_IDENTITY_MISMATCH", "PRODUCT_INVALID", "CANDLE_INVALID", "PROVIDER_CANDLE_LIMIT_EXCEEDED", "CANDLE_SELECTION_BUDGET_EXCEEDED", "CANDLE_TIMESTAMP_INVALID", "CANDLE_ORDER_INVALID", "CANDLE_OHLC_INVALID"]);
/** No Node HTTP or DNS wiring is installed by this slice. Ports are exercised with fakes only. */
export async function requestCoinbaseSmokeObservation(input: unknown, ports: CoinbaseSmokeHttpPorts) {
  // Reject all caller headers, credentials and extra transport options before any port call.
  const root = smokeRecord(input, ["request", "signal"], ["request"]);
  const request = validateCoinbaseSmokeRequest(root.request);
  const dependencies = smokeRecord(ports, ["acquireLease", "resolveIpv4", "open", "currentTime"]);
  if (Object.values(dependencies).some(value => typeof value !== "function" || types.isProxy(value))) return smokeError("PORTS_INVALID");
  const api = Object.freeze(dependencies) as unknown as CoinbaseSmokeHttpPorts;
  const external = root.signal;
  if (external !== undefined && (!external || typeof external !== "object" || types.isProxy(external) || Object.getPrototypeOf(external) !== AbortSignal.prototype || Reflect.ownKeys(external).some(key => !("value" in Object.getOwnPropertyDescriptor(external, key)!)))) return smokeError("CANCEL_SIGNAL_INVALID");
  const signal = external as AbortSignal | undefined;
  let alreadyAborted = false;
  try { if (signal) alreadyAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!.call(signal); } catch { return smokeError("CANCEL_SIGNAL_INVALID"); }
  if (alreadyAborted) return smokeError("CANCELLED");
  const controller = new AbortController();
  let stopCode = "TIMEOUT", release: (() => void) | undefined;
  const releaseLease = () => { const held = release; release = undefined; try { held?.(); } catch { /* Sanitized cleanup, no token refund implied. */ } };
  let cancel: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(smokeFailure("TIMEOUT")); }, COINBASE_SMOKE_LIMITS.timeoutMs);
  });
  let rejectAbort: ((error: Error) => void) | undefined;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abortFromCaller = () => { stopCode = "CANCELLED"; controller.abort(); rejectAbort?.(smokeFailure("CANCELLED")); };
  if (signal) EventTarget.prototype.addEventListener.call(signal, "abort", abortFromCaller, { once: true });
  const work = async () => {
    const startedAt = smokeTime(api.currentTime());
    const leased = await api.acquireLease(smokeFreeze({ provider: "coinbase-exchange", hostname: "api.exchange.coinbase.com", profile: request.profile }), controller.signal);
    if (leased !== null) {
      const handle = smokeRecord(leased, ["release"]);
      if (typeof handle.release !== "function" || types.isProxy(handle.release)) return smokeError("PORTS_INVALID");
      const dispose = handle.release as () => void;
      release = () => dispose();
    }
    if (controller.signal.aborted) { releaseLease(); return smokeError(stopCode); }
    if (leased === null) return smokeError("RATE_LEASE_DENIED");
    const addresses = smokeArray(await api.resolveIpv4(request.hostname, controller.signal));
    if (controller.signal.aborted) return smokeError(stopCode);
    // Reject mixed public/private answers; IPv6 is intentionally outside this v1 profile.
    if (!addresses.length || addresses.some(value => typeof value !== "string" || !/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value) || !isM5PublicProviderIpv4(value))) return smokeError("DNS_REJECTED");
    const opened = await api.open(Object.freeze({ request, pinnedAddress: addresses[0] as string, tlsServername: request.hostname, headers: Object.freeze({ accept: "application/json", "accept-encoding": "identity" }), redirectPolicy: "ERROR", signal: controller.signal }));
    // Freeze our own options only, never freeze caller/runtime-owned AbortSignal internals.
    const fields = smokeRecord(opened, ["status", "contentType", "contentEncoding", "body", "cancel"]);
    if (typeof fields.cancel !== "function" || types.isProxy(fields.cancel)) return smokeError("PORTS_INVALID");
    const close = fields.cancel as () => void;
    cancel = () => close();
    const response = fields as unknown as Awaited<ReturnType<CoinbaseSmokeHttpPorts["open"]>>;
    if (controller.signal.aborted) { try { cancel(); } catch { /* Late cleanup cannot leak details. */ } return smokeError(stopCode); }
    if (!Number.isSafeInteger(response.status)) return smokeError("HTTP_REJECTED");
    if (response.status >= 300 && response.status < 400) return smokeError("REDIRECT_REJECTED");
    if (response.status !== 200) return smokeError("HTTP_REJECTED");
    if (typeof response.contentType !== "string" || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.contentType)) return smokeError("CONTENT_TYPE_REJECTED");
    if (response.contentEncoding !== null && response.contentEncoding !== "identity") return smokeError("CONTENT_ENCODING_REJECTED");
    const chunks: Uint8Array[] = [];
    let size = 0, count = 0;
    for await (const chunk of response.body) {
      if (controller.signal.aborted) return smokeError(stopCode);
      if (++count > 4096) return smokeError("STREAM_INVALID");
      const snapshot = smokeByteSnapshot(chunk, COINBASE_SMOKE_LIMITS.maximumResponseBytes - size, "RESPONSE_TOO_LARGE");
      size += snapshot.byteLength; chunks.push(snapshot);
    }
    const receivedAt = smokeTime(api.currentTime());
    if (receivedAt < startedAt) return smokeError("RECEIPT_INVALID");
    const body = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return parseCoinbaseSmokeResponse({ request, body, receivedAt, evaluationAt: smokeTime(api.currentTime()) });
  };
  try { return await Promise.race([work(), timeout, aborted]); }
  catch (error) {
    const code = smokeFailureCode(error) ?? "";
    return smokeError(SAFE_FAILURES.has(code) ? code : "TRANSPORT_FAILED");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
    if (signal) EventTarget.prototype.removeEventListener.call(signal, "abort", abortFromCaller);
    releaseLease();
    try { cancel?.(); } catch { /* A cleanup failure never leaks transport error details. */ }
  }
}

/** Infrastructure runner, never wired to CLI/execute. Fakes prove aggregate budgets and sequential work. */
export async function requestCoinbaseSmokeBatch(plan: unknown, ports: CoinbaseSmokeHttpPorts) {
  if (!isRuntimeCoinbaseSmokePlan(plan)) return smokeError("PLAN_NOT_RUNTIME_TRUSTED");
  const seen = new Set<string>(), observations: Awaited<ReturnType<typeof requestCoinbaseSmokeObservation>>[] = [];
  let totalResponseBytes = 0;
  for (const request of plan.requests) {
    if (seen.has(request.profile) || seen.size >= plan.limits.maximumRequests) return smokeError("REQUEST_BUDGET_EXCEEDED");
    seen.add(request.profile);
    const observation = await requestCoinbaseSmokeObservation({ request }, ports);
    if (observation.responseByteLength > plan.limits.maximumTotalResponseBytes - totalResponseBytes) return smokeError("TOTAL_RESPONSE_BUDGET_EXCEEDED");
    totalResponseBytes += observation.responseByteLength;
    observations.push(observation);
  }
  return smokeFreeze({ authorityStatus: COINBASE_SMOKE_STATUS, scope: COINBASE_SMOKE_SCOPE, requestCount: seen.size, totalResponseBytes, planFingerprint: plan.fingerprint, observations, productionStatus: "BLOCKED_BACKEND_UNAPPROVED" });
}
