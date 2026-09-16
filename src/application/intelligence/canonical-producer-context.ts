import type { IntelligenceAnalysisConfig } from "@/domain/intelligence/engine";
import { deriveCanonicalContextId } from "@/domain/intelligence/canonical-evidence";

export interface CanonicalProducerDatasetPin {
  readonly providerId: string;
  readonly datasetVersion: string;
}

export interface CanonicalProducerEvidenceRef {
  readonly evidenceId: string;
  readonly providerId: string;
  readonly datasetVersion: string;
  readonly assetId: string;
  readonly lineage: "MARKET_OBSERVATION" | "EXPLICIT_ASSET_EVIDENCE";
}

export interface CanonicalProducerSourceContext {
  readonly candidateId: string;
  readonly canonicalIdentifier: string;
  readonly assetId: string;
  readonly assetClass: string;
  readonly asOf: string;
  /** @deprecated Availability is derived from material evidence, not producer input. */
  readonly availableAt?: string;
  readonly providerDatasetPins: readonly CanonicalProducerDatasetPin[];
  readonly relevantEvidence: readonly CanonicalProducerEvidenceRef[];
}

const nonBlank = (value: string, code: string): string => {
  if (!value.trim()) throw new Error(code);
  return value;
};

const validTimestamp = (value: string, code: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error(code);
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== value) throw new Error(code);
  return value;
};

export function normalizeProducerDatasetPins(
  values: readonly CanonicalProducerDatasetPin[],
): readonly CanonicalProducerDatasetPin[] {
  const byProvider = new Map<string, CanonicalProducerDatasetPin>();
  for (const value of values) {
    const providerId = nonBlank(value.providerId, "PRODUCER_PROVIDER_ID_INVALID");
    const datasetVersion = nonBlank(value.datasetVersion, "PRODUCER_DATASET_VERSION_INVALID");
    const previous = byProvider.get(providerId);
    if (previous && previous.datasetVersion !== datasetVersion) {
      throw new Error("PRODUCER_DATASET_PIN_CONFLICT");
    }
    byProvider.set(providerId, { providerId, datasetVersion });
  }
  if (!byProvider.size) throw new Error("PRODUCER_DATASET_PINS_MISSING");
  return [...byProvider.values()].sort(
    (a, b) => a.providerId.localeCompare(b.providerId) || a.datasetVersion.localeCompare(b.datasetVersion),
  );
}

export function validateCanonicalProducerSourceContext(
  input: CanonicalProducerSourceContext,
): CanonicalProducerSourceContext {
  const candidateId = nonBlank(input.candidateId, "PRODUCER_CANDIDATE_ID_INVALID");
  const canonicalIdentifier = nonBlank(input.canonicalIdentifier, "PRODUCER_CANONICAL_IDENTIFIER_INVALID");
  const assetId = nonBlank(input.assetId, "PRODUCER_ASSET_ID_INVALID");
  const assetClass = nonBlank(input.assetClass, "PRODUCER_ASSET_CLASS_INVALID");
  if (assetClass === "UNKNOWN") throw new Error("PRODUCER_ASSET_CLASS_UNKNOWN");
  const asOf = validTimestamp(input.asOf, "PRODUCER_AS_OF_INVALID");
  const legacyAvailableAt = (input as CanonicalProducerSourceContext & { availableAt?: string }).availableAt;
  if (legacyAvailableAt !== undefined && validTimestamp(legacyAvailableAt, "PRODUCER_AVAILABLE_AT_INVALID") > asOf) throw new Error("PRODUCER_AVAILABLE_AT_AFTER_AS_OF");

  const providerDatasetPins = normalizeProducerDatasetPins(input.providerDatasetPins);
  const pinByProvider = new Map(providerDatasetPins.map(pin => [pin.providerId, pin.datasetVersion]));
  const evidenceById = new Map<string, CanonicalProducerEvidenceRef>();
  for (const value of input.relevantEvidence) {
    const evidenceId = nonBlank(value.evidenceId, "PRODUCER_EVIDENCE_ID_INVALID");
    const evidenceAssetId = nonBlank(value.assetId, "PRODUCER_EVIDENCE_ASSET_INVALID");
    const providerId = nonBlank(value.providerId, "PRODUCER_EVIDENCE_PROVIDER_INVALID");
    const datasetVersion = nonBlank(value.datasetVersion, "PRODUCER_EVIDENCE_DATASET_INVALID");
    if (value.lineage !== "MARKET_OBSERVATION" && value.lineage !== "EXPLICIT_ASSET_EVIDENCE") throw new Error("PRODUCER_EVIDENCE_LINEAGE_UNPROVEN");
    if (evidenceAssetId !== assetId) throw new Error("PRODUCER_EVIDENCE_ASSET_MISMATCH");
    if (pinByProvider.get(providerId) !== datasetVersion) throw new Error("PRODUCER_EVIDENCE_PIN_MISMATCH");
    const previous = evidenceById.get(evidenceId);
    const normalizedEvidence = { evidenceId, providerId, datasetVersion, assetId, lineage: value.lineage } as const;
    if (previous && JSON.stringify(previous) !== JSON.stringify(normalizedEvidence)) {
      throw new Error("PRODUCER_EVIDENCE_ID_CONFLICT");
    }
    evidenceById.set(evidenceId, normalizedEvidence);
  }

  return Object.freeze({
    candidateId,
    canonicalIdentifier,
    assetId,
    assetClass,
    asOf,
    providerDatasetPins: Object.freeze(providerDatasetPins),
    relevantEvidence: Object.freeze([...evidenceById.values()].sort(
      (a, b) => a.evidenceId.localeCompare(b.evidenceId),
    )),
  });
}

/** Shared evaluation-cycle identity; material M4/M5 evidence remains record-specific. */
export function canonicalContextIdForProducerContext(input: CanonicalProducerSourceContext): string {
  const context = validateCanonicalProducerSourceContext(input);
  return deriveCanonicalContextId({
    candidateId: context.candidateId,
    canonicalIdentifier: context.canonicalIdentifier,
    assetClass: context.assetClass,
    assetId: context.assetId,
    asOf: context.asOf,
  });
}

export function toIntelligenceAnalysisConfig(
  context: CanonicalProducerSourceContext,
  versions: Pick<
    IntelligenceAnalysisConfig,
    "engineVersion" | "featureSetVersion" | "eventSignatureVersion" | "trendPolicyVersion" | "regimePolicyVersion" | "analoguePolicyVersion"
  >,
): IntelligenceAnalysisConfig {
  const validated = validateCanonicalProducerSourceContext(context);
  return {
    ...versions,
    asOf: new Date(validated.asOf),
    providerDatasetPins: validated.providerDatasetPins,
    assetId: validated.assetId,
  };
}
