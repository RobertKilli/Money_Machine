import { describe, expect, it } from "vitest";
import productionConfig from "../../config/intelligence/event-intelligence-exchange-announcement.production.json";
import {
  EXCHANGE_ANNOUNCEMENT_CATEGORIES, EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, EXCHANGE_ANNOUNCEMENT_PRODUCTION_VERSION,
  compareExchangeAnnouncementCandidates, isAuthenticExchangeAnnouncementQualification,
  listExchangeAnnouncementQualifications, parseExchangeAnnouncementProductionConfig, parseExchangeAnnouncementQualification,
  parseSyntheticExchangeAnnouncement, projectExchangeAnnouncementCandidate, rejectExchangeAnnouncementAsAuthority,
  resolveExchangeAnnouncementQualification, sealExchangeAnnouncementOriginSet,
} from "../../src/domain/intelligence/event-intelligence-exchange-regulatory-announcement-source-qualification";
import { constructSyntheticAnnouncement, compareFingerprintMaterial } from "test-only:exchange-announcement-normal-form";
import { EXCHANGE_REVIEW_AS_OF, syntheticExchangeAnnouncement } from "../fixtures/event-intelligence-exchange-announcement";

function candidate(overrides: Parameters<typeof syntheticExchangeAnnouncement>[0] = {}) {
  const material = syntheticExchangeAnnouncement(overrides), q = resolveExchangeAnnouncementQualification(material.sourceCandidateId)!;
  const trusted = constructSyntheticAnnouncement(material);
  return projectExchangeAnnouncementCandidate(q, trusted);
}
function asx(overrides: Parameters<typeof syntheticExchangeAnnouncement>[0] = {}) {
  return {
    ...syntheticExchangeAnnouncement(), sourceCandidateId: "asx-company-announcements", jurisdiction: "AU", operator: "Australian Securities Exchange", sourceRole: "EXCHANGE_ISSUER_ANNOUNCEMENT" as const,
    canonicalAnnouncementUrl: "https://www.asx.com.au/markets/trade-our-cash-market/announcements.cgl", canonicalDocumentUrl: "https://www.asx.com.au/asx/v2/announcements/20261002/pdf/123456.pdf",
    sourceLocator: "announcement:synthetic-asx-001", ...overrides,
  };
}
function frozenDeep(value: unknown): void { if (!value || typeof value !== "object") return; expect(Object.isFrozen(value)).toBe(true); for (const child of Object.values(value)) frozenDeep(child); }

describe("exchange/regulatory announcement source qualification", () => {
  it("pins source roles and strict partial/out-of-scope statuses", () => {
    const rows = listExchangeAnnouncementQualifications();
    expect(rows.map(x => x.sourceCandidateId)).toEqual(["lse-rns", "asx-company-announcements", "nyse-corporate-actions", "nasdaq-exchange-announcements", "nasdaq-issuer-ir-index"]);
    expect(rows.map(x => x.qualificationStatus)).toEqual(["PARTIAL_REGULATORY_DISCLOSURE_CANDIDATE", "PARTIAL_EXCHANGE_DISCLOSURE_CANDIDATE", "OUT_OF_SCOPE", "OUT_OF_SCOPE", "PARTIAL_DISCOVERY_ONLY"]);
    expect(rows.every(isAuthenticExchangeAnnouncementQualification)).toBe(true); rows.forEach(frozenDeep);
  });
  it("projects an LSE/RNS purchase-intent candidate, not event truth", () => {
    const c = candidate({ headline: "Issuer considers a Bitcoin purchase", categoryHint: "PURCHASE_INTENT", amountText: "250.00000000", currencyText: "BTC" })!;
    expect(c.status).toBe("NON_AUTHORITATIVE_DISCOVERY_CANDIDATE"); expect(c.categoryHint).toBe("PURCHASE_INTENT"); expect(c.eventAuthorityEligible).toBe(false); expect(c.amountText).toBe("250.00000000"); frozenDeep(c);
  });
  it("keeps binding agreement and expected closing distinct from completion", () => {
    for (const categoryHint of ["BINDING_AGREEMENT", "EXPECTED_CLOSING", "COMPLETED_PURCHASE_CLAIM"] as const) {
      const c = candidate({ categoryHint })!; expect(c.categoryHint).toBe(categoryHint); expect(c.status).toBe("NON_AUTHORITATIVE_DISCOVERY_CANDIDATE"); expect(c.eventAuthorityEligible).toBe(false);
    }
  });
  it("projects ASX issuer announcements as issuer-submitted, non-authoritative candidates", () => {
    const c = candidate(asx({ categoryHint: "COMPLETED_ACQUISITION_CLAIM", marketSensitive: true }))!;
    expect(c.jurisdiction).toBe("AU"); expect(c.sourceRole).toBe("EXCHANGE_ISSUER_ANNOUNCEMENT"); expect(c.disclosureAuthorityEligible).toBe(false);
  });
  it("keeps NYSE corporate actions out of treasury-purchase scope", () => {
    const q = resolveExchangeAnnouncementQualification("nyse-corporate-actions")!;
    expect(q.sourceRole).toBe("CORPORATE_ACTION_NOTICE"); expect(q.qualificationStatus).toBe("OUT_OF_SCOPE");
    expect(constructSyntheticAnnouncement({ ...syntheticExchangeAnnouncement(), sourceCandidateId: "nyse-corporate-actions", jurisdiction: "US", operator: "NYSE Group", sourceRole: "CORPORATE_ACTION_NOTICE", categoryHint: "UNRELATED_CORPORATE_ACTION" })).toBeNull();
  });
  it("does not classify Nasdaq IR or GlobeNewswire material as Nasdaq exchange authority", () => {
    const exchange = resolveExchangeAnnouncementQualification("nasdaq-exchange-announcements")!, ir = resolveExchangeAnnouncementQualification("nasdaq-issuer-ir-index")!;
    expect(exchange.sourceRole).toBe("OUT_OF_SCOPE"); expect(ir.sourceRole).toBe("DISCOVERY_INDEX"); expect(ir.qualificationStatus).toBe("PARTIAL_DISCOVERY_ONLY");
    expect(constructSyntheticAnnouncement({ ...syntheticExchangeAnnouncement(), sourceCandidateId: "nasdaq-exchange-announcements", jurisdiction: "US", operator: "Nasdaq Exchange", sourceRole: "OUT_OF_SCOPE" })).toBeNull();
  });
  it("treats market-sensitive markers as metadata and permits only hint categories", () => {
    const c = candidate({ marketSensitive: true, categoryHint: "TREASURY_POLICY" })!; expect(c.marketSensitive).toBe(true); expect(c.eventAuthorityEligible).toBe(false);
    expect(EXCHANGE_ANNOUNCEMENT_CATEGORIES).toContain("UNRELATED_CORPORATE_ACTION");
  });
  it.each(["CORRECTION_HINT", "REPLACEMENT_HINT", "WITHDRAWAL_HINT", "UNKNOWN"] as const)("preserves %s as a hint without creating lineage", lifecycleHint => {
    const c = candidate({ lifecycleHint })!; expect(c.lifecycleHint).toBe(lifecycleHint); expect(c.correctionLineageEligible).toBe(false); expect(rejectExchangeAnnouncementAsAuthority(c, "CORRECTION_LINEAGE")).toBeNull();
  });
  it("keeps historical material separate from a later correction hint", () => {
    const original = candidate()!, later = candidate({ headline: "Corrected treasury policy amount", lifecycleHint: "CORRECTION_HINT", publishedAt: "2026-10-03T10:00:01.000Z", discoveredAt: "2026-10-03T10:00:02.000Z", receivedAt: "2026-10-03T10:00:03.000Z", evaluatedAsOf: "2026-10-03T10:00:04.000Z" });
    expect(later).not.toBeNull();
    expect(sealExchangeAnnouncementOriginSet({ contractVersion: EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, members: [original, later], declaredMemberCount: 2, evaluatedAsOf: EXCHANGE_REVIEW_AS_OF, recordedAt: EXCHANGE_REVIEW_AS_OF })).toBeNull();
    expect(sealExchangeAnnouncementOriginSet({ contractVersion: EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, members: [original], declaredMemberCount: 1, evaluatedAsOf: EXCHANGE_REVIEW_AS_OF, recordedAt: EXCHANGE_REVIEW_AS_OF })?.members).toHaveLength(1);
  });
  it("treats dual listings and same tickers on different exchanges as separate candidates", () => {
    const lse = candidate({ issuerIdentifiers: [{ scheme: "TICKER", value: "ABC", scope: "LISTED_SECURITY_CANDIDATE" }] })!;
    const asxCandidate = candidate(asx({ issuerIdentifiers: [{ scheme: "TICKER", value: "ABC", scope: "LISTED_SECURITY_CANDIDATE" }] }))!;
    expect(lse.sourceMaterialFingerprint).not.toBe(asxCandidate.sourceMaterialFingerprint); expect(compareExchangeAnnouncementCandidates(lse, asxCandidate)).toBe("DISTINCT_UNVERIFIED_MATERIAL");
  });
  it("keeps parent/subsidiary candidates, CIK and non-US identifiers separate", () => {
    const parent = candidate({ issuerIdentifiers: [{ scheme: "LEI", value: "549300EXAMPLE00000001", scope: "ISSUER_CANDIDATE" }] })!;
    const subsidiary = candidate({ issuerDisplayName: "Example Treasury Pty Ltd", issuerIdentifiers: [{ scheme: "LOCAL_SECURITY_CODE", value: "EXM-AU", scope: "LISTED_SECURITY_CANDIDATE" }] })!;
    expect(parent.sourceMaterialFingerprint).not.toBe(subsidiary.sourceMaterialFingerprint);
    expect(candidate({ issuerIdentifiers: [{ scheme: "CIK", value: "0000000001", scope: "ISSUER_CANDIDATE" }] })).not.toBeNull();
  });
  it("keeps issuer versus listed-security versus depositary-receipt identifiers typed", () => {
    const security = candidate()!, receipt = candidate({ issuerIdentifiers: [{ scheme: "TICKER", value: "EXM", scope: "DEPOSITARY_RECEIPT_CANDIDATE" }] })!;
    expect(security.sourceMaterialFingerprint).not.toBe(receipt.sourceMaterialFingerprint);
  });
  it("binds PDF and announcement as one origin only with an explicit issuer/id/origin tuple", () => {
    const page = candidate()!, pdfCopy = candidate({ canonicalDocumentUrl: "https://www.londonstockexchange.com/news-article/EXM/treasury-policy/2026-10-02-copy.pdf", sourceLocator: "document:synthetic-rns-001" })!;
    const set = sealExchangeAnnouncementOriginSet({ contractVersion: EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, members: [page, pdfCopy], declaredMemberCount: 2, evaluatedAsOf: EXCHANGE_REVIEW_AS_OF, recordedAt: EXCHANGE_REVIEW_AS_OF });
    expect(set?.groups).toHaveLength(1); expect(set?.groups[0]?.independentCorroborationCount).toBe(0);
  });
  it("groups issuer IR/exchange copies only on the same explicit origin binding", () => {
    const lse = candidate()!, copy = candidate(asx({ originBinding: lse.originBinding, issuerIdentifiers: lse.issuerIdentifiers, headline: lse.headline }))!;
    const set = sealExchangeAnnouncementOriginSet({ contractVersion: EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, members: [lse, copy], declaredMemberCount: 2, evaluatedAsOf: EXCHANGE_REVIEW_AS_OF, recordedAt: EXCHANGE_REVIEW_AS_OF });
    expect(set?.groups).toHaveLength(1); expect(set?.groups[0]?.independentCorroborationCount).toBe(0);
  });
  it("does not merge equal headlines from different issuers", () => {
    const a = candidate()!, b = candidate({ issuerDisplayName: "Other Holdings plc", issuerIdentifiers: [{ scheme: "TICKER", value: "OTH", scope: "LISTED_SECURITY_CANDIDATE" }], announcementId: "rns-announcement-2026-10-02-002", canonicalAnnouncementUrl: "https://www.londonstockexchange.com/news-article/OTH/treasury-policy/2026-10-02", originBinding: null });
    expect(a.headline).toBe(b?.headline); expect(compareExchangeAnnouncementCandidates(a, b)).toBe("DISTINCT_UNVERIFIED_MATERIAL");
  });
  it("rejects same announcement ID with changed material as a local variant, not overwrite", () => {
    const a = candidate()!, b = candidate({ headline: "Changed amount in treasury policy" })!;
    expect(compareExchangeAnnouncementCandidates(a, b)).toBe("SAME_ANNOUNCEMENT_ID_MATERIAL_VARIANT"); expect(a.headline).not.toBe(b.headline);
  });
  it("keeps identity stable over receipt and recorded review time while receipt provenance changes", () => {
    const a = candidate()!, b = candidate({ discoveredAt: "2026-10-02T09:01:00.000Z", receivedAt: "2026-10-02T09:01:01.000Z", payloadFingerprint: "b".repeat(64) })!;
    expect(a.sourceMaterialFingerprint).toBe(b.sourceMaterialFingerprint); expect(a.receiptFingerprint).not.toBe(b.receiptFingerprint);
    const q = resolveExchangeAnnouncementQualification("lse-rns")!, copy = { ...q, recordedAt: "2026-10-04T00:00:00.000Z" };
    const replay = parseExchangeAnnouncementQualification(copy); expect(replay.status).toBe("VALID");
    if (replay.status === "VALID") expect(replay.qualification.fingerprint).toBe(q.fingerprint);
  });
  it("binds document material fingerprint to identity while keeping payload fingerprint in receipt provenance", () => {
    const original = candidate()!;
    const payloadOnly = candidate({ payloadFingerprint: "d".repeat(64), receivedAt: "2026-10-02T09:01:00.000Z", discoveredAt: "2026-10-02T09:00:59.000Z" })!;
    const changedMaterial = candidate({ materialFingerprint: "e".repeat(64) })!;
    expect(payloadOnly.sourceMaterialFingerprint).toBe(original.sourceMaterialFingerprint);
    expect(payloadOnly.receiptFingerprint).not.toBe(original.receiptFingerprint);
    expect(changedMaterial.sourceMaterialFingerprint).not.toBe(original.sourceMaterialFingerprint);
    expect(compareExchangeAnnouncementCandidates(original, changedMaterial)).toBe("SAME_ANNOUNCEMENT_ID_MATERIAL_VARIANT");
  });
  it("detects fingerprint/material collision using canonical equality", () => {
    const fp = "f".repeat(64);
    expect(compareFingerprintMaterial(fp, { headline: "A", url: "https://a.example/x" }, fp, { url: "https://a.example/x", headline: "B" })).toBe("FINGERPRINT_MATERIAL_CONFLICT");
    expect(compareFingerprintMaterial(fp, { headline: "A", url: "https://a.example/x" }, fp, { url: "https://a.example/x", headline: "A" })).toBe("SAME_MATERIAL");
  });
  it("supports local identity when no provider-stable announcement ID exists", () => {
    const c = candidate({ announcementId: null, originBinding: null })!; expect(c.announcementId).toBeNull(); expect(c.candidateId).toMatch(/^exchange-announcement-candidate:[a-f0-9]{64}$/);
  });
  it("requires exact profile scope and approved hosts even for synthetic normal forms", () => {
    expect(constructSyntheticAnnouncement({ ...syntheticExchangeAnnouncement(), sourceCandidateId: "asx-company-announcements" })).toBeNull();
    expect(constructSyntheticAnnouncement({ ...syntheticExchangeAnnouncement(), canonicalAnnouncementUrl: "https://evil-londonstockexchange.com/news/1" })).toBeNull();
    expect(constructSyntheticAnnouncement({ ...syntheticExchangeAnnouncement(), canonicalAnnouncementUrl: "https://news.londonstockexchange.com/news/1" })).toBeNull();
    expect(constructSyntheticAnnouncement({ ...asx(), canonicalDocumentUrl: "https://attacker.example/document.pdf" })).toBeNull();
  });
  it.each([
    { canonicalAnnouncementUrl: "javascript:alert(1)" }, { canonicalAnnouncementUrl: "https://user:pass@www.londonstockexchange.com/x" },
    { canonicalAnnouncementUrl: "https://www.londonstockexchange.com/x#fragment" }, { canonicalAnnouncementUrl: "https://www.londonstockexchange.com/a/../b" },
    { issuerDisplayName: "Issuer\u202e spoof" }, { headline: "x".repeat(513) }, { amountText: "0\u200b1" },
    { publishedAt: "2026-10-02T09:00:00Z" }, { sourceLocator: "../private" }, { announcementId: "https://bad.example/id" },
  ])("rejects unsafe normal-form value %#", value => expect(constructSyntheticAnnouncement({ ...syntheticExchangeAnnouncement(), ...value })).toBeNull());
  it("rejects inherited, accessor, symbol, Proxy, sparse, boxed and prototype-mutated shapes without getter execution", () => {
    let invoked = false; const accessor = { ...syntheticExchangeAnnouncement() }; Object.defineProperty(accessor, "headline", { enumerable: true, get() { invoked = true; return "x"; } });
    expect(parseSyntheticExchangeAnnouncement(accessor)).toBeNull(); expect(invoked).toBe(false);
    expect(parseSyntheticExchangeAnnouncement(Object.assign(Object.create({ inherited: 1 }), syntheticExchangeAnnouncement()))).toBeNull();
    expect(parseSyntheticExchangeAnnouncement({ ...syntheticExchangeAnnouncement(), [Symbol("s")]: true })).toBeNull();
    expect(parseSyntheticExchangeAnnouncement(new Proxy(syntheticExchangeAnnouncement(), { ownKeys() { throw new Error("trap"); } }))).toBeNull();
    const sparse = new Array(1); expect(parseSyntheticExchangeAnnouncement({ ...syntheticExchangeAnnouncement(), assetMentions: sparse })).toBeNull();
    const changed = ["BTC"]; Object.setPrototypeOf(changed, {}); expect(parseSyntheticExchangeAnnouncement({ ...syntheticExchangeAnnouncement(), assetMentions: changed })).toBeNull();
    expect(parseSyntheticExchangeAnnouncement(Object("boxed"))).toBeNull();
  });
  it("keeps parser output and cloned/copy qualifications untrusted", () => {
    const q = resolveExchangeAnnouncementQualification("lse-rns")!, parsed = parseExchangeAnnouncementQualification(q);
    expect(parsed.status).toBe("VALID"); if (parsed.status === "VALID") expect(isAuthenticExchangeAnnouncementQualification(parsed.qualification)).toBe(false);
    for (const copy of [{ ...q }, structuredClone(q), JSON.parse(JSON.stringify(q))]) expect(projectExchangeAnnouncementCandidate(copy, constructSyntheticAnnouncement(syntheticExchangeAnnouncement()))).toBeNull();
    expect(projectExchangeAnnouncementCandidate(q, parseSyntheticExchangeAnnouncement(syntheticExchangeAnnouncement()))).toBeNull();
  });
  it("rejects source-role, jurisdiction and status mismatches", () => {
    const raw = resolveExchangeAnnouncementQualification("lse-rns")!;
    expect(parseExchangeAnnouncementQualification({ ...raw, jurisdiction: "AU" }).status).toBe("INVALID");
    expect(constructSyntheticAnnouncement({ ...syntheticExchangeAnnouncement(), sourceRole: "EXCHANGE_ISSUER_ANNOUNCEMENT" })).toBeNull();
    expect(constructSyntheticAnnouncement({ ...syntheticExchangeAnnouncement(), jurisdiction: "AU" })).toBeNull();
  });
  it("requires origin binding material agreement and leaves absent IDs unresolved", () => {
    expect(constructSyntheticAnnouncement({ ...syntheticExchangeAnnouncement(), originBinding: { issuerCandidateId: "issuer-example-candidate", announcementId: "other-id", canonicalOriginUrl: "https://issuer.example/announcement/1" } })).toBeNull();
    const noIdA = candidate({ announcementId: null, originBinding: null })!, noIdB = candidate({ announcementId: null, originBinding: null, sourceLocator: "announcement:other-local-material" })!;
    const set = sealExchangeAnnouncementOriginSet({ contractVersion: EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, members: [noIdA, noIdB], declaredMemberCount: 2, evaluatedAsOf: EXCHANGE_REVIEW_AS_OF, recordedAt: EXCHANGE_REVIEW_AS_OF });
    expect(set?.groups).toHaveLength(2); expect(set?.groups.every(g => g.basis === "UNRESOLVED_SINGLETON")).toBe(true);
  });
  it("seals exact origin set and rejects duplicates, missing members and future material", () => {
    const c = candidate()!;
    expect(sealExchangeAnnouncementOriginSet({ contractVersion: EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, members: [c, c], declaredMemberCount: 2, evaluatedAsOf: EXCHANGE_REVIEW_AS_OF, recordedAt: EXCHANGE_REVIEW_AS_OF })).toBeNull();
    expect(sealExchangeAnnouncementOriginSet({ contractVersion: EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, members: [c], declaredMemberCount: 2, evaluatedAsOf: EXCHANGE_REVIEW_AS_OF, recordedAt: EXCHANGE_REVIEW_AS_OF })).toBeNull();
    const future = candidate({ publishedAt: "2026-10-04T09:00:00.000Z", discoveredAt: "2026-10-04T09:00:01.000Z", receivedAt: "2026-10-04T09:00:02.000Z", evaluatedAsOf: "2026-10-04T09:00:03.000Z" });
    expect(sealExchangeAnnouncementOriginSet({ contractVersion: EXCHANGE_ANNOUNCEMENT_ORIGIN_SET_VERSION, members: [future], declaredMemberCount: 1, evaluatedAsOf: EXCHANGE_REVIEW_AS_OF, recordedAt: EXCHANGE_REVIEW_AS_OF })).toBeNull();
  });
  it("keeps BTC, ETH, WETH and representations as mention candidates", () => {
    const c = candidate({ assetMentions: ["BTC", "ETH", "WETH", "Wrapped Ether", "native ETH", "bridged ETH"] })!;
    expect(c.assetMentions).toEqual(["BTC", "ETH", "WETH", "Wrapped Ether", "bridged ETH", "native ETH"]); expect(c.assetMappingEligible).toBe(false);
  });
  it("rejects all authority, signal and trade handoffs", () => {
    const c = candidate()!; for (const boundary of ["ISSUER_MAPPING", "ASSET_MAPPING", "CORRECTION_LINEAGE", "CORROBORATION", "ISSUER_DISCLOSURE_AUTHORITY", "EVENT_AUTHORITY", "PERSISTENCE", "SIGNAL", "TRADING"] as const) expect(rejectExchangeAnnouncementAsAuthority(c, boundary)).toBeNull();
  });
  it("keeps production source registry, operations and approvals blocked", () => {
    const parsed = parseExchangeAnnouncementProductionConfig(productionConfig)!; frozenDeep(parsed);
    expect(parsed.status).toBe("BLOCKED_BACKEND_UNAPPROVED"); expect(parsed.selectedSource).toBeNull();
    expect(parseExchangeAnnouncementProductionConfig({ ...productionConfig, selectedSource: "lse-rns" })).toBeNull();
    expect(parseExchangeAnnouncementProductionConfig({ ...productionConfig, credentialReference: "API_KEY" })).toBeNull();
    expect(parseExchangeAnnouncementProductionConfig({ ...productionConfig, approvals: productionConfig.approvals.slice(1) })).toBeNull();
    expect(EXCHANGE_ANNOUNCEMENT_PRODUCTION_VERSION).toBe(productionConfig.contractVersion);
  });
  it("does not mutate caller-owned arrays or records", () => {
    const input = syntheticExchangeAnnouncement(), before = JSON.stringify(input); candidate(input); expect(JSON.stringify(input)).toBe(before);
  });
});
