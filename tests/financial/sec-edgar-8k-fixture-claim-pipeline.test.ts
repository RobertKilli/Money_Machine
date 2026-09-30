import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../src/domain/intelligence/ingestion-provenance";
import {
  SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION, SEC_EDGAR_8K_FIXTURE_PACKAGE_VERSION,
  SEC_EDGAR_8K_FIXTURE_PIPELINE_VERSION, SEC_EDGAR_8K_FIXTURE_RESULT_KIND,
  createSecEdgar8kFixtureArtifacts, extractSecEdgar8kFixtureClaims,
  isAuthenticSecEdgar8kFixtureArtifact, isAuthenticSecEdgar8kFixtureClaim,
  isAuthenticSecEdgar8kFixtureClaimSet, isAuthenticSecEdgar8kFixturePackage,
  isAuthenticSecEdgar8kFixtureResult, parseSecEdgar8kFixturePackage,
  reconcileSecEdgar8kFixturePackages, rejectSecEdgar8kFixtureClaimAsAuthority,
  runSecEdgar8kFixtureClaimPipeline,
} from "../../src/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { cloneSyntheticFixtures, SEC_EDGAR_8K_SYNTHETIC_FIXTURES, syntheticReceiptVariant } from "../fixtures/sec-edgar-8k-fixture-claim-pipeline";

type Fixture = Record<string, unknown>;
const clone = (value: unknown): Fixture => JSON.parse(JSON.stringify(value)) as Fixture;
const submission = (fixture: Fixture) => fixture.submissions as Record<string, unknown>;
const index = (fixture: Fixture) => fixture.filingIndex as Record<string, unknown>;
const rows = (fixture: Fixture) => (submission(fixture).recent as Record<string, unknown>);
const docs = (fixture: Fixture) => fixture.documents as { filename: string; content: string }[];
const descriptors = (fixture: Fixture) => index(fixture).documents as Record<string, unknown>[];
function rehashDocument(fixture: Fixture, filename: string, update: (text: string) => string): void {
  const doc = docs(fixture).find((item) => item.filename === filename)!;
  doc.content = update(doc.content);
  const canonical = doc.content.replace(/\r\n/g, "\n").normalize("NFC");
  const descriptor = descriptors(fixture).find((item) => item.filename === filename)!;
  descriptor.byteLength = Buffer.byteLength(canonical, "utf8");
  descriptor.contentSha256 = canonicalSha256(Buffer.from(canonical, "utf8").toString("hex"));
}
function invalid(fixture: Fixture): boolean { return runSecEdgar8kFixtureClaimPipeline([fixture]).status === "INVALID"; }

describe("SEC EDGAR fixture claim pipeline", () => {
  it("reconciles synthetic agreement, completed purchase, amendment, and forward-looking intent", () => {
    expect(SEC_EDGAR_8K_SYNTHETIC_FIXTURES).toHaveLength(4);
    const result = runSecEdgar8kFixtureClaimPipeline(cloneSyntheticFixtures());
    expect(result.status).toBe("VALID"); if (result.status !== "VALID") return;
    expect(result.classification).toBe(SEC_EDGAR_8K_FIXTURE_RESULT_KIND);
    expect(result.pipelineVersion).toBe(SEC_EDGAR_8K_FIXTURE_PIPELINE_VERSION);
    expect(result.claims).toHaveLength(4); expect(result.artifacts).toHaveLength(13);
    expect(result.claims.map((claim) => claim.eventTypeCandidate)).toEqual(expect.arrayContaining(["DEFINITIVE_PURCHASE_AGREEMENT", "PURCHASE_COMPLETED", "PURCHASE_INTENT_ANNOUNCED"]));
    const agreement = result.claims.find((claim) => claim.accession === "SYNTH-ACC-AGREE-0001")!;
    const completed = result.claims.find((claim) => claim.accession === "SYNTH-ACC-COMPLETE-0002")!;
    const amendment = result.claims.find((claim) => claim.accession === "SYNTH-ACC-AMEND-0001")!;
    const intent = result.claims.find((claim) => claim.accession === "SYNTH-ACC-INTENT-0003")!;
    expect(agreement.eventTypeCandidate).toBe("DEFINITIVE_PURCHASE_AGREEMENT"); expect(agreement.lifecycleStatusCandidate).toBe("SIGNED"); expect(agreement.completionDate).toBeNull();
    expect(completed.eventTypeCandidate).toBe("PURCHASE_COMPLETED"); expect(completed.lifecycleStatusCandidate).toBe("COMPLETED"); expect(completed.completionDate).toBe("2026-05-12");
    expect(intent.eventTypeCandidate).toBe("PURCHASE_INTENT_ANNOUNCED"); expect(intent.lifecycleStatusCandidate).toBe("INTENT"); expect(intent.expectedClosingDate).not.toBeNull(); expect(intent.completionDate).toBeNull();
    expect(amendment.correctionOfClaimId).toBe(agreement.claimId); expect(amendment.amount).not.toBe(agreement.amount);
    expect(result.correctionLineage).toHaveLength(1); expect(result.correctionLineage[0].relation).toBe("APPEND_ONLY_CORRECTION"); expect(result.correctionLineage[0].correctedField).toBe("AMOUNT");
    expect(result.filings.find((filing) => filing.filing.accession === agreement.accession)?.filingPackageId).toBe(result.correctionLineage[0].originalFilingPackageId);
    expect(result.claimSet.memberCount).toBe(4); expect(result.claimSet.claimIds).toEqual([...result.claimSet.claimIds].sort());
    expect(result.claimSet.artifactIds).toEqual([...result.claimSet.artifactIds].sort()); expect(result.claimSet.locatorKeys).toEqual([...result.claimSet.locatorKeys].sort());
    expect(result.production).toEqual({ acquisition: "BLOCKED", persistence: "BLOCKED", eventAuthority: "BLOCKED", signals: "BLOCKED" });
    expect(result.sideEffects).toEqual({ authority: 0, persistence: 0, signal: 0 });
    expect(JSON.stringify(result)).not.toContain("ITEM|"); expect(JSON.stringify(result)).not.toContain("SYNTHETIC EXHIBIT");
    expect(result.claims.every((claim) => claim.extractionVersion === SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION && claim.locator.length > 0 && /^[0-9a-f]{64}$/.test(claim.excerptFingerprint))).toBe(true);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.claims[0].assetIdentityCandidate)).toBe(true); expect(Object.isFrozen(result.claimSet.claimIds)).toBe(true);
    expect(isAuthenticSecEdgar8kFixtureResult(result)).toBe(true); expect(isAuthenticSecEdgar8kFixtureClaimSet(result.claimSet)).toBe(true);
  });

  it("replays deterministically and isolates receipt/effective-availability changes", () => {
    const original = runSecEdgar8kFixtureClaimPipeline(cloneSyntheticFixtures());
    const replay = runSecEdgar8kFixtureClaimPipeline(cloneSyntheticFixtures());
    const receiptVariant = runSecEdgar8kFixtureClaimPipeline(syntheticReceiptVariant());
    expect(original.status).toBe("VALID"); expect(replay.status).toBe("VALID"); expect(receiptVariant.status).toBe("VALID");
    if (original.status !== "VALID" || replay.status !== "VALID" || receiptVariant.status !== "VALID") return;
    expect(replay.replayFingerprint).toBe(original.replayFingerprint); expect(receiptVariant.replayFingerprint).not.toBe(original.replayFingerprint);
    expect(receiptVariant.claimSet.fingerprint).toBe(original.claimSet.fingerprint);
    expect(receiptVariant.artifacts.map((x) => x.fingerprint)).toEqual(original.artifacts.map((x) => x.fingerprint));
    expect(receiptVariant.claims.map((x) => x.fingerprint)).toEqual(original.claims.map((x) => x.fingerprint));
    expect(receiptVariant.claims.map((x) => x.receivedAt)).not.toEqual(original.claims.map((x) => x.receivedAt));
  });

  it("seals runtime trust at each stage and never promotes a claim to event authority", () => {
    const fixture = clone(SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0]);
    expect(parseSecEdgar8kFixturePackage(fixture).status).toBe("VALID");
    expect(isAuthenticSecEdgar8kFixturePackage(fixture as never)).toBe(false);
    const packageResult = reconcileSecEdgar8kFixturePackages([fixture]); expect(packageResult).not.toBeNull(); if (!packageResult) return;
    const filing = packageResult[0]; expect(isAuthenticSecEdgar8kFixturePackage(filing)).toBe(true);
    expect(createSecEdgar8kFixtureArtifacts({ ...filing })).toBeNull();
    const artifacts = createSecEdgar8kFixtureArtifacts(filing); expect(artifacts).not.toBeNull(); if (!artifacts) return;
    expect(artifacts.every(isAuthenticSecEdgar8kFixtureArtifact)).toBe(true);
    expect(extractSecEdgar8kFixtureClaims(filing, artifacts.filter((artifact) => artifact.kind !== "EXHIBIT"))).toBeNull();
    expect(createSecEdgar8kFixtureArtifacts(JSON.parse(JSON.stringify(filing)) as typeof filing)).toBeNull();
    expect(extractSecEdgar8kFixtureClaims(filing, artifacts)).toHaveLength(1);
    const result = runSecEdgar8kFixtureClaimPipeline([fixture]); expect(result.status).toBe("VALID"); if (result.status !== "VALID") return;
    const claim = result.claims[0]; expect(isAuthenticSecEdgar8kFixtureClaim(claim)).toBe(true);
    expect(isAuthenticSecEdgar8kFixtureClaim({ ...claim })).toBe(false); expect(isAuthenticSecEdgar8kFixtureClaim(JSON.parse(JSON.stringify(claim)))).toBe(false);
    expect(isAuthenticSecEdgar8kFixtureClaim({ ...claim, sourceArtifactId: "fabricated" })).toBe(false);
    expect(rejectSecEdgar8kFixtureClaimAsAuthority(claim)).toBeNull(); expect(rejectSecEdgar8kFixtureClaimAsAuthority({ ...claim })).toBeNull();
    expect(isAuthenticSecEdgar8kFixtureArtifact({ ...artifacts[0] })).toBe(false);
  });

  it("strictly rejects unsafe records, arrays, unknown fields and unsupported input", () => {
    const source = clone(SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0]);
    expect(parseSecEdgar8kFixturePackage({ ...source, extra: true }).status).toBe("INVALID");
    expect(parseSecEdgar8kFixturePackage(Object.assign(Object.create({ inherited: true }), source)).status).toBe("INVALID");
    expect(parseSecEdgar8kFixturePackage(Object.assign(Object.create(null), source)).status).toBe("INVALID");
    expect(parseSecEdgar8kFixturePackage({ ...source, [Symbol("hidden")]: true }).status).toBe("INVALID");
    const accessor = { ...source }; Object.defineProperty(accessor, "contractVersion", { get: () => SEC_EDGAR_8K_FIXTURE_PACKAGE_VERSION }); expect(parseSecEdgar8kFixturePackage(accessor).status).toBe("INVALID");
    Object.defineProperty(Object.prototype, "secFixturePollution", { value: true, configurable: true });
    try { expect(parseSecEdgar8kFixturePackage(source).status).toBe("INVALID"); } finally { Reflect.deleteProperty(Object.prototype, "secFixturePollution"); }
    const unsafe = clone(source); const unsafeRecent = rows(unsafe); unsafeRecent.form = Object.setPrototypeOf(["8-K"], { polluted: true }); expect(parseSecEdgar8kFixturePackage(unsafe).status).toBe("INVALID");
    expect(SEC_EDGAR_8K_FIXTURE_PACKAGE_VERSION).toBe("sec-edgar-8k-fixture-package/v1");
  });

  it("rejects reconciliation, identity, timestamp, path, descriptor and document mismatches", () => {
    const bad = clone(SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0]);
    const c1 = clone(bad); index(c1).cik = "SYNTH-CIK-9999"; expect(invalid(c1)).toBe(true);
    const c2 = clone(bad); rows(c2).accessionNumber = ["SYNTH-ACC-OTHER-0001"]; expect(invalid(c2)).toBe(true);
    const c3 = clone(bad); rows(c3).form = ["6-K"]; index(c3).form = "6-K"; expect(invalid(c3)).toBe(true);
    const c4 = clone(bad); rows(c4).primaryDocument = ["other.txt"]; expect(invalid(c4)).toBe(true);
    const c5 = clone(bad); rows(c5).filingDate = ["2026-02-30"]; index(c5).filingDate = "2026-02-30"; expect(invalid(c5)).toBe(true);
    const c6 = clone(bad); index(c6).archivePath = "/synthetic-edgar/archive/../escape"; expect(invalid(c6)).toBe(true);
    const c7 = clone(bad); (rows(c7).acceptanceDateTime as string[]).push("2026-04-10T14:05:10.000Z"); expect(invalid(c7)).toBe(true);
    const c8 = clone(bad); (rows(c8).accessionNumber as string[]).push("SYNTH-ACC-AGREE-0001"); (rows(c8).form as string[]).push("8-K"); (rows(c8).filingDate as string[]).push("2026-04-10"); (rows(c8).reportDate as (string | null)[]).push("2026-04-09"); (rows(c8).acceptanceDateTime as string[]).push("2026-04-10T14:05:10.000Z"); (rows(c8).primaryDocument as string[]).push("agreement.txt"); expect(invalid(c8)).toBe(true);
    const c9 = clone(bad); descriptors(c9)[0].contentSha256 = "0".repeat(64); expect(invalid(c9)).toBe(true);
    const c10 = clone(bad); descriptors(c10)[0].byteLength = 1; expect(invalid(c10)).toBe(true);
    const c11 = clone(bad); docs(c11).push({ filename: "extra.txt", content: "EXTRA" }); expect(invalid(c11)).toBe(true);
    const c12 = clone(bad); docs(c12).shift(); expect(invalid(c12)).toBe(true);
    const c13 = clone(bad); index(c13).primaryDocument = "../agreement.txt"; expect(invalid(c13)).toBe(true);
    const c14 = clone(bad); index(c14).archivePath = "https://sec.invalid/filing"; expect(invalid(c14)).toBe(true);
    const c15 = clone(bad); docs(c15)[0].content = "<script>unsafe</script>"; expect(invalid(c15)).toBe(true);
    const c16 = clone(bad); docs(c16)[0].content = "resource https://example.invalid/doc"; expect(invalid(c16)).toBe(true);
    const c17 = clone(bad); descriptors(c17)[0].contentType = "text/html; charset=utf-8"; expect(invalid(c17)).toBe(true);
    const c18 = clone(bad); docs(c18)[0].content = "x".repeat(40_000); expect(invalid(c18)).toBe(true);
    const c19 = clone(bad); const indexDocs = index(c19).documents as Record<string, unknown>[]; indexDocs[1].sequence = 1; expect(invalid(c19)).toBe(true);
    const c20 = clone(bad); index(c20).requiredEvidenceFilenames = ["missing.txt"]; expect(invalid(c20)).toBe(true);
    const c21 = clone(bad); (c21.receipt as Record<string, unknown>).effectiveAvailableAt = "2026-04-10T14:04:00.000Z"; expect(invalid(c21)).toBe(true);
  });

  it("enforces item/lifecycle, explicit amount, currency, and amendment semantics", () => {
    const source = SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0] as Fixture;
    const c1 = clone(source); rehashDocument(c1, "agreement.txt", (text) => text.replace("LIFECYCLE|SIGNED", "LIFECYCLE|COMPLETED")); expect(invalid(c1)).toBe(true);
    const c2 = clone(source); rehashDocument(c2, "agreement.txt", (text) => text.replace("EVENT|DEFINITIVE_PURCHASE_AGREEMENT", "EVENT|PURCHASE_COMPLETED")); expect(invalid(c2)).toBe(true);
    const c3 = clone(source); rehashDocument(c3, "agreement.txt", (text) => text.replace("COMPLETION_DATE|-", "COMPLETION_DATE|2026-09-30")); expect(invalid(c3)).toBe(true);
    const c4 = clone(source); rehashDocument(c4, "agreement.txt", (text) => text.replace("AMOUNT_CLASS|EXACT", "AMOUNT_CLASS|MAXIMUM")); expect(invalid(c4)).toBe(true);
    const c5 = clone(source); rehashDocument(c5, "agreement.txt", (text) => text.replace("CURRENCY|SYNTH-CUR-01", "CURRENCY|-")); expect(invalid(c5)).toBe(true);
    const c6 = clone(SEC_EDGAR_8K_SYNTHETIC_FIXTURES[2]); index(c6).amendmentOfAccession = null; expect(invalid(c6)).toBe(true);
    const c7 = clone(SEC_EDGAR_8K_SYNTHETIC_FIXTURES[2]); index(c7).amendmentOfAccession = "SYNTH-ACC-COMPLETE-0002"; rehashDocument(c7, "amendment.txt", (text) => text.replace("SYNTH-ACC-AGREE-0001", "SYNTH-ACC-COMPLETE-0002")); expect(runSecEdgar8kFixtureClaimPipeline([SEC_EDGAR_8K_SYNTHETIC_FIXTURES[1], c7]).status).toBe("INVALID");
    expect(runSecEdgar8kFixtureClaimPipeline([SEC_EDGAR_8K_SYNTHETIC_FIXTURES[2]]).status).toBe("INVALID");
  });

  it("rejects unresolved conflicting claims, preserves correction history, and has no authority side effect", () => {
    const original = clone(SEC_EDGAR_8K_SYNTHETIC_FIXTURES[0]);
    rows(original).accessionNumber = ["SYNTH-ACC-AGREE-0009"]; index(original).accession = "SYNTH-ACC-AGREE-0009";
    index(original).archivePath = "/synthetic-edgar/archive/SYNTH-CIK-0001/SYNTH-ACC-AGREE-0009/index.txt";
    rehashDocument(original, "agreement.txt", (text) => text.replace("AMOUNT|1250000", "AMOUNT|990000"));
    const expected = original.expected as Record<string, unknown>; expected.amount = "990000";
    const conflict = runSecEdgar8kFixtureClaimPipeline([...cloneSyntheticFixtures(), original]); expect(conflict.status).toBe("INVALID");
    const result = runSecEdgar8kFixtureClaimPipeline(cloneSyntheticFixtures()); expect(result.status).toBe("VALID"); if (result.status !== "VALID") return;
    expect(result.claims.some((claim) => claim.claimId === result.correctionLineage[0].originalClaimId)).toBe(true);
    expect(result.claims.some((claim) => claim.claimId === result.correctionLineage[0].amendedClaimId)).toBe(true);
    expect(rejectSecEdgar8kFixtureClaimAsAuthority(result.claims[0])).toBeNull();
    expect(result.sideEffects).toEqual({ authority: 0, persistence: 0, signal: 0 });
  });
});
