import "server-only";
import { types } from "node:util";
import { NEWS_DISCOVERY_VERSION } from "./event-intelligence-news-discovery";
import { SOURCE_PORTFOLIO_DECISION_VERSION, ROUTING_STATES } from "./event-intelligence-source-portfolio-routing-decision";

export const REVIEW_MILESTONE_EVIDENCE_VERSION = "event-intelligence-review-milestone-evidence/v1" as const;
export const REVIEW_MILESTONES = Object.freeze(["SOURCE_RETRIEVAL", "ISSUER_MAPPING", "ASSET_MAPPING", "PRIMARY_DISCLOSURE", "CORRECTION_REVIEW", "CORROBORATION_REVIEW", "ELIGIBILITY_REVIEW"] as const);
export const REVIEW_MILESTONE_OUTCOMES = Object.freeze(["COMPLETED_PROCEED", "COMPLETED_STOP", "EVIDENCE_INSUFFICIENT"] as const);
export const REVIEW_MILESTONE_REASON_CODES = Object.freeze(["REVIEW_COMPLETED", "REVIEW_STOP_REQUIRED", "MATERIAL_INSUFFICIENT", "AUTHORITY_UNAVAILABLE"] as const);
export const REVIEW_MILESTONE_EVIDENCE_LIMITS = Object.freeze({ reasonCodes: 4, stageHistory: 16, idLength: 128, policyIdLength: 96 });

export type ReviewMilestone = typeof REVIEW_MILESTONES[number];
export type ReviewMilestoneOutcome = typeof REVIEW_MILESTONE_OUTCOMES[number];
export type ReviewMilestoneRoutingContext = Readonly<{
  decisionVersion: typeof SOURCE_PORTFOLIO_DECISION_VERSION;
  decisionFingerprint: string;
  routingResultId: string;
  candidateId: string;
  currentState: typeof ROUTING_STATES[number];
  nextState: typeof ROUTING_STATES[number];
  stageHistory: readonly (typeof ROUTING_STATES[number])[];
  evaluationAsOf: string;
  publicationAt: string;
  discoveredAt: string;
  receivedAt: string;
}>;
export type ReviewMilestoneEvidence = Readonly<{
  contractVersion: typeof REVIEW_MILESTONE_EVIDENCE_VERSION;
  evidenceId: string;
  subject: Readonly<{ kind: "DISCOVERY_CANDIDATE"; contractVersion: typeof NEWS_DISCOVERY_VERSION; candidateId: string; revisionFingerprint: string }>;
  milestone: ReviewMilestone;
  policy: Readonly<{ policyId: string; policyVersion: string; algorithmVersion: string }>;
  routingContext: ReviewMilestoneRoutingContext;
  issuer: Readonly<{ kind: "SYNTHETIC_OFFLINE_ISSUER"; issuerId: string }>;
  reviewer: Readonly<{ kind: "SYNTHETIC_OFFLINE_REVIEWER"; reviewerId: string }>;
  evidenceAvailableAt: string;
  reviewedAt: string;
  issuedAt: string;
  evaluationCutoff: string;
  outcome: ReviewMilestoneOutcome;
  reasonCodes: readonly (typeof REVIEW_MILESTONE_REASON_CODES[number])[];
  correctsEvidenceId: string | null;
}>;
export type ReviewMilestoneEvidenceParseResult = Readonly<{ status: "VALID"; evidence: ReviewMilestoneEvidence }> | Readonly<{ status: "INVALID"; code: "SCHEMA_INVALID" | "VERSION_UNSUPPORTED" | "TIME_INVALID" | "OUTCOME_UNSUPPORTED" }>;

const INVALID = (code: Extract<ReviewMilestoneEvidenceParseResult, { status: "INVALID" }>["code"]): ReviewMilestoneEvidenceParseResult => Object.freeze({ status: "INVALID", code });
const INTRINSICS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
const fail = (): never => { throw new Error("SCHEMA_INVALID"); };

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail();
  if (Reflect.ownKeys(Object.prototype).some(key => typeof key !== "string" || !INTRINSICS.has(key))) return fail();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) return fail();
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !("value" in d) || !d.enumerable) return fail(); out[key] = d.value; }
  return out;
}
function dense(value: unknown, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail();
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < min || length > max || Reflect.ownKeys(value).length !== length + 1) return fail();
  const out: unknown[] = [];
  for (let i = 0; i < length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !("value" in d) || !d.enumerable) return fail(); out.push(d.value); }
  return out;
}
function id(value: unknown, max: number = REVIEW_MILESTONE_EVIDENCE_LIMITS.idLength): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)) return fail();
  return value;
}
function fingerprint(value: unknown): string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) return fail(); return value; }
function iso(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("TIME_INVALID");
  return value;
}
function freezeDeep<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child); Object.freeze(value); } return value; }

/** Strict syntax parser only. It never establishes issuer, reviewer, or domain trust. */
export function parseReviewMilestoneEvidence(input: unknown): ReviewMilestoneEvidenceParseResult {
  try {
    const v = exact(input, ["contractVersion", "evidenceId", "subject", "milestone", "policy", "routingContext", "issuer", "reviewer", "evidenceAvailableAt", "reviewedAt", "issuedAt", "evaluationCutoff", "outcome", "reasonCodes", "correctsEvidenceId"]);
    if (v.contractVersion !== REVIEW_MILESTONE_EVIDENCE_VERSION) return INVALID("VERSION_UNSUPPORTED");
    const subject = exact(v.subject, ["kind", "contractVersion", "candidateId", "revisionFingerprint"]);
    if (subject.kind !== "DISCOVERY_CANDIDATE" || subject.contractVersion !== NEWS_DISCOVERY_VERSION) return INVALID("SCHEMA_INVALID");
    const candidateId = id(subject.candidateId);
    if (!candidateId.startsWith("news-discovery-candidate:") || !/^[a-f0-9]{64}$/.test(candidateId.slice("news-discovery-candidate:".length))) return INVALID("SCHEMA_INVALID");
    const policy = exact(v.policy, ["policyId", "policyVersion", "algorithmVersion"]);
    const policyId = id(policy.policyId, REVIEW_MILESTONE_EVIDENCE_LIMITS.policyIdLength);
    const policyVersion = id(policy.policyVersion, 32);
    const algorithmVersion = id(policy.algorithmVersion, 64);
    if (!/^v\d+$/.test(policyVersion) || !/^v\d+$/.test(algorithmVersion)) return INVALID("SCHEMA_INVALID");
    const r = exact(v.routingContext, ["decisionVersion", "decisionFingerprint", "routingResultId", "candidateId", "currentState", "nextState", "stageHistory", "evaluationAsOf", "publicationAt", "discoveredAt", "receivedAt"]);
    if (r.decisionVersion !== SOURCE_PORTFOLIO_DECISION_VERSION || !ROUTING_STATES.includes(r.currentState as typeof ROUTING_STATES[number]) || !ROUTING_STATES.includes(r.nextState as typeof ROUTING_STATES[number])) return INVALID("SCHEMA_INVALID");
    const stageHistory = dense(r.stageHistory, 2, REVIEW_MILESTONE_EVIDENCE_LIMITS.stageHistory).map(state => { if (!ROUTING_STATES.includes(state as typeof ROUTING_STATES[number])) return fail(); return state as typeof ROUTING_STATES[number]; });
    const evaluationAsOf = iso(r.evaluationAsOf); const publicationAt = iso(r.publicationAt); const discoveredAt = iso(r.discoveredAt); const receivedAt = iso(r.receivedAt);
    if (!(publicationAt <= discoveredAt && discoveredAt <= receivedAt && receivedAt <= evaluationAsOf) || stageHistory[0] !== "DISCOVERED" || stageHistory.at(-2) !== r.currentState || stageHistory.at(-1) !== r.nextState) return INVALID("TIME_INVALID");
    const issuer = exact(v.issuer, ["kind", "issuerId"]); const reviewer = exact(v.reviewer, ["kind", "reviewerId"]);
    if (issuer.kind !== "SYNTHETIC_OFFLINE_ISSUER" || reviewer.kind !== "SYNTHETIC_OFFLINE_REVIEWER") return INVALID("SCHEMA_INVALID");
    const outcome = v.outcome;
    if (!REVIEW_MILESTONE_OUTCOMES.includes(outcome as ReviewMilestoneOutcome)) return INVALID("OUTCOME_UNSUPPORTED");
    const reasonCodes = dense(v.reasonCodes, 1, REVIEW_MILESTONE_EVIDENCE_LIMITS.reasonCodes).map(code => { if (!REVIEW_MILESTONE_REASON_CODES.includes(code as typeof REVIEW_MILESTONE_REASON_CODES[number])) return fail(); return code as typeof REVIEW_MILESTONE_REASON_CODES[number]; });
    if (new Set(reasonCodes).size !== reasonCodes.length) return INVALID("SCHEMA_INVALID");
    if (outcome === "COMPLETED_PROCEED" && !reasonCodes.includes("REVIEW_COMPLETED") || outcome === "COMPLETED_STOP" && !reasonCodes.includes("REVIEW_STOP_REQUIRED") || outcome === "EVIDENCE_INSUFFICIENT" && !reasonCodes.some(code => code === "MATERIAL_INSUFFICIENT" || code === "AUTHORITY_UNAVAILABLE")) return INVALID("SCHEMA_INVALID");
    const evidenceAvailableAt = iso(v.evidenceAvailableAt); const reviewedAt = iso(v.reviewedAt); const issuedAt = iso(v.issuedAt); const evaluationCutoff = iso(v.evaluationCutoff);
    if (!(evidenceAvailableAt <= reviewedAt && reviewedAt <= issuedAt) || evaluationCutoff !== evaluationAsOf) return INVALID("TIME_INVALID");
    const correctsEvidenceId = v.correctsEvidenceId === null ? null : id(v.correctsEvidenceId);
    const evidence: ReviewMilestoneEvidence = freezeDeep({
      contractVersion: REVIEW_MILESTONE_EVIDENCE_VERSION, evidenceId: id(v.evidenceId),
      subject: { kind: "DISCOVERY_CANDIDATE", contractVersion: NEWS_DISCOVERY_VERSION, candidateId, revisionFingerprint: fingerprint(subject.revisionFingerprint) },
      milestone: (() => { if (!REVIEW_MILESTONES.includes(v.milestone as ReviewMilestone)) return fail(); return v.milestone as ReviewMilestone; })(),
      policy: { policyId, policyVersion, algorithmVersion },
      routingContext: { decisionVersion: SOURCE_PORTFOLIO_DECISION_VERSION, decisionFingerprint: fingerprint(r.decisionFingerprint), routingResultId: fingerprint(r.routingResultId), candidateId: id(r.candidateId), currentState: r.currentState as typeof ROUTING_STATES[number], nextState: r.nextState as typeof ROUTING_STATES[number], stageHistory: Object.freeze(stageHistory), evaluationAsOf, publicationAt, discoveredAt, receivedAt },
      issuer: { kind: "SYNTHETIC_OFFLINE_ISSUER", issuerId: id(issuer.issuerId) }, reviewer: { kind: "SYNTHETIC_OFFLINE_REVIEWER", reviewerId: id(reviewer.reviewerId) },
      evidenceAvailableAt, reviewedAt, issuedAt, evaluationCutoff,
      outcome: outcome as ReviewMilestoneOutcome, reasonCodes: Object.freeze(reasonCodes), correctsEvidenceId,
    });
    if (evidence.routingContext.candidateId !== evidence.subject.candidateId) return INVALID("SCHEMA_INVALID");
    return Object.freeze({ status: "VALID", evidence });
  } catch (error) { return INVALID(error instanceof Error && error.message === "TIME_INVALID" ? "TIME_INVALID" : "SCHEMA_INVALID"); }
}
