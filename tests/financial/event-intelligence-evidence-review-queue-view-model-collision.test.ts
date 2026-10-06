import { describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", async importOriginal => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  const publicKeyDomain = "event-intelligence-evidence-review-queue-view-model/public-key/v1\0";
  return {
    ...actual,
    createHash: (algorithm: string) => {
      let input = "";
      const hashLike = {
        update(chunk: string | Uint8Array) { input += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"); return hashLike; },
        digest(encoding?: "hex") {
          if (input.startsWith(publicKeyDomain)) return "c".repeat(64);
          return actual.createHash(algorithm).update(input).digest(encoding ?? "hex");
        },
      };
      return hashLike as unknown as ReturnType<typeof actual.createHash>;
    },
  };
});

import { getSourcePortfolioDecision, evaluateSourcePortfolioRouting } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { getEvidenceReviewQueueContract, sealEvidenceReviewQueueSet } from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import { adaptEvidenceReviewQueueSetToViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";

const material = (candidateId: string) => ({ provenance: "SYNTHETIC", candidateId, jurisdiction: "US_SEC", listingScopes: ["listing:us-sec"], eventHint: "PURCHASE_INTENT", seenFamilies: ["DISCOVERY_AGGREGATOR"], availableFamilies: ["FILING_AUTHORITY"], issuerMapped: true, assetMapped: true, duplicate: false, rightsApproved: true, credentialAvailable: true, completionMaterialPresent: false, primaryAvailable: true, qualificationComplete: true, correctionPresent: false, correctionResolved: true, correctionFieldHints: [], retracted: false, conflicts: [], stale: false, originBindings: [], publicationAt: "2026-10-01T00:00:00.000Z", discoveredAt: "2026-10-01T00:01:00.000Z", receivedAt: "2026-10-01T00:02:00.000Z", correctionAvailableAt: null, evaluationAsOf: "2026-10-03T00:00:00.000Z" });

describe("view-model public-key collision behavior with a Vitest-only hash replacement", () => {
  it("fails closed when distinct canonical domain items map to one forced public digest", () => {
    const decision = getSourcePortfolioDecision();
    const first = evaluateSourcePortfolioRouting(decision, material("candidate:collision-one"));
    const second = evaluateSourcePortfolioRouting(decision, material("candidate:collision-two"));
    expect(first).not.toBeNull(); expect(second).not.toBeNull();
    if (!first || !second) return;
    const sealed = sealEvidenceReviewQueueSet(decision, [first, second]);
    expect(sealed.status).toBe("SEALED"); if (sealed.status !== "SEALED") return;
    const projected = adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), sealed.queueSet);
    expect(projected).toEqual({ status: "BLOCKED", code: "EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_INPUT_INVALID" });
  });
});
