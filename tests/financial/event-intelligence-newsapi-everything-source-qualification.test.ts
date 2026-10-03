import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  NEWSAPI_EVERYTHING_PROFILE, NEWSAPI_QUALIFICATION_BLOCKERS, NEWSAPI_QUERY_PROFILES,
  NEWSAPI_PROVIDER_ID, buildNewsApiEverythingQuery, getSyntheticNewsApiProjectionQualification, isAuthenticNewsApiQualification,
  newsApiQueryProfileFingerprint, newsApiRequestFingerprint, parseNewsApiQualification,
  parseNewsApiSyntheticResponse, projectNewsApiEverythingDiscovery, validateNewsApiEverythingQuery,
} from "../../src/domain/intelligence/event-intelligence-newsapi-everything-source-qualification";
import { createNewsApiEverythingResponseForTest } from "test-only:newsapi-everything-response";
import { NEWSAPI_EVERYTHING_PRODUCTION_CONFIG, parseNewsApiEverythingProductionConfig } from "../../src/domain/intelligence/event-intelligence-newsapi-everything-production";
import { isAuthenticNewsDiscoveryCandidate, rejectNewsDiscoveryAsAuthority } from "../../src/domain/intelligence/event-intelligence-news-discovery";
import { isAuthenticEventIssuerMappingAuthority, isAuthenticEventAssetMentionBinding, isAuthenticMappedNonAuthoritativeEventClaim } from "../../src/domain/intelligence/event-intelligence-mapping-authority";
import { isAuthenticEventSourceOrigin, isAuthenticEventClaimEvidence, rejectEligibilityAsEventAuthorityOrPersistence } from "../../src/domain/intelligence/event-intelligence-corroboration-authority-policy";
import { NEWSAPI_EVALUATION_AS_OF, syntheticNewsApiEverythingResponse } from "../fixtures/event-intelligence-newsapi-everything";

const qualification = getSyntheticNewsApiProjectionQualification();
const raw = () => syntheticNewsApiEverythingResponse();
const trustedResponse = (input = raw()) => createNewsApiEverythingResponseForTest(input, NEWSAPI_EVALUATION_AS_OF);
const projection = (response = trustedResponse()) => projectNewsApiEverythingDiscovery({ qualification, response }, NEWSAPI_EVALUATION_AS_OF);
const deeplyFrozen = (v: unknown): boolean => !v || typeof v !== "object" || (Object.isFrozen(v) && Object.values(v).every(deeplyFrozen));

describe("NewsAPI Everything qualification and request profiles", () => {
  it("pins endpoint, header auth, canonical query order and six fixed non-authoritative profiles", () => {
    expect(NEWSAPI_EVERYTHING_PROFILE).toMatchObject({ protocol: "https", hostname: "newsapi.org", path: "/v2/everything", method: "GET", authentication: expect.stringContaining("X-Api-Key"), pageSize: 25, maxPages: 1, retries: 0, redirects: "FORBIDDEN", credentialReferenceInConfig: null });
    expect(NEWSAPI_QUERY_PROFILES.map(p => p.category)).toEqual(["CORPORATE_CRYPTO_PURCHASE_INTENT", "COMPLETED_CRYPTO_PURCHASE", "TREASURY_POLICY_CHANGE", "ASSET_OR_COMPANY_ACQUISITION", "STRATEGIC_PARTNERSHIP", "CORRECTION_OR_RETRACTION"]);
    expect(NEWSAPI_QUERY_PROFILES).toHaveLength(6);
    const query = buildNewsApiEverythingQuery(NEWSAPI_QUERY_PROFILES[0].id, "2026-09-27", "2026-10-03")!;
    expect(query.split("&").map(part => decodeURIComponent(part.split("=")[0]!))).toEqual([...NEWSAPI_EVERYTHING_PROFILE.canonicalQueryOrder]);
    expect(validateNewsApiEverythingQuery(query)).toBe(true);
    expect(validateNewsApiEverythingQuery(`${query}&apiKey=SENTINEL`)).toBe(false);
    expect(validateNewsApiEverythingQuery(query.replace("searchIn=title%2Cdescription", "searchIn=content"))).toBe(false);
    expect(validateNewsApiEverythingQuery(query.replace("page=1", "page=1&page=1"))).toBe(false);
    expect(validateNewsApiEverythingQuery(query.replace("q=", "q=%0d%0a"))).toBe(false);
    expect(buildNewsApiEverythingQuery("caller-query", "2026-09-27", "2026-10-03")).toBeNull();
    expect(buildNewsApiEverythingQuery(NEWSAPI_QUERY_PROFILES[0].id, "2026-09-20", "2026-09-27")).toBeNull();
    expect(buildNewsApiEverythingQuery(NEWSAPI_QUERY_PROFILES[0].id, "2026-09-27", "2026-10-03", 2)).toBeNull();
    expect(NEWSAPI_QUERY_PROFILES.every(p => p.query.length <= 500 && newsApiQueryProfileFingerprint(p.id))).toBe(true);
    expect(deeplyFrozen(NEWSAPI_QUERY_PROFILES)).toBe(true);
    expect(NEWSAPI_QUERY_PROFILES.every(p => !/^\s*(?:bitcoin|btc)\s*$/i.test(p.query))).toBe(true);
  });

  it("keeps qualification partial, immutable, fingerprinted and untrusted after parsing/copying", () => {
    expect(qualification.status).toBe("PARTIAL_DISCOVERY_ONLY");
    expect(qualification.credentialReference).toBeNull();
    expect(NEWSAPI_QUALIFICATION_BLOCKERS).toContain("THIRD_PARTY_ARTICLE_CONTENT_RIGHTS_UNRESOLVED");
    expect(isAuthenticNewsApiQualification(qualification)).toBe(true);
    expect(deeplyFrozen(qualification)).toBe(true);
    const parsed = parseNewsApiQualification(qualification);
    expect(parsed.status).toBe("VALID");
    if (parsed.status === "VALID") expect(isAuthenticNewsApiQualification(parsed.qualification)).toBe(false);
    for (const copy of [{ ...qualification }, structuredClone(qualification), JSON.parse(JSON.stringify(qualification)), { fingerprint: qualification.fingerprint }]) expect(isAuthenticNewsApiQualification(copy)).toBe(false);
  });

  it.each(["status upgrade", "credential ref", "quota change", "blocker removal", "unknown field", "coercion hook", "proxy", "accessor", "symbol", "inherited", "sparse approvals"]) ("fails closed on qualification mutation or unsafe shape: %s", mode => {
    const copy = structuredClone(qualification) as Record<PropertyKey, unknown>; let effects = 0; let input: unknown = copy;
    if (mode === "status upgrade") input = { ...copy, status: "QUALIFIED" };
    if (mode === "credential ref") input = { ...copy, credentialReference: "SENTINEL_SECRET" };
    if (mode === "quota change") input = { ...copy, maxRequests: 99 };
    if (mode === "blocker removal") input = { ...copy, blockers: [] };
    if (mode === "unknown field") input = { ...copy, extra: true };
    if (mode === "coercion hook") input = { ...copy, recordedAt: { [Symbol.toPrimitive]: () => { effects++; return "2026-10-03T08:30:00.000Z"; } } };
    if (mode === "proxy") input = new Proxy(copy, { ownKeys: () => { effects++; throw Error("SENTINEL"); } });
    if (mode === "accessor") Object.defineProperty(copy, "providerId", { enumerable: true, get: () => { effects++; return "newsapi-discovery"; } });
    if (mode === "symbol") input = { ...copy, [Symbol("x")]: true };
    if (mode === "inherited") input = Object.assign(Object.create({ unsafe: true }), copy);
    if (mode === "sparse approvals") { const malformed = structuredClone(copy) as Record<string, unknown>; const approvals = malformed.usageApprovals as unknown[]; delete approvals[0]; input = malformed; }
    expect(parseNewsApiQualification(input).status).toBe("INVALID");
    expect(effects).toBe(0);
  });
});

describe("synthetic response normalization and projection", () => {
  it("A/B: purchase intent and completed-looking profiles remain discovery hints", () => {
    const result = projection(); expect(result.status).toBe("PROJECTED");
    if (result.status === "PROJECTED") expect(result.candidates[0]).toMatchObject({ status: "NON_AUTHORITATIVE_DISCOVERY_CANDIDATE", categoryHint: NEWSAPI_QUERY_PROFILES[0].category, completionProven: false, issuerMapping: "UNRESOLVED", assetMapping: "UNRESOLVED", independentCorroboration: false, eventAuthorityEligible: false, signalEligible: false, tradingEligible: false });
    const p = NEWSAPI_QUERY_PROFILES[1], from = "2026-09-27", to = "2026-10-03";
    const completedRaw = { ...raw(), queryProfileId: p.id, queryProfileFingerprint: newsApiQueryProfileFingerprint(p.id), queryFingerprint: newsApiRequestFingerprint(p.id, from, to), articles: [{ ...(raw().articles as Array<Record<string, unknown>>)[0], title: "Company completed its Bitcoin purchase" }] };
    const completed = projection(trustedResponse(completedRaw));
    if (completed.status === "PROJECTED") expect(completed.candidates[0]?.completionProven).toBe(false); else throw new Error("synthetic projection unexpectedly blocked");
  });

  it("C/D/E/K: exact replay is stable, same title at separate URLs stays separate, and changed URL material is append-only", () => {
    const first = projection(), replay = projection(), rawMaterial = raw();
    const distinct = trustedResponse({ ...rawMaterial, articles: [(rawMaterial.articles as Array<Record<string, unknown>>)[0], { ...(rawMaterial.articles as Array<Record<string, unknown>>)[0], articleUrl: "https://another.example/news/bitcoin-treasury" }] });
    const changed = trustedResponse({ ...rawMaterial, articles: [{ ...(rawMaterial.articles as Array<Record<string, unknown>>)[0], title: "Updated company Bitcoin treasury report" }] });
    expect(first.status).toBe("PROJECTED"); expect(replay.status).toBe("PROJECTED");
    if (first.status === "PROJECTED" && replay.status === "PROJECTED" && distinct && changed) {
      expect(first.candidates[0]?.sourceMaterialFingerprint).toBe(replay.candidates[0]?.sourceMaterialFingerprint);
      const two = projection(distinct), updated = projection(changed);
      if (two.status === "PROJECTED" && updated.status === "PROJECTED") {
        expect(two.candidates).toHaveLength(2); expect(two.candidates[0]?.sourceMaterialFingerprint).not.toBe(two.candidates[1]?.sourceMaterialFingerprint);
        expect(updated.candidates[0]?.sourceMaterialFingerprint).not.toBe(first.candidates[0]?.sourceMaterialFingerprint);
        expect(updated.candidates[0]?.categoryHint).toBe("CORPORATE_CRYPTO_PURCHASE_INTENT");
      }
    }
  });

  it("F/I: source labels and ambiguous issuer/ticker mentions do not create independent origins or mapping", () => {
    const rawValue = raw() as Record<string, unknown>, base = (rawValue.articles as Array<Record<string, unknown>>)[0]!;
    const syndicated = trustedResponse({ ...rawValue, articles: [base, { ...base, sourceId: "wire-copy", sourceName: "Wire Copy", articleUrl: "https://wire.example/story/bitcoin-treasury" }] });
    const result = projection(syndicated);
    if (result.status === "PROJECTED") expect(result.candidates.every(x => x.independentCorroboration === false && x.issuerMapping === "UNRESOLVED" && x.assetMapping === "UNRESOLVED")).toBe(true);
    else throw new Error("synthetic projection unexpectedly blocked");
  });

  it("G: allows explicit null author, description, content and image without reconstructing content", () => {
    const r = raw() as Record<string, unknown>, article = (r.articles as Array<Record<string, unknown>>)[0]!;
    const result = projection(trustedResponse({ ...r, articles: [{ ...article, author: null, description: null, content: null, imageUrl: null }] }));
    if (result.status === "PROJECTED") expect(result.candidates[0]).toMatchObject({ author: null, description: null, contentPresent: false, contentLength: null, contentFingerprint: null, imageUrl: null });
    else throw new Error("null-field policy unexpectedly blocked");
  });

  it("H: retains only truncation metadata and fingerprint, never content text or marker reconstruction", () => {
    const result = projection();
    if (result.status !== "PROJECTED") throw new Error("synthetic projection unexpectedly blocked");
    const serialized = JSON.stringify(result);
    expect(result.candidates[0]?.contentTruncatedByProvider).toBe(true);
    expect(serialized).not.toContain("This remains an unverified report");
    expect(serialized).not.toContain("content\":");
  });

  it("marks correction/retraction search hits as hints only, without creating lifecycle lineage", () => {
    const p = NEWSAPI_QUERY_PROFILES.find(x => x.category === "CORRECTION_OR_RETRACTION")!;
    const value = raw() as Record<string, unknown>, from = value.from as string, to = value.to as string;
    const candidateInput = { ...value, queryProfileId: p.id, queryProfileFingerprint: newsApiQueryProfileFingerprint(p.id), queryFingerprint: newsApiRequestFingerprint(p.id, from, to) };
    const result = projection(trustedResponse(candidateInput));
    if (result.status !== "PROJECTED") throw new Error("synthetic projection unexpectedly blocked");
    expect(result.candidates[0]).toMatchObject({ lifecycleHint: "CORRECTION_OR_RETRACTION_SEARCH_HINT", correctionRetractionAuthority: false, eventAuthorityEligible: false, signalEligible: false, tradingEligible: false });
    expect(result.candidates[0]).not.toHaveProperty("parentSourceMaterialId");
  });

  it("K: receipt, evaluation and raw-payload fingerprint are separate from source material", () => {
    const value = raw() as Record<string, unknown>, later = trustedResponse({ ...value, receivedAt: "2026-10-03T08:44:30.000Z", rawPayloadFingerprint: "b".repeat(64) });
    const a = projection(), b = projection(later);
    if (a.status === "PROJECTED" && b.status === "PROJECTED") {
      expect(a.candidates[0]?.sourceMaterialFingerprint).toBe(b.candidates[0]?.sourceMaterialFingerprint);
      expect(a.candidates[0]?.receiptFingerprint).not.toBe(b.candidates[0]?.receiptFingerprint);
    } else throw new Error("synthetic projection unexpectedly blocked");
  });

  it.each(["future publication", "future receipt", "bad profile", "wrong scope", "bad digest", "too many", "title too long", "content too long", "bad URL", "URL credential", "URL fragment", "URL secret", "future to date", "native-looking", "unknown key", "accessor", "proxy", "sparse", "symbol", "bad source ID"]) ("rejects response outside normalized fixture contract: %s", label => {
    const r = raw() as Record<string, unknown>, article = (r.articles as Array<Record<string, unknown>>)[0]!; let input: unknown = r; let asOf = NEWSAPI_EVALUATION_AS_OF;
    if (label === "future publication") input = { ...r, articles: [{ ...article, publishedAt: "2026-10-03T08:46:00.000Z" }] };
    if (label === "future receipt") input = { ...r, receivedAt: "2026-10-03T08:46:00.000Z" };
    if (label === "bad profile") input = { ...r, queryProfileId: "caller search" };
    if (label === "wrong scope") input = { ...r, queryFingerprint: "c".repeat(64) };
    if (label === "bad digest") input = { ...r, rawPayloadFingerprint: "A".repeat(64) };
    if (label === "too many") input = { ...r, articles: Array.from({ length: 26 }, () => article) };
    if (label === "title too long") input = { ...r, articles: [{ ...article, title: "x".repeat(513) }] };
    if (label === "content too long") input = { ...r, articles: [{ ...article, content: "x".repeat(201) }] };
    if (label === "bad URL") input = { ...r, articles: [{ ...article, articleUrl: "javascript:alert(1)" }] };
    if (label === "URL credential") input = { ...r, articles: [{ ...article, articleUrl: "https://user:pass@publisher.example/x" }] };
    if (label === "URL fragment") input = { ...r, articles: [{ ...article, articleUrl: "https://publisher.example/x#frag" }] };
    if (label === "URL secret") input = { ...r, articles: [{ ...article, articleUrl: "https://publisher.example/x?apiKey=SENTINEL" }] };
    if (label === "future to date") { input = { ...r, to: "2026-10-04" }; asOf = NEWSAPI_EVALUATION_AS_OF; }
    if (label === "native-looking") input = { status: "ok", totalResults: 1, articles: [{ source: { id: "desk", name: "Desk" }, title: "Title" }] };
    if (label === "unknown key") input = { ...r, apiKey: "SENTINEL_SECRET" };
    if (label === "accessor") { const x = { ...r }; Object.defineProperty(x, "receivedAt", { enumerable: true, get: () => { throw Error("SECRET_SENTINEL"); } }); input = x; }
    if (label === "proxy") input = new Proxy(r, { ownKeys: () => { throw Error("SECRET_SENTINEL"); } });
    if (label === "sparse") input = { ...r, articles: new Array(1) };
    if (label === "symbol") input = { ...r, [Symbol("extra")]: true };
    if (label === "bad source ID") input = { ...r, articles: [{ ...article, sourceId: "apiKey-secret" }] };
    expect(parseNewsApiSyntheticResponse(input, asOf)).toBeNull();
  });

  it.each(["spread qualification", "serialized qualification", "fabricated qualification", "spread response", "cloned response", "JSON response", "fabricated response"]) ("projection rejects copied or fabricated runtime trust: %s", kind => {
    const response = trustedResponse(); let q: unknown = qualification, r: unknown = response;
    if (kind === "spread qualification") q = { ...qualification };
    if (kind === "serialized qualification") q = JSON.parse(JSON.stringify(qualification));
    if (kind === "fabricated qualification") q = { status: "PARTIAL_DISCOVERY_ONLY", fingerprint: qualification.fingerprint };
    if (kind === "spread response") r = { ...response! };
    if (kind === "cloned response") r = structuredClone(response);
    if (kind === "JSON response") r = JSON.parse(JSON.stringify(response));
    if (kind === "fabricated response") r = { providerId: NEWSAPI_PROVIDER_ID, datasetVersion: "v2" };
    expect(projectNewsApiEverythingDiscovery({ qualification: q, response: r }, NEWSAPI_EVALUATION_AS_OF)).toEqual({ status: "BLOCKED", code: "NEWSAPI_PROJECTION_BLOCKED" });
  });

  it("O/Q: existing mapping, corroboration, event, signal and trading boundaries reject projections", () => {
    const result = projection(); expect(result.status).toBe("PROJECTED");
    if (result.status !== "PROJECTED") return;
    for (const c of result.candidates) {
      expect(isAuthenticNewsDiscoveryCandidate(c)).toBe(false); expect(rejectNewsDiscoveryAsAuthority(c, "MAPPED_EVENT_AUTHORITY")).toBeNull();
      expect(isAuthenticEventIssuerMappingAuthority(c)).toBe(false); expect(isAuthenticEventAssetMentionBinding(c)).toBe(false); expect(isAuthenticMappedNonAuthoritativeEventClaim(c)).toBe(false);
      expect(isAuthenticEventSourceOrigin(c)).toBe(false); expect(isAuthenticEventClaimEvidence(c)).toBe(false); expect(rejectEligibilityAsEventAuthorityOrPersistence(c)).toBeNull();
    }
  });

  it("P: sentinel key is absent from projection, serialized result and sanitized guard output", () => {
    const bad = { ...raw() as object, apiKey: "NEWSAPI_SECRET_SENTINEL" };
    expect(createNewsApiEverythingResponseForTest(bad, NEWSAPI_EVALUATION_AS_OF)).toBeNull();
    const result = projection(); expect(JSON.stringify(result)).not.toContain("NEWSAPI_SECRET_SENTINEL");
  });
});

describe("NewsAPI production configuration and boundary", () => {
  it("keeps source unselected, credential references empty and every operation/approval blocked", () => {
    expect(NEWSAPI_EVERYTHING_PRODUCTION_CONFIG.status).toBe("BLOCKED_BACKEND_UNAPPROVED");
    expect(NEWSAPI_EVERYTHING_PRODUCTION_CONFIG.selectedSource).toBeNull();
    expect(NEWSAPI_EVERYTHING_PRODUCTION_CONFIG.credentialReference).toBeNull();
    expect(Object.values(NEWSAPI_EVERYTHING_PRODUCTION_CONFIG.operations).every(x => x === "BLOCKED")).toBe(true);
    expect(Object.values(NEWSAPI_EVERYTHING_PRODUCTION_CONFIG.usages).every(x => x === "NOT_APPROVED")).toBe(true);
    expect(deeplyFrozen(NEWSAPI_EVERYTHING_PRODUCTION_CONFIG)).toBe(true);
  });
  it.each(["selected", "credential", "approval", "operation", "unknown", "credential array"]) ("rejects production config upgrade: %s", mode => {
    const c = structuredClone(NEWSAPI_EVERYTHING_PRODUCTION_CONFIG) as Record<string, unknown>;
    const bad = mode === "selected" ? { ...c, selectedSource: "newsapi" } : mode === "credential" ? { ...c, credentialReference: "vault://newsapi/secret" } : mode === "approval" ? { ...c, usages: { ...(c.usages as object), COMMERCIAL_USE: "APPROVED" } } : mode === "operation" ? { ...c, operations: { ...(c.operations as object), acquisition: "READY" } } : mode === "credential array" ? { ...c, credentialReferences: ["SENTINEL"] } : { ...c, extra: true };
    expect(parseNewsApiEverythingProductionConfig(bad)).toBeNull();
  });
  it("has no transport, credential lookup, database or persistence import", () => {
    for (const file of ["event-intelligence-newsapi-everything-source-qualification.ts", "event-intelligence-newsapi-everything-production.ts"]) {
      const source = readFileSync(new URL(`../../src/domain/intelligence/${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/(?:process\.env|fetch\s*\(|node:(?:http|https|dns)|credentialResolver|unit.of.work|repository|tests\/fixtures|test-only:)/i);
    }
  });
});
