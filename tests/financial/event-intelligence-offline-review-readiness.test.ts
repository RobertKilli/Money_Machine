import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfflineReviewDemoQueueV2Fixtures } from "@/application/intelligence/offline-review-demo-fixtures";
import { composeEventIntelligenceEvidenceReviewQueueV2, getEventIntelligenceQueueV2CompositionMemberBinding } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue-v2";
import { assessOfflineReviewReadiness } from "@/application/intelligence/offline-review-readiness";
import { createOfflineReviewSession, evaluateOfflineReviewSessionWithReference, issueOfflineReviewSessionEvidence, OFFLINE_REVIEW_SESSION_VERSION, validateFreshOfflineReviewSessionEvaluationReference } from "@/application/intelligence/offline-review-milestone-session";
import { getOfflineReviewMilestoneRoutingContext, OFFLINE_REVIEW_MILESTONE_POLICY, OFFLINE_REVIEW_MILESTONE_ISSUER_ID, OFFLINE_REVIEW_MILESTONE_REVIEWER_ID } from "@/application/intelligence/offline-review-milestone-evidence";
import { evaluateSourcePortfolioRouting, getSourcePortfolioDecision } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { loadOfflineReviewReadinessDemo } from "@/application/intelligence/load-offline-review-readiness-demo";

const CUTOFF = "2026-10-03T12:00:00.000Z";
const POLICY = OFFLINE_REVIEW_MILESTONE_POLICY;
const CONFIG = { contractVersion: OFFLINE_REVIEW_SESSION_VERSION, milestone: "SOURCE_RETRIEVAL" as const, policy: POLICY, issuer: { kind: "SYNTHETIC_OFFLINE_ISSUER" as const, issuerId: OFFLINE_REVIEW_MILESTONE_ISSUER_ID }, reviewer: { kind: "SYNTHETIC_OFFLINE_REVIEWER" as const, reviewerId: OFFLINE_REVIEW_MILESTONE_REVIEWER_ID } };

function setup() {
  const fixtureSet = createOfflineReviewDemoQueueV2Fixtures()!;
  const decision = getSourcePortfolioDecision();
  const composed = composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: CUTOFF, candidates: fixtureSet.fixtures.map(f => ({ candidate: f.candidate, routingMaterial: f.routingMaterial })) });
  expect(composed.status).toBe("COMPOSED");
  if (composed.status !== "COMPOSED") throw Error("composition");
  const fixture = fixtureSet.fixtures.find(f => f.key === "rights-blocked")!;
  const binding = getEventIntelligenceQueueV2CompositionMemberBinding(composed.composition, fixture.candidate, undefined, decision)!;
  const material = { ...fixture.routingMaterial, primaryAvailable: true, qualificationComplete: true, rightsApproved: true };
  const first = evaluateSourcePortfolioRouting(decision, material)!;
  const reviewRoute = evaluateSourcePortfolioRouting(decision, material, first)!;
  const created = createOfflineReviewSession(fixture.candidate, reviewRoute, CONFIG);
  if (created.status !== "CREATED") throw Error(JSON.stringify(created));
  return { fixture, decision, composition: composed.composition, binding, route: reviewRoute, session: created.session };
}

function evidence(c: ReturnType<typeof setup>, id = "readiness-root", corrects: string | null = null) {
  const routingContext = getOfflineReviewMilestoneRoutingContext(c.fixture.candidate, c.route)!;
  const correction = corrects !== null;
  return { contractVersion: "event-intelligence-review-milestone-evidence/v1", evidenceId: id, subject: { kind: "DISCOVERY_CANDIDATE", contractVersion: "event-intelligence-news-discovery/v1", candidateId: c.fixture.candidate.candidateId, revisionFingerprint: c.fixture.candidate.fingerprint }, milestone: CONFIG.milestone, policy: POLICY, routingContext, issuer: CONFIG.issuer, reviewer: CONFIG.reviewer, evidenceAvailableAt: correction ? "2026-10-01T12:30:00.000Z" : "2026-10-01T10:00:00.000Z", reviewedAt: correction ? "2026-10-01T12:45:00.000Z" : "2026-10-01T11:00:00.000Z", issuedAt: correction ? "2026-10-01T13:00:00.000Z" : "2026-10-01T12:00:00.000Z", evaluationCutoff: CUTOFF, outcome: "COMPLETED_PROCEED", reasonCodes: ["REVIEW_COMPLETED"], correctsEvidenceId: corrects };
}

describe("offline review readiness references", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("builds actual read-only scenarios through the server loader", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await loadOfflineReviewReadinessDemo();
    expect(result.status).toBe("AVAILABLE");
    if (result.status === "AVAILABLE") expect(result.items.map(item => item.localReview)).toEqual(["NO_REVIEW_EVIDENCE", "NO_REVIEW_EVIDENCE", "NO_REVIEW_EVIDENCE", "COMPLETED_PROCEED", "COMPLETED_STOP", "HELD", "HELD", "COMPLETED_PROCEED"]);
  });
  it("binds fresh reference to exact session/candidate/routing and preserves actual V2 blockers", () => {
    const c = setup();
    const issued = issueOfflineReviewSessionEvidence(c.session, evidence(c));
    if (issued.status !== "ISSUED") throw Error(JSON.stringify(issued));
    const evaluated = evaluateOfflineReviewSessionWithReference(c.session, CUTOFF);
    expect(evaluated.status).toBe("EVALUATED");
    if (evaluated.status !== "EVALUATED") return;
    const result = assessOfflineReviewReadiness({ reference: evaluated.reference, session: c.session, candidate: c.fixture.candidate, routing: c.route, decision: c.decision, milestone: CONFIG.milestone, policy: POLICY, cutoff: CUTOFF, composition: c.composition });
    expect(result.status).toBe("ASSESSED");
    if (result.status === "ASSESSED") expect(result.assessment).toMatchObject({ localReview: "COMPLETED_PROCEED", queueStatus: "BLOCKED", authorization: "NOT_ESTABLISHED", progression: "NOT_GRANTED" });
  });

  it("invalidates a prior reference after a successful backdated operation but not after rejection", () => {
    const c = setup();
    const initial = evaluateOfflineReviewSessionWithReference(c.session, CUTOFF);
    expect(initial.status).toBe("EVALUATED");
    if (initial.status !== "EVALUATED") return;
    expect(issueOfflineReviewSessionEvidence(c.session, { ...evidence(c), evidenceId: "bad", outcome: "NOT_AN_OUTCOME" })).toMatchObject({ status: "REJECTED" });
    expect(validateFreshOfflineReviewSessionEvaluationReference(initial.reference, { session: c.session, candidate: c.fixture.candidate, routing: c.route, decision: c.decision, milestone: CONFIG.milestone, policy: POLICY, cutoff: CUTOFF }).status).toBe("FRESH");
    expect(issueOfflineReviewSessionEvidence(c.session, evidence(c))).toMatchObject({ status: "ISSUED" });
    expect(validateFreshOfflineReviewSessionEvaluationReference(initial.reference, { session: c.session, candidate: c.fixture.candidate, routing: c.route, decision: c.decision, milestone: CONFIG.milestone, policy: POLICY, cutoff: CUTOFF })).toMatchObject({ status: "REJECTED", code: "REFERENCE_STALE" });
    const fresh = evaluateOfflineReviewSessionWithReference(c.session, CUTOFF);
    expect(fresh.status).toBe("EVALUATED");
    if (fresh.status === "EVALUATED") expect(validateFreshOfflineReviewSessionEvaluationReference(fresh.reference, { session: c.session, candidate: c.fixture.candidate, routing: c.route, decision: c.decision, milestone: CONFIG.milestone, policy: POLICY, cutoff: CUTOFF }).status).toBe("FRESH");
    expect(validateFreshOfflineReviewSessionEvaluationReference(JSON.parse(JSON.stringify(initial.reference)), { session: c.session, candidate: c.fixture.candidate, routing: c.route, decision: c.decision, milestone: CONFIG.milestone, policy: POLICY, cutoff: CUTOFF })).toMatchObject({ status: "REJECTED", code: "REFERENCE_UNAUTHENTIC" });
  });

  it("invalidates references after correction and simulated revocation as well as issuance", async () => {
    const correctionSession = setup();
    const root = issueOfflineReviewSessionEvidence(correctionSession.session, evidence(correctionSession, "readiness-correction-root"));
    expect(root.status).toBe("ISSUED");
    const beforeCorrection = evaluateOfflineReviewSessionWithReference(correctionSession.session, CUTOFF);
    expect(beforeCorrection.status).toBe("EVALUATED");
    if (root.status !== "ISSUED" || beforeCorrection.status !== "EVALUATED") return;
    expect(issueOfflineReviewSessionEvidence(correctionSession.session, evidence(correctionSession, "readiness-correction-child", "readiness-correction-root"), root.reference).status).toBe("ISSUED");
    expect(validateFreshOfflineReviewSessionEvaluationReference(beforeCorrection.reference, { session: correctionSession.session, candidate: correctionSession.fixture.candidate, routing: correctionSession.route, decision: correctionSession.decision, milestone: CONFIG.milestone, policy: POLICY, cutoff: CUTOFF })).toMatchObject({ status: "REJECTED", code: "REFERENCE_STALE" });

    const revocationSession = setup();
    const issued = issueOfflineReviewSessionEvidence(revocationSession.session, evidence(revocationSession, "readiness-revocation-root"));
    expect(issued.status).toBe("ISSUED");
    const beforeRevocation = evaluateOfflineReviewSessionWithReference(revocationSession.session, CUTOFF);
    expect(beforeRevocation.status).toBe("EVALUATED");
    if (issued.status !== "ISSUED" || beforeRevocation.status !== "EVALUATED") return;
    expect((await import("@/application/intelligence/offline-review-milestone-session")).revokeOfflineReviewSessionEvidence(revocationSession.session, issued.reference, "2026-10-02T00:00:00.000Z").status).toBe("REVOKED");
    expect(validateFreshOfflineReviewSessionEvaluationReference(beforeRevocation.reference, { session: revocationSession.session, candidate: revocationSession.fixture.candidate, routing: revocationSession.route, decision: revocationSession.decision, milestone: CONFIG.milestone, policy: POLICY, cutoff: CUTOFF })).toMatchObject({ status: "REJECTED", code: "REFERENCE_STALE" });
  });
});
