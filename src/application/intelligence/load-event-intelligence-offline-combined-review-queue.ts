import "server-only";

import { notFound } from "next/navigation";
import type { EvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import type { OfflineReviewDemoDetail } from "@/application/intelligence/offline-review-demo-presentation";

export type OfflineCombinedReviewQueueResult = Readonly<
  | {
      status: "AVAILABLE";
      evaluatedAsOf: string;
      compositionStatus: "NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION";
      model: EvidenceReviewQueueViewModel;
      details: readonly OfflineReviewDemoDetail[];
    }
  | {
      status: "UNAVAILABLE";
      reason: "CANDIDATE_REJECTED" | "COMPOSITION_INPUT_INVALID" | "COMPOSITION_CANDIDATE_UNTRUSTED" | "COMPOSITION_CUTOFF_MISMATCH" | "COMPOSITION_DISCOVERY_SET_INVALID" | "COMPOSITION_ROUTING_REJECTED" | "COMPOSITION_QUEUE_REJECTED" | "COMPOSITION_VIEW_MODEL_REJECTED";
    }
>;

/** One development-only composition for the fixed synthetic offline-demo fixtures. */
export async function loadEventIntelligenceOfflineCombinedReviewQueue(): Promise<OfflineCombinedReviewQueueResult> {
  if (process.env.NODE_ENV !== "development") notFound();

  const [fixturesModule, compositionModule, presentationModule] = await Promise.all([
    import("@/application/intelligence/offline-review-demo-fixtures"),
    import("@/application/intelligence/compose-event-intelligence-evidence-review-queue"),
    import("@/application/intelligence/offline-review-demo-presentation"),
  ]);
  const fixtures = fixturesModule.createOfflineReviewDemoFixtures();
  if (!fixtures) return Object.freeze({ status: "UNAVAILABLE", reason: "CANDIDATE_REJECTED" });

  const composed = compositionModule.composeEventIntelligenceEvidenceReviewQueue({
    evaluationAsOf: fixturesModule.OFFLINE_REVIEW_DEMO_EVALUATION_AS_OF,
    candidates: fixtures.map(fixture => ({ candidate: fixture.candidate, routingMaterial: fixture.routingMaterial })),
  });
  if (composed.status !== "COMPOSED") return Object.freeze({ status: "UNAVAILABLE", reason: composed.code });
  const details = presentationModule.bindOfflineReviewDemoDetails(fixtures, composed.composition.viewModel);
  if (!details || details.length !== 3) return Object.freeze({ status: "UNAVAILABLE", reason: "COMPOSITION_VIEW_MODEL_REJECTED" });

  return Object.freeze({
    status: "AVAILABLE",
    evaluatedAsOf: composed.composition.evaluationAsOf,
    compositionStatus: composed.composition.status,
    model: composed.composition.viewModel,
    details,
  });
}
