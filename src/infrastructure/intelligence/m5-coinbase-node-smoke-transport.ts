import "server-only";
import { Resolver } from "node:dns";
import { Agent, request as httpsRequest, type AgentOptions, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { isIP, type LookupFunction } from "node:net";
import { performance } from "node:perf_hooks";
import { checkServerIdentity, rootCertificates } from "node:tls";
import { types } from "node:util";
import { COINBASE_SMOKE_LIMITS, COINBASE_SMOKE_SCOPE, COINBASE_SMOKE_STATUS, checkCoinbaseSmokeAuthorization, isRuntimeCoinbaseSmokePlan, smokeArray, smokeByteSnapshot, smokeError, smokeFailure, smokeFailureCode, smokeFreeze, smokeRecord, smokeTime, validateCoinbaseSmokeRequest, type CoinbaseSmokeRequest } from "@/application/intelligence/m5-coinbase-smoke-contract";
import { parseCoinbaseSmokeResponse } from "@/application/intelligence/m5-coinbase-smoke-parser";

const HOST = COINBASE_SMOKE_SCOPE.hostname;
type Lease = Readonly<{ release(): void }>;
type RateLease = Readonly<{ acquire(profile: string, signal: AbortSignal): Promise<Lease | null> }>;
type ResolverPort = {
  resolve4(host: string, callback: (error: unknown, addresses?: string[]) => void): void;
  resolve6(host: string, callback: (error: unknown, addresses?: string[]) => void): void;
  cancel(): void;
};
// Private primitives. The test compiler exposes these functions only in Vitest.
type NodePorts = Readonly<{
  createResolver(options: { timeout: number; tries: number }): ResolverPort;
  createAgent(options: AgentOptions & { proxyEnv: Readonly<Record<string, never>> }): Agent;
  request(options: RequestOptions): ClientRequest;
  createRateLease(): RateLease;
  now(): number;
  currentTime(): string;
  setTimer(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}>;
type Address = Readonly<{ address: string; family: 4 | 6; key: bigint }>;

function ipv4(address: string): Address {
  if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(address) || isIP(address) !== 4) return smokeError("DNS_REJECTED");
  const [a, b, c, d] = address.split(".").map(Number) as [number, number, number, number];
  // Conservative IANA special-purpose exclusions; no global exceptions inside blocked prefixes.
  if (a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99) || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113) || a >= 224) return smokeError("DNS_REJECTED");
  return { address, family: 4, key: (BigInt(a) << 24n) | (BigInt(b) << 16n) | (BigInt(c) << 8n) | BigInt(d) };
}
function checkedAddress(input: unknown): Address {
  const row = smokeRecord(input, ["address", "family"]);
  if (typeof row.address !== "string" || row.address.length > 45 || !/^[0-9a-fA-F:.]+$/.test(row.address) || (row.family !== 4 && row.family !== 6) || isIP(row.address) !== row.family) return smokeError("DNS_REJECTED");
  if (row.family === 4) return ipv4(row.address);
  const canonical = new URL(`http://[${row.address}]/`).hostname.slice(1, -1);
  const halves = canonical.split("::"), left = halves[0] ? halves[0].split(":") : [], right = halves[1] ? halves[1].split(":") : [];
  const words = halves.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  const key = words.reduce((value, word) => (value << 16n) | BigInt(`0x${word}`), 0n);
  // IPv4-mapped IPv6 is evaluated as IPv4, then pinned with family 4 (also deduplicated).
  if ((key >> 32n) === 0xffffn) return ipv4([24n, 16n, 8n, 0n].map(shift => Number((key >> shift) & 255n)).join("."));
  if ((key >> 125n) !== 1n || (key >> 105n) === (0x20010000000000000000000000000000n >> 105n) ||
    (key >> 96n) === 0x20010db8n || (key >> 112n) === 0x2002n || (key >> 108n) === 0x3fff0n) return smokeError("DNS_REJECTED");
  return { address: canonical, family: 6, key };
}
function validateAddressSet(input: unknown): readonly Address[] {
  const addresses = smokeArray(input, 32).map(checkedAddress);
  if (!addresses.length || new Set(addresses.map(item => `${item.family}:${item.key}`)).size !== addresses.length) return smokeError("DNS_REJECTED");
  // Stable IPv4-first, numeric-address ordering; no retry/failover to a second answer.
  return smokeFreeze(addresses.sort((a, b) => a.family - b.family || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)));
}

function nativeSignal(input: unknown): AbortSignal | undefined {
  if (input === undefined) return undefined;
  if (!input || typeof input !== "object" || types.isProxy(input) || Object.getPrototypeOf(input) !== AbortSignal.prototype || Reflect.ownKeys(input).some(key => !("value" in Object.getOwnPropertyDescriptor(input, key)!))) return smokeError("CANCEL_SIGNAL_INVALID");
  try { if (Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!.call(input)) return smokeError("CANCELLED"); }
  catch (error) { return smokeError(smokeFailureCode(error) === "CANCELLED" ? "CANCELLED" : "CANCEL_SIGNAL_INVALID"); }
  return input as AbortSignal;
}
function once(action: () => void): () => void {
  let completed = false;
  return () => { if (completed) return; completed = true; try { action(); } catch { /* Cleanup never exposes opaque errors. */ } };
}
function createLocalRateLease(): RateLease {
  const seen = new Set<string>();
  let active = false;
  const queue: (() => void)[] = [];
  return Object.freeze({ acquire(profile: string, signal: AbortSignal) {
    if (signal.aborted) return Promise.reject(smokeFailure("CANCELLED"));
    if (!["PRODUCT_IDENTITY", "DAILY_CANDLES", "PRODUCT_STATS"].includes(profile) || seen.has(profile) || seen.size >= 3) return Promise.resolve(null);
    seen.add(profile);
    return new Promise<Lease>((resolve, reject) => {
      const abort = () => { const index = queue.indexOf(grant); if (index >= 0) queue.splice(index, 1); signal.removeEventListener("abort", abort); reject(smokeFailure("CANCELLED")); };
      const grant = () => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) { reject(smokeFailure("CANCELLED")); queue.shift()?.(); return; }
        active = true;
        resolve(Object.freeze({ release: once(() => { active = false; queue.shift()?.(); }) }));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (active) queue.push(grant); else grant();
    });
  } });
}

type Deadline = { signal: AbortSignal; remaining(): number; failure(): Error };
function resolveCoinbaseAddresses(ports: NodePorts, deadline: Deadline): Promise<readonly Address[]> {
  const milliseconds = Math.ceil(deadline.remaining());
  return new Promise((resolve, reject) => {
    let resolver: ResolverPort | undefined, finished = false, pending = 2;
    const rows: { address: string; family: 4 | 6 }[] = [];
    const cancel = once(() => resolver?.cancel());
    const settle = (error?: Error, addresses?: readonly Address[]) => {
      if (finished) return; finished = true; deadline.signal.removeEventListener("abort", abort); cancel();
      if (error) reject(error); else resolve(addresses!);
    };
    const abort = () => settle(deadline.failure());
    const answer = (family: 4 | 6) => (error: unknown, addresses?: string[]) => {
      if (finished) return;
      try {
        deadline.remaining();
        if (error) {
          const code = error && typeof error === "object" && !types.isProxy(error) ? Object.getOwnPropertyDescriptor(error, "code") : undefined;
          if (!code || !("value" in code) || code.value !== "ENODATA") return settle(smokeFailure("DNS_REJECTED"));
        } else {
          const list = smokeArray(addresses, 32);
          if (rows.length + list.length > 32 || list.some(item => typeof item !== "string")) return settle(smokeFailure("DNS_REJECTED"));
          rows.push(...list.map(address => ({ address: address as string, family })));
        }
        if (--pending === 0) settle(undefined, validateAddressSet(rows));
      } catch (error) { settle(smokeFailure(smokeFailureCode(error) === "TIMEOUT" ? "TIMEOUT" : "DNS_REJECTED")); }
    };
    try {
      deadline.remaining(); resolver = ports.createResolver({ timeout: milliseconds, tries: 1 });
      deadline.signal.addEventListener("abort", abort, { once: true });
      resolver.resolve4(HOST, answer(4)); if (!finished) resolver.resolve6(HOST, answer(6));
    } catch { settle(smokeFailure("DNS_REJECTED")); }
  });
}

function terminalCleanup(emitter: ClientRequest | IncomingMessage): void {
  // Native destroy can emit error asynchronously. Keep only terminal sinks until close.
  if (emitter.closed) return;
  const ignore = () => {};
  const closed = () => { emitter.removeListener("error", ignore); emitter.removeListener("close", closed); };
  emitter.on("error", ignore); emitter.once("close", closed);
}
function receiveCoinbaseBody(request: CoinbaseSmokeRequest, address: Address, ports: NodePorts, deadline: Deadline, byteBudget: number): Promise<Uint8Array> {
  const remaining = Math.ceil(deadline.remaining());
  return new Promise((resolve, reject) => {
    let agent: Agent | undefined, outgoing: ClientRequest | undefined, incoming: IncomingMessage | undefined;
    let settled = false, ended = false, size = 0, count = 0, declaredLength: number | undefined;
    const chunks: Uint8Array[] = [];
    const destroy = once(() => { try { incoming?.destroy(); } finally { try { outgoing?.destroy(); } finally { agent?.destroy(); } } });
    const cleanup = () => {
      deadline.signal.removeEventListener("abort", abort);
      outgoing?.removeListener("response", response); outgoing?.removeListener("error", error); outgoing?.removeListener("timeout", timeout); outgoing?.removeListener("abort", abortEvent); outgoing?.removeListener("close", requestClose);
      incoming?.removeListener("data", data); incoming?.removeListener("end", end); incoming?.removeListener("error", error); incoming?.removeListener("aborted", abortEvent); incoming?.removeListener("close", responseClose);
      if (outgoing) terminalCleanup(outgoing); if (incoming) terminalCleanup(incoming);
      destroy(); chunks.length = 0;
    };
    const finish = (failure?: Error, body?: Uint8Array) => { if (settled) return; settled = true; cleanup(); if (failure) reject(failure); else resolve(body!); };
    const error = () => finish(smokeFailure("TRANSPORT_FAILED"));
    const abort = () => finish(deadline.failure());
    const timeout = () => finish(smokeFailure("TIMEOUT"));
    const abortEvent = () => finish(smokeFailure("TRANSPORT_FAILED"));
    const requestClose = () => { if (!incoming) finish(smokeFailure("TRANSPORT_CLOSED")); };
    const responseClose = () => { if (!ended) finish(smokeFailure("STREAM_TRUNCATED")); };
    const data = (chunk: unknown) => {
      if (settled) return;
      try {
        deadline.remaining(); if (++count > 4096) return finish(smokeFailure("STREAM_INVALID"));
        const snapshot = smokeByteSnapshot(chunk, byteBudget - size, "RESPONSE_TOO_LARGE");
        size += snapshot.byteLength; chunks.push(snapshot);
      } catch (caught) { finish(smokeFailure(smokeFailureCode(caught) ?? "STREAM_INVALID")); }
    };
    const end = () => {
      if (settled) return;
      try {
        deadline.remaining(); ended = true;
        if (!incoming?.complete) return finish(smokeFailure("STREAM_TRUNCATED"));
        if (declaredLength !== undefined && declaredLength !== size) return finish(smokeFailure("CONTENT_LENGTH_INVALID"));
        const body = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        finish(undefined, body);
      } catch (caught) { finish(smokeFailure(smokeFailureCode(caught) ?? "STREAM_INVALID")); }
    };
    const response = (message: IncomingMessage) => {
      if (settled) { if (message !== incoming) { terminalCleanup(message); message.destroy(); } return; }
      incoming = message;
      try {
        deadline.remaining();
        if (message.statusCode && message.statusCode >= 300 && message.statusCode < 400) return finish(smokeFailure("REDIRECT_REJECTED"));
        if (message.statusCode === 429) return finish(smokeFailure("RATE_LIMITED"));
        if (message.statusCode !== 200) return finish(smokeFailure("PROVIDER_HTTP_REJECTED"));
        const names = message.rawHeaders.filter((_, index) => index % 2 === 0).map(name => name.toLowerCase());
        if (["content-type", "content-encoding", "content-length"].some(name => names.filter(item => item === name).length > 1)) return finish(smokeFailure("RESPONSE_HEADERS_INVALID"));
        const contentType = message.headers["content-type"], encoding = message.headers["content-encoding"], length = message.headers["content-length"];
        if (typeof contentType !== "string" || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) return finish(smokeFailure("CONTENT_TYPE_REJECTED"));
        if (encoding !== undefined && encoding !== "identity") return finish(smokeFailure("CONTENT_ENCODING_REJECTED"));
        if (length !== undefined) {
          if (typeof length !== "string" || !/^(0|[1-9]\d*)$/.test(length) || !Number.isSafeInteger(Number(length))) return finish(smokeFailure("CONTENT_LENGTH_INVALID"));
          declaredLength = Number(length); if (declaredLength > byteBudget) return finish(smokeFailure("RESPONSE_TOO_LARGE"));
        }
        message.on("error", error); message.on("aborted", abortEvent); message.on("close", responseClose); message.on("end", end); message.on("data", data);
      } catch (caught) { finish(smokeFailure(smokeFailureCode(caught) ?? "TRANSPORT_FAILED")); }
    };
    try {
      deadline.remaining();
      const agentOptions = { keepAlive: false, maxSockets: 1, maxTotalSockets: 1, maxCachedSessions: 0, scheduling: "fifo" as const, proxyEnv: Object.freeze({}), ca: [...rootCertificates], rejectUnauthorized: true };
      agent = ports.createAgent(agentOptions);
      const lookup: LookupFunction = (hostname, options, callback) => {
        if (hostname !== HOST || settled || deadline.signal.aborted) { callback(smokeFailure("DNS_REJECTED"), "", 4); return; }
        try { deadline.remaining(); } catch { callback(smokeFailure("TIMEOUT"), "", 4); return; }
        if (options.all) callback(null, [{ address: address.address, family: address.family }]); else callback(null, address.address, address.family);
      };
      const query = request.query.map(item => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value)}`).join("&");
      const options: RequestOptions & { autoSelectFamily: false } = { protocol: "https:", hostname: HOST, servername: HOST, method: "GET", path: request.path + (query ? `?${query}` : ""),
        headers: { Host: HOST, Accept: "application/json", "Accept-Encoding": "identity", "User-Agent": "MoneyMachine-Coinbase-Smoke/1" },
        agent, lookup, family: address.family, autoSelectFamily: false, rejectUnauthorized: true, ca: [...rootCertificates], checkServerIdentity, minVersion: "TLSv1.2", maxHeaderSize: 8192, timeout: remaining };
      outgoing = ports.request(options);
      outgoing.on("response", response); outgoing.on("error", error); outgoing.on("timeout", timeout); outgoing.on("abort", abortEvent); outgoing.on("close", requestClose);
      deadline.signal.addEventListener("abort", abort, { once: true });
      deadline.remaining(); outgoing.end();
    } catch (caught) { finish(smokeFailure(smokeFailureCode(caught) ?? "TRANSPORT_FAILED")); }
  });
}

function nativePorts(): NodePorts {
  return Object.freeze({ createResolver: options => new Resolver(options), createAgent: options => new Agent(options), request: options => httpsRequest(options), createRateLease: createLocalRateLease,
    now: () => performance.now(), currentTime: () => new Date().toISOString(), setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds), clearTimer: timer => clearTimeout(timer) });
}
async function runCoinbaseNodeSmoke(plan: unknown, ports: NodePorts, callerSignal?: unknown) {
  if (!isRuntimeCoinbaseSmokePlan(plan)) return smokeError("PLAN_NOT_RUNTIME_TRUSTED");
  const requests = plan.requests.map(validateCoinbaseSmokeRequest), signal = nativeSignal(callerSignal);
  const controller = new AbortController();
  let stopCode = "TIMEOUT", lastNow = ports.now();
  if (!Number.isFinite(lastNow) || lastNow < 0 || lastNow > Number.MAX_SAFE_INTEGER - COINBASE_SMOKE_LIMITS.timeoutMs) return smokeError("CLOCK_INVALID");
  const expires = lastNow + COINBASE_SMOKE_LIMITS.timeoutMs;
  let rejectStop!: (error: Error) => void;
  const stopped = new Promise<never>((_, reject) => { rejectStop = reject; });
  const stop = (code: string) => { if (controller.signal.aborted) return; stopCode = code; controller.abort(); rejectStop(smokeFailure(code)); };
  const abort = () => stop("CANCELLED");
  const deadline: Deadline = { signal: controller.signal, failure: () => smokeFailure(stopCode), remaining: () => {
    if (controller.signal.aborted) return smokeError(stopCode);
    const now = ports.now(); if (!Number.isFinite(now) || now < lastNow) return smokeError("CLOCK_INVALID"); lastNow = now;
    if (now >= expires) return smokeError("TIMEOUT"); return expires - now;
  } };
  const timer = ports.setTimer(() => stop("TIMEOUT"), COINBASE_SMOKE_LIMITS.timeoutMs);
  let release: (() => void) | undefined;
  const releaseCurrent = () => { release?.(); release = undefined; };
  const observations: ReturnType<typeof parseCoinbaseSmokeResponse>[] = [];
  let totalResponseBytes = 0;
  const work = async () => {
    const rate = ports.createRateLease();
    for (const request of requests) {
      deadline.remaining(); const startedAt = smokeTime(ports.currentTime());
      const lease = await rate.acquire(request.profile, controller.signal);
      if (lease) release = once(() => lease.release());
      try {
        deadline.remaining(); if (!lease) return smokeError("RATE_LEASE_DENIED");
        const addresses = await resolveCoinbaseAddresses(ports, deadline); deadline.remaining();
        const budget = Math.min(plan.limits.maximumResponseBytes, plan.limits.maximumTotalResponseBytes - totalResponseBytes);
        const bytes = await receiveCoinbaseBody(request, addresses[0]!, ports, deadline, budget); deadline.remaining();
        const receivedAt = smokeTime(ports.currentTime()); if (receivedAt < startedAt) return smokeError("RECEIPT_INVALID");
        const observation = parseCoinbaseSmokeResponse({ request, body: bytes, receivedAt, evaluationAt: smokeTime(ports.currentTime()) }); deadline.remaining();
        totalResponseBytes += observation.responseByteLength; observations.push(observation);
      } finally { releaseCurrent(); }
    }
    return smokeFreeze({ authorityStatus: COINBASE_SMOKE_STATUS, scope: COINBASE_SMOKE_SCOPE, requestCount: requests.length, totalResponseBytes, planFingerprint: plan.fingerprint, observations, productionStatus: "BLOCKED_BACKEND_UNAPPROVED" });
  };
  if (signal) EventTarget.prototype.addEventListener.call(signal, "abort", abort, { once: true });
  try { return await Promise.race([work(), stopped]); }
  catch (error) { return smokeError(smokeFailureCode(error) ?? "TRANSPORT_FAILED"); }
  finally { ports.clearTimer(timer); controller.abort(); releaseCurrent(); if (signal) EventTarget.prototype.removeEventListener.call(signal, "abort", abort); }
}

/** Public production entrypoint exports only sanitized observations or blocked status. No injectable ports. */
export function executeCoinbaseNodeSmoke(input: unknown) {
  const row = smokeRecord(input, ["authorization", "plan", "environment", "evaluationAt", "signal"], ["authorization", "plan", "environment", "evaluationAt"]);
  if (!isRuntimeCoinbaseSmokePlan(row.plan)) return smokeError("PLAN_NOT_RUNTIME_TRUSTED");
  if (row.environment !== "LOCAL_SMOKE") return smokeError("ENVIRONMENT_INVALID");
  if (!checkCoinbaseSmokeAuthorization(row.authorization, row.evaluationAt)) return smokeFreeze({ status: "BLOCKED", code: "M5_COINBASE_SMOKE_AUTHORITY_NOT_PINNED", authorityStatus: COINBASE_SMOKE_STATUS, productionStatus: "BLOCKED_BACKEND_UNAPPROVED", requestCount: 0 });
  return runCoinbaseNodeSmoke(row.plan, nativePorts(), row.signal);
}
