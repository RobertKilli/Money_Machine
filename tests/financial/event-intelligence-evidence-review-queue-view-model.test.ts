import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getSourcePortfolioDecision, evaluateSourcePortfolioRouting, isAuthenticRoutingEvaluation } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { getEvidenceReviewQueueContract, sealEvidenceReviewQueueSet, isAuthenticEvidenceReviewItem, isAuthenticEvidenceReviewQueueSet, projectRoutingResultToEvidenceReviewItem } from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import { adaptEvidenceReviewQueueSetToViewModel, createBlockedEvidenceReviewQueueViewModel, EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_PRODUCTION_STATE, EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION, getEvidenceReviewQueueViewModelContract, isAuthenticEvidenceReviewQueueViewModelContract, isSerializableEvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";

const base = (patch: Record<string, unknown> = {}) => ({ provenance: "SYNTHETIC", candidateId: "candidate:ui-0001", jurisdiction: "US_SEC", listingScopes: ["listing:us-sec"], eventHint: "PURCHASE_INTENT", seenFamilies: ["DISCOVERY_AGGREGATOR"], availableFamilies: ["FILING_AUTHORITY"], issuerMapped: true, assetMapped: true, duplicate: false, rightsApproved: true, credentialAvailable: true, completionMaterialPresent: false, primaryAvailable: true, qualificationComplete: true, correctionPresent: false, correctionResolved: true, correctionFieldHints: [], retracted: false, conflicts: [], stale: false, originBindings: [], publicationAt: "2026-10-01T00:00:00.000Z", discoveredAt: "2026-10-01T00:01:00.000Z", receivedAt: "2026-10-01T00:02:00.000Z", correctionAvailableAt: null, evaluationAsOf: "2026-10-03T00:00:00.000Z", ...patch });
function route(patch: Record<string, unknown> = {}) { return evaluateSourcePortfolioRouting(getSourcePortfolioDecision(), base(patch)); }
function set(patches: Record<string, unknown>[] = [{}]) {
  const results = patches.map((patch, i) => route({ ...patch, candidateId: patch.candidateId ?? `candidate:ui-${String(i).padStart(4, "0")}` }));
  if (results.some(x => !x)) throw new Error("synthetic routing setup failed");
  const sealed = sealEvidenceReviewQueueSet(getSourcePortfolioDecision(), results);
  return sealed.status === "SEALED" ? sealed.queueSet : null;
}
function view(patches: Record<string, unknown>[] = [{}]) { const q = set(patches); if (!q) throw new Error("sealed setup failed"); return adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), q); }

describe("evidence review queue view model boundary", () => {
  it("projects only runtime-authentic sealed sets into a frozen, serializable presentation model", () => {
    const q = set([{ candidateId: "candidate:stable-a" }, { candidateId: "candidate:stable-b", eventHint: "CORRECTION_AMENDMENT", correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-02T00:00:00.000Z" }]);
    const result = adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), q);
    expect(result.status).toBe("PROJECTED");
    if (result.status !== "PROJECTED") return;
    expect(result.model).toMatchObject({ version: EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_VERSION, state: "HAS_REVIEW_ITEMS", generatedForAsOf: "2026-10-03T00:00:00.000Z", summary: { totalItems: 2, correctionsRequiringReview: 1 } });
    expect(Object.isFrozen(result.model)).toBe(true); expect(Object.isFrozen(result.model.items)).toBe(true);
    expect(isSerializableEvidenceReviewQueueViewModel(result.model)).toBe(true);
    expect(JSON.parse(JSON.stringify(result.model))).toEqual(result.model);
  });
  it("uses stable opaque public keys that vary with item and cutoff material", () => {
    const a = view([{ candidateId: "candidate:key-a" }]); const replay = view([{ candidateId: "candidate:key-a" }]);
    const later = view([{ candidateId: "candidate:key-a", evaluationAsOf: "2026-10-04T00:00:00.000Z" }]);
    const other = view([{ candidateId: "candidate:key-b" }]);
    expect(a.status).toBe("PROJECTED"); expect(replay.status).toBe("PROJECTED"); expect(later.status).toBe("PROJECTED"); expect(other.status).toBe("PROJECTED");
    if (a.status === "PROJECTED" && replay.status === "PROJECTED" && later.status === "PROJECTED" && other.status === "PROJECTED") {
      expect(a.model.items[0]?.publicKey).toBe(replay.model.items[0]?.publicKey);
      expect(a.model.items[0]?.publicKey).not.toBe(later.model.items[0]?.publicKey);
      expect(a.model.items[0]?.publicKey).not.toBe(other.model.items[0]?.publicKey);
      expect(a.model.items[0]?.publicKey).toMatch(/^eviqv1_[a-f0-9]{64}$/);
      expect(a.model.items[0]?.publicKey).not.toContain("candidate:key-a");
    }
    const changedMaterial = view([{ candidateId: "candidate:key-a", rightsApproved: false }]);
    expect(changedMaterial.status).toBe("PROJECTED");
    if (a.status === "PROJECTED" && changedMaterial.status === "PROJECTED") expect(a.model.items[0]?.publicKey).not.toBe(changedMaterial.model.items[0]?.publicKey);
  });
  it("rejects copied sets, copied items, parsed contracts, reordered or incomplete members", () => {
    const q = set([{ candidateId: "candidate:member-a" }, { candidateId: "candidate:member-b", rightsApproved: false }])!;
    const result = adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), q);
    expect(result.status).toBe("PROJECTED");
    expect(adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), { ...q }).status).toBe("BLOCKED");
    expect(isAuthenticEvidenceReviewQueueSet(JSON.parse(JSON.stringify(q)))).toBe(false);
    expect(isAuthenticEvidenceReviewItem({ ...q.members[0]!.item })).toBe(false);
    expect(adaptEvidenceReviewQueueSetToViewModel(JSON.parse(JSON.stringify(getEvidenceReviewQueueContract())), q).status).toBe("BLOCKED");
    const reordered = Object.freeze({ ...q, members: Object.freeze([...q.members].reverse()) });
    expect(adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), reordered).status).toBe("BLOCKED");
    const missing = Object.freeze({ ...q, members: Object.freeze(q.members.slice(0, 1)) });
    expect(adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), missing).status).toBe("BLOCKED");
  });
  it("preserves correction, retraction, conflict, rights, mappings, and duplicate precedence labels", () => {
    const cases = [
      [{ eventHint: "RETRACTION_WITHDRAWAL", retracted: true, duplicate: true }, "RETRACTION_REVIEW", "RETRACTED", "URGENT_RETRACTION_REVIEW"],
      [{ eventHint: "CORRECTION_AMENDMENT", correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-02T00:00:00.000Z", duplicate: true }, "CORRECTION_LINEAGE_REVIEW", "BLOCKED", "URGENT_CORRECTION_REVIEW"],
      [{ conflicts: ["SOURCE_MATERIAL_CONFLICT"] }, "SOURCE_CONFLICT_REVIEW", "BLOCKED", "CONFLICT_REVIEW"],
      [{ rightsApproved: false }, "RIGHTS_APPROVAL_REVIEW", "BLOCKED", "BLOCKED_RIGHTS"],
      [{ issuerMapped: false }, "ISSUER_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED"],
      [{ assetMapped: false }, "ASSET_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED"],
      [{ duplicate: true, seenFamilies: ["FILING_AUTHORITY"], availableFamilies: ["ISSUER_ATTRIBUTED_RELEASE"] }, "DUPLICATE_NO_ACTION", "NO_ACTION", "NO_ACTION_DUPLICATE"],
    ] as const;
    for (const [patch, type, status, priority] of cases) {
      const result = view([patch]); expect(result.status).toBe("PROJECTED");
      if (result.status === "PROJECTED") expect(result.model.items[0]).toMatchObject({ reviewType: type, status, operationalPriority: priority });
    }
    const correction = view([{ eventHint: "CORRECTION_AMENDMENT", correctionPresent: true, correctionResolved: false, correctionFieldHints: ["OTHER"], correctionAvailableAt: "2026-10-02T00:00:00.000Z", duplicate: true }]);
    if (correction.status === "PROJECTED") expect(correction.model.items[0]?.title).toBe("Correction lineage requires review");
  });
  it("derives exact visible summary counts and exposes no raw identifiers, fingerprints, URL, or payload", () => {
    const result = view([{ candidateId: "candidate:view-check" }, { eventHint: "RETRACTION_WITHDRAWAL", retracted: true }]);
    expect(result.status).toBe("PROJECTED");
    if (result.status === "PROJECTED") {
      expect(result.model.summary).toMatchObject({ totalItems: 2, open: 1, retracted: 1 });
      expect(result.model.summary.totalItems).toBe(result.model.summary.open + result.model.summary.blocked + result.model.summary.noAction + result.model.summary.resolvedNonAuthoritative + result.model.summary.superseded + result.model.summary.retracted);
      const json = JSON.stringify(result.model);
      for (const secret of ["candidate:view-check", "routingResultId", "routingDecisionFingerprint", "setFingerprint", "itemId", "rawPayload", "credential", "https://"]) expect(json).not.toContain(secret);
      expect(result.model.items.find(item => item.reviewType === "PRIMARY_SOURCE_RETRIEVAL_REVIEW")?.title).toBe("Primary source must be retrieved");
    }
  });
  it("keeps completed-purchase language non-authoritative and UI presentation outside domain trust", () => {
    const decision = getSourcePortfolioDecision(); const routing = route({ eventHint: "COMPLETED_PURCHASE", completionMaterialPresent: false })!;
    const q = sealEvidenceReviewQueueSet(decision, [routing]); expect(q.status).toBe("SEALED");
    if (q.status !== "SEALED") return;
    const result = adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), q.queueSet);
    expect(result.status).toBe("PROJECTED"); if (result.status !== "PROJECTED") return;
    expect(result.model.items[0]?.forbiddenConclusionLabels).toContain("Purchase completion is not confirmed");
    const vm = result.model;
    expect(isAuthenticEvidenceReviewQueueSet(vm)).toBe(false); expect(isAuthenticEvidenceReviewItem(vm.items[0])).toBe(false); expect(isAuthenticRoutingEvaluation(vm)).toBe(false);
    expect(projectRoutingResultToEvidenceReviewItem(decision, vm)).toBeNull();
    expect(sealEvidenceReviewQueueSet(decision, vm).status).toBe("INVALID");
  });
  it("roundtripped view models remain presentational and serializable but never gain trust", () => {
    const result = view(); expect(result.status).toBe("PROJECTED"); if (result.status !== "PROJECTED") return;
    const roundtrip = JSON.parse(JSON.stringify(result.model));
    expect(isSerializableEvidenceReviewQueueViewModel(roundtrip)).toBe(true);
    expect(isAuthenticEvidenceReviewQueueViewModelContract(JSON.parse(JSON.stringify(getEvidenceReviewQueueViewModelContract())))).toBe(false);
    expect(isAuthenticEvidenceReviewQueueSet(roundtrip)).toBe(false);
    expect(isAuthenticEvidenceReviewItem(roundtrip.items[0])).toBe(false);
  });
  it("rejects proxy, inherited, accessor, symbol, sparse, and noncanonical presentation input at contract parsing boundaries", () => {
    const contract = getEvidenceReviewQueueViewModelContract();
    expect(isAuthenticEvidenceReviewQueueViewModelContract(new Proxy({}, { get() { throw new Error("trap"); } }))).toBe(false);
    expect(isAuthenticEvidenceReviewQueueViewModelContract(Object.assign(Object.create({ inherited: true }), contract))).toBe(false);
    let called = false; const accessor = { ...contract }; Object.defineProperty(accessor, "version", { enumerable: true, get() { called = true; return contract.version; } });
    expect(isAuthenticEvidenceReviewQueueViewModelContract(accessor)).toBe(false); expect(called).toBe(false);
    expect(isSerializableEvidenceReviewQueueViewModel(new Proxy([], { get() { throw new Error("trap"); } }))).toBe(false);
    expect(isSerializableEvidenceReviewQueueViewModel([, "sparse"])).toBe(false);
    expect(isSerializableEvidenceReviewQueueViewModel({ [Symbol("x")]: true })).toBe(false);
  });
  it("provides a deterministic blocked production model without synthetic items or I/O ports", () => {
    expect(EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_PRODUCTION_STATE).toEqual(createBlockedEvidenceReviewQueueViewModel());
    expect(EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_PRODUCTION_STATE).toMatchObject({ state: "BLOCKED", generatedForAsOf: null, items: [], summary: { totalItems: 0 }, blockedReasons: expect.any(Array) });
    expect(EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_PRODUCTION_STATE.items).toHaveLength(0);
    expect(JSON.stringify(EVIDENCE_REVIEW_QUEUE_VIEW_MODEL_PRODUCTION_STATE)).not.toMatch(/fingerprint|credential|fixture|synthetic/i);
  });
  it("keeps the production module free of route, fixture, source sibling, and operative imports", () => {
    const source = readFileSync("src/domain/intelligence/event-intelligence-evidence-review-queue-view-model.ts", "utf8");
    expect(source).not.toMatch(/from\s+["'][^"']*(gdelt|newsapi|issuer-release|exchange-announcement|discovery-inbox|tests\/fixtures|react|supabase)[^"']*["']/i);
    expect(source).not.toMatch(/\b(fetch|createConnection|createClient|dns\.lookup|https\.request)\s*\(/);
    expect(source).not.toContain("process.env");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
  it("includes only safe labels, enum values, UTC strings, counts, booleans, and no confidence/authority field", () => {
    const result = view([{ eventHint: "RETRACTION_WITHDRAWAL", retracted: true }]); expect(result.status).toBe("PROJECTED"); if (result.status !== "PROJECTED") return;
    expect(result.model.items[0]).toMatchObject({ retracted: true, statusLabel: "Retracted; not active", evaluatedAsOf: "2026-10-03T00:00:00.000Z" });
    expect(result.model).not.toHaveProperty("confidence"); expect(result.model).not.toHaveProperty("signal"); expect(result.model).not.toHaveProperty("recommendation");
  });
});
