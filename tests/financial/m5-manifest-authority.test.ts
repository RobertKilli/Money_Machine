import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { M5_EVIDENCE_MANIFEST_VERSION, type M5DatasetPin, type M5EvidenceManifest, type M5EvidenceSemanticCompatibility } from "@/application/intelligence/assemble-m5-evidence";
import { createM5ManifestAuthority, m5ManifestAuthorityIdFor, type M5ManifestAuthorityRecord } from "@/application/intelligence/m5-manifest-authority";
import { produceCanonicalM5FromAuthority } from "@/application/intelligence/produce-canonical-m5-from-authority";
import { createM5ManifestAuthorityRepository } from "@/infrastructure/postgres/m5-manifest-authority-repository";

const asOf = "2026-09-13T00:00:00.000Z";
const sourceContext = () => ({ candidateId: "candidate", assetId: "asset", canonicalIdentifier: "asset:one", assetClass: "CRYPTO", asOf, providerDatasetPins: [{ providerId: "provider-a", datasetVersion: "v1" }, { providerId: "provider-b", datasetVersion: "v2" }], relevantEvidence: [] });
const pins: readonly M5DatasetPin[] = [{ providerId: "provider-b", datasetId: "dataset-b", datasetVersion: "v2" }, { providerId: "provider-a", datasetId: "dataset-a", datasetVersion: "v1" }];
const manifest = (overrides: Partial<M5EvidenceManifest> = {}): M5EvidenceManifest => ({ version: M5_EVIDENCE_MANIFEST_VERSION, age: { evidenceId: "age", fingerprint: "age-fingerprint" }, historySpan: { evidenceId: "history", fingerprint: "history-fingerprint" }, liquidity: { evidenceId: "liquidity", fingerprint: "liquidity-fingerprint" }, volume: { evidenceId: "volume", fingerprint: "volume-fingerprint" }, marketCap: { evidenceId: "cap", fingerprint: "cap-fingerprint" }, top10HolderConcentration: { evidenceId: "top10", fingerprint: "top10-fingerprint" }, singleHolderConcentration: { evidenceId: "single", fingerprint: "single-fingerprint" }, volatility: { evidenceId: "volatility", fingerprint: "volatility-fingerprint" }, venues: [{ evidenceId: "venue-b", fingerprint: "venue-b-fingerprint" }, { evidenceId: "venue-a", fingerprint: "venue-a-fingerprint" }], suspicious: [], ...overrides });
const compatibility = (overrides: Partial<M5EvidenceSemanticCompatibility> = {}): M5EvidenceSemanticCompatibility => ({ version: "m5-compatibility/v1", permittedAgeBases: ["LISTING", "ASSET_INCEPTION"], ageCalculationVersion: "age-days/v1", historySpanSemanticsVersions: ["history/v1"], historySpanQualificationBases: ["QUALIFYING"], volatilitySemanticsVersions: ["volatility/v1"], monetaryCurrency: "USD", monetaryUnit: "MINOR", monetaryScale: 0, liquiditySemanticsVersions: ["monetary/v1"], volumeSemanticsVersions: ["monetary/v1"], marketCapSemanticsVersions: ["monetary/v1"], ...overrides });
const authority = (overrides: Partial<Parameters<typeof createM5ManifestAuthority>[0]> = {}) => createM5ManifestAuthority({ sourceContext: sourceContext(), authorityVersion: "m5-authority-revision/1", manifest: manifest(), compatibility: compatibility(), allowedDatasetPins: pins, createdAt: new Date("2026-09-16T19:00:00.000Z"), ...overrides });
const row = (record: M5ManifestAuthorityRecord): Record<string, unknown> => ({ manifest_authority_id: record.manifestAuthorityId, authority_type: record.authorityType, authority_version: record.authorityVersion, candidate_id: record.candidateId, asset_id: record.assetId, canonical_identifier: record.canonicalIdentifier, asset_class: record.assetClass, canonical_context_id: record.canonicalContextId, as_of: new Date(record.asOf), manifest_schema_version: record.manifestSchemaVersion, manifest: record.manifest, compatibility: record.compatibility, allowed_dataset_pins: record.allowedDatasetPins, fingerprint: record.fingerprint, created_at: record.createdAt });

describe("M5 manifest authority", () => {
  it("derives deterministic authority IDs and fingerprints", () => {
    const first = authority(); const second = authority({ manifest: manifest({ venues: [...manifest().venues].reverse() }), compatibility: compatibility({ permittedAgeBases: ["ASSET_INCEPTION", "LISTING"] }), allowedDatasetPins: [...pins].reverse() });
    expect(first.manifestAuthorityId).toBe(m5ManifestAuthorityIdFor(first.canonicalContextId, first.authorityVersion)); expect(first.fingerprint).toBe(second.fingerprint); expect(first.manifestAuthorityId).toBe(second.manifestAuthorityId);
  });

  it("changes fingerprint for manifest, compatibility, or pin material", () => {
    const first = authority(); expect(authority({ manifest: manifest({ liquidity: { evidenceId: "liquidity", fingerprint: "changed" } }) }).fingerprint).not.toBe(first.fingerprint); expect(authority({ compatibility: compatibility({ monetaryScale: 2 }) }).fingerprint).not.toBe(first.fingerprint); expect(authority({ allowedDatasetPins: [{ providerId: "provider-a", datasetId: "dataset-a-v2", datasetVersion: "v1" }, pins[0]!] }).fingerprint).not.toBe(first.fingerprint);
  });

  it("normalizes refs and pins and rejects conflicting duplicates", () => {
    const record = authority({ manifest: manifest({ venues: [{ evidenceId: "venue-a", fingerprint: "venue-a-fingerprint" }, { evidenceId: "venue-a", fingerprint: "venue-a-fingerprint" }, manifest().venues[0]!] }), allowedDatasetPins: [...pins, pins[0]!] }); expect(record.manifest.venues).toHaveLength(2); expect(record.allowedDatasetPins).toHaveLength(2); expect(() => authority({ manifest: manifest({ venues: [{ evidenceId: "venue-a", fingerprint: "one" }, { evidenceId: "venue-a", fingerprint: "two" }] }) })).toThrow("M5_ASSEMBLY_MANIFEST_REF_CONFLICT"); expect(() => authority({ allowedDatasetPins: [...pins, { providerId: "provider-a", datasetId: "dataset-a", datasetVersion: "different" }] })).toThrow("M5_DATASET_PIN_CONFLICT");
  });

  it("binds canonical context only from source context", () => {
    const record = authority(); expect(record.canonicalContextId).toBeTruthy(); expect(() => authority({ sourceContext: { ...sourceContext(), assetClass: "UNKNOWN" } })).toThrow("PRODUCER_ASSET_CLASS_UNKNOWN");
  });

  it("is idempotent for same ID/fingerprint and conflicts for changed material", async () => {
    const record = authority(); const changed = authority({ manifest: manifest({ liquidity: { evidenceId: "liquidity", fingerprint: "changed" } }) }); const calls: string[] = []; const client = async (strings: TemplateStringsArray) => { const sql = strings.join("?"); calls.push(sql); if (sql.startsWith("insert")) return []; return [row(record)]; }; const repository = createM5ManifestAuthorityRepository(client as never); await repository.save(record); await repository.save(record); await expect(repository.save({ ...changed, manifestAuthorityId: record.manifestAuthorityId })).rejects.toThrow("M5_MANIFEST_AUTHORITY_CONFLICT"); expect(calls.filter(value => value.startsWith("insert")).length).toBe(3);
  });

  it("rejects invalid stored fingerprints and missing authority", async () => {
    const record = authority(); const badClient = async () => [row({ ...record, fingerprint: "invalid" })]; await expect(createM5ManifestAuthorityRepository(badClient as never).readById(record.manifestAuthorityId)).rejects.toThrow("M5_MANIFEST_AUTHORITY_FINGERPRINT_MISMATCH"); const producer = vi.fn(async () => ({ status: "PERSISTED" as const, evaluatorResult: {} as never, canonicalInput: {} as never, assemblyFingerprint: "x" })); const missing = await produceCanonicalM5FromAuthority({ manifestAuthorityId: "missing", sourceContext: sourceContext() }, { authorityRepository: { readById: vi.fn(async () => { throw new Error("M5_MANIFEST_AUTHORITY_NOT_FOUND"); }) }, produce: producer }); expect(missing.status).toBe("INVALID_ASSEMBLY"); expect(producer).not.toHaveBeenCalled();
  });

  it("rejects source identity, asset class, and asOf mismatches without production", async () => {
    const record = authority(); const producer = vi.fn(async () => ({ status: "PERSISTED" as const, evaluatorResult: {} as never, canonicalInput: {} as never, assemblyFingerprint: "x" })); const deps = { authorityRepository: { readById: vi.fn(async () => record) }, produce: producer }; for (const changed of [{ candidateId: "other" }, { assetId: "other" }, { canonicalIdentifier: "other" }, { assetClass: "EQUITY" }, { asOf: "2026-09-14T00:00:00.000Z" }]) { const result = await produceCanonicalM5FromAuthority({ manifestAuthorityId: record.manifestAuthorityId, sourceContext: { ...sourceContext(), ...changed } }, deps); expect(result.status).toBe("INVALID_ASSEMBLY"); } expect(producer).not.toHaveBeenCalled();
  });

  it("passes only stored authority material to producer and propagates repository failures", async () => {
    const record = authority(); const producer = vi.fn(async (input: { manifest: M5EvidenceManifest; compatibility: M5EvidenceSemanticCompatibility; allowedDatasetPins: readonly M5DatasetPin[] }) => { expect(input.manifest).toBe(record.manifest); expect(input.compatibility).toBe(record.compatibility); expect(input.allowedDatasetPins).toBe(record.allowedDatasetPins); return { status: "PERSISTED" as const, evaluatorResult: {} as never, canonicalInput: {} as never, assemblyFingerprint: "x" }; }); const result = await produceCanonicalM5FromAuthority({ manifestAuthorityId: record.manifestAuthorityId, sourceContext: sourceContext() }, { authorityRepository: { readById: vi.fn(async () => record) }, produce: producer }); expect(result.status).toBe("PERSISTED"); const failure = new Error("DATABASE_FAILURE"); await expect(produceCanonicalM5FromAuthority({ manifestAuthorityId: record.manifestAuthorityId, sourceContext: sourceContext() }, { authorityRepository: { readById: vi.fn(async () => { throw failure; }) }, produce: producer })).rejects.toBe(failure);
  });

  it("keeps the migration server-only and hardened", () => {
    const sql = readFileSync("supabase/migrations/20260916193312_m5_manifest_authority.sql", "utf8"); expect(sql).toContain("enable row level security"); expect(sql).toContain("revoke all on public.m5_manifest_authorities from anon, authenticated"); expect(sql).toContain("before update or delete"); expect(sql).toContain("reject_intelligence_mutation()"); expect(sql).not.toMatch(/\bupdate\s+public\.m5_manifest_authorities/i); expect(sql).not.toMatch(/\bdelete\s+from\s+public\.m5_manifest_authorities/i); expect(sql).not.toContain("seed");
  });
});
