import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composeEventIntelligenceEvidenceReviewQueue, EVENT_INTELLIGENCE_QUEUE_COMPOSITION_LIMITS } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import { createSyntheticNewsDiscoveryCandidate, type NewsDiscoveryRecord } from "@/domain/intelligence/event-intelligence-news-discovery";
import type { EventHint, SyntheticRoutingMaterial } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { EvidenceReviewQueueWorkspace } from "@/components/intelligence/evidence-review-queue-workspace";
import { createBlockedEvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import { loadEvidenceReviewQueueViewModel } from "@/application/intelligence/load-evidence-review-queue-view-model";
import { syntheticNewsRecord, syntheticAggregatorRecord, syntheticWireRecord } from "../fixtures/event-intelligence-news-discovery";

const AS_OF = "2026-10-03T12:00:00.000Z";
const CORRECTION_AT = "2026-10-02T08:00:00.000Z";
const familyFor = (candidate: ReturnType<typeof createSyntheticNewsDiscoveryCandidate>) => candidate!.record.sourceType === "NEWS_AGGREGATOR" ? "DISCOVERY_AGGREGATOR" : candidate!.record.sourceType === "EXCHANGE_OR_REGULATOR_FEED" ? "REGULATORY_OR_EXCHANGE_DISCLOSURE" : "ISSUER_ATTRIBUTED_RELEASE";
const eventHintFor = (record: NewsDiscoveryRecord): EventHint => record.lifecycleHint.kind === "RETRACTION" ? "RETRACTION_WITHDRAWAL"
  : record.lifecycleHint.kind === "CORRECTION" ? "CORRECTION_AMENDMENT"
  : record.eventCategories.includes("COMPLETED_CRYPTO_PURCHASE") ? "COMPLETED_PURCHASE"
  : record.eventCategories.includes("BINDING_PURCHASE_AGREEMENT") ? "BINDING_AGREEMENT"
  : record.eventCategories.includes("BOARD_AUTHORIZATION") ? "BOARD_AUTHORIZATION"
  : record.eventCategories.includes("TREASURY_POLICY_CHANGE") ? "TREASURY_POLICY"
  : record.eventCategories.includes("CORPORATE_CRYPTO_PURCHASE_INTENT") ? "PURCHASE_INTENT"
  : record.eventCategories.includes("CANCELLATION_OR_TERMINATION") ? "CANCELLATION_TERMINATION"
  : record.eventCategories.includes("CORRECTION_OR_RETRACTION") ? "CORRECTION_AMENDMENT"
  : "UNKNOWN";

function candidate(record = syntheticNewsRecord(), asOf = AS_OF) {
  const value = createSyntheticNewsDiscoveryCandidate(record, asOf);
  if (!value) throw new Error("Synthetic candidate fixture was rejected");
  return value;
}

/** These booleans are explicitly simulated route facts. They do not mint mapping, rights, source, or authority approval. */
function routeFor(value: ReturnType<typeof candidate>, patch: Partial<SyntheticRoutingMaterial> = {}, asOf = AS_OF): SyntheticRoutingMaterial {
  const record = value.record;
  const correctionPresent = record.lifecycleHint.kind === "CORRECTION" || (record.lifecycleHint.kind === "NONE" && record.eventCategories.includes("CORRECTION_OR_RETRACTION"));
  const correctionResolved = record.lifecycleHint.kind === "CORRECTION";
  return {
    provenance: "SYNTHETIC", candidateId: value.candidateId,
    jurisdiction: record.jurisdiction === "US" ? "US_SEC" : record.jurisdiction === "GB" ? "GB_LSE" : record.jurisdiction === "AU" ? "AU_ASX" : "UNKNOWN",
    listingScopes: record.jurisdiction === "US" ? ["listing:us-sec"] : record.jurisdiction === "GB" ? ["listing:lse"] : record.jurisdiction === "AU" ? ["listing:asx"] : [],
    eventHint: eventHintFor(record), seenFamilies: [familyFor(value)], availableFamilies: [],
    issuerMapped: true, assetMapped: true, duplicate: false, rightsApproved: true, credentialAvailable: true,
    completionMaterialPresent: record.eventCategories.includes("COMPLETED_CRYPTO_PURCHASE"), primaryAvailable: true, qualificationComplete: true,
    correctionPresent, correctionResolved, correctionFieldHints: correctionPresent ? ["OTHER"] : [],
    retracted: record.lifecycleHint.kind === "RETRACTION", conflicts: [], stale: false, originBindings: [],
    publicationAt: record.publishedAt, discoveredAt: record.discoveredAt, receivedAt: record.receivedAt,
    correctionAvailableAt: correctionPresent ? record.publishedAt : null, evaluationAsOf: asOf, ...patch,
  };
}

function input(values: readonly ReturnType<typeof candidate>[], patches: readonly Partial<SyntheticRoutingMaterial>[] = [], asOf = AS_OF) {
  return { evaluationAsOf: asOf, candidates: values.map((value, index) => ({ candidate: value, routingMaterial: routeFor(value, patches[index], asOf) })) };
}

function compose(values: readonly ReturnType<typeof candidate>[], patches: readonly Partial<SyntheticRoutingMaterial>[] = [], asOf = AS_OF) {
  const result = composeEventIntelligenceEvidenceReviewQueue(input(values, patches, asOf));
  if (result.status !== "COMPOSED") throw new Error(`Composition rejected: ${result.code}`);
  return result.composition;
}

function correctionRecord(targetCandidateId: string, kind: "CORRECTION" | "RETRACTION" = "CORRECTION"): NewsDiscoveryRecord {
  const original = syntheticNewsRecord();
  return {
    ...original,
    providerRecordId: kind === "CORRECTION" ? "synthetic-release-correction" : "synthetic-release-retraction",
    canonicalSourceUrl: kind === "CORRECTION" ? "https://issuer.test/releases/crypto-plan-corrected" : "https://issuer.test/releases/crypto-plan-withdrawn",
    headline: kind === "CORRECTION" ? "Synthetic Large Company corrects prior release" : "Synthetic Large Company withdraws prior release",
    summary: "Synthetic lifecycle hint; no underlying event authority is asserted.",
    publishedAt: CORRECTION_AT, discoveredAt: "2026-10-02T08:01:00.000Z", receivedAt: "2026-10-02T08:01:01.000Z", recordedAt: "2026-10-02T08:01:02.000Z",
    sourceUpdatedAt: null, eventCategories: ["CORRECTION_OR_RETRACTION"],
    lifecycleHint: { kind, targetCandidateId },
  };
}

describe("server-only evidence review queue composition", () => {
  it("composes discovery through routing, queue sealing, and the public view-model adapter", () => {
    const value = candidate(syntheticAggregatorRecord());
    const result = compose([value], [{ issuerMapped: false, assetMapped: false, primaryAvailable: false, qualificationComplete: false, rightsApproved: true, credentialAvailable: true }]);
    expect(result.status).toBe("NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION");
    expect(result.viewModel.state).toBe("HAS_REVIEW_ITEMS");
    expect(result.viewModel.items[0]?.reviewType).toBe("ISSUER_MAPPING_REVIEW");
    expect(result.viewModel.items[0]?.evaluatedAsOf).toBe(AS_OF);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.viewModel.items)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/fingerprint|routingResultId|itemId|candidateId|WeakSet|canonicalSourceUrl/i);
  });

  it("keeps rights and jurisdiction blockers ahead of weaker routing work", () => {
    const rights = compose([candidate()], [{ rightsApproved: false }]);
    expect(rights.viewModel.items[0]).toMatchObject({ status: "BLOCKED", operationalPriority: "BLOCKED_RIGHTS" });
    const unknown = candidate({ ...syntheticNewsRecord(), jurisdiction: "UNKNOWN", attributedIssuer: null });
    const jurisdiction = compose([unknown], [{ jurisdiction: "UNKNOWN", listingScopes: [], rightsApproved: true }]);
    expect(jurisdiction.viewModel.items[0]).toMatchObject({ status: "BLOCKED", operationalPriority: "JURISDICTION_UNKNOWN" });
  });

  it("keeps unresolved correction ahead of an explicitly declared duplicate", () => {
    const original = candidate();
    const copy = candidate(syntheticWireRecord());
    const unresolvedRecord = { ...correctionRecord(original.candidateId), canonicalSourceUrl: "https://issuer.test/releases/crypto-plan", lifecycleHint: { kind: "NONE" as const, targetCandidateId: null } };
    const correction = candidate(unresolvedRecord);
    const correctionRoutes = [routeFor(original), routeFor(copy), routeFor(correction, { correctionResolved: false })];
    const result = composeEventIntelligenceEvidenceReviewQueue({ evaluationAsOf: AS_OF, candidates: [original, copy, correction].map((value, index) => ({ candidate: value, routingMaterial: correctionRoutes[index]! })) });
    expect(result.status).toBe("COMPOSED");
    if (result.status === "COMPOSED") {
      const correctionItem = result.composition.viewModel.items.find(item => item.retracted === false && item.correctionPresent && item.status === "BLOCKED");
      expect(correctionItem?.reviewType).toBe("CORRECTION_LINEAGE_REVIEW");
      expect(correctionItem?.operationalPriority).toBe("URGENT_CORRECTION_REVIEW");
      expect(result.composition.viewModel.items.some(item => item.status === "NO_ACTION")).toBe(true);
      expect(result.composition.viewModel.items.findIndex(item => item.operationalPriority === "URGENT_CORRECTION_REVIEW")).toBeLessThan(result.composition.viewModel.items.findIndex(item => item.status === "NO_ACTION"));
    }
  });

  it("keeps resolved correction material non-authoritative and out of correction-review counts", () => {
    const original = candidate();
    const correction = candidate(correctionRecord(original.candidateId));
    const parentRoute = routeFor(original, { correctionPresent: true, correctionResolved: true, correctionAvailableAt: CORRECTION_AT, correctionFieldHints: ["OTHER"] });
    const childRoute = routeFor(correction, { correctionResolved: true });
    const result = composeEventIntelligenceEvidenceReviewQueue({ evaluationAsOf: AS_OF, candidates: [{ candidate: original, routingMaterial: parentRoute }, { candidate: correction, routingMaterial: childRoute }] });
    expect(result.status).toBe("COMPOSED");
    if (result.status === "COMPOSED") {
      expect(result.composition.viewModel.summary.correctionsRequiringReview).toBe(0);
      expect(result.composition.viewModel.items.every(item => item.status === "BLOCKED" || item.status === "RESOLVED_NON_AUTHORITATIVE")).toBe(true);
      expect(result.composition.viewModel.items.every(item => item.forbiddenConclusionLabels.includes("No event authority is granted"))).toBe(true);
    }
  });

  it("makes retraction terminal and visible", () => {
    const original = candidate();
    const retraction = candidate(correctionRecord(original.candidateId, "RETRACTION"));
    const result = compose([original, retraction], [routeFor(original, { retracted: true }), routeFor(retraction)]);
    expect(result.viewModel.items.some(item => item.status === "RETRACTED" && item.retracted)).toBe(true);
    expect(result.viewModel.summary.retracted).toBeGreaterThan(0);
  });

  it("derives duplicate/no-action only from matching declared-origin material", () => {
    const direct = candidate();
    const wire = candidate(syntheticWireRecord());
    const result = compose([direct, wire]);
    expect(result.viewModel.items.some(item => item.status === "NO_ACTION" && item.reviewType === "DUPLICATE_NO_ACTION")).toBe(true);
    const different = candidate({ ...syntheticWireRecord(), headline: "A materially different announcement" });
    const conflict = compose([direct, different]);
    expect(conflict.viewModel.items.some(item => item.reviewType === "SOURCE_CONFLICT_REVIEW")).toBe(true);
  });

  it("keeps unsupported corroboration blocked and completed-purchase headlines non-authoritative", () => {
    const purchase = candidate({ ...syntheticNewsRecord(), eventCategories: ["COMPLETED_CRYPTO_PURCHASE"] });
    const result = compose([purchase], [{ completionMaterialPresent: true }]);
    expect(result.viewModel.items[0]).toMatchObject({ reviewType: "NON_AUTHORITATIVE_REVIEW_COMPLETE", status: "BLOCKED" });
    expect(result.viewModel.items[0]?.forbiddenConclusionLabels).toContain("Purchase completion is not confirmed");
    expect(result.viewModel.items[0]?.forbiddenConclusionLabels).toContain("Independent factual verification is unavailable");
  });

  it("excludes future correction material from an earlier cutoff and keeps later snapshots distinct", () => {
    const early = "2026-10-01T12:00:00.000Z";
    const oldRecord = { ...syntheticNewsRecord(), recordedAt: "2026-10-01T09:00:02.000Z" };
    const earlyCandidate = candidate(oldRecord, early);
    const earlyResult = compose([earlyCandidate], [routeFor(earlyCandidate, { evaluationAsOf: early })], early);
    expect(earlyResult.viewModel.items[0]?.historical).toBe(true);
    expect(earlyResult.viewModel.items[0]?.correctionPresent).toBe(false);
    const original = candidate();
    const corrected = candidate(correctionRecord(original.candidateId));
    const later = compose([original, corrected], [routeFor(original, { correctionPresent: true, correctionResolved: true, correctionAvailableAt: CORRECTION_AT, correctionFieldHints: ["OTHER"] }), routeFor(corrected, { correctionResolved: true })]);
    expect(later.viewModel.items.some(item => item.correctionPresent)).toBe(true);
    expect(later.viewModel.items.every(item => item.historical)).toBe(true);
    expect(later.viewModel.items.some(item => item.publicKey !== earlyResult.viewModel.items[0]?.publicKey)).toBe(true);
  });

  it("seals deterministic canonical order and replay-identical view-model output", () => {
    const a = candidate();
    const b = candidate({ ...syntheticNewsRecord(), providerRecordId: "synthetic-release-002", canonicalSourceUrl: "https://issuer.test/releases/other", origin: { ...syntheticNewsRecord().origin, originalPublicationId: "release-002", originalSourceUrl: "https://issuer.test/releases/other" } });
    const first = compose([a, b]);
    const second = compose([b, a]);
    expect(first.viewModel).toEqual(second.viewModel);
    expect(first.summary).toEqual(second.summary);
  });

  it("fails atomically on copied candidates, bad route bindings, mixed cutoff, and malformed input", () => {
    const value = candidate();
    const copied = { ...value };
    expect(composeEventIntelligenceEvidenceReviewQueue(input([copied as never]))).toMatchObject({ status: "BLOCKED", code: "COMPOSITION_CANDIDATE_UNTRUSTED" });
    expect(composeEventIntelligenceEvidenceReviewQueue(input([value], [{ candidateId: "candidate:other" }]))).toMatchObject({ status: "BLOCKED", code: "COMPOSITION_INPUT_INVALID" });
    const aggregator = candidate(syntheticAggregatorRecord());
    expect(composeEventIntelligenceEvidenceReviewQueue(input([aggregator], [{ seenFamilies: ["DISCOVERY_AGGREGATOR", "FILING_AUTHORITY"] }]))).toMatchObject({ status: "BLOCKED", code: "COMPOSITION_INPUT_INVALID" });
    expect(composeEventIntelligenceEvidenceReviewQueue(input([value], [], "2026-10-04T00:00:00.000Z"))).toMatchObject({ status: "BLOCKED", code: "COMPOSITION_CUTOFF_MISMATCH" });
    const badMember = input([value]);
    badMember.candidates.push({ candidate: copied as never, routingMaterial: routeFor(value) });
    expect(composeEventIntelligenceEvidenceReviewQueue(badMember)).not.toMatchObject({ status: "COMPOSED" });
    const repeated = input([value, value]);
    expect(composeEventIntelligenceEvidenceReviewQueue(repeated)).toMatchObject({ status: "BLOCKED" });
    const tooMany = { evaluationAsOf: AS_OF, candidates: Array.from({ length: 65 }, () => ({ candidate: value, routingMaterial: routeFor(value) })) };
    expect(composeEventIntelligenceEvidenceReviewQueue(tooMany)).toMatchObject({ status: "BLOCKED", code: "COMPOSITION_INPUT_INVALID" });
    expect(EVENT_INTELLIGENCE_QUEUE_COMPOSITION_LIMITS.candidates).toBe(64);
  });

  it("rejects accessors, symbols, sparse arrays and proxies without invoking caller code", () => {
    const value = candidate();
    let calls = 0;
    const accessor = { evaluationAsOf: AS_OF, get candidates() { calls++; return input([value]).candidates; } };
    expect(composeEventIntelligenceEvidenceReviewQueue(accessor)).toMatchObject({ status: "BLOCKED" });
    const symbol = { ...input([value]), [Symbol("extra")]: true };
    expect(composeEventIntelligenceEvidenceReviewQueue(symbol)).toMatchObject({ status: "BLOCKED" });
    const sparse = new Array(1);
    expect(composeEventIntelligenceEvidenceReviewQueue({ evaluationAsOf: AS_OF, candidates: sparse })).toMatchObject({ status: "BLOCKED" });
    const proxy = new Proxy(input([value]), { get: () => { calls++; throw new Error("sentinel"); }, ownKeys: () => { calls++; throw new Error("sentinel"); }, getPrototypeOf: () => { calls++; throw new Error("sentinel"); } });
    expect(composeEventIntelligenceEvidenceReviewQueue(proxy)).toMatchObject({ status: "BLOCKED" });
    expect(calls).toBe(0);
  });

  it("renders only the safe view model and leaves production loading blocked", () => {
    const model = compose([candidate()]).viewModel;
    const html = renderToStaticMarkup(createElement(EvidenceReviewQueueWorkspace, { model }));
    expect(html).toContain("Evidence review queue");
    expect(html).not.toMatch(/candidateId|routingResultId|fingerprint|canonicalSourceUrl/);
    expect(loadEvidenceReviewQueueViewModel()).toEqual(createBlockedEvidenceReviewQueueViewModel());
    expect(loadEvidenceReviewQueueViewModel().items).toHaveLength(0);
  });

  it("keeps the composition server-only and outside the production route graph", () => {
    const service = readFileSync("src/application/intelligence/compose-event-intelligence-evidence-review-queue.ts", "utf8");
    const page = readFileSync("src/app/intelligence/events/review/page.tsx", "utf8");
    const loader = readFileSync("src/application/intelligence/load-evidence-review-queue-view-model.ts", "utf8");
    expect(service.startsWith('import "server-only"')).toBe(true);
    expect(page).not.toContain("composeEventIntelligenceEvidenceReviewQueue");
    expect(loader).not.toContain("composeEventIntelligenceEvidenceReviewQueue");
    expect(service).not.toMatch(/\b(fetch|XMLHttpRequest|createClient|process\.env|headers\(|cookies\(|scheduler|cron|notify)\b/);
    expect(existsSync("src/app/intelligence/events/review-harness/page.tsx")).toBe(false);
  });
});
