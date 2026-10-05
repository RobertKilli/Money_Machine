import { describe, expect, it } from "vitest";
import { createOfflineReviewDemoFixtures } from "@/application/intelligence/offline-review-demo-fixtures";
import {
  buildOfflineReviewMilestoneExpectation, getOfflineReviewMilestoneRoutingContext,
  isAuthenticIssuedOfflineReviewMilestoneEvidence, issueOfflineReviewMilestoneEvidence,
  OFFLINE_REVIEW_MILESTONE_ISSUER_ID, OFFLINE_REVIEW_MILESTONE_POLICY,
  OFFLINE_REVIEW_MILESTONE_REVIEWER_ID, revokeOfflineReviewMilestoneEvidence,
  validateOfflineReviewMilestoneEvidence,
} from "@/application/intelligence/offline-review-milestone-evidence";
import { evaluateSourcePortfolioRouting, getSourcePortfolioDecision, isAuthenticRoutingEvaluation } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { createSyntheticNewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import { parseReviewMilestoneEvidence, REVIEW_MILESTONE_EVIDENCE_VERSION } from "@/domain/intelligence/event-intelligence-review-milestone-evidence";

const CUTOFF = "2026-10-03T12:00:00.000Z";
let evidenceSequence = 0;

function context() {
  const fixture = createOfflineReviewDemoFixtures()!.find(item => item.key === "issuer-mapping")!;
  const decision = getSourcePortfolioDecision();
  const material = { ...fixture.routingMaterial, primaryAvailable: true, qualificationComplete: true, rightsApproved: true };
  const first = evaluateSourcePortfolioRouting(decision, material)!;
  const route = evaluateSourcePortfolioRouting(decision, material, first)!;
  expect(isAuthenticRoutingEvaluation(first)).toBe(true);
  expect(isAuthenticRoutingEvaluation(route)).toBe(true);
  expect(route.currentState).toBe("SOURCE_RETRIEVAL_REQUIRED");
  expect(route.nextState).toBe("ISSUER_MAPPING_REQUIRED");
  return { candidate: fixture.candidate, route, fixture };
}

function rawEvidence(candidate: ReturnType<typeof context>["candidate"], route: ReturnType<typeof context>["route"], overrides: Record<string, unknown> = {}) {
  const routingContext = getOfflineReviewMilestoneRoutingContext(candidate, route)!;
  evidenceSequence++;
  return {
    contractVersion: REVIEW_MILESTONE_EVIDENCE_VERSION,
    evidenceId: `synthetic-review-evidence-${evidenceSequence}`,
    subject: { kind: "DISCOVERY_CANDIDATE", contractVersion: "event-intelligence-news-discovery/v1", candidateId: candidate.candidateId, revisionFingerprint: candidate.fingerprint },
    milestone: "SOURCE_RETRIEVAL",
    policy: { ...OFFLINE_REVIEW_MILESTONE_POLICY },
    routingContext,
    issuer: { kind: "SYNTHETIC_OFFLINE_ISSUER", issuerId: OFFLINE_REVIEW_MILESTONE_ISSUER_ID },
    reviewer: { kind: "SYNTHETIC_OFFLINE_REVIEWER", reviewerId: OFFLINE_REVIEW_MILESTONE_REVIEWER_ID },
    evidenceAvailableAt: "2026-10-03T11:00:00.000Z",
    reviewedAt: "2026-10-03T11:30:00.000Z",
    issuedAt: "2026-10-03T11:45:00.000Z",
    evaluationCutoff: CUTOFF,
    outcome: "COMPLETED_PROCEED",
    reasonCodes: ["REVIEW_COMPLETED"],
    correctsEvidenceId: null,
    ...overrides,
  };
}

function issue(candidate: ReturnType<typeof context>["candidate"], route: ReturnType<typeof context>["route"], raw = rawEvidence(candidate, route), corrects?: unknown) {
  const result = issueOfflineReviewMilestoneEvidence(candidate, route, raw, corrects);
  expect(result.status).toBe("ISSUED");
  if (result.status !== "ISSUED") throw new Error(result.code);
  return result.reference;
}
function expectation(candidate: ReturnType<typeof context>["candidate"], route: ReturnType<typeof context>["route"]) {
  return buildOfflineReviewMilestoneExpectation(candidate, route, "SOURCE_RETRIEVAL", OFFLINE_REVIEW_MILESTONE_POLICY, CUTOFF)!;
}

describe("offline review milestone evidence", () => {
  it.each([
    ["COMPLETED_PROCEED", ["REVIEW_COMPLETED"], true, "MILESTONE_PROCEEDED_LOCALLY"],
    ["COMPLETED_STOP", ["REVIEW_STOP_REQUIRED"], true, "MILESTONE_STOPPED_LOCALLY"],
    ["EVIDENCE_INSUFFICIENT", ["MATERIAL_INSUFFICIENT"], false, "MILESTONE_HELD"],
  ] as const)("validates %s only as a local milestone outcome", (outcome, reasonCodes, completed, interpretation) => {
    const { candidate, route } = context();
    const reference = issue(candidate, route, rawEvidence(candidate, route, { outcome, reasonCodes }));
    const result = validateOfflineReviewMilestoneEvidence(candidate, route, expectation(candidate, route), [reference]);
    expect(result).toMatchObject({ status: "VALIDATED", outcome, milestoneCompleted: completed, interpretation, synthetic: true, authority: "NONE" });
    if (result.status === "VALIDATED") {
      expect("progressionAllowed" in result).toBe(false);
      expect("eventAuthority" in result).toBe(false);
    }
  });

  it("strictly parses closed shapes, versions, primitives, canonical times, dense arrays and immutable copies", () => {
    const { candidate, route } = context();
    const raw = rawEvidence(candidate, route);
    const parsed = parseReviewMilestoneEvidence(raw);
    expect(parsed.status).toBe("VALID");
    if (parsed.status !== "VALID") return;
    raw.subject.revisionFingerprint = "f".repeat(64);
    expect(parsed.evidence.subject.revisionFingerprint).toBe(candidate.fingerprint);
    expect(Object.isFrozen(parsed.evidence)).toBe(true);
    expect(Object.isFrozen(parsed.evidence.routingContext.stageHistory)).toBe(true);
    expect(parseReviewMilestoneEvidence({ ...rawEvidence(candidate, route), extra: true })).toMatchObject({ status: "INVALID", code: "SCHEMA_INVALID" });
    const missing = rawEvidence(candidate, route); delete (missing as Record<string, unknown>).reviewer;
    expect(parseReviewMilestoneEvidence(missing)).toMatchObject({ status: "INVALID", code: "SCHEMA_INVALID" });
    expect(parseReviewMilestoneEvidence({ ...rawEvidence(candidate, route), contractVersion: "v9" })).toMatchObject({ status: "INVALID", code: "VERSION_UNSUPPORTED" });
    expect(parseReviewMilestoneEvidence({ ...rawEvidence(candidate, route), outcome: "CONFLICT" })).toMatchObject({ status: "INVALID", code: "OUTCOME_UNSUPPORTED" });
    expect(parseReviewMilestoneEvidence({ ...rawEvidence(candidate, route), milestone: "LIFECYCLE_AUTHORITY" })).toMatchObject({ status: "INVALID", code: "SCHEMA_INVALID" });
    expect(parseReviewMilestoneEvidence({ ...rawEvidence(candidate, route), issuedAt: "2026-10-03T11:45:00Z" })).toMatchObject({ status: "INVALID", code: "TIME_INVALID" });
    expect(parseReviewMilestoneEvidence({ ...rawEvidence(candidate, route), subject: { ...raw.subject, candidateId: 3 } })).toMatchObject({ status: "INVALID", code: "SCHEMA_INVALID" });
    const sparse = rawEvidence(candidate, route); sparse.reasonCodes = new Array(1);
    expect(parseReviewMilestoneEvidence(sparse)).toMatchObject({ status: "INVALID", code: "SCHEMA_INVALID" });
    const accessor = rawEvidence(candidate, route); Object.defineProperty(accessor, "evidenceId", { enumerable: true, get() { throw new Error("caller hook"); } });
    expect(parseReviewMilestoneEvidence(accessor)).toMatchObject({ status: "INVALID", code: "SCHEMA_INVALID" });
  });

  it("requires exact candidate revision and authenticated route identity at issuance and use", () => {
    const { candidate, route } = context(); const raw = rawEvidence(candidate, route);
    expect(issueOfflineReviewMilestoneEvidence({ ...candidate }, route, raw)).toMatchObject({ status: "REJECTED", code: "ROUTING_CONTEXT_UNAUTHENTIC" });
    expect(issueOfflineReviewMilestoneEvidence(candidate, { ...route }, raw)).toMatchObject({ status: "REJECTED", code: "ROUTING_CONTEXT_UNAUTHENTIC" });
    expect(issueOfflineReviewMilestoneEvidence(candidate, route, { ...raw, subject: { ...raw.subject, revisionFingerprint: "f".repeat(64) } })).toMatchObject({ status: "REJECTED", code: "SUBJECT_BINDING_MISMATCH" });
    expect(issueOfflineReviewMilestoneEvidence(candidate, route, { ...raw, issuer: { kind: "SYNTHETIC_OFFLINE_ISSUER", issuerId: "caller-asserted-reviewer" } })).toMatchObject({ status: "REJECTED", code: "ISSUER_CONTEXT_UNSUPPORTED" });
    const reference = issue(candidate, route, raw);
    expect(isAuthenticIssuedOfflineReviewMilestoneEvidence(reference)).toBe(true);
    expect(isAuthenticIssuedOfflineReviewMilestoneEvidence(JSON.parse(JSON.stringify(reference)))).toBe(false);
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, expectation(candidate, route), [JSON.parse(JSON.stringify(reference))])).toMatchObject({ status: "REJECTED", code: "EVIDENCE_UNAUTHENTIC" });
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, expectation(candidate, route), [parseReviewMilestoneEvidence(raw)])).toMatchObject({ status: "REJECTED", code: "EVIDENCE_UNAUTHENTIC" });
    const changedSubject = { ...expectation(candidate, route), subject: { candidateId: candidate.candidateId, revisionFingerprint: "a".repeat(64) } };
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, changedSubject, [reference])).toMatchObject({ status: "REJECTED", code: "BINDING_MISMATCH" });
    const changedPolicy = { ...expectation(candidate, route), policy: { ...OFFLINE_REVIEW_MILESTONE_POLICY, policyVersion: "v2" } };
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, changedPolicy, [reference])).toMatchObject({ status: "REJECTED", code: "BINDING_MISMATCH" });
    const changedMilestone = { ...expectation(candidate, route), milestone: "ELIGIBILITY_REVIEW" };
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, changedMilestone, [reference])).toMatchObject({ status: "REJECTED", code: "BINDING_MISMATCH" });
    const changedRoute = { ...expectation(candidate, route), routingContext: { ...expectation(candidate, route).routingContext, routingResultId: "e".repeat(64) } };
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, changedRoute, [reference])).toMatchObject({ status: "REJECTED", code: "BINDING_MISMATCH" });
    const otherCandidate = createSyntheticNewsDiscoveryCandidate({ ...candidate.record, providerRecordId: "other-revision" }, candidate.evaluatedAt)!;
    const otherRoute = evaluateSourcePortfolioRouting(getSourcePortfolioDecision(), { ...context().fixture.routingMaterial, candidateId: otherCandidate.candidateId, primaryAvailable: true, qualificationComplete: true, rightsApproved: true })!;
    expect(validateOfflineReviewMilestoneEvidence(otherCandidate, otherRoute, expectation(candidate, route), [reference])).toMatchObject({ status: "REJECTED", code: "BINDING_MISMATCH" });
  });

  it("requires typed evidence even when an authentic stage history reaches the requested context", () => {
    const { candidate, route } = context();
    expect(route.stageHistory).toContain("SOURCE_RETRIEVAL_REQUIRED");
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, expectation(candidate, route), [])).toMatchObject({ status: "REJECTED", code: "EVIDENCE_MISSING" });
  });

  it("refuses to issue for authentic blocked or terminal routing contexts", () => {
    const rights = createOfflineReviewDemoFixtures()!.find(item => item.key === "rights-blocked")!;
    const blocked = evaluateSourcePortfolioRouting(getSourcePortfolioDecision(), rights.routingMaterial)!;
    expect(isAuthenticRoutingEvaluation(blocked)).toBe(true);
    expect(blocked.nextState).toBe("STOPPED_BLOCKED");
    expect(issueOfflineReviewMilestoneEvidence(rights.candidate, blocked, rawEvidence(rights.candidate, blocked))).toMatchObject({ status: "REJECTED", code: "ROUTING_CONTEXT_UNSUPPORTED" });

    const { candidate, fixture } = context(); let terminal = evaluateSourcePortfolioRouting(getSourcePortfolioDecision(), fixture.routingMaterial)!;
    while (terminal.nextState !== "STOPPED_BLOCKED" && terminal.nextState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE") terminal = evaluateSourcePortfolioRouting(getSourcePortfolioDecision(), fixture.routingMaterial, terminal)!;
    expect(isAuthenticRoutingEvaluation(terminal)).toBe(true);
    expect(issueOfflineReviewMilestoneEvidence(candidate, terminal, rawEvidence(candidate, terminal))).toMatchObject({ status: "REJECTED", code: "ROUTING_CONTEXT_UNSUPPORTED" });
  });

  it("rejects evidence issued after the fixed cutoff while allowing equality at the cutoff", () => {
    const { candidate, route } = context();
    const equal = issue(candidate, route, rawEvidence(candidate, route, { evidenceAvailableAt: CUTOFF, reviewedAt: CUTOFF, issuedAt: CUTOFF }));
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, expectation(candidate, route), [equal])).toMatchObject({ status: "VALIDATED", outcome: "COMPLETED_PROCEED" });
    const future = issue(candidate, route, rawEvidence(candidate, route, { issuedAt: "2026-10-03T12:00:00.001Z" }));
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, expectation(candidate, route), [future])).toMatchObject({ status: "REJECTED", code: "FUTURE_EVIDENCE" });
    const futureMaterial = issue(candidate, route, rawEvidence(candidate, route, { evidenceAvailableAt: "2026-10-03T12:00:00.001Z", reviewedAt: "2026-10-03T12:00:00.001Z", issuedAt: "2026-10-03T12:00:00.001Z" }));
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, expectation(candidate, route), [futureMaterial])).toMatchObject({ status: "REJECTED", code: "FUTURE_EVIDENCE" });
  });

  it("uses explicit append-only correction links and never timestamp-wins conflicts", () => {
    const { candidate, route } = context(); const expected = expectation(candidate, route);
    const earlier = issue(candidate, route, rawEvidence(candidate, route, { outcome: "EVIDENCE_INSUFFICIENT", reasonCodes: ["MATERIAL_INSUFFICIENT"], issuedAt: "2026-10-03T11:35:00.000Z" }));
    const priorResult = validateOfflineReviewMilestoneEvidence(candidate, route, expected, [earlier]);
    const correction = issue(candidate, route, rawEvidence(candidate, route, { outcome: "COMPLETED_PROCEED", reasonCodes: ["REVIEW_COMPLETED"], issuedAt: "2026-10-03T11:45:00.000Z", correctsEvidenceId: earlier.evidence.evidenceId }), earlier);
    expect(earlier.evidence.outcome).toBe("EVIDENCE_INSUFFICIENT");
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, expected, [earlier, correction])).toMatchObject({ status: "VALIDATED", outcome: "COMPLETED_PROCEED" });
    expect(priorResult).toMatchObject({ status: "VALIDATED", outcome: "EVIDENCE_INSUFFICIENT", milestoneCompleted: false });
    const independent = issue(candidate, route, rawEvidence(candidate, route, { issuedAt: "2026-10-03T11:59:00.000Z" }));
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, expected, [earlier, independent])).toMatchObject({ status: "HELD", code: "EVIDENCE_CONFLICT", outcome: "EVIDENCE_INSUFFICIENT", milestoneCompleted: false });
  });

  it("simulates revocation for new use without rewriting the historical validation result", () => {
    const { candidate, route } = context(); const reference = issue(candidate, route);
    const historical = validateOfflineReviewMilestoneEvidence(candidate, route, expectation(candidate, route), [reference]);
    expect(revokeOfflineReviewMilestoneEvidence(reference)).toMatchObject({ status: "REVOKED" });
    expect(validateOfflineReviewMilestoneEvidence(candidate, route, expectation(candidate, route), [reference])).toMatchObject({ status: "REJECTED", code: "EVIDENCE_REVOKED" });
    expect(historical).toMatchObject({ status: "VALIDATED", outcome: "COMPLETED_PROCEED" });
  });

  it("keeps unrelated routing blockers and transition output untouched after local proceed", () => {
    const { candidate, route } = context(); const before = { nextState: route.nextState, reasons: [...route.degradationReasons] };
    const result = validateOfflineReviewMilestoneEvidence(candidate, route, expectation(candidate, route), [issue(candidate, route)]);
    expect(result).toMatchObject({ status: "VALIDATED", outcome: "COMPLETED_PROCEED" });
    expect(route.nextState).toBe(before.nextState);
    expect(route.degradationReasons).toEqual(before.reasons);
    expect(route.degradationReasons).toContain("MAPPING_INCOMPLETE");
  });
});
