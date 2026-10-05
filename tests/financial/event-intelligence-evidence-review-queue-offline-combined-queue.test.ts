import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as compositionModule from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import { createOfflineReviewDemoFixtures } from "@/application/intelligence/offline-review-demo-fixtures";
import { loadEventIntelligenceOfflineCombinedReviewQueue } from "@/application/intelligence/load-event-intelligence-offline-combined-review-queue";
import { isAuthenticNewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import { parseSyntheticRoutingMaterial } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import CombinedQueuePage from "@/app/intelligence/events/review/offline-demo/combined/page";
import OfflineDemoPage from "@/app/intelligence/events/review/offline-demo/page";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("offline combined evidence review queue", () => {
  it("builds deterministic fixtures with isolated mutable routing material", () => {
    const first = createOfflineReviewDemoFixtures();
    const second = createOfflineReviewDemoFixtures();

    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    for (const index of [0, 1, 2]) {
      expect(first?.[index]?.candidate).not.toBe(second?.[index]?.candidate);
      expect(first?.[index]?.routingMaterial).not.toBe(second?.[index]?.routingMaterial);
      expect(first?.[index]?.routingMaterial.seenFamilies).not.toBe(second?.[index]?.routingMaterial.seenFamilies);
      expect(first?.[index]?.sourceMaterial).not.toBe(second?.[index]?.sourceMaterial);
      expect(first?.[index]?.sourceMaterial.evidence).not.toBe(second?.[index]?.sourceMaterial.evidence);
    }

    const firstFamilies = first?.[0]?.routingMaterial.seenFamilies as string[] | undefined;
    firstFamilies?.push("FIXTURE_ISOLATION_SENTINEL");
    expect(second?.[0]?.routingMaterial.seenFamilies).not.toContain("FIXTURE_ISOLATION_SENTINEL");
    expect(createOfflineReviewDemoFixtures()).toEqual(second);
  });

  it("sends all authentic fixture candidates through one real composition and one projected queue", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const composeSpy = vi.spyOn(compositionModule, "composeEventIntelligenceEvidenceReviewQueue");

    const result = await loadEventIntelligenceOfflineCombinedReviewQueue();

    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") return;
    expect(composeSpy).toHaveBeenCalledOnce();
    const input = composeSpy.mock.calls[0]?.[0] as { evaluationAsOf: string; candidates: readonly { candidate: unknown; routingMaterial: unknown }[] };
    expect(input.evaluationAsOf).toBe("2026-10-03T12:00:00.000Z");
    expect(input.candidates).toHaveLength(3);
    expect(input.candidates.every(entry => isAuthenticNewsDiscoveryCandidate(entry.candidate))).toBe(true);
    expect(input.candidates.every(entry => parseSyntheticRoutingMaterial(entry.routingMaterial).status === "VALID")).toBe(true);

    expect(result.compositionStatus).toBe("NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION");
    expect(result.evaluatedAsOf).toBe("2026-10-03T12:00:00.000Z");
    expect(result.model.state).toBe("HAS_REVIEW_ITEMS");
    expect(result.model.items).toHaveLength(result.model.summary.totalItems);
    expect(result.model.summary).toMatchObject({ totalItems: 3, open: 1, blocked: 2, correctionsRequiringReview: 1 });
    expect(result.model.items.map(item => [item.reviewType, item.status, item.operationalPriority])).toEqual([
      ["CORRECTION_LINEAGE_REVIEW", "BLOCKED", "URGENT_CORRECTION_REVIEW"],
      ["RIGHTS_APPROVAL_REVIEW", "BLOCKED", "BLOCKED_RIGHTS"],
      ["ISSUER_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED"],
    ]);
    expect(result.model.items[0]?.reasonLabels).toContain("Correction lineage is unresolved");
    expect(result.model.items[1]?.reasonLabels).toContain("Required source-use approval is missing");
    expect(result.model.items[2]?.reasonLabels).toContain("Issuer mapping is missing");
    expect(result.model.items.every(item => item.historical && item.evaluatedAsOf === result.evaluatedAsOf)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/candidateId|routingResultId|canonicalSourceUrl|fingerprint|trust/i);

    const fixtures = createOfflineReviewDemoFixtures();
    expect(fixtures).toHaveLength(3);
    expect(new Set(fixtures?.map(fixture => fixture.candidate.record.canonicalSourceUrl)).size).toBe(3);
  });

  it("renders the actual combined queue through the read-only workspace and links the existing overview", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const html = renderToStaticMarkup(await CombinedQueuePage());
    const overviewHtml = renderToStaticMarkup(await OfflineDemoPage());

    expect(html).toContain("Samlet syntetisk review-kø");
    expect(html).toContain("NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION");
    expect(html).toContain("HAS_REVIEW_ITEMS");
    expect(html).toContain("Totalt antall kandidater:");
    expect(html).toContain("2026-10-03T12:00:00.000Z");
    expect(html).toContain("Urgent correction review");
    expect(html).toContain("Blocked by rights approval");
    expect(html).toContain("Mapping review required");
    expect(html).toContain("Historical snapshot");
    expect(html).toContain("href=\"/intelligence/events/review/offline-demo\"");
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Complete review");
    expect(html).not.toContain("synthetic-company-mapping");
    expect(html).not.toContain("issuer.test/releases/offline-demo");
    expect(overviewHtml).toContain("href=\"/intelligence/events/review/offline-demo/combined\"");
    expect(overviewHtml).toContain("Samlet syntetisk review-kø");
  });
});
