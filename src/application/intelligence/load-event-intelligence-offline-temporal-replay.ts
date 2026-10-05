import "server-only";

import { notFound } from "next/navigation";
import type { EvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import type { OfflineReviewDemoDetail } from "@/application/intelligence/offline-review-demo-presentation";

export type OfflineTemporalReplayEpisode = Readonly<{
  key: "EARLIER" | "LATER";
  label: string;
  evaluatedAsOf: string;
  compositionStatus: "NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION";
  model: EvidenceReviewQueueViewModel;
  details: readonly OfflineReviewDemoDetail[];
}>;

export type OfflineTemporalReplayResult = Readonly<
  | { status: "AVAILABLE"; episodes: readonly [OfflineTemporalReplayEpisode, OfflineTemporalReplayEpisode] }
  | { status: "UNAVAILABLE"; reason: "CANDIDATE_REJECTED" | "COMPOSITION_INPUT_INVALID" | "COMPOSITION_CANDIDATE_UNTRUSTED" | "COMPOSITION_CUTOFF_MISMATCH" | "COMPOSITION_DISCOVERY_SET_INVALID" | "COMPOSITION_ROUTING_REJECTED" | "COMPOSITION_QUEUE_REJECTED" | "COMPOSITION_VIEW_MODEL_REJECTED" }
>;

/** Two fixed input sets, each sent through one independent server-side queue composition. */
export async function loadEventIntelligenceOfflineTemporalReplay(): Promise<OfflineTemporalReplayResult> {
  if (process.env.NODE_ENV !== "development") notFound();

  const [fixturesModule, compositionModule, presentationModule] = await Promise.all([
    import("@/application/intelligence/offline-review-demo-fixtures"),
    import("@/application/intelligence/compose-event-intelligence-evidence-review-queue"),
    import("@/application/intelligence/offline-review-demo-presentation"),
  ]);
  const inputEpisodes = fixturesModule.createOfflineReviewDemoReplayEpisodeFixtures();
  if (!inputEpisodes || inputEpisodes.length !== 2) return Object.freeze({ status: "UNAVAILABLE", reason: "CANDIDATE_REJECTED" });

  const episodes: OfflineTemporalReplayEpisode[] = [];
  for (const episode of inputEpisodes) {
    const composed = compositionModule.composeEventIntelligenceEvidenceReviewQueue({
      evaluationAsOf: episode.evaluatedAsOf,
      candidates: episode.fixtures.map(fixture => ({ candidate: fixture.candidate, routingMaterial: fixture.routingMaterial })),
    });
    if (composed.status !== "COMPOSED") return Object.freeze({ status: "UNAVAILABLE", reason: composed.code });

    const details = presentationModule.bindOfflineReviewDemoDetails(episode.fixtures, composed.composition.viewModel);
    if (!details || details.length !== episode.fixtures.length) return Object.freeze({ status: "UNAVAILABLE", reason: "COMPOSITION_VIEW_MODEL_REJECTED" });

    episodes.push(Object.freeze({
      key: episode.key,
      label: episode.label,
      evaluatedAsOf: composed.composition.evaluationAsOf,
      compositionStatus: composed.composition.status,
      model: composed.composition.viewModel,
      details,
    }));
  }

  if (episodes.length !== 2 || episodes[0]?.key !== "EARLIER" || episodes[1]?.key !== "LATER") {
    return Object.freeze({ status: "UNAVAILABLE", reason: "COMPOSITION_VIEW_MODEL_REJECTED" });
  }
  const episodeTuple = Object.freeze([episodes[0], episodes[1]] as const);
  return Object.freeze({ status: "AVAILABLE", episodes: episodeTuple });
}
