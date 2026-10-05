import "server-only";

import { types } from "node:util";
import {
  buildOfflineReviewMilestoneExpectation,
  isCanonicalReviewMilestoneEvidenceTime,
  issueOfflineReviewMilestoneEvidence,
  OFFLINE_REVIEW_MILESTONE_ISSUER_ID,
  OFFLINE_REVIEW_MILESTONE_POLICY,
  OFFLINE_REVIEW_MILESTONE_REVIEWER_ID,
  revokeOfflineReviewMilestoneEvidence,
  validateOfflineReviewMilestoneEvidence,
  type IssuedOfflineReviewMilestoneEvidence,
  type OfflineReviewMilestoneExpectation,
} from "@/application/intelligence/offline-review-milestone-evidence";
import {
  isAuthenticNewsDiscoveryCandidate,
  type NewsDiscoveryCandidate,
} from "@/domain/intelligence/event-intelligence-news-discovery";
import {
  getSourcePortfolioDecision,
  isAuthenticRoutingEvaluation,
  isRoutingEvaluationForDecision,
  type RoutingEvaluation,
  type SourcePortfolioDecision,
} from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import {
  parseReviewMilestoneEvidence,
  REVIEW_MILESTONES,
  type ReviewMilestone,
} from "@/domain/intelligence/event-intelligence-review-milestone-evidence";

export const OFFLINE_REVIEW_SESSION_VERSION = "event-intelligence-offline-review-session/v1" as const;
export const OFFLINE_REVIEW_SESSION_EVALUATION_VERSION = "event-intelligence-offline-review-session-evaluation/v1" as const;
export const OFFLINE_REVIEW_SESSION_LIMITS = Object.freeze({ attestations: 16, correctionDepth: 8, revocations: 8 });
export const OFFLINE_REVIEW_SESSION_INVENTORY_GUARANTEE = "EXACT_SESSION_OPERATIONS_ONLY" as const;

export type OfflineReviewSessionConfiguration = Readonly<{
  contractVersion: typeof OFFLINE_REVIEW_SESSION_VERSION;
  milestone: ReviewMilestone;
  policy: typeof OFFLINE_REVIEW_MILESTONE_POLICY;
  issuer: Readonly<{ kind: "SYNTHETIC_OFFLINE_ISSUER"; issuerId: typeof OFFLINE_REVIEW_MILESTONE_ISSUER_ID }>;
  reviewer: Readonly<{ kind: "SYNTHETIC_OFFLINE_REVIEWER"; reviewerId: typeof OFFLINE_REVIEW_MILESTONE_REVIEWER_ID }>;
}>;

export type OfflineReviewSessionHandle = Readonly<{ kind: "SYNTHETIC_OFFLINE_REVIEW_SESSION"; contractVersion: typeof OFFLINE_REVIEW_SESSION_VERSION }>;
export type OfflineReviewSessionEvidenceHandle = Readonly<{ kind: "SYNTHETIC_OFFLINE_REVIEW_SESSION_EVIDENCE"; contractVersion: typeof OFFLINE_REVIEW_SESSION_VERSION }>;

export type CreateOfflineReviewSessionResult =
  | Readonly<{ status: "CREATED"; session: OfflineReviewSessionHandle }>
  | Readonly<{ status: "REJECTED"; code: "ROUTING_CONTEXT_UNAUTHENTIC" | "SESSION_CONFIGURATION_INVALID" }>;
export type OfflineReviewSessionOperationResult =
  | Readonly<{ status: "ISSUED"; reference: OfflineReviewSessionEvidenceHandle }>
  | Readonly<{ status: "REVOKED"; simulatedRevokedAt: string }>
  | Readonly<{ status: "REJECTED"; code: "SESSION_UNAUTHENTIC" | "EVIDENCE_INVALID" | "EVIDENCE_BINDING_MISMATCH" | "EVIDENCE_ID_DUPLICATE" | "EVIDENCE_LIMIT_REACHED" | "CORRECTION_PARENT_INVALID" | "CORRECTION_DEPTH_LIMIT" | "REVOCATION_LIMIT_REACHED" | "EVIDENCE_ALREADY_REVOKED" | "REVOCATION_TIME_INVALID" }>;

export type OfflineReviewSessionEvaluation =
  | Readonly<{ contractVersion: typeof OFFLINE_REVIEW_SESSION_EVALUATION_VERSION; status: "NO_REVIEW_EVIDENCE"; cutoff: string; includedAttestations: 0; inventoryGuarantee: typeof OFFLINE_REVIEW_SESSION_INVENTORY_GUARANTEE; synthetic: true; authority: "NONE" }>
  | Readonly<{ contractVersion: typeof OFFLINE_REVIEW_SESSION_EVALUATION_VERSION; status: "COMPLETED_PROCEED"; outcome: "COMPLETED_PROCEED"; cutoff: string; includedAttestations: number; inventoryGuarantee: typeof OFFLINE_REVIEW_SESSION_INVENTORY_GUARANTEE; synthetic: true; authority: "NONE" }>
  | Readonly<{ contractVersion: typeof OFFLINE_REVIEW_SESSION_EVALUATION_VERSION; status: "COMPLETED_STOP"; outcome: "COMPLETED_STOP"; cutoff: string; includedAttestations: number; inventoryGuarantee: typeof OFFLINE_REVIEW_SESSION_INVENTORY_GUARANTEE; synthetic: true; authority: "NONE" }>
  | Readonly<{ contractVersion: typeof OFFLINE_REVIEW_SESSION_EVALUATION_VERSION; status: "HELD"; outcome: "EVIDENCE_INSUFFICIENT"; reason: "EVIDENCE_CONFLICT" | "EVIDENCE_REVOKED" | "CORRECTION_INVALID" | "MILESTONE_INSUFFICIENT" | "EVIDENCE_REJECTED"; cutoff: string; includedAttestations: number; inventoryGuarantee: typeof OFFLINE_REVIEW_SESSION_INVENTORY_GUARANTEE; synthetic: true; authority: "NONE" }>
  | Readonly<{ contractVersion: typeof OFFLINE_REVIEW_SESSION_EVALUATION_VERSION; status: "REJECTED"; code: "SESSION_UNAUTHENTIC" | "EVALUATION_CUTOFF_INVALID" | "EVALUATION_CUTOFF_MISMATCH"; synthetic: true; authority: "NONE" }>;

type SessionEntry = Readonly<{
  reference: IssuedOfflineReviewMilestoneEvidence;
  sessionReference: OfflineReviewSessionEvidenceHandle;
  evidenceId: string;
  issuedAt: string;
  correctsEvidenceId: string | null;
  correctionDepth: number;
}>;
type SessionState = {
  readonly candidate: NewsDiscoveryCandidate;
  readonly routing: RoutingEvaluation;
  readonly decision: SourcePortfolioDecision;
  readonly expectation: OfflineReviewMilestoneExpectation;
  readonly milestone: ReviewMilestone;
  readonly issuerId: typeof OFFLINE_REVIEW_MILESTONE_ISSUER_ID;
  readonly reviewerId: typeof OFFLINE_REVIEW_MILESTONE_REVIEWER_ID;
  readonly entries: SessionEntry[];
  readonly revocations: Map<OfflineReviewSessionEvidenceHandle, string>;
};

const SESSION_STATE = new WeakMap<object, SessionState>();
const EVIDENCE_STATE = new WeakMap<object, Readonly<{ session: OfflineReviewSessionHandle; reference: IssuedOfflineReviewMilestoneEvidence }>>();
const INVALID_CREATE = (code: Extract<CreateOfflineReviewSessionResult, { status: "REJECTED" }>['code']): CreateOfflineReviewSessionResult => Object.freeze({ status: "REJECTED", code });
const INVALID_OPERATION = (code: Extract<OfflineReviewSessionOperationResult, { status: "REJECTED" }>['code']): OfflineReviewSessionOperationResult => Object.freeze({ status: "REJECTED", code });

const INTRINSICS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  if (Reflect.ownKeys(Object.prototype).some(key => typeof key !== "string" || !INTRINSICS.has(key))) return null;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) return null;
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    result[key] = descriptor.value;
  }
  return result;
}
function parseConfiguration(value: unknown): OfflineReviewSessionConfiguration | null {
  const root = exactObject(value, ["contractVersion", "milestone", "policy", "issuer", "reviewer"]);
  const policy = root && exactObject(root.policy, ["policyId", "policyVersion", "algorithmVersion"]);
  const issuer = root && exactObject(root.issuer, ["kind", "issuerId"]);
  const reviewer = root && exactObject(root.reviewer, ["kind", "reviewerId"]);
  if (!root || !policy || !issuer || !reviewer || root.contractVersion !== OFFLINE_REVIEW_SESSION_VERSION || !REVIEW_MILESTONES.includes(root.milestone as ReviewMilestone)) return null;
  if (policy.policyId !== OFFLINE_REVIEW_MILESTONE_POLICY.policyId || policy.policyVersion !== OFFLINE_REVIEW_MILESTONE_POLICY.policyVersion || policy.algorithmVersion !== OFFLINE_REVIEW_MILESTONE_POLICY.algorithmVersion) return null;
  if (issuer.kind !== "SYNTHETIC_OFFLINE_ISSUER" || issuer.issuerId !== OFFLINE_REVIEW_MILESTONE_ISSUER_ID || reviewer.kind !== "SYNTHETIC_OFFLINE_REVIEWER" || reviewer.reviewerId !== OFFLINE_REVIEW_MILESTONE_REVIEWER_ID) return null;
  return Object.freeze({
    contractVersion: OFFLINE_REVIEW_SESSION_VERSION,
    milestone: root.milestone as ReviewMilestone,
    policy: OFFLINE_REVIEW_MILESTONE_POLICY,
    issuer: Object.freeze({ kind: "SYNTHETIC_OFFLINE_ISSUER", issuerId: OFFLINE_REVIEW_MILESTONE_ISSUER_ID }),
    reviewer: Object.freeze({ kind: "SYNTHETIC_OFFLINE_REVIEWER", reviewerId: OFFLINE_REVIEW_MILESTONE_REVIEWER_ID }),
  });
}
function sessionState(value: unknown): SessionState | null {
  if (!value || typeof value !== "object" || types.isProxy(value)) return null;
  return SESSION_STATE.get(value) ?? null;
}
function evidenceState(value: unknown): Readonly<{ session: OfflineReviewSessionHandle; reference: IssuedOfflineReviewMilestoneEvidence }> | null {
  if (!value || typeof value !== "object" || types.isProxy(value)) return null;
  return EVIDENCE_STATE.get(value) ?? null;
}
function correctionDepth(state: SessionState, parentId: string): number | null {
  const parent = state.entries.find(entry => entry.evidenceId === parentId);
  return parent ? parent.correctionDepth + 1 : null;
}
function held(cutoff: string, includedAttestations: number, reason: Extract<OfflineReviewSessionEvaluation, { status: "HELD" }>['reason']): OfflineReviewSessionEvaluation {
  return Object.freeze({ contractVersion: OFFLINE_REVIEW_SESSION_EVALUATION_VERSION, status: "HELD", outcome: "EVIDENCE_INSUFFICIENT", reason, cutoff, includedAttestations, inventoryGuarantee: OFFLINE_REVIEW_SESSION_INVENTORY_GUARANTEE, synthetic: true, authority: "NONE" });
}

/** Creates an unforgeable in-process session handle bound to one exact candidate/routing pair. */
export function createOfflineReviewSession(candidateInput: unknown, routingInput: unknown, configurationInput: unknown): CreateOfflineReviewSessionResult {
  const decision = getSourcePortfolioDecision();
  if (!isAuthenticNewsDiscoveryCandidate(candidateInput) || !isAuthenticRoutingEvaluation(routingInput) || !isRoutingEvaluationForDecision(decision, routingInput)) return INVALID_CREATE("ROUTING_CONTEXT_UNAUTHENTIC");
  const configuration = parseConfiguration(configurationInput);
  if (!configuration) return INVALID_CREATE("SESSION_CONFIGURATION_INVALID");
  const expectation = buildOfflineReviewMilestoneExpectation(candidateInput, routingInput, configuration.milestone, configuration.policy, (routingInput as RoutingEvaluation).evaluationAsOf);
  if (!expectation) return INVALID_CREATE("ROUTING_CONTEXT_UNAUTHENTIC");
  const session = Object.freeze({ kind: "SYNTHETIC_OFFLINE_REVIEW_SESSION" as const, contractVersion: OFFLINE_REVIEW_SESSION_VERSION });
  SESSION_STATE.set(session, { candidate: candidateInput, routing: routingInput, decision, expectation, milestone: configuration.milestone, issuerId: configuration.issuer.issuerId, reviewerId: configuration.reviewer.reviewerId, entries: [], revocations: new Map() });
  return Object.freeze({ status: "CREATED" as const, session });
}

export function isAuthenticOfflineReviewSession(value: unknown): value is OfflineReviewSessionHandle {
  return !!sessionState(value) && Object.isFrozen(value);
}

/** Issues and appends one immutable evidence reference, or leaves the session unchanged. */
export function issueOfflineReviewSessionEvidence(sessionInput: unknown, evidenceInput: unknown, correctionParentInput?: unknown): OfflineReviewSessionOperationResult {
  const state = sessionState(sessionInput);
  if (!state) return INVALID_OPERATION("SESSION_UNAUTHENTIC");
  if (state.entries.length >= OFFLINE_REVIEW_SESSION_LIMITS.attestations) return INVALID_OPERATION("EVIDENCE_LIMIT_REACHED");
  const parsed = parseReviewMilestoneEvidence(evidenceInput);
  if (parsed.status !== "VALID") return INVALID_OPERATION("EVIDENCE_INVALID");
  const evidence = parsed.evidence;
  if (evidence.milestone !== state.milestone || evidence.policy.policyId !== state.expectation.policy.policyId || evidence.policy.policyVersion !== state.expectation.policy.policyVersion || evidence.policy.algorithmVersion !== state.expectation.policy.algorithmVersion || evidence.issuer.issuerId !== state.issuerId || evidence.reviewer.reviewerId !== state.reviewerId || evidence.subject.candidateId !== state.candidate.candidateId || evidence.subject.revisionFingerprint !== state.candidate.fingerprint || evidence.evaluationCutoff !== state.routing.evaluationAsOf || evidence.routingContext.routingResultId !== state.routing.routingResultId) return INVALID_OPERATION("EVIDENCE_BINDING_MISMATCH");
  if (state.entries.some(entry => entry.evidenceId === evidence.evidenceId)) return INVALID_OPERATION("EVIDENCE_ID_DUPLICATE");

  let parent: SessionEntry | null = null;
  let depth = 0;
  if (evidence.correctsEvidenceId !== null) {
    const parentTrust = evidenceState(correctionParentInput);
    if (!parentTrust || parentTrust.session !== sessionInput || parentTrust.reference.evidence.evidenceId !== evidence.correctsEvidenceId) return INVALID_OPERATION("CORRECTION_PARENT_INVALID");
    parent = state.entries.find(entry => entry.sessionReference === correctionParentInput) ?? null;
    if (!parent) return INVALID_OPERATION("CORRECTION_PARENT_INVALID");
    const nextDepth = correctionDepth(state, evidence.correctsEvidenceId);
    if (nextDepth === null) return INVALID_OPERATION("CORRECTION_PARENT_INVALID");
    if (nextDepth > OFFLINE_REVIEW_SESSION_LIMITS.correctionDepth) return INVALID_OPERATION("CORRECTION_DEPTH_LIMIT");
    depth = nextDepth;
  } else if (correctionParentInput !== undefined) return INVALID_OPERATION("CORRECTION_PARENT_INVALID");

  const issued = issueOfflineReviewMilestoneEvidence(state.candidate, state.routing, evidenceInput, parent?.reference);
  if (issued.status !== "ISSUED") return INVALID_OPERATION("EVIDENCE_INVALID");
  const reference = Object.freeze({ kind: "SYNTHETIC_OFFLINE_REVIEW_SESSION_EVIDENCE" as const, contractVersion: OFFLINE_REVIEW_SESSION_VERSION });
  EVIDENCE_STATE.set(reference, Object.freeze({ session: sessionInput as OfflineReviewSessionHandle, reference: issued.reference }));
  state.entries.push(Object.freeze({ reference: issued.reference, sessionReference: reference, evidenceId: evidence.evidenceId, issuedAt: evidence.issuedAt, correctsEvidenceId: evidence.correctsEvidenceId, correctionDepth: depth }));
  return Object.freeze({ status: "ISSUED" as const, reference });
}

/** Appends a simulated revocation for a reference created by this exact session. */
export function revokeOfflineReviewSessionEvidence(sessionInput: unknown, evidenceInput: unknown, simulatedRevokedAt: string): OfflineReviewSessionOperationResult {
  const state = sessionState(sessionInput);
  if (!state) return INVALID_OPERATION("SESSION_UNAUTHENTIC");
  if (!isCanonicalReviewMilestoneEvidenceTime(simulatedRevokedAt)) return INVALID_OPERATION("REVOCATION_TIME_INVALID");
  const trust = evidenceState(evidenceInput);
  if (!trust || trust.session !== sessionInput) return INVALID_OPERATION("CORRECTION_PARENT_INVALID");
  const entry = state.entries.find(item => item.sessionReference === evidenceInput);
  if (!entry) return INVALID_OPERATION("CORRECTION_PARENT_INVALID");
  if (state.revocations.has(entry.sessionReference)) return INVALID_OPERATION("EVIDENCE_ALREADY_REVOKED");
  if (state.revocations.size >= OFFLINE_REVIEW_SESSION_LIMITS.revocations) return INVALID_OPERATION("REVOCATION_LIMIT_REACHED");
  const revoked = revokeOfflineReviewMilestoneEvidence(entry.reference, simulatedRevokedAt);
  if (!revoked) return INVALID_OPERATION("REVOCATION_TIME_INVALID");
  state.revocations.set(entry.sessionReference, simulatedRevokedAt);
  return Object.freeze({ status: "REVOKED" as const, simulatedRevokedAt });
}

/** Evaluates only this session's full as-of inventory through the existing parent verifier. */
export function evaluateOfflineReviewSession(sessionInput: unknown, evaluationCutoffInput: unknown): OfflineReviewSessionEvaluation {
  const state = sessionState(sessionInput);
  if (!state) return Object.freeze({ contractVersion: OFFLINE_REVIEW_SESSION_EVALUATION_VERSION, status: "REJECTED", code: "SESSION_UNAUTHENTIC", synthetic: true, authority: "NONE" });
  if (!isCanonicalReviewMilestoneEvidenceTime(evaluationCutoffInput)) return Object.freeze({ contractVersion: OFFLINE_REVIEW_SESSION_EVALUATION_VERSION, status: "REJECTED", code: "EVALUATION_CUTOFF_INVALID", synthetic: true, authority: "NONE" });
  const cutoff = evaluationCutoffInput;
  // The parent verifier binds the expectation cutoff to the exact routing result's evaluationAsOf.
  if (cutoff !== state.expectation.evaluationCutoff) return Object.freeze({ contractVersion: OFFLINE_REVIEW_SESSION_EVALUATION_VERSION, status: "REJECTED", code: "EVALUATION_CUTOFF_MISMATCH", synthetic: true, authority: "NONE" });
  const visible = state.entries.filter(entry => entry.issuedAt <= cutoff);
  if (visible.length === 0) return Object.freeze({ contractVersion: OFFLINE_REVIEW_SESSION_EVALUATION_VERSION, status: "NO_REVIEW_EVIDENCE", cutoff, includedAttestations: 0, inventoryGuarantee: OFFLINE_REVIEW_SESSION_INVENTORY_GUARANTEE, synthetic: true, authority: "NONE" });
  const result = validateOfflineReviewMilestoneEvidence(state.candidate, state.routing, state.expectation, visible.map(entry => entry.reference));
  if (result.status === "HELD") return held(cutoff, visible.length, "EVIDENCE_CONFLICT");
  if (result.status === "REJECTED") {
    const reason = result.code === "EVIDENCE_REVOKED" ? "EVIDENCE_REVOKED" : result.code === "CORRECTION_INVALID" ? "CORRECTION_INVALID" : "EVIDENCE_REJECTED";
    return held(cutoff, visible.length, reason);
  }
  if (result.outcome === "COMPLETED_PROCEED") return Object.freeze({ contractVersion: OFFLINE_REVIEW_SESSION_EVALUATION_VERSION, status: "COMPLETED_PROCEED", outcome: result.outcome, cutoff, includedAttestations: visible.length, inventoryGuarantee: OFFLINE_REVIEW_SESSION_INVENTORY_GUARANTEE, synthetic: true, authority: "NONE" });
  if (result.outcome === "COMPLETED_STOP") return Object.freeze({ contractVersion: OFFLINE_REVIEW_SESSION_EVALUATION_VERSION, status: "COMPLETED_STOP", outcome: result.outcome, cutoff, includedAttestations: visible.length, inventoryGuarantee: OFFLINE_REVIEW_SESSION_INVENTORY_GUARANTEE, synthetic: true, authority: "NONE" });
  return held(cutoff, visible.length, "MILESTONE_INSUFFICIENT");
}
