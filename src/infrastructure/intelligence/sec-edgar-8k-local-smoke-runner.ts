import "server-only";

import { adaptSecEdgar8kTransportExchange, type SecEdgar8kResponseAdapterCode, type SecEdgar8kFilingEvidence, type SecEdgar8kSanitizedDiagnostic } from "./sec-edgar-8k-response-adapter";
import { acquireSecEdgar8kManifestFirstExchange, type SecEdgar8kStagedResult, type SecEdgar8kTransportFailureCode } from "./sec-edgar-8k-node-transport";

export type SecEdgar8kLocalSmokeRunResult =
  | Readonly<{ status: "BLOCKED"; code: SecEdgar8kTransportFailureCode | SecEdgar8kResponseAdapterCode; diagnostic?: SecEdgar8kSanitizedDiagnostic; historyRequest?: Readonly<{ filename: string; url: string }> }>
  | Readonly<{ status: "VERIFIED"; evidence: SecEdgar8kFilingEvidence }>;

const safeTransportDiagnostic = (code: string): SecEdgar8kSanitizedDiagnostic | undefined => {
  if (code === "SEC_SMOKE_HTTP_STATUS_REJECTED") return Object.freeze({ stage: "TRANSPORT", reason: "HTTP_STATUS_REJECTED" });
  if (code === "SEC_SMOKE_CONTENT_TYPE_REJECTED") return Object.freeze({ stage: "TRANSPORT", reason: "CONTENT_TYPE_REJECTED" });
  return undefined;
};
const authenticVerifiedResults = new WeakSet<object>();

/** True only for the exact result object issued by this runner in this process. */
export function isAuthenticSecEdgar8kLocalSmokeResult(value: unknown): value is Extract<SecEdgar8kLocalSmokeRunResult, { status: "VERIFIED" }> {
  return !!value && typeof value === "object" && authenticVerifiedResults.has(value);
}

/** Server orchestration from an already-authentic request plan to reconciled metadata-only evidence. */
export async function runSecEdgar8kLocalSmoke(input: Readonly<{ initialPlan: unknown; operatorContact: unknown; authorizationId?: string; signal?: AbortSignal }>): Promise<SecEdgar8kLocalSmokeRunResult> {
  const exchange: SecEdgar8kStagedResult = await acquireSecEdgar8kManifestFirstExchange(input);
  if (exchange.status !== "COMPLETED") return Object.freeze({ status: "BLOCKED", code: exchange.code, ...("diagnostic" in exchange && exchange.diagnostic ? { diagnostic: exchange.diagnostic } : safeTransportDiagnostic(exchange.code) ? { diagnostic: safeTransportDiagnostic(exchange.code) } : {}) });
  const result = adaptSecEdgar8kTransportExchange(exchange, new Date().toISOString());
  if (result.status !== "VERIFIED") return result;
  const verified = Object.freeze({ status: "VERIFIED" as const, evidence: result.evidence });
  authenticVerifiedResults.add(verified);
  return verified;
}
