import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as compositionModule from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import {
  createOfflineReviewDemoFixtures,
  createOfflineReviewDemoReplayEpisodeFixtures,
  OFFLINE_REVIEW_DEMO_EARLIER_EVALUATION_AS_OF,
  OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF,
} from "@/application/intelligence/offline-review-demo-fixtures";
import { getComposedCandidatePublicKey } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import type { NewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import type { SyntheticRoutingMaterial } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { loadEventIntelligenceOfflineTemporalReplay, type OfflineTemporalReplayEpisode } from "@/application/intelligence/load-event-intelligence-offline-temporal-replay";
import { createSyntheticNewsDiscoveryCandidate, isAuthenticNewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import { parseSyntheticRoutingMaterial } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { EvidenceReviewQueueWorkspace } from "@/components/intelligence/evidence-review-queue-workspace";
import { OfflineTemporalReplayEpisodeSection } from "@/components/intelligence/offline-temporal-replay-episode-section";
import { bindOfflineReviewDemoDetails } from "@/application/intelligence/offline-review-demo-presentation";
import ReplayPage from "@/app/intelligence/events/review/offline-demo/replay/page";
import DemoPage from "@/app/intelligence/events/review/offline-demo/page";
import CombinedPage from "@/app/intelligence/events/review/offline-demo/combined/page";

function workspacePropsForEpisode(episode: OfflineTemporalReplayEpisode) {
  const found: Record<string, unknown>[] = [];
  const visit = (node: ReactNode): void => {
    if (!isValidElement(node)) return;
    if (node.type === EvidenceReviewQueueWorkspace) {
      found.push(node.props as Record<string, unknown>);
      return;
    }
    if (node.type === OfflineTemporalReplayEpisodeSection) {
      const props = node.props as { episode: typeof episode };
      visit(OfflineTemporalReplayEpisodeSection(props));
      return;
    }
    Children.forEach((node.props as { children?: ReactNode }).children, visit);
  };
  visit(createElement(OfflineTemporalReplayEpisodeSection, { episode }));
  return found;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fixed offline temporal replay", () => {
  it("composes each explicit input set at its own cutoff through existing contracts", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const composeSpy = vi.spyOn(compositionModule, "composeEventIntelligenceEvidenceReviewQueue");

    const result = await loadEventIntelligenceOfflineTemporalReplay();

    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") return;
    expect(composeSpy).toHaveBeenCalledTimes(2);
    expect(result.episodes.map(episode => [episode.key, episode.evaluatedAsOf, episode.model.state, episode.model.items.length])).toEqual([
      ["EARLIER", OFFLINE_REVIEW_DEMO_EARLIER_EVALUATION_AS_OF, "HAS_REVIEW_ITEMS", 2],
      ["LATER", OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, "HAS_REVIEW_ITEMS", 3],
    ]);

    type CompositionInput = {
      evaluationAsOf: string;
      candidates: readonly { candidate: NewsDiscoveryCandidate; routingMaterial: SyntheticRoutingMaterial }[];
    };
    const earlyInput = composeSpy.mock.calls[0]?.[0] as unknown as CompositionInput | undefined;
    const laterInput = composeSpy.mock.calls[1]?.[0] as unknown as CompositionInput | undefined;
    expect(earlyInput?.evaluationAsOf).toBe(OFFLINE_REVIEW_DEMO_EARLIER_EVALUATION_AS_OF);
    expect(laterInput?.evaluationAsOf).toBe(OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF);
    expect(earlyInput?.candidates).toHaveLength(2);
    expect(laterInput?.candidates).toHaveLength(3);
    for (const input of [earlyInput!, laterInput!]) {
      for (const entry of input.candidates) {
        expect(isAuthenticNewsDiscoveryCandidate(entry.candidate)).toBe(true);
        expect(parseSyntheticRoutingMaterial(entry.routingMaterial).status).toBe("VALID");
        expect(entry.candidate.record.recordedAt <= input.evaluationAsOf).toBe(true);
        expect(entry.candidate.record.receivedAt <= input.evaluationAsOf).toBe(true);
        expect(entry.candidate.evaluatedAt).toBe(input.evaluationAsOf);
        expect(entry.routingMaterial.evaluationAsOf).toBe(input.evaluationAsOf);
      }
    }
    expect(earlyInput?.candidates.map(entry => entry.candidate.record.providerRecordId)).toEqual(["offline-demo-mapping", "offline-demo-rights"]);
    expect(laterInput?.candidates.map(entry => entry.candidate.record.providerRecordId)).toEqual(["offline-demo-mapping", "offline-demo-rights", "offline-demo-correction"]);

    const [earlier, later] = result.episodes;
    expect(earlier.compositionStatus).toBe("NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION");
    expect(later.compositionStatus).toBe("NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION");
    expect(earlier.model.items.map(item => [item.reviewType, item.status, item.operationalPriority])).toEqual([
      ["RIGHTS_APPROVAL_REVIEW", "BLOCKED", "BLOCKED_RIGHTS"],
      ["ISSUER_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED"],
    ]);
    expect(later.model.items.map(item => [item.reviewType, item.status, item.operationalPriority])).toEqual([
      ["CORRECTION_LINEAGE_REVIEW", "BLOCKED", "URGENT_CORRECTION_REVIEW"],
      ["RIGHTS_APPROVAL_REVIEW", "BLOCKED", "BLOCKED_RIGHTS"],
      ["ISSUER_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED"],
    ]);
    expect(earlier.model.items.every(item => item.historical && !item.correctionPresent)).toBe(true);
    expect(later.model.items.every(item => item.historical)).toBe(true);
    expect(later.model.items.find(item => item.reviewType === "CORRECTION_LINEAGE_REVIEW")).toMatchObject({ correctionPresent: true, retracted: false, superseded: false });
    expect(earlier.model.items.filter(item => item.reviewType === "RIGHTS_APPROVAL_REVIEW" || item.reviewType === "ISSUER_MAPPING_REVIEW").map(item => [item.reviewType, item.status, item.operationalPriority])).toEqual(
      later.model.items.filter(item => item.reviewType === "RIGHTS_APPROVAL_REVIEW" || item.reviewType === "ISSUER_MAPPING_REVIEW").map(item => [item.reviewType, item.status, item.operationalPriority]),
    );
    expect(earlier.details.map(detail => detail.key)).toEqual(["issuer-mapping", "rights-blocked"]);
    expect(later.details.map(detail => detail.key)).toEqual(["issuer-mapping", "rights-blocked", "unresolved-correction"]);
  });

  it("isolates recordedAt cutoff rejection and accepts equality at the public discovery boundary", () => {
    const episodes = createOfflineReviewDemoReplayEpisodeFixtures();
    expect(episodes).toHaveLength(2);
    if (!episodes) return;
    const early = episodes[0]!;
    const later = episodes[1]!;
    expect(early.fixtures.map(fixture => fixture.key)).toEqual(["issuer-mapping", "rights-blocked"]);
    const correction = later.fixtures.find(fixture => fixture.key === "unresolved-correction");
    expect(correction?.candidate.record).toMatchObject({
      publishedAt: "2026-10-02T08:00:00.000Z",
      discoveredAt: "2026-10-02T08:01:00.000Z",
      receivedAt: "2026-10-02T08:01:01.000Z",
      recordedAt: "2026-10-02T08:01:01.000Z",
    });
    expect(createSyntheticNewsDiscoveryCandidate(correction!.candidate.record, early.evaluatedAsOf)).toBeNull();
    const validLater = createSyntheticNewsDiscoveryCandidate(correction!.candidate.record, later.evaluatedAsOf);
    expect(validLater).not.toBeNull();
    expect(isAuthenticNewsDiscoveryCandidate(validLater)).toBe(true);

    // Keep the same valid record shape and make publication, discovery and receipt exactly
    // available at the early cutoff; only recordedAt is outside that cutoff by one millisecond.
    const recordedAfterCutoff = Object.freeze({
      ...correction!.candidate.record,
      publishedAt: early.evaluatedAsOf,
      discoveredAt: early.evaluatedAsOf,
      receivedAt: early.evaluatedAsOf,
      recordedAt: "2026-10-02T00:00:00.001Z",
    });
    expect(isAuthenticNewsDiscoveryCandidate(createSyntheticNewsDiscoveryCandidate(recordedAfterCutoff, "2026-10-02T00:00:00.001Z"))).toBe(true);
    expect(createSyntheticNewsDiscoveryCandidate(recordedAfterCutoff, early.evaluatedAsOf)).toBeNull();
    const recordedAtCutoff = Object.freeze({ ...recordedAfterCutoff, recordedAt: early.evaluatedAsOf });
    expect(isAuthenticNewsDiscoveryCandidate(createSyntheticNewsDiscoveryCandidate(recordedAtCutoff, early.evaluatedAsOf))).toBe(true);
  });

  it("keeps repeated loader runs deterministic, fixture data isolated, and WeakMap bindings episode-local", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const firstInputSets = createOfflineReviewDemoReplayEpisodeFixtures()!;
    const secondInputSets = createOfflineReviewDemoReplayEpisodeFixtures()!;
    expect(firstInputSets).not.toBe(secondInputSets);
    expect(firstInputSets[0]!.fixtures[0]!.candidate).not.toBe(firstInputSets[1]!.fixtures[0]!.candidate);
    expect(firstInputSets[0]!.fixtures[0]!.candidate).not.toBe(secondInputSets[0]!.fixtures[0]!.candidate);
    expect(firstInputSets[0]!.fixtures[0]!.routingMaterial.seenFamilies).not.toBe(firstInputSets[1]!.fixtures[0]!.routingMaterial.seenFamilies);
    expect(firstInputSets[1]!.fixtures[0]!.routingMaterial.seenFamilies).not.toBe(secondInputSets[1]!.fixtures[0]!.routingMaterial.seenFamilies);
    expect(firstInputSets.every(episode => episode.fixtures.every(fixture => Object.isFrozen(fixture) && Object.isFrozen(fixture.reviewGuidance) && Object.isFrozen(fixture.routingMaterial) && Object.isFrozen(fixture.sourceMaterial) && Object.isFrozen(fixture.sourceMaterial.evidence) && fixture.sourceMaterial.evidence.every(Object.isFrozen)))).toBe(true);

    const first = await loadEventIntelligenceOfflineTemporalReplay();
    const second = await loadEventIntelligenceOfflineTemporalReplay();
    expect(first.status).toBe("AVAILABLE");
    expect(second.status).toBe("AVAILABLE");
    if (first.status !== "AVAILABLE" || second.status !== "AVAILABLE") return;
    expect(first.episodes.map(episode => episode.model)).toEqual(second.episodes.map(episode => episode.model));
    const laterFixtures = createOfflineReviewDemoFixtures()!;
    const correctionId = laterFixtures.find(fixture => fixture.key === "unresolved-correction")!.candidate.candidateId;
    expect(getComposedCandidatePublicKey(first.episodes[0]!.model, correctionId)).toBeNull();
    expect(getComposedCandidatePublicKey(first.episodes[1]!.model, correctionId)).not.toBeNull();
    expect(first.episodes[0]!.details.every(detail => first.episodes[0]!.model.items.some(item => item.publicKey === detail.item.publicKey))).toBe(true);
    expect(first.episodes[1]!.details.every(detail => first.episodes[1]!.model.items.some(item => item.publicKey === detail.item.publicKey))).toBe(true);

    const earlyFixtures = firstInputSets[0]!.fixtures;
    const episodeLaterFixtures = firstInputSets[1]!.fixtures;
    expect(bindOfflineReviewDemoDetails(earlyFixtures, first.episodes[0]!.model)).not.toBeNull();
    expect(bindOfflineReviewDemoDetails([earlyFixtures[0]!, earlyFixtures[0]!], first.episodes[0]!.model)).toBeNull();
    expect(bindOfflineReviewDemoDetails([earlyFixtures[0]!, episodeLaterFixtures[2]!], first.episodes[0]!.model)).toBeNull();
    expect(bindOfflineReviewDemoDetails(earlyFixtures.slice(0, 1), first.episodes[0]!.model)).toBeNull();
    const reordered = bindOfflineReviewDemoDetails([...episodeLaterFixtures].reverse(), first.episodes[1]!.model);
    expect(reordered?.map(detail => [detail.key, detail.item.reviewType])).toEqual([
      ["unresolved-correction", "CORRECTION_LINEAGE_REVIEW"],
      ["rights-blocked", "RIGHTS_APPROVAL_REVIEW"],
      ["issuer-mapping", "ISSUER_MAPPING_REVIEW"],
    ]);
    const copiedModel = JSON.parse(JSON.stringify(first.episodes[1]!.model)) as typeof first.episodes[number]["model"];
    expect(getComposedCandidatePublicKey(copiedModel, correctionId)).toBeNull();
    expect(bindOfflineReviewDemoDetails(episodeLaterFixtures, copiedModel)).toBeNull();
  });

  it("renders both workspaces with isolated ids, local links, and only degraded client props", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await loadEventIntelligenceOfflineTemporalReplay();
    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") return;
    const html = renderToStaticMarkup(await ReplayPage());
    const overview = renderToStaticMarkup(await DemoPage());
    const combined = renderToStaticMarkup(await CombinedPage());

    expect(html).toContain("2026-10-02T00:00:00.000Z");
    expect(html).toContain("2026-10-03T12:00:00.000Z");
    expect(html).toContain("Totalt antall kandidater</dt><dd class=\"mt-1 text-sm tabular-nums\">2");
    expect(html).toContain("Totalt antall kandidater</dt><dd class=\"mt-1 text-sm tabular-nums\">3");
    expect(html).toContain("Correction lineage requires review");
    const laterStart = html.indexOf("Senere observasjon");
    const correctionStart = html.indexOf("Correction lineage requires review");
    expect(laterStart).toBeGreaterThan(-1);
    expect(correctionStart).toBeGreaterThan(laterStart);
    expect(html).toContain("offline-demo-correction");
    expect(html).toContain("href=\"/intelligence/events/review/offline-demo/combined\"");
    expect(html).toContain("href=\"/intelligence/events/review/offline-demo\"");
    expect(overview).toContain("href=\"/intelligence/events/review/offline-demo/replay\"");
    expect(combined).toContain("href=\"/intelligence/events/review/offline-demo/replay\"");

    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(([, value]) => value);
    expect(new Set(ids).size).toBe(ids.length);
    const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map(([, value]) => value);
    for (const fragment of fragments) expect(ids).toContain(fragment);
    for (const [, labels] of html.matchAll(/\saria-labelledby="([^"]+)"/g)) {
      for (const id of labels.split(/\s+/)) expect(ids).toContain(id);
    }

    const props = result.episodes.flatMap(workspacePropsForEpisode);
    expect(props).toHaveLength(2);
    expect(props.map(value => value.idPrefix)).toEqual(["temporal-replay-earlier", "temporal-replay-later"]);
    for (const value of props) {
      expect(Object.keys(value).sort()).toEqual(["detailLinks", "idPrefix", "model", "presentation"]);
      expect(JSON.stringify(value)).not.toMatch(/candidateId|sourceMaterial|fixtureId|routingMaterial|routingResultId|fingerprint|trust/i);
    }
    expect(JSON.stringify(await loadEventIntelligenceOfflineTemporalReplay())).not.toMatch(/candidateId|routingMaterial|routingResultId|fingerprint|trust/i);
  });
});
