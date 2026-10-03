import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  createSyntheticNewsDiscoveryCandidate, parseNewsDiscovery, compareNewsDiscoveryCandidates,
  sealDiscoveryOriginSet, isAuthenticNewsDiscoveryCandidate, isAuthenticDiscoveryOriginSet,
  NEWS_DISCOVERY_CATEGORIES, DISCOVERY_ORIGIN_SET_VERSION, DISCOVERY_FORBIDDEN_BOUNDARIES,
  rejectNewsDiscoveryAsAuthority, parseNewsDiscoveryProduction,
  type NewsDiscoveryRecord, type NewsDiscoveryCandidate,
} from "../../src/domain/intelligence/event-intelligence-news-discovery";
import { NEWS_DISCOVERY_PRODUCTION } from "../../src/domain/intelligence/event-intelligence-news-discovery-production";
import config from "../../config/intelligence/event-intelligence-news-discovery.production.json";
import { isAuthenticMappedNonAuthoritativeEventClaim, isAuthenticEventIssuerMappingAuthority, isAuthenticEventAssetMentionBinding, assembleMappedNonAuthoritativeEventClaim, rejectMappedClaimAsEventAuthority } from "../../src/domain/intelligence/event-intelligence-mapping-authority";
import { createEventClaimEvidence, isAuthenticEventSourceOrigin, isAuthenticEventClaimEvidence, rejectEligibilityAsEventAuthorityOrPersistence } from "../../src/domain/intelligence/event-intelligence-corroboration-authority-policy";
import { isAuthenticSecEdgar8kFixtureResult, isAuthenticSecEdgar8kFixtureClaim, rejectSecEdgar8kFixtureClaimAsAuthority } from "../../src/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { isTrustedSecRuntimeBatch } from "../../src/domain/intelligence/sec-edgar-event-source-provenance-runtime";
import { DISCOVERY_EVALUATION_AT as now, syntheticNewsRecord, syntheticAggregatorRecord, syntheticWireRecord } from "../fixtures/event-intelligence-news-discovery";

function create(record: NewsDiscoveryRecord = syntheticNewsRecord()): NewsDiscoveryCandidate {
  const result = createSyntheticNewsDiscoveryCandidate(record, now);
  expect(result).not.toBeNull(); return result!;
}
function seal(members: readonly unknown[], overrides: Record<string, unknown> = {}) {
  return sealDiscoveryOriginSet({ contractVersion: DISCOVERY_ORIGIN_SET_VERSION, members, declaredMemberCount: members.length, recordedAt: now, ...overrides });
}
function deepFrozen(value: unknown): void {
  if (!value || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) deepFrozen(child);
}
function lifecycle(parent: NewsDiscoveryCandidate, kind: "CORRECTION" | "RETRACTION"): NewsDiscoveryRecord {
  return { ...syntheticNewsRecord(), providerRecordId: kind.toLowerCase(), canonicalSourceUrl: `https://issuer.test/releases/${kind.toLowerCase()}`, headline: `Synthetic ${kind.toLowerCase()} of proposed purchase`, publishedAt: "2026-10-02T08:00:00.000Z", discoveredAt: "2026-10-02T09:00:00.000Z", receivedAt: "2026-10-02T09:00:01.000Z", recordedAt: "2026-10-02T09:00:02.000Z", eventCategories: ["CORRECTION_OR_RETRACTION"], lifecycleHint: { kind, targetCandidateId: parent.candidateId } };
}

describe("news discovery candidate, origin and lifecycle contract", () => {
  it("A: intent/expected closing never infers completion, mapping or authority", () => {
    const c = create();
    expect(c.status).toBe("NON_AUTHORITATIVE_DISCOVERY_CANDIDATE");
    expect(c.record.eventCategories).toEqual(["CORPORATE_CRYPTO_PURCHASE_INTENT"]);
    expect(c).not.toHaveProperty("completionDate");
    expect([c.eventAuthorityEligible, c.mappingAuthorityEligible, c.persistenceAuthorityEligible, c.signalEligible, c.tradingEligible]).toEqual([false, false, false, false, false]);
    expect(c.record.provenance).toBe("SYNTHETIC"); deepFrozen(c);
  });
  it.each(NEWS_DISCOVERY_CATEGORIES)("models explicit candidate classification %s without authority", category => {
    expect(create({ ...syntheticNewsRecord(), eventCategories: [category] }).record.eventCategories).toEqual([category]);
  });
  it("B: issuer + aggregator + wire are one declared origin and zero independent authority origins", () => {
    const candidates = [create(), create(syntheticAggregatorRecord()), create(syntheticWireRecord())];
    const s = seal(candidates)!;
    expect(s.groups).toHaveLength(1); expect(s.groups[0]!.candidateIds).toHaveLength(3);
    expect(s.independentAuthorityOriginCount).toBe(0); expect(s.groups[0]!.authorityOriginCount).toBe(0);
    expect(s.members.map(item => item.ordinal)).toEqual([0, 1, 2]); deepFrozen(s);
    expect(seal([...candidates].reverse())!.fingerprint).toBe(s.fingerprint);
    expect(compareNewsDiscoveryCandidates(candidates[0], candidates[2])).toBe("DECLARED_SHARED_ORIGIN");
    expect(compareNewsDiscoveryCandidates(candidates[0], candidates[1])).toBe("SAME_CANONICAL_URL");
  });
  it("C: identical text/time does not merge two journalistic origins or prove independence", () => {
    const a = create(syntheticAggregatorRecord());
    const bRecord = syntheticAggregatorRecord();
    const p = { publisherId: "synthetic-journal", displayName: "Synthetic Journal" };
    const b = create({ ...bRecord, providerId: "gdelt-discovery", providerRecordId: "journal-record", canonicalSourceUrl: "https://journal.test/story", publisher: p, origin: { ...bRecord.origin, originalPublisher: p, originalPublicationId: "journal-story", originalSourceUrl: "https://journal.test/story" } });
    expect(a.record.headline).toBe(b.record.headline);
    expect(compareNewsDiscoveryCandidates(a, b)).toBe("DISTINCT_UNVERIFIED_ORIGINS");
    expect(seal([a, b])!.groups).toHaveLength(2); expect(seal([a, b])!.independentAuthorityOriginCount).toBe(0);
  });
  it("unresolved origins remain separate singleton groups even with the same URL", () => {
    const r = syntheticAggregatorRecord();
    const unresolved = { ...r, origin: { distribution: "UNRESOLVED" as const, originalPublisher: null, originalPublicationId: null, originalSourceUrl: null, distributor: null, attributionBasis: "UNKNOWN" as const } };
    const a = create(unresolved), b = create({ ...unresolved, providerId: "gdelt-discovery" });
    expect(compareNewsDiscoveryCandidates(a, b)).toBe("SAME_CANONICAL_URL");
    expect(seal([a, b])!.groups.map(item => item.basis)).toEqual(["UNRESOLVED_SINGLETON", "UNRESOLVED_SINGLETON"]);
  });
  it("D/E: append-only correction/retraction keeps original immutable and cannot signal", () => {
    const original = create(); const before = JSON.stringify(original);
    const correction = create(lifecycle(original, "CORRECTION"));
    const corrected = seal([original, correction])!;
    expect(corrected.members.find(item => item.candidate === original)!.lifecycleStatus).toBe("CORRECTED");
    const retract = create({ ...lifecycle(correction, "RETRACTION"), publishedAt: "2026-10-02T10:00:00.000Z", discoveredAt: "2026-10-02T11:00:00.000Z", receivedAt: "2026-10-02T11:00:01.000Z", recordedAt: "2026-10-02T11:00:02.000Z" });
    const retracted = seal([retract, original, correction])!;
    expect(retracted.members.every(item => item.lifecycleStatus === "RETRACTED")).toBe(true);
    expect(JSON.stringify(original)).toBe(before); expect(retracted.members).toHaveLength(3);
    expect(rejectNewsDiscoveryAsAuthority(retracted, "SIGNAL")).toBeNull();
    expect(seal([correction])).toBeNull(); // no missing correction parent
    expect(seal([original, correction, create({ ...lifecycle(original, "RETRACTION"), providerRecordId: "fork" })])).toBeNull();
  });
  it("F/G: ticker, ETH/WETH/native/wrapped/bridged, parent and subsidiary remain separate mentions", () => {
    const r = syntheticNewsRecord();
    const c = create({ ...r, mentionedAssets: ["NATIVE", "WRAPPED", "BRIDGED"].map((representation, i) => ({ candidateId: `asset-${i}`, label: i === 1 ? "WETH" : "ETH", ticker: "ETH", representation: representation as "NATIVE" | "WRAPPED" | "BRIDGED" })), mentionedEntities: ["PARENT_CANDIDATE", "SUBSIDIARY_CANDIDATE"].map((relationshipHint, i) => ({ candidateId: `entity-${i}`, legalName: "Synthetic Group", jurisdiction: "US", relationshipHint: relationshipHint as "PARENT_CANDIDATE" | "SUBSIDIARY_CANDIDATE" })) });
    expect(c.record.mentionedAssets).toHaveLength(3); expect(c.record.mentionedEntities).toHaveLength(2);
    expect(JSON.stringify(c)).not.toContain("canonicalAssetId"); expect(c.mappingAuthorityEligible).toBe(false);
  });
  it("retraction is terminal and unrelated/earlier correction links cannot be sealed", () => {
    const original = create(), retraction = create(lifecycle(original, "RETRACTION"));
    const later = create({ ...lifecycle(retraction, "CORRECTION"), publishedAt: "2026-10-03T08:00:00.000Z", discoveredAt: "2026-10-03T09:00:00.000Z", receivedAt: "2026-10-03T09:00:01.000Z", recordedAt: "2026-10-03T09:00:02.000Z" });
    expect(seal([original, retraction, later])).toBeNull();
    const unrelated = create({ ...lifecycle(original, "CORRECTION"), origin: { ...original.record.origin, originalPublicationId: "unrelated-release" } });
    expect(seal([original, unrelated])).toBeNull();
    const early = create({ ...lifecycle(original, "CORRECTION"), publishedAt: original.record.publishedAt });
    expect(seal([original, early])).toBeNull();
  });
  it("sealing rejects contradictory publisher names and declared publication URLs", () => {
    const original = create();
    const record = syntheticNewsRecord();
    const p = { ...record.publisher, displayName: "Different Synthetic Name" };
    const other = create({ ...record, providerRecordId: "second-name", publisher: p, origin: { ...record.origin, originalPublisher: p } });
    expect(seal([original, other])).toBeNull();
    const urlConflict = create({ ...record, providerRecordId: "second-url", canonicalSourceUrl: "https://issuer.test/releases/other", origin: { ...record.origin, originalSourceUrl: "https://issuer.test/releases/other" } });
    expect(seal([original, urlConflict])).toBeNull();
  });
  it("J: replay/source identities are receipt independent; receipt identity is not", () => {
    const a = create(); const b = create({ ...syntheticNewsRecord(), discoveredAt: "2026-10-02T09:00:00.000Z", receivedAt: "2026-10-02T09:00:01.000Z", recordedAt: "2026-10-02T09:00:02.000Z" });
    expect(b.candidateId).toBe(a.candidateId); expect(b.sourceFingerprint).toBe(a.sourceFingerprint);
    expect(b.receiptId).not.toBe(a.receiptId); expect(compareNewsDiscoveryCandidates(a, b)).toBe("SAME_PROVIDER_REPLAY");
    expect(seal([a, b])).toBeNull(); // select one observation for a sealed set; never duplicate evidence
    expect(seal([a])!.fingerprint).toBe(seal([b])!.fingerprint);
    const annotated = create({ ...syntheticNewsRecord(), recordedAt: "2026-10-03T10:00:00.000Z" });
    expect(annotated.receiptId).toBe(a.receiptId); expect(annotated.fingerprint).toBe(a.fingerprint);
    const changed = create({ ...syntheticNewsRecord(), headline: "Synthetic amended plan" });
    expect(changed.sourceFingerprint).not.toBe(a.sourceFingerprint);
    expect(compareNewsDiscoveryCandidates(a, changed)).toBe("PROVIDER_RECORD_MATERIAL_CONFLICT"); expect(seal([a, changed])).toBeNull();
  });
  it("ordering is deterministic with no locale dependency and snapshots do not alias caller arrays", () => {
    const r = syntheticNewsRecord();
    const input = { ...r, eventCategories: ["BOARD_AUTHORIZATION", "CORPORATE_CRYPTO_PURCHASE_INTENT"], mentionedAssets: [{ ...r.mentionedAssets[0]!, candidateId: "z" }, { ...r.mentionedAssets[0]!, candidateId: "a" }] };
    const a = createSyntheticNewsDiscoveryCandidate(input, now)!;
    input.mentionedAssets[0]!.label = "Changed caller label";
    const b = create({ ...r, eventCategories: ["CORPORATE_CRYPTO_PURCHASE_INTENT", "BOARD_AUTHORIZATION"], mentionedAssets: [{ ...r.mentionedAssets[0]!, candidateId: "a" }, { ...r.mentionedAssets[0]!, candidateId: "z" }] });
    expect(a.fingerprint).toBe(b.fingerprint); expect(a.record.mentionedAssets[1]!.label).toBe("Bitcoin");
    expect(a.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("strict trust and authority boundaries", () => {
  it("parser results have no runtime trust; only the synthetic fixture constructor produces candidate trust", () => {
    const parsed = parseNewsDiscovery(syntheticNewsRecord(), now);
    expect(parsed.status).toBe("VALID"); if (parsed.status !== "VALID") return;
    expect(isAuthenticNewsDiscoveryCandidate(parsed.candidate)).toBe(false); expect(seal([parsed.candidate])).toBeNull();
  });
  it.each(["spread", "json", "clone", "fabricated"])("H: %s loses trust", mode => {
    const a = create();
    const copied = mode === "spread" ? { ...a } : mode === "json" ? JSON.parse(JSON.stringify(a)) : mode === "clone" ? structuredClone(a) : { status: a.status, candidateId: a.candidateId };
    expect(isAuthenticNewsDiscoveryCandidate(copied)).toBe(false); expect(seal([copied])).toBeNull(); expect(compareNewsDiscoveryCandidates(a, copied)).toBe("UNTRUSTED");
    const set = seal([a])!; expect(isAuthenticDiscoveryOriginSet(set)).toBe(true); expect(isAuthenticDiscoveryOriginSet(structuredClone(set))).toBe(false);
  });
  it.each(DISCOVERY_FORBIDDEN_BOUNDARIES)("discovery denied at %s", boundary => expect(rejectNewsDiscoveryAsAuthority(create(), boundary)).toBeNull());
  it("existing SEC, issuer/asset mapping and corroboration trust gates reject discovery", () => {
    const c = create();
    for (const guard of [isAuthenticSecEdgar8kFixtureResult, isAuthenticSecEdgar8kFixtureClaim, isAuthenticMappedNonAuthoritativeEventClaim, isAuthenticEventIssuerMappingAuthority, isAuthenticEventAssetMentionBinding, isAuthenticEventSourceOrigin, isAuthenticEventClaimEvidence, isTrustedSecRuntimeBatch]) expect(guard(c)).toBe(false);
    type MappingInput = Parameters<typeof assembleMappedNonAuthoritativeEventClaim>[0];
    expect(assembleMappedNonAuthoritativeEventClaim({ sourceResult: c, claim: c, issuer: c, asset: c, mappingAsOf: now } as unknown as MappingInput)).toBeNull();
    expect(createEventClaimEvidence(c as unknown as Parameters<typeof createEventClaimEvidence>[0], c as unknown as Parameters<typeof createEventClaimEvidence>[1])).toBeNull();
    expect(rejectMappedClaimAsEventAuthority(c)).toBeNull(); expect(rejectEligibilityAsEventAuthorityOrPersistence(c)).toBeNull(); expect(rejectSecEdgar8kFixtureClaimAsAuthority(c)).toBeNull();
  });
  it("no transport, persistence, environment or credential imports/operations in discovery modules", () => {
    for (const path of ["event-intelligence-news-discovery.ts", "event-intelligence-news-discovery-production.ts"]) {
      const code = readFileSync(new URL(`../../src/domain/intelligence/${path}`, import.meta.url), "utf8");
      expect(code).not.toMatch(/(?:process\.env|fetch\(|node:(?:http|https|dns)|infrastructure\/|unit.of.work|repository|resolveCredential)/i);
    }
  });
  it.each(["root", "publisher", "origin", "entities", "entity", "assets", "asset", "categories", "hint"])("I: Proxy in %s is rejected with zero traps", location => {
    let traps = 0;
    const proxy = (value: object) => new Proxy(value, { get: () => { traps++; throw new Error("sensitive-fixture"); }, getPrototypeOf: () => { traps++; throw new Error("sensitive-fixture"); }, ownKeys: () => { traps++; throw new Error("sensitive-fixture"); }, getOwnPropertyDescriptor: () => { traps++; throw new Error("sensitive-fixture"); } });
    const r = structuredClone(syntheticNewsRecord()) as unknown as Record<string, unknown>;
    if (location === "root") expect(parseNewsDiscovery(proxy(r), now).status).toBe("INVALID");
    else {
      const key = ({ publisher: "publisher", origin: "origin", entities: "mentionedEntities", entity: "mentionedEntities", assets: "mentionedAssets", asset: "mentionedAssets", categories: "eventCategories", hint: "lifecycleHint" } as Record<string, string>)[location]!;
      if (location === "entity" || location === "asset") (r[key] as object[])[0] = proxy((r[key] as object[])[0]!); else r[key] = proxy(r[key] as object);
      expect(parseNewsDiscovery(r, now).status).toBe("INVALID");
    }
    expect(traps).toBe(0);
  });
  it("I: accessors, symbols, inherited/nonplain shapes and sparse/custom arrays fail without getters", () => {
    let calls = 0;
    const r = { ...syntheticNewsRecord() };
    Object.defineProperty(r, "headline", { enumerable: true, get: () => { calls++; return "sensitive-fixture"; } });
    expect(parseNewsDiscovery(r, now)).toEqual({ status: "INVALID", code: "NEWS_DISCOVERY_INVALID" }); expect(calls).toBe(0);
    for (const bad of [{ ...syntheticNewsRecord(), [Symbol("extra")]: true }, Object.assign(Object.create({ extra: 1 }), syntheticNewsRecord()), Object.assign(Object.create(null), syntheticNewsRecord()), { ...syntheticNewsRecord(), mentionedEntities: new Array(1) }, { ...syntheticNewsRecord(), eventCategories: Object.assign(["BOARD_AUTHORIZATION"], { extra: 1 }) }]) expect(parseNewsDiscovery(bad, now).status).toBe("INVALID");
  });
});

const invalidRecords: [string, (r: NewsDiscoveryRecord) => unknown][] = [
  ["unknown root field", r => ({ ...r, extra: true })],
  ["unknown nested field", r => ({ ...r, publisher: { ...r.publisher, extra: true } })],
  ["blank id", r => ({ ...r, providerRecordId: "" })], ["trimmed id", r => ({ ...r, providerRecordId: " record" })],
  ["URL id", r => ({ ...r, providerRecordId: "https://issuer.test" })], ["secret id", r => ({ ...r, providerRecordId: "api-key-value" })],
  ["noncanonical id", r => ({ ...r, providerRecordId: "RECORD" })], ["traversal id", r => ({ ...r, providerRecordId: "../record" })],
  ["wrong source/provider", r => ({ ...r, providerId: "newsapi-discovery" })], ["real provenance", r => ({ ...r, provenance: "OBSERVED" })],
  ["authority upgrade", r => ({ ...r, authorityStatus: "READY" })], ["HTTP URL", r => ({ ...r, canonicalSourceUrl: "http://issuer.test/article" })],
  ["credential URL", r => ({ ...r, canonicalSourceUrl: "https://user:pass@issuer.test/article" })], ["fragment URL", r => ({ ...r, canonicalSourceUrl: `${r.canonicalSourceUrl}#article` })],
  ["query URL", r => ({ ...r, canonicalSourceUrl: `${r.canonicalSourceUrl}?api_key=value` })], ["port URL", r => ({ ...r, canonicalSourceUrl: "https://issuer.test:443/article" })],
  ["encoded traversal", r => ({ ...r, canonicalSourceUrl: "https://issuer.test/%2e%2e/article" })], ["literal traversal", r => ({ ...r, canonicalSourceUrl: "https://issuer.test/../article" })],
  ["noncanonical host", r => ({ ...r, canonicalSourceUrl: "https://ISSUER.test/article" })], ["nonfixture URL", r => ({ ...r, canonicalSourceUrl: "https://issuer.com/article" })],
  ["invalid host label", r => ({ ...r, canonicalSourceUrl: "https://-issuer.test/article" })], ["overlong host label", r => ({ ...r, canonicalSourceUrl: `https://${"a".repeat(64)}.test/article` })],
  ["issuer candidate contradiction", r => ({ ...r, attributedIssuer: { ...r.attributedIssuer!, legalName: "Conflicting Synthetic Name" } })],
  ["publisher/origin conflict", r => ({ ...r, publisher: { ...r.publisher, publisherId: "other-publisher" } })],
  ["publisher name conflict", r => ({ ...r, origin: { ...r.origin, originalPublisher: { ...r.publisher, displayName: "Different" } } })],
  ["unknown origin conflict", r => ({ ...r, origin: { ...r.origin, distribution: "UNRESOLVED" } })],
  ["future publication", r => ({ ...r, publishedAt: "2026-10-04T00:00:00.000Z" })], ["future receipt", r => ({ ...r, receivedAt: "2026-10-04T00:00:00.000Z" })],
  ["invalid calendar", r => ({ ...r, publishedAt: "2026-02-30T00:00:00.000Z" })], ["nonUTC timestamp", r => ({ ...r, publishedAt: "2026-10-01T08:00:00+00:00" })],
  ["updated before publication", r => ({ ...r, sourceUpdatedAt: "2026-09-01T08:00:00.000Z" })], ["updated after receipt", r => ({ ...r, sourceUpdatedAt: "2026-10-02T08:00:00.000Z" })],
  ["control headline", r => ({ ...r, headline: "Synthetic\nheadline" })], ["format summary", r => ({ ...r, summary: "Synthetic\u202etext" })],
  ["unpaired surrogate", r => ({ ...r, headline: "Synthetic\ud800" })], ["nonNFC text", r => ({ ...r, headline: "Synthe\u0301tic" })],
  ["overlong headline", r => ({ ...r, headline: "h".repeat(513) })], ["overlong summary", r => ({ ...r, summary: "s".repeat(2049) })],
  ["overlong locator", r => ({ ...r, sourceLocator: `article:${"l".repeat(257)}` })], ["locator URL", r => ({ ...r, sourceLocator: "https://issuer.test/article" })],
  ["duplicate entities", r => ({ ...r, mentionedEntities: [...r.mentionedEntities, ...r.mentionedEntities] })], ["duplicate assets", r => ({ ...r, mentionedAssets: [...r.mentionedAssets, ...r.mentionedAssets] })],
  ["over32 entities", r => ({ ...r, mentionedEntities: Array.from({ length: 33 }, (_, i) => ({ ...r.mentionedEntities[0], candidateId: `candidate-${i}` })) })],
  ["over32 assets", r => ({ ...r, mentionedAssets: Array.from({ length: 33 }, (_, i) => ({ ...r.mentionedAssets[0], candidateId: `candidate-${i}` })) })],
  ["duplicate categories", r => ({ ...r, eventCategories: ["BOARD_AUTHORIZATION", "BOARD_AUTHORIZATION"] })], ["no category", r => ({ ...r, eventCategories: [] })],
  ["unknown category", r => ({ ...r, eventCategories: ["PROVEN_PURCHASE"] })], ["probability confidence", r => ({ ...r, discoveryConfidence: 0.99 })],
  ["invalid language", r => ({ ...r, language: "EN" })], ["invalid jurisdiction", r => ({ ...r, jurisdiction: "usa" })],
  ["bad lifecycle target", r => ({ ...r, lifecycleHint: { kind: "CORRECTION", targetCandidateId: "api-key" } })],
];
describe("fail-closed parser and production config", () => {
  it.each(invalidRecords)("rejects %s without exposing input", (_name, mutate) => {
    expect(parseNewsDiscovery(mutate(syntheticNewsRecord()), now)).toEqual({ status: "INVALID", code: "NEWS_DISCOVERY_INVALID" });
  });
  it("exact text limits succeed", () => {
    expect(create({ ...syntheticNewsRecord(), headline: "h".repeat(512), summary: "s".repeat(2048), sourceLocator: `article:${"a".repeat(248)}` })).toBeTruthy();
  });
  it("sealed set rejects count mismatch, duplicate/missing/mutated members and unknown fields", () => {
    const a = create();
    expect(seal([a], { declaredMemberCount: 0 })).toBeNull(); expect(seal([a, a])).toBeNull(); expect(seal([])).toBeNull();
    expect(seal([a], { extra: true })).toBeNull(); expect(seal([a], { recordedAt: "2026-09-01T00:00:00.000Z" })).toBeNull();
  });
  it("sealed sets enforce the exact 64-member limit and reject unsafe set shapes without traps", () => {
    const members = Array.from({ length: 65 }, (_, i) => create({ ...syntheticNewsRecord(), providerRecordId: `record-${i}` }));
    expect(seal(members.slice(0, 64))!.declaredMemberCount).toBe(64); expect(seal(members)).toBeNull();
    let traps = 0;
    const proxy = new Proxy(members.slice(0, 1), { get: () => { traps++; throw new Error("sensitive"); }, ownKeys: () => { traps++; throw new Error("sensitive"); } });
    expect(sealDiscoveryOriginSet({ contractVersion: DISCOVERY_ORIGIN_SET_VERSION, members: proxy, declaredMemberCount: 1, recordedAt: now })).toBeNull(); expect(traps).toBe(0);
  });
  it("inherited Object.prototype pollution is rejected without executing the getter", () => {
    let getterCalls = 0;
    Object.defineProperty(Object.prototype, "newsDiscoveryUnsafe", { configurable: true, get: () => { getterCalls++; return "sensitive"; } });
    try { expect(parseNewsDiscovery(syntheticNewsRecord(), now).status).toBe("INVALID"); } finally { delete (Object.prototype as { newsDiscoveryUnsafe?: string }).newsDiscoveryUnsafe; }
    expect(getterCalls).toBe(0);
  });
  it("production has an empty stack, all eight operations blocked and all seven usage approvals denied", () => {
    expect(NEWS_DISCOVERY_PRODUCTION.status).toBe("BLOCKED_BACKEND_UNAPPROVED"); expect(NEWS_DISCOVERY_PRODUCTION.selectedProviders).toEqual([]); expect(NEWS_DISCOVERY_PRODUCTION.selectedSources).toEqual([]);
    expect(Object.values(NEWS_DISCOVERY_PRODUCTION.operations)).toEqual(Array(8).fill("BLOCKED")); expect(NEWS_DISCOVERY_PRODUCTION.usageApprovals).toHaveLength(7); expect(NEWS_DISCOVERY_PRODUCTION.usageApprovals.every(item => item.approval === "NOT_APPROVED")).toBe(true); deepFrozen(NEWS_DISCOVERY_PRODUCTION);
  });
  it.each(["status", "stack", "operation", "approval", "duplicate", "credentials", "unknownNested", "proxy"])("production rejects %s upgrade/unsafe material", mode => {
    const c = structuredClone(config);
    const bad = mode === "status" ? { ...c, status: "READY" } : mode === "stack" ? { ...c, selectedProviders: ["newsapi-discovery"] } : mode === "operation" ? { ...c, operations: { ...c.operations, acquisition: "READY" } } : mode === "approval" ? { ...c, usageApprovals: c.usageApprovals.map(item => ({ ...item, approval: "APPROVED" })) } : mode === "duplicate" ? { ...c, usageApprovals: c.usageApprovals.map(() => c.usageApprovals[0]) } : mode === "credentials" ? { ...c, credentialRef: "api-key" } : mode === "unknownNested" ? { ...c, operations: { ...c.operations, extra: "BLOCKED" } } : new Proxy(c, { getPrototypeOf: () => { throw new Error("trap must not run"); } });
    expect(parseNewsDiscoveryProduction(bad)).toBeNull();
  });
});
