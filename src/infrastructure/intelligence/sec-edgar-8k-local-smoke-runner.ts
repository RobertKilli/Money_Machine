import "server-only";

import { adaptSecEdgar8kTransportExchange, type SecEdgar8kResponseAdapterCode, type SecEdgar8kFilingEvidence } from "./sec-edgar-8k-response-adapter";
import { acquireSecEdgar8kManifestFirstExchange, type SecEdgar8kStagedResult, type SecEdgar8kTransportFailureCode } from "./sec-edgar-8k-node-transport";

export type SecEdgar8kLocalSmokeRunResult =
  | Readonly<{ status: "BLOCKED"; code: SecEdgar8kTransportFailureCode | SecEdgar8kResponseAdapterCode; historyRequest?: Readonly<{ filename: string; url: string }> }>
  | Readonly<{ status: "VERIFIED"; evidence: SecEdgar8kFilingEvidence }>;

/** Server orchestration from an already-authentic request plan to reconciled metadata-only evidence. */
export async function runSecEdgar8kLocalSmoke(input: Readonly<{ initialPlan: unknown; operatorContact: unknown; signal?: AbortSignal }>): Promise<SecEdgar8kLocalSmokeRunResult> {
  const exchange: SecEdgar8kStagedResult = await acquireSecEdgar8kManifestFirstExchange(input);
  if (exchange.status !== "COMPLETED") return Object.freeze({ status: "BLOCKED", code: exchange.code });
  const result = adaptSecEdgar8kTransportExchange(exchange, new Date().toISOString());
  if (result.status !== "VERIFIED") return result;
  return Object.freeze({ status: "VERIFIED", evidence: result.evidence });
}
