import "server-only";
import { getEventIntelligenceQueueV2CompositionMemberBinding, type EventIntelligenceQueueV2Composition } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue-v2";
import { validateFreshOfflineReviewSessionEvaluationReference, type OfflineReviewSessionEvaluationReference } from "@/application/intelligence/offline-review-milestone-session";
import type { NewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import { isAuthenticRoutingEvaluation, isRoutingEvaluationForDecision, type RoutingEvaluation, type SourcePortfolioDecision } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import type { ReviewMilestone } from "@/domain/intelligence/event-intelligence-review-milestone-evidence";
import { getOfflineReviewMilestoneRoutingContext } from "@/application/intelligence/offline-review-milestone-evidence";

export const OFFLINE_REVIEW_READINESS_VERSION = "event-intelligence-offline-review-readiness/v1" as const;
export type OfflineReviewReadiness = Readonly<{ version: typeof OFFLINE_REVIEW_READINESS_VERSION; status: "ASSESSED"; localReview: "NO_REVIEW_EVIDENCE" | "COMPLETED_PROCEED" | "COMPLETED_STOP" | "HELD"; queueStatus: string; queuePriority: string; blockers: readonly string[]; authorization: "NOT_ESTABLISHED"; progression: "NOT_GRANTED"; inventoryGuarantee: "EXACT_SESSION_OPERATIONS_ONLY"; synthetic: true; authority: "NONE" }>;
export type OfflineReviewReadinessResult = Readonly<{ status: "ASSESSED"; assessment: OfflineReviewReadiness }> | Readonly<{ status: "REJECTED"; code: "EVALUATION_REFERENCE_REJECTED" | "COMPOSITION_BINDING_MISMATCH" }>;
const TRUST = new WeakSet<object>();

/** Composes only already-authenticated local review and V2 queue facts; it never grants progression. */
export function assessOfflineReviewReadiness(input: Readonly<{ reference: OfflineReviewSessionEvaluationReference; session: unknown; candidate: unknown; routing: unknown; decision: unknown; milestone: ReviewMilestone; policy: Readonly<{ policyId: string; policyVersion: string; algorithmVersion: string }>; cutoff: string; composition: EventIntelligenceQueueV2Composition }>): OfflineReviewReadinessResult {
  const evaluation = validateFreshOfflineReviewSessionEvaluationReference(input.reference, { session: input.session, candidate: input.candidate, routing: input.routing, decision: input.decision, milestone: input.milestone, policy: input.policy, cutoff: input.cutoff });
  if (evaluation.status !== "FRESH") return Object.freeze({ status: "REJECTED", code: "EVALUATION_REFERENCE_REJECTED" });
  const binding = getEventIntelligenceQueueV2CompositionMemberBinding(input.composition, input.candidate, undefined, input.decision);
  if (!binding || !isAuthenticRoutingEvaluation(input.routing) || !isRoutingEvaluationForDecision(input.decision as SourcePortfolioDecision, input.routing) || !getOfflineReviewMilestoneRoutingContext(input.candidate, input.routing) || (input.routing as RoutingEvaluation).candidateId !== (input.candidate as NewsDiscoveryCandidate).candidateId || (input.routing as RoutingEvaluation).evaluationAsOf !== input.cutoff || binding.member.evaluationAsOf !== input.cutoff || !(binding.candidate as NewsDiscoveryCandidate).candidateId) return Object.freeze({ status: "REJECTED", code: "COMPOSITION_BINDING_MISMATCH" });
  const localReview = evaluation.evaluation.status === "NO_REVIEW_EVIDENCE" ? "NO_REVIEW_EVIDENCE" : evaluation.evaluation.status === "COMPLETED_PROCEED" ? "COMPLETED_PROCEED" : evaluation.evaluation.status === "COMPLETED_STOP" ? "COMPLETED_STOP" : "HELD";
  const assessment = Object.freeze({ version: OFFLINE_REVIEW_READINESS_VERSION, status: "ASSESSED" as const, localReview, queueStatus: binding.member.status, queuePriority: binding.member.priority, blockers: Object.freeze([...binding.member.blockerCodes]), authorization: "NOT_ESTABLISHED" as const, progression: "NOT_GRANTED" as const, inventoryGuarantee: "EXACT_SESSION_OPERATIONS_ONLY" as const, synthetic: true as const, authority: "NONE" as const });
  TRUST.add(assessment);
  return Object.freeze({ status: "ASSESSED" as const, assessment });
}

export function isAuthenticOfflineReviewReadiness(value: unknown): value is OfflineReviewReadiness { return !!value && typeof value === "object" && TRUST.has(value); }
