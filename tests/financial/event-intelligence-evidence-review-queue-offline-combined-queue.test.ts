import { Children, createElement, isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as compositionModule from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import { createOfflineReviewDemoFixtures } from "@/application/intelligence/offline-review-demo-fixtures";
import { loadEventIntelligenceOfflineCombinedReviewQueue } from "@/application/intelligence/load-event-intelligence-offline-combined-review-queue";
import { createSyntheticNewsDiscoveryCandidate, isAuthenticNewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import { parseSyntheticRoutingMaterial } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { bindOfflineReviewDemoDetails } from "@/application/intelligence/offline-review-demo-presentation";
import { loadEvidenceReviewQueueViewModel } from "@/application/intelligence/load-evidence-review-queue-view-model";
import CombinedQueuePage from "@/app/intelligence/events/review/offline-demo/combined/page";
import OfflineDemoPage from "@/app/intelligence/events/review/offline-demo/page";
import { EvidenceReviewQueueWorkspace, filterEvidenceReviewItems } from "@/components/intelligence/evidence-review-queue-workspace";

function findWorkspaceProps(node: ReactNode): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const visit = (child: ReactNode) => {
    if (!isValidElement(child)) return;
    if (child.type === EvidenceReviewQueueWorkspace) {
      found.push(child.props as Record<string, unknown>);
      return;
    }
    Children.forEach((child.props as { children?: ReactNode }).children, visit);
  };
  visit(node);
  return found;
}

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
    expect(filterEvidenceReviewItems(result.model.items, { status: "OPEN" }).map(item => item.reviewType)).toEqual(["ISSUER_MAPPING_REVIEW"]);
    expect(JSON.stringify(result)).not.toMatch(/candidateId|routingResultId|canonicalSourceUrl|fingerprint|trust/i);

    const fixtures = createOfflineReviewDemoFixtures();
    expect(fixtures).toHaveLength(3);
    expect(new Set(fixtures?.map(fixture => fixture.candidate.record.canonicalSourceUrl)).size).toBe(3);
    expect(result.details.map(detail => [detail.key, detail.item.reviewType])).toEqual([
      ["issuer-mapping", "ISSUER_MAPPING_REVIEW"],
      ["rights-blocked", "RIGHTS_APPROVAL_REVIEW"],
      ["unresolved-correction", "CORRECTION_LINEAGE_REVIEW"],
    ]);
    expect(result.details.every(detail => Object.isFrozen(detail) && Object.isFrozen(detail.sourceMaterial) && Object.isFrozen(detail.item))).toBe(true);
  });

  it("binds each detail to its review type regardless of fixture input order", () => {
    vi.stubEnv("NODE_ENV", "development");
    const fixtures = createOfflineReviewDemoFixtures();
    expect(fixtures).toHaveLength(3);
    if (!fixtures) return;
    const reversed = [...fixtures].reverse();
    const composed = compositionModule.composeEventIntelligenceEvidenceReviewQueue({
      evaluationAsOf: "2026-10-03T12:00:00.000Z",
      candidates: reversed.map(fixture => ({ candidate: fixture.candidate, routingMaterial: fixture.routingMaterial })),
    });
    expect(composed.status).toBe("COMPOSED");
    if (composed.status !== "COMPOSED") return;

    const details = bindOfflineReviewDemoDetails(reversed, composed.composition.viewModel);
    expect(details?.map(detail => [detail.key, detail.item.reviewType])).toEqual([
      ["unresolved-correction", "CORRECTION_LINEAGE_REVIEW"],
      ["rights-blocked", "RIGHTS_APPROVAL_REVIEW"],
      ["issuer-mapping", "ISSUER_MAPPING_REVIEW"],
    ]);
    expect(new Set(details?.map(detail => detail.detailId)).size).toBe(3);
  });

  it("rejects ambiguous, missing, and substituted candidate-to-view bindings", () => {
    vi.stubEnv("NODE_ENV", "development");
    const fixtures = createOfflineReviewDemoFixtures();
    expect(fixtures).toHaveLength(3);
    if (!fixtures) return;
    const composed = compositionModule.composeEventIntelligenceEvidenceReviewQueue({
      evaluationAsOf: "2026-10-03T12:00:00.000Z",
      candidates: fixtures.map(fixture => ({ candidate: fixture.candidate, routingMaterial: fixture.routingMaterial })),
    });
    expect(composed.status).toBe("COMPOSED");
    if (composed.status !== "COMPOSED") return;
    expect(bindOfflineReviewDemoDetails(fixtures, composed.composition.viewModel)).not.toBeNull();
    const rightsIndex = fixtures.findIndex(fixture => fixture.key === "rights-blocked");
    const correctionFixture = fixtures.find(fixture => fixture.key === "unresolved-correction")!;
    const substitutedFixtures = fixtures.map((fixture, index) => index === rightsIndex ? { ...fixture, candidate: correctionFixture.candidate } : fixture);
    expect(bindOfflineReviewDemoDetails(substitutedFixtures, composed.composition.viewModel)).toBeNull();
    const rights = fixtures.find(fixture => fixture.key === "rights-blocked")!;
    const duplicateUrl = "https://issuer.test/releases/offline-demo-rights-second-candidate";
    const duplicateRecord = {
      ...rights.candidate.record,
      providerRecordId: "offline-demo-rights-second-candidate",
      canonicalSourceUrl: duplicateUrl,
      publisher: { ...rights.candidate.record.publisher, publisherId: "synthetic-issuer-rights-second-candidate" },
      origin: {
        ...rights.candidate.record.origin,
        originalPublisher: { ...rights.candidate.record.origin.originalPublisher!, publisherId: "synthetic-issuer-rights-second-candidate" },
        originalPublicationId: "offline-demo-publication-rights-second-candidate",
        originalSourceUrl: duplicateUrl,
      },
      sourceLocator: "article:offline-demo-rights-second-candidate",
    };
    const duplicateCandidate = createSyntheticNewsDiscoveryCandidate(duplicateRecord, "2026-10-03T12:00:00.000Z");
    expect(duplicateCandidate).not.toBeNull();
    if (!duplicateCandidate) return;
    const withDuplicateType = compositionModule.composeEventIntelligenceEvidenceReviewQueue({
      evaluationAsOf: "2026-10-03T12:00:00.000Z",
      candidates: [
        ...fixtures.map(fixture => ({ candidate: fixture.candidate, routingMaterial: fixture.routingMaterial })),
        { candidate: duplicateCandidate, routingMaterial: { ...rights.routingMaterial, candidateId: duplicateCandidate.candidateId } },
      ],
    });
    expect(withDuplicateType.status).toBe("COMPOSED");
    if (withDuplicateType.status !== "COMPOSED") return;
    expect(withDuplicateType.composition.viewModel.items.filter(item => item.reviewType === "RIGHTS_APPROVAL_REVIEW")).toHaveLength(2);
    expect(bindOfflineReviewDemoDetails(fixtures, withDuplicateType.composition.viewModel)).toBeNull();
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
    expect(html).toContain("Correction lineage requires review");
    expect(html).toContain("Required source-use approval is missing");
    expect(html).toContain("Issuer mapping is missing");
    expect(html).toContain("Synthetic fixture material · read-only");
    expect(html.match(/<details aria-label="Synthetic source context"/g)).toHaveLength(3);
    expect(html).toContain("href=\"/intelligence/events/review/offline-demo\"");
    expect(html).toContain("href=\"#queue-combined-offline-demo-items-heading\"");
    expect(html).not.toContain("Approve");
    expect(html).not.toContain("Complete review");
    expect(html).not.toContain("synthetic-company-mapping");
    expect(html).not.toContain("issuer.test/releases/offline-demo");
    expect(overviewHtml).toContain("href=\"/intelligence/events/review/offline-demo/combined\"");
    expect(overviewHtml).toContain("Samlet syntetisk review-kø");

    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map(([, fragment]) => fragment);
    expect(fragments.length).toBeGreaterThanOrEqual(4);
    for (const fragment of fragments) expect(ids).toContain(fragment);
    for (const [, references] of html.matchAll(/\saria-labelledby="([^"]+)"/g)) {
      for (const reference of references.split(/\s+/)) expect(ids).toContain(reference);
    }
    expect(html).toMatch(/id="offline-review-demo-detail-unresolved-correction" tabindex="-1"/);
    expect(html).toMatch(/id="offline-review-demo-detail-rights-blocked" tabindex="-1"/);
    expect(html).toMatch(/id="offline-review-demo-detail-issuer-mapping" tabindex="-1"/);

    const workspaceProps = findWorkspaceProps(await CombinedQueuePage());
    expect(workspaceProps).toHaveLength(1);
    expect(Object.keys(workspaceProps[0]!).sort()).toEqual(["detailLinks", "idPrefix", "model", "presentation"]);
    expect(JSON.stringify(workspaceProps[0])).not.toMatch(/sourceMaterial|fixtureId|candidateId|routingMaterial|canonicalSourceUrl|queueSet/i);

    vi.stubEnv("NODE_ENV", "test");
    const defaultWorkspace = renderToStaticMarkup(createElement(EvidenceReviewQueueWorkspace, { model: loadEvidenceReviewQueueViewModel() }));
    expect(defaultWorkspace).not.toContain("Nullstill filtre");
    expect(defaultWorkspace).not.toContain("Se forklaring og syntetisk kildekontekst");
  });
});
