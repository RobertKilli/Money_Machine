import { describe, expect, it } from "vitest";
import { createOfflineReviewDemoReplayEpisodeFixtures } from "@/application/intelligence/offline-review-demo-fixtures";
import {
  getOfflineReviewMilestoneRoutingContext,
  issueOfflineReviewMilestoneEvidence,
  OFFLINE_REVIEW_MILESTONE_ISSUER_ID,
  OFFLINE_REVIEW_MILESTONE_POLICY,
  OFFLINE_REVIEW_MILESTONE_REVIEWER_ID,
} from "@/application/intelligence/offline-review-milestone-evidence";
import {
  createOfflineReviewSession,
  evaluateOfflineReviewSession,
  isAuthenticOfflineReviewSession,
  issueOfflineReviewSessionEvidence,
  OFFLINE_REVIEW_SESSION_LIMITS,
  OFFLINE_REVIEW_SESSION_VERSION,
  revokeOfflineReviewSessionEvidence,
  type OfflineReviewSessionEvidenceHandle,
  type OfflineReviewSessionHandle,
} from "@/application/intelligence/offline-review-milestone-session";
import { evaluateSourcePortfolioRouting, getSourcePortfolioDecision } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import type { NewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import type { RoutingEvaluation } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { parseReviewMilestoneEvidence, type ReviewMilestoneEvidence } from "@/domain/intelligence/event-intelligence-review-milestone-evidence";

const CUTOFF = "2026-10-03T12:00:00.000Z";
const CONFIG = Object.freeze({
  contractVersion: OFFLINE_REVIEW_SESSION_VERSION,
  milestone: "SOURCE_RETRIEVAL",
  policy: OFFLINE_REVIEW_MILESTONE_POLICY,
  issuer: Object.freeze({ kind: "SYNTHETIC_OFFLINE_ISSUER", issuerId: OFFLINE_REVIEW_MILESTONE_ISSUER_ID }),
  reviewer: Object.freeze({ kind: "SYNTHETIC_OFFLINE_REVIEWER", reviewerId: OFFLINE_REVIEW_MILESTONE_REVIEWER_ID }),
});
let idSequence = 0;

function context(cutoff = CUTOFF) {
  const episodes = createOfflineReviewDemoReplayEpisodeFixtures()!;
  const episode = episodes.find(item => item.evaluatedAsOf === cutoff)!;
  const fixture = episode.fixtures.find(item => item.key === "issuer-mapping")!;
  const decision = getSourcePortfolioDecision();
  const material = { ...fixture.routingMaterial, primaryAvailable: true, qualificationComplete: true, rightsApproved: true };
  const first = evaluateSourcePortfolioRouting(decision, material)!;
  const route = evaluateSourcePortfolioRouting(decision, material, first)!;
  return { candidate: fixture.candidate, route, material, decision };
}
function create(c = context()) {
  const result = createOfflineReviewSession(c.candidate, c.route, CONFIG);
  expect(result.status).toBe("CREATED");
  if (result.status !== "CREATED") throw new Error(result.code);
  return { ...c, session: result.session };
}
function rawEvidence(candidate: NewsDiscoveryCandidate, route: RoutingEvaluation, options: Partial<Pick<ReviewMilestoneEvidence, "evidenceId" | "evidenceAvailableAt" | "reviewedAt" | "issuedAt" | "evaluationCutoff" | "outcome" | "reasonCodes" | "correctsEvidenceId">> = {}) {
  const routingContext = getOfflineReviewMilestoneRoutingContext(candidate, route)!;
  idSequence++;
  return {
    contractVersion: "event-intelligence-review-milestone-evidence/v1",
    evidenceId: options.evidenceId ?? `session-evidence-${idSequence}`,
    subject: { kind: "DISCOVERY_CANDIDATE", contractVersion: "event-intelligence-news-discovery/v1", candidateId: candidate.candidateId, revisionFingerprint: candidate.fingerprint },
    milestone: "SOURCE_RETRIEVAL",
    policy: OFFLINE_REVIEW_MILESTONE_POLICY,
    routingContext,
    issuer: { kind: "SYNTHETIC_OFFLINE_ISSUER", issuerId: OFFLINE_REVIEW_MILESTONE_ISSUER_ID },
    reviewer: { kind: "SYNTHETIC_OFFLINE_REVIEWER", reviewerId: OFFLINE_REVIEW_MILESTONE_REVIEWER_ID },
    evidenceAvailableAt: options.evidenceAvailableAt ?? "2026-10-03T09:00:00.000Z",
    reviewedAt: options.reviewedAt ?? "2026-10-03T10:00:00.000Z",
    issuedAt: options.issuedAt ?? "2026-10-03T11:00:00.000Z",
    evaluationCutoff: options.evaluationCutoff ?? route.evaluationAsOf,
    outcome: options.outcome ?? "COMPLETED_PROCEED",
    reasonCodes: options.reasonCodes ?? ["REVIEW_COMPLETED"],
    correctsEvidenceId: options.correctsEvidenceId ?? null,
  };
}
function issue(session: OfflineReviewSessionHandle, candidate: NewsDiscoveryCandidate, route: RoutingEvaluation, options: Parameters<typeof rawEvidence>[2] = {}, parent?: OfflineReviewSessionEvidenceHandle) {
  const result = issueOfflineReviewSessionEvidence(session, rawEvidence(candidate, route, options), parent);
  if (result.status !== "ISSUED") throw new Error("code" in result ? result.code : result.status);
  expect(result.status).toBe("ISSUED");
  return result.reference;
}

describe("bounded offline review session", () => {
  it("uses non-serializable session and evidence handles and keeps empty sessions isolated", () => {
    const a = create(); const b = create(context());
    expect(isAuthenticOfflineReviewSession(a.session)).toBe(true);
    expect(isAuthenticOfflineReviewSession(JSON.parse(JSON.stringify(a.session)))).toBe(false);
    expect(evaluateOfflineReviewSession(a.session, CUTOFF)).toMatchObject({ status: "NO_REVIEW_EVIDENCE", includedAttestations: 0, inventoryGuarantee: "EXACT_SESSION_OPERATIONS_ONLY" });
    const ref = issue(a.session, a.candidate, a.route, { evidenceId: "cross-session-parent" });
    expect(isAuthenticOfflineReviewSession(b.session)).toBe(true);
    expect(issueOfflineReviewSessionEvidence(b.session, rawEvidence(b.candidate, b.route, { evidenceId: "cross-session-child", correctsEvidenceId: "cross-session-parent" }), ref)).toMatchObject({ status: "REJECTED", code: "CORRECTION_PARENT_INVALID" });
    expect(issueOfflineReviewSessionEvidence(a.session, rawEvidence(a.candidate, a.route, { evidenceId: "copied-child", issuedAt: "2026-10-03T12:00:00.001Z" }), JSON.parse(JSON.stringify(ref)))).toMatchObject({ status: "REJECTED", code: "CORRECTION_PARENT_INVALID" });
    expect(evaluateOfflineReviewSession(b.session, CUTOFF)).toMatchObject({ status: "NO_REVIEW_EVIDENCE" });
  });

  it("accepts only the exact route object even when another authenticated route has the same result ID", () => {
    const base = context(); const left = create(base); const rightRoute = evaluateSourcePortfolioRouting(base.decision, base.material, evaluateSourcePortfolioRouting(base.decision, base.material)! )!;
    expect(rightRoute.routingResultId).toBe(base.route.routingResultId);
    const right = create({ ...base, route: rightRoute });
    const ref = issue(left.session, left.candidate, left.route, { evidenceId: "same-result-id-parent" });
    expect(issueOfflineReviewSessionEvidence(right.session, rawEvidence(right.candidate, right.route, { evidenceId: "same-result-id-child", correctsEvidenceId: "same-result-id-parent" }), ref)).toMatchObject({ status: "REJECTED", code: "CORRECTION_PARENT_INVALID" });
    expect(evaluateOfflineReviewSession(right.session, CUTOFF)).toMatchObject({ status: "NO_REVIEW_EVIDENCE" });
  });

  it.each([
    ["COMPLETED_PROCEED", ["REVIEW_COMPLETED"], "COMPLETED_PROCEED"],
    ["COMPLETED_STOP", ["REVIEW_STOP_REQUIRED"], "COMPLETED_STOP"],
    ["EVIDENCE_INSUFFICIENT", ["MATERIAL_INSUFFICIENT"], "HELD"],
  ] as const)("preserves the local meaning of %s", (outcome, reasonCodes, expected) => {
    const c = create();
    const raw = rawEvidence(c.candidate, c.route, { outcome, reasonCodes });
    expect(parseReviewMilestoneEvidence(raw).status).toBe("VALID");
    expect(issueOfflineReviewSessionEvidence(c.session, raw)).toMatchObject({ status: "ISSUED" });
    const result = evaluateOfflineReviewSession(c.session, CUTOFF);
    expect(result.status).toBe(expected);
    expect(result.authority).toBe("NONE");
  });

  it("keeps every competing root in its private inventory and holds independent of order", () => {
    const c = create();
    const rootA = issue(c.session, c.candidate, c.route, { evidenceId: "root-a", outcome: "COMPLETED_PROCEED", reasonCodes: ["REVIEW_COMPLETED"] });
    issue(c.session, c.candidate, c.route, { evidenceId: "root-b", outcome: "COMPLETED_STOP", reasonCodes: ["REVIEW_STOP_REQUIRED"], issuedAt: "2026-10-03T11:30:00.000Z" });
    expect(evaluateOfflineReviewSession(c.session, CUTOFF)).toMatchObject({ status: "HELD", outcome: "EVIDENCE_INSUFFICIENT", reason: "EVIDENCE_CONFLICT", includedAttestations: 2 });
    const untypedEvaluator = evaluateOfflineReviewSession as unknown as (session: unknown, cutoff: unknown, ignoredInventory?: unknown) => ReturnType<typeof evaluateOfflineReviewSession>;
    expect(untypedEvaluator(c.session, CUTOFF, [rootA])).toMatchObject({ status: "HELD", includedAttestations: 2 });
  });

  it("isolates caller evidence mutations after successful session issuance", () => {
    const c = create(); const input = rawEvidence(c.candidate, c.route);
    expect(issueOfflineReviewSessionEvidence(c.session, input).status).toBe("ISSUED");
    input.outcome = "COMPLETED_STOP";
    input.reasonCodes = ["REVIEW_STOP_REQUIRED"];
    expect(evaluateOfflineReviewSession(c.session, CUTOFF)).toMatchObject({ status: "COMPLETED_PROCEED", outcome: "COMPLETED_PROCEED" });
  });

  it("evaluates a legal linear correction from the session-owned ancestor chain", () => {
    const c = create();
    const root = issue(c.session, c.candidate, c.route, { evidenceId: "linear-root", outcome: "EVIDENCE_INSUFFICIENT", reasonCodes: ["MATERIAL_INSUFFICIENT"], issuedAt: "2026-10-03T10:30:00.000Z" });
    issue(c.session, c.candidate, c.route, { evidenceId: "linear-correction", correctsEvidenceId: "linear-root", issuedAt: "2026-10-03T11:30:00.000Z" }, root);
    expect(evaluateOfflineReviewSession(c.session, CUTOFF)).toMatchObject({ status: "COMPLETED_PROCEED", outcome: "COMPLETED_PROCEED", includedAttestations: 2 });
  });

  it("allows correction branches to be represented and turns them into hold", () => {
    const c = create();
    const root = issue(c.session, c.candidate, c.route, { evidenceId: "branch-root", outcome: "EVIDENCE_INSUFFICIENT", reasonCodes: ["MATERIAL_INSUFFICIENT"], issuedAt: "2026-10-03T10:00:00.000Z" });
    issue(c.session, c.candidate, c.route, { evidenceId: "branch-a", correctsEvidenceId: "branch-root", issuedAt: "2026-10-03T10:30:00.000Z" }, root);
    issue(c.session, c.candidate, c.route, { evidenceId: "branch-b", correctsEvidenceId: "branch-root", issuedAt: "2026-10-03T11:00:00.000Z", outcome: "COMPLETED_STOP", reasonCodes: ["REVIEW_STOP_REQUIRED"] }, root);
    expect(evaluateOfflineReviewSession(c.session, CUTOFF)).toMatchObject({ status: "HELD", reason: "EVIDENCE_CONFLICT", includedAttestations: 3 });
  });

  it("includes evidence at cutoff, excludes later-issued operations, and rejects other routing cutoffs", () => {
    const c = create();
    issue(c.session, c.candidate, c.route, { evidenceId: "at-cutoff", evidenceAvailableAt: CUTOFF, reviewedAt: CUTOFF, issuedAt: CUTOFF });
    expect(evaluateOfflineReviewSession(c.session, CUTOFF)).toMatchObject({ status: "COMPLETED_PROCEED", includedAttestations: 1 });
    expect(evaluateOfflineReviewSession(c.session, "2026-10-03T11:59:59.999Z")).toMatchObject({ status: "REJECTED", code: "EVALUATION_CUTOFF_MISMATCH" });
    expect(evaluateOfflineReviewSession(c.session, "2026-10-03T12:00:00.001Z")).toMatchObject({ status: "REJECTED", code: "EVALUATION_CUTOFF_MISMATCH" });
    const future = create();
    issue(future.session, future.candidate, future.route, { evidenceId: "future", issuedAt: "2026-10-03T12:00:00.001Z" });
    expect(evaluateOfflineReviewSession(future.session, CUTOFF)).toMatchObject({ status: "NO_REVIEW_EVIDENCE", includedAttestations: 0 });
  });

  it("keeps earlier evaluations immutable across later session operations", () => {
    const c = create();
    const root = issue(c.session, c.candidate, c.route, { evidenceId: "future-correction-root", outcome: "EVIDENCE_INSUFFICIENT", reasonCodes: ["MATERIAL_INSUFFICIENT"], issuedAt: "2026-10-03T11:00:00.000Z" });
    const first = evaluateOfflineReviewSession(c.session, CUTOFF);
    issue(c.session, c.candidate, c.route, { evidenceId: "future-correction", correctsEvidenceId: "future-correction-root", issuedAt: "2026-10-03T12:00:00.001Z" }, root);
    expect(first).toMatchObject({ status: "HELD", includedAttestations: 1 });
    expect(evaluateOfflineReviewSession(c.session, CUTOFF)).toMatchObject({ status: "HELD", includedAttestations: 1 });
  });

  it("applies revocation only at or before the bound cutoff and does not rewrite a returned result", () => {
    const late = create(); const lateRef = issue(late.session, late.candidate, late.route);
    const beforeRevoke = evaluateOfflineReviewSession(late.session, CUTOFF);
    expect(revokeOfflineReviewSessionEvidence(late.session, lateRef, "2026-10-03T12:00:00.001Z")).toMatchObject({ status: "REVOKED" });
    expect(beforeRevoke).toMatchObject({ status: "COMPLETED_PROCEED" });
    expect(evaluateOfflineReviewSession(late.session, CUTOFF)).toMatchObject({ status: "COMPLETED_PROCEED" });

    const at = create(); const atRef = issue(at.session, at.candidate, at.route);
    expect(revokeOfflineReviewSessionEvidence(at.session, atRef, CUTOFF)).toMatchObject({ status: "REVOKED" });
    expect(evaluateOfflineReviewSession(at.session, CUTOFF)).toMatchObject({ status: "HELD", reason: "EVIDENCE_REVOKED" });

    const before = create(); const beforeRef = issue(before.session, before.candidate, before.route);
    expect(revokeOfflineReviewSessionEvidence(before.session, beforeRef, "2026-10-03T11:59:59.999Z")).toMatchObject({ status: "REVOKED" });
    expect(evaluateOfflineReviewSession(before.session, CUTOFF)).toMatchObject({ status: "HELD", reason: "EVIDENCE_REVOKED" });
  });

  it("rejects configuration and operation bounds atomically", () => {
    const base = context();
    expect(createOfflineReviewSession(base.candidate, base.route, { ...CONFIG, extra: true })).toMatchObject({ status: "REJECTED", code: "SESSION_CONFIGURATION_INVALID" });
    const c = create(base);
    for (let index = 0; index < OFFLINE_REVIEW_SESSION_LIMITS.attestations; index++) {
      const issuedAt = new Date(Date.parse("2026-10-03T10:00:00.000Z") + index * 1000).toISOString();
      expect(issueOfflineReviewSessionEvidence(c.session, rawEvidence(c.candidate, c.route, { evidenceId: `bounded-${index}`, issuedAt }))).toMatchObject({ status: "ISSUED" });
    }
    expect(issueOfflineReviewSessionEvidence(c.session, rawEvidence(c.candidate, c.route, { evidenceId: "over-limit" }))).toMatchObject({ status: "REJECTED", code: "EVIDENCE_LIMIT_REACHED" });
    expect(evaluateOfflineReviewSession(c.session, CUTOFF)).toMatchObject({ status: "HELD", includedAttestations: OFFLINE_REVIEW_SESSION_LIMITS.attestations });

    const chain = create(); let parent: OfflineReviewSessionEvidenceHandle | undefined;
    for (let depth = 0; depth <= OFFLINE_REVIEW_SESSION_LIMITS.correctionDepth; depth++) {
      const evidenceId = `depth-${depth}`;
      const issuedAt = new Date(Date.parse("2026-10-03T09:00:00.000Z") + depth * 1000).toISOString();
      const result = issueOfflineReviewSessionEvidence(chain.session, rawEvidence(chain.candidate, chain.route, { evidenceId, evidenceAvailableAt: "2026-10-03T08:00:00.000Z", reviewedAt: "2026-10-03T08:30:00.000Z", issuedAt, outcome: depth === 0 ? "EVIDENCE_INSUFFICIENT" : "COMPLETED_PROCEED", reasonCodes: depth === 0 ? ["MATERIAL_INSUFFICIENT"] : ["REVIEW_COMPLETED"], correctsEvidenceId: depth === 0 ? null : `depth-${depth - 1}` }), parent);
      expect(result.status).toBe("ISSUED");
      if (result.status !== "ISSUED") throw new Error("code" in result ? result.code : result.status);
      parent = result.reference;
    }
    expect(evaluateOfflineReviewSession(chain.session, CUTOFF)).toMatchObject({ status: "COMPLETED_PROCEED", includedAttestations: OFFLINE_REVIEW_SESSION_LIMITS.correctionDepth + 1 });
    expect(issueOfflineReviewSessionEvidence(chain.session, rawEvidence(chain.candidate, chain.route, { evidenceId: "depth-overflow", evidenceAvailableAt: "2026-10-03T08:00:00.000Z", reviewedAt: "2026-10-03T08:30:00.000Z", issuedAt: "2026-10-03T09:00:09.000Z", correctsEvidenceId: `depth-${OFFLINE_REVIEW_SESSION_LIMITS.correctionDepth}` }), parent)).toMatchObject({ status: "REJECTED", code: "CORRECTION_DEPTH_LIMIT" });

    const revocationBound = create();
    const references = Array.from({ length: OFFLINE_REVIEW_SESSION_LIMITS.revocations + 1 }, (_, index) => issue(revocationBound.session, revocationBound.candidate, revocationBound.route, { evidenceId: `revocation-bound-${index}` }));
    for (const reference of references.slice(0, OFFLINE_REVIEW_SESSION_LIMITS.revocations)) expect(revokeOfflineReviewSessionEvidence(revocationBound.session, reference, "2026-10-03T11:59:59.000Z")).toMatchObject({ status: "REVOKED" });
    expect(revokeOfflineReviewSessionEvidence(revocationBound.session, references.at(-1), "2026-10-03T11:59:59.000Z")).toMatchObject({ status: "REJECTED", code: "REVOCATION_LIMIT_REACHED" });
    expect(evaluateOfflineReviewSession(revocationBound.session, CUTOFF)).toMatchObject({ status: "HELD", includedAttestations: OFFLINE_REVIEW_SESSION_LIMITS.revocations + 1 });
  });

  it("does not register a partially accepted or externally issued correction", () => {
    const c = create();
    const external = issueOfflineReviewMilestoneEvidence(c.candidate, c.route, rawEvidence(c.candidate, c.route, { evidenceId: "external-root", outcome: "EVIDENCE_INSUFFICIENT", reasonCodes: ["MATERIAL_INSUFFICIENT"] }));
    expect(external.status).toBe("ISSUED");
    if (external.status !== "ISSUED") return;
    const rejected = issueOfflineReviewSessionEvidence(c.session, rawEvidence(c.candidate, c.route, { evidenceId: "external-child", correctsEvidenceId: "external-root" }), external.reference as unknown as OfflineReviewSessionEvidenceHandle);
    expect(rejected).toMatchObject({ status: "REJECTED", code: "CORRECTION_PARENT_INVALID" });
    expect(evaluateOfflineReviewSession(c.session, CUTOFF)).toMatchObject({ status: "NO_REVIEW_EVIDENCE", includedAttestations: 0 });
  });
});
