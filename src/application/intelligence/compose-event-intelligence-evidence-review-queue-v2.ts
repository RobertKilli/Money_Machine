import "server-only";

import { types } from "node:util";
import {
  isAuthenticNewsDiscoveryCandidate,
  sealDiscoveryOriginSet,
  type NewsDiscoveryCandidate,
} from "@/domain/intelligence/event-intelligence-news-discovery";
import {
  evaluateSourcePortfolioRouting,
  getSourcePortfolioDecision,
  isAuthenticRoutingEvaluation,
  parseSyntheticRoutingMaterial,
  type RoutingEvaluation,
  type SyntheticRoutingMaterial,
} from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import {
  evaluateEvidenceReviewQueueV2,
  isAuthenticEvidenceReviewQueueV2,
  type EvidenceReviewQueueV2,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import type { SourcePortfolioDecision } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";

export const EVENT_INTELLIGENCE_QUEUE_V2_COMPOSITION_VERSION = "event-intelligence-evidence-review-queue-composition/v2" as const;
export const EVENT_INTELLIGENCE_QUEUE_V2_COMPOSITION_LIMITS = Object.freeze({ candidates: 64, routingEvaluationsPerCandidate: 9 });

export type EventIntelligenceQueueV2CompositionInput = Readonly<{
  evaluationAsOf: string;
  candidates: readonly Readonly<{ candidate: NewsDiscoveryCandidate; routingMaterial: SyntheticRoutingMaterial }>[];
}>;

export type EventIntelligenceQueueV2Composition = Readonly<{
  version: typeof EVENT_INTELLIGENCE_QUEUE_V2_COMPOSITION_VERSION;
  status: "NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION";
  evaluationAsOf: string;
  candidateCount: number;
  queue: EvidenceReviewQueueV2;
}>;

export type EventIntelligenceQueueV2CompositionResult =
  | Readonly<{ status: "COMPOSED"; composition: EventIntelligenceQueueV2Composition }>
  | Readonly<{ status: "BLOCKED"; code: "COMPOSITION_INPUT_INVALID" | "COMPOSITION_CANDIDATE_UNTRUSTED" | "COMPOSITION_CUTOFF_MISMATCH" | "COMPOSITION_DISCOVERY_SET_INVALID" | "COMPOSITION_ROUTING_REJECTED" | "COMPOSITION_QUEUE_REJECTED" }>;

const TRUST = new WeakSet<object>();
const COMPOSITION_BINDING = new WeakMap<object, Readonly<{ decision: SourcePortfolioDecision; members: readonly Readonly<{ candidate: NewsDiscoveryCandidate; routing: RoutingEvaluation }>[] }>>();
const BLOCKED = (code: Extract<EventIntelligenceQueueV2CompositionResult, { status: "BLOCKED" }> ["code"]): EventIntelligenceQueueV2CompositionResult => Object.freeze({ status: "BLOCKED", code });
const INTRINSICS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
const fail = (): never => { throw new Error("COMPOSITION_INPUT_INVALID"); };

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail();
  if (Reflect.ownKeys(Object.prototype).some(key => typeof key !== "string" || !INTRINSICS.has(key))) return fail();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) return fail();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return fail();
    result[key] = descriptor.value;
  }
  return result;
}

function exactArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail();
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 1 || length > EVENT_INTELLIGENCE_QUEUE_V2_COMPOSITION_LIMITS.candidates || Reflect.ownKeys(value).length !== length + 1) return fail();
  const result: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return fail();
    result.push(descriptor.value);
  }
  return result;
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function validUtc(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function expectedRouteFacts(candidate: NewsDiscoveryCandidate) {
  const record = candidate.record;
  const sourceFamily = record.sourceType === "NEWS_AGGREGATOR" ? "DISCOVERY_AGGREGATOR" : record.sourceType === "ISSUER_IR" || record.sourceType === "NEWSWIRE" ? "ISSUER_ATTRIBUTED_RELEASE" : "REGULATORY_OR_EXCHANGE_DISCLOSURE";
  const categoryHint = record.eventCategories.includes("COMPLETED_CRYPTO_PURCHASE") ? "COMPLETED_PURCHASE"
    : record.eventCategories.includes("BINDING_PURCHASE_AGREEMENT") ? "BINDING_AGREEMENT"
    : record.eventCategories.includes("BOARD_AUTHORIZATION") ? "BOARD_AUTHORIZATION"
    : record.eventCategories.includes("TREASURY_POLICY_CHANGE") ? "TREASURY_POLICY"
    : record.eventCategories.includes("CORPORATE_CRYPTO_PURCHASE_INTENT") ? "PURCHASE_INTENT"
    : record.eventCategories.includes("CANCELLATION_OR_TERMINATION") ? "CANCELLATION_TERMINATION"
    : record.eventCategories.includes("ASSET_OR_COMPANY_ACQUISITION") ? "UNKNOWN"
    : record.eventCategories.includes("CORRECTION_OR_RETRACTION") ? "CORRECTION_AMENDMENT"
    : "UNKNOWN";
  const eventHint = record.lifecycleHint.kind === "RETRACTION" ? "RETRACTION_WITHDRAWAL" : record.lifecycleHint.kind === "CORRECTION" ? "CORRECTION_AMENDMENT" : categoryHint;
  const jurisdiction = record.jurisdiction === "US" ? "US_SEC" : record.jurisdiction === "GB" ? "GB_LSE" : record.jurisdiction === "AU" ? "AU_ASX" : "UNKNOWN";
  const listingScopes = jurisdiction === "US_SEC" ? ["listing:us-sec"] : jurisdiction === "GB_LSE" ? ["listing:lse"] : jurisdiction === "AU_ASX" ? ["listing:asx"] : [];
  return { sourceFamily, eventHint, jurisdiction, listingScopes };
}

function assertCandidateRouteBinding(candidate: NewsDiscoveryCandidate, route: SyntheticRoutingMaterial, cutoff: string, lifecycleStatus: "ACTIVE" | "CORRECTED" | "RETRACTED", correction: Readonly<{ present: boolean; resolved: boolean; availableAt: string | null }>): void {
  const facts = expectedRouteFacts(candidate);
  const retracted = candidate.record.lifecycleHint.kind === "RETRACTION" || lifecycleStatus === "RETRACTED";
  if (candidate.evaluatedAt !== cutoff || route.candidateId !== candidate.candidateId || route.evaluationAsOf !== cutoff || route.publicationAt !== candidate.record.publishedAt || route.discoveredAt !== candidate.record.discoveredAt || route.receivedAt !== candidate.record.receivedAt || route.eventHint !== facts.eventHint || route.jurisdiction !== facts.jurisdiction || route.listingScopes.length !== facts.listingScopes.length || route.listingScopes.some((scope, index) => scope !== facts.listingScopes[index]) || route.seenFamilies.length !== 1 || route.seenFamilies[0] !== facts.sourceFamily) fail();
  if (route.correctionPresent !== correction.present || route.correctionResolved !== correction.resolved || route.correctionAvailableAt !== correction.availableAt || route.correctionFieldHints.length !== (correction.present ? 1 : 0) || (correction.present && route.correctionFieldHints[0] !== "OTHER") || route.retracted !== retracted) fail();
  // Conflict flags are explicit synthetic routing inputs for this non-authoritative
  // demo. Duplicate and origin claims still require the parent composition's
  // candidate-set derivation and are therefore not caller supplied here.
  if (route.duplicate || route.originBindings.length) fail();
}

/** Composes authentic synthetic discovery and routing inputs with the opt-in V2 queue evaluator. */
export function composeEventIntelligenceEvidenceReviewQueueV2(input: unknown): EventIntelligenceQueueV2CompositionResult {
  try {
    const root = exactObject(input, ["evaluationAsOf", "candidates"]);
    const cutoff = root.evaluationAsOf;
    if (!validUtc(cutoff)) return BLOCKED("COMPOSITION_INPUT_INVALID");
    const entries = exactArray(root.candidates).map(value => exactObject(value, ["candidate", "routingMaterial"]));
    const candidates = entries.map(entry => entry.candidate);
    if (candidates.some(candidate => !isAuthenticNewsDiscoveryCandidate(candidate))) return BLOCKED("COMPOSITION_CANDIDATE_UNTRUSTED");
    const authentic = candidates as NewsDiscoveryCandidate[];
    if (authentic.some(candidate => candidate.evaluatedAt !== cutoff)) return BLOCKED("COMPOSITION_CUTOFF_MISMATCH");
    const originSet = sealDiscoveryOriginSet({ contractVersion: "event-intelligence-discovery-origin-set/v1", members: authentic, declaredMemberCount: authentic.length, evaluatedAsOf: cutoff, recordedAt: cutoff });
    if (!originSet) return BLOCKED("COMPOSITION_DISCOVERY_SET_INVALID");

    const correctionById = new Map<string, { present: boolean; resolved: boolean; availableAt: string | null }>();
    const successorByParentId = new Map(originSet.members.flatMap(member => member.candidate.record.lifecycleHint.targetCandidateId === null ? [] : [[member.candidate.record.lifecycleHint.targetCandidateId, member] as const]));
    for (const member of originSet.members) {
      const hinted = member.candidate.record.lifecycleHint.kind === "CORRECTION" || (member.candidate.record.lifecycleHint.kind === "NONE" && member.candidate.record.eventCategories.includes("CORRECTION_OR_RETRACTION"));
      correctionById.set(member.candidate.candidateId, { present: hinted, resolved: member.candidate.record.lifecycleHint.kind === "CORRECTION", availableAt: hinted ? member.candidate.record.publishedAt : null });
    }
    for (const member of originSet.members) {
      if (member.lifecycleStatus !== "CORRECTED") continue;
      const successor = successorByParentId.get(member.candidate.candidateId);
      if (!successor) return BLOCKED("COMPOSITION_DISCOVERY_SET_INVALID");
      correctionById.set(member.candidate.candidateId, { present: true, resolved: true, availableAt: successor.candidate.record.publishedAt });
    }

    const routeByCandidate = new Map<string, SyntheticRoutingMaterial>();
    for (const entry of entries) {
      const candidate = entry.candidate as NewsDiscoveryCandidate;
      const parsed = parseSyntheticRoutingMaterial(entry.routingMaterial);
      if (parsed.status !== "VALID") return BLOCKED("COMPOSITION_INPUT_INVALID");
      const lifecycle = originSet.members.find(member => member.candidate.candidateId === candidate.candidateId);
      const correction = correctionById.get(candidate.candidateId);
      if (!lifecycle || !correction) return BLOCKED("COMPOSITION_DISCOVERY_SET_INVALID");
      assertCandidateRouteBinding(candidate, parsed.material, cutoff, lifecycle.lifecycleStatus, correction);
      if (routeByCandidate.has(candidate.candidateId)) return BLOCKED("COMPOSITION_INPUT_INVALID");
      routeByCandidate.set(candidate.candidateId, parsed.material);
    }

    const decision = getSourcePortfolioDecision();
    const results: RoutingEvaluation[] = [];
    for (const member of originSet.members) {
      const candidate = member.candidate;
      const material = routeByCandidate.get(candidate.candidateId);
      if (!material) return BLOCKED("COMPOSITION_INPUT_INVALID");
      let result = evaluateSourcePortfolioRouting(decision, material);
      if (!result || !isAuthenticRoutingEvaluation(result) || result.candidateId !== candidate.candidateId || result.currentState !== "DISCOVERED") return BLOCKED("COMPOSITION_ROUTING_REJECTED");
      let evaluations = 1;
      while (result.nextState !== "STOPPED_BLOCKED" && result.nextState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE") {
        if (evaluations >= EVENT_INTELLIGENCE_QUEUE_V2_COMPOSITION_LIMITS.routingEvaluationsPerCandidate) return BLOCKED("COMPOSITION_ROUTING_REJECTED");
        const next = evaluateSourcePortfolioRouting(decision, material, result);
        if (!next || !isAuthenticRoutingEvaluation(next) || next.candidateId !== result.candidateId || next.evaluationAsOf !== cutoff || next.currentState !== result.nextState) return BLOCKED("COMPOSITION_ROUTING_REJECTED");
        result = next;
        evaluations++;
      }
      results.push(result);
    }

    const queue = evaluateEvidenceReviewQueueV2(decision, results);
    if (!queue || !isAuthenticEvidenceReviewQueueV2(queue) || queue.evaluationAsOf !== cutoff || queue.memberCount !== authentic.length || new Set(queue.members.map(member => member.candidateId)).size !== authentic.length || queue.members.some(member => !authentic.some(candidate => candidate.candidateId === member.candidateId))) return BLOCKED("COMPOSITION_QUEUE_REJECTED");
    const composition = freezeDeep({ version: EVENT_INTELLIGENCE_QUEUE_V2_COMPOSITION_VERSION, status: "NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION" as const, evaluationAsOf: cutoff, candidateCount: authentic.length, queue });
    TRUST.add(composition);
    COMPOSITION_BINDING.set(composition, Object.freeze({ decision, members: Object.freeze(originSet.members.map(member => Object.freeze({ candidate: member.candidate, routing: results.find(result => result.candidateId === member.candidate.candidateId)! }))) }));
    return Object.freeze({ status: "COMPOSED" as const, composition });
  } catch {
    return BLOCKED("COMPOSITION_INPUT_INVALID");
  }
}

export function isAuthenticEventIntelligenceQueueV2Composition(value: unknown): value is EventIntelligenceQueueV2Composition {
  return !!value && typeof value === "object" && !types.isProxy(value) && TRUST.has(value) && isAuthenticEvidenceReviewQueueV2((value as EventIntelligenceQueueV2Composition).queue);
}

/** Server-only exact fixture binding for offline consumers; IDs alone never restore this binding. */
export function getEventIntelligenceQueueV2CompositionMemberBinding(compositionInput: unknown, candidateInput: unknown, routingInput?: unknown, decisionInput?: unknown): Readonly<{ candidate: NewsDiscoveryCandidate; routing: RoutingEvaluation; decision: SourcePortfolioDecision; member: EvidenceReviewQueueV2["members"][number] }> | null {
  if (!isAuthenticEventIntelligenceQueueV2Composition(compositionInput)) return null;
  const binding = COMPOSITION_BINDING.get(compositionInput);
  if (!binding || (decisionInput !== undefined && binding.decision !== decisionInput)) return null;
  const exact = binding.members.find(item => item.candidate === candidateInput && (routingInput === undefined || item.routing === routingInput));
  if (!exact) return null;
  const member = (compositionInput as EventIntelligenceQueueV2Composition).queue.members.find(item => item.candidateId === exact.candidate.candidateId && item.routingResultId === exact.routing.routingResultId);
  return member ? Object.freeze({ ...exact, decision: binding.decision, member }) : null;
}
