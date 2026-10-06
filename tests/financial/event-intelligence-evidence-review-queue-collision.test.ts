import { describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({ createHash: () => ({ update() { return this; }, digest() { return "0".repeat(64); } }) }));

import { evaluateSourcePortfolioRouting, getSourcePortfolioDecision, type SyntheticRoutingMaterial } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { sealEvidenceReviewQueueSet } from "@/domain/intelligence/event-intelligence-evidence-review-queue";

const material = (candidateId: string): SyntheticRoutingMaterial => ({
  provenance: "SYNTHETIC", candidateId, jurisdiction: "US_SEC", listingScopes: ["listing:us-sec"], eventHint: "PURCHASE_INTENT",
  seenFamilies: ["DISCOVERY_AGGREGATOR"], availableFamilies: ["FILING_AUTHORITY"], issuerMapped: false, assetMapped: false,
  duplicate: false, rightsApproved: true, credentialAvailable: true, completionMaterialPresent: false, primaryAvailable: true,
  qualificationComplete: true, correctionPresent: false, correctionResolved: true, correctionFieldHints: [], retracted: false,
  conflicts: [], stale: false, originBindings: [], publicationAt: "2026-10-01T00:00:00.000Z", discoveredAt: "2026-10-01T00:01:00.000Z",
  receivedAt: "2026-10-01T00:02:00.000Z", correctionAvailableAt: null, evaluationAsOf: "2026-10-03T00:00:00.000Z",
});

describe("evidence queue identity collision handling", () => {
  it("fails closed when different canonical candidates collide on a fingerprint", () => {
    const decision = getSourcePortfolioDecision();
    const one = evaluateSourcePortfolioRouting(decision, material("candidate:collision-one"))!;
    const two = evaluateSourcePortfolioRouting(decision, material("candidate:collision-two"))!;
    expect(one.routingResultId).toBe(two.routingResultId);
    expect(sealEvidenceReviewQueueSet(decision, [one, two]).status).toBe("INVALID");
  });
});
