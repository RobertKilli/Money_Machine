import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { M5ProviderInfrastructureError, type M5ProviderHttpTransport, type M5ProviderHttpTransportRequest, type M5ProviderHttpTransportResponse } from "@/application/intelligence/m5-provider-execution-boundary";

const CG_HOST = "pro-api.coingecko.com";
const CG_DEMO_HOST = "api.coingecko.com";
const ES_HOST = "api.etherscan.io";
const ALLOWED_HOSTS = new Set([CG_HOST, CG_DEMO_HOST, ES_HOST]);
const CONTROL = /[\u0000-\u001f\u007f]/;
function dataObject(value: unknown, allowed: readonly string[], required: readonly string[], code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new M5ProviderInfrastructureError(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new M5ProviderInfrastructureError(code);
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== "string" || !allowed.includes(key)) || required.some(key => !keys.includes(key))) throw new M5ProviderInfrastructureError(code);
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new M5ProviderInfrastructureError(code);
  }
  return value as Record<string, unknown>;
}
export function isM5PublicProviderIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 88 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) || a >= 224);
}
export function validateM5ProviderTransportRequestShape(input: unknown): void {
  checkedRequest(input as M5ProviderHttpTransportRequest);
}
function safeHeaders(headers: Record<string, string | string[] | number | undefined>): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const name of ["content-type", "retry-after"]) {
    const value = headers[name];
    if (typeof value === "string" && value.length <= 256 && !/[\r\n]/.test(value)) result[name] = value;
  }
  return Object.freeze(result);
}
export function m5ProviderAuthenticationHeaders(host: string, credential: string): Readonly<Record<string, string>> {
  if (host === CG_HOST) return Object.freeze({ "x-cg-pro-api-key": credential });
  if (host === CG_DEMO_HOST) return Object.freeze({ "x-cg-demo-api-key": credential });
  if (host === ES_HOST) return Object.freeze({});
  throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_HOST_REJECTED");
}
function checkedRequest(input: unknown) {
  const root = dataObject(input, ["request", "credential", "timeoutMs", "maxResponseBytes", "redirectPolicy", "signal", "attemptOrdinal"], ["request", "credential", "timeoutMs", "maxResponseBytes", "redirectPolicy", "attemptOrdinal"], "M5_PROVIDER_TRANSPORT_REQUEST_REJECTED");
  const request = dataObject(root.request, ["protocol", "method", "hostname", "path", "query"], ["protocol", "method", "hostname", "path", "query"], "M5_PROVIDER_TRANSPORT_REQUEST_REJECTED");
  if (request.protocol !== "https:" || request.method !== "GET" || typeof request.hostname !== "string" || !ALLOWED_HOSTS.has(request.hostname) || root.redirectPolicy !== "ERROR") throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_REQUEST_REJECTED");
  if (!Number.isSafeInteger(root.timeoutMs) || (root.timeoutMs as number) < 1 || (root.timeoutMs as number) > 120_000 || !Number.isSafeInteger(root.maxResponseBytes) || (root.maxResponseBytes as number) < 1 || (root.maxResponseBytes as number) > 10 * 1024 * 1024 || !Number.isSafeInteger(root.attemptOrdinal) || (root.attemptOrdinal as number) < 1 || (root.attemptOrdinal as number) > 10) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_LIMIT_INVALID");
  const path = request.path;
  if (typeof path !== "string" || path.includes("\\") || path.includes("//") || path.includes("?") || path.includes("#") || CONTROL.test(path) || /%(?:2f|5c|2e)/i.test(path)) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_PATH_REJECTED");
  let decoded: string;
  try { decoded = decodeURIComponent(path); } catch { throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_PATH_REJECTED"); }
  if (decoded.split("/").some(segment => segment === "." || segment === "..")) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_PATH_REJECTED");
  if (!Array.isArray(request.query) || Object.getPrototypeOf(request.query) !== Array.prototype || Object.getOwnPropertySymbols(request.query).length || Object.getOwnPropertyNames(request.query).length !== request.query.length + 1) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_QUERY_REJECTED");
  for (let index = 0; index < request.query.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(request.query, String(index));
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_QUERY_REJECTED");
  }
  const query = request.query.map(item => {
    const row = dataObject(item, ["key", "value"], ["key", "value"], "M5_PROVIDER_TRANSPORT_QUERY_REJECTED");
    if (typeof row.key !== "string" || typeof row.value !== "string" || CONTROL.test(row.key) || CONTROL.test(row.value) || /[&#?=]/.test(row.value)) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_QUERY_REJECTED");
    return { key: row.key, value: row.value };
  });
  if (new Set(query.map(row => row.key)).size !== query.length) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_QUERY_REJECTED");
  const values = new Map(query.map(row => [row.key, row.value]));
  if (request.hostname === CG_HOST || request.hostname === CG_DEMO_HOST) {
    const expected = ["from", "interval", "to", "vs_currency"];
    if (!/^\/api\/v3\/coins\/ethereum\/contract\/0x[0-9a-f]{40}\/market_chart\/range$/.test(path) || query.map(row => row.key).sort().join("\0") !== expected.sort().join("\0") || values.get("vs_currency") !== "usd" || values.get("interval") !== "daily" || !/^\d+$/.test(values.get("from") ?? "") || !/^\d+$/.test(values.get("to") ?? "") || BigInt(values.get("from")!) > BigInt(values.get("to")!)) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_SCOPE_REJECTED");
  } else {
    const action = values.get("action");
    const creation = action === "getcontractcreation" && values.has("contractaddresses") && !values.has("address");
    const source = action === "getsourcecode" && values.has("address") && !values.has("contractaddresses");
    const address = values.get(creation ? "contractaddresses" : "address");
    const expected = creation ? ["action", "chainid", "contractaddresses", "module"] : ["action", "address", "chainid", "module"];
    if (path !== "/v2/api" || (!creation && !source) || values.get("chainid") !== "1" || values.get("module") !== "contract" || !/^0x[0-9a-f]{40}$/.test(address ?? "") || query.map(row => row.key).sort().join("\0") !== expected.sort().join("\0")) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_SCOPE_REJECTED");
  }
  const credential = dataObject(root.credential, ["kind", "value"], ["kind"], "M5_PROVIDER_TRANSPORT_CREDENTIAL_REQUIRED");
  if (credential.kind !== "API_KEY" || typeof credential.value !== "string" || !credential.value || credential.value.length > 8192 || credential.value.trim() !== credential.value || CONTROL.test(credential.value) || /(?:https?:\/\/|:\/\/|[\/?#&=])/i.test(credential.value)) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_CREDENTIAL_REQUIRED");
  return { root, request, credential: credential.value, query };
}

/** Fixed-host, request-shape-validated HTTPS transport with pinned public DNS and a total deadline. */
export class M5NodeProviderHttpTransport implements M5ProviderHttpTransport {
  isCredentialUrlSafeForSmoke(providerId: string): boolean {
    // Etherscan V2 documents only query-string API-key authentication; smoke forbids secrets in URLs.
    return providerId !== "etherscan";
  }

  async send(input: M5ProviderHttpTransportRequest): Promise<M5ProviderHttpTransportResponse> {
    const { root, request, credential, query: plannedQuery } = checkedRequest(input);
    const host = request.hostname as string;
    const controller = new AbortController();
    let timedOut = false;
    let externalAbort = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const external = root.signal as AbortSignal | undefined;
    if (external !== undefined && !(external instanceof AbortSignal)) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_REQUEST_REJECTED");
    if (external && external.aborted) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_ABORTED");
    const abortFromCaller = () => { externalAbort = true; controller.abort(); };
    let rejectExternalAbort: (() => void) | undefined;
    external?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_TIMEOUT")); }, root.timeoutMs as number);
    });
    const aborted = external ? new Promise<never>((_, reject) => { rejectExternalAbort = () => reject(new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_ABORTED")); external.addEventListener("abort", rejectExternalAbort, { once: true }); }) : undefined;
    const urlQuery = new URLSearchParams();
    for (const item of plannedQuery) urlQuery.append(item.key, item.value);
    const headers: Record<string, string> = { accept: "application/json", ...m5ProviderAuthenticationHeaders(host, credential) };
    if (host === ES_HOST) urlQuery.append("apikey", credential);
    const requestPath = `${request.path as string}?${urlQuery.toString()}`;
    const work = (async (): Promise<M5ProviderHttpTransportResponse> => {
      const addresses = await lookup(host, { all: true, family: 4, verbatim: true }).catch(() => { throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_DNS_FAILED"); });
      if (controller.signal.aborted) throw new M5ProviderInfrastructureError(timedOut ? "M5_PROVIDER_TRANSPORT_TIMEOUT" : "M5_PROVIDER_TRANSPORT_ABORTED");
      if (addresses.length === 0 || addresses.some(item => !isM5PublicProviderIpv4(item.address))) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_DNS_REJECTED");
      const pinnedAddress = addresses[0]!.address;
      const options: RequestOptions = { protocol: "https:", hostname: host, servername: host, method: "GET", path: requestPath, headers,
        lookup: (_hostname, lookupOptions, callback) => {
          if (lookupOptions && typeof lookupOptions === "object" && "all" in lookupOptions && lookupOptions.all) callback(null, [{ address: pinnedAddress, family: 4 }]);
          else callback(null, pinnedAddress, 4);
        }, signal: controller.signal };
      return await new Promise<M5ProviderHttpTransportResponse>((resolve, reject) => {
        let settled = false;
        let exceeded = false;
        const fail = (code: string) => { if (!settled) { settled = true; reject(new M5ProviderInfrastructureError(code)); } };
        const chunks: Buffer[] = [];
        let size = 0;
        const req = httpsRequest(options, response => {
          const contentEncoding = response.headers["content-encoding"];
          const rawLength = response.headers["content-length"];
          if ((contentEncoding !== undefined && contentEncoding !== "identity") || (typeof rawLength === "string" && /^\d+$/.test(rawLength) && BigInt(rawLength) > BigInt(root.maxResponseBytes as number))) {
            exceeded = true; response.destroy(); req.destroy(); fail(contentEncoding !== undefined && contentEncoding !== "identity" ? "M5_PROVIDER_EXECUTION_CONTENT_ENCODING_REJECTED" : "M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE"); return;
          }
          response.on("data", (chunk: Buffer | Uint8Array) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += bytes.byteLength;
            if (size > (root.maxResponseBytes as number)) { exceeded = true; response.destroy(); req.destroy(); fail("M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE"); return; }
            chunks.push(bytes);
          });
          response.on("aborted", () => fail("M5_PROVIDER_TRANSPORT_TRUNCATED_BODY"));
          response.on("end", () => {
            if (settled) return;
            if (!response.complete) { fail("M5_PROVIDER_TRANSPORT_TRUNCATED_BODY"); return; }
            settled = true;
            const status = response.statusCode ?? 0;
            resolve(Object.freeze({ status, headers: safeHeaders(response.headers), body: Buffer.concat(chunks, size), retrievedAt: new Date().toISOString() }));
          });
          response.on("error", () => fail(exceeded ? "M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE" : "M5_PROVIDER_TRANSPORT_FAILED"));
        });
        req.on("error", () => fail(timedOut ? "M5_PROVIDER_TRANSPORT_TIMEOUT" : externalAbort ? "M5_PROVIDER_TRANSPORT_ABORTED" : exceeded ? "M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE" : "M5_PROVIDER_TRANSPORT_FAILED"));
        req.end();
      });
    })();
    try { return await Promise.race([work, timeout, ...(aborted ? [aborted] : [])]); }
    catch (error) {
      if (error instanceof M5ProviderInfrastructureError) throw error;
      throw new M5ProviderInfrastructureError(timedOut ? "M5_PROVIDER_TRANSPORT_TIMEOUT" : externalAbort ? "M5_PROVIDER_TRANSPORT_ABORTED" : "M5_PROVIDER_TRANSPORT_FAILED");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      external?.removeEventListener("abort", abortFromCaller);
      if (rejectExternalAbort) external?.removeEventListener("abort", rejectExternalAbort);
    }
  }
}
