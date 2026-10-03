import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { Agent, RequestOptions } from "node:https";
import { checkServerIdentity, rootCertificates } from "node:tls";
import { readFileSync } from "node:fs";
import { createRateLease, runFakeSmoke, validateAddresses } from "test-only:coinbase-node-transport";
import { executeCoinbaseNodeSmoke } from "@/infrastructure/intelligence/m5-coinbase-node-smoke-transport";
import { createCoinbaseSmokeExecutor } from "@/application/intelligence/m5-coinbase-smoke-composition";
import { COINBASE_SMOKE_LIMITS, COINBASE_SMOKE_PROFILES, COINBASE_SMOKE_SCOPE, COINBASE_SMOKE_VERSION, COINBASE_SMOKE_STATUS, createCoinbaseSmokeAuthorization, planCoinbaseSmoke } from "@/application/intelligence/m5-coinbase-smoke-contract";
import { runCoinbaseSmokeCli } from "../../scripts/m5-coinbase-smoke";

// Trap any accidental production native call in this file; every positive flow uses private injected primitives.
vi.mock("node:dns", async importOriginal => ({ ...await importOriginal<typeof import("node:dns")>(), Resolver: vi.fn(() => { throw new Error("node-smoke-network-canary"); }) }));
vi.mock("node:https", async importOriginal => ({ ...await importOriginal<typeof import("node:https")>(), Agent: vi.fn(() => { throw new Error("node-smoke-network-canary"); }), request: vi.fn(() => { throw new Error("node-smoke-network-canary"); }) }));

const receipt = "2026-10-03T04:00:00.000Z";
const config = () => ({ ...COINBASE_SMOKE_SCOPE, start: "2026-10-01T00:00:00.000Z", end: "2026-10-03T00:00:00.000Z", granularity: 86400 });
const plan = () => planCoinbaseSmoke(config());
const product = '{"id":"ETH-USD","base_currency":"ETH","quote_currency":"USD","display_name":"ETH/USD","status":"online","status_message":"node-smoke-private-fixture"}';
const candles = '[[1790812800,2000,2100,2001,2002,1.2345678901234567890123456789]]';
const stats = '{"open":"2000","high":"2100","low":"1900","last":"2001","volume":"12.34567890123456789"}';
const encode = (value: string) => new TextEncoder().encode(value);
type Ports = Parameters<typeof runFakeSmoke>[1];
type Callback = (error: unknown, addresses?: string[]) => void;

class Response extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string | string[] | undefined> = { "content-type": "application/json" };
  rawHeaders = ["Content-Type", "application/json"];
  complete = false; closed = false; destroyed = false;
  destroy = vi.fn(() => { this.destroyed = true; this.closed = true; this.emit("close"); return this; });
  finish() { this.complete = true; this.emit("end"); }
}
class Request extends EventEmitter {
  closed = false; destroyed = false;
  destroy = vi.fn(() => {
    this.destroyed = true;
    queueMicrotask(() => { if (!this.closed) { this.emit("error", new Error("node-smoke-destroy-canary")); this.closed = true; this.emit("close"); } });
    return this;
  });
  end = vi.fn<() => void>();
}
function fixture() {
  vi.useFakeTimers();
  const state = { now: 0, ipv4: ["8.8.8.8"], ipv6: ["2606:4700:4700::1111"], phase: "normal", chunks: undefined as Uint8Array[] | undefined,
    resolverDelay: 0, bodyDelay: 0, body: undefined as string | undefined, status: 200, headers: {} as Record<string, string | string[]>, rawHeaders: undefined as string[] | undefined };
  const resolvers: { cancel: ReturnType<typeof vi.fn>; a?: Callback; aaaa?: Callback }[] = [];
  const requests: Request[] = [], responses: Response[] = [], agents: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const release = vi.fn(), local = createRateLease();
  const acquire = vi.fn<Ports["createRateLease"] extends () => infer R ? R extends { acquire: infer A } ? A : never : never>(async (profile, signal) => {
    const held = await local.acquire(profile, signal);
    return held ? { release: () => { release(); held.release(); } } : null;
  });
  const ports = {
    createRateLease: vi.fn(() => ({ acquire })),
    createResolver: vi.fn<Ports["createResolver"]>(() => {
      state.now += state.resolverDelay;
      const record = { cancel: vi.fn(), a: undefined as Callback | undefined, aaaa: undefined as Callback | undefined }; resolvers.push(record);
      return { cancel: record.cancel,
        resolve4: vi.fn((host: string, callback: Callback) => { expect(host).toBe("api.exchange.coinbase.com"); record.a = callback; if (state.phase !== "DNS") callback(null, state.ipv4); }),
        resolve6: vi.fn((host: string, callback: Callback) => { expect(host).toBe("api.exchange.coinbase.com"); record.aaaa = callback; if (state.phase !== "DNS") callback(null, state.ipv6); }),
      };
    }),
    createAgent: vi.fn<Ports["createAgent"]>(() => { const agent = { destroy: vi.fn() }; agents.push(agent); return agent as unknown as Agent; }),
    request: vi.fn<Ports["request"]>((options: RequestOptions) => {
      const req = new Request(), res = new Response(); requests.push(req); responses.push(res);
      res.statusCode = state.status; Object.assign(res.headers, state.headers);
      res.rawHeaders = state.rawHeaders ?? Object.entries(res.headers).flatMap(([key, value]) => [key, String(value)]);
      req.end.mockImplementation(() => {
        queueMicrotask(() => {
          if (state.phase === "connect" || req.destroyed) return;
          if (state.phase === "request-error") { req.emit("error", new Error("node-smoke-private-error")); return; }
          req.emit("response", res as unknown as IncomingMessage);
          if (state.phase === "body") return;
          if (state.phase === "response-error") { res.emit("error", new Error("node-smoke-private-error")); return; }
          state.now += state.bodyDelay;
          const path = options.path!;
          const json = state.body ?? (path.includes("/candles") ? candles : path.endsWith("/stats") ? stats : product);
          for (const chunk of state.chunks ?? [encode(json)]) res.emit("data", chunk);
          res.finish();
        });
      });
      return req as unknown as ClientRequest;
    }),
    now: vi.fn(() => state.now), currentTime: vi.fn(() => receipt),
    setTimer: vi.fn<Ports["setTimer"]>((callback, ms) => setTimeout(callback, ms)), clearTimer: vi.fn<Ports["clearTimer"]>(timer => clearTimeout(timer)),
  } satisfies Ports;
  return { state, ports, requests, responses, resolvers, agents, acquire, release };
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("Coinbase Node DNS policy (pure, no network)", () => {
  it("canonicalizes and selects IPv4 first in numeric order, independent of response order", () => {
    const input = [{ address: "2606:4700:4700::1111", family: 6 }, { address: "8.8.8.8", family: 4 }, { address: "1.1.1.1", family: 4 }];
    expect(validateAddresses(input).map(row => row.address)).toEqual(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]);
    expect(validateAddresses(input.reverse()).map(row => row.address)).toEqual(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"]);
    expect(Object.isFrozen(validateAddresses(input)[0])).toBe(true);
    expect(validateAddresses([{ address: "::ffff:8.8.8.8", family: 6 }])[0]).toMatchObject({ address: "8.8.8.8", family: 4 });
  });
  it.each(["0.0.0.0", "0.1.2.3", "10.0.0.1", "100.64.0.1", "100.127.255.255", "127.0.0.1", "169.254.1.2", "172.16.0.1", "172.31.255.255", "192.0.0.1", "192.0.2.1", "192.88.99.1", "192.168.0.1", "198.18.0.1", "198.19.1.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "239.1.1.1", "240.0.0.1", "255.255.255.255"])("rejects non-global IPv4 %s", address => {
    expect(() => validateAddresses([{ address, family: 4 }])).toThrow("DNS_REJECTED");
  });
  it.each(["::", "::1", "fc00::1", "fdff::1", "fe80::1", "febf::1", "ff02::1", "2001:db8::1", "3fff::1", "2001:2::1", "2001::1", "2001:20::1", "2002::1", "64:ff9b::808:808", "100::1", "5f00::1", "::ffff:127.0.0.1", "::ffff:192.168.1.1", "::ffff:100.64.1.1", "::ffff:7f00:1"])("rejects non-global/mapped IPv6 %s", address => {
    expect(() => validateAddresses([{ address, family: 6 }])).toThrow("DNS_REJECTED");
  });
  it.each([[], [{ address: "8.8.8.8", family: 4 }, { address: "8.8.8.8", family: 4 }], [{ address: "8.8.8.8", family: 4 }, { address: "::ffff:808:808", family: 6 }], [{ address: "2606:4700::1", family: 6 }, { address: "2606:4700:0:0:0:0:0:1", family: 6 }], [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }], [{ address: "8.8.8.8", family: 6 }], [{ address: "01.2.3.4", family: 4 }], [{ address: "fe80::1%eth0", family: 6 }]].map(input => ({ input })))("rejects empty/duplicate/mixed/invalid address set $input", ({ input }) => expect(() => validateAddresses(input)).toThrow("DNS_REJECTED"));
  it("accepts a public AAAA-only response and resolves each family once per request", async () => {
    const f = fixture(); f.state.ipv4 = [];
    const result = await runFakeSmoke(plan(), f.ports);
    expect(result.requestCount).toBe(3); expect(f.ports.createResolver).toHaveBeenCalledTimes(3);
    expect(f.ports.request.mock.calls.every(([options]) => options.family === 6)).toBe(true);
    expect(f.resolvers.every(resolver => resolver.cancel.mock.calls.length === 1)).toBe(true);
  });
  it("accepts ENODATA for one family, rejects opaque resolver errors without inspecting messages", async () => {
    const f = fixture(); f.ports.createResolver.mockImplementation(() => ({ cancel: vi.fn(), resolve4: (_host, callback) => callback(null, ["8.8.8.8"]), resolve6: (_host, callback) => callback({ code: "ENODATA" }) }));
    expect((await runFakeSmoke(plan(), f.ports)).requestCount).toBe(3);
    const getter = vi.fn(() => { throw new Error("node-smoke-getter-canary"); });
    const failed = fixture();
    failed.ports.createResolver.mockImplementation(() => ({ cancel: vi.fn(), resolve4: (_host, callback) => callback(Object.defineProperty({}, "message", { get: getter })), resolve6: vi.fn() }));
    await expect(runFakeSmoke(plan(), failed.ports)).rejects.toThrow(/^M5_COINBASE_SMOKE_DNS_REJECTED$/); expect(getter).not.toHaveBeenCalled();
  });
  it("bounds oversized/mixed DNS answers before creating an agent or request", async () => {
    for (const input of [Array(33).fill("8.8.8.8"), ["8.8.8.8", "127.0.0.1"], []]) {
      const f = fixture(); f.state.ipv4 = input; f.state.ipv6 = [];
      await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow("DNS_REJECTED"); expect(f.ports.createAgent).not.toHaveBeenCalled(); expect(f.ports.request).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
    }
  });
});

describe("Coinbase native HTTPS options and sequential sanitized result", () => {
  it("builds fixed TLS/Host/headers, bundled CA, private agent and pinned lookup without secondary DNS", async () => {
    const f = fixture(), result = await runFakeSmoke(plan(), f.ports);
    expect(result).toMatchObject({ requestCount: 3, authorityStatus: "NON_AUTHORITATIVE_MARKET_SMOKE", productionStatus: "BLOCKED_BACKEND_UNAPPROVED" });
    expect(JSON.stringify(result)).not.toMatch(/node-smoke-private|8\.8\.8\.8|2606:|headers|cookies|credential|socket/);
    expect(result.observations[1].candles[0].volume.decimal).toBe("1.2345678901234567890123456789");
    expect(f.ports.createResolver).toHaveBeenCalledTimes(3); expect(f.ports.request).toHaveBeenCalledTimes(3); expect(f.release).toHaveBeenCalledTimes(3);
    const options = f.ports.request.mock.calls[0][0];
    expect(options).toMatchObject({ protocol: "https:", hostname: "api.exchange.coinbase.com", servername: "api.exchange.coinbase.com", family: 4, autoSelectFamily: false, method: "GET", rejectUnauthorized: true, minVersion: "TLSv1.2", maxHeaderSize: 8192, timeout: 5000 });
    expect(options.headers).toEqual({ Host: "api.exchange.coinbase.com", Accept: "application/json", "Accept-Encoding": "identity", "User-Agent": "MoneyMachine-Coinbase-Smoke/1" });
    expect(options.ca).toEqual([...rootCertificates]); expect(options.checkServerIdentity).toBe(checkServerIdentity);
    expect(options).not.toHaveProperty("auth"); expect(options).not.toHaveProperty("port"); expect(options).not.toHaveProperty("createConnection");
    for (const [agentOptions] of f.ports.createAgent.mock.calls) expect(agentOptions).toMatchObject({ proxyEnv: {}, keepAlive: false, maxSockets: 1, maxTotalSockets: 1, maxCachedSessions: 0, rejectUnauthorized: true });
    expect(options.agent).toBe(f.agents[0]); expect(new Set(f.ports.request.mock.calls.map(([item]) => item.agent)).size).toBe(3);
    const callback = vi.fn(); options.lookup!("api.exchange.coinbase.com", {}, callback); // Closed request: deliberately denied.
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(f.ports.request.mock.calls[1][0].path).toBe("/products/ETH-USD/candles?end=2026-10-03T00%3A00%3A00.000Z&granularity=86400&start=2026-10-01T00%3A00%3A00.000Z");
    for (const req of f.requests) { expect(req.end.mock.calls[0]).toEqual([]); expect(req.destroy).toHaveBeenCalledOnce(); expect(req.eventNames()).toEqual([]); }
    for (const res of f.responses) { expect(res.destroy).toHaveBeenCalledOnce(); expect(res.eventNames()).toEqual([]); }
    for (const agent of f.agents) expect(agent.destroy).toHaveBeenCalledOnce();
  });
  it.each([4, 6])("lookup returns only the selected pinned family %i before request end", async family => {
    const f = fixture(); if (family === 6) f.state.ipv4 = [];
    const original = f.ports.request.getMockImplementation()!;
    f.ports.request.mockImplementation(options => {
      const callback = vi.fn(); options.lookup!("api.exchange.coinbase.com", {}, callback);
      expect(callback.mock.calls[0]).toEqual([null, family === 4 ? "8.8.8.8" : "2606:4700:4700::1111", family]);
      const all = vi.fn(); options.lookup!("api.exchange.coinbase.com", { all: true }, all); expect(all.mock.calls[0][1]).toHaveLength(1);
      const denied = vi.fn(); options.lookup!("evil.invalid", {}, denied); expect(denied.mock.calls[0][0].message).toBe("M5_COINBASE_SMOKE_DNS_REJECTED");
      return original(options);
    });
    await runFakeSmoke(plan(), f.ports); expect(f.ports.createResolver).toHaveBeenCalledTimes(3);
  });
  it("uses one total deadline and releases each request before opening the next", async () => {
    const f = fixture(); f.state.resolverDelay = 100; f.state.bodyDelay = 100;
    const original = f.ports.request.getMockImplementation()!;
    f.ports.request.mockImplementation(options => { expect(f.release.mock.calls.length).toBe(f.requests.length); return original(options); });
    await runFakeSmoke(plan(), f.ports);
    expect(f.ports.setTimer).toHaveBeenCalledOnce(); expect(f.ports.setTimer.mock.calls[0][1]).toBe(5000);
    expect(f.ports.request.mock.calls.map(([options]) => options.timeout)).toEqual([4900, 4700, 4500]);
    expect(f.ports.createResolver.mock.calls.map(([options]) => options)).toEqual([{ timeout: 5000, tries: 1 }, { timeout: 4800, tries: 1 }, { timeout: 4600, tries: 1 }]);
  });
  it("keeps address and receipt outside payload identity, but binds receipt provenance", async () => {
    const first = fixture(), original = await runFakeSmoke(plan(), first.ports);
    const later = fixture(); later.state.ipv4 = ["1.1.1.1"]; later.ports.currentTime.mockReturnValue("2026-10-03T04:00:01.000Z");
    const observed = await runFakeSmoke(plan(), later.ports);
    expect(observed.observations.map(row => row.payloadFingerprint)).toEqual(original.observations.map(row => row.payloadFingerprint));
    expect(observed.observations.map(row => row.observationFingerprint)).not.toEqual(original.observations.map(row => row.observationFingerprint));
    expect(Object.isFrozen(observed)).toBe(true); expect(Object.isFrozen(observed.observations[1].candles[0].volume)).toBe(true);
  });
});

describe("Coinbase bounded response events", () => {
  it("accepts exact per-response and aggregate byte ceilings", async () => {
    const f = fixture(), original = f.ports.request.getMockImplementation()!;
    f.ports.request.mockImplementation(options => {
      const json = options.path!.includes("/candles") ? candles : options.path!.endsWith("/stats") ? stats : product;
      f.state.chunks = [encode(json + " ".repeat(524288 - encode(json).byteLength))]; f.state.headers = { "content-length": "524288", "content-encoding": "identity" };
      return original(options);
    });
    const result = await runFakeSmoke(plan(), f.ports); expect(result.totalResponseBytes).toBe(1572864); expect(result.observations.every(row => row.responseByteLength === 524288)).toBe(true);
  });
  it.each(["one", "chunks", "shadow"])("destroys immediately on overflow %s, without another request", async variant => {
    const f = fixture(), tooLarge = new Uint8Array(524289);
    if (variant === "shadow") Object.defineProperty(tooLarge, "byteLength", { value: 1 });
    f.state.chunks = variant === "chunks" ? [new Uint8Array(524288), new Uint8Array(1)] : [tooLarge];
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow("RESPONSE_TOO_LARGE");
    expect(f.ports.request).toHaveBeenCalledOnce(); expect(f.requests[0].destroy).toHaveBeenCalledOnce(); expect(f.responses[0].destroy).toHaveBeenCalledOnce(); expect(f.agents[0].destroy).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce();
  });
  it("copies chunks intrinsically without length or iterator accessors", async () => {
    const f = fixture(), getter = vi.fn(() => { throw new Error("node-smoke-getter-canary"); });
    const bytes = encode(product); Object.defineProperty(bytes, "byteLength", { get: getter }); Object.defineProperty(bytes, Symbol.iterator, { get: getter });
    f.state.chunks = [bytes]; // Later endpoints reject product schema, first response still proves intrinsic copy.
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow("CANDLE_INVALID"); expect(getter).not.toHaveBeenCalled();
  });
  it.each([
    [{ "content-length": "524289" }, "RESPONSE_TOO_LARGE"], [{ "content-length": "1" }, "CONTENT_LENGTH_INVALID"], [{ "content-length": "9007199254740992" }, "CONTENT_LENGTH_INVALID"],
    [{ "content-encoding": "gzip" }, "CONTENT_ENCODING_REJECTED"], [{ "content-encoding": "br" }, "CONTENT_ENCODING_REJECTED"], [{ "content-encoding": "deflate" }, "CONTENT_ENCODING_REJECTED"],
    [{ "content-type": "text/html" }, "CONTENT_TYPE_REJECTED"], [{ "content-type": "application/json; charset=latin1" }, "CONTENT_TYPE_REJECTED"],
  ] as const)("rejects response metadata %j at the proper boundary", async (headers, code) => {
    const f = fixture(); Object.assign(f.state.headers, headers);
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow(code); expect(f.ports.request).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce(); expect(f.responses[0].destroy).toHaveBeenCalledOnce();
  });
  it("rejects duplicate security-relevant headers before data consumption", async () => {
    const f = fixture(); f.state.rawHeaders = ["Content-Type", "application/json", "content-TYPE", "application/json"];
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow("RESPONSE_HEADERS_INVALID"); expect(f.release).toHaveBeenCalledOnce();
  });
  it("does not consume or copy data after rejecting content-length before streaming", async () => {
    const f = fixture(), getter = vi.fn(() => { throw new Error("node-smoke-getter-canary"); });
    f.state.headers = { "content-length": "524289" };
    f.state.chunks = [new Proxy(new Uint8Array(1), { get: getter })];
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow("RESPONSE_TOO_LARGE"); expect(getter).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
  });
  it.each(["resolver", "agent", "request"])("sanitizes a throwing %s primitive and releases the acquired lease", async kind => {
    const f = fixture(), opaque = Object.defineProperty({}, "message", { get: () => { throw new Error("node-smoke-private-error"); } });
    if (kind === "resolver") f.ports.createResolver.mockImplementation(() => { throw opaque; });
    if (kind === "agent") f.ports.createAgent.mockImplementation(() => { throw opaque; });
    if (kind === "request") f.ports.request.mockImplementation(() => { throw opaque; });
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow(kind === "resolver" ? "DNS_REJECTED" : "TRANSPORT_FAILED");
    expect(f.release).toHaveBeenCalledOnce(); expect(f.ports.clearTimer).toHaveBeenCalledOnce();
    if (kind === "request") expect(f.agents[0].destroy).toHaveBeenCalledOnce();
  });
  it.each([[301, "REDIRECT_REJECTED"], [302, "REDIRECT_REJECTED"], [429, "RATE_LIMITED"], [400, "PROVIDER_HTTP_REJECTED"], [500, "PROVIDER_HTTP_REJECTED"], [204, "PROVIDER_HTTP_REJECTED"]] as const)("sanitizes status %i with %s and never follows redirect", async (status, code) => {
    const f = fixture(); f.state.status = status;
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow(`M5_COINBASE_SMOKE_${code}`); expect(f.ports.request).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce();
  });
  it.each(["UTF8", "JSON", "request-error", "response-error"])("sanitizes %s and releases all resources", async kind => {
    const f = fixture(); if (kind === "UTF8") f.state.chunks = [new Uint8Array([0xc3, 0x28])]; else if (kind === "JSON") f.state.body = "{node-smoke-private-fixture"; else f.state.phase = kind;
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow(kind === "UTF8" ? "UTF8_INVALID" : kind === "JSON" ? "JSON_INVALID" : "TRANSPORT_FAILED");
    expect(f.requests[0].destroy).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce();
  });
  it.each(["abort", "timeout", "request-close", "response-close", "response-aborted"])("handles native event %s without exposing raw objects", async event => {
    const f = fixture(); f.state.phase = "body";
    const pending = runFakeSmoke(plan(), f.ports), rejected = expect(pending).rejects.toThrow(event === "timeout" ? "TIMEOUT" : event === "response-close" ? "STREAM_TRUNCATED" : event === "request-close" ? "TRANSPORT_CLOSED" : "TRANSPORT_FAILED");
    if (event === "request-close") f.state.phase = "connect";
    await vi.advanceTimersByTimeAsync(0);
    if (event === "response-close") { f.responses[0].closed = true; f.responses[0].emit("close"); }
    else if (event === "response-aborted") f.responses[0].emit("aborted");
    else if (event === "request-close") { f.requests[0].closed = true; f.requests[0].emit("close"); }
    else f.requests[0].emit(event);
    await rejected; expect(f.release).toHaveBeenCalledOnce(); expect(f.ports.request).toHaveBeenCalledOnce();
  });
});

describe("Coinbase monotonic deadline, cancellation and local lease", () => {
  it.each(["lease", "DNS", "connect", "body"])("times out %s with no retry and once-only cleanup", async phase => {
    const f = fixture(); let lateLease!: (value: { release(): void }) => void;
    if (phase === "lease") f.acquire.mockImplementation(() => new Promise(resolve => { lateLease = resolve; })); else f.state.phase = phase;
    const rejected = expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow(/^M5_COINBASE_SMOKE_TIMEOUT$/);
    await vi.advanceTimersByTimeAsync(5000); await rejected;
    if (phase === "lease") { lateLease({ release: f.release }); await vi.advanceTimersByTimeAsync(0); expect(f.ports.createResolver).not.toHaveBeenCalled(); }
    if (phase === "DNS") { f.resolvers[0].a!(null, ["8.8.8.8"]); f.resolvers[0].aaaa!(null, []); expect(f.ports.request).not.toHaveBeenCalled(); expect(f.resolvers[0].cancel).toHaveBeenCalledOnce(); }
    if (phase === "connect" || phase === "body") expect(f.requests[0].destroy).toHaveBeenCalledOnce();
    expect(f.acquire).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce(); expect(f.ports.clearTimer).toHaveBeenCalledOnce();
  });
  it.each(["lease", "DNS", "connect", "body"])("cancels %s without bytes or abort reason in error", async phase => {
    const f = fixture(), signal = new AbortController(); let lateLease!: (value: { release(): void }) => void;
    if (phase === "lease") f.acquire.mockImplementation(() => new Promise(resolve => { lateLease = resolve; })); else f.state.phase = phase;
    const rejected = expect(runFakeSmoke(plan(), f.ports, signal.signal)).rejects.toThrow(/^M5_COINBASE_SMOKE_CANCELLED$/);
    await vi.advanceTimersByTimeAsync(0); signal.abort("node-smoke-private-abort"); await rejected;
    if (phase === "lease") { lateLease({ release: f.release }); await vi.advanceTimersByTimeAsync(0); }
    expect(f.release).toHaveBeenCalledOnce(); expect(f.acquire).toHaveBeenCalledOnce(); expect(f.ports.clearTimer).toHaveBeenCalledOnce();
    if (phase === "connect" || phase === "body") expect(f.requests[0].destroy).toHaveBeenCalledOnce();
  });
  it("ignores late response/data/end after cancellation and destroys a late response", async () => {
    const f = fixture(), controller = new AbortController(); f.state.phase = "connect";
    const pending = runFakeSmoke(plan(), f.ports, controller.signal), rejected = expect(pending).rejects.toThrow("CANCELLED");
    await vi.advanceTimersByTimeAsync(0); const callback = f.requests[0].listeners("response")[0] as (res: IncomingMessage) => void;
    controller.abort(); await rejected; const late = new Response(); callback(late as unknown as IncomingMessage);
    late.emit("data", encode("node-smoke-private-late")); late.finish();
    expect(late.destroy).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce(); expect(f.ports.request).toHaveBeenCalledOnce();
  });
  it("does not reset the full deadline at the next request", async () => {
    const f = fixture(); f.state.resolverDelay = 2000;
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow("TIMEOUT");
    expect(f.ports.request).toHaveBeenCalledTimes(2); expect(f.ports.request.mock.calls.map(([options]) => options.timeout)).toEqual([3000, 1000]); expect(f.ports.setTimer).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledTimes(3);
  });
  it("rejects pre-aborted signals and backward clocks before unsafe phases", async () => {
    const f = fixture(), signal = new AbortController(); signal.abort("node-smoke-private-abort");
    await expect(runFakeSmoke(plan(), f.ports, signal.signal)).rejects.toThrow("CANCELLED"); expect(f.ports.createRateLease).not.toHaveBeenCalled();
    f.ports.now.mockReturnValueOnce(100).mockReturnValue(99);
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow("CLOCK_INVALID"); expect(f.acquire).not.toHaveBeenCalled();
  });
  it("local lease is FIFO, bounded to three unique profiles and release is idempotent", async () => {
    const rate = createRateLease(), controller = new AbortController(), order: number[] = [];
    const one = await rate.acquire("PRODUCT_IDENTITY", controller.signal); const second = rate.acquire("DAILY_CANDLES", controller.signal).then(lease => { order.push(2); return lease; });
    const third = rate.acquire("PRODUCT_STATS", controller.signal).then(lease => { order.push(3); return lease; });
    expect(await rate.acquire("PRODUCT_IDENTITY", controller.signal)).toBeNull(); expect(await rate.acquire("UNKNOWN", controller.signal)).toBeNull();
    one!.release(); one!.release(); const two = await second; expect(order).toEqual([2]); two!.release(); const three = await third; expect(order).toEqual([2, 3]); three!.release();
  });
  it("removes cancelled queue entries and never grants a fourth profile", async () => {
    const rate = createRateLease(), live = new AbortController(), cancelled = new AbortController();
    const held = await rate.acquire("PRODUCT_IDENTITY", live.signal);
    const rejected = expect(rate.acquire("DAILY_CANDLES", cancelled.signal)).rejects.toThrow("CANCELLED"); cancelled.abort(); await rejected;
    const third = rate.acquire("PRODUCT_STATS", live.signal); held!.release(); (await third)!.release();
    expect(await rate.acquire("DAILY_CANDLES", live.signal)).toBeNull();
  });
  it("denies a lease without DNS, request construction or retry", async () => {
    const f = fixture(); f.acquire.mockResolvedValue(null);
    await expect(runFakeSmoke(plan(), f.ports)).rejects.toThrow("RATE_LEASE_DENIED");
    expect(f.acquire).toHaveBeenCalledOnce(); expect(f.release).not.toHaveBeenCalled(); expect(f.ports.createResolver).not.toHaveBeenCalled(); expect(f.ports.createAgent).not.toHaveBeenCalled(); expect(f.ports.request).not.toHaveBeenCalled();
  });
});

describe("Coinbase operational composition and CLI stay blocked", () => {
  const authority = () => createCoinbaseSmokeAuthorization({ schemaVersion: COINBASE_SMOKE_VERSION, authorityStatus: COINBASE_SMOKE_STATUS, scope: COINBASE_SMOKE_SCOPE, profiles: COINBASE_SMOKE_PROFILES, limits: COINBASE_SMOKE_LIMITS, environment: "LOCAL_SMOKE", retention: "PROCESS_MEMORY_ONLY", reviewedAt: "2026-10-03T03:00:00.000Z", effectiveFrom: "2026-10-03T03:30:00.000Z", expiresAt: "2026-10-03T05:00:00.000Z", references: ["review:synthetic", "operator:synthetic"], recordedAt: receipt });
  it("public application and native entrypoint block authentic descriptions without creating native resources", async () => {
    const input = { authorization: authority(), environment: "LOCAL_SMOKE", evaluationAt: receipt };
    expect(createCoinbaseSmokeExecutor().execute({ ...input, config: config() })).toMatchObject({ status: "BLOCKED", requestCount: 0 });
    expect(executeCoinbaseNodeSmoke({ ...input, plan: plan() })).toMatchObject({ status: "BLOCKED", requestCount: 0 });
    const dns = await import("node:dns"), https = await import("node:https"); expect(dns.Resolver).not.toHaveBeenCalled(); expect(https.Agent).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled();
  });
  it.each(["headers", "agent", "credential", "socket", "ports", "registry"])("rejects caller %s before production resources", field => {
    expect(() => executeCoinbaseNodeSmoke({ authorization: authority(), plan: plan(), environment: "LOCAL_SMOKE", evaluationAt: receipt, [field]: "node-smoke-private-value" })).toThrow("SHAPE_INVALID");
  });
  it("rejects copied/fabricated plans before even the clock/lease factory", async () => {
    const f = fixture(); for (const input of [{ ...plan() }, JSON.parse(JSON.stringify(plan())), {}, new Proxy(plan(), {})]) {
      await expect(runFakeSmoke(input, f.ports)).rejects.toThrow("PLAN_NOT_RUNTIME_TRUSTED");
    }
    expect(f.ports.now).not.toHaveBeenCalled(); expect(f.ports.createRateLease).not.toHaveBeenCalled(); expect(f.ports.createResolver).not.toHaveBeenCalled(); expect(f.ports.request).not.toHaveBeenCalled();
  });
  it("CLI dry-run and execute both have zero native side effects", async () => {
    const args = ["--start", config().start, "--end", config().end];
    expect(runCoinbaseSmokeCli(args)).toMatchObject({ mode: "DRY_RUN", productionStatus: "BLOCKED_BACKEND_UNAPPROVED" });
    expect(runCoinbaseSmokeCli([...args, "--execute", "--environment", "LOCAL_SMOKE", "--authorization", "review:synthetic"])).toMatchObject({ mode: "EXECUTE", status: "BLOCKED", requestCount: 0 });
    const dns = await import("node:dns"), https = await import("node:https"); expect(dns.Resolver).not.toHaveBeenCalled(); expect(https.Agent).not.toHaveBeenCalled(); expect(https.request).not.toHaveBeenCalled();
  });
  it("production files export no socket/primitive factory or trust bypass and contain no credential/environment/persistence lookup", () => {
    const source = readFileSync("src/infrastructure/intelligence/m5-coinbase-node-smoke-transport.ts", "utf8");
    expect(source).toMatch(/^import "server-only";/); expect(source).not.toMatch(/process\.env|Date\.now|fetch\(|from .*postgres|from .*repository|from .*uow|test-only:|ForTest|testFlag|WeakSet/);
    expect([...source.matchAll(/export function (\w+)/g)].map(match => match[1])).toEqual(["executeCoinbaseNodeSmoke"]);
    const composition = readFileSync("src/application/intelligence/m5-coinbase-smoke-composition.ts", "utf8"); expect(composition).not.toMatch(/process\.env|node:dns|node:https|CredentialResolver|from .*uow/);
  });
});
