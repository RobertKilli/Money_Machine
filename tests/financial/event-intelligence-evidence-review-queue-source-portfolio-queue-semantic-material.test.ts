import { describe, expect, it } from "vitest";
import {
  EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL,
  parseEvidenceReviewQueueSemanticMaterial,
  parseSourcePortfolioSemanticMaterial,
  SOURCE_PORTFOLIO_SEMANTIC_MATERIAL,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-source-portfolio-queue-semantic-material";
import {
  evaluateSourcePortfolioRouting,
  getSourcePortfolioDecision,
  parseSyntheticRoutingMaterial,
  type SyntheticRoutingMaterial,
} from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import {
  getEvidenceReviewQueueContract,
  projectRoutingResultToEvidenceReviewItem,
  sortEvidenceReviewItems,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue";

const base = (patch: Partial<SyntheticRoutingMaterial> = {}): SyntheticRoutingMaterial => {
  const jurisdiction = patch.jurisdiction ?? "US_SEC";
  const listingScopes = patch.listingScopes ?? (jurisdiction === "US_SEC" ? ["listing:us-sec"] : jurisdiction === "GB_LSE" ? ["listing:lse"] : jurisdiction === "AU_ASX" ? ["listing:asx"] : jurisdiction === "DUAL_LISTED" ? ["listing:lse", "listing:asx"] : []);
  const value = {
    provenance: "SYNTHETIC" as const, candidateId: "candidate:semantic-0001", jurisdiction, listingScopes,
    eventHint: "PURCHASE_INTENT" as const, seenFamilies: ["DISCOVERY_AGGREGATOR"] as SyntheticRoutingMaterial["seenFamilies"],
    availableFamilies: ["FILING_AUTHORITY", "ISSUER_ATTRIBUTED_RELEASE"] as SyntheticRoutingMaterial["availableFamilies"],
    issuerMapped: true, assetMapped: true, duplicate: false, rightsApproved: true, credentialAvailable: true,
    completionMaterialPresent: false, primaryAvailable: true, qualificationComplete: true, correctionPresent: false,
    correctionResolved: true, correctionFieldHints: [] as SyntheticRoutingMaterial["correctionFieldHints"], retracted: false,
    conflicts: [] as SyntheticRoutingMaterial["conflicts"], stale: false, originBindings: [] as SyntheticRoutingMaterial["originBindings"],
    publicationAt: "2026-10-01T00:00:00.000Z", discoveredAt: "2026-10-01T00:01:00.000Z",
    receivedAt: "2026-10-01T00:02:00.000Z", correctionAvailableAt: null as string | null,
    evaluationAsOf: "2026-10-03T00:00:00.000Z", ...patch,
  };
  return { ...value, availableFamilies: value.availableFamilies.filter(family => !value.seenFamilies.includes(family)) };
};

function authenticRouting(state: string, patch: Partial<SyntheticRoutingMaterial> = {}) {
  const decision = getSourcePortfolioDecision();
  const material = base({ ...patch, seenFamilies: ["FILING_AUTHORITY"], availableFamilies: ["ISSUER_ATTRIBUTED_RELEASE"] });
  const allowed = ["DISCOVERED", "SOURCE_RETRIEVAL_REQUIRED", "ISSUER_MAPPING_REQUIRED", "ASSET_MAPPING_REQUIRED", "PRIMARY_DISCLOSURE_REQUIRED", "CORRECTION_REVIEW_REQUIRED", "CORROBORATION_REVIEW_REQUIRED", "ELIGIBILITY_REVIEW_REQUIRED"];
  let result = evaluateSourcePortfolioRouting(decision, material);
  while (result && result.nextState !== state && result.nextState !== "STOPPED_BLOCKED" && result.nextState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE" && allowed.includes(result.nextState)) {
    result = evaluateSourcePortfolioRouting(decision, material, result);
  }
  if (result?.nextState === "STOPPED_BLOCKED" || result?.nextState === "NON_AUTHORITATIVE_REVIEW_COMPLETE") return result;
  if (result?.nextState === state) return evaluateSourcePortfolioRouting(decision, material, result);
  return result?.currentState === state ? result : null;
}

describe("source-portfolio and queue semantic material", () => {
  it("parses only the fixed versioned materials as syntax-only non-authoritative data", () => {
    expect(parseSourcePortfolioSemanticMaterial(SOURCE_PORTFOLIO_SEMANTIC_MATERIAL).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    expect(parseEvidenceReviewQueueSemanticMaterial(EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    expect(SOURCE_PORTFOLIO_SEMANTIC_MATERIAL.algorithmVersion).toMatch(/algorithm\/v1$/);
    expect(EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL.algorithmVersion).toMatch(/algorithm\/v1$/);
    expect(Object.isFrozen(EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL.classificationRules[0]!.condition)).toBe(true);
    expect(parseEvidenceReviewQueueSemanticMaterial(JSON.parse(JSON.stringify(EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL))).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    expect(parseEvidenceReviewQueueSemanticMaterial({ ...EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL, algorithmVersion: "caller-claimed-v2" }).status).toBe("INVALID");
  });

  it("returns a caller-isolated immutable fixed material graph", () => {
    const callerCopy = structuredClone(SOURCE_PORTFOLIO_SEMANTIC_MATERIAL) as { rules: { sourceFamilies: string[] } };
    const parsed = parseSourcePortfolioSemanticMaterial(callerCopy);
    expect(parsed.status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    callerCopy.rules.sourceFamilies.push("CALLER_INJECTED_FAMILY");
    if (parsed.status === "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") {
      expect(parsed.material.rules.sourceFamilies).not.toContain("CALLER_INJECTED_FAMILY");
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.material.rules.sourceFamilies)).toBe(true);
    }
  });

  it("rejects nested alterations, getters, sparse arrays, cycles and unsupported prototypes without invoking getters", () => {
    const changed = structuredClone(EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL) as { classificationRules: { ruleId: string }[] };
    changed.classificationRules[0]!.ruleId = "CALLER_RULE";
    expect(parseEvidenceReviewQueueSemanticMaterial(changed).status).toBe("INVALID");
    let called = false;
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, "schemaVersion", { enumerable: true, get() { called = true; return EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL.schemaVersion; } });
    expect(parseEvidenceReviewQueueSemanticMaterial(accessor).status).toBe("INVALID");
    expect(called).toBe(false);
    const sparse = { ...EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL, classificationRules: new Array(19) };
    expect(parseEvidenceReviewQueueSemanticMaterial(sparse).status).toBe("INVALID");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(parseSourcePortfolioSemanticMaterial(cyclic).status).toBe("INVALID");
    expect(parseSourcePortfolioSemanticMaterial(Object.assign(Object.create({ unsafe: true }), SOURCE_PORTFOLIO_SEMANTIC_MATERIAL)).status).toBe("INVALID");
  });

  it("matches source-family strength, jurisdiction fallback, correction priority and authentic progression boundaries", () => {
    const decision = getSourcePortfolioDecision();
    const filing = evaluateSourcePortfolioRouting(decision, base({ seenFamilies: ["FILING_AUTHORITY"] }));
    expect(filing).toMatchObject({ sourceStrength: "FILING_PUBLICATION", operationalPriority: "ROUTINE_DISCOVERY_REVIEW", nextState: "SOURCE_RETRIEVAL_REQUIRED" });
    const aggregator = evaluateSourcePortfolioRouting(decision, base({ seenFamilies: ["DISCOVERY_AGGREGATOR"], availableFamilies: [], primaryAvailable: false }));
    expect(aggregator?.sourceStrength).toBe("DISCOVERY_ONLY");
    const dual = evaluateSourcePortfolioRouting(decision, base({ jurisdiction: "DUAL_LISTED", listingScopes: ["listing:lse", "listing:asx"] }));
    expect(dual?.nextState).toBe("STOPPED_BLOCKED");
    const correction = evaluateSourcePortfolioRouting(decision, base({ correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-02T00:00:00.000Z" }));
    expect(correction?.operationalPriority).toBe("URGENT_CORRECTION_REVIEW");
    const first = evaluateSourcePortfolioRouting(decision, base())!;
    expect(evaluateSourcePortfolioRouting(decision, base(), { ...first })).toBeNull();
    expect(evaluateSourcePortfolioRouting({ ...decision }, base())).toBeNull();
  });

  it("conforms queue precedence for correction, retraction, duplicate, conflict, cutoff and ordinality", () => {
    const decision = getSourcePortfolioDecision();
    const correction = authenticRouting("CORRECTION_REVIEW_REQUIRED", { eventHint: "CORRECTION_AMENDMENT", correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-02T00:00:00.000Z", duplicate: true });
    expect(correction).not.toBeNull();
    const correctionItem = projectRoutingResultToEvidenceReviewItem(decision, correction);
    expect(correctionItem).toMatchObject({ itemType: "CORRECTION_LINEAGE_REVIEW", status: "BLOCKED" });
    const retracted = evaluateSourcePortfolioRouting(decision, base({ eventHint: "RETRACTION_WITHDRAWAL", retracted: true, duplicate: true }));
    const retractionItem = projectRoutingResultToEvidenceReviewItem(decision, retracted);
    expect(retractionItem).toMatchObject({ itemType: "RETRACTION_REVIEW", status: "RETRACTED" });
    const duplicate = evaluateSourcePortfolioRouting(decision, base({ seenFamilies: ["FILING_AUTHORITY"], duplicate: true }));
    expect(projectRoutingResultToEvidenceReviewItem(decision, duplicate)?.status).toBe("NO_ACTION");
    const conflict = evaluateSourcePortfolioRouting(decision, base({ conflicts: ["LIFECYCLE_CONFLICT", "ISSUER_IDENTITY_CONFLICT"] }));
    expect(projectRoutingResultToEvidenceReviewItem(decision, conflict)?.requiredNextAction).toBe("REVIEW_SOURCE_CONFLICT");
    const cutoffRouting = authenticRouting("SOURCE_RETRIEVAL_REQUIRED");
    expect(cutoffRouting?.evaluationAsOf).toBe("2026-10-03T00:00:00.000Z");
    const before = authenticRouting("SOURCE_RETRIEVAL_REQUIRED", { evaluationAsOf: "2026-10-01T00:03:00.000Z" });
    expect(before?.evaluationAsOf).toBe("2026-10-01T00:03:00.000Z");
    const items = [correctionItem!, projectRoutingResultToEvidenceReviewItem(decision, cutoffRouting)!];
    expect(sortEvidenceReviewItems(items)?.[0]?.itemType).toBe("CORRECTION_LINEAGE_REVIEW");
    expect(sortEvidenceReviewItems(items.map(item => ({ ...item } as never)))).toBeNull();
    expect(getEvidenceReviewQueueContract().sortPolicy).toBeTruthy();
  });

  it("keeps cutoff validation upstream and rejects a future correction before queue projection", () => {
    const material = base({ correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-04T00:00:00.000Z" });
    expect(parseSyntheticRoutingMaterial(material).status).toBe("INVALID");
    expect(EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL.historicalAndSupersession.supersededStatus).toContain("NOT_EMITTED");
    expect(EVIDENCE_REVIEW_QUEUE_SEMANTIC_MATERIAL.queueOrdering.queueSetInputMaximum).toBe(512);
  });
});
