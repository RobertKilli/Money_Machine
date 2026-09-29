import "server-only";
import { normalizeIngestionTimestamp } from "@/domain/intelligence/ingestion-provenance";
import { executeManualIngestionToLineage, type ManualIngestionResult } from "./manual-ingestion-to-lineage";
import type { ManualIngestionToLineageUnitOfWork } from "./manual-ingestion-to-lineage-uow";
import { isTrustedM5ProviderLiveAcquisitionForIngestion, type M5ProviderLiveAcquisitionReady } from "./m5-provider-live-acquisition";

/**
 * The only production-oriented bridge from an authenticated acquisition result
 * to manual ingestion. It intentionally owns no repository or raw payload.
 */
export type M5CoinGeckoAcquisitionIngestionRequest = Readonly<{
  acquisition: unknown;
  asOf: string;
  scope: Readonly<{
    providerId: "coingecko";
    datasetId: "coingecko-market-chart";
    datasetVersion: "coingecko-market-chart/range-v1";
    chain: "ethereum";
    contractAddress: string;
    endpointProfile: "COINGECKO_ETHEREUM_CONTRACT_MARKET_CHART_RANGE_PRO";
    endpointHostname: "pro-api.coingecko.com";
    endpointPath: string;
    canonicalQueryFingerprint: string;
    requestPlanFingerprint: string;
    approvalAuthorityId: string;
    approvalAuthorityFingerprint: string;
    parserContractVersion: string;
    payloadFingerprint: string;
  }>;
  apply: boolean;
  unitOfWork?: ManualIngestionToLineageUnitOfWork;
}>;

export type M5CoinGeckoAcquisitionIngestionResult =
  | Readonly<{ status: "READY"; ingestion: ManualIngestionResult }>
  | Readonly<{ status: "BLOCKED" | "INCOMPLETE"; code: string }>;

const canonicalTime = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try { return normalizeIngestionTimestamp(value, "M5_ACQUISITION_HANDOFF_AS_OF_INVALID") === value; } catch { return false; }
};
const safe = (status: "BLOCKED" | "INCOMPLETE", code: string): M5CoinGeckoAcquisitionIngestionResult => Object.freeze({ status, code });
const same = (left: Record<string, unknown>, right: Record<string, unknown>, keys: readonly string[]) => keys.every(key => left[key] === right[key]);

function bindingMatches(request: M5CoinGeckoAcquisitionIngestionRequest, acquisition: M5ProviderLiveAcquisitionReady): string | undefined {
  const binding = acquisition.ingestionHandoffBinding;
  if (!binding || acquisition.status !== "READY") return "M5_ACQUISITION_HANDOFF_BINDING_MISSING";
  if (!canonicalTime(request.asOf) || request.asOf !== acquisition.asOf) return "M5_ACQUISITION_HANDOFF_AS_OF_MISMATCH";
  if (!same(binding, request.scope, ["providerId", "datasetId", "datasetVersion", "chain", "contractAddress", "endpointProfile", "endpointHostname", "endpointPath", "canonicalQueryFingerprint", "requestPlanFingerprint", "approvalAuthorityId", "approvalAuthorityFingerprint", "parserContractVersion", "payloadFingerprint"])) return "M5_ACQUISITION_HANDOFF_SCOPE_MISMATCH";
  if (acquisition.scope.providerId !== binding.providerId || acquisition.scope.datasetId !== binding.datasetId || acquisition.scope.datasetVersion !== binding.datasetVersion || acquisition.payloadFingerprint !== binding.payloadFingerprint) return "M5_ACQUISITION_HANDOFF_MATERIAL_MISMATCH";
  const execution = acquisition.executions[0];
  if (binding.endpointHostname !== "pro-api.coingecko.com" || binding.endpointPath !== `/api/v3/coins/ethereum/contract/${binding.contractAddress}/market_chart/range` || acquisition.planFingerprints.length !== 1 || acquisition.planFingerprints[0] !== binding.requestPlanFingerprint || acquisition.executions.length !== 1 || execution?.payloadFingerprint !== binding.payloadFingerprint || execution.planFingerprint !== binding.requestPlanFingerprint || execution.scope.providerId !== binding.providerId || execution.scope.datasetId !== binding.datasetId || execution.scope.datasetVersion !== binding.datasetVersion || execution.receipt.providerId !== binding.providerId || execution.receipt.datasetId !== binding.datasetId || execution.receipt.datasetVersion !== binding.datasetVersion || execution.receipt.planFingerprint !== binding.requestPlanFingerprint || execution.receipt.receivedAt !== execution.receipt.effectiveAvailableAt) return "M5_ACQUISITION_HANDOFF_REQUEST_MISMATCH";
  const pkg = acquisition.normalizedPackage;
  if (pkg.providerId !== binding.providerId || pkg.datasetId !== binding.datasetId || pkg.datasetVersion !== binding.datasetVersion || pkg.parserContractVersion !== binding.parserContractVersion || pkg.requestScope.network !== "eth" || pkg.requestScope.coinId !== "ethereum" || pkg.requestScope.contractAddress !== binding.contractAddress || pkg.executionInput.endpointPath !== `https://${binding.endpointHostname}/api/v3/coins/ethereum/contract/{address}/market_chart/range` || pkg.records.some(record => record.providerRevision !== binding.payloadFingerprint || record.retrievedAt !== execution.receipt.receivedAt)) return "M5_ACQUISITION_HANDOFF_MATERIAL_MISMATCH";
  return undefined;
}

export async function executeM5CoinGeckoAcquisitionIngestionHandoff(input: M5CoinGeckoAcquisitionIngestionRequest): Promise<M5CoinGeckoAcquisitionIngestionResult> {
  // This is deliberately first: copied JSON, fabricated READY data, and every
  // smoke summary fail before package parsing, repository access, or a UoW.
  if (!isTrustedM5ProviderLiveAcquisitionForIngestion(input?.acquisition)) return safe("BLOCKED", "M5_ACQUISITION_HANDOFF_UNTRUSTED_ACQUISITION");
  const acquisition = input.acquisition;
  const code = bindingMatches(input, acquisition);
  if (code) return safe(code.includes("AS_OF") ? "INCOMPLETE" : "BLOCKED", code);
  // Deliberately do not catch persistence errors: transport/database failures
  // must remain infrastructure failures, never domain INVALID results.
  const ingestion = await executeManualIngestionToLineage(acquisition.normalizedPackage, { apply: input.apply, ...(input.unitOfWork ? { unitOfWork: input.unitOfWork } : {}) });
  return Object.freeze({ status: "READY", ingestion });
}
