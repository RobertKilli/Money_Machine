import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { adaptDiscoveryInbox } from "../../src/application/intelligence/adapt-discovery-inbox.server";
import { emptyInbox, filterInbox, inboxFiltersAreValid, type InboxFilters } from "../../src/application/intelligence/discovery-inbox-view-model";
import { DiscoveryInbox } from "../../src/components/intelligence/discovery-inbox";
import { loadDiscoveryInbox } from "../../src/application/intelligence/load-discovery-inbox";
import { createSyntheticNewsDiscoveryCandidate, NEWS_DISCOVERY_CATEGORIES, type NewsDiscoveryRecord } from "../../src/domain/intelligence/event-intelligence-news-discovery";
import { DISCOVERY_EVALUATION_AT, syntheticAggregatorRecord, syntheticNewsRecord, syntheticWireRecord } from "../fixtures/event-intelligence-news-discovery";

const EVALUATED = "2026-10-03T12:00:00.000Z";
function candidate(record: NewsDiscoveryRecord) {
  const value = createSyntheticNewsDiscoveryCandidate(record, DISCOVERY_EVALUATION_AT);
  if (!value) throw new Error("SYNTHETIC_CANDIDATE_INVALID");
  return value;
}
function lifecycleRecord(kind: "CORRECTION" | "RETRACTION", target: string, category: typeof NEWS_DISCOVERY_CATEGORIES[number] = "CORRECTION_OR_RETRACTION"): NewsDiscoveryRecord {
  const base = syntheticNewsRecord();
  return { ...base, providerRecordId: `synthetic-${kind.toLowerCase()}-record`, publishedAt: "2026-10-02T08:00:00.000Z", discoveredAt: "2026-10-02T09:00:00.000Z", receivedAt: "2026-10-02T09:00:01.000Z", recordedAt: "2026-10-02T09:00:02.000Z", eventCategories: [category], lifecycleHint: { kind, targetCandidateId: target } };
}
const filters: InboxFilters = { category: "", sourceType: "", discoveryStatus: "", mappingStatus: "", lifecycle: "", issuer: "", asset: "", from: "", to: "" };

describe("event intelligence discovery inbox view", () => {
  it("projects intent as a discovery lead, never a completed or authoritative event", () => {
    const source = candidate(syntheticNewsRecord()); const model = adaptDiscoveryInbox([source], EVALUATED); const item = model.items[0]!;
    expect(item.category).toBe("CORPORATE_CRYPTO_PURCHASE_INTENT");
    expect(item.discoveryStatus).toBe("NEW_DISCOVERY"); expect(item.mappingStatus).toBe("NEEDS_MAPPING"); expect(item.corroborationStatus).toBe("NEEDS_CORROBORATION");
    expect(item.capability).toBe("NON_AUTHORITATIVE_DISCOVERY_CANDIDATE"); expect(item.authorityStatus).toBe("DISCOVERY_ONLY");
    expect(Object.isFrozen(model) && Object.isFrozen(model.items) && Object.isFrozen(item.assets)).toBe(true);
  });

  it("shows issuer, wire and aggregator copies as one declared discovery origin group", () => {
    const model = adaptDiscoveryInbox([candidate(syntheticNewsRecord()), candidate(syntheticWireRecord()), candidate(syntheticAggregatorRecord())], EVALUATED);
    expect(model.items).toHaveLength(3);
    expect(model.items.map(item => item.originGroupCount)).toEqual([1, 1, 1]);
    expect(model.items.map(item => item.originGroupMemberCount)).toEqual([3, 3, 3]);
    expect(model.items.find(item => item.sourceType === "ISSUER_IR")?.sourceRelationship).toBe("Issuer IR publication · discovery only");
    expect(model.items.find(item => item.sourceType === "NEWSWIRE")?.sourceRelationship).toBe("Newswire distribution");
    expect(model.items.find(item => item.sourceType === "NEWS_AGGREGATOR")?.sourceRelationship).toBe("Aggregator reference · origin independence unverified");
    expect(model.items.every(item => item.corroborationStatus === "NEEDS_CORROBORATION" && item.authorityStatus === "DISCOVERY_ONLY")).toBe(true);
  });

  it("keeps similarly worded independent publishers in separate unresolved groups", () => {
    const first = syntheticNewsRecord(); const second: NewsDiscoveryRecord = { ...first, providerId: "newsapi-discovery", sourceType: "NEWS_AGGREGATOR", providerRecordId: "independent-record", publisher: { publisherId: "test-aggregator", displayName: "Synthetic news aggregator" }, canonicalSourceUrl: "https://aggregator.test/story/crypto-plan", origin: { distribution: "AGGREGATOR_REFERENCE", originalPublisher: { publisherId: "independent-journal", displayName: "Independent Journal" }, originalPublicationId: "independent-story", originalSourceUrl: "https://journal.test/story/crypto-plan", distributor: { publisherId: "test-aggregator", displayName: "Synthetic news aggregator" }, attributionBasis: "EXPLICIT_SYNTHETIC_DECLARATION" }, headline: first.headline };
    const model = adaptDiscoveryInbox([candidate(first), candidate(second)], EVALUATED);
    expect(model.items.map(item => item.originGroupMemberCount)).toEqual([1, 1]);
    expect(model.items.map(item => item.lifecycle)).toEqual(["ACTIVE", "ACTIVE"]);
    expect(model.items.find(item => item.sourceType === "NEWS_AGGREGATOR")?.sourceRelationship).toContain("independence unverified");
  });

  it("retains correction history and marks retractions terminal without hiding them by default", () => {
    const original = candidate(syntheticNewsRecord());
    const corrected = candidate(lifecycleRecord("CORRECTION", original.candidateId));
    const retractedOriginal = candidate({ ...syntheticNewsRecord(), providerRecordId: "retracted-original" });
    const retraction = candidate(lifecycleRecord("RETRACTION", retractedOriginal.candidateId));
    const model = adaptDiscoveryInbox([original, corrected, retractedOriginal, retraction], EVALUATED);
    const correctedItem = model.items.find(item => item.lifecycle === "CORRECTED");
    const retractedItem = model.items.find(item => item.lifecycle === "RETRACTED");
    expect(model.items.filter(item => item.lifecycle === "ACTIVE")).toHaveLength(2);
    expect(correctedItem?.correctionParentHeadline).toBe(original.record.headline);
    expect(retractedItem?.correctionParentHeadline).toBe(retractedOriginal.record.headline);
    expect(filterInbox(model.items, filters)).toHaveLength(4);
    expect(filterInbox(model.items, { ...filters, lifecycle: "ACTIVE" })).toHaveLength(2);
    expect(retractedItem?.authorityStatus).toBe("DISCOVERY_ONLY");
  });

  it("keeps ambiguous ticker and parent/subsidiary mentions unresolved", () => {
    const source = syntheticNewsRecord();
    const ambiguous: NewsDiscoveryRecord = { ...source, providerRecordId: "ambiguous-mentions", attributedIssuer: { ...source.attributedIssuer!, candidateId: "subsidiary-candidate", relationshipHint: "SUBSIDIARY_CANDIDATE" }, mentionedAssets: [{ candidateId: "ambiguous-asset", label: "ABC", ticker: "ABC", representation: "UNKNOWN" }] };
    const model = adaptDiscoveryInbox([candidate(ambiguous)], EVALUATED); const item = model.items[0]!;
    expect(item.issuerCandidate).toBe("Synthetic Large Company"); expect(item.issuerRelationship).toBe("SUBSIDIARY_CANDIDATE");
    expect(item.assets[0]?.ticker).toBe("ABC"); expect("canonicalAssetId" in item.assets[0]!).toBe(false); expect(item.mappingStatus).toBe("NEEDS_MAPPING");
  });

  it("retains multiple category/entity mentions and source-updated time as display-only fields", () => {
    const source = syntheticNewsRecord();
    const record: NewsDiscoveryRecord = { ...source, sourceUpdatedAt: "2026-10-01T08:30:00.000Z", eventCategories: ["CORPORATE_CRYPTO_PURCHASE_INTENT", "BOARD_AUTHORIZATION"], mentionedEntities: [...source.mentionedEntities, { candidateId: "subsidiary-mention", legalName: "Synthetic Subsidiary", jurisdiction: "US", relationshipHint: "SUBSIDIARY_CANDIDATE" }] };
    const item = adaptDiscoveryInbox([candidate(record)], EVALUATED).items[0]!;
    expect(item.categories).toEqual(["BOARD_AUTHORIZATION", "CORPORATE_CRYPTO_PURCHASE_INTENT"]);
    expect(item.entities.map(entity => entity.name)).toContain("Synthetic Subsidiary");
    expect(item.sourceUpdatedAt).toBe("2026-10-01T08:30:00.000Z");
  });

  it("drops unknown authority/status shapes and does not project raw payload, credentials or fingerprints", () => {
    const source = candidate(syntheticNewsRecord()); const raw = { ...source, status: "VERIFIED", rawPayload: "PRIVATE RAW BODY", fingerprint: "private-fingerprint", record: { ...source.record, summary: "Bearer secret-value" } };
    const model = adaptDiscoveryInbox([raw], EVALUATED);
    expect(model.state).toBe("EMPTY_BLOCKED");
    expect(JSON.stringify(model)).not.toMatch(/PRIVATE RAW BODY|private-fingerprint|secret-value|credential/i);
    const errored = adaptDiscoveryInbox([source], "not-a-time");
    expect(errored.state).toBe("SANITIZED_ERROR");
    expect(JSON.stringify(errored)).not.toMatch(/Bearer|secret-value/);
  });

  it("degrades copied, structured-cloned and serialized domain candidates to presentation-only data", () => {
    const source = candidate(syntheticNewsRecord());
    const copied = { ...source };
    const cloned = structuredClone(source);
    const serialized = JSON.parse(JSON.stringify(source)) as unknown;
    for (const value of [copied, cloned, serialized]) {
      const item = adaptDiscoveryInbox([value], EVALUATED).items[0]!;
      expect(item.capability).toBe("NON_AUTHORITATIVE_DISCOVERY_CANDIDATE");
      expect(item.authorityStatus).toBe("DISCOVERY_ONLY");
      expect("fingerprint" in item || "receiptFingerprint" in item || "providerReplayKey" in item).toBe(false);
    }
  });

  it("rejects accessors, proxies, inherited objects, symbols and sparse arrays without invoking traps", () => {
    const source = candidate(syntheticNewsRecord());
    let getterCalls = 0; let proxyTrapCalls = 0;
    const accessorRecord = { ...source.record };
    Object.defineProperty(accessorRecord, "headline", { enumerable: true, get() { getterCalls++; throw new Error("DO_NOT_READ_GETTER"); } });
    const accessorCandidate = { ...source, record: accessorRecord };
    const proxy = new Proxy([source], { get() { proxyTrapCalls++; throw new Error("DO_NOT_RUN_PROXY_TRAP"); }, ownKeys() { proxyTrapCalls++; throw new Error("DO_NOT_RUN_PROXY_TRAP"); } });
    const inherited = Object.assign(Object.create({ inherited: "unsafe" }), source);
    const symbolic = { ...source, [Symbol("extra")]: "unsafe" };
    const sparse = new Array(1) as unknown[];
    expect(adaptDiscoveryInbox([accessorCandidate], EVALUATED).items).toHaveLength(0);
    expect(adaptDiscoveryInbox(proxy, EVALUATED).state).toBe("SANITIZED_ERROR");
    expect(adaptDiscoveryInbox([inherited, symbolic, sparse], EVALUATED).items).toHaveLength(0);
    expect(getterCalls).toBe(0);
    expect(proxyTrapCalls).toBe(0);
  });

  it("sorts deterministically, assigns unique stable presentation keys and labels completion as a candidate claim", () => {
    const base = syntheticNewsRecord();
    const completed: NewsDiscoveryRecord = { ...base, providerRecordId: "ui-completion-candidate", eventCategories: ["COMPLETED_CRYPTO_PURCHASE"] };
    const same = candidate(base); const later = candidate(completed);
    const forward = adaptDiscoveryInbox([later, same, same], EVALUATED);
    const reverse = adaptDiscoveryInbox([same, later, same], EVALUATED);
    expect(forward.items.map(item => item.headline)).toEqual(reverse.items.map(item => item.headline));
    expect(new Set(forward.items.map(item => item.id)).size).toBe(forward.items.length);
    const html = renderToStaticMarkup(React.createElement(DiscoveryInbox, { model: forward }));
    expect(html).toContain("Completed crypto purchase · candidate claim");
  });

  it("renders production empty/blocked state and safe pipeline labels", () => {
    const model = emptyInbox();
    const html = renderToStaticMarkup(React.createElement(DiscoveryInbox, { model }));
    expect(html).toContain("No discovery records available"); expect(html).toContain("ACQUISITION BLOCKED");
    expect(html).toContain("NONE SELECTED"); expect(html).toContain("Discovery is the only active stage");
    expect(html).not.toMatch(/Bitcoin|buy|sell|trade|signal recommendation/i);
  });

  it("production loader stays empty without importing fixture records or reaching external systems", async () => {
    const model = await loadDiscoveryInbox();
    expect(model.state).toBe("EMPTY_BLOCKED"); expect(model.items).toEqual([]);
    expect(model.productionStatus).toBe("ACQUISITION BLOCKED"); expect(model.persistenceStatus).toBe("UNAVAILABLE");
  });

  it("fails safe on invalid filter values without hiding correction history by default", () => {
    const item = adaptDiscoveryInbox([candidate(syntheticNewsRecord())], EVALUATED).items;
    const invalid: InboxFilters = { ...filters, category: "UNKNOWN", discoveryStatus: "UNTRUSTED", from: "2026-99-99" };
    expect(inboxFiltersAreValid(invalid)).toBe(false);
    expect(filterInbox(item, invalid)).toHaveLength(1);
    expect(inboxFiltersAreValid(filters)).toBe(true);
  });

  it("renders corrected/retracted records with visible status and verification gaps", () => {
    const original = candidate(syntheticNewsRecord()); const retractTarget = candidate({ ...syntheticNewsRecord(), providerRecordId: "ui-retract-target" });
    const correction = candidate(lifecycleRecord("CORRECTION", original.candidateId)); const retraction = candidate(lifecycleRecord("RETRACTION", retractTarget.candidateId));
    const html = renderToStaticMarkup(React.createElement(DiscoveryInbox, { model: adaptDiscoveryInbox([original, correction, retractTarget, retraction], EVALUATED) }));
    expect(html).toContain("CORRECTED"); expect(html).toContain("RETRACTED"); expect(html).toContain("Retained prior record");
    expect(html).toContain("Needs mapping"); expect(html).toContain("Needs corroboration"); expect(html).toContain("DISCOVERY_ONLY");
    expect(html).not.toMatch(/BUY NOW|SELL NOW|Place order|TRADE NOW/i);
  });

  it("renders responsive candidate anchors with unique DOM IDs", () => {
    const html = renderToStaticMarkup(React.createElement(DiscoveryInbox, { model: adaptDiscoveryInbox([candidate(syntheticNewsRecord())], EVALUATED) }));
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    expect(ids.length).toBe(new Set(ids).size);
    expect(html).toContain('href="#candidate-');
  });

  it("escapes display text and degrades unsafe source links", () => {
    const record: NewsDiscoveryRecord = { ...syntheticNewsRecord(), headline: "<img src=x onerror=alert(1)>" };
    const safeModel = adaptDiscoveryInbox([candidate(record)], EVALUATED);
    const safeHtml = renderToStaticMarkup(React.createElement(DiscoveryInbox, { model: safeModel }));
    expect(safeHtml).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(safeHtml).not.toContain("<img src=x");
    expect(safeHtml).toContain('rel="noopener noreferrer"');
    const unsafeModel = { ...safeModel, items: safeModel.items.map(item => ({ ...item, sourceUrl: "javascript:alert(1)" })) } as typeof safeModel;
    const unsafeHtml = renderToStaticMarkup(React.createElement(DiscoveryInbox, { model: unsafeModel }));
    expect(unsafeHtml).not.toContain("href=\"javascript:");
    expect(unsafeHtml).toContain("Source link unavailable.");
  });
});
