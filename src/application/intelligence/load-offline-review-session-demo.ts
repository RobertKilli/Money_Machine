import "server-only";
import { notFound } from "next/navigation";
import type { OfflineReviewDemoReplayEpisodeFixtures, OfflineReviewDemoFixture } from "@/application/intelligence/offline-review-demo-fixtures";

export const OFFLINE_REVIEW_SESSION_DEMO_PATH = "/intelligence/events/review/offline-demo/review-session" as const;
export const OFFLINE_REVIEW_SESSION_DEMO_CUTOFFS = Object.freeze({ earlier: "2026-10-02T00:00:00.000Z", later: "2026-10-03T12:00:00.000Z" });

export type OfflineReviewSessionDemoEvaluation = Readonly<{
  label: string;
  cutoff: string;
  status: "NO_REVIEW_EVIDENCE" | "COMPLETED_PROCEED" | "COMPLETED_STOP" | "HELD" | "REJECTED";
  statusLabel: string;
  outcome: string | null;
  reason: string | null;
  includedAttestations: number | null;
  inventoryGuarantee: string | null;
}>;
export type OfflineReviewSessionDemoScenario = Readonly<{
  key: "EMPTY" | "PROCEED" | "STOP" | "CONFLICT" | "CORRECTION" | "REVOCATION";
  title: string;
  description: string;
  evaluations: readonly OfflineReviewSessionDemoEvaluation[];
}>;
export type OfflineReviewSessionDemoResult = Readonly<{ status: "AVAILABLE"; scenarios: readonly OfflineReviewSessionDemoScenario[] }> | Readonly<{ status: "UNAVAILABLE" }>;

const POLICY = Object.freeze({ policyId: "synthetic-offline-review-milestone", policyVersion: "v1", algorithmVersion: "v1" });
const CONFIGURATION = Object.freeze({
  contractVersion: "event-intelligence-offline-review-session/v1",
  milestone: "SOURCE_RETRIEVAL",
  policy: POLICY,
  issuer: Object.freeze({ kind: "SYNTHETIC_OFFLINE_ISSUER", issuerId: "synthetic-review-issuer-v1" }),
  reviewer: Object.freeze({ kind: "SYNTHETIC_OFFLINE_REVIEWER", reviewerId: "synthetic-reviewer-v1" }),
});
const EVIDENCE_TIMES = Object.freeze({ available: "2026-10-01T10:00:00.000Z", reviewed: "2026-10-01T11:00:00.000Z", issued: "2026-10-01T12:00:00.000Z" });
const SYNTHETIC_REVOCATION_AT = "2026-10-02T12:00:00.000Z";
const UNAVAILABLE: OfflineReviewSessionDemoResult = Object.freeze({ status: "UNAVAILABLE" });

type EpisodeFixture = OfflineReviewDemoReplayEpisodeFixtures;
type SessionContext = Readonly<{ candidate: OfflineReviewDemoFixture["candidate"]; route: unknown; handle: unknown }>;

function toEvaluation(label: string, result: {
  status: string;
  cutoff?: string;
  outcome?: string;
  reason?: string;
  includedAttestations?: number;
  inventoryGuarantee?: string;
}): OfflineReviewSessionDemoEvaluation {
  const statusLabels: Record<string, string> = {
    NO_REVIEW_EVIDENCE: "Ingen review-evidens ved cutoff",
    COMPLETED_PROCEED: "COMPLETED_PROCEED — lokal milepæl fullført",
    COMPLETED_STOP: "COMPLETED_STOP — lokal milepæl fullført uten progresjon",
    HELD: "HELD / EVIDENCE_INSUFFICIENT",
    REJECTED: "Evalueringen ble avvist",
  };
  return Object.freeze({
    label,
    cutoff: result.cutoff ?? "",
    status: result.status as OfflineReviewSessionDemoEvaluation["status"],
    statusLabel: statusLabels[result.status] ?? "Ukjent lokalt resultat",
    outcome: typeof result.outcome === "string" ? result.outcome : null,
    reason: typeof result.reason === "string" ? result.reason : null,
    includedAttestations: Number.isSafeInteger(result.includedAttestations) ? result.includedAttestations! : null,
    inventoryGuarantee: typeof result.inventoryGuarantee === "string" ? result.inventoryGuarantee : null,
  });
}

/** Fixed in-memory demonstration. Every scenario gets isolated candidate, route, and session bindings. */
export async function loadOfflineReviewSessionDemo(): Promise<OfflineReviewSessionDemoResult> {
  if (process.env.NODE_ENV !== "development") notFound();

  const [fixturesModule, discoveryModule, routingModule, milestoneModule, sessionModule] = await Promise.all([
    import("@/application/intelligence/offline-review-demo-fixtures"),
    import("@/domain/intelligence/event-intelligence-news-discovery"),
    import("@/domain/intelligence/event-intelligence-source-portfolio-routing-decision"),
    import("@/application/intelligence/offline-review-milestone-evidence"),
    import("@/application/intelligence/offline-review-milestone-session"),
  ]);
  const episodes = fixturesModule.createOfflineReviewDemoReplayEpisodeFixtures();
  if (!episodes) return UNAVAILABLE;
  const fixtureAt = (episode: EpisodeFixture) => episode.fixtures.find(item => item.key === "issuer-mapping");
  const earlierEpisode = episodes.find(episode => episode.key === "EARLIER") as EpisodeFixture | undefined;
  const laterEpisode = episodes.find(episode => episode.key === "LATER") as EpisodeFixture | undefined;
  const earlierFixture = earlierEpisode && fixtureAt(earlierEpisode);
  const laterFixture = laterEpisode && fixtureAt(laterEpisode);
  if (!earlierEpisode || !laterEpisode || !earlierFixture || !laterFixture) return UNAVAILABLE;
  const decision = routingModule.getSourcePortfolioDecision();

  function makeContext(episode: EpisodeFixture, fixture: NonNullable<ReturnType<typeof fixtureAt>>): SessionContext | null {
    if (!discoveryModule.isAuthenticNewsDiscoveryCandidate(fixture.candidate)) return null;
    const material = { ...fixture.routingMaterial, primaryAvailable: true, qualificationComplete: true, rightsApproved: true };
    const first = routingModule.evaluateSourcePortfolioRouting(decision, material);
    if (!first || !routingModule.isAuthenticRoutingEvaluation(first)) return null;
    const route = routingModule.evaluateSourcePortfolioRouting(decision, material, first);
    if (!route || !routingModule.isAuthenticRoutingEvaluation(route) || route.evaluationAsOf !== episode.evaluatedAsOf || route.candidateId !== fixture.candidate.candidateId) return null;
    const created = sessionModule.createOfflineReviewSession(fixture.candidate, route, CONFIGURATION);
    if (created.status !== "CREATED") return null;
    return Object.freeze({ candidate: fixture.candidate, route, handle: created.session });
  }

  function raw(context: SessionContext, evidenceId: string, cutoff: string, outcome: "COMPLETED_PROCEED" | "COMPLETED_STOP" | "EVIDENCE_INSUFFICIENT", reasonCodes: readonly string[], times: Readonly<{ available: string; reviewed: string; issued: string }> = EVIDENCE_TIMES, correctsEvidenceId: string | null = null) {
    const parentContext = milestoneModule.getOfflineReviewMilestoneRoutingContext(context.candidate, context.route);
    if (!parentContext) return null;
    return {
      contractVersion: "event-intelligence-review-milestone-evidence/v1",
      evidenceId,
      subject: { kind: "DISCOVERY_CANDIDATE", contractVersion: discoveryModule.NEWS_DISCOVERY_VERSION, candidateId: (context.candidate as { candidateId: string }).candidateId, revisionFingerprint: (context.candidate as { fingerprint: string }).fingerprint },
      milestone: CONFIGURATION.milestone,
      policy: POLICY,
      routingContext: parentContext,
      issuer: CONFIGURATION.issuer,
      reviewer: CONFIGURATION.reviewer,
      evidenceAvailableAt: times.available,
      reviewedAt: times.reviewed,
      issuedAt: times.issued,
      evaluationCutoff: cutoff,
      outcome,
      reasonCodes: [...reasonCodes],
      correctsEvidenceId,
    };
  }
  function issue(context: SessionContext, evidence: ReturnType<typeof raw>, correctionParent?: unknown): unknown | null {
    if (!evidence) return null;
    const issued = sessionModule.issueOfflineReviewSessionEvidence(context.handle, evidence, correctionParent);
    return issued.status === "ISSUED" ? issued.reference : null;
  }
  function evaluate(context: SessionContext, cutoff: string) {
    return sessionModule.evaluateOfflineReviewSession(context.handle, cutoff);
  }
  function scenario(key: OfflineReviewSessionDemoScenario["key"], title: string, description: string, evaluations: readonly OfflineReviewSessionDemoEvaluation[]): OfflineReviewSessionDemoScenario {
    return Object.freeze({ key, title, description, evaluations: Object.freeze([...evaluations]) });
  }

  const empty = makeContext(laterEpisode, laterFixture);
  const proceed = makeContext(laterEpisode, laterFixture);
  const stop = makeContext(laterEpisode, laterFixture);
  const conflict = makeContext(laterEpisode, laterFixture);
  const correctionEarlier = makeContext(earlierEpisode, earlierFixture);
  const correctionLater = makeContext(laterEpisode, laterFixture);
  const revocationEarlier = makeContext(earlierEpisode, earlierFixture);
  const revocationLater = makeContext(laterEpisode, laterFixture);
  if (!empty || !proceed || !stop || !conflict || !correctionEarlier || !correctionLater || !revocationEarlier || !revocationLater) return UNAVAILABLE;

  const proceedRef = issue(proceed, raw(proceed, "session-proceed", laterEpisode.evaluatedAsOf, "COMPLETED_PROCEED", ["REVIEW_COMPLETED"]));
  const stopRef = issue(stop, raw(stop, "session-stop", laterEpisode.evaluatedAsOf, "COMPLETED_STOP", ["REVIEW_STOP_REQUIRED"]));
  const conflictProceed = issue(conflict, raw(conflict, "session-conflict-proceed", laterEpisode.evaluatedAsOf, "COMPLETED_PROCEED", ["REVIEW_COMPLETED"]));
  const conflictStop = issue(conflict, raw(conflict, "session-conflict-stop", laterEpisode.evaluatedAsOf, "COMPLETED_STOP", ["REVIEW_STOP_REQUIRED"]));
  const correctionRootEarlierTimes = Object.freeze({ available: "2026-10-01T18:00:00.000Z", reviewed: "2026-10-01T20:00:00.000Z", issued: earlierEpisode.evaluatedAsOf });
  const correctionRootEarlier = issue(correctionEarlier, raw(correctionEarlier, "session-correction-root", earlierEpisode.evaluatedAsOf, "EVIDENCE_INSUFFICIENT", ["MATERIAL_INSUFFICIENT"], correctionRootEarlierTimes));
  const correctionRootLaterTimes = Object.freeze({ ...correctionRootEarlierTimes, issued: earlierEpisode.evaluatedAsOf });
  const correctionRootLater = issue(correctionLater, raw(correctionLater, "session-correction-root", laterEpisode.evaluatedAsOf, "EVIDENCE_INSUFFICIENT", ["MATERIAL_INSUFFICIENT"], correctionRootLaterTimes));
  const correctionLaterRef = correctionRootLater && issue(correctionLater, raw(correctionLater, "session-correction-result", laterEpisode.evaluatedAsOf, "COMPLETED_PROCEED", ["REVIEW_COMPLETED"], Object.freeze({ available: "2026-10-02T08:00:00.000Z", reviewed: "2026-10-02T08:20:00.000Z", issued: "2026-10-02T08:30:00.000Z" }), "session-correction-root"), correctionRootLater);

  const revocationEarlyRef = issue(revocationEarlier, raw(revocationEarlier, "session-revocation-record", earlierEpisode.evaluatedAsOf, "COMPLETED_PROCEED", ["REVIEW_COMPLETED"], Object.freeze({ available: "2026-10-01T18:00:00.000Z", reviewed: "2026-10-01T20:00:00.000Z", issued: earlierEpisode.evaluatedAsOf })));
  const revocationLaterRef = issue(revocationLater, raw(revocationLater, "session-revocation-record", laterEpisode.evaluatedAsOf, "COMPLETED_PROCEED", ["REVIEW_COMPLETED"], Object.freeze({ available: "2026-10-01T18:00:00.000Z", reviewed: "2026-10-01T20:00:00.000Z", issued: earlierEpisode.evaluatedAsOf })));
  if (!proceedRef || !stopRef || !conflictProceed || !conflictStop || !correctionRootEarlier || !correctionRootLater || !correctionLaterRef || !revocationEarlyRef || !revocationLaterRef) return UNAVAILABLE;
  if (sessionModule.revokeOfflineReviewSessionEvidence(revocationEarlier.handle, revocationEarlyRef, SYNTHETIC_REVOCATION_AT).status !== "REVOKED") return UNAVAILABLE;
  if (sessionModule.revokeOfflineReviewSessionEvidence(revocationLater.handle, revocationLaterRef, SYNTHETIC_REVOCATION_AT).status !== "REVOKED") return UNAVAILABLE;

  const evaluations = [
    scenario("EMPTY", "Ingen review-evidens", "En tom session betyr at milepælen ikke er fullført.", [toEvaluation("Senere cutoff", evaluate(empty, laterEpisode.evaluatedAsOf))]),
    scenario("PROCEED", "Lokalt fullført med proceed", "COMPLETED_PROCEED fullfører bare denne syntetiske review-milepælen; routing, blockers og approvals endres ikke.", [toEvaluation("Senere cutoff", evaluate(proceed, laterEpisode.evaluatedAsOf))]),
    scenario("STOP", "Lokalt fullført med stop", "COMPLETED_STOP fullfører reviewen, men åpner ikke for progresjon.", [toEvaluation("Senere cutoff", evaluate(stop, laterEpisode.evaluatedAsOf))]),
    scenario("CONFLICT", "Konkurrerende røtter", "To uavhengige root-attestasjoner utstedt 2026-10-01T12:00:00.000Z og 2026-10-03T11:30:00.000Z står i samme session-inventar; ingen timestamp eller arrayrekkefølge velger vinner.", [toEvaluation("Senere cutoff", evaluate(conflict, laterEpisode.evaluatedAsOf))]),
    scenario("CORRECTION", "Append-only korreksjon", "Tidligere og senere cutoff vises fra separate, eksakt bundne sessions. Rooten ble utstedt 2026-10-02T00:00:00.000Z; den senere sessionen legger til en autentisk korreksjon utstedt 2026-10-02T08:30:00.000Z. Parent-kontrakten binder hver attestasjonskjede til sitt routing-cutoff.", [toEvaluation("Tidligere cutoff", evaluate(correctionEarlier, earlierEpisode.evaluatedAsOf)), toEvaluation("Senere cutoff", evaluate(correctionLater, laterEpisode.evaluatedAsOf))]),
    scenario("REVOCATION", "Simulert tilbakekalling over to cutoffs", `To isolerte, cutoff-bundne sessions bruker ekvivalent syntetisk evidens. Tilbakekallingstid ${SYNTHETIC_REVOCATION_AT} kommer etter tidligere cutoff og før senere cutoff. Tidspunktet er caller-levert demo-materiale, ikke betrodd revokasjon.`, [toEvaluation("Tidligere cutoff", evaluate(revocationEarlier, earlierEpisode.evaluatedAsOf)), toEvaluation("Senere cutoff", evaluate(revocationLater, laterEpisode.evaluatedAsOf))]),
  ];
  return Object.freeze({ status: "AVAILABLE" as const, scenarios: Object.freeze(evaluations) });
}
