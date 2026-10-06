import "server-only";

import { notFound } from "next/navigation";
import type { EvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import type { EvidenceReviewQueueV2ViewModel } from "@/application/intelligence/project-event-intelligence-evidence-review-queue-v2-view-model";

const CUTOFF = "2026-10-03T12:00:00.000Z";

export type OfflineQueueV2ComparisonResult = Readonly<
  | { status: "UNAVAILABLE"; reason: "FIXTURE_REJECTED" | "V1_COMPOSITION_REJECTED" | "V2_COMPOSITION_REJECTED" | "CONFLICT_ROUTING_REJECTED" | "CONFLICT_EVALUATION_REJECTED" | "V2_VIEW_MODEL_REJECTED" }
  | {
      status: "AVAILABLE";
      cutoff: string;
      v1: Readonly<{ compositionVersion: string; compositionStatus: "NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION"; queueStatus: string; presentationVersion: string; model: EvidenceReviewQueueViewModel }>;
      v2: Readonly<{ compositionVersion: string; compositionStatus: "NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION"; queueVersion: string; queueStatus: string; presentationVersion: string; model: EvidenceReviewQueueV2ViewModel }>;
      conflict: Readonly<{
        label: string;
        declaredConflicts: readonly ["LIFECYCLE_CONFLICT", "AMOUNT_CURRENCY_CONFLICT"];
        v1: Readonly<{ reviewType: string; status: string; priority: string; nextAction: string; blockers: readonly string[] }>;
        v2: Readonly<{ reviewType: string; status: string; priority: string; nextAction: string; blockers: readonly string[] }>;
        sameClassification: boolean;
      }>;
    }
>;

const UNAVAILABLE = (reason: Extract<OfflineQueueV2ComparisonResult, { status: "UNAVAILABLE" }> ["reason"]): OfflineQueueV2ComparisonResult => Object.freeze({ status: "UNAVAILABLE", reason });

/** Runs the fixed offline V1/V2 comparison. The environment gate precedes every fixture and domain import. */
export async function loadEventIntelligenceOfflineQueueV2Comparison(): Promise<OfflineQueueV2ComparisonResult> {
  if (process.env.NODE_ENV !== "development") notFound();

  const [fixturesModule, v1CompositionModule, v2CompositionModule, v2ViewModelModule, queueModule, routingModule] = await Promise.all([
    import("@/application/intelligence/offline-review-demo-fixtures"),
    import("@/application/intelligence/compose-event-intelligence-evidence-review-queue"),
    import("@/application/intelligence/compose-event-intelligence-evidence-review-queue-v2"),
    import("@/application/intelligence/project-event-intelligence-evidence-review-queue-v2-view-model"),
    import("@/domain/intelligence/event-intelligence-evidence-review-queue"),
    import("@/domain/intelligence/event-intelligence-source-portfolio-routing-decision"),
  ]);
  const demo = fixturesModule.createOfflineReviewDemoQueueV2Fixtures();
  if (!demo) return UNAVAILABLE("FIXTURE_REJECTED");
  const entries = demo.fixtures.map(fixture => ({ candidate: fixture.candidate, routingMaterial: fixture.routingMaterial }));
  const asOf = fixturesModule.OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF;
  if (asOf !== CUTOFF) return UNAVAILABLE("FIXTURE_REJECTED");

  const v1Result = v1CompositionModule.composeEventIntelligenceEvidenceReviewQueue({ evaluationAsOf: asOf, candidates: entries });
  if (v1Result.status !== "COMPOSED") return UNAVAILABLE("V1_COMPOSITION_REJECTED");
  const v2Result = v2CompositionModule.composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: asOf, candidates: entries });
  if (v2Result.status !== "COMPOSED") return UNAVAILABLE("V2_COMPOSITION_REJECTED");
  const v2Model = v2ViewModelModule.projectEvidenceReviewQueueV2ToViewModel(v2Result.composition);
  if (!v2Model || !v2ViewModelModule.isAuthenticEvidenceReviewQueueV2ViewModel(v2Model)) return UNAVAILABLE("V2_VIEW_MODEL_REJECTED");

  const collision = demo.conflictFixture;
  const decision = routingModule.getSourcePortfolioDecision();
  let route = routingModule.evaluateSourcePortfolioRouting(decision, collision.routingMaterial);
  if (!route || !routingModule.isAuthenticRoutingEvaluation(route) || route.currentState !== "DISCOVERED") return UNAVAILABLE("CONFLICT_ROUTING_REJECTED");
  let steps = 1;
  while (route.nextState !== "STOPPED_BLOCKED" && route.nextState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE") {
    if (steps++ >= 9) return UNAVAILABLE("CONFLICT_ROUTING_REJECTED");
    const next = routingModule.evaluateSourcePortfolioRouting(decision, collision.routingMaterial, route);
    if (!next || !routingModule.isAuthenticRoutingEvaluation(next) || next.candidateId !== route.candidateId || next.evaluationAsOf !== asOf || next.currentState !== route.nextState) return UNAVAILABLE("CONFLICT_ROUTING_REJECTED");
    route = next;
  }
  const v1Conflict = queueModule.projectRoutingResultToEvidenceReviewItem(decision, route);
  const v2Conflict = queueModule.evaluateEvidenceReviewQueueV2(decision, [route]);
  if (!v1Conflict || !v2Conflict || v2Conflict.members.length !== 1) return UNAVAILABLE("CONFLICT_EVALUATION_REJECTED");
  const v2Member = v2Conflict.members[0]!;
  const conflictV1 = Object.freeze({ reviewType: v1Conflict.itemType, status: v1Conflict.status, priority: v1Conflict.priority, nextAction: v1Conflict.requiredNextAction, blockers: Object.freeze(v1Conflict.blockerReasons.map(blocker => blocker.code).sort()) });
  const conflictV2 = Object.freeze({ reviewType: v2Member.itemType, status: v2Member.status, priority: v2Member.priority, nextAction: v2Member.requiredNextAction, blockers: Object.freeze([...v2Member.blockerCodes].sort()) });
  const sameClassification = conflictV1.reviewType === conflictV2.reviewType && conflictV1.status === conflictV2.status && conflictV1.priority === conflictV2.priority && conflictV1.nextAction === conflictV2.nextAction && conflictV1.blockers.join("|") === conflictV2.blockers.join("|");

  return Object.freeze({
    status: "AVAILABLE",
    cutoff: asOf,
    v1: Object.freeze({ compositionVersion: v1Result.composition.version, compositionStatus: v1Result.composition.status, queueStatus: v1Result.composition.viewModel.state, presentationVersion: v1Result.composition.viewModel.version, model: v1Result.composition.viewModel }),
    v2: Object.freeze({ compositionVersion: v2Result.composition.version, compositionStatus: v2Result.composition.status, queueVersion: v2Result.composition.queue.contractVersion, queueStatus: v2Result.composition.queue.status, presentationVersion: v2Model.version, model: v2Model }),
    conflict: Object.freeze({ label: collision.label, declaredConflicts: Object.freeze(["LIFECYCLE_CONFLICT", "AMOUNT_CURRENCY_CONFLICT"]) as readonly ["LIFECYCLE_CONFLICT", "AMOUNT_CURRENCY_CONFLICT"], v1: conflictV1, v2: conflictV2, sameClassification }),
  });
}
