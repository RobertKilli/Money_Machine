import { evaluateHighInterest, type AlertCandidate, type HighInterestInput } from "@/domain/notifications/alerts";

/** Read-only projection of canonical M4/M5 evidence. Values are already
 * temporal and dataset scoped by the caller; this module only applies the
 * frozen M8 policy evaluator. */
export interface CanonicalHighInterestEvidence extends HighInterestInput {
  readonly availableAt: Date;
  readonly datasetPins: readonly string[];
  readonly evidenceIds: readonly string[];
}

export function deriveHighInterestCandidates(evidence: readonly CanonicalHighInterestEvidence[], asOf: Date, allowedDatasetPins?: readonly string[]): readonly AlertCandidate[] {
  const allowed = allowedDatasetPins ? new Set(allowedDatasetPins) : undefined;
  return Object.freeze(evidence
    .filter(item => item.availableAt.getTime() <= asOf.getTime() && item.asOf.getTime() <= asOf.getTime() && (!allowed || item.datasetPins.every(pin => allowed.has(pin))))
    .sort((a, b) => a.candidateId.localeCompare(b.candidateId))
    .map(item => evaluateHighInterest({ ...item, asOf }))
    .filter((candidate): candidate is AlertCandidate => candidate !== null));
}
