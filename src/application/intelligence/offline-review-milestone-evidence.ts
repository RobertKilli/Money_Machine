import "server-only";
import { types } from "node:util";
import { isAuthenticNewsDiscoveryCandidate, type NewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import {
  getSourcePortfolioDecision, isAuthenticRoutingEvaluation, isRoutingEvaluationForDecision,
  SOURCE_PORTFOLIO_DECISION_VERSION, type RoutingEvaluation, type SourcePortfolioDecision,
} from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import {
  parseReviewMilestoneEvidence,
  REVIEW_MILESTONES, type ReviewMilestoneEvidence, type ReviewMilestoneOutcome, type ReviewMilestoneRoutingContext,
} from "@/domain/intelligence/event-intelligence-review-milestone-evidence";
import { ROUTING_STATES } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";

export const OFFLINE_REVIEW_MILESTONE_POLICY = Object.freeze({ policyId: "synthetic-offline-review-milestone", policyVersion: "v1", algorithmVersion: "v1" });
export const OFFLINE_REVIEW_MILESTONE_ISSUER_ID = "synthetic-review-issuer-v1";
export const OFFLINE_REVIEW_MILESTONE_REVIEWER_ID = "synthetic-reviewer-v1";

export type IssuedOfflineReviewMilestoneEvidence = Readonly<{ kind: "SYNTHETIC_NON_AUTHORITATIVE_REVIEW_EVIDENCE"; evidence: ReviewMilestoneEvidence }>;
export type IssueOfflineReviewMilestoneEvidenceResult =
  | Readonly<{ status: "ISSUED"; reference: IssuedOfflineReviewMilestoneEvidence }>
  | Readonly<{ status: "REJECTED"; code: "ROUTING_CONTEXT_UNAUTHENTIC" | "ROUTING_CONTEXT_UNSUPPORTED" | "SUBJECT_BINDING_MISMATCH" | "EVIDENCE_INVALID" | "ISSUER_CONTEXT_UNSUPPORTED" | "CORRECTION_TARGET_INVALID" }>;
export type OfflineReviewMilestoneValidation =
  | Readonly<{ status: "VALIDATED"; outcome: ReviewMilestoneOutcome; milestoneCompleted: boolean; interpretation: "MILESTONE_PROCEEDED_LOCALLY" | "MILESTONE_STOPPED_LOCALLY" | "MILESTONE_HELD"; synthetic: true; authority: "NONE" }>
  | Readonly<{ status: "HELD"; code: "EVIDENCE_CONFLICT"; outcome: "EVIDENCE_INSUFFICIENT"; milestoneCompleted: false; interpretation: "MILESTONE_HELD"; synthetic: true; authority: "NONE" }>
  | Readonly<{ status: "REJECTED"; code: "INPUT_INVALID" | "ROUTING_CONTEXT_UNAUTHENTIC" | "ROUTING_CONTEXT_UNSUPPORTED" | "EXPECTATION_INVALID" | "EVIDENCE_UNAUTHENTIC" | "BINDING_MISMATCH" | "EVIDENCE_MISSING" | "FUTURE_EVIDENCE" | "CORRECTION_INVALID" | "EVIDENCE_REVOKED" }>;

const ISSUED_TRUST = new WeakSet<object>();
const ISSUED_BINDING = new WeakMap<object, Readonly<{ candidate: NewsDiscoveryCandidate; routing: RoutingEvaluation; decision: SourcePortfolioDecision }>>();
const REVOKED = new WeakSet<object>();
const INVALID_ISSUE = (code: Extract<IssueOfflineReviewMilestoneEvidenceResult, { status: "REJECTED" }>["code"]): IssueOfflineReviewMilestoneEvidenceResult => Object.freeze({ status: "REJECTED", code });
const INVALID_USE = (code: Extract<OfflineReviewMilestoneValidation, { status: "REJECTED" }>["code"]): OfflineReviewMilestoneValidation => Object.freeze({ status: "REJECTED", code });
const HOLD_CONFLICT: OfflineReviewMilestoneValidation = Object.freeze({ status: "HELD", code: "EVIDENCE_CONFLICT", outcome: "EVIDENCE_INSUFFICIENT", milestoneCompleted: false, interpretation: "MILESTONE_HELD", synthetic: true, authority: "NONE" });
const fail = (): never => { throw new Error("INPUT_INVALID"); };
const INTRINSICS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail();
  if (Reflect.ownKeys(Object.prototype).some(key => typeof key !== "string" || !INTRINSICS.has(key))) return fail();
  const own = Reflect.ownKeys(value); if (own.length !== keys.length || own.some(k => typeof k !== "string" || !keys.includes(k))) return fail();
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !("value" in d) || !d.enumerable) return fail(); out[key] = d.value; }
  return out;
}
function dense(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail();
  const n = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(n) || n > max || Reflect.ownKeys(value).length !== n + 1) return fail();
  const out: unknown[] = []; for (let i = 0; i < n; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !("value" in d) || !d.enumerable) return fail(); out.push(d.value); }
  return out;
}
function freezeDeep<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child); Object.freeze(value); } return value; }
function plain(value: unknown): string { return JSON.stringify(value); }
function validUtc(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function normalizeExpectedContext(value: unknown): ReviewMilestoneRoutingContext | null {
  try {
    const r = exact(value, ["decisionVersion", "decisionFingerprint", "routingResultId", "candidateId", "currentState", "nextState", "stageHistory", "evaluationAsOf", "publicationAt", "discoveredAt", "receivedAt"]);
    if (r.decisionVersion !== SOURCE_PORTFOLIO_DECISION_VERSION || typeof r.decisionFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(r.decisionFingerprint) || typeof r.routingResultId !== "string" || !/^[a-f0-9]{64}$/.test(r.routingResultId) || typeof r.candidateId !== "string" || !ROUTING_STATES.includes(r.currentState as typeof ROUTING_STATES[number]) || !ROUTING_STATES.includes(r.nextState as typeof ROUTING_STATES[number])) return null;
    const history = dense(r.stageHistory, 16);
    if (history.length < 2 || history.some(s => !ROUTING_STATES.includes(s as typeof ROUTING_STATES[number])) || history[0] !== "DISCOVERED" || history.at(-1) !== r.nextState) return null;
    for (const key of ["evaluationAsOf", "publicationAt", "discoveredAt", "receivedAt"]) if (!validUtc(r[key])) return null;
    if (!(String(r.publicationAt) <= String(r.discoveredAt) && String(r.discoveredAt) <= String(r.receivedAt) && String(r.receivedAt) <= String(r.evaluationAsOf))) return null;
    return freezeDeep({ decisionVersion: SOURCE_PORTFOLIO_DECISION_VERSION, decisionFingerprint: r.decisionFingerprint, routingResultId: r.routingResultId, candidateId: r.candidateId, currentState: r.currentState as typeof ROUTING_STATES[number], nextState: r.nextState as typeof ROUTING_STATES[number], stageHistory: history as (typeof ROUTING_STATES[number])[], evaluationAsOf: r.evaluationAsOf as string, publicationAt: r.publicationAt as string, discoveredAt: r.discoveredAt as string, receivedAt: r.receivedAt as string });
  } catch { return null; }
}

function candidateEventHint(candidate: NewsDiscoveryCandidate): string {
  const record = candidate.record;
  if (record.lifecycleHint.kind === "RETRACTION") return "RETRACTION_WITHDRAWAL";
  if (record.lifecycleHint.kind === "CORRECTION") return "CORRECTION_AMENDMENT";
  if (record.eventCategories.includes("COMPLETED_CRYPTO_PURCHASE")) return "COMPLETED_PURCHASE";
  if (record.eventCategories.includes("BINDING_PURCHASE_AGREEMENT")) return "BINDING_AGREEMENT";
  if (record.eventCategories.includes("BOARD_AUTHORIZATION")) return "BOARD_AUTHORIZATION";
  if (record.eventCategories.includes("TREASURY_POLICY_CHANGE")) return "TREASURY_POLICY";
  if (record.eventCategories.includes("CORPORATE_CRYPTO_PURCHASE_INTENT")) return "PURCHASE_INTENT";
  if (record.eventCategories.includes("CANCELLATION_OR_TERMINATION")) return "CANCELLATION_TERMINATION";
  if (record.eventCategories.includes("CORRECTION_OR_RETRACTION")) return "CORRECTION_AMENDMENT";
  return "UNKNOWN";
}
function assertCandidateRoutingBinding(candidate: NewsDiscoveryCandidate, route: RoutingEvaluation): boolean {
  const record = candidate.record;
  const jurisdiction = record.jurisdiction === "US" ? "US_SEC" : record.jurisdiction === "GB" ? "GB_LSE" : record.jurisdiction === "AU" ? "AU_ASX" : "UNKNOWN";
  const scopes = jurisdiction === "US_SEC" ? ["listing:us-sec"] : jurisdiction === "GB_LSE" ? ["listing:lse"] : jurisdiction === "AU_ASX" ? ["listing:asx"] : [];
  const sourceFamily = record.sourceType === "NEWS_AGGREGATOR" ? "DISCOVERY_AGGREGATOR" : record.sourceType === "ISSUER_IR" || record.sourceType === "NEWSWIRE" ? "ISSUER_ATTRIBUTED_RELEASE" : "REGULATORY_OR_EXCHANGE_DISCLOSURE";
  return candidate.evaluatedAt === route.evaluationAsOf && candidate.candidateId === route.candidateId && record.publishedAt === route.publicationAt && record.discoveredAt === route.discoveredAt && record.receivedAt === route.receivedAt && jurisdiction === route.jurisdiction && candidateEventHint(candidate) === route.eventHint && route.listingScopes.length === scopes.length && route.listingScopes.every((scope, i) => scope === scopes[i]) && route.seenFamilies.length === 1 && route.seenFamilies[0] === sourceFamily;
}
function reviewableRoute(route: RoutingEvaluation): boolean { return route.currentState !== "STOPPED_BLOCKED" && route.currentState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE" && route.nextState !== "STOPPED_BLOCKED" && route.nextState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE"; }

export function getOfflineReviewMilestoneRoutingContext(candidate: unknown, routingResult: unknown): ReviewMilestoneRoutingContext | null {
  try {
    const decision = getSourcePortfolioDecision();
    if (!isAuthenticNewsDiscoveryCandidate(candidate) || !isAuthenticRoutingEvaluation(routingResult) || !isRoutingEvaluationForDecision(decision, routingResult) || !assertCandidateRoutingBinding(candidate, routingResult)) return null;
    const route = routingResult as RoutingEvaluation;
    return freezeDeep({ decisionVersion: SOURCE_PORTFOLIO_DECISION_VERSION, decisionFingerprint: decision.fingerprint, routingResultId: route.routingResultId, candidateId: route.candidateId, currentState: route.currentState, nextState: route.nextState, stageHistory: [...route.stageHistory], evaluationAsOf: route.evaluationAsOf, publicationAt: route.publicationAt, discoveredAt: route.discoveredAt, receivedAt: route.receivedAt });
  } catch { return null; }
}

function sameCorrectionBinding(left: ReviewMilestoneEvidence, right: ReviewMilestoneEvidence): boolean {
  return left.subject.candidateId === right.subject.candidateId && left.subject.revisionFingerprint === right.subject.revisionFingerprint && left.milestone === right.milestone && plain(left.policy) === plain(right.policy) && plain(left.routingContext) === plain(right.routingContext) && left.evaluationCutoff === right.evaluationCutoff && left.issuer.issuerId === right.issuer.issuerId && left.reviewer.reviewerId === right.reviewer.reviewerId;
}

/** Issues only an in-process reference under fixed synthetic assumptions; this is not authorization. */
export function issueOfflineReviewMilestoneEvidence(candidateInput: unknown, routingInput: unknown, evidenceInput: unknown, correctsInput?: unknown): IssueOfflineReviewMilestoneEvidenceResult {
  try {
    const decision = getSourcePortfolioDecision();
    if (!isAuthenticNewsDiscoveryCandidate(candidateInput) || !isAuthenticRoutingEvaluation(routingInput) || !isRoutingEvaluationForDecision(decision, routingInput)) return INVALID_ISSUE("ROUTING_CONTEXT_UNAUTHENTIC");
    const candidate = candidateInput as NewsDiscoveryCandidate; const routing = routingInput as RoutingEvaluation;
    const context = getOfflineReviewMilestoneRoutingContext(candidate, routing);
    if (!context) return INVALID_ISSUE("SUBJECT_BINDING_MISMATCH");
    if (!reviewableRoute(routing)) return INVALID_ISSUE("ROUTING_CONTEXT_UNSUPPORTED");
    const parsed = parseReviewMilestoneEvidence(evidenceInput);
    if (parsed.status !== "VALID") return INVALID_ISSUE("EVIDENCE_INVALID");
    const evidence = parsed.evidence;
    if (evidence.issuer.issuerId !== OFFLINE_REVIEW_MILESTONE_ISSUER_ID || evidence.reviewer.reviewerId !== OFFLINE_REVIEW_MILESTONE_REVIEWER_ID || evidence.policy.policyId !== OFFLINE_REVIEW_MILESTONE_POLICY.policyId || evidence.policy.policyVersion !== OFFLINE_REVIEW_MILESTONE_POLICY.policyVersion || evidence.policy.algorithmVersion !== OFFLINE_REVIEW_MILESTONE_POLICY.algorithmVersion) return INVALID_ISSUE("ISSUER_CONTEXT_UNSUPPORTED");
    if (evidence.subject.candidateId !== candidate.candidateId || evidence.subject.revisionFingerprint !== candidate.fingerprint || plain(evidence.routingContext) !== plain(context) || evidence.evaluationCutoff !== routing.evaluationAsOf) return INVALID_ISSUE("SUBJECT_BINDING_MISMATCH");
    if (evidence.correctsEvidenceId !== null) {
      if (!isAuthenticIssuedOfflineReviewMilestoneEvidence(correctsInput)) return INVALID_ISSUE("CORRECTION_TARGET_INVALID");
      const prior = (correctsInput as IssuedOfflineReviewMilestoneEvidence).evidence;
      if (prior.evidenceId !== evidence.correctsEvidenceId || prior.issuedAt >= evidence.issuedAt || !sameCorrectionBinding(prior, evidence)) return INVALID_ISSUE("CORRECTION_TARGET_INVALID");
    } else if (correctsInput !== undefined) return INVALID_ISSUE("CORRECTION_TARGET_INVALID");
    const reference = freezeDeep({ kind: "SYNTHETIC_NON_AUTHORITATIVE_REVIEW_EVIDENCE" as const, evidence });
    ISSUED_TRUST.add(reference); ISSUED_BINDING.set(reference, Object.freeze({ candidate, routing, decision }));
    return Object.freeze({ status: "ISSUED" as const, reference });
  } catch { return INVALID_ISSUE("EVIDENCE_INVALID"); }
}

export function isAuthenticIssuedOfflineReviewMilestoneEvidence(value: unknown): value is IssuedOfflineReviewMilestoneEvidence {
  return !!value && typeof value === "object" && !types.isProxy(value) && ISSUED_TRUST.has(value) && Object.isFrozen(value);
}

/** Test/reference-only append-only revocation simulation. It has no production registry semantics. */
export function revokeOfflineReviewMilestoneEvidence(reference: unknown): Readonly<{ status: "REVOKED"; evidenceId: string }> | null {
  if (!isAuthenticIssuedOfflineReviewMilestoneEvidence(reference)) return null;
  REVOKED.add(reference);
  return Object.freeze({ status: "REVOKED", evidenceId: reference.evidence.evidenceId });
}

export type OfflineReviewMilestoneExpectation = Readonly<{
  subject: Readonly<{ candidateId: string; revisionFingerprint: string }>;
  milestone: ReviewMilestoneEvidence["milestone"];
  policy: ReviewMilestoneEvidence["policy"];
  routingContext: ReviewMilestoneRoutingContext;
  evaluationCutoff: string;
}>;
export function buildOfflineReviewMilestoneExpectation(candidate: unknown, routingResult: unknown, milestone: ReviewMilestoneEvidence["milestone"], policy: ReviewMilestoneEvidence["policy"], evaluationCutoff: string): OfflineReviewMilestoneExpectation | null {
  const routingContext = getOfflineReviewMilestoneRoutingContext(candidate, routingResult);
  if (!routingContext || !validUtc(evaluationCutoff)) return null;
  const subject = candidate as NewsDiscoveryCandidate;
  return freezeDeep({ subject: { candidateId: subject.candidateId, revisionFingerprint: subject.fingerprint }, milestone, policy: { ...policy }, routingContext, evaluationCutoff });
}

/** Resolves only synthetic milestone use against separately supplied expected context. */
export function validateOfflineReviewMilestoneEvidence(candidateInput: unknown, routingInput: unknown, expectedInput: unknown, evidenceInput: unknown): OfflineReviewMilestoneValidation {
  try {
    const decision = getSourcePortfolioDecision();
    if (!isAuthenticNewsDiscoveryCandidate(candidateInput) || !isAuthenticRoutingEvaluation(routingInput) || !isRoutingEvaluationForDecision(decision, routingInput) || !assertCandidateRoutingBinding(candidateInput as NewsDiscoveryCandidate, routingInput as RoutingEvaluation)) return INVALID_USE("ROUTING_CONTEXT_UNAUTHENTIC");
    if (!reviewableRoute(routingInput as RoutingEvaluation)) return INVALID_USE("ROUTING_CONTEXT_UNSUPPORTED");
    const expected = exact(expectedInput, ["subject", "milestone", "policy", "routingContext", "evaluationCutoff"]);
    const subject = exact(expected.subject, ["candidateId", "revisionFingerprint"]);
    const policy = exact(expected.policy, ["policyId", "policyVersion", "algorithmVersion"]);
    if (!validUtc(expected.evaluationCutoff) || !REVIEW_MILESTONES.includes(expected.milestone as ReviewMilestoneEvidence["milestone"]) || !validPolicy(policy)) return INVALID_USE("EXPECTATION_INVALID");
    const actualContext = getOfflineReviewMilestoneRoutingContext(candidateInput, routingInput);
    const expectedContext = normalizeExpectedContext(expected.routingContext);
    if (!actualContext || !expectedContext || plain(expectedContext) !== plain(actualContext) || subject.candidateId !== (candidateInput as NewsDiscoveryCandidate).candidateId || subject.revisionFingerprint !== (candidateInput as NewsDiscoveryCandidate).fingerprint || expected.evaluationCutoff !== actualContext.evaluationAsOf) return INVALID_USE("BINDING_MISMATCH");
    const records = dense(evidenceInput, 16);
    if (records.some(record => !isAuthenticIssuedOfflineReviewMilestoneEvidence(record))) return INVALID_USE("EVIDENCE_UNAUTHENTIC");
    if (!records.length) return INVALID_USE("EVIDENCE_MISSING");
    const refs = records as IssuedOfflineReviewMilestoneEvidence[];
    if (refs.some(ref => REVOKED.has(ref))) return INVALID_USE("EVIDENCE_REVOKED");
    const matching: IssuedOfflineReviewMilestoneEvidence[] = [];
    for (const ref of refs) {
      const binding = ISSUED_BINDING.get(ref);
      if (!binding || binding.candidate !== candidateInput || binding.routing !== routingInput || binding.decision !== decision) return INVALID_USE("EVIDENCE_UNAUTHENTIC");
      const e = ref.evidence;
      if (e.subject.candidateId !== subject.candidateId || e.subject.revisionFingerprint !== subject.revisionFingerprint || e.milestone !== expected.milestone || plain(e.policy) !== plain(policy) || plain(e.routingContext) !== plain(expectedContext) || e.evaluationCutoff !== expected.evaluationCutoff || e.issuer.issuerId !== OFFLINE_REVIEW_MILESTONE_ISSUER_ID || e.reviewer.reviewerId !== OFFLINE_REVIEW_MILESTONE_REVIEWER_ID) return INVALID_USE("BINDING_MISMATCH");
      if (e.evidenceAvailableAt > expected.evaluationCutoff || e.reviewedAt > expected.evaluationCutoff || e.issuedAt > expected.evaluationCutoff) return INVALID_USE("FUTURE_EVIDENCE");
      matching.push(ref);
    }
    const byId = new Map<string, IssuedOfflineReviewMilestoneEvidence>();
    for (const ref of matching) { if (byId.has(ref.evidence.evidenceId)) return HOLD_CONFLICT; byId.set(ref.evidence.evidenceId, ref); }
    const childByParent = new Map<string, string>();
    for (const ref of matching) {
      const parentId = ref.evidence.correctsEvidenceId;
      if (parentId === null) continue;
      const parent = byId.get(parentId);
      if (!parent || parent.evidence.issuedAt >= ref.evidence.issuedAt || !sameCorrectionBinding(parent.evidence, ref.evidence)) return INVALID_USE("CORRECTION_INVALID");
      if (childByParent.has(parentId)) return HOLD_CONFLICT;
      childByParent.set(parentId, ref.evidence.evidenceId);
    }
    const tips = matching.filter(ref => !childByParent.has(ref.evidence.evidenceId));
    if (tips.length !== 1) return HOLD_CONFLICT;
    const chosen = tips[0]!.evidence;
    if (chosen.correctsEvidenceId === null && matching.length !== 1) return HOLD_CONFLICT;
    const completed = chosen.outcome !== "EVIDENCE_INSUFFICIENT";
    return Object.freeze({ status: "VALIDATED" as const, outcome: chosen.outcome, milestoneCompleted: completed, interpretation: chosen.outcome === "COMPLETED_PROCEED" ? "MILESTONE_PROCEEDED_LOCALLY" as const : chosen.outcome === "COMPLETED_STOP" ? "MILESTONE_STOPPED_LOCALLY" as const : "MILESTONE_HELD" as const, synthetic: true as const, authority: "NONE" as const });
  } catch { return INVALID_USE("INPUT_INVALID"); }
}

function validPolicy(policy: Record<string, unknown>): boolean {
  return typeof policy.policyId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/.test(policy.policyId) && typeof policy.policyVersion === "string" && /^v\d+$/.test(policy.policyVersion) && typeof policy.algorithmVersion === "string" && /^v\d+$/.test(policy.algorithmVersion) && Object.keys(policy).length === 3;
}
