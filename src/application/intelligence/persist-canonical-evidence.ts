import "server-only";
import { canonicalM4RecordFromSnapshot, canonicalM5RecordFromEvaluation, type SuspiciousEvidenceStatus } from "@/domain/intelligence/canonical-evidence";
import type { IntelligenceSnapshot } from "@/domain/intelligence/engine";
import type { EligibilityEvaluation } from "@/domain/discovery/asset-eligibility";
import { saveCanonicalM4Analysis, saveCanonicalM5Eligibility } from "@/infrastructure/postgres/canonical-intelligence-repository";

/** The caller supplies the upstream identity and lineage; persistence never infers it. */
export async function persistCanonicalM4Analysis(input: { snapshot: IntelligenceSnapshot; candidateId: string; canonicalIdentifier: string; assetClass: string; availableAt: Date; featureSetVersion: string; trendPolicyVersion: string; accelerationVersion: string; datasetPins: readonly string[]; corroborationProviderIds: readonly string[]; corroborationEvidenceIds: readonly string[]; suspiciousFlags?: readonly string[] }): Promise<void> {
  await saveCanonicalM4Analysis(canonicalM4RecordFromSnapshot(input));
}
export async function persistCanonicalM5Eligibility(input: { evaluation: EligibilityEvaluation; canonicalIdentifier: string; assetClass: string; availableAt: Date; evidenceIds: readonly string[]; datasetPins: readonly string[]; suspiciousFlags: readonly string[]; suspiciousEvidenceStatus: SuspiciousEvidenceStatus }): Promise<void> {
  await saveCanonicalM5Eligibility(canonicalM5RecordFromEvaluation(input));
}
