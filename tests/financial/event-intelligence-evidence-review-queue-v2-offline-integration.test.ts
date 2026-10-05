import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfflineReviewDemoQueueV2Fixtures, createOfflineReviewDemoReplayEpisodeFixtures, OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF } from "@/application/intelligence/offline-review-demo-fixtures";
import { composeEventIntelligenceEvidenceReviewQueue } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import { composeEventIntelligenceEvidenceReviewQueueV2, isAuthenticEventIntelligenceQueueV2Composition } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue-v2";
import { projectEvidenceReviewQueueV2ToViewModel, isAuthenticEvidenceReviewQueueV2ViewModel } from "@/application/intelligence/project-event-intelligence-evidence-review-queue-v2-view-model";
import { evaluateEvidenceReviewQueueV2, isAuthenticEvidenceReviewQueueV2, isAuthenticEvidenceReviewQueueSet, projectRoutingResultToEvidenceReviewItem, sealEvidenceReviewQueueSet } from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import { evaluateSourcePortfolioRouting, getSourcePortfolioDecision, isAuthenticRoutingEvaluation } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { loadEventIntelligenceOfflineQueueV2Comparison } from "@/application/intelligence/load-event-intelligence-offline-queue-v2-comparison";

afterEach(() => vi.unstubAllEnvs());

function candidates(fixtures: NonNullable<ReturnType<typeof createOfflineReviewDemoQueueV2Fixtures>>["fixtures"]) {
  return fixtures.map(fixture => ({ candidate: fixture.candidate, routingMaterial: fixture.routingMaterial }));
}

describe("opt-in queue V2 offline integration", () => {
  it("composes the same three authenticated inputs independently through V1 and V2 and projects separately versioned results", async () => {
    const demo = createOfflineReviewDemoQueueV2Fixtures();
    expect(demo).not.toBeNull();
    const input = { evaluationAsOf: OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, candidates: candidates(demo!.fixtures) };
    const v1 = composeEventIntelligenceEvidenceReviewQueue(input);
    const v2 = composeEventIntelligenceEvidenceReviewQueueV2(input);
    expect(v1.status).toBe("COMPOSED");
    expect(v2.status).toBe("COMPOSED");
    if (v1.status !== "COMPOSED" || v2.status !== "COMPOSED") return;

    expect(v1.composition.version).toBe("event-intelligence-evidence-review-queue-composition/v1");
    expect(v2.composition.version).toBe("event-intelligence-evidence-review-queue-composition/v2");
    expect(v1.composition.viewModel.version).toBe("event-intelligence-evidence-review-queue-view-model/v1");
    expect(v2.composition.queue.contractVersion).toBe("event-intelligence-evidence-review-queue-contract/v2");
    expect(v1.composition.viewModel.state).toBe("HAS_REVIEW_ITEMS");
    expect(v2.composition.queue.status).toBe("HAS_REVIEW_ITEMS");
    expect(v1.composition.viewModel.items.map(item => [item.reviewType, item.status, item.operationalPriority])).toEqual([
      ["CORRECTION_LINEAGE_REVIEW", "BLOCKED", "URGENT_CORRECTION_REVIEW"],
      ["RIGHTS_APPROVAL_REVIEW", "BLOCKED", "BLOCKED_RIGHTS"],
      ["ISSUER_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED"],
    ]);
    expect(v2.composition.queue.members.map(item => [item.itemType, item.status, item.priority])).toEqual([
      ["CORRECTION_LINEAGE_REVIEW", "BLOCKED", "URGENT_CORRECTION_REVIEW"],
      ["RIGHTS_APPROVAL_REVIEW", "BLOCKED", "BLOCKED_RIGHTS"],
      ["ISSUER_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED"],
    ]);
    expect(v2.composition.queue.members.every(item => item.evaluationAsOf === OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF)).toBe(true);
    const model = projectEvidenceReviewQueueV2ToViewModel(v2.composition);
    expect(model).not.toBeNull();
    expect(model?.items.map(item => [item.reviewType, item.status, item.operationalPriority, item.historical])).toEqual([
      ["CORRECTION_LINEAGE_REVIEW", "BLOCKED", "URGENT_CORRECTION_REVIEW", true],
      ["RIGHTS_APPROVAL_REVIEW", "BLOCKED", "BLOCKED_RIGHTS", true],
      ["ISSUER_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED", true],
    ]);
    expect(isAuthenticEventIntelligenceQueueV2Composition(v2.composition)).toBe(true);
    expect(isAuthenticEventIntelligenceQueueV2Composition(v1.composition)).toBe(false);
    expect(isAuthenticEvidenceReviewQueueSet(v2.composition.queue)).toBe(false);
    expect(isAuthenticEvidenceReviewQueueV2(JSON.parse(JSON.stringify(v2.composition.queue)))).toBe(false);
    expect(isAuthenticEventIntelligenceQueueV2Composition(JSON.parse(JSON.stringify(v2.composition)))).toBe(false);
    expect(isAuthenticEvidenceReviewQueueV2ViewModel(model)).toBe(true);
    expect(isAuthenticEvidenceReviewQueueV2ViewModel(JSON.parse(JSON.stringify(model)))).toBe(false);
    expect(evaluateEvidenceReviewQueueV2(getSourcePortfolioDecision(), model?.items)).toBeNull();
    expect(v1.composition.viewModel.items.map(item => [item.reviewType, item.status, item.operationalPriority])).toEqual(model?.items.map(item => [item.reviewType, item.status, item.operationalPriority]));
    expect(Object.isFrozen(v2.composition.queue.members[0])).toBe(true);
    expect(Object.isFrozen(v2.composition.queue.members[0]?.blockerCodes)).toBe(true);
    expect(() => { (v2.composition.queue.members[0] as { status: string }).status = "OPEN"; }).toThrow();
  });

  it("is independent of fixture input order while rejecting unauthenticated, duplicate, cross-bound and mixed-cutoff inputs", () => {
    const demo = createOfflineReviewDemoQueueV2Fixtures();
    const base = candidates(demo!.fixtures);
    const reordered = composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, candidates: [...base].reverse() });
    expect(reordered.status).toBe("COMPOSED");
    if (reordered.status === "COMPOSED") expect(reordered.composition.queue.members.map(member => [member.itemType, member.status, member.priority])).toEqual([
      ["CORRECTION_LINEAGE_REVIEW", "BLOCKED", "URGENT_CORRECTION_REVIEW"],
      ["RIGHTS_APPROVAL_REVIEW", "BLOCKED", "BLOCKED_RIGHTS"],
      ["ISSUER_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED"],
    ]);

    const copiedCandidate = { ...base[0]!.candidate };
    expect(composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, candidates: [{ ...base[0]!, candidate: copiedCandidate }, ...base.slice(1)] })).toMatchObject({ status: "BLOCKED", code: "COMPOSITION_CANDIDATE_UNTRUSTED" });
    expect(composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, candidates: [] })).toMatchObject({ status: "BLOCKED", code: "COMPOSITION_INPUT_INVALID" });
    expect(composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, candidates: [{ candidate: base[0]!.candidate }, ...base.slice(1)] })).toMatchObject({ status: "BLOCKED", code: "COMPOSITION_INPUT_INVALID" });
    expect(composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, candidates: [base[0], base[0]] })).toMatchObject({ status: "BLOCKED" });
    expect(composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, candidates: [{ candidate: base[0]!.candidate, routingMaterial: base[1]!.routingMaterial }, ...base.slice(1)] })).toMatchObject({ status: "BLOCKED" });

    const episodes = createOfflineReviewDemoReplayEpisodeFixtures();
    const mixed = [...candidates(episodes![0]!.fixtures), ...candidates(episodes![1]!.fixtures).slice(2)];
    expect(composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, candidates: mixed })).toMatchObject({ status: "BLOCKED", code: "COMPOSITION_CUTOFF_MISMATCH" });
    const decision = getSourcePortfolioDecision();
    const authenticRoute = evaluateSourcePortfolioRouting(decision, base[0]!.routingMaterial);
    expect(authenticRoute).not.toBeNull();
    if (authenticRoute) {
      const v1Queue = sealEvidenceReviewQueueSet(decision, [authenticRoute]);
      expect(v1Queue.status).toBe("SEALED");
      if (v1Queue.status === "SEALED") expect(isAuthenticEvidenceReviewQueueV2(v1Queue.queueSet)).toBe(false);
    }
  });

  it("evaluates a real two-conflict routing collision with V1 and V2, retaining both blockers", () => {
    const demo = createOfflineReviewDemoQueueV2Fixtures();
    const fixture = demo!.conflictFixture;
    expect(fixture.routingMaterial.conflicts).toEqual(["AMOUNT_CURRENCY_CONFLICT", "LIFECYCLE_CONFLICT"]);
    const decision = getSourcePortfolioDecision();
    let route = evaluateSourcePortfolioRouting(decision, fixture.routingMaterial);
    expect(route && isAuthenticRoutingEvaluation(route)).toBe(true);
    if (!route) return;
    let steps = 1;
    while (route.nextState !== "STOPPED_BLOCKED" && route.nextState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE") {
      const next = evaluateSourcePortfolioRouting(decision, fixture.routingMaterial, route);
      expect(next && isAuthenticRoutingEvaluation(next)).toBe(true);
      if (!next) return;
      route = next;
      steps++;
      expect(steps).toBeLessThanOrEqual(9);
    }
    const v1 = projectRoutingResultToEvidenceReviewItem(decision, route);
    const v2 = evaluateEvidenceReviewQueueV2(decision, [route]);
    expect(v1).toMatchObject({ itemType: "SOURCE_CONFLICT_REVIEW", status: "BLOCKED", priority: "CONFLICT_REVIEW", requiredNextAction: "REVIEW_LIFECYCLE" });
    expect(v2 && isAuthenticEvidenceReviewQueueV2(v2)).toBe(true);
    expect(v2?.members[0]).toMatchObject({ itemType: "SOURCE_CONFLICT_REVIEW", status: "BLOCKED", priority: "CONFLICT_REVIEW", requiredNextAction: "REVIEW_LIFECYCLE", blockerCodes: expect.arrayContaining(["LIFECYCLE_CONFLICT", "AMOUNT_CURRENCY_CONFLICT"]) });
    expect(v1?.blockerReasons.map(blocker => blocker.code)).toEqual(expect.arrayContaining(["LIFECYCLE_CONFLICT", "AMOUNT_CURRENCY_CONFLICT"]));
  });

  it("keeps V1 and V2 comparisons separate from the standalone conflict fixture and filters as presentation data", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await loadEventIntelligenceOfflineQueueV2Comparison();
    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") return;
    expect(result.v1.model.items).toHaveLength(3);
    expect(result.v2.model.items).toHaveLength(3);
    expect(result.conflict.sameClassification).toBe(true);
    expect(result.conflict.v1.nextAction).toBe("REVIEW_LIFECYCLE");
    expect(result.conflict.v2.nextAction).toBe("REVIEW_LIFECYCLE");
    expect(result.conflict.v1.blockers).toEqual(result.conflict.v2.blockers);
    expect("candidateId" in result.v2.model.items[0]!).toBe(false);
    expect("routingResultId" in result.v2.model.items[0]!).toBe(false);
    expect("policy" in result.v2.model.items[0]!).toBe(false);
  });
});
