import {
  evaluateM5ProviderReadiness,
  isTrustedM5ProviderReadinessEvaluation,
  parseM5ProviderReadinessConfig,
  type M5ProviderCapability,
  type M5ProviderUsage,
  type ProviderCapabilityRequirement,
  type ProviderReadinessScope,
  type ProviderReadinessEvaluation,
  type ProviderReadinessExecutionRequest,
} from "@/domain/intelligence/m5-provider-readiness";

export const M5_DEFAULT_REQUIRED_CAPABILITIES: readonly ProviderCapabilityRequirement[] = [
  "DAILY_CLOSE_SERIES",
  "MARKET_CAP",
  "VOLUME_24H",
  "LIQUIDITY_COMPLETE_SET",
  "CONTRACT_VERIFICATION",
  "HOLDER_COMPLETE_UNIVERSE",
  "HOLDER_FINALITY",
  "VENUE_COMPLETE_UNIVERSE",
  "SUSPICIOUS_REQUIRED_INPUTS",
  "SUSPICIOUS_RULE_COVERAGE",
  "CANONICAL_ASSET_IDENTITY",
].map(capability => ({ capability: capability as M5ProviderCapability, completeness: "COMPLETE" as const }));

export const M5_DEFAULT_REQUESTED_USAGES: readonly M5ProviderUsage[] = [
  "NETWORK_ACQUISITION",
  "RAW_PAYLOAD_PROCESSING",
  "RAW_PAYLOAD_STORAGE",
  "NORMALIZED_STORAGE",
  "AUTHORITY_PERSISTENCE",
  "REDISTRIBUTION",
  "COMMERCIAL_USE",
];

const satisfiesExecutionRequest = (request: ProviderReadinessExecutionRequest, evaluation: ProviderReadinessEvaluation): boolean => {
  if (!Array.isArray(request.requiredCapabilities) || request.requiredCapabilities.length === 0 ||
    !Array.isArray(request.requestedUsages) || request.requestedUsages.length === 0 ||
    new Set(request.requiredCapabilities.map(item => item.capability)).size !== request.requiredCapabilities.length ||
    new Set(request.requestedUsages).size !== request.requestedUsages.length) return false;
  const evaluatedCapabilities = new Map(evaluation.requiredCapabilities.map(item => [item.capability, item.completeness]));
  return request.requiredCapabilities.every(item => {
    const evaluated = evaluatedCapabilities.get(item.capability);
    return evaluated === "COMPLETE" || evaluated === item.completeness;
  }) && request.requestedUsages.every(usage => evaluation.requestedUsages.includes(usage));
};

export function evaluateM5ProviderReadinessConfig(input: Readonly<{ config: unknown; evaluatedAt: string; requiredCapabilities?: readonly ProviderCapabilityRequirement[]; requestedUsages?: readonly M5ProviderUsage[]; expectedScope?: ProviderReadinessScope }>): ProviderReadinessEvaluation {
  try {
    const config = parseM5ProviderReadinessConfig(input.config);
    return evaluateM5ProviderReadiness({ config, evaluatedAt: input.evaluatedAt, requiredCapabilities: input.requiredCapabilities ?? M5_DEFAULT_REQUIRED_CAPABILITIES, requestedUsages: input.requestedUsages ?? M5_DEFAULT_REQUESTED_USAGES, expectedScope: input.expectedScope });
  } catch {
    return { result: "INVALID", providerId: "invalid", datasetId: "invalid", datasetVersion: "invalid", evaluatedAt: input.evaluatedAt, requiredCapabilities: Object.freeze([]), requestedUsages: Object.freeze([]), blockers: Object.freeze([{ code: "M5_READINESS_CONFIG_INVALID" }]) };
  }
}

/** Future network executors must call this guard before opening a provider request. */
export function assertM5ProviderReadinessForExecution(evaluation: ProviderReadinessEvaluation, request?: ProviderReadinessExecutionRequest): void {
  if (!isTrustedM5ProviderReadinessEvaluation(evaluation) || evaluation.result !== "READY") throw new Error("M5_PROVIDER_READINESS_BLOCKED");
  if (request !== undefined && (
    request.providerId !== evaluation.providerId ||
    request.datasetId !== evaluation.datasetId ||
    request.datasetVersion !== evaluation.datasetVersion ||
    !satisfiesExecutionRequest(request, evaluation)
  )) throw new Error("M5_PROVIDER_READINESS_SCOPE_MISMATCH");
}
