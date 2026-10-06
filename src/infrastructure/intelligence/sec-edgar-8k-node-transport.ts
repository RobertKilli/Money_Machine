import "server-only";
import { request as httpsRequest, type RequestOptions } from "node:https";
import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { types as utilTypes } from "node:util";
import { SEC_EDGAR_8K_ENDPOINT_PROFILES, deriveSecEdgar8kRequestPlanFromSubmissions, isAuthenticSecEdgar8kRequestPlan, isCurrentlyQualifiedSecEdgar8kRequestPlan, type SecEdgar8kRequestPlan } from "@/domain/intelligence/sec-edgar-8k-event-source-qualification";
import { SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS } from "./sec-edgar-8k-local-smoke-authorization";

export type SecEdgar8kTransportFailureCode = "SEC_SMOKE_AUTHORIZATION_REQUIRED" | "SEC_SMOKE_AUTHORIZATION_ALREADY_USED" | "SEC_SMOKE_OPERATOR_CONTACT_REQUIRED" | "SEC_SMOKE_REQUEST_PLAN_INVALID" | "SEC_SMOKE_SOURCE_NOT_CURRENTLY_QUALIFIED" | "SEC_SMOKE_HISTORY_PREFLIGHT_REQUIRED" | "SEC_SMOKE_RUN_LIMIT_EXCEEDED" | "SEC_SMOKE_REDIRECT_REJECTED" | "SEC_SMOKE_HTTP_STATUS_REJECTED" | "SEC_SMOKE_CONTENT_TYPE_REJECTED" | "SEC_SMOKE_RESPONSE_TOO_LARGE" | "SEC_SMOKE_TIMEOUT" | "SEC_SMOKE_ABORTED" | "SEC_SMOKE_NETWORK_ERROR";
export type SecEdgar8kTransportObservation = Readonly<{ profileId: SecEdgar8kRequestPlan["profileId"]; url: string; statusCode: number; contentType: string; byteLength: number; sha256: string; redirects: number }>;
export type SecEdgar8kTransportExchange = Readonly<{ status: "COMPLETED"; observations: readonly SecEdgar8kTransportObservation[] }>;
export type SecEdgar8kTransportResult =
  | Readonly<{ status: "BLOCKED"; code: SecEdgar8kTransportFailureCode }>
  | SecEdgar8kTransportExchange;
type StagedAdapterCode = import("./sec-edgar-8k-response-adapter").SecEdgar8kResponseAdapterCode;
export type SecEdgar8kStagedResult = SecEdgar8kTransportResult | Readonly<{ status: "BLOCKED"; code: StagedAdapterCode }>;

export const SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE = Object.freeze({
  company: "Microsoft Corporation",
  cik: "0000789019",
  form: "8-K",
  accession: "0001193125-23-255762",
  filingDate: "2023-10-13",
  acceptanceUtc: "2023-10-13T08:37:32.000Z",
  primaryDocument: "d537928d8k.htm",
  profileIds: Object.freeze(["COMPANY_SUBMISSIONS_JSON", "SUBMISSIONS_HISTORY_JSON", "FILING_INDEX"] as const),
  maxRequests: 3,
  minimumIntervalMs: 1000,
  timeoutMs: 10_000,
  maxResponseBytes: 2 * 1024 * 1024,
} as const);

const failure = (code: SecEdgar8kTransportFailureCode): SecEdgar8kTransportResult => Object.freeze({ status: "BLOCKED", code });
const CONTACT = /^[^\r\n<>]{2,80}\s+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>$/;
const hasExactDataShape = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  try {
    if (!value || typeof value !== "object" || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const ownKeys = Reflect.ownKeys(value);
    return ownKeys.length === keys.length && ownKeys.every((key) => typeof key === "string" && keys.includes(key) && (() => { const descriptor = Object.getOwnPropertyDescriptor(value, key); return !!descriptor && "value" in descriptor && !descriptor.get && !descriptor.set; })());
  } catch { return false; }
};
const hasDenseNativeArray = (value: unknown): value is unknown[] => {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
    for (let i = 0; i < value.length; i++) { const descriptor = Object.getOwnPropertyDescriptor(value, String(i)); if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) return false; }
    return true;
  } catch { return false; }
};
const profileFor = (id: string) => SEC_EDGAR_8K_ENDPOINT_PROFILES.find((profile) => profile.profileId === id);
const exactExpectedUrl = (plan: SecEdgar8kRequestPlan): string | null => {
  if (plan.profileId === "COMPANY_SUBMISSIONS_JSON") return `https://data.sec.gov/submissions/CIK${SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.cik}.json`;
  if (plan.profileId === "SUBMISSIONS_HISTORY_JSON") {
    const filename = new URL(plan.url).pathname.split("/").at(-1) ?? "";
    if (!new RegExp(`^CIK${SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.cik}-submissions-[0-9]+\\.json$`).test(filename)) return null;
    return `https://data.sec.gov/submissions/${filename}`;
  }
  if (plan.profileId === "FILING_INDEX") return "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm";
  return null;
};

function validPlan(value: unknown): value is SecEdgar8kRequestPlan {
  if (!isAuthenticSecEdgar8kRequestPlan(value)) return false;
  const plan = value;
  const profile = profileFor(plan.profileId);
  const expected = exactExpectedUrl(plan);
  if (!profile || !expected || plan.url !== expected || plan.method !== "GET" || plan.cik !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.cik || plan.accession !== SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.accession || plan.form !== "8-K" || plan.redirectHostPolicy !== "SAME_ALLOWLISTED_HOST_ONLY" || plan.rawBodyLogging !== "FORBIDDEN") return false;
  if (plan.timeoutMs < 1 || plan.timeoutMs > SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.timeoutMs || plan.maxResponseBytes < 1 || plan.maxResponseBytes > SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.maxResponseBytes || plan.attempts !== 1 || plan.pageCount !== 1 || plan.fileCount !== 1) return false;
  try {
    const url = new URL(plan.url);
    return url.protocol === "https:" && url.hostname === profile.hostname && url.username === "" && url.password === "" && url.port === "" && url.search === "" && url.hash === "" && plan.responseKind === profile.responseKind && plan.allowedContentTypes.length === profile.allowedContentTypes.length && plan.allowedContentTypes.every((type, i) => type === profile.allowedContentTypes[i]);
  } catch { return false; }
}

function matchingAuthorization(plans: readonly SecEdgar8kRequestPlan[], contact: string, now: string) {
  return SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS.find((authorization) =>
    authorization.cik === SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.cik && authorization.accession === SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.accession && authorization.form === "8-K" &&
    authorization.operatorContact === contact && authorization.minimumIntervalMs >= SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.minimumIntervalMs && authorization.maxRequests <= SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.maxRequests && Date.parse(now) < Date.parse(authorization.expiresAt) && plans.length <= authorization.maxRequests &&
    plans.every((plan) => authorization.profileIds.includes(plan.profileId as "COMPANY_SUBMISSIONS_JSON" | "SUBMISSIONS_HISTORY_JSON" | "FILING_INDEX") && plan.userAgentIdentityRef === authorization.userAgentIdentityRef)
  );
}

let requestTail: Promise<void> = Promise.resolve();
let lastRequestStartedAt = Number.NEGATIVE_INFINITY;
const usedAuthorizations = new WeakSet<object>();
const schedule = <T>(operation: () => Promise<T>, minimumIntervalMs: number, stillAuthorized: () => boolean, signal?: AbortSignal): Promise<T> => {
  const next = requestTail.then(async () => {
    // Leave scheduling overhead margin so the actual socket starts remain at
    // least the authorized interval apart, not merely the preceding timer marks.
    const waitMs = Math.max(0, minimumIntervalMs + 10 - (performance.now() - lastRequestStartedAt));
    if (waitMs > 0) await abortableDelay(waitMs, signal);
    if (signal?.aborted) throw failure("SEC_SMOKE_ABORTED");
    if (!stillAuthorized()) throw failure("SEC_SMOKE_AUTHORIZATION_REQUIRED");
    lastRequestStartedAt = performance.now();
    return operation();
  });
  requestTail = next.then(() => undefined, () => undefined);
  return next;
};

type ResponseValue = Readonly<{ statusCode: number; contentType: string; byteLength: number; sha256: string; bytes: Buffer; redirects: number }>;
type RequestPort = (options: RequestOptions, callback: (response: IncomingMessage) => void) => ReturnType<typeof httpsRequest>;
const privateExchangeBodies = new WeakMap<object, readonly Readonly<{ plan: SecEdgar8kRequestPlan; bytes: Buffer }>[] >();
const privateExchangeExpiryTimers = new WeakMap<object, NodeJS.Timeout>();
const PRIVATE_BODY_TTL_MS = 60_000;

function retainExchange(responses: readonly Readonly<{ plan: SecEdgar8kRequestPlan; response: ResponseValue }>[]): SecEdgar8kTransportExchange {
  const exchange = Object.freeze({ status: "COMPLETED" as const, observations: Object.freeze(responses.map(({ plan, response }) => Object.freeze({ profileId: plan.profileId, url: plan.url, statusCode: response.statusCode, contentType: response.contentType, byteLength: response.byteLength, sha256: response.sha256, redirects: response.redirects }))) });
  const bodies = Object.freeze(responses.map(({ plan, response }) => Object.freeze({ plan, bytes: response.bytes })));
  privateExchangeBodies.set(exchange, bodies);
  const expiry = setTimeout(() => {
    const retained = privateExchangeBodies.get(exchange);
    if (retained) for (const response of retained) response.bytes.fill(0);
    privateExchangeBodies.delete(exchange);
    privateExchangeExpiryTimers.delete(exchange);
  }, PRIVATE_BODY_TTL_MS);
  expiry.unref();
  privateExchangeExpiryTimers.set(exchange, expiry);
  return exchange;
}

function nativeAbortSignal(value: unknown): value is AbortSignal {
  try { return typeof AbortSignal !== "undefined" && value instanceof AbortSignal && !utilTypes.isProxy(value) && Object.getPrototypeOf(value) === AbortSignal.prototype; } catch { return false; }
}
function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(failure("SEC_SMOKE_ABORTED"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(failure("SEC_SMOKE_ABORTED")); };
    function cleanup() { signal?.removeEventListener("abort", onAbort); }
    function done() { cleanup(); resolve(); }
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function requestOnce(plan: SecEdgar8kRequestPlan, userAgent: string, requestPort: RequestPort, requestNumber: number, minimumIntervalMs: number, stillAuthorized: () => boolean, signal?: AbortSignal): Promise<ResponseValue> {
  return schedule(() => new Promise<ResponseValue>((resolve, reject) => {
    if (signal?.aborted) return reject(failure("SEC_SMOKE_ABORTED"));
    const target = new URL(plan.url);
    let settled = false;
    const chunks: Buffer[] = [];
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const failOnce = (code: SecEdgar8kTransportFailureCode) => {
      if (settled) return;
      settled = true;
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
      cleanup();
      reject(failure(code));
    };
    const rejectResponse = (response: IncomingMessage, code: SecEdgar8kTransportFailureCode) => { failOnce(code); response.destroy(); request.destroy(); };
    const onAbort = () => { request.destroy(); failOnce("SEC_SMOKE_ABORTED"); };
    const request = requestPort({ protocol: "https:", hostname: target.hostname, port: 443, path: target.pathname, method: "GET", headers: { Accept: plan.allowedContentTypes.join(", "), "Accept-Encoding": "identity", "User-Agent": userAgent }, timeout: plan.timeoutMs, servername: target.hostname, rejectUnauthorized: true, minVersion: "TLSv1.2" }, (response) => {
      response.on("aborted", () => rejectResponse(response, "SEC_SMOKE_NETWORK_ERROR"));
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        if (requestNumber >= SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.maxRequests) return rejectResponse(response, "SEC_SMOKE_RUN_LIMIT_EXCEEDED");
        let redirected: URL;
        try { redirected = new URL(location, target); } catch { return rejectResponse(response, "SEC_SMOKE_REDIRECT_REJECTED"); }
        if (redirected.protocol !== "https:" || redirected.hostname !== target.hostname || redirected.port !== "" || redirected.username || redirected.password || redirected.search || redirected.hash || redirected.pathname !== target.pathname) return rejectResponse(response, "SEC_SMOKE_REDIRECT_REJECTED");
        return rejectResponse(response, "SEC_SMOKE_REDIRECT_REJECTED");
      }
      if (status < 200 || status >= 300) return rejectResponse(response, "SEC_SMOKE_HTTP_STATUS_REJECTED");
      const rawContentType = response.headers["content-type"];
      const contentType = typeof rawContentType === "string" ? rawContentType.split(";", 1)[0]!.trim().toLowerCase() : "";
      const charset = typeof rawContentType === "string" ? rawContentType.match(/;\s*charset\s*=\s*["']?([^;"']+)/i)?.[1]?.trim().toLowerCase() : undefined;
      if (!plan.allowedContentTypes.includes(contentType) || (charset !== undefined && charset !== "utf-8" && charset !== "utf8")) return rejectResponse(response, "SEC_SMOKE_CONTENT_TYPE_REJECTED");
      const encoding = response.headers["content-encoding"];
      if (encoding && encoding !== "identity") return rejectResponse(response, "SEC_SMOKE_CONTENT_TYPE_REJECTED");
      const length = response.headers["content-length"];
      if (length !== undefined && (typeof length !== "string" || !/^\d+$/.test(length) || Number(length) > plan.maxResponseBytes)) return rejectResponse(response, "SEC_SMOKE_RESPONSE_TOO_LARGE");
      const digest = createHash("sha256");
      let received = 0;
      response.on("data", (chunk: Buffer | string) => {
        if (settled) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += bytes.length;
        if (received > plan.maxResponseBytes) { request.destroy(); response.destroy(); failOnce("SEC_SMOKE_RESPONSE_TOO_LARGE"); return; }
        digest.update(bytes);
        chunks.push(bytes);
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(Object.freeze({ statusCode: status, contentType, byteLength: received, sha256: digest.digest("hex"), bytes: Buffer.concat(chunks), redirects: 0 }));
        chunks.length = 0;
      });
      response.on("error", () => failOnce("SEC_SMOKE_NETWORK_ERROR"));
    });
    request.on("timeout", () => { request.destroy(); failOnce("SEC_SMOKE_TIMEOUT"); });
    request.on("error", (error: NodeJS.ErrnoException) => failOnce(error?.code === "ETIMEDOUT" ? "SEC_SMOKE_TIMEOUT" : "SEC_SMOKE_NETWORK_ERROR"));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) return onAbort();
    request.end();
  }), minimumIntervalMs, stillAuthorized, signal);
}

/** Manifest-first staged run. The caller supplies only the authentic submissions plan; later plans are derived privately. */
export async function acquireSecEdgar8kManifestFirstExchange(input: Readonly<{ initialPlan: unknown; operatorContact: unknown; signal?: AbortSignal }>): Promise<SecEdgar8kStagedResult> {
  if (!input || typeof input !== "object" || utilTypes.isProxy(input)) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
  let signal: unknown;
  try {
    const keys = Reflect.ownKeys(input);
    if (Object.getPrototypeOf(input) !== Object.prototype || keys.some((key) => typeof key !== "string" || !["initialPlan", "operatorContact", "signal"].includes(key))) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
    for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(input, key); if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID"); }
    if (!("initialPlan" in input) || !("operatorContact" in input)) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
    signal = Object.getOwnPropertyDescriptor(input, "signal")?.value;
  } catch { return failure("SEC_SMOKE_REQUEST_PLAN_INVALID"); }
  if (signal !== undefined && !nativeAbortSignal(signal)) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
  if (signal?.aborted) return failure("SEC_SMOKE_ABORTED");
  const initialPlan = input.initialPlan;
  if (!validPlan(initialPlan) || initialPlan.profileId !== "COMPANY_SUBMISSIONS_JSON") return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
  if (!isCurrentlyQualifiedSecEdgar8kRequestPlan(initialPlan, new Date().toISOString())) return failure("SEC_SMOKE_SOURCE_NOT_CURRENTLY_QUALIFIED");
  if (typeof input.operatorContact !== "string" || !CONTACT.test(input.operatorContact)) return failure("SEC_SMOKE_OPERATOR_CONTACT_REQUIRED");
  const authorizationCandidates = SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS.filter((candidate) =>
    candidate.cik === SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.cik && candidate.accession === SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.accession && candidate.form === "8-K" &&
    candidate.operatorContact === input.operatorContact && candidate.maxRequests === SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.maxRequests &&
    candidate.minimumIntervalMs >= SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.minimumIntervalMs && Date.now() < Date.parse(candidate.expiresAt) &&
    candidate.userAgentIdentityRef === initialPlan.userAgentIdentityRef && ["COMPANY_SUBMISSIONS_JSON", "SUBMISSIONS_HISTORY_JSON", "FILING_INDEX"].every((profile) => candidate.profileIds.includes(profile as "COMPANY_SUBMISSIONS_JSON" | "SUBMISSIONS_HISTORY_JSON" | "FILING_INDEX"))
  );
  if (authorizationCandidates.length === 0) return failure("SEC_SMOKE_AUTHORIZATION_REQUIRED");
  const authorization = authorizationCandidates.find((candidate) => !usedAuthorizations.has(candidate));
  if (!authorization) return failure("SEC_SMOKE_AUTHORIZATION_ALREADY_USED");
  usedAuthorizations.add(authorization); // one consumption for the whole run, never one per stage

  const userAgent = `MoneyMachine/1.0 (${authorization.operatorContact})`;
  const observations: { plan: SecEdgar8kRequestPlan; response: ResponseValue }[] = [];
  let transferred = false;
  let requestCount = 0;
  const authorizedNow = (plan: SecEdgar8kRequestPlan) => Date.now() < Date.parse(authorization.expiresAt) &&
    SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS.includes(authorization) && authorization.profileIds.includes(plan.profileId as "COMPANY_SUBMISSIONS_JSON" | "SUBMISSIONS_HISTORY_JSON" | "FILING_INDEX") &&
    plan.userAgentIdentityRef === authorization.userAgentIdentityRef && isCurrentlyQualifiedSecEdgar8kRequestPlan(plan, new Date().toISOString());
  const requestStage = async (plan: SecEdgar8kRequestPlan): Promise<SecEdgar8kTransportFailureCode | null> => {
    if (requestCount >= authorization.maxRequests || requestCount >= SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.maxRequests) return "SEC_SMOKE_RUN_LIMIT_EXCEEDED";
    if (!validPlan(plan)) return "SEC_SMOKE_REQUEST_PLAN_INVALID";
    if (!authorizedNow(plan)) return "SEC_SMOKE_AUTHORIZATION_REQUIRED";
    requestCount++;
    try {
      const response = await requestOnce(plan, userAgent, httpsRequest, requestCount, authorization.minimumIntervalMs, () => authorizedNow(plan), signal as AbortSignal | undefined);
      observations.push({ plan, response });
      return null;
    } catch (error) {
      return error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string" ? (error as { code: SecEdgar8kTransportFailureCode }).code : "SEC_SMOKE_NETWORK_ERROR";
    }
  };
  const probe = (entry: { plan: SecEdgar8kRequestPlan; response: ResponseValue }) => retainExchange([{ plan: entry.plan, response: Object.freeze({ ...entry.response, bytes: Buffer.from(entry.response.bytes) }) }]);
  try {
    const firstError = await requestStage(initialPlan);
    if (firstError) return failure(firstError);
    const { inspectSecEdgar8kSubmissionsStage, validateSecEdgar8kHistoryStage } = await import("./sec-edgar-8k-response-adapter");
    const manifest = inspectSecEdgar8kSubmissionsStage(probe(observations[0]!));
    if (manifest.status === "BLOCKED") return Object.freeze({ status: "BLOCKED", code: manifest.code });
    let historyFilename: string | null = null;
    if (manifest.status === "HISTORY_REQUIRED") {
      historyFilename = manifest.filename;
      const historyPlan = deriveSecEdgar8kRequestPlanFromSubmissions(initialPlan, "SUBMISSIONS_HISTORY_JSON", historyFilename, new Date().toISOString());
      if (!historyPlan || !validPlan(historyPlan)) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
      const historyError = await requestStage(historyPlan);
      if (historyError) return failure(historyError);
      const history = validateSecEdgar8kHistoryStage(probe(observations.at(-1)!), historyFilename);
      if (history.status !== "READY_FOR_INDEX") return Object.freeze({ status: "BLOCKED", code: history.status === "BLOCKED" ? history.code : "SEC_HISTORY_FILE_NOT_REFERENCED" });
    }
    const indexPlan = deriveSecEdgar8kRequestPlanFromSubmissions(initialPlan, "FILING_INDEX", null, new Date().toISOString());
    if (!indexPlan || !validPlan(indexPlan)) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
    const indexError = await requestStage(indexPlan);
    if (indexError) return failure(indexError);
    const exchange = retainExchange(observations);
    transferred = true;
    return exchange;
  } finally {
    if (!transferred) for (const entry of observations) entry.response.bytes.fill(0);
  }
}

/** No retries, no raw-body return/logging, and no request until a pinned permit exists. */
export async function acquireSecEdgar8kLocalSmokeExchange(input: Readonly<{ plans: readonly unknown[]; operatorContact: unknown; signal?: AbortSignal }>): Promise<SecEdgar8kTransportResult> {
  if (!input || typeof input !== "object" || utilTypes.isProxy(input)) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
  let signal: unknown;
  let hasSignal = false;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, "signal");
    hasSignal = descriptor !== undefined;
    if (descriptor && (!(("value" in descriptor)) || descriptor.get || descriptor.set)) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
    signal = descriptor?.value;
  } catch { return failure("SEC_SMOKE_REQUEST_PLAN_INVALID"); }
  if (!hasExactDataShape(input, hasSignal ? ["plans", "operatorContact", "signal"] : ["plans", "operatorContact"])) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
  if (signal !== undefined && !nativeAbortSignal(signal)) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
  if (signal?.aborted) return failure("SEC_SMOKE_ABORTED");
  const candidatePlans = input.plans;
  if (!hasDenseNativeArray(candidatePlans)) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
  if (candidatePlans.length > SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE.maxRequests) return failure("SEC_SMOKE_RUN_LIMIT_EXCEEDED");
  if (candidatePlans.length === 0 || !candidatePlans.every(validPlan)) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
  if (!candidatePlans.every((plan) => isCurrentlyQualifiedSecEdgar8kRequestPlan(plan, new Date().toISOString()))) return failure("SEC_SMOKE_SOURCE_NOT_CURRENTLY_QUALIFIED");
  if (typeof input.operatorContact !== "string" || !CONTACT.test(input.operatorContact)) return failure("SEC_SMOKE_OPERATOR_CONTACT_REQUIRED");
  const plans = candidatePlans as readonly SecEdgar8kRequestPlan[];
  // A history URL must be selected from the first SEC response before it is
  // requested. This one-shot batch API cannot do that safely, so fail closed.
  if (plans.length === 3) return failure("SEC_SMOKE_HISTORY_PREFLIGHT_REQUIRED");
  const allowedOrder = plans.length === 2 && plans[0]?.profileId === "COMPANY_SUBMISSIONS_JSON" && plans[1]?.profileId === "FILING_INDEX";
  if (!allowedOrder) return failure("SEC_SMOKE_REQUEST_PLAN_INVALID");
  const authorization = matchingAuthorization(plans, input.operatorContact, new Date().toISOString());
  if (!authorization) return failure("SEC_SMOKE_AUTHORIZATION_REQUIRED");
  if (usedAuthorizations.has(authorization)) return failure("SEC_SMOKE_AUTHORIZATION_ALREADY_USED");
  // A permit authorizes one invocation only; repeated calls cannot reset its
  // per-run request budget. Failed runs require a separately issued permit.
  usedAuthorizations.add(authorization);
  const userAgent = `MoneyMachine/1.0 (${authorization.operatorContact})`;
  const stillAuthorized = () => Date.now() < Date.parse(authorization.expiresAt) && SEC_EDGAR_8K_LOCAL_SMOKE_AUTHORIZATIONS.includes(authorization) && plans.every((plan) => isCurrentlyQualifiedSecEdgar8kRequestPlan(plan, new Date().toISOString()));
  const observations: SecEdgar8kTransportObservation[] = [];
  const privateResponses: { plan: SecEdgar8kRequestPlan; bytes: Buffer }[] = [];
  let requestCount = 0;
  try {
    for (const plan of plans) {
      if (!stillAuthorized()) return failure("SEC_SMOKE_AUTHORIZATION_REQUIRED");
      requestCount++;
      const response = await requestOnce(plan, userAgent, httpsRequest, requestCount, authorization.minimumIntervalMs, stillAuthorized, signal);
      observations.push(Object.freeze({ profileId: plan.profileId, url: plan.url, statusCode: response.statusCode, contentType: response.contentType, byteLength: response.byteLength, sha256: response.sha256, redirects: response.redirects }));
      privateResponses.push(Object.freeze({ plan, bytes: response.bytes }));
    }
  } catch (error) {
    for (const response of privateResponses) response.bytes.fill(0);
    privateResponses.length = 0;
    if (error && typeof error === "object" && "status" in error && (error as { status?: unknown }).status === "BLOCKED" && "code" in error && typeof (error as { code?: unknown }).code === "string") return error as SecEdgar8kTransportResult;
    return failure("SEC_SMOKE_NETWORK_ERROR");
  }
  const exchange = Object.freeze({ status: "COMPLETED" as const, observations: Object.freeze(observations) });
  privateExchangeBodies.set(exchange, Object.freeze(privateResponses));
  const expiry = setTimeout(() => {
    const retained = privateExchangeBodies.get(exchange);
    if (retained) for (const response of retained) response.bytes.fill(0);
    privateExchangeBodies.delete(exchange);
    privateExchangeExpiryTimers.delete(exchange);
  }, PRIVATE_BODY_TTL_MS);
  expiry.unref();
  privateExchangeExpiryTimers.set(exchange, expiry);
  return exchange;
}

/** One-shot adapter-only server accessor. Consuming bodies drops their private binding; copied exchanges cannot recover them. */
export function consumeSecEdgar8kExchangeBodiesForAdapter(exchange: unknown): readonly Readonly<{ plan: SecEdgar8kRequestPlan; bytes: Buffer }>[] | null {
  const responses = exchange && typeof exchange === "object" ? privateExchangeBodies.get(exchange) : undefined;
  if (!responses || !exchange || typeof exchange !== "object") return null;
  privateExchangeBodies.delete(exchange);
  const timer = privateExchangeExpiryTimers.get(exchange);
  if (timer) clearTimeout(timer);
  privateExchangeExpiryTimers.delete(exchange);
  const copies = responses.map(({ plan, bytes }) => Object.freeze({ plan, bytes: Buffer.from(bytes) }));
  for (const response of responses) response.bytes.fill(0);
  return Object.freeze(copies);
}

/** Public sanitized transport result; response bodies remain behind the module-local exchange binding. */
export async function executeSecEdgar8kLocalSmoke(input: Readonly<{ plans: readonly unknown[]; operatorContact: unknown; signal?: AbortSignal }>): Promise<SecEdgar8kTransportResult> {
  return acquireSecEdgar8kLocalSmokeExchange(input);
}

export const SEC_EDGAR_8K_LOCAL_SMOKE_DRY_RUN = Object.freeze({
  status: "BLOCKED" as const,
  requests: Object.freeze([
    Object.freeze({ profileId: "COMPANY_SUBMISSIONS_JSON", url: "https://data.sec.gov/submissions/CIK0000789019.json", purpose: "Current filing metadata; reconcile the selected accession and form." }),
    Object.freeze({ profileId: "FILING_INDEX", url: "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/0001193125-23-255762-index.htm", purpose: "One selected filing index, not a crawl." }),
  ]),
  conditionalHistoryRequest: Object.freeze({ profileId: "SUBMISSIONS_HISTORY_JSON", rule: "Only after the current submissions manifest is validated and the selected accession is absent from recent, the server selects exactly one CIK-owned history filename whose inclusive filingFrom/filingTo range covers 2023-10-13. That response must validate and contain the exact filing before the filing index is requested. No filename guessing, fan-out, caller-supplied history path, retries, or budget reset." }),
  missing: Object.freeze(["SEC_EDGAR_8K_QUALIFICATION_NOT_PINNED", "LOCAL_SMOKE_AUTHORIZATION_REGISTRY_EMPTY", "REAL_OPERATOR_CONTACT_NOT_SUPPLIED", "NO_LIVE_SEC_RESPONSE_HAS_BEEN_RECONCILED"]),
  networkRequests: 0,
});
