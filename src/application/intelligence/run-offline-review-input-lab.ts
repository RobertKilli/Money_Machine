import "server-only";

import { types } from "node:util";
import { notFound } from "next/navigation";
import type { EvidenceReviewQueueV2ViewModel } from "@/application/intelligence/project-event-intelligence-evidence-review-queue-v2-view-model";
import {
  OFFLINE_INPUT_LAB_PROFILES,
  parseOfflineInputLabInput,
  offlineInputLabProfileLabel,
  type OfflineInputLabInput,
  type OfflineInputLabInputErrors,
  type OfflineInputLabProfile,
} from "@/application/intelligence/offline-input-lab-contract";

export type OfflineInputLabOutcome = Readonly<{
  slot: number;
  profile: OfflineInputLabProfile;
  profileLabel: string;
  headline: string;
  state: "OMITTED" | "DISCOVERY_ACCEPTED" | "DISCOVERY_REJECTED";
  rejectionCode?: "NEWS_DISCOVERY_INVALID" | "PROFILE_VARIANT_UNSUPPORTED";
  explanation: string;
}>;

export type OfflineInputLabResult = Readonly<
  | Readonly<{ status: "INVALID"; input: OfflineInputLabInput | null; errors: OfflineInputLabInputErrors }>
  | Readonly<{
      status: "EVALUATED";
      input: OfflineInputLabInput;
      submittedCount: number;
      includedCount: number;
      omittedCount: number;
      discoveryAcceptedCount: number;
      discoveryRejectedCount: number;
      composedCount: number;
      outcomes: readonly OfflineInputLabOutcome[];
      cutoff: string;
      compositionStatus: "NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION" | "BLOCKED_NO_ACCEPTED_RECORDS" | "BLOCKED_COMPOSITION";
      compositionCode: "COMPOSITION_INPUT_INVALID" | "COMPOSITION_CANDIDATE_UNTRUSTED" | "COMPOSITION_CUTOFF_MISMATCH" | "COMPOSITION_DISCOVERY_SET_INVALID" | "COMPOSITION_ROUTING_REJECTED" | "COMPOSITION_QUEUE_REJECTED" | null;
      queueStatus: string;
      model: EvidenceReviewQueueV2ViewModel | null;
    }>
>;

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

const EVENT_CATEGORIES: Readonly<Record<Exclude<OfflineInputLabInput["records"][number]["eventHint"], "CORRECTION_AMENDMENT">, string>> = Object.freeze({
  PURCHASE_INTENT: "CORPORATE_CRYPTO_PURCHASE_INTENT",
  BOARD_AUTHORIZATION: "BOARD_AUTHORIZATION",
  BINDING_AGREEMENT: "BINDING_PURCHASE_AGREEMENT",
  COMPLETED_PURCHASE: "COMPLETED_CRYPTO_PURCHASE",
  TREASURY_POLICY: "TREASURY_POLICY_CHANGE",
});

function safeApplicationGraph(value: unknown): boolean {
  const seen = new Set<object>();
  let visited = 0;
  const visit = (current: unknown, depth: number): boolean => {
    if (current === null || typeof current !== "object") return true;
    if (types.isProxy(current) || depth > 4 || ++visited > 64 || seen.has(current)) return false;
    seen.add(current);
    if (Array.isArray(current)) {
      const length = Object.getOwnPropertyDescriptor(current, "length")?.value;
      if (Object.getPrototypeOf(current) !== Array.prototype || !Number.isSafeInteger(length) || length > 3) return false;
    }
    const keys = Reflect.ownKeys(current);
    if (keys.length > 32) return false;
    for (const key of keys) {
      if (typeof key !== "string") return false;
      if (Array.isArray(current) && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || !visit(descriptor.value, depth + 1)) return false;
    }
    return true;
  };
  try { return visit(value, 0); } catch { return false; }
}

/** Development-only; the exact gate precedes input validation, fixture imports and domain calls. */
export async function runOfflineReviewInputLab(value: unknown): Promise<OfflineInputLabResult> {
  if (process.env.NODE_ENV !== "development") notFound();

  if (!safeApplicationGraph(value)) return Object.freeze({ status: "INVALID", input: null, errors: Object.freeze([Object.freeze({ field: "form", code: "INPUT_INVALID" as const, message: "Input is not a bounded plain data graph; no evaluation was run." })]) });
  const parsed = parseOfflineInputLabInput(value);
  if (parsed.status !== "VALID") return Object.freeze({ status: "INVALID", input: null, errors: parsed.errors });

  const [fixtures, discovery, composition, projection] = await Promise.all([
    import("@/application/intelligence/offline-review-demo-fixtures"),
    import("@/domain/intelligence/event-intelligence-news-discovery"),
    import("@/application/intelligence/compose-event-intelligence-evidence-review-queue-v2"),
    import("@/application/intelligence/project-event-intelligence-evidence-review-queue-v2-view-model"),
  ]);

  const outcomes: OfflineInputLabOutcome[] = [];
  const candidates: Array<{ candidate: import("@/domain/intelligence/event-intelligence-news-discovery").NewsDiscoveryCandidate; routingMaterial: import("@/domain/intelligence/event-intelligence-source-portfolio-routing-decision").SyntheticRoutingMaterial }> = [];
  const included = parsed.input.records.filter(record => record.included);

  for (let slot = 0; slot < parsed.input.records.length; slot++) {
    const item = parsed.input.records[slot]!;
    if (!item.included) {
      outcomes.push(Object.freeze({ slot, profile: item.profile, profileLabel: offlineInputLabProfileLabel(item.profile), headline: item.headline, state: "OMITTED", explanation: "Omitted by the submitted synthetic input; no discovery candidate was created." }));
      continue;
    }
    const profile = fixtures.createOfflineReviewInputProfile(item.profile);
    if (!profile || !OFFLINE_INPUT_LAB_PROFILES.includes(item.profile) || !fixtures.isOfflineReviewInputVariantSupported(item.profile, item.eventHint)) {
      outcomes.push(Object.freeze({ slot, profile: item.profile, profileLabel: offlineInputLabProfileLabel(item.profile), headline: item.headline, state: "DISCOVERY_REJECTED", rejectionCode: "PROFILE_VARIANT_UNSUPPORTED", explanation: "The server-owned scenario profile did not support this input." }));
      continue;
    }

    const category = item.eventHint === "CORRECTION_AMENDMENT" ? "CORRECTION_OR_RETRACTION" : EVENT_CATEGORIES[item.eventHint];
    const jurisdictionForEntities = item.jurisdiction;
    const record = {
      ...profile.record,
      headline: item.headline,
      publishedAt: item.publishedAt,
      discoveredAt: item.discoveredAt,
      receivedAt: item.receivedAt,
      recordedAt: item.recordedAt,
      jurisdiction: item.jurisdiction,
      attributedIssuer: profile.record.attributedIssuer ? { ...profile.record.attributedIssuer, jurisdiction: jurisdictionForEntities } : null,
      mentionedEntities: profile.record.mentionedEntities.map(entity => ({ ...entity, jurisdiction: jurisdictionForEntities })),
      eventCategories: [category],
    };
    const candidate = discovery.createSyntheticNewsDiscoveryCandidate(record, parsed.input.cutoff);
    if (!candidate) {
      outcomes.push(Object.freeze({ slot, profile: item.profile, profileLabel: offlineInputLabProfileLabel(item.profile), headline: item.headline, state: "DISCOVERY_REJECTED", rejectionCode: "NEWS_DISCOVERY_INVALID", explanation: "The existing discovery API rejected the synthetic record; no candidate was created." }));
      continue;
    }
    const routeMaterial = fixtures.createOfflineReviewInputRoutingMaterial(candidate, item.profile, item.eventHint, parsed.input.cutoff);
    if (!routeMaterial) {
      outcomes.push(Object.freeze({ slot, profile: item.profile, profileLabel: offlineInputLabProfileLabel(item.profile), headline: item.headline, state: "DISCOVERY_REJECTED", rejectionCode: "PROFILE_VARIANT_UNSUPPORTED", explanation: "The server-owned routing profile did not support this input." }));
      continue;
    }
    candidates.push({ candidate, routingMaterial: routeMaterial });
    outcomes.push(Object.freeze({ slot, profile: item.profile, profileLabel: offlineInputLabProfileLabel(item.profile), headline: item.headline, state: "DISCOVERY_ACCEPTED", explanation: "The existing discovery API accepted this synthetic record." }));
  }

  const includedCount = included.length;
  const omittedCount = parsed.input.records.length - includedCount;
  const discoveryAcceptedCount = candidates.length;
  const discoveryRejectedCount = includedCount - discoveryAcceptedCount;
  if (candidates.length === 0) {
    // The parent V2 composer has no empty-queue representation. Ask its public API
    // and report the real rejection instead of inventing a queue or workspace.
    const empty = composition.composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: parsed.input.cutoff, candidates: [] });
    return freezeDeep({
      status: "EVALUATED" as const,
      input: parsed.input,
      submittedCount: parsed.input.records.length,
      includedCount,
      omittedCount,
      discoveryAcceptedCount,
      discoveryRejectedCount,
      composedCount: 0,
      outcomes,
      cutoff: parsed.input.cutoff,
      compositionStatus: "BLOCKED_NO_ACCEPTED_RECORDS" as const,
      compositionCode: empty.status === "BLOCKED" ? empty.code : null,
      queueStatus: "NOT_CREATED",
      model: null,
    });
  }

  const composed = composition.composeEventIntelligenceEvidenceReviewQueueV2({ evaluationAsOf: parsed.input.cutoff, candidates });
  if (composed.status !== "COMPOSED") {
    return freezeDeep({
      status: "EVALUATED" as const,
      input: parsed.input,
      submittedCount: parsed.input.records.length,
      includedCount,
      omittedCount,
      discoveryAcceptedCount,
      discoveryRejectedCount,
      composedCount: 0,
      outcomes,
      cutoff: parsed.input.cutoff,
      compositionStatus: "BLOCKED_COMPOSITION" as const,
      compositionCode: composed.code,
      queueStatus: "NOT_CREATED",
      model: null,
    });
  }
  const model = projection.projectEvidenceReviewQueueV2ToViewModel(composed.composition);
  if (!model || !projection.isAuthenticEvidenceReviewQueueV2ViewModel(model)) {
    return freezeDeep({ status: "EVALUATED" as const, input: parsed.input, submittedCount: parsed.input.records.length, includedCount, omittedCount, discoveryAcceptedCount, discoveryRejectedCount, composedCount: 0, outcomes, cutoff: parsed.input.cutoff, compositionStatus: "BLOCKED_COMPOSITION" as const, compositionCode: "COMPOSITION_QUEUE_REJECTED" as const, queueStatus: "NOT_CREATED", model: null });
  }
  return freezeDeep({
    status: "EVALUATED" as const,
    input: parsed.input,
    submittedCount: parsed.input.records.length,
    includedCount,
    omittedCount,
    discoveryAcceptedCount,
    discoveryRejectedCount,
    composedCount: model.summary.totalItems,
    outcomes,
    cutoff: parsed.input.cutoff,
    compositionStatus: composed.composition.status,
    compositionCode: null,
    queueStatus: composed.composition.queue.status,
    model,
  });
}
