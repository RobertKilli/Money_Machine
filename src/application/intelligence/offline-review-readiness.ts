import "server-only";
import { types } from "node:util";
import { getEventIntelligenceQueueV2CompositionMemberBinding } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue-v2";
import { validateFreshOfflineReviewSessionEvaluationReference } from "@/application/intelligence/offline-review-milestone-session";
import type { NewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import { isAuthenticRoutingEvaluation, isRoutingEvaluationForDecision, type RoutingEvaluation, type SourcePortfolioDecision } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { getOfflineReviewMilestoneRoutingContext } from "@/application/intelligence/offline-review-milestone-evidence";

export const OFFLINE_REVIEW_READINESS_VERSION = "event-intelligence-offline-review-readiness/v1" as const;
export type OfflineReviewReadiness = Readonly<{
  version: typeof OFFLINE_REVIEW_READINESS_VERSION;
  status: "ASSESSED";
  localReview: "NO_REVIEW_EVIDENCE" | "COMPLETED_PROCEED" | "COMPLETED_STOP" | "HELD";
  /** Routing result A: exact context evaluated by the local review session. */
  reviewRoutingContext: Readonly<{ currentState: RoutingEvaluation["currentState"]; nextState: RoutingEvaluation["nextState"]; cutoff: string }>;
  /** Routing result B: exact terminal context behind this V2 queue member. */
  queueRoutingContext: Readonly<{ currentState: RoutingEvaluation["currentState"]; nextState: RoutingEvaluation["nextState"]; cutoff: string }>;
  routingRelation: "SAME_AUTHENTIC_RESULT" | "SEPARATE_AUTHENTIC_RESULTS";
  reviewApplicationToQueueContext: "NOT_ESTABLISHED";
  queueStatus: string;
  queuePriority: string;
  blockers: readonly string[];
  authorization: "NOT_ESTABLISHED";
  progression: "NOT_GRANTED";
  inventoryGuarantee: "EXACT_SESSION_OPERATIONS_ONLY";
  synthetic: true;
  authority: "NONE";
}>;
export type OfflineReviewReadinessResult = Readonly<{ status: "ASSESSED"; assessment: OfflineReviewReadiness }> | Readonly<{ status: "REJECTED"; code: "EVALUATION_REFERENCE_REJECTED" | "COMPOSITION_BINDING_MISMATCH" }>;
const TRUST = new WeakSet<object>();
const INPUT_KEYS = ["reference", "session", "candidate", "routing", "decision", "milestone", "policy", "cutoff", "composition"] as const;
const INTRINSICS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);

function readInput(value: unknown): Record<(typeof INPUT_KEYS)[number], unknown> | null {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  if (Reflect.ownKeys(Object.prototype).some(key => typeof key !== "string" || !INTRINSICS.has(key))) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== INPUT_KEYS.length || keys.some(key => typeof key !== "string" || !INPUT_KEYS.includes(key as (typeof INPUT_KEYS)[number]))) return null;
  const parsed = Object.create(null) as Record<(typeof INPUT_KEYS)[number], unknown>;
  for (const key of INPUT_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    parsed[key] = descriptor.value;
  }
  return parsed;
}

/** Composes only already-authenticated local review and V2 queue facts; it never grants progression. */
export function assessOfflineReviewReadiness(input: unknown): OfflineReviewReadinessResult {
  const parsed = readInput(input);
  if (!parsed) return Object.freeze({ status: "REJECTED", code: "EVALUATION_REFERENCE_REJECTED" });
  const evaluation = validateFreshOfflineReviewSessionEvaluationReference(parsed.reference, { session: parsed.session, candidate: parsed.candidate, routing: parsed.routing, decision: parsed.decision, milestone: parsed.milestone, policy: parsed.policy, cutoff: parsed.cutoff });
  if (evaluation.status !== "FRESH") return Object.freeze({ status: "REJECTED", code: "EVALUATION_REFERENCE_REJECTED" });
  const binding = getEventIntelligenceQueueV2CompositionMemberBinding(parsed.composition, parsed.candidate, undefined, parsed.decision);
  if (!binding || !isAuthenticRoutingEvaluation(parsed.routing) || !isRoutingEvaluationForDecision(parsed.decision as SourcePortfolioDecision, parsed.routing) || !getOfflineReviewMilestoneRoutingContext(parsed.candidate, parsed.routing) || (parsed.routing as RoutingEvaluation).candidateId !== (parsed.candidate as NewsDiscoveryCandidate).candidateId || (parsed.routing as RoutingEvaluation).evaluationAsOf !== parsed.cutoff || binding.member.evaluationAsOf !== parsed.cutoff || !(binding.candidate as NewsDiscoveryCandidate).candidateId) return Object.freeze({ status: "REJECTED", code: "COMPOSITION_BINDING_MISMATCH" });
  const localReview = evaluation.evaluation.status === "NO_REVIEW_EVIDENCE" ? "NO_REVIEW_EVIDENCE" : evaluation.evaluation.status === "COMPLETED_PROCEED" ? "COMPLETED_PROCEED" : evaluation.evaluation.status === "COMPLETED_STOP" ? "COMPLETED_STOP" : "HELD";
  const reviewRouting = parsed.routing as RoutingEvaluation;
  const queueRouting = binding.routing;
  const assessment = Object.freeze({
    version: OFFLINE_REVIEW_READINESS_VERSION,
    status: "ASSESSED" as const,
    localReview,
    reviewRoutingContext: Object.freeze({ currentState: reviewRouting.currentState, nextState: reviewRouting.nextState, cutoff: reviewRouting.evaluationAsOf }),
    queueRoutingContext: Object.freeze({ currentState: queueRouting.currentState, nextState: queueRouting.nextState, cutoff: queueRouting.evaluationAsOf }),
    routingRelation: reviewRouting === queueRouting ? "SAME_AUTHENTIC_RESULT" as const : "SEPARATE_AUTHENTIC_RESULTS" as const,
    reviewApplicationToQueueContext: "NOT_ESTABLISHED" as const,
    queueStatus: binding.member.status,
    queuePriority: binding.member.priority,
    blockers: Object.freeze([...binding.member.blockerCodes]),
    authorization: "NOT_ESTABLISHED" as const,
    progression: "NOT_GRANTED" as const,
    inventoryGuarantee: "EXACT_SESSION_OPERATIONS_ONLY" as const,
    synthetic: true as const,
    authority: "NONE" as const,
  });
  TRUST.add(assessment);
  return Object.freeze({ status: "ASSESSED" as const, assessment });
}

export function isAuthenticOfflineReviewReadiness(value: unknown): value is OfflineReviewReadiness { return !!value && typeof value === "object" && TRUST.has(value); }
