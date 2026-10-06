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
  getEvidenceReviewQueueContract,
  sealEvidenceReviewQueueSet,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import {
  adaptEvidenceReviewQueueSetToViewModel,
  type EvidenceReviewQueueViewModel,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";

export const EVENT_INTELLIGENCE_QUEUE_COMPOSITION_VERSION = "event-intelligence-evidence-review-queue-composition/v1" as const;
export const EVENT_INTELLIGENCE_QUEUE_COMPOSITION_LIMITS = Object.freeze({ candidates: 64, routingEvaluationsPerCandidate: 9, queueItems: 64 });

export type EventIntelligenceQueueCompositionInput = Readonly<{
  evaluationAsOf: string;
  candidates: readonly Readonly<{ candidate: NewsDiscoveryCandidate; routingMaterial: SyntheticRoutingMaterial }>[];
}>;

export type EventIntelligenceQueueComposition = Readonly<{
  version: typeof EVENT_INTELLIGENCE_QUEUE_COMPOSITION_VERSION;
  status: "NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION";
  evaluationAsOf: string;
  summary: Readonly<{ candidates: number; queueItems: number; blocked: number; open: number; noAction: number; retracted: number; correctionReviews: number }>;
  viewModel: EvidenceReviewQueueViewModel;
}>;

export type EventIntelligenceQueueCompositionResult =
  | Readonly<{ status: "COMPOSED"; composition: EventIntelligenceQueueComposition }>
  | Readonly<{ status: "BLOCKED"; code: "COMPOSITION_INPUT_INVALID" | "COMPOSITION_CANDIDATE_UNTRUSTED" | "COMPOSITION_CUTOFF_MISMATCH" | "COMPOSITION_DISCOVERY_SET_INVALID" | "COMPOSITION_ROUTING_REJECTED" | "COMPOSITION_QUEUE_REJECTED" | "COMPOSITION_VIEW_MODEL_REJECTED" }>;

const BLOCKED = (code: Extract<EventIntelligenceQueueCompositionResult, { status: "BLOCKED" }> ["code"]): EventIntelligenceQueueCompositionResult => Object.freeze({ status: "BLOCKED", code });
const CANDIDATE_PUBLIC_KEYS = new WeakMap<object, ReadonlyMap<string, string>>();
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const fail = (): never => { throw new Error("COMPOSITION_INPUT_INVALID"); };
const OBJECT_INTRINSICS = new Set(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
type MaterialStats = { total: number; byMaterial: Map<string, number>; byRoot: Map<string, number>; byPair: Map<string, number> };

/** Resolve a private candidate identity to its projected key only for a model produced by this composer. */
export function getComposedCandidatePublicKey(model: EvidenceReviewQueueViewModel, candidateId: string): string | null {
  if (!model || typeof candidateId !== "string") return null;
  return CANDIDATE_PUBLIC_KEYS.get(model)?.get(candidateId) ?? null;
}

function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail();
  if (Reflect.ownKeys(Object.prototype).some(key => typeof key !== "string" || !OBJECT_INTRINSICS.has(key))) return fail();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== "string" || !keys.includes(key))) return fail();
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return fail();
    out[key] = descriptor.value;
  }
  return out;
}

function exactArray(value: unknown): unknown[] {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return fail();
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 1 || length > EVENT_INTELLIGENCE_QUEUE_COMPOSITION_LIMITS.candidates || Reflect.ownKeys(value).length !== length + 1) return fail();
  const output: unknown[] = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return fail();
    output.push(descriptor.value);
  }
  return output;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function validUtc(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function assertCandidateBinding(candidate: NewsDiscoveryCandidate, route: SyntheticRoutingMaterial, cutoff: string, lifecycleStatus: "ACTIVE" | "CORRECTED" | "RETRACTED", correction: Readonly<{ present: boolean; resolved: boolean; availableAt: string | null }>): void {
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
  const expectedJurisdiction = record.jurisdiction === "US" ? "US_SEC" : record.jurisdiction === "GB" ? "GB_LSE" : record.jurisdiction === "AU" ? "AU_ASX" : record.jurisdiction === "UNKNOWN" ? "UNKNOWN" : "UNKNOWN";
  const expectedScope = expectedJurisdiction === "US_SEC" ? ["listing:us-sec"] : expectedJurisdiction === "GB_LSE" ? ["listing:lse"] : expectedJurisdiction === "AU_ASX" ? ["listing:asx"] : [];
  const expectedSeenFamilies = [sourceFamily];
  const retracted = record.lifecycleHint.kind === "RETRACTION" || lifecycleStatus === "RETRACTED";
  if (candidate.evaluatedAt !== cutoff || route.candidateId !== candidate.candidateId || route.evaluationAsOf !== cutoff || route.publicationAt !== record.publishedAt || route.discoveredAt !== record.discoveredAt || route.receivedAt !== record.receivedAt || route.eventHint !== eventHint || route.jurisdiction !== expectedJurisdiction || route.listingScopes.length !== expectedScope.length || route.listingScopes.some((item, index) => item !== expectedScope[index]) || route.seenFamilies.length !== expectedSeenFamilies.length || route.seenFamilies.some((family, index) => family !== expectedSeenFamilies[index])) fail();
  if (route.correctionPresent !== correction.present || route.correctionResolved !== correction.resolved || route.correctionAvailableAt !== correction.availableAt || route.correctionFieldHints.length !== (correction.present ? 1 : 0) || (correction.present && route.correctionFieldHints[0] !== "OTHER") || route.retracted !== retracted) fail();
  if (route.duplicate || route.conflicts.length || route.originBindings.length) fail();
}

function declaredOriginKey(candidate: NewsDiscoveryCandidate): string | null {
  const origin = candidate.record.origin;
  if (!origin.originalPublisher || !origin.originalPublicationId || !origin.originalSourceUrl || origin.attributionBasis !== "EXPLICIT_SYNTHETIC_DECLARATION") return null;
  return JSON.stringify([origin.originalPublisher.publisherId, origin.originalPublicationId, origin.originalSourceUrl]);
}

function sourceMaterialKey(candidate: NewsDiscoveryCandidate): string {
  const record = candidate.record;
  return JSON.stringify([record.headline, record.summary, record.publishedAt, record.sourceUpdatedAt, record.language, record.jurisdiction, record.attributedIssuer, record.mentionedEntities, record.mentionedAssets, record.eventCategories, record.lifecycleHint, record.discoveryConfidence, record.origin.originalPublisher, record.origin.originalPublicationId, record.origin.originalSourceUrl]);
}

function increment(map: Map<string, number>, key: string): void { map.set(key, (map.get(key) ?? 0) + 1); }

/**
 * Composes only explicitly synthetic domain material. Routing facts are scenario
 * inputs, not evidence or authority; all status and priority decisions remain
 * owned by the routing and queue contracts.
 */
export function composeEventIntelligenceEvidenceReviewQueue(input: unknown): EventIntelligenceQueueCompositionResult {
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

    const entryById = new Map<string, { candidate: NewsDiscoveryCandidate; route: SyntheticRoutingMaterial }>();
    const lifecycleById = new Map(originSet.members.map(member => [member.candidate.candidateId, member]));
    const successorByParentId = new Map(originSet.members.flatMap(member => member.candidate.record.lifecycleHint.targetCandidateId === null ? [] : [[member.candidate.record.lifecycleHint.targetCandidateId, member] as const]));
    const correctionById = new Map<string, { present: boolean; resolved: boolean; availableAt: string | null }>();
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
    for (const entry of entries) {
      const candidate = entry.candidate as NewsDiscoveryCandidate;
      const parsed = parseSyntheticRoutingMaterial(entry.routingMaterial);
      if (parsed.status !== "VALID") return BLOCKED("COMPOSITION_INPUT_INVALID");
      const lifecycle = lifecycleById.get(candidate.candidateId);
      if (!lifecycle) return BLOCKED("COMPOSITION_DISCOVERY_SET_INVALID");
      const correction = correctionById.get(candidate.candidateId);
      if (!correction) return BLOCKED("COMPOSITION_DISCOVERY_SET_INVALID");
      assertCandidateBinding(candidate, parsed.material, cutoff, lifecycle.lifecycleStatus, correction);
      if (entryById.has(candidate.candidateId)) return BLOCKED("COMPOSITION_INPUT_INVALID");
      entryById.set(candidate.candidateId, { candidate, route: parsed.material });
    }

    const decision = getSourcePortfolioDecision();
    const finalResults: RoutingEvaluation[] = [];
    const parentById = new Map(authentic.filter(candidate => candidate.record.lifecycleHint.targetCandidateId !== null).map(candidate => [candidate.candidateId, candidate.record.lifecycleHint.targetCandidateId!]));
    const rootById = new Map<string, string>();
    const rootFor = (candidateId: string): string => {
      const path: string[] = [];
      let current = candidateId;
      while (parentById.has(current) && !rootById.has(current)) { path.push(current); current = parentById.get(current)!; }
      const root = rootById.get(current) ?? current;
      rootById.set(current, root);
      for (const id of path) rootById.set(id, root);
      return root;
    };
    const originMaterials = new Map<string, MaterialStats>();
    const urlMaterials = new Map<string, { total: number; byMaterial: Map<string, number> }>();
    for (const member of originSet.members) {
      const bound = entryById.get(member.candidate.candidateId);
      if (!bound) return BLOCKED("COMPOSITION_INPUT_INVALID");
      const conflicts = new Set<string>(bound.route.conflicts);
      let duplicate = false;
      const materialKey = sourceMaterialKey(member.candidate);
      const originKey = declaredOriginKey(member.candidate);
      const urlKey = member.candidate.record.canonicalSourceUrl;
      const lifecycleRoot = rootFor(member.candidate.candidateId);
      const sameOriginMaterials = originKey === null ? undefined : originMaterials.get(originKey);
      if (sameOriginMaterials) {
        const sameMaterial = sameOriginMaterials.byMaterial.get(materialKey) ?? 0;
        const sameRoot = sameOriginMaterials.byRoot.get(lifecycleRoot) ?? 0;
        const samePair = sameOriginMaterials.byPair.get(`${lifecycleRoot}\u0000${materialKey}`) ?? 0;
        duplicate = sameMaterial > 0;
        if (sameOriginMaterials.total - sameMaterial - sameRoot + samePair > 0) conflicts.add("SOURCE_MATERIAL_CONFLICT");
      }
      const sameUrlMaterials = urlMaterials.get(urlKey);
      if (sameUrlMaterials && sameUrlMaterials.total - (sameUrlMaterials.byMaterial.get(materialKey) ?? 0) > 0) conflicts.add("SOURCE_MATERIAL_CONFLICT");
      if (originKey !== null) {
        const group = originMaterials.get(originKey) ?? { total: 0, byMaterial: new Map<string, number>(), byRoot: new Map<string, number>(), byPair: new Map<string, number>() };
        group.total++; increment(group.byMaterial, materialKey); increment(group.byRoot, lifecycleRoot); increment(group.byPair, `${lifecycleRoot}\u0000${materialKey}`); originMaterials.set(originKey, group);
      }
      const urlGroup = sameUrlMaterials ?? { total: 0, byMaterial: new Map<string, number>() }; urlGroup.total++; increment(urlGroup.byMaterial, materialKey); urlMaterials.set(urlKey, urlGroup);
      const material = { ...bound.route, duplicate, conflicts: [...conflicts].sort(cmp) };
      let result = evaluateSourcePortfolioRouting(decision, material);
      if (!result || !isAuthenticRoutingEvaluation(result) || result.currentState !== "DISCOVERED") return BLOCKED("COMPOSITION_ROUTING_REJECTED");
      let evaluations = 1;
      while (result.nextState !== "STOPPED_BLOCKED" && result.nextState !== "NON_AUTHORITATIVE_REVIEW_COMPLETE") {
        if (evaluations >= EVENT_INTELLIGENCE_QUEUE_COMPOSITION_LIMITS.routingEvaluationsPerCandidate) return BLOCKED("COMPOSITION_ROUTING_REJECTED");
        const next = evaluateSourcePortfolioRouting(decision, material, result);
        if (!next || !isAuthenticRoutingEvaluation(next) || next.candidateId !== result.candidateId || next.evaluationAsOf !== cutoff || next.currentState !== result.nextState) return BLOCKED("COMPOSITION_ROUTING_REJECTED");
        result = next;
        evaluations++;
      }
      finalResults.push(result);
    }
    if (finalResults.length > EVENT_INTELLIGENCE_QUEUE_COMPOSITION_LIMITS.queueItems) return BLOCKED("COMPOSITION_INPUT_INVALID");
    const sealed = sealEvidenceReviewQueueSet(decision, finalResults);
    if (sealed.status !== "SEALED") return BLOCKED("COMPOSITION_QUEUE_REJECTED");
    const projected = adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), sealed.queueSet);
    if (projected.status !== "PROJECTED") return BLOCKED("COMPOSITION_VIEW_MODEL_REJECTED");
    const model = projected.model;
    if (sealed.queueSet.members.length !== model.items.length) return BLOCKED("COMPOSITION_VIEW_MODEL_REJECTED");
    const candidatePublicKeys = new Map<string, string>();
    const publicKeys = new Set<string>();
    for (let index = 0; index < sealed.queueSet.members.length; index++) {
      const member = sealed.queueSet.members[index];
      const item = model.items[index];
      if (!item) return fail();
      if (candidatePublicKeys.has(member.item.candidateId) || publicKeys.has(item.publicKey)) return BLOCKED("COMPOSITION_VIEW_MODEL_REJECTED");
      candidatePublicKeys.set(member.item.candidateId, item.publicKey);
      publicKeys.add(item.publicKey);
    }
    CANDIDATE_PUBLIC_KEYS.set(model, candidatePublicKeys);
    const composition = freeze({
      version: EVENT_INTELLIGENCE_QUEUE_COMPOSITION_VERSION,
      status: "NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION" as const,
      evaluationAsOf: cutoff,
      summary: { candidates: authentic.length, queueItems: model.summary.totalItems, blocked: model.summary.blocked, open: model.summary.open, noAction: model.summary.noAction, retracted: model.summary.retracted, correctionReviews: model.summary.correctionsRequiringReview },
      viewModel: model,
    });
    return Object.freeze({ status: "COMPOSED" as const, composition });
  } catch {
    return BLOCKED("COMPOSITION_INPUT_INVALID");
  }
}
