import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  // GDELT qualification contract tests
  GDELT_DOC_BLOCKERS, GDELT_DOC_QUERY_PROFILES, GDELT_DOC_REQUEST_PROFILE,
  buildGdeltDocRequestQuery, getSyntheticGdeltDocProjectionQualification, gdeltDocQueryProfileFingerprint, gdeltDocRequestFingerprint,
  isAuthenticGdeltDocQualification, parseGdeltDocQualification, parseGdeltSyntheticResponse,
  projectGdeltDocDiscovery, rejectGdeltDiscoveryAsAuthority,
} from "../../src/domain/intelligence/event-intelligence-gdelt-doc-source-qualification";
import { createGdeltDocResponseForTest } from "test-only:gdelt-doc-response";
import { GDELT_DOC_PRODUCTION_CONFIG, parseGdeltDocProductionConfig } from "../../src/domain/intelligence/event-intelligence-gdelt-doc-source-qualification-production";
import { isAuthenticNewsDiscoveryCandidate, rejectNewsDiscoveryAsAuthority } from "../../src/domain/intelligence/event-intelligence-news-discovery";
import { isAuthenticEventIssuerMappingAuthority, isAuthenticEventAssetMentionBinding, isAuthenticMappedNonAuthoritativeEventClaim } from "../../src/domain/intelligence/event-intelligence-mapping-authority";
import { isAuthenticEventSourceOrigin, isAuthenticEventClaimEvidence, rejectEligibilityAsEventAuthorityOrPersistence } from "../../src/domain/intelligence/event-intelligence-corroboration-authority-policy";
import { GDELT_EVALUATION_AS_OF, syntheticGdeltDocResponse } from "../fixtures/event-intelligence-gdelt-doc";

const qualification = getSyntheticGdeltDocProjectionQualification();
const validResponse = () => createGdeltDocResponseForTest(syntheticGdeltDocResponse(), GDELT_EVALUATION_AS_OF);
const project = (response = validResponse()) => projectGdeltDocDiscovery({ qualification, response }, GDELT_EVALUATION_AS_OF);
const deeplyFrozen = (value: unknown): boolean => !value || typeof value !== "object" || (Object.isFrozen(value) && Object.values(value).every(deeplyFrozen));

describe("GDELT DOC qualification profiles", () => {
  it("pins exact endpoint, canonical query order, budgets, and six fixed recall profiles", () => {
    expect(GDELT_DOC_REQUEST_PROFILE).toMatchObject({ hostname: "api.gdeltproject.org", path: "/api/v2/doc/doc", method: "GET", mode: "artlist", format: "json", maxRecords: 25, retries: 0, redirects: "FORBIDDEN", credentials: "FORBIDDEN" });
    expect(GDELT_DOC_QUERY_PROFILES.map(x => x.category)).toEqual(["CORPORATE_CRYPTO_PURCHASE_INTENT", "COMPLETED_CRYPTO_PURCHASE", "ASSET_OR_COMPANY_ACQUISITION", "CORRECTION_OR_RETRACTION", "TREASURY_POLICY_CHANGE", "STRATEGIC_PARTNERSHIP"]);
    expect(new Set(GDELT_DOC_QUERY_PROFILES.map(x => x.id)).size).toBe(6);
    const query = buildGdeltDocRequestQuery(GDELT_DOC_QUERY_PROFILES[0].id, "2026-10-03T07:35:00.000Z", "2026-10-03T08:00:00.000Z")!;
    expect(query.split("&").map(x => decodeURIComponent(x.split("=")[0]!))).toEqual([...GDELT_DOC_REQUEST_PROFILE.canonicalQueryOrder]);
    expect(buildGdeltDocRequestQuery("caller-query", "2026-10-03T07:35:00.000Z", "2026-10-03T08:00:00.000Z")).toBeNull();
    expect(buildGdeltDocRequestQuery(GDELT_DOC_QUERY_PROFILES[0].id, "2026-10-03T00:00:00.000Z", "2026-10-01T00:00:00.000Z")).toBeNull();
    expect(GDELT_DOC_QUERY_PROFILES.every(p => p.query.length <= 512 && gdeltDocQueryProfileFingerprint(p.id))).toBe(true);
    expect(deeplyFrozen(GDELT_DOC_QUERY_PROFILES)).toBe(true);
  });
  it("keeps parser outputs untrusted and recordedAt outside material fingerprint", () => {
    expect(isAuthenticGdeltDocQualification(qualification)).toBe(true);
    const input = { ...qualification };
    const first = parseGdeltDocQualification(input);
    expect(first.status).toBe("VALID"); if (first.status !== "VALID") return;
    expect(isAuthenticGdeltDocQualification(first.qualification)).toBe(false);
    expect(first.qualification.fingerprint).toBe(qualification.fingerprint);
    const later = parseGdeltDocQualification({ ...input, recordedAt: "2026-10-04T00:00:00.000Z" });
    expect(later.status).toBe("VALID"); if (later.status === "VALID") expect(later.qualification).toMatchObject({ recordedAt: "2026-10-04T00:00:00.000Z" });
    for (const copy of [{ ...qualification }, structuredClone(qualification), JSON.parse(JSON.stringify(qualification)), { status: qualification.status, fingerprint: qualification.fingerprint }]) expect(isAuthenticGdeltDocQualification(copy)).toBe(false);
    expect(qualification.status).toBe("PARTIAL_DISCOVERY_ONLY"); expect(qualification.fingerprint).toMatch(/^[a-f0-9]{64}$/); expect(GDELT_DOC_BLOCKERS).toContain("DOC_JSON_NATIVE_FIELD_SCHEMA_NOT_PINNED");
    expect(deeplyFrozen(qualification)).toBe(true);
  });
  it.each(["uppercase fingerprint", "wrong fingerprint", "status contradiction", "provider mismatch", "duplicate query key", "approval upgrade", "missing blocker"]) ("qualification rejects %s", mode => {
    const material = structuredClone(qualification) as Record<string, unknown>;
    const bad = mode === "uppercase fingerprint" ? { ...material, fingerprint: String(material.fingerprint).toUpperCase() } :
      mode === "wrong fingerprint" ? { ...material, fingerprint: "0".repeat(64) } :
      mode === "status contradiction" ? { ...material, status: "QUALIFIED" } :
      mode === "provider mismatch" ? { ...material, providerId: "newsapi" } :
      mode === "duplicate query key" ? { ...material, queryKeys: ["query", "query", "format", "maxrecords", "startdatetime", "enddatetime", "sort"] } :
      mode === "approval upgrade" ? { ...material, commercialUse: "APPROVED" } :
      { ...material, blockers: ["DOC_JSON_NATIVE_FIELD_SCHEMA_NOT_PINNED"] };
    expect(parseGdeltDocQualification(bad).status).toBe("INVALID");
  });
  it.each(["unknown", "symbol", "accessor", "inherited", "proxy", "sparse", "array-prototype"]) ("rejects unsafe qualification shape: %s", mode => {
    const input = { ...qualification } as Record<PropertyKey, unknown>;
    let effects = 0; let unsafe: unknown = input;
    if (mode === "unknown") unsafe = { ...input, extra: true };
    if (mode === "symbol") unsafe = { ...input, [Symbol("x")]: true };
    if (mode === "accessor") Object.defineProperty(input, "providerId", { enumerable: true, get: () => { effects++; return "gdelt-discovery"; } });
    if (mode === "inherited") unsafe = Object.assign(Object.create({ extra: true }), input);
    if (mode === "proxy") unsafe = new Proxy(input, { getPrototypeOf: () => { effects++; throw Error("secret"); }, ownKeys: () => { effects++; throw Error("secret"); } });
    if (mode === "sparse" || mode === "array-prototype") { const altered = structuredClone(input) as Record<string, unknown>; const refs = altered.evidenceReferences as unknown[]; if (mode === "sparse") delete refs[0]; else Object.setPrototypeOf(refs, {}); unsafe = altered; }
    expect(parseGdeltDocQualification(unsafe).status).toBe("INVALID"); expect(effects).toBe(0);
  });
});

describe("synthetic DOC response and projection guard", () => {
  it("A/B: intent and completed-looking query profiles still project only non-authoritative candidates", () => {
    const intent = project(); expect(intent.status).toBe("PROJECTED"); if (intent.status !== "PROJECTED") return;
    expect(intent.candidates[0]).toMatchObject({ status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE", completionProven: false, issuerMapping: "UNRESOLVED", assetMapping: "UNRESOLVED", eventAuthorityEligible: false, corroborationEligible: false, persistenceEligible: false, signalEligible: false, tradingEligible: false });
    const p = GDELT_DOC_QUERY_PROFILES[1], start = "2026-10-03T07:35:00.000Z", end = "2026-10-03T08:00:00.000Z";
    const response = createGdeltDocResponseForTest(syntheticGdeltDocResponse({ queryProfileId: p.id, queryProfileFingerprint: gdeltDocQueryProfileFingerprint(p.id)!, queryFingerprint: gdeltDocRequestFingerprint(p.id, start, end)!, records: [{ ...syntheticGdeltDocResponse().records[0]!, title: "Company completed its Bitcoin purchase" }] }), GDELT_EVALUATION_AS_OF);
    const completed = project(response); expect(completed.status).toBe("PROJECTED"); if (completed.status === "PROJECTED") expect(completed.candidates[0]?.completionProven).toBe(false);
  });
  it("C/D/I: exact duplicate source material deduplicates and receipt variation leaves source identity stable", () => {
    const raw = syntheticGdeltDocResponse();
    const duplicate = createGdeltDocResponseForTest({ ...raw, records: [raw.records[0], { ...raw.records[0]!, providerSeenAt: "2026-10-03T06:58:30.000Z" }] }, GDELT_EVALUATION_AS_OF);
    expect(duplicate?.records).toHaveLength(1);
    const first = project(duplicate); const later = project(createGdeltDocResponseForTest({ ...raw, receivedAt: "2026-10-03T07:59:30.000Z" }, GDELT_EVALUATION_AS_OF));
    expect(first.status).toBe("PROJECTED"); expect(later.status).toBe("PROJECTED");
    if (first.status === "PROJECTED" && later.status === "PROJECTED") { expect(first.candidates[0]?.sourceMaterialFingerprint).toBe(later.candidates[0]?.sourceMaterialFingerprint); expect(first.candidates[0]?.receivedAt).not.toBe(later.candidates[0]?.receivedAt); expect(first.candidates[0]?.receiptFingerprint).not.toBe(later.candidates[0]?.receiptFingerprint); }
  });
  it("E/F/G: similar titles with different source URLs remain separate and unmapped", () => {
    const raw = syntheticGdeltDocResponse(), response = createGdeltDocResponseForTest({ ...raw, records: [raw.records[0], { ...raw.records[0]!, articleUrl: "https://other.example/article-1", sourceDomain: "other.example" }] }, GDELT_EVALUATION_AS_OF);
    const result = project(response); expect(result.status).toBe("PROJECTED");
    if (result.status === "PROJECTED") { expect(result.candidates).toHaveLength(2); expect(result.candidates[0]?.sourceMaterialId).not.toBe(result.candidates[1]?.sourceMaterialId); expect(result.candidates.every(x => x.assetMapping === "UNRESOLVED" && x.issuerMapping === "UNRESOLVED")).toBe(true); }
  });
  it("does not merge the same URL with materially different titles", () => {
    const raw = syntheticGdeltDocResponse(), response = createGdeltDocResponseForTest({ ...raw, records: [raw.records[0], { ...raw.records[0]!, title: "A different story at this URL" }] }, GDELT_EVALUATION_AS_OF);
    const result = project(response); expect(result.status).toBe("PROJECTED"); if (result.status === "PROJECTED") expect(result.candidates).toHaveLength(2);
  });
  it("H: correction/retraction query terms remain category hints only", () => {
    const p = GDELT_DOC_QUERY_PROFILES[3], start = "2026-10-03T07:35:00.000Z", end = "2026-10-03T08:00:00.000Z";
    const raw = syntheticGdeltDocResponse({ queryProfileId: p.id, queryProfileFingerprint: gdeltDocQueryProfileFingerprint(p.id)!, queryFingerprint: gdeltDocRequestFingerprint(p.id, start, end)!, records: [{ ...syntheticGdeltDocResponse().records[0]!, title: "Correction: previously announced crypto deal cancelled" }] });
    const result = project(createGdeltDocResponseForTest(raw, GDELT_EVALUATION_AS_OF)); expect(result.status).toBe("PROJECTED");
    if (result.status === "PROJECTED") expect(result.candidates[0]).toMatchObject({ categoryHint: "CORRECTION_OR_RETRACTION", completionProven: false, eventAuthorityEligible: false });
  });
  it("J: receipt and raw-payload fingerprint are not source identity; material title change is", () => {
    const raw = syntheticGdeltDocResponse(), first = project(createGdeltDocResponseForTest(raw, GDELT_EVALUATION_AS_OF));
    const receipt = project(createGdeltDocResponseForTest({ ...raw, receivedAt: "2026-10-03T07:59:30.000Z", rawPayloadFingerprint: "b".repeat(64) }, GDELT_EVALUATION_AS_OF));
    const changed = project(createGdeltDocResponseForTest({ ...raw, records: [{ ...raw.records[0]!, title: "Different story" }] }, GDELT_EVALUATION_AS_OF));
    if (first.status === "PROJECTED" && receipt.status === "PROJECTED" && changed.status === "PROJECTED") { expect(first.candidates[0]?.sourceMaterialFingerprint).toBe(receipt.candidates[0]?.sourceMaterialFingerprint); expect(first.candidates[0]?.receiptFingerprint).not.toBe(receipt.candidates[0]?.receiptFingerprint); expect(first.candidates[0]?.sourceMaterialFingerprint).not.toBe(changed.candidates[0]?.sourceMaterialFingerprint); }
    else throw new Error("fixture projection unexpectedly blocked");
  });
  it.each(["future receipt", "future article", "bad profile", "bad fingerprint", "wrong request scope", "too many records", "long title", "long URL", "credentials", "fragment", "query", "http", "encoded traversal", "domain spoof", "control text"]) ("rejects invalid synthetic response: %s", label => {
    const raw = syntheticGdeltDocResponse(); let input: unknown = raw;
    if (label === "future receipt") input = { ...raw, receivedAt: "2026-10-03T08:00:01.000Z" };
    if (label === "future article") input = { ...raw, records: [{ ...raw.records[0]!, articleTime: "2026-10-03T08:00:01.000Z" }] };
    if (label === "bad profile") input = { ...raw, queryProfileId: "caller free text" };
    if (label === "bad fingerprint") input = { ...raw, rawPayloadFingerprint: "A".repeat(64) };
    if (label === "wrong request scope") input = { ...raw, queryFingerprint: "a".repeat(64) };
    if (label === "too many records") input = { ...raw, records: Array.from({ length: 26 }, () => raw.records[0]) };
    if (label === "long title") input = { ...raw, records: [{ ...raw.records[0]!, title: "x".repeat(513) }] };
    if (label === "long URL") input = { ...raw, records: [{ ...raw.records[0]!, articleUrl: `https://news.example/${"x".repeat(2050)}` }] };
    if (label === "credentials") input = { ...raw, records: [{ ...raw.records[0]!, articleUrl: "https://u:p@news.example/a" }] };
    if (label === "fragment") input = { ...raw, records: [{ ...raw.records[0]!, articleUrl: "https://news.example/a#frag" }] };
    if (label === "query") input = { ...raw, records: [{ ...raw.records[0]!, articleUrl: "https://news.example/a?token=secret" }] };
    if (label === "http") input = { ...raw, records: [{ ...raw.records[0]!, articleUrl: "http://news.example/a" }] };
    if (label === "encoded traversal") input = { ...raw, records: [{ ...raw.records[0]!, articleUrl: "https://news.example/a/%2e%2e/b" }] };
    if (label === "domain spoof") input = { ...raw, records: [{ ...raw.records[0]!, sourceDomain: "evil.example" }] };
    if (label === "control text") input = { ...raw, records: [{ ...raw.records[0]!, title: "Buy\u202eBitcoin" }] };
    expect(parseGdeltSyntheticResponse(input, GDELT_EVALUATION_AS_OF)).toBeNull();
  });
  it.each(["spread qualification", "serialized qualification", "fabricated qualification", "fabricated response", "spread response", "scope mismatch"]) ("projection rejects untrusted %s", mode => {
    let q: unknown = qualification, r: unknown = validResponse();
    if (mode === "spread qualification") q = { ...qualification };
    if (mode === "serialized qualification") q = JSON.parse(JSON.stringify(qualification));
    if (mode === "fabricated qualification") q = { status: "PARTIAL_DISCOVERY_ONLY", fingerprint: qualification.fingerprint };
    if (mode === "fabricated response") r = structuredClone(r);
    if (mode === "spread response") r = { ...(r as object) };
    if (mode === "scope mismatch") r = createGdeltDocResponseForTest({ ...syntheticGdeltDocResponse(), queryFingerprint: "0".repeat(64) }, GDELT_EVALUATION_AS_OF);
    expect(projectGdeltDocDiscovery({ qualification: q, response: r }, GDELT_EVALUATION_AS_OF)).toEqual({ status: "BLOCKED", code: "GDELT_PROJECTION_BLOCKED" });
  });
  it("rejects accessors, symbols, inherited objects, sparse arrays and proxies without side effects", () => {
    let calls = 0; const raw = syntheticGdeltDocResponse(); const accessor = { ...raw };
    Object.defineProperty(accessor, "receivedAt", { enumerable: true, get: () => { calls++; return raw.receivedAt; } });
    const proxy = new Proxy(raw, { getPrototypeOf: () => { calls++; throw Error("payload"); }, ownKeys: () => { calls++; throw Error("payload"); } });
    for (const bad of [accessor, { ...raw, [Symbol("extra")]: 1 }, Object.assign(Object.create({ inherited: true }), raw), proxy, { ...raw, records: new Array(1) }, { ...raw, records: Object.assign([...raw.records], { extra: true }) }]) expect(parseGdeltSyntheticResponse(bad, GDELT_EVALUATION_AS_OF)).toBeNull();
    expect(calls).toBe(0);
  });
  it("parser output, spread, JSON and structured clone do not carry response trust", () => {
    const parsed = parseGdeltSyntheticResponse(syntheticGdeltDocResponse(), GDELT_EVALUATION_AS_OF); expect(parsed).not.toBeNull();
    const copies = [parsed, { ...parsed! }, JSON.parse(JSON.stringify(parsed)), structuredClone(parsed)];
    for (const copy of copies) expect(projectGdeltDocDiscovery({ qualification, response: copy }, GDELT_EVALUATION_AS_OF).status).toBe("BLOCKED");
  });
  it("O: has no authority, persistence, signal or trading projection", () => {
    const result = project(); expect(result.status).toBe("PROJECTED");
    if (result.status === "PROJECTED") for (const candidate of result.candidates) {
      for (const boundary of ["ISSUER", "CORROBORATION", "EVENT", "PERSISTENCE", "SIGNAL", "TRADING"] as const) expect(rejectGdeltDiscoveryAsAuthority(candidate, boundary)).toBeNull();
      expect(isAuthenticNewsDiscoveryCandidate(candidate)).toBe(false); expect(rejectNewsDiscoveryAsAuthority(candidate, "MAPPED_EVENT_AUTHORITY")).toBeNull();
      for (const guard of [isAuthenticEventIssuerMappingAuthority, isAuthenticEventAssetMentionBinding, isAuthenticMappedNonAuthoritativeEventClaim, isAuthenticEventSourceOrigin, isAuthenticEventClaimEvidence]) expect(guard(candidate)).toBe(false);
      expect(rejectEligibilityAsEventAuthorityOrPersistence(candidate)).toBeNull();
    }
  });
});

describe("GDELT production block", () => {
  it("keeps source null, all operations blocked, approvals denied and object frozen", () => {
    expect(GDELT_DOC_PRODUCTION_CONFIG.status).toBe("BLOCKED_BACKEND_UNAPPROVED"); expect(GDELT_DOC_PRODUCTION_CONFIG.selectedSource).toBeNull();
    expect(Object.values(GDELT_DOC_PRODUCTION_CONFIG.operations).every(x => x === "BLOCKED")).toBe(true); expect(Object.values(GDELT_DOC_PRODUCTION_CONFIG.usages).every(x => x === "NOT_APPROVED")).toBe(true); expect(deeplyFrozen(GDELT_DOC_PRODUCTION_CONFIG)).toBe(true);
  });
  it.each(["ready", "selected", "operation", "approval", "credential", "unknown"]) ("rejects production upgrade: %s", mode => {
    const c = structuredClone(GDELT_DOC_PRODUCTION_CONFIG);
    const bad = mode === "ready" ? { ...c, status: "READY" } : mode === "selected" ? { ...c, selectedSource: "gdelt-doc-2" } : mode === "operation" ? { ...c, operations: { ...c.operations, acquisition: "READY" } } : mode === "approval" ? { ...c, usages: { ...c.usages, commercialUse: "APPROVED" } } : mode === "credential" ? { ...c, credentialReferences: ["secret"] } : { ...c, extra: true };
    expect(parseGdeltDocProductionConfig(bad)).toBeNull();
  });
});

describe("production boundary static guard", () => {
  it("has no transport, database, credential, fixture or test-seam imports", () => {
    for (const file of ["event-intelligence-gdelt-doc-source-qualification.ts", "event-intelligence-gdelt-doc-source-qualification-production.ts"]) {
      const source = readFileSync(new URL(`../../src/domain/intelligence/${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/(?:process\.env|fetch\s*\(|node:(?:http|https|dns)|infrastructure\/|unit.of.work|repository|credentialResolver|tests\/fixtures|test-only:)/i);
    }
  });
});
