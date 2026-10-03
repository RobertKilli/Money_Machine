import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getSourcePortfolioDecision, evaluateSourcePortfolioRouting } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import { getEvidenceReviewQueueContract, sealEvidenceReviewQueueSet } from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import { adaptEvidenceReviewQueueSetToViewModel, createBlockedEvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";
import { loadEvidenceReviewQueueViewModel } from "@/application/intelligence/load-evidence-review-queue-view-model";
import { EvidenceReviewQueueWorkspace, filterEvidenceReviewItems } from "@/components/intelligence/evidence-review-queue-workspace";

const base = (patch: Record<string, unknown> = {}) => ({
  provenance: "SYNTHETIC", candidateId: "candidate:ui", jurisdiction: "US_SEC", listingScopes: ["listing:us-sec"], eventHint: "PURCHASE_INTENT",
  seenFamilies: ["DISCOVERY_AGGREGATOR"], availableFamilies: ["FILING_AUTHORITY"], issuerMapped: true, assetMapped: true, duplicate: false,
  rightsApproved: true, credentialAvailable: true, completionMaterialPresent: false, primaryAvailable: true, qualificationComplete: true,
  correctionPresent: false, correctionResolved: true, correctionFieldHints: [], retracted: false, conflicts: [], stale: false, originBindings: [],
  publicationAt: "2026-10-01T00:00:00.000Z", discoveredAt: "2026-10-01T00:01:00.000Z", receivedAt: "2026-10-01T00:02:00.000Z",
  correctionAvailableAt: null, evaluationAsOf: "2026-10-03T00:00:00.000Z", ...patch,
});

function makeModel(patches: Record<string, unknown>[]) {
  const decision = getSourcePortfolioDecision();
  const results = patches.map((patch, index) => evaluateSourcePortfolioRouting(decision, base({ candidateId: `candidate:ui-${index}`, ...patch })));
  if (results.some(result => !result)) throw new Error("Synthetic route setup failed");
  const sealed = sealEvidenceReviewQueueSet(decision, results);
  if (sealed.status !== "SEALED") throw new Error("Synthetic queue setup failed");
  const projected = adaptEvidenceReviewQueueSetToViewModel(getEvidenceReviewQueueContract(), sealed.queueSet);
  if (projected.status !== "PROJECTED") throw new Error("Synthetic view-model setup failed");
  return projected.model;
}

const model = makeModel([
  { issuerMapped: false },
  { rightsApproved: false },
  { eventHint: "CORRECTION_AMENDMENT", correctionPresent: true, correctionResolved: false, correctionFieldHints: ["AMOUNT"], correctionAvailableAt: "2026-10-02T00:00:00.000Z" },
  { eventHint: "RETRACTION_WITHDRAWAL", retracted: true },
  { duplicate: true, seenFamilies: ["FILING_AUTHORITY"], availableFamilies: ["ISSUER_ATTRIBUTED_RELEASE"] },
]);
const render = (input: Parameters<typeof EvidenceReviewQueueWorkspace>[0]["model"]) => renderToStaticMarkup(createElement(EvidenceReviewQueueWorkspace, { model: input }));

describe("Evidence review queue UI boundary", () => {
  it("production loader always returns the parent contract's empty blocked model", () => {
    const result = loadEvidenceReviewQueueViewModel();
    expect(result).toEqual(createBlockedEvidenceReviewQueueViewModel());
    expect(result).toMatchObject({ state: "BLOCKED", generatedForAsOf: null, items: [], summary: { totalItems: 0 } });
    expect(JSON.stringify(result)).not.toMatch(/candidate:ui|synthetic|fixture|fingerprint/i);
  });

  it("renders a blocked, read-only state with no records or authority language", () => {
    const html = render(loadEvidenceReviewQueueViewModel());
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Evidence review queue");
    expect(html).toContain("ACQUISITION BLOCKED");
    expect(html).toContain("No synthetic candidates are shown in production.");
    expect(html).toContain("corroboration");
    expect(html).not.toContain("candidate:ui");
    expect(html).not.toContain("Verified event");
    expect(html).not.toContain("Buy");
  });

  it("renders synthetic candidate statuses, correction and retraction as plain text", () => {
    const html = render(model);
    expect(html).toContain("Issuer mapping review");
    expect(html).toContain("Blocked by rights approval");
    expect(html).toContain("Correction material present");
    expect(html).toContain("Retracted; not active");
    expect(html).toContain("Historical snapshot");
    expect(html).toContain("No new queue action");
    expect(html).toContain("Evaluated as of (UTC)");
    expect(html).not.toContain("dangerouslySetInnerHTML");
    expect(html).not.toMatch(/candidate:ui-[0-9]|itemId|setFingerprint|routingResultId/);
  });

  it("defaults to all items and never drops corrections or retractions from the unfiltered view", () => {
    expect(filterEvidenceReviewItems(model.items, {})).toHaveLength(model.items.length);
    expect(filterEvidenceReviewItems(model.items, {}).some(item => item.retracted)).toBe(true);
    expect(filterEvidenceReviewItems(model.items, {}).some(item => item.correctionPresent)).toBe(true);
    expect(filterEvidenceReviewItems(model.items, { status: "RETRACTED" })).toHaveLength(1);
    expect(filterEvidenceReviewItems(model.items, { status: "not-a-status" })).toHaveLength(model.items.length);
    expect(filterEvidenceReviewItems(model.items, { type: "CORRECTION_LINEAGE_REVIEW" })).toHaveLength(1);
  });

  it("bounds and sanitizes text filters without changing or mutating queue data", () => {
    const before = JSON.stringify(model);
    expect(filterEvidenceReviewItems(model.items, { query: "\u202e\u0000retracted" }).some(item => item.retracted)).toBe(true);
    expect(filterEvidenceReviewItems(model.items, { query: "x".repeat(10_000) })).toHaveLength(0);
    expect(JSON.stringify(model)).toBe(before);
    expect(Object.isFrozen(model.items)).toBe(true);
  });

  it("uses fixed UTC timestamps, stable public keys, labels and safe empty state", () => {
    const html = render(model);
    expect(html).toContain("2026-10-03T00:00:00.000Z");
    expect(html).toContain("eviqv1_");
    expect(html).toContain("Purchase completion is not confirmed");
    const empty = { ...createBlockedEvidenceReviewQueueViewModel(), state: "EMPTY" as const, generatedForAsOf: "2026-10-03T00:00:00.000Z", emptyState: "No evidence-review items exist for this historical cutoff.", blockedReasons: [] };
    const emptyHtml = render(empty);
    expect(emptyHtml).toContain("No evidence-review items");
    expect(emptyHtml).not.toContain("No items match these filters");
  });

  it("keeps production route wiring read-only and excludes test/demo/provider paths", () => {
    const page = readFileSync("src/app/intelligence/events/review/page.tsx", "utf8");
    const loader = readFileSync("src/application/intelligence/load-evidence-review-queue-view-model.ts", "utf8");
    const client = readFileSync("src/components/intelligence/evidence-review-queue-workspace.tsx", "utf8");
    expect(page).toContain("loadEvidenceReviewQueueViewModel");
    expect(loader).toContain('import "server-only"');
    expect(loader).toContain("createBlockedEvidenceReviewQueueViewModel");
    expect(client).not.toMatch(/from\s+["'][^"']*(server-only|application\/|infrastructure\/|tests\/|fixtures)[^"']*["']/i);
    expect(client).not.toMatch(/localStorage|sessionStorage|process\.env|fetch\s*\(|dangerouslySetInnerHTML|use server/i);
    expect(page + loader + client).not.toMatch(/demo=1|synthetic record|fixture candidate/i);
    expect(existsSync("src/app/intelligence/events/review/route.ts")).toBe(false);
  });
});
