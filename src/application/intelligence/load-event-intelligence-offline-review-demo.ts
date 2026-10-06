import "server-only";

import { notFound } from "next/navigation";
import type { EvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import type { OfflineReviewDemoDetail } from "@/application/intelligence/offline-review-demo-presentation";

type DemoScenario = OfflineReviewDemoDetail & Readonly<{
  model: EvidenceReviewQueueViewModel;
}>;

export type OfflineReviewDemoResult = Readonly<
  | { status: "AVAILABLE"; evaluatedAsOf: string; scenarios: readonly DemoScenario[] }
  | { status: "UNAVAILABLE"; reason: "CANDIDATE_REJECTED" | "COMPOSITION_INPUT_INVALID" | "COMPOSITION_CANDIDATE_UNTRUSTED" | "COMPOSITION_CUTOFF_MISMATCH" | "COMPOSITION_DISCOVERY_SET_INVALID" | "COMPOSITION_ROUTING_REJECTED" | "COMPOSITION_QUEUE_REJECTED" | "COMPOSITION_VIEW_MODEL_REJECTED" }
>;

/** Development-only local composition. Returns only safe projected view models. */
export async function loadEventIntelligenceOfflineReviewDemo(): Promise<OfflineReviewDemoResult> {
  if (process.env.NODE_ENV !== "development") notFound();

  const [fixturesModule, compositionModule, presentationModule] = await Promise.all([
    import("@/application/intelligence/offline-review-demo-fixtures"),
    import("@/application/intelligence/compose-event-intelligence-evidence-review-queue"),
    import("@/application/intelligence/offline-review-demo-presentation"),
  ]);
  const fixtures = fixturesModule.createOfflineReviewDemoFixtures();
  if (!fixtures) return Object.freeze({ status: "UNAVAILABLE", reason: "CANDIDATE_REJECTED" });

  const scenarios: DemoScenario[] = [];
  for (const fixture of fixtures) {
    const composed = compositionModule.composeEventIntelligenceEvidenceReviewQueue({
      evaluationAsOf: fixturesModule.OFFLINE_REVIEW_DEMO_EVALUATION_AS_OF,
      candidates: [{ candidate: fixture.candidate, routingMaterial: fixture.routingMaterial }],
    });
    if (composed.status !== "COMPOSED") return Object.freeze({ status: "UNAVAILABLE", reason: composed.code });
    const [detail] = presentationModule.bindOfflineReviewDemoDetails([fixture], composed.composition.viewModel) ?? [];
    if (!detail) return Object.freeze({ status: "UNAVAILABLE", reason: "COMPOSITION_VIEW_MODEL_REJECTED" });

    scenarios.push(Object.freeze({
      ...detail,
      model: composed.composition.viewModel,
    }));
  }

  return Object.freeze({
    status: "AVAILABLE",
    evaluatedAsOf: fixturesModule.OFFLINE_REVIEW_DEMO_EVALUATION_AS_OF,
    scenarios: Object.freeze(scenarios),
  });
}
