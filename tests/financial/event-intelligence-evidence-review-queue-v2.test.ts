import { describe, expect, it } from "vitest";
import {
  evaluateSourcePortfolioRouting,
  getSourcePortfolioDecision,
  isAuthenticRoutingEvaluation,
  type SyntheticRoutingMaterial,
} from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import {
  EVIDENCE_REVIEW_QUEUE_VERSION,
  EVIDENCE_REVIEW_QUEUE_V2_VERSION,
  evaluateEvidenceReviewQueueV2,
  getEvidenceReviewQueueContract,
  getEvidenceReviewQueueV2Contract,
  isAuthenticEvidenceReviewItem,
  isAuthenticEvidenceReviewQueueV2,
  isAuthenticEvidenceReviewQueueV2Member,
  isAuthenticEvidenceReviewQueueSet,
  isAuthenticEvidenceReviewQueueV2Contract,
  projectRoutingResultToEvidenceReviewItem,
  sealEvidenceReviewQueueSet,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import {
  EVIDENCE_REVIEW_QUEUE_V2_SEMANTIC_MATERIAL,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-v2-semantic-material";

const decision = getSourcePortfolioDecision();
const base = (patch: Partial<SyntheticRoutingMaterial> = {}): SyntheticRoutingMaterial => {
  const jurisdiction = patch.jurisdiction ?? "US_SEC";
  const out = {
    provenance: "SYNTHETIC" as const,
    candidateId: "candidate:v2-0001",
    jurisdiction,
    listingScopes: patch.listingScopes ?? (jurisdiction === "US_SEC" ? ["listing:us-sec"] : []),
    eventHint: "PURCHASE_INTENT" as const,
    seenFamilies: ["FILING_AUTHORITY"] as SyntheticRoutingMaterial["seenFamilies"],
    availableFamilies: ["ISSUER_ATTRIBUTED_RELEASE"] as SyntheticRoutingMaterial["availableFamilies"],
    issuerMapped: true,
    assetMapped: true,
    duplicate: false,
    rightsApproved: true,
    credentialAvailable: true,
    completionMaterialPresent: false,
    primaryAvailable: true,
    qualificationComplete: true,
    correctionPresent: false,
    correctionResolved: true,
    correctionFieldHints: patch.correctionFieldHints ?? (patch.correctionPresent ? ["OTHER"] : []),
    retracted: false,
    conflicts: [] as SyntheticRoutingMaterial["conflicts"],
    stale: false,
    originBindings: [] as SyntheticRoutingMaterial["originBindings"],
    publicationAt: "2026-10-01T00:00:00.000Z",
    discoveredAt: "2026-10-01T00:01:00.000Z",
    receivedAt: "2026-10-01T00:02:00.000Z",
    correctionAvailableAt: null as string | null,
    evaluationAsOf: "2026-10-03T12:00:00.000Z",
    ...patch,
  };
  return { ...out, availableFamilies: out.availableFamilies.filter(family => !out.seenFamilies.includes(family)) };
};
function route(patch: Partial<SyntheticRoutingMaterial> = {}) {
  return evaluateSourcePortfolioRouting(decision, base(patch));
}
function routeAt(state: string, patch: Partial<SyntheticRoutingMaterial> = {}) {
  const stablePatch = { ...patch };
  if (state === "DISCOVERED") return route(stablePatch);
  const journey = base({ ...stablePatch, duplicate: false, seenFamilies: ["FILING_AUTHORITY"], availableFamilies: ["ISSUER_ATTRIBUTED_RELEASE"], issuerMapped: true, assetMapped: true });
  let result = evaluateSourcePortfolioRouting(decision, journey);
  const allowed = ["DISCOVERED", "SOURCE_RETRIEVAL_REQUIRED", "ISSUER_MAPPING_REQUIRED", "ASSET_MAPPING_REQUIRED", "PRIMARY_DISCLOSURE_REQUIRED", "CORRECTION_REVIEW_REQUIRED", "CORROBORATION_REVIEW_REQUIRED", "ELIGIBILITY_REVIEW_REQUIRED"];
  while (result && result.nextState !== state && result.nextState !== "STOPPED_BLOCKED" && result.nextState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE" && allowed.includes(result.nextState)) result = evaluateSourcePortfolioRouting(decision, journey, result);
  if (!result || result.nextState === "STOPPED_BLOCKED" || result.nextState === "NON_AUTHORITATIVE_REVIEW_COMPLETE" || result.nextState !== state) return result;
  return evaluateSourcePortfolioRouting(decision, base({ ...stablePatch, issuerMapped: patch.issuerMapped ?? true, assetMapped: patch.assetMapped ?? true }), result);
}
function evaluate(...patches: Partial<SyntheticRoutingMaterial>[]) {
  const results = patches.map(patch => route(patch));
  if (results.some(result => result === null)) throw new Error("synthetic fixture did not produce an authentic routing result");
  return evaluateEvidenceReviewQueueV2(decision, results);
}

describe("opt-in evidence review queue v2", () => {
  it("publishes a separately versioned contract and classifier-complete semantic material", () => {
    const v1 = getEvidenceReviewQueueContract();
    const v2 = getEvidenceReviewQueueV2Contract();
    expect(v1.contractVersion).toBe(EVIDENCE_REVIEW_QUEUE_VERSION);
    expect(v2.contractVersion).toBe(EVIDENCE_REVIEW_QUEUE_V2_VERSION);
    expect(v2.requiredSourcePortfolioVersion).toBe("event-intelligence-source-portfolio-routing-decision/v1");
    expect(v2.algorithmVersion).toBe(EVIDENCE_REVIEW_QUEUE_V2_SEMANTIC_MATERIAL.algorithmVersion);
    expect(v2.classifierOrder).toEqual(EVIDENCE_REVIEW_QUEUE_V2_SEMANTIC_MATERIAL.classifierOrder);
    expect(v2.priorityMapping).toEqual(EVIDENCE_REVIEW_QUEUE_V2_SEMANTIC_MATERIAL.priorityMapping);
    expect(v2.blockerMappings).toEqual(v1.blockerMappings);
    expect(v2.blockerMappings).toEqual(EVIDENCE_REVIEW_QUEUE_V2_SEMANTIC_MATERIAL.blockerMappings);
    expect(v2.classifierOrder).toContain("LIFECYCLE_REVIEW=DOCUMENTED_FALLBACK");
    expect(v2.conflictActionOrder.indexOf("LIFECYCLE_CONFLICT=REVIEW_LIFECYCLE")).toBeLessThan(v2.conflictActionOrder.indexOf("AMOUNT_CURRENCY_CONFLICT=REVIEW_SOURCE_CONFLICT"));
    expect(v2.blockerPolicy).toBe("ALL_ROUTING_BLOCKERS_INDEPENDENT_OF_SINGLE_CLASSIFICATION");
    expect(EVIDENCE_REVIEW_QUEUE_V2_SEMANTIC_MATERIAL.closure.status).toBe("PARTIALLY_CLOSED");
  });

  it("aligns isolated and simultaneous lifecycle/amount conflicts, keeping blockers independent", () => {
    const amount = evaluate({ conflicts: ["AMOUNT_CURRENCY_CONFLICT"] });
    const lifecycle = evaluate({ conflicts: ["LIFECYCLE_CONFLICT"] });
    const simultaneous = evaluate({ conflicts: ["AMOUNT_CURRENCY_CONFLICT", "LIFECYCLE_CONFLICT"] });
    expect(amount?.members[0]).toMatchObject({ itemType: "SOURCE_CONFLICT_REVIEW", status: "BLOCKED", requiredNextAction: "REVIEW_SOURCE_CONFLICT" });
    expect(amount?.members[0]?.blockerCodes).toEqual(["ACQUISITION_DISABLED", "AMOUNT_CURRENCY_CONFLICT"]);
    expect(lifecycle?.members[0]).toMatchObject({ itemType: "SOURCE_CONFLICT_REVIEW", status: "BLOCKED", requiredNextAction: "REVIEW_LIFECYCLE" });
    expect(lifecycle?.members[0]?.blockerCodes).toEqual(["ACQUISITION_DISABLED", "LIFECYCLE_CONFLICT"]);
    expect(simultaneous?.members[0]).toMatchObject({ itemType: "SOURCE_CONFLICT_REVIEW", status: "BLOCKED", requiredNextAction: "REVIEW_LIFECYCLE" });
    expect(simultaneous?.members[0]?.blockerCodes).toEqual(["ACQUISITION_DISABLED", "AMOUNT_CURRENCY_CONFLICT", "LIFECYCLE_CONFLICT"]);
  });

  it("follows the ordered classifier when routing stage and evidence properties collide", () => {
    const conflictOverRights = evaluate({ conflicts: ["SOURCE_MATERIAL_CONFLICT"], rightsApproved: false });
    const correctionOverDuplicate = evaluate({ eventHint: "CORRECTION_AMENDMENT", correctionPresent: true, correctionResolved: false, correctionAvailableAt: "2026-10-02T00:00:00.000Z", duplicate: true });
    const retractionOverDuplicate = evaluate({ eventHint: "RETRACTION_WITHDRAWAL", retracted: true, duplicate: true });
    const rights = evaluate({ rightsApproved: false });
    const jurisdiction = evaluate({ jurisdiction: "UNKNOWN", listingScopes: [] });
    const issuer = evaluate({ issuerMapped: false });
    const asset = evaluate({ assetMapped: false });
    const primary = evaluate({ primaryAvailable: false });
    const duplicate = evaluate({ duplicate: true });
    expect(conflictOverRights?.members[0]).toMatchObject({ itemType: "SOURCE_CONFLICT_REVIEW", status: "BLOCKED" });
    expect(correctionOverDuplicate?.members[0]).toMatchObject({ itemType: "CORRECTION_LINEAGE_REVIEW", status: "BLOCKED" });
    expect(retractionOverDuplicate?.members[0]).toMatchObject({ itemType: "RETRACTION_REVIEW", status: "RETRACTED" });
    expect(rights?.members[0]?.itemType).toBe("RIGHTS_APPROVAL_REVIEW");
    expect(jurisdiction?.members[0]?.itemType).toBe("JURISDICTION_REVIEW");
    expect(issuer?.members[0]?.itemType).toBe("ISSUER_MAPPING_REVIEW");
    expect(asset?.members[0]?.itemType).toBe("ASSET_MAPPING_REVIEW");
    expect(primary?.members[0]?.itemType).toBe("PRIMARY_SOURCE_RETRIEVAL_REVIEW");
    expect(duplicate?.members[0]).toMatchObject({ itemType: "DUPLICATE_NO_ACTION", status: "NO_ACTION" });
  });

  it("covers origin grouping, unsupported corroboration, mapping stages, correction stage, and terminal routing", () => {
    const twoOrigins: SyntheticRoutingMaterial["originBindings"] = [
      { sourceRecordId: "record:one", retrievalArtifactId: "artifact:one", publicationId: "publication:one", issuerOriginId: "origin:one", distributionCopyOf: null },
      { sourceRecordId: "record:two", retrievalArtifactId: "artifact:two", publicationId: "publication:two", issuerOriginId: "origin:two", distributionCopyOf: null },
    ];
    const cases: Array<[string, Partial<SyntheticRoutingMaterial>, string]> = [
      ["CORROBORATION_REVIEW_REQUIRED", { originBindings: twoOrigins }, "ORIGIN_GROUP_REVIEW"],
      ["CORROBORATION_REVIEW_REQUIRED", {}, "BLOCKED_UNSUPPORTED_CORROBORATION"],
      ["ISSUER_MAPPING_REQUIRED", { issuerMapped: false }, "ISSUER_MAPPING_REVIEW"],
      ["ASSET_MAPPING_REQUIRED", { assetMapped: false }, "ASSET_MAPPING_REVIEW"],
      ["CORRECTION_REVIEW_REQUIRED", { eventHint: "CORRECTION_AMENDMENT", correctionPresent: true, correctionResolved: true, correctionAvailableAt: "2026-10-02T00:00:00.000Z" }, "CORRECTION_LINEAGE_REVIEW"],
      ["ELIGIBILITY_REVIEW_REQUIRED", {}, "NON_AUTHORITATIVE_REVIEW_COMPLETE"],
    ];
    for (const [state, material, itemType] of cases) {
      const routing = routeAt(state, material);
      expect(routing, `${state} fixture`).not.toBeNull();
      const result = evaluateEvidenceReviewQueueV2(decision, routing ? [routing] : null);
      expect(result?.members[0]?.itemType, state).toBe(itemType);
    }
  });

  it("sorts authentic v2 queue members by the queue contract, cutoff, then candidate tie-break", () => {
    const queue = evaluate(
      { candidateId: "candidate:v2-z", issuerMapped: false },
      { candidateId: "candidate:v2-a", eventHint: "CORRECTION_AMENDMENT", correctionPresent: true, correctionResolved: false, correctionAvailableAt: "2026-10-02T00:00:00.000Z" },
      { candidateId: "candidate:v2-r", rightsApproved: false },
    );
    expect(queue).toMatchObject({ contractVersion: EVIDENCE_REVIEW_QUEUE_V2_VERSION, evaluationAsOf: "2026-10-03T12:00:00.000Z", status: "HAS_REVIEW_ITEMS", memberCount: 3, authorityIssued: false, persistenceAllowed: false });
    expect(queue?.members.map(member => member.itemType)).toEqual(["CORRECTION_LINEAGE_REVIEW", "RIGHTS_APPROVAL_REVIEW", "ISSUER_MAPPING_REVIEW"]);
    expect(queue?.members.map(member => [member.candidateId, member.itemType])).toEqual([
      ["candidate:v2-a", "CORRECTION_LINEAGE_REVIEW"],
      ["candidate:v2-r", "RIGHTS_APPROVAL_REVIEW"],
      ["candidate:v2-z", "ISSUER_MAPPING_REVIEW"],
    ]);
    expect(queue?.members.every(isAuthenticEvidenceReviewQueueV2Member)).toBe(true);
    const correctionRoute = route({ candidateId: "candidate:v2-a", eventHint: "CORRECTION_AMENDMENT", correctionPresent: true, correctionResolved: false, correctionAvailableAt: "2026-10-02T00:00:00.000Z" })!;
    const rightsRoute = route({ candidateId: "candidate:v2-r", rightsApproved: false })!;
    const mappingRoute = route({ candidateId: "candidate:v2-z", issuerMapped: false })!;
    const reversed = evaluateEvidenceReviewQueueV2(decision, [mappingRoute, rightsRoute, correctionRoute]);
    expect(reversed?.members.map(member => [member.candidateId, member.itemType])).toEqual(queue?.members.map(member => [member.candidateId, member.itemType]));
    const tied = evaluate(
      { candidateId: "candidate:v2-tie-z", issuerMapped: false, publicationAt: "2026-10-01T00:01:00.000Z", discoveredAt: "2026-10-01T00:02:00.000Z", receivedAt: "2026-10-01T00:03:00.000Z" },
      { candidateId: "candidate:v2-tie-a", issuerMapped: false, publicationAt: "2026-10-01T00:01:00.000Z", discoveredAt: "2026-10-01T00:02:00.000Z", receivedAt: "2026-10-01T00:03:00.000Z" },
      { candidateId: "candidate:v2-time-first", issuerMapped: false },
    );
    expect(tied?.members.map(member => member.candidateId)).toEqual(["candidate:v2-time-first", "candidate:v2-tie-a", "candidate:v2-tie-z"]);

    const earlier = route({ candidateId: "candidate:v2-cutoff-a" });
    const later = route({ candidateId: "candidate:v2-cutoff-b", evaluationAsOf: "2026-10-04T00:00:00.000Z" });
    expect(isAuthenticRoutingEvaluation(earlier)).toBe(true);
    expect(isAuthenticRoutingEvaluation(later)).toBe(true);
    expect(earlier?.candidateId).not.toBe(later?.candidateId);
    expect(evaluateEvidenceReviewQueueV2(decision, [earlier, later])).toBeNull();
  });

  it("rejects unauthenticated inputs, v1 results, duplicate members and copied/serialized v2 outputs", () => {
    const routing = route()!;
    const v1Item = projectRoutingResultToEvidenceReviewItem(decision, routing)!;
    const v1Set = sealEvidenceReviewQueueSet(decision, [routing]);
    const valid = evaluateEvidenceReviewQueueV2(decision, [routing])!;
    expect(evaluateEvidenceReviewQueueV2({ ...decision }, [routing])).toBeNull();
    expect(evaluateEvidenceReviewQueueV2(decision, [v1Item])).toBeNull();
    expect(evaluateEvidenceReviewQueueV2(decision, [routing, routing])).toBeNull();
    expect(evaluateEvidenceReviewQueueV2(decision, [])).toBeNull();
    expect(evaluateEvidenceReviewQueueV2(decision, new Array(1))).toBeNull();
    expect(isAuthenticEvidenceReviewQueueV2(valid)).toBe(true);
    expect(isAuthenticEvidenceReviewQueueV2Contract(getEvidenceReviewQueueV2Contract())).toBe(true);
    expect(isAuthenticEvidenceReviewQueueV2Contract({ ...getEvidenceReviewQueueV2Contract() })).toBe(false);
    expect(isAuthenticEvidenceReviewQueueV2({ ...valid })).toBe(false);
    expect(isAuthenticEvidenceReviewQueueV2(JSON.parse(JSON.stringify(valid)))).toBe(false);
    expect(isAuthenticEvidenceReviewQueueV2(v1Set.status === "SEALED" ? v1Set.queueSet : null)).toBe(false);
    expect(isAuthenticEvidenceReviewQueueV2Member({ ...valid.members[0]! })).toBe(false);
    expect(isAuthenticEvidenceReviewItem(valid.members[0])).toBe(false);
    expect(isAuthenticEvidenceReviewQueueSet(valid)).toBe(false);
    expect(Object.isFrozen(valid)).toBe(true);
    expect(Object.isFrozen(valid.members)).toBe(true);
    expect(Object.isFrozen(valid.members[0])).toBe(true);
    expect(Object.isFrozen(valid.members[0]?.blockerCodes)).toBe(true);
  });

  it("keeps v1 output and version untouched while v2 is opt-in", () => {
    const routing = route({ conflicts: ["AMOUNT_CURRENCY_CONFLICT", "LIFECYCLE_CONFLICT"] })!;
    const v1 = projectRoutingResultToEvidenceReviewItem(decision, routing)!;
    const v2 = evaluateEvidenceReviewQueueV2(decision, [routing])!;
    expect(v1.contractVersion).toBe(EVIDENCE_REVIEW_QUEUE_VERSION);
    expect(v2.contractVersion).toBe(EVIDENCE_REVIEW_QUEUE_V2_VERSION);
    expect(v1.requiredNextAction).toBe("REVIEW_LIFECYCLE");
    expect(v2.members[0]?.requiredNextAction).toBe("REVIEW_LIFECYCLE");
    expect(getEvidenceReviewQueueContract().conflictActionOrder).toContain("AMOUNT_CURRENCY_CONFLICT=REVIEW_SOURCE_CONFLICT");
  });
});
