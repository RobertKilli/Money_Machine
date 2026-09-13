import "server-only";
import { canonicalM4RecordFromSnapshot, canonicalM5RecordFromEvaluation, type SuspiciousEvidenceStatus } from "@/domain/intelligence/canonical-evidence";
import type { IntelligenceSnapshot } from "@/domain/intelligence/engine";
import type { EligibilityEvaluation } from "@/domain/discovery/asset-eligibility";
import { saveCanonicalM4Analysis, saveCanonicalM5Eligibility } from "@/infrastructure/postgres/canonical-intelligence-repository";
import { canonicalContextIdForProducerContext, validateCanonicalProducerSourceContext, type CanonicalProducerSourceContext } from "./canonical-producer-context";

/** The caller supplies the upstream identity and lineage; persistence never infers it. */
export async function persistCanonicalM4Analysis(input: { snapshot: IntelligenceSnapshot; sourceContext: CanonicalProducerSourceContext; availableAt: Date; featureSetVersion: string; trendPolicyVersion: string; accelerationVersion: string; datasetPins: readonly string[]; corroborationProviderIds: readonly string[]; corroborationEvidenceIds: readonly string[]; suspiciousFlags?: readonly string[] }): Promise<void> {
  const context = validateCanonicalProducerSourceContext(input.sourceContext);
  if (input.snapshot.asOf !== context.asOf) throw new Error("CANONICAL_CONTEXT_AS_OF_MISMATCH");
  await saveCanonicalM4Analysis(canonicalM4RecordFromSnapshot({ ...input, candidateId: context.candidateId, canonicalIdentifier: context.canonicalIdentifier, assetClass: context.assetClass, canonicalContextId: canonicalContextIdForProducerContext(context) }));
}
export async function persistCanonicalM5Eligibility(input: { evaluation: EligibilityEvaluation; sourceContext: CanonicalProducerSourceContext; availableAt: Date; evidenceIds: readonly string[]; datasetPins: readonly string[]; suspiciousFlags: readonly string[]; suspiciousEvidenceStatus: SuspiciousEvidenceStatus }): Promise<void> {
  const context = validateCanonicalProducerSourceContext(input.sourceContext);
  if (input.evaluation.candidateId !== context.candidateId || input.evaluation.asOf !== context.asOf) throw new Error("CANONICAL_CONTEXT_AS_OF_MISMATCH");
  await saveCanonicalM5Eligibility(canonicalM5RecordFromEvaluation({ ...input, canonicalIdentifier: context.canonicalIdentifier, assetClass: context.assetClass, canonicalContextId: canonicalContextIdForProducerContext(context) }));
}
