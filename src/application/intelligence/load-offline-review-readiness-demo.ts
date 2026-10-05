import "server-only";
import { notFound } from "next/navigation";

export const OFFLINE_REVIEW_READINESS_DEMO_PATH = "/intelligence/events/review/offline-demo/review-readiness" as const;
export type ReadinessDemoItem = Readonly<{ key: string; title: string; scenario: string; description: string; localReview: string; queueStatus: string; priority: string; blockers: readonly string[]; cutoff: string; stale: string; fresh: string; historical: true }>;
export type ReadinessDemoResult = Readonly<{ status: "AVAILABLE"; items: readonly ReadinessDemoItem[] }> | Readonly<{ status: "UNAVAILABLE" }>;
const UNAVAILABLE: ReadinessDemoResult = Object.freeze({ status: "UNAVAILABLE" });
const CUTOFF = "2026-10-03T12:00:00.000Z";
const POLICY = Object.freeze({ policyId: "synthetic-offline-review-milestone", policyVersion: "v1", algorithmVersion: "v1" });
const CONFIG = Object.freeze({ contractVersion: "event-intelligence-offline-review-session/v1", milestone: "SOURCE_RETRIEVAL", policy: POLICY, issuer: Object.freeze({ kind: "SYNTHETIC_OFFLINE_ISSUER", issuerId: "synthetic-review-issuer-v1" }), reviewer: Object.freeze({ kind: "SYNTHETIC_OFFLINE_REVIEWER", reviewerId: "synthetic-reviewer-v1" }) });
const T = Object.freeze({ available: "2026-10-01T10:00:00.000Z", reviewed: "2026-10-01T11:00:00.000Z", issued: "2026-10-01T12:00:00.000Z" });

/** Fixed development-only reference flow; all assessments use the session API and real V2 composition members. */
export async function loadOfflineReviewReadinessDemo(): Promise<ReadinessDemoResult> {
  if (process.env.NODE_ENV !== "development") notFound();
  const [fixtureMod, composeMod, sessionMod, milestoneMod, routingMod] = await Promise.all([
    import("@/application/intelligence/offline-review-demo-fixtures"), import("@/application/intelligence/compose-event-intelligence-evidence-review-queue-v2"),
    import("@/application/intelligence/offline-review-milestone-session"), import("@/application/intelligence/offline-review-milestone-evidence"), import("@/domain/intelligence/event-intelligence-source-portfolio-routing-decision"),
  ]);
  const fixtures = fixtureMod.createOfflineReviewDemoQueueV2Fixtures();
  if (!fixtures) return UNAVAILABLE;
  const composed = composeMod.composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: CUTOFF, candidates: fixtures.fixtures.map(f => ({ candidate: f.candidate, routingMaterial: f.routingMaterial })) });
  if (composed.status !== "COMPOSED") return UNAVAILABLE;
  const decision = routingMod.getSourcePortfolioDecision();
  const output: ReadinessDemoItem[] = [];
  const scenarios = [
    { key: "empty", scenario: "Ingen fullført lokal review", description: "Tom session gir ingen fullført milepæl.", mode: "empty" },
    { key: "proceed", scenario: "COMPLETED_PROCEED", description: "Lokal milepæl fullført; faktiske queue-blockers består.", mode: "proceed" },
    { key: "stop", scenario: "COMPLETED_STOP", description: "Review fullført med stop; dette gir ingen progresjon.", mode: "stop" },
    { key: "held", scenario: "HELD ved konkurrerende evidens", description: "To konkurrerende roots holdes uten timestamp-vinner.", mode: "held" },
    { key: "revoked", scenario: "HELD ved simulert tilbakekalling", description: "Gjeldende syntetisk tilbakekallingsstatus holder lokal bruk.", mode: "revoked" },
    { key: "freshness", scenario: "Utdatert og ny fersk referanse", description: "En vellykket operasjon gjør eldre evalueringsreferanse utdatert; ny evaluering gir en fersk referanse.", mode: "freshness" },
  ] as const;
  for (const scenario of scenarios) {
    const targetFixtures = scenario.mode === "empty" ? fixtures.fixtures : [fixtures.fixtures.find(f => f.key === "issuer-mapping")].filter((fixture): fixture is NonNullable<typeof fixture> => fixture !== undefined);
    for (const fixture of targetFixtures) {
    const binding = composeMod.getEventIntelligenceQueueV2CompositionMemberBinding(composed.composition, fixture.candidate, undefined, decision);
    if (!binding) return UNAVAILABLE;
    // The review session uses a separate authentic, reviewable routing evaluation for this same exact fixture.
    const reviewMaterial = { ...fixture.routingMaterial, primaryAvailable: true, qualificationComplete: true, rightsApproved: true };
    const firstRoute = scenario.mode === "empty" ? null : routingMod.evaluateSourcePortfolioRouting(decision, reviewMaterial);
    const reviewRoute = scenario.mode === "empty" ? binding.routing : firstRoute && routingMod.evaluateSourcePortfolioRouting(decision, reviewMaterial, firstRoute);
    if (!reviewRoute || !routingMod.isAuthenticRoutingEvaluation(reviewRoute) || reviewRoute.candidateId !== fixture.candidate.candidateId || reviewRoute.evaluationAsOf !== CUTOFF) return UNAVAILABLE;
    const created = sessionMod.createOfflineReviewSession(fixture.candidate, reviewRoute, CONFIG);
    if (created.status !== "CREATED") return UNAVAILABLE;
    const session = created.session;
    const context = milestoneMod.getOfflineReviewMilestoneRoutingContext(fixture.candidate, reviewRoute);
    if (!context) return UNAVAILABLE;
    const makeEvidence = (suffix: string, outcome: "COMPLETED_PROCEED" | "COMPLETED_STOP" | "EVIDENCE_INSUFFICIENT") => ({ contractVersion: "event-intelligence-review-milestone-evidence/v1", evidenceId: `readiness-${scenario.key}-${suffix}`, subject: { kind: "DISCOVERY_CANDIDATE", contractVersion: "event-intelligence-news-discovery/v1", candidateId: fixture.candidate.candidateId, revisionFingerprint: fixture.candidate.fingerprint }, milestone: CONFIG.milestone, policy: POLICY, routingContext: context, issuer: CONFIG.issuer, reviewer: CONFIG.reviewer, evidenceAvailableAt: T.available, reviewedAt: T.reviewed, issuedAt: T.issued, evaluationCutoff: CUTOFF, outcome, reasonCodes: [outcome === "COMPLETED_PROCEED" ? "REVIEW_COMPLETED" : outcome === "COMPLETED_STOP" ? "REVIEW_STOP_REQUIRED" : "MATERIAL_INSUFFICIENT"], correctsEvidenceId: null });
    let stale = "Ikke demonstrert";
    if (scenario.mode !== "empty" && scenario.mode !== "freshness") {
      if (scenario.mode === "held") {
        if (sessionMod.issueOfflineReviewSessionEvidence(session, makeEvidence("root-a", "COMPLETED_PROCEED")).status !== "ISSUED" || sessionMod.issueOfflineReviewSessionEvidence(session, makeEvidence("root-b", "COMPLETED_STOP")).status !== "ISSUED") return UNAVAILABLE;
      } else {
        const outcome = scenario.mode === "stop" ? "COMPLETED_STOP" : scenario.mode === "revoked" ? "COMPLETED_PROCEED" : "COMPLETED_PROCEED";
        const issued = sessionMod.issueOfflineReviewSessionEvidence(session, makeEvidence("root", outcome));
        if (issued.status !== "ISSUED") return UNAVAILABLE;
        if (scenario.mode === "revoked" && sessionMod.revokeOfflineReviewSessionEvidence(session, issued.reference, "2026-10-02T00:00:00.000Z").status !== "REVOKED") return UNAVAILABLE;
      }
    }
    const first = sessionMod.evaluateOfflineReviewSessionWithReference(session, CUTOFF);
    if (first.status !== "EVALUATED") return UNAVAILABLE;
    if (scenario.mode === "freshness") {
      const issued = sessionMod.issueOfflineReviewSessionEvidence(session, makeEvidence("later-root", "COMPLETED_PROCEED"));
      if (issued.status !== "ISSUED") return UNAVAILABLE;
      const old = sessionMod.validateFreshOfflineReviewSessionEvaluationReference(first.reference, { session, candidate: fixture.candidate, routing: reviewRoute, decision, milestone: CONFIG.milestone, policy: POLICY, cutoff: CUTOFF });
      stale = old.status === "REJECTED" ? old.code : "UNEXPECTEDLY_FRESH";
    }
    const current = scenario.mode === "freshness" ? sessionMod.evaluateOfflineReviewSessionWithReference(session, CUTOFF) : first;
    if (current.status !== "EVALUATED") return UNAVAILABLE;
    const freshCheck = sessionMod.validateFreshOfflineReviewSessionEvaluationReference(current.reference, { session, candidate: fixture.candidate, routing: reviewRoute, decision, milestone: CONFIG.milestone, policy: POLICY, cutoff: CUTOFF });
    if (freshCheck.status !== "FRESH") return UNAVAILABLE;
    const assessment = (await import("@/application/intelligence/offline-review-readiness")).assessOfflineReviewReadiness({ reference: current.reference, session, candidate: fixture.candidate, routing: reviewRoute, decision, milestone: CONFIG.milestone, policy: POLICY, cutoff: CUTOFF, composition: composed.composition });
    if (assessment.status !== "ASSESSED") return UNAVAILABLE;
    const status = current.evaluation.status;
    output.push(Object.freeze({ key: `${scenario.key}-${fixture.key}`, title: fixture.candidate.record.headline, scenario: scenario.scenario, description: scenario.description, localReview: assessment.assessment.localReview, queueStatus: binding.member.status, priority: binding.member.priority, blockers: Object.freeze([...binding.member.blockerCodes]), cutoff: CUTOFF, stale, fresh: `${freshCheck.status} / ${status}`, historical: true as const }));
    }
  }
  return Object.freeze({ status: "AVAILABLE" as const, items: Object.freeze(output) });
}
