import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { M5ProviderInfrastructureError, type M5ProviderHttpTransport, type M5ProviderHttpTransportRequest, type M5ProviderHttpTransportResponse } from "@/application/intelligence/m5-provider-execution-boundary";

const HOSTS = new Set(["pro-api.coingecko.com", "api.etherscan.io"]);
function publicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 88 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0) || a >= 224);
}
function safeHeaders(headers: Record<string, string | string[] | number | undefined>): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const name of ["content-type", "retry-after", "x-request-id"]) {
    const value = headers[name];
    if (typeof value === "string" && value.length <= 256 && !/[\r\n]/.test(value)) result[name] = value;
  }
  return Object.freeze(result);
}

/** Node HTTPS transport with fixed provider hosts, pinned public IPv4 DNS, no redirect handling and bounded streaming. */
export class M5NodeProviderHttpTransport implements M5ProviderHttpTransport {
  async send(input: M5ProviderHttpTransportRequest): Promise<M5ProviderHttpTransportResponse> {
    const host = input.request.hostname;
    if (input.request.protocol !== "https:" || input.request.method !== "GET" || !HOSTS.has(host) || input.redirectPolicy !== "ERROR") throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_REQUEST_REJECTED");
    if (input.credential.kind !== "API_KEY" || !input.credential.value) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_CREDENTIAL_REQUIRED");
    const path = input.request.path;
    const query = new URLSearchParams();
    for (const { key, value } of input.request.query) query.append(key, value);
    const headers: Record<string, string> = { accept: "application/json" };
    if (host === "pro-api.coingecko.com") headers["x-cg-pro-api-key"] = input.credential.value;
    else query.append("apikey", input.credential.value);
    const addresses = await lookup(host, { all: true, family: 4, verbatim: true }).catch(() => {
      throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_DNS_FAILED");
    });
    if (addresses.length === 0 || addresses.some(item => !publicIpv4(item.address))) throw new M5ProviderInfrastructureError("M5_PROVIDER_TRANSPORT_DNS_REJECTED");
    const pinnedAddress = addresses[0]!.address;
    const requestPath = `${path}?${query.toString()}`;
    const options: RequestOptions = {
      protocol: "https:", hostname: host, servername: host, method: "GET", path: requestPath, headers,
      lookup: (_hostname, _options, callback) => callback(null, pinnedAddress, 4),
      signal: input.signal,
    };
    return await new Promise<M5ProviderHttpTransportResponse>((resolve, reject) => {
      let exceeded = false;
      let timedOut = false;
      const chunks: Buffer[] = [];
      let size = 0;
      const request = httpsRequest(options, response => {
        response.on("data", (chunk: Buffer | Uint8Array) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.byteLength;
          if (size > input.maxResponseBytes) {
            exceeded = true;
            response.destroy();
            request.destroy();
            return;
          }
          chunks.push(bytes);
        });
        response.on("end", () => {
          if (exceeded) { reject(new M5ProviderInfrastructureError("M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE")); return; }
          const status = response.statusCode ?? 0;
          const providerRequestId = response.headers["x-request-id"];
          resolve(Object.freeze({ status, headers: safeHeaders(response.headers), body: Buffer.concat(chunks, size), retrievedAt: new Date().toISOString(), ...(typeof providerRequestId === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(providerRequestId) && !/(?:secret|token|key|credential)/i.test(providerRequestId) ? { providerRequestId } : {}) }));
        });
        response.on("error", () => reject(new M5ProviderInfrastructureError(exceeded ? "M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE" : "M5_PROVIDER_TRANSPORT_FAILED")));
      });
      request.setTimeout(input.timeoutMs, () => { timedOut = true; request.destroy(); });
      request.on("error", () => reject(new M5ProviderInfrastructureError(timedOut ? "M5_PROVIDER_TRANSPORT_TIMEOUT" : exceeded ? "M5_PROVIDER_EXECUTION_RESPONSE_TOO_LARGE" : "M5_PROVIDER_TRANSPORT_FAILED")));
      request.end();
    });
  }
}
