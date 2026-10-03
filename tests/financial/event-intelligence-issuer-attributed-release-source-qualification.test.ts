import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  ISSUER_RELEASE_ORIGIN_SET_VERSION, ISSUER_RELEASE_QUALIFICATION_VERSION,
  compareIssuerReleaseCandidates, isAuthenticIssuerReleaseCandidate, isAuthenticIssuerReleaseQualification,
  listIssuerReleaseQualifications, parseIssuerReleaseQualification, parseSyntheticIssuerRelease,
  projectIssuerReleaseCandidate, rejectIssuerReleaseAsAuthority, resolveIssuerReleaseQualification,
  sealIssuerReleaseOriginSet, parseIssuerReleaseProductionConfig,
} from "../../src/domain/intelligence/event-intelligence-issuer-attributed-release-source-qualification";
import production from "../../config/intelligence/event-intelligence-issuer-release.production.json";
import { ISSUER_RELEASE_PRODUCTION } from "../../src/domain/intelligence/event-intelligence-issuer-release-production";
import { syntheticIssuerRelease, REVIEW_AS_OF } from "../fixtures/event-intelligence-issuer-attributed-release";
import { constructSyntheticNormalForm, checkFingerprintCollision } from "test-only:issuer-release-normal-form";

function candidate(overrides: Parameters<typeof syntheticIssuerRelease>[0] = {}) {
  const value = syntheticIssuerRelease(overrides);
  const qualification = resolveIssuerReleaseQualification(value.sourceId)!;
  const normal = constructSyntheticNormalForm(value);
  expect(normal).not.toBeNull();
  return projectIssuerReleaseCandidate(qualification, normal);
}
function freezeDeep(value: unknown): void { if (!value || typeof value !== "object") return; expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) freezeDeep(child); }

describe("issuer-attributed release source qualification", () => {
  it("resolves only partial/blocked reviewed source candidates; no READY state exists", () => {
    const all = listIssuerReleaseQualifications();
    expect(all.map(x => x.candidateSourceId)).toEqual(["issuer-ir-release", "issuer-rss-atom", "businesswire-release", "globenewswire-release", "syndicated-copy", "editorial-report", "discovery-only-reference"]);
    expect(all.every(x => !["QUALIFIED", "READY"].includes(x.status))).toBe(true);
    expect(all.every(isAuthenticIssuerReleaseQualification)).toBe(true); all.forEach(freezeDeep);
    expect(resolveIssuerReleaseQualification("https://secret.test/key")).toBeNull();
  });
  it("models direct issuer intent as a synthetic non-authoritative candidate, never completion", () => {
    const c = candidate()!;
    expect(c.status).toBe("NON_AUTHORITATIVE_DISCOVERY_CANDIDATE"); expect(c.provenance).toBe("SYNTHETIC");
    expect(c.categoryCandidate).toBe("CORPORATE_CRYPTO_PURCHASE_INTENT"); expect(c).not.toHaveProperty("completedAt");
    expect([c.issuerMappingEligible,c.assetMappingEligible,c.corroborationEligible,c.issuerDisclosureAuthorityEligible,c.eventAuthorityEligible,c.persistenceAuthorityEligible,c.signalEligible,c.tradingEligible]).toEqual(Array(8).fill(false)); freezeDeep(c);
  });
  it("keeps a completed-purchase headline at candidate-only category", () => {
    const c = candidate({ categoryCandidate: "COMPLETED_CRYPTO_PURCHASE", headline: "Issuer reports completed Bitcoin purchase" })!;
    expect(c.categoryCandidate).toBe("COMPLETED_CRYPTO_PURCHASE"); expect(c.status).toBe("NON_AUTHORITATIVE_DISCOVERY_CANDIDATE");
    expect(c.eventAuthorityEligible).toBe(false); expect(c).not.toHaveProperty("completedAt");
  });
  it("requires issuer attribution for a synthetic issuer-authorized wire candidate", () => {
    const c = candidate({ sourceId: "businesswire-release", sourceClass: "ISSUER_AUTHORIZED_DISTRIBUTION", publisherId: "business-wire", distributorId: "business-wire", canonicalReleaseUrl: "https://www.businesswire.com/news/home/123/en/example", explicitOriginBinding: { issuerCandidateId: "issuer-candidate-example", releaseIdentifier: "release-2026-10-02", canonicalOriginUrl: "https://issuer.example.test/ir/releases/20261002" } });
    expect(c?.sourceClass).toBe("ISSUER_AUTHORIZED_DISTRIBUTION"); expect(c?.issuerDisclosureAuthorityEligible).toBe(false);
    expect(parseSyntheticIssuerRelease({ ...syntheticIssuerRelease(), issuerCandidateId: "" })).toBeNull();
  });
  it.each([
    ["globenewswire-release", "ISSUER_AUTHORIZED_DISTRIBUTION", "globenewswire", "https://www.globenewswire.com/news-release/2026/10/02/123/example"],
    ["editorial-report", "EDITORIAL_REPORT", "editorial-publisher", "https://editorial.example.test/story/456"],
    ["syndicated-copy", "SYNDICATED_COPY", "syndicator", "https://syndicator.example.test/release/789"],
  ] as const)("projects %s only as a discovery candidate", (sourceId, sourceClass, publisherId, canonicalReleaseUrl) => {
    const c = candidate({ sourceId, sourceClass, publisherId, distributorId: sourceClass === "ISSUER_AUTHORIZED_DISTRIBUTION" || sourceClass === "SYNDICATED_COPY" ? publisherId : null, canonicalReleaseUrl });
    expect(c?.status).toBe("NON_AUTHORITATIVE_DISCOVERY_CANDIDATE"); expect(c?.eventAuthorityEligible).toBe(false); expect(c?.corroborationEligible).toBe(false);
  });
  it("groups issuer and wire copies only on exact explicit origin binding, never as corroboration", () => {
    const issuer = candidate()!;
    const wire = candidate({ sourceId: "globenewswire-release", sourceClass: "ISSUER_AUTHORIZED_DISTRIBUTION", publisherId: "globenewswire", distributorId: "globenewswire", canonicalReleaseUrl: "https://www.globenewswire.com/news-release/2026/10/02/123/example", headline: issuer.headline, explicitOriginBinding: issuer.explicitOriginBinding });
    const set = sealIssuerReleaseOriginSet({ contractVersion: ISSUER_RELEASE_ORIGIN_SET_VERSION, members: [wire, issuer], declaredMemberCount: 2, evaluatedAsOf: REVIEW_AS_OF, recordedAt: REVIEW_AS_OF });
    expect(set?.groups).toHaveLength(1); expect(set?.groups[0]?.candidateIds).toHaveLength(2); expect(set?.groups[0]?.independentCorroborationCount).toBe(0); freezeDeep(set);
    const reversed = sealIssuerReleaseOriginSet({ contractVersion: ISSUER_RELEASE_ORIGIN_SET_VERSION, members: [issuer, wire], declaredMemberCount: 2, evaluatedAsOf: REVIEW_AS_OF, recordedAt: REVIEW_AS_OF });
    expect(reversed?.fingerprint).toBe(set?.fingerprint);
    expect(compareIssuerReleaseCandidates(issuer, wire)).toBe("EXPLICIT_SAME_ISSUER_ORIGIN");
  });
  it("does not group same headline/issuer without explicit release binding", () => {
    const a = candidate()!, b = candidate({ sourceId: "editorial-report", sourceClass: "EDITORIAL_REPORT", publisherId: "editorial-desk", canonicalReleaseUrl: "https://editorial.example.test/story/other", releaseIdentifier: "other-release", explicitOriginBinding: null });
    expect(a.headline).toBe(b?.headline); expect(compareIssuerReleaseCandidates(a, b)).toBe("DISTINCT_UNVERIFIED_MATERIAL");
    const set = sealIssuerReleaseOriginSet({ contractVersion: ISSUER_RELEASE_ORIGIN_SET_VERSION, members: [a, b], declaredMemberCount: 2, evaluatedAsOf: REVIEW_AS_OF, recordedAt: REVIEW_AS_OF }); expect(set?.groups).toHaveLength(2);
  });
  it("keeps same URL material changes as append-only variants and receipt out of source identity", () => {
    const a = candidate()!, replay = candidate({ receivedAt: "2026-10-02T10:02:00.000Z", discoveredAt: "2026-10-02T10:01:59.000Z", payloadFingerprint: "b".repeat(64) })!;
    const changed = candidate({ summary: "A corrected synthetic amount is now stated.", lifecycleHint: "CORRECTION_HINT" })!;
    expect(a.sourceMaterialFingerprint).toBe(replay.sourceMaterialFingerprint); expect(a.receiptFingerprint).not.toBe(replay.receiptFingerprint);
    expect(changed.sourceMaterialFingerprint).not.toBe(a.sourceMaterialFingerprint); expect(compareIssuerReleaseCandidates(a, changed)).toBe("SAME_URL_MATERIAL_VARIANT");
    expect(changed.lifecycleHint).toBe("CORRECTION_HINT"); expect(changed).not.toHaveProperty("correctionParent");
  });
  it("fails closed if one fingerprint is associated with different canonical release material", () => {
    const digest = "f".repeat(64);
    expect(checkFingerprintCollision([{ fingerprint: digest, material: { url: "https://a.test/release", title: "first" } }, { fingerprint: digest, material: { url: "https://a.test/release", title: "changed" } }])).toBe(false);
    expect(checkFingerprintCollision([{ fingerprint: digest, material: { url: "https://a.test/release", title: "same" } }, { fingerprint: digest, material: { title: "same", url: "https://a.test/release" } }])).toBe(true);
  });
  it.each(["CORRECTION_HINT", "UPDATE_HINT", "RETRACTION_HINT"] as const)("preserves %s as hint only", hint => {
    const c = candidate({ lifecycleHint: hint })!; expect(c.lifecycleHint).toBe(hint); expect(rejectIssuerReleaseAsAuthority(c, "EVENT_AUTHORITY")).toBeNull();
  });
  it("keeps ambiguous ticker/entity mentions unresolved and amount as text", () => {
    const c = candidate({ assetMentions: ["BTC", "ETH", "WETH", "Wrapped Ether"], amountText: "1.2500", currencyText: "USD" })!;
    expect(c.assetMentions).toEqual(["BTC", "ETH", "WETH", "Wrapped Ether"]); expect(c.amountText).toBe("1.2500"); expect(c.assetMappingEligible).toBe(false);
  });
  it("keeps parent/subsidiary candidates and ETH/WETH mentions separate", () => {
    const parent = candidate({ issuerCandidateId: "issuer-parent-candidate", issuerDisplayedName: "Example Group", assetMentions: ["ETH"], explicitOriginBinding: { issuerCandidateId: "issuer-parent-candidate", releaseIdentifier: "release-2026-10-02", canonicalOriginUrl: "https://issuer.example.test/ir/releases/20261002" } })!;
    const sub = candidate({ issuerCandidateId: "issuer-subsidiary-candidate", issuerDisplayedName: "Example Group", assetMentions: ["WETH"], explicitOriginBinding: { issuerCandidateId: "issuer-subsidiary-candidate", releaseIdentifier: "release-2026-10-02", canonicalOriginUrl: "https://issuer.example.test/ir/releases/20261002" } })!;
    expect(parent.issuerCandidateId).not.toBe(sub.issuerCandidateId); expect(parent.sourceMaterialFingerprint).not.toBe(sub.sourceMaterialFingerprint);
    expect(parent.assetMentions).toEqual(["ETH"]); expect(sub.assetMentions).toEqual(["WETH"]);
  });
  it.each([
    { canonicalReleaseUrl: "javascript:alert(1)" }, { canonicalReleaseUrl: "https://user:pass@issuer.example.test/path" },
    { canonicalReleaseUrl: "https://issuer.example.test/path#frag" }, { canonicalReleaseUrl: "https://issuer.example.test/a/../b" },
    { headline: "control\u202eattack" }, { headline: "x".repeat(513) }, { summary: "x".repeat(2049) },
    { publicationAt: "2026-10-02T10:00:00Z" }, { evaluatedAsOf: "2026-10-02T09:59:00.000Z" },
  ])("fails closed for unsafe or out-of-bound normal forms %#", overrides => expect(parseSyntheticIssuerRelease({ ...syntheticIssuerRelease(), ...overrides })).toBeNull());
  it("rejects accessors, symbols, inherited shapes, proxies, sparse arrays and changed prototypes without invoking getters", () => {
    let called = false; const accessor = { ...syntheticIssuerRelease() }; Object.defineProperty(accessor, "headline", { enumerable: true, get() { called = true; return "x"; } });
    expect(parseSyntheticIssuerRelease(accessor)).toBeNull(); expect(called).toBe(false);
    expect(parseSyntheticIssuerRelease(Object.assign(Object.create({ bad: true }), syntheticIssuerRelease()))).toBeNull();
    expect(parseSyntheticIssuerRelease({ ...syntheticIssuerRelease(), [Symbol("x")]: true })).toBeNull();
    expect(parseSyntheticIssuerRelease(new Proxy(syntheticIssuerRelease(), { ownKeys() { throw new Error("trap"); } }))).toBeNull();
    const sparse = new Array(1); expect(parseSyntheticIssuerRelease({ ...syntheticIssuerRelease(), assetMentions: sparse })).toBeNull();
    const altered = ["Bitcoin"]; Object.setPrototypeOf(altered, {}); expect(parseSyntheticIssuerRelease({ ...syntheticIssuerRelease(), assetMentions: altered })).toBeNull();
  });
  it("rejects unknown and accessor qualification fields and noncanonical fingerprint without trust minting", () => {
    const q = resolveIssuerReleaseQualification("issuer-ir-release")!;
    expect(parseIssuerReleaseQualification({ ...q, extra: true }).status).toBe("INVALID");
    const accessor = { ...q }; let called = false; Object.defineProperty(accessor, "publisher", { enumerable: true, get() { called = true; return "issuer"; } });
    expect(parseIssuerReleaseQualification(accessor).status).toBe("INVALID"); expect(called).toBe(false);
    expect(parseIssuerReleaseQualification({ ...q, fingerprint: q.fingerprint.toUpperCase() }).status).toBe("INVALID");
  });
  it("rejects raw HTML, native provider-shaped and payload-bearing normal forms", () => {
    const valid = syntheticIssuerRelease();
    expect(parseSyntheticIssuerRelease({ ...valid, rawHtml: "<script>" })).toBeNull();
    expect(parseSyntheticIssuerRelease({ status: "OK", results: [{ title: valid.headline, url: valid.canonicalReleaseUrl }] })).toBeNull();
    expect(parseSyntheticIssuerRelease({ ...valid, payload: "provider-response" })).toBeNull();
  });
  it("drops runtime trust on copy, spread, clone, JSON and parser output", () => {
    const q = resolveIssuerReleaseQualification("issuer-ir-release")!, normal = constructSyntheticNormalForm(syntheticIssuerRelease())!, c = projectIssuerReleaseCandidate(q, normal)!;
    expect(isAuthenticIssuerReleaseCandidate(c)).toBe(true);
    for (const copy of [{ ...c }, Object.assign({}, c), structuredClone(c), JSON.parse(JSON.stringify(c))]) expect(isAuthenticIssuerReleaseCandidate(copy)).toBe(false);
    const parsed = parseSyntheticIssuerRelease(syntheticIssuerRelease()); expect(parsed).not.toBeNull(); expect(projectIssuerReleaseCandidate(q, parsed)).toBeNull();
    expect(projectIssuerReleaseCandidate({ ...q }, normal)).toBeNull(); expect(projectIssuerReleaseCandidate(q, { ...normal })).toBeNull();
  });
  it("requires the exact source qualification scope and rejects blocked source projection", () => {
    const q = resolveIssuerReleaseQualification("issuer-ir-release")!;
    const normal = constructSyntheticNormalForm(syntheticIssuerRelease({ sourceId: "businesswire-release", sourceClass: "ISSUER_AUTHORIZED_DISTRIBUTION" }))!;
    expect(projectIssuerReleaseCandidate(q, normal)).toBeNull();
    expect(projectIssuerReleaseCandidate(resolveIssuerReleaseQualification("issuer-rss-atom"), constructSyntheticNormalForm(syntheticIssuerRelease({ sourceId: "issuer-rss-atom" })))).toBeNull();
  });
  it("rejects origin set duplicates, missing and future material", () => {
    const a = candidate()!;
    expect(sealIssuerReleaseOriginSet({ contractVersion: ISSUER_RELEASE_ORIGIN_SET_VERSION, members: [a, a], declaredMemberCount: 2, evaluatedAsOf: REVIEW_AS_OF, recordedAt: REVIEW_AS_OF })).toBeNull();
    const future = candidate({ publicationAt: "2026-10-03T10:00:00.000Z", discoveredAt: "2026-10-03T10:01:00.000Z", receivedAt: "2026-10-03T10:02:00.000Z", evaluatedAsOf: "2026-10-03T11:00:00.000Z" })!;
    expect(sealIssuerReleaseOriginSet({ contractVersion: ISSUER_RELEASE_ORIGIN_SET_VERSION, members: [future], declaredMemberCount: 1, evaluatedAsOf: REVIEW_AS_OF, recordedAt: REVIEW_AS_OF })).toBeNull();
    expect(sealIssuerReleaseOriginSet({ contractVersion: ISSUER_RELEASE_ORIGIN_SET_VERSION, members: [a], declaredMemberCount: 2, evaluatedAsOf: REVIEW_AS_OF, recordedAt: REVIEW_AS_OF })).toBeNull();
  });
  it("keeps every production operation and approval blocked, and rejects upgrades", () => {
    expect(ISSUER_RELEASE_PRODUCTION.status).toBe("BLOCKED_BACKEND_UNAPPROVED"); freezeDeep(ISSUER_RELEASE_PRODUCTION);
    expect(parseIssuerReleaseProductionConfig({ ...production, operations: { ...production.operations, acquisition: "READY" } })).toBeNull();
    expect(Object.values(ISSUER_RELEASE_PRODUCTION.operations as object).every(x => x === "BLOCKED")).toBe(true);
  });
  it("keeps reviewedAt material but recordedAt outside qualification fingerprint", () => {
    const q = resolveIssuerReleaseQualification("issuer-ir-release")!;
    expect(q.contractVersion).toBe(ISSUER_RELEASE_QUALIFICATION_VERSION);
    // A copied qualification has no trust; parsed forms are configuration validation only.
    expect(parseIssuerReleaseQualification({ ...q, recordedAt: "2026-10-04T00:00:00.000Z" }).status).toBe("VALID");
    expect(isAuthenticIssuerReleaseQualification({ ...q })).toBe(false);
  });
  it("does not leak fixture strings or expose raw payload fields in candidates", () => {
    const c = candidate()!, serialized = JSON.stringify(c);
    expect(serialized).not.toContain("rawHtml"); expect(serialized).not.toContain("apiKey"); expect(serialized).not.toContain("SYNTHETIC_SECRET_SENTINEL");
    expect(c).not.toHaveProperty("rawPayload"); expect(c).not.toHaveProperty("html");
  });
  it("uses SHA-256 length shape without converting financial text through Number", () => {
    const c = candidate({ amountText: "999999999999999999999999.00000001" })!;
    expect(c.amountText).toBe("999999999999999999999999.00000001"); expect(createHash("sha256").update("synthetic").digest("hex")).toHaveLength(64);
  });
});
