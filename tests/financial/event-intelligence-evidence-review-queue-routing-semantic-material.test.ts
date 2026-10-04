import { describe, expect, it } from "vitest";
import { composeEventIntelligenceEvidenceReviewQueue } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import {
  ROUTING_SEMANTIC_MATERIAL,
  parseRoutingSemanticMaterial,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-routing-semantic-material";
import {
  DEGRADATION_REASONS,
  SOURCE_FAMILIES,
  SOURCE_PORTFOLIO_DECISION_VERSION,
  evaluateSourcePortfolioRouting,
  getSourcePortfolioDecision,
  parseSyntheticRoutingMaterial,
  type SyntheticRoutingMaterial,
} from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import {
  DISCOVERY_ORIGIN_SET_VERSION,
  NEWS_DISCOVERY_VERSION,
  createSyntheticNewsDiscoveryCandidate,
} from "@/domain/intelligence/event-intelligence-news-discovery";
import { syntheticAggregatorRecord } from "../fixtures/event-intelligence-news-discovery";

const base = (patch: Partial<SyntheticRoutingMaterial> = {}): SyntheticRoutingMaterial => {
  const jurisdiction = patch.jurisdiction ?? "US_SEC";
  const listingScopes = patch.listingScopes ?? (jurisdiction === "US_SEC" ? ["listing:us-sec"] : jurisdiction === "GB_LSE" ? ["listing:lse"] : jurisdiction === "AU_ASX" ? ["listing:asx"] : jurisdiction === "DUAL_LISTED" ? ["listing:lse", "listing:asx"] : []);
  const value = {
    provenance: "SYNTHETIC" as const,
    candidateId: "candidate:routing-semantic-0001",
    jurisdiction,
    listingScopes,
    eventHint: "PURCHASE_INTENT" as const,
    seenFamilies: ["FILING_AUTHORITY"] as SyntheticRoutingMaterial["seenFamilies"],
    availableFamilies: ["ISSUER_ATTRIBUTED_RELEASE", "REGULATORY_OR_EXCHANGE_DISCLOSURE", "DISCOVERY_AGGREGATOR"] as SyntheticRoutingMaterial["availableFamilies"],
    issuerMapped: true,
    assetMapped: true,
    duplicate: false,
    rightsApproved: true,
    credentialAvailable: true,
    completionMaterialPresent: true,
    primaryAvailable: true,
    qualificationComplete: true,
    correctionPresent: false,
    correctionResolved: true,
    correctionFieldHints: [] as SyntheticRoutingMaterial["correctionFieldHints"],
    retracted: false,
    conflicts: [] as SyntheticRoutingMaterial["conflicts"],
    stale: false,
    originBindings: [] as SyntheticRoutingMaterial["originBindings"],
    publicationAt: "2026-10-01T00:00:00.000Z",
    discoveredAt: "2026-10-01T00:01:00.000Z",
    receivedAt: "2026-10-01T00:02:00.000Z",
    correctionAvailableAt: null as string | null,
    evaluationAsOf: "2026-10-03T00:00:00.000Z",
    ...patch,
  };
  return { ...value, availableFamilies: value.availableFamilies.filter(family => !value.seenFamilies.includes(family)) };
};

const decision = getSourcePortfolioDecision();
const evaluate = (input: SyntheticRoutingMaterial, previous?: unknown) => evaluateSourcePortfolioRouting(decision, input, previous);
function priorAtCurrentState(input: SyntheticRoutingMaterial, currentState: string) {
  let result = evaluate(input);
  for (let i = 0; result && result.nextState !== currentState && i < 10; i++) {
    if (result.nextState === "STOPPED_BLOCKED" || result.nextState === "NON_AUTHORITATIVE_REVIEW_COMPLETE") return null;
    result = evaluate(input, result);
  }
  return result?.nextState === currentState ? result : null;
}

describe("routing semantic material", () => {
  it("pins supported parent and discovery versions instead of inheriting future versions implicitly", () => {
    expect(ROUTING_SEMANTIC_MATERIAL.policyContractVersion).toBe("event-intelligence-source-portfolio-routing-decision/v1");
    expect(ROUTING_SEMANTIC_MATERIAL.policyContractVersion).toBe(SOURCE_PORTFOLIO_DECISION_VERSION);
    expect(ROUTING_SEMANTIC_MATERIAL.upstreamContracts).toEqual({
      sourcePortfolioDecision: SOURCE_PORTFOLIO_DECISION_VERSION,
      newsDiscovery: NEWS_DISCOVERY_VERSION,
      discoveryOriginSet: DISCOVERY_ORIGIN_SET_VERSION,
    });
    expect(ROUTING_SEMANTIC_MATERIAL.inputContract.sourceFamilies.acceptedSet).toEqual(SOURCE_FAMILIES.filter(family => family !== "INDEPENDENT_FACTUAL_CORROBORATION"));
    expect(ROUTING_SEMANTIC_MATERIAL.degradation.acceptedReasons).toEqual(DEGRADATION_REASONS);
  });

  it("accepts only the fixed versioned syntax and returns an isolated deeply frozen material", () => {
    const input = structuredClone(ROUTING_SEMANTIC_MATERIAL) as { routeSelection: { jurisdictionRouteOrder: { order: string[] }[] } };
    const parsed = parseRoutingSemanticMaterial(input);
    expect(parsed.status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    input.routeSelection.jurisdictionRouteOrder[0]!.order.reverse();
    if (parsed.status === "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") {
      expect(parsed.material.routeSelection.jurisdictionRouteOrder[0]!.order).toEqual(["FILING_AUTHORITY", "ISSUER_ATTRIBUTED_RELEASE", "REGULATORY_OR_EXCHANGE_DISCLOSURE", "DISCOVERY_AGGREGATOR"]);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.material.routeSelection.jurisdictionRouteOrder[0]!.order)).toBe(true);
    }
    expect(parseRoutingSemanticMaterial({ ...ROUTING_SEMANTIC_MATERIAL, algorithmVersion: "caller-v99" }).status).toBe("INVALID");
  });

  it("rejects malformed descriptors, extra and missing fields, symbols, sparse arrays, cycles, prototypes, proxies and unsupported values without getters", () => {
    let getterCalled = false;
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, "schemaVersion", { enumerable: true, get() { getterCalled = true; return ROUTING_SEMANTIC_MATERIAL.schemaVersion; } });
    expect(parseRoutingSemanticMaterial(accessor).status).toBe("INVALID");
    expect(getterCalled).toBe(false);

    const missing = structuredClone(ROUTING_SEMANTIC_MATERIAL) as Record<string, unknown>;
    delete missing.routeSelection;
    expect(parseRoutingSemanticMaterial(missing).status).toBe("INVALID");
    expect(parseRoutingSemanticMaterial({ ...ROUTING_SEMANTIC_MATERIAL, [Symbol("extra")]: true }).status).toBe("INVALID");
    const sparse = structuredClone(ROUTING_SEMANTIC_MATERIAL) as { progression: { allowedTransitions: unknown[] } };
    sparse.progression.allowedTransitions = new Array(16);
    expect(parseRoutingSemanticMaterial(sparse).status).toBe("INVALID");
    const cyclic: Record<string, unknown> = {};
    cyclic.loop = cyclic;
    expect(parseRoutingSemanticMaterial(cyclic).status).toBe("INVALID");
    expect(parseRoutingSemanticMaterial(Object.assign(Object.create({ unsafe: true }), ROUTING_SEMANTIC_MATERIAL)).status).toBe("INVALID");
    let proxyTrapCalled = false;
    expect(parseRoutingSemanticMaterial(new Proxy({}, { get() { proxyTrapCalled = true; throw new Error("trap"); } })).status).toBe("INVALID");
    expect(proxyTrapCalled).toBe(false);
    expect(parseRoutingSemanticMaterial({ ...ROUTING_SEMANTIC_MATERIAL, extra: undefined }).status).toBe("INVALID");
  });

  it("keeps the complete fixed material within structural bounds", () => {
    let nodes = 0;
    let maxDepth = 0;
    const visit = (value: unknown, depth: number): void => {
      nodes++;
      maxDepth = Math.max(maxDepth, depth);
      if (typeof value === "string") expect(value.length).toBeLessThanOrEqual(4_096);
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        expect(value.length).toBeLessThanOrEqual(512);
        value.forEach(child => visit(child, depth + 1));
      } else {
        const keys = Object.keys(value);
        expect(keys.length).toBeLessThanOrEqual(64);
        for (const key of keys) { expect(key.length).toBeLessThanOrEqual(4_096); visit((value as Record<string, unknown>)[key], depth + 1); }
      }
    };
    visit(ROUTING_SEMANTIC_MATERIAL, 0);
    expect(nodes).toBeLessThanOrEqual(10_000);
    expect(maxDepth).toBeLessThanOrEqual(12);
    expect(parseRoutingSemanticMaterial(ROUTING_SEMANTIC_MATERIAL).status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
  });

  it("conforms jurisdiction route priority, fallback, source strength and dual-list blocking", () => {
    const cases = [
      ["US_SEC", "FILING_AUTHORITY", ["listing:us-sec"]],
      ["GB_LSE", "REGULATORY_OR_EXCHANGE_DISCLOSURE", ["listing:lse"]],
      ["AU_ASX", "REGULATORY_OR_EXCHANGE_DISCLOSURE", ["listing:asx"]],
      ["UNLISTED", "ISSUER_ATTRIBUTED_RELEASE", []],
      ["UNKNOWN", "DISCOVERY_AGGREGATOR", []],
    ] as const;
    for (const [jurisdiction, expected, scopes] of cases) {
      const result = evaluate(base({ jurisdiction, listingScopes: scopes, seenFamilies: [], availableFamilies: ["FILING_AUTHORITY", "REGULATORY_OR_EXCHANGE_DISCLOSURE", "ISSUER_ATTRIBUTED_RELEASE", "DISCOVERY_AGGREGATOR"] }));
      expect(result).toMatchObject({ currentState: "DISCOVERED", nextState: "SOURCE_RETRIEVAL_REQUIRED", nextSourceFamily: expected });
    }
    const dual = evaluate(base({ jurisdiction: "DUAL_LISTED", listingScopes: ["listing:lse", "listing:asx"], seenFamilies: [], availableFamilies: ["DISCOVERY_AGGREGATOR"] }));
    expect(dual).toMatchObject({ nextState: "STOPPED_BLOCKED", nextSourceFamily: "DISCOVERY_AGGREGATOR" });
    expect(evaluate(base({ seenFamilies: ["FILING_AUTHORITY", "REGULATORY_OR_EXCHANGE_DISCLOSURE", "ISSUER_ATTRIBUTED_RELEASE"] }))?.sourceStrength).toBe("FILING_PUBLICATION");
    expect(evaluate(base({ seenFamilies: ["REGULATORY_OR_EXCHANGE_DISCLOSURE", "ISSUER_ATTRIBUTED_RELEASE"] }))?.sourceStrength).toBe("REGULATORY_PUBLICATION");
    expect(evaluate(base({ seenFamilies: ["ISSUER_ATTRIBUTED_RELEASE"] }))?.sourceStrength).toBe("ISSUER_ATTRIBUTED");
    expect(evaluate(base({ seenFamilies: ["DISCOVERY_AGGREGATOR"] }))?.sourceStrength).toBe("DISCOVERY_ONLY");
    const seenPreferred = evaluate(base({ seenFamilies: ["FILING_AUTHORITY"], availableFamilies: ["ISSUER_ATTRIBUTED_RELEASE", "REGULATORY_OR_EXCHANGE_DISCLOSURE"] }));
    expect(seenPreferred?.nextSourceFamily).toBe("ISSUER_ATTRIBUTED_RELEASE");
    const noAvailable = evaluate(base({ seenFamilies: ["FILING_AUTHORITY"], availableFamilies: [], primaryAvailable: false }));
    expect(noAvailable?.nextSourceFamily).toBeNull();
    expect(noAvailable?.degradationReasons).toContain("PRIMARY_SOURCE_UNAVAILABLE");
  });

  it("conforms the full normal transition path with authentic previous results", () => {
    const input = base();
    const expected = ["SOURCE_RETRIEVAL_REQUIRED", "ISSUER_MAPPING_REQUIRED", "ASSET_MAPPING_REQUIRED", "PRIMARY_DISCLOSURE_REQUIRED", "CORRECTION_REVIEW_REQUIRED", "CORROBORATION_REVIEW_REQUIRED", "ELIGIBILITY_REVIEW_REQUIRED", "NON_AUTHORITATIVE_REVIEW_COMPLETE"];
    let result = evaluate(input);
    expect(result?.nextState).toBe(expected[0]);
    for (const next of expected.slice(1)) {
      result = evaluate(input, result);
      expect(result?.nextState).toBe(next);
    }
    expect(result).toMatchObject({ status: "NON_AUTHORITATIVE_ROUTING_RESULT", authorityIssued: false, persistenceAllowed: false, signalEligible: false, tradingEligible: false, independentFactualOriginGroups: 0, independentFactualCorroboration: "UNSUPPORTED" });
  });

  it("rejects missing, copied, terminal, wrong-decision and candidate/time-mismatched progression results", () => {
    const input = base();
    const first = evaluate(input)!;
    expect(evaluate(input, null)).toBeNull();
    expect(evaluate(input, { ...first })).toBeNull();
    expect(evaluate(input, { ...first, stageHistory: ["DISCOVERED", "SOURCE_RETRIEVAL_REQUIRED"] })).toBeNull();
    expect(evaluate(input, { ...first, routingResultId: "forged" })).toBeNull();
    expect(evaluate(input, { ...first, nextState: "STOPPED_BLOCKED" })).toBeNull();
    expect(evaluateSourcePortfolioRouting({ ...decision }, input, first)).toBeNull();
    expect(evaluate({ ...input, candidateId: "candidate:other" }, first)).toBeNull();
    expect(evaluate({ ...input, evaluationAsOf: "2026-10-04T00:00:00.000Z" }, first)).toBeNull();
    expect(evaluate({ ...input, correctionFieldHints: ["ISSUER"] }, first)).toBeNull();
    expect(evaluate({ ...input, listingScopes: ["listing:other"] }, first)).toBeNull();
    expect(evaluate({ ...input, originBindings: [{ sourceRecordId: "record:one", retrievalArtifactId: "artifact:one", publicationId: "publication:one", issuerOriginId: null, distributionCopyOf: null }] }, first)).toBeNull();
    const changedStageObservation = base({ seenFamilies: ["REGULATORY_OR_EXCHANGE_DISCLOSURE"], availableFamilies: [] });
    expect(evaluate(changedStageObservation, first)?.sourceStrength).toBe("REGULATORY_PUBLICATION");
  });

  it("documents and pins decision/error guard priority for invalid decisions, inputs and previous results", () => {
    expect(evaluateSourcePortfolioRouting({ ...decision }, null)).toBeNull();
    expect(evaluateSourcePortfolioRouting(decision, null, null)).toBeNull();
    expect(parseSyntheticRoutingMaterial({ ...base(), jurisdiction: "DUAL_LISTED", listingScopes: [] }).status).toBe("INVALID");
    expect(parseSyntheticRoutingMaterial({ ...base(), evaluationAsOf: "2026-10-01T00:00:00.000Z", correctionAvailableAt: "2026-10-02T00:00:00.000Z", correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"] }).status).toBe("INVALID");
    expect(ROUTING_SEMANTIC_MATERIAL.inputContract.validationOrder[0]).toBe("EXACT_ROOT_AND_DESCRIPTOR_SHAPE");
    expect(ROUTING_SEMANTIC_MATERIAL.progression.previousResultGuardOrder).toEqual(["MODULE_LOCAL_ROUTING_RESULT_TRUST", "BOUND_DECISION_FINGERPRINT", "EXACT_CANDIDATE_BINDING", "PRIOR_RESULT_NOT_TERMINAL", "BOUND_HISTORY_TAIL_EQUALS_PRIOR_NEXT_STATE"]);
  });

  it("conforms event-hint milestones, completion gating, and the declared/runtime retraction mismatch", () => {
    const hints = ROUTING_SEMANTIC_MATERIAL.inputContract.eventHints as readonly SyntheticRoutingMaterial["eventHint"][];
    for (const eventHint of hints) expect(evaluate(base({ eventHint }))?.currentState).toBe("DISCOVERED");
    const completedMissing = base({ eventHint: "COMPLETED_PURCHASE", completionMaterialPresent: false });
    const atPrimary = priorAtCurrentState(completedMissing, "PRIMARY_DISCLOSURE_REQUIRED");
    expect(atPrimary).not.toBeNull();
    expect(evaluate(completedMissing, atPrimary)?.nextState).toBe("STOPPED_BLOCKED");
    const retractionHintOnly = base({ eventHint: "RETRACTION_WITHDRAWAL", retracted: false });
    expect(evaluate(retractionHintOnly)?.nextState).toBe("SOURCE_RETRIEVAL_REQUIRED");
    const atCorrectionStage = priorAtCurrentState(retractionHintOnly, "CORRECTION_REVIEW_REQUIRED");
    expect(atCorrectionStage).not.toBeNull();
    expect(evaluate(retractionHintOnly, atCorrectionStage)?.nextState).toBe("CORROBORATION_REVIEW_REQUIRED");
    const actualRetraction = base({ eventHint: "RETRACTION_WITHDRAWAL", retracted: true });
    expect(evaluate(actualRetraction)?.nextState).toBe("STOPPED_BLOCKED");
    expect(ROUTING_SEMANTIC_MATERIAL.eventRouting.parentEventRouteRows.find(row => row.hint === "RETRACTION_WITHDRAWAL")?.retractionStops).toBe(true);
    expect(ROUTING_SEMANTIC_MATERIAL.eventRouting.retractionHintAloneStops).toBe(false);
  });

  it("conforms stop precedence, stage requirements, degradation reasons and correction-time boundaries", () => {
    const stopInputs = [
      base({ retracted: true }),
      base({ conflicts: ["SOURCE_MATERIAL_CONFLICT"] }),
      base({ rightsApproved: false }),
      base({ credentialAvailable: false }),
      base({ correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-02T00:00:00.000Z" }),
      base({ duplicate: true }),
      base({ jurisdiction: "DUAL_LISTED", listingScopes: ["listing:lse", "listing:asx"] }),
    ];
    for (const input of stopInputs) expect(evaluate(input)?.nextState).toBe("STOPPED_BLOCKED");
    expect(evaluate(base({ duplicate: true, correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-02T00:00:00.000Z" }))?.operationalPriority).toBe("NO_ACTION_DUPLICATE");
    const atReceived = base({ correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-01T00:02:00.000Z" });
    expect(parseSyntheticRoutingMaterial(atReceived).status).toBe("VALID");
    expect(parseSyntheticRoutingMaterial(base({ ...atReceived, correctionAvailableAt: "2026-09-30T23:59:59.999Z" })).status).toBe("INVALID");
    expect(parseSyntheticRoutingMaterial(base({ ...atReceived, correctionAvailableAt: "2026-10-01T00:00:00.000Z" })).status).toBe("VALID");
    expect(parseSyntheticRoutingMaterial(base({ ...atReceived, correctionAvailableAt: "2026-10-03T00:00:00.000Z" })).status).toBe("VALID");
    expect(parseSyntheticRoutingMaterial(base({ ...atReceived, evaluationAsOf: "2026-10-02T23:59:59.999Z", correctionAvailableAt: "2026-10-03T00:00:00.000Z" })).status).toBe("INVALID");
  });

  it("materializes conditional degradation codes and the identical primaryNeeded route effect", () => {
    const cases: Array<[SyntheticRoutingMaterial, string]> = [
      [base({ duplicate: true }), "DUPLICATE_MATERIAL"],
      [base({ rightsApproved: false }), "RIGHTS_UNAPPROVED"],
      [base({ credentialAvailable: false }), "CREDENTIAL_MISSING"],
      [base({ qualificationComplete: false }), "SOURCE_QUALIFICATION_INCOMPLETE"],
      [base({ issuerMapped: false }), "MAPPING_INCOMPLETE"],
      [base({ primaryAvailable: false }), "PRIMARY_SOURCE_UNAVAILABLE"],
      [base({ seenFamilies: ["ISSUER_ATTRIBUTED_RELEASE"], availableFamilies: ["REGULATORY_OR_EXCHANGE_DISCLOSURE"] }), "PRIMARY_SOURCE_UNAVAILABLE"],
      [base({ correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-02T00:00:00.000Z" }), "CORRECTION_UNRESOLVED"],
      [base({ stale: true }), "STALE_MATERIAL"],
      [base({ jurisdiction: "UNKNOWN", listingScopes: [] }), "UNSUPPORTED_JURISDICTION"],
      [base({ conflicts: ["SOURCE_MATERIAL_CONFLICT"] }), "CONFLICTING_MATERIAL"],
      [base({ eventHint: "COMPLETED_PURCHASE", completionMaterialPresent: false }), "PRIMARY_SOURCE_UNAVAILABLE"],
      [base({ eventHint: "COMPLETED_PURCHASE", seenFamilies: ["ISSUER_ATTRIBUTED_RELEASE"] }), "PRIMARY_SOURCE_UNAVAILABLE"],
      [base({ eventHint: "RETRACTION_WITHDRAWAL" }), "CORRECTION_UNRESOLVED"],
    ];
    for (const [input, reason] of cases) {
      expect(parseSyntheticRoutingMaterial(input).status).toBe("VALID");
      const result = evaluate(input)!;
      expect(result.degradationReasons).toContain(reason);
      expect(result.degradationReasons).toContain("ACQUISITION_DISABLED");
    }
    let complete = evaluate(base())!;
    while (complete.nextState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE") complete = evaluate(base(), complete)!;
    expect(complete.degradationReasons).toContain("INDEPENDENT_CORROBORATION_UNAVAILABLE");

    const ordinary = base({ eventHint: "PURCHASE_INTENT" });
    const primaryNeeded = base({ eventHint: "BINDING_AGREEMENT" });
    const ordinaryPrior = priorAtCurrentState(ordinary, "PRIMARY_DISCLOSURE_REQUIRED");
    const primaryNeededPrior = priorAtCurrentState(primaryNeeded, "PRIMARY_DISCLOSURE_REQUIRED");
    expect(ordinaryPrior).not.toBeNull();
    expect(primaryNeededPrior).not.toBeNull();
    const ordinaryResult = evaluate(ordinary, ordinaryPrior)!;
    const primaryNeededResult = evaluate(primaryNeeded, primaryNeededPrior)!;
    expect(ordinaryResult.nextState).toBe("CORRECTION_REVIEW_REQUIRED");
    expect(primaryNeededResult.nextState).toBe("CORRECTION_REVIEW_REQUIRED");
    expect({ ...ordinaryResult, eventHint: undefined, routingResultId: undefined }).toEqual({ ...primaryNeededResult, eventHint: undefined, routingResultId: undefined });
    expect(ordinaryResult.eventHint).not.toBe(primaryNeededResult.eventHint);
    expect(ordinaryResult.routingResultId).not.toBe(primaryNeededResult.routingResultId);

    expect(evaluate(base())?.operationalPriority).toBe("ROUTINE_DISCOVERY_REVIEW");
    expect(evaluate(base({ duplicate: true }))?.operationalPriority).toBe("NO_ACTION_DUPLICATE");
    expect(evaluate(base({ correctionPresent: true, correctionResolved: true, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-02T00:00:00.000Z" }))?.operationalPriority).toBe("URGENT_CORRECTION_REVIEW");
    expect(evaluate(base({ rightsApproved: false }))?.operationalPriority).toBe("BLOCKED_RIGHTS");
    expect(evaluate(base({ primaryAvailable: false }))?.operationalPriority).toBe("PRIMARY_SOURCE_MISSING");
    expect(evaluate(base({ seenFamilies: ["ISSUER_ATTRIBUTED_RELEASE"], availableFamilies: ["REGULATORY_OR_EXCHANGE_DISCLOSURE"] }))?.operationalPriority).toBe("PRIMARY_SOURCE_MISSING");
    expect(evaluate(base({ issuerMapped: false }))?.operationalPriority).toBe("MAPPING_REQUIRED");
  });

  it("pins all valid combinations of retraction hint and retracted flag", () => {
    const cases = [
      { eventHint: "PURCHASE_INTENT", retracted: false, blocked: false },
      { eventHint: "RETRACTION_WITHDRAWAL", retracted: false, blocked: false },
      { eventHint: "PURCHASE_INTENT", retracted: true, blocked: true },
      { eventHint: "RETRACTION_WITHDRAWAL", retracted: true, blocked: true },
    ] as const;
    for (const fixture of cases) {
      const input = base({ eventHint: fixture.eventHint, retracted: fixture.retracted });
      expect(parseSyntheticRoutingMaterial(input).status).toBe("VALID");
      const result = evaluate(input)!;
      expect(result.nextState === "STOPPED_BLOCKED").toBe(fixture.blocked);
      if (fixture.eventHint === "RETRACTION_WITHDRAWAL") expect(result.degradationReasons).toContain("CORRECTION_UNRESOLVED");
      expect(result.operationalPriority).toBe(fixture.retracted ? "URGENT_CORRECTION_REVIEW" : "ROUTINE_DISCOVERY_REVIEW");
    }
  });

  it("covers the state-specific stop branches and unknown-jurisdiction progression guard", () => {
    const routeFrom = (currentState: string, initial: Partial<SyntheticRoutingMaterial>, next: Partial<SyntheticRoutingMaterial>) => {
      const original = base(initial);
      const prior = currentState === "DISCOVERED" ? undefined : priorAtCurrentState(original, currentState);
      expect(currentState === "DISCOVERED" || prior).toBeTruthy();
      return evaluate(base({ ...original, ...next }), prior);
    };
    expect(routeFrom("SOURCE_RETRIEVAL_REQUIRED", {}, { qualificationComplete: false })?.nextState).toBe("STOPPED_BLOCKED");
    expect(routeFrom("SOURCE_RETRIEVAL_REQUIRED", {}, { primaryAvailable: false })?.nextState).toBe("STOPPED_BLOCKED");
    expect(routeFrom("SOURCE_RETRIEVAL_REQUIRED", {}, { seenFamilies: [] })?.nextState).toBe("STOPPED_BLOCKED");
    expect(routeFrom("ISSUER_MAPPING_REQUIRED", {}, { issuerMapped: false })?.nextState).toBe("STOPPED_BLOCKED");
    expect(routeFrom("ASSET_MAPPING_REQUIRED", {}, { assetMapped: false })?.nextState).toBe("STOPPED_BLOCKED");
    expect(routeFrom("PRIMARY_DISCLOSURE_REQUIRED", {}, { seenFamilies: ["DISCOVERY_AGGREGATOR"] })?.nextState).toBe("STOPPED_BLOCKED");
    expect(routeFrom("CORRECTION_REVIEW_REQUIRED", { eventHint: "CORRECTION_AMENDMENT" }, { correctionResolved: false })?.nextState).toBe("STOPPED_BLOCKED");
    const unknownStart = evaluate(base({ jurisdiction: "UNKNOWN", listingScopes: [], seenFamilies: [], availableFamilies: ["DISCOVERY_AGGREGATOR"] }));
    expect(unknownStart?.nextState).toBe("SOURCE_RETRIEVAL_REQUIRED");
    expect(evaluate(base({ jurisdiction: "UNKNOWN", listingScopes: [], seenFamilies: [], availableFamilies: ["DISCOVERY_AGGREGATOR"] }), unknownStart)?.nextState).toBe("STOPPED_BLOCKED");
  });

  it("preserves authentic discovery source-family boundaries outside the routing parser", () => {
    const cutoff = "2026-10-03T12:00:00.000Z";
    const candidate = createSyntheticNewsDiscoveryCandidate(syntheticAggregatorRecord(), cutoff);
    expect(candidate).not.toBeNull();
    if (!candidate) return;
    const route = base({ candidateId: candidate.candidateId, jurisdiction: "US_SEC", listingScopes: ["listing:us-sec"], seenFamilies: ["DISCOVERY_AGGREGATOR"], availableFamilies: [], publicationAt: candidate.record.publishedAt, discoveredAt: candidate.record.discoveredAt, receivedAt: candidate.record.receivedAt, evaluationAsOf: cutoff, correctionResolved: false });
    const accepted = composeEventIntelligenceEvidenceReviewQueue({ evaluationAsOf: cutoff, candidates: [{ candidate, routingMaterial: route }] });
    expect(accepted.status).toBe("COMPOSED");
    const relabeled = { ...route, seenFamilies: ["FILING_AUTHORITY"] as SyntheticRoutingMaterial["seenFamilies"] };
    expect(composeEventIntelligenceEvidenceReviewQueue({ evaluationAsOf: cutoff, candidates: [{ candidate, routingMaterial: relabeled }] })).toMatchObject({ status: "BLOCKED", code: "COMPOSITION_INPUT_INVALID" });
  });
});
