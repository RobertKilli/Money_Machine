import "server-only";
import { canonicalM4RecordFromSnapshot, canonicalM5RecordFromEvaluation } from "@/domain/intelligence/canonical-evidence";
import type { CanonicalM5Input } from "./m5-canonical-handoff";
import type { IntelligenceSnapshot } from "@/domain/intelligence/engine";
import { saveCanonicalM4Analysis, saveCanonicalM5Eligibility } from "@/infrastructure/postgres/canonical-intelligence-repository";
import { canonicalContextIdForProducerContext, validateCanonicalProducerSourceContext, type CanonicalProducerSourceContext } from "./canonical-producer-context";

/** The caller supplies the upstream identity and lineage; persistence never infers it. */
export async function persistCanonicalM4Analysis(input: { snapshot: IntelligenceSnapshot; sourceContext: CanonicalProducerSourceContext; featureSetVersion: string; trendPolicyVersion: string; accelerationVersion: string; datasetPins: readonly string[]; corroborationProviderIds: readonly string[]; corroborationEvidenceIds: readonly string[]; suspiciousFlags?: readonly string[] }): Promise<void> {
  const context = validateCanonicalProducerSourceContext(input.sourceContext);
  if (input.snapshot.asOf !== context.asOf) throw new Error("CANONICAL_CONTEXT_AS_OF_MISMATCH");
  await saveCanonicalM4Analysis(canonicalM4RecordFromSnapshot({ ...input, candidateId: context.candidateId, canonicalIdentifier: context.canonicalIdentifier, assetClass: context.assetClass, canonicalContextId: canonicalContextIdForProducerContext(context) }));
}
export async function persistCanonicalM5Eligibility(input: { canonicalInput: CanonicalM5Input; sourceContext: CanonicalProducerSourceContext }): Promise<void> {
  const context = validateCanonicalProducerSourceContext(input.sourceContext);
  const canonicalContextId = canonicalContextIdForProducerContext(context);
  if (input.canonicalInput.evaluation.candidateId !== context.candidateId || input.canonicalInput.evaluation.asOf !== context.asOf || input.canonicalInput.canonicalIdentifier !== context.canonicalIdentifier || input.canonicalInput.assetClass !== context.assetClass || input.canonicalInput.canonicalContextId !== canonicalContextId) throw new Error("CANONICAL_CONTEXT_AS_OF_MISMATCH");
  await saveCanonicalM5Eligibility(canonicalM5RecordFromEvaluation({ ...input.canonicalInput, canonicalIdentifier: context.canonicalIdentifier, assetClass: context.assetClass, canonicalContextId }));
}
