import { describe, expect, it } from "vitest";
import { assetMappingRevisionFingerprint, createAssetMappingRevision, mappingRevisionIdFor, type AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import { resolveAssetMappingRevision } from "@/application/intelligence/resolve-asset-mapping-revision";
import type { AssetMappingRevisionRepository } from "@/application/intelligence/asset-mapping-revision-repository";
import { createAssetMappingRevisionRepository, mapAssetMappingRevisionRow } from "@/infrastructure/postgres/asset-mapping-revision-repository";

const base = (overrides: Record<string, unknown> = {}) => ({
  mappingRevisionVersion: "mapping/v1",
  providerId: "provider-1",
  datasetId: "dataset-1",
  datasetVersion: "dataset-v1",
  sourceLineageId: "lineage-1",
  providerAssetNamespace: "CHAIN:ETHEREUM",
  providerAssetId: "0xabc",
  canonicalAssetId: "asset-1",
  canonicalIdentifier: "ethereum:0xabc",
  assetClass: "CRYPTO",
  validFrom: "2026-01-01T00:00:00.000Z",
  observedAt: "2026-01-01T00:00:00.000Z",
  availableAt: "2026-01-01T00:01:00.000Z",
  sourceRecordIds: ["record-b", "record-a", "record-a"],
  payloadFingerprint: "payload-1",
  recordedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});
const mapping = (overrides: Record<string, unknown> = {}) => createAssetMappingRevision(base(overrides) as never);
const lookup = (overrides: Record<string, unknown> = {}) => ({ providerId: "provider-1", datasetId: "dataset-1", datasetVersion: "dataset-v1", providerAssetNamespace: "CHAIN:ETHEREUM", providerAssetId: "0xabc", asOf: "2026-02-01T00:00:00.000Z", ...overrides });
const readOnly = (readCandidatesAt: AssetMappingRevisionRepository["readCandidatesAt"]): AssetMappingRevisionRepository => ({ save: async mapping => mapping, readCandidatesAt });
const row = (value: AssetMappingRevision) => ({ mapping_revision_id: value.mappingRevisionId, mapping_revision_version: value.mappingRevisionVersion, provider_id: value.providerId, dataset_id: value.datasetId, dataset_version: value.datasetVersion, source_lineage_id: value.sourceLineageId, provider_asset_namespace: value.providerAssetNamespace, provider_asset_id: value.providerAssetId, canonical_asset_id: value.canonicalAssetId, canonical_identifier: value.canonicalIdentifier, asset_class: value.assetClass, valid_from: value.validFrom, valid_to: value.validTo ?? null, observed_at: value.observedAt, available_at: value.availableAt, source_record_ids: value.sourceRecordIds, payload_fingerprint: value.payloadFingerprint, fingerprint: value.fingerprint, recorded_at: value.recordedAt });

describe("M5 revision-specific asset mapping", () => {
  it("creates deterministic IDs and fingerprints independent of source ordering or recorded time", () => {
    const first = mapping();
    const second = mapping({ sourceRecordIds: ["record-a", "record-b"], recordedAt: "2027-01-01T00:00:00.000Z" });
    expect(first.mappingRevisionId).toBe(second.mappingRevisionId);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.sourceRecordIds).toEqual(["record-a", "record-b"]);
  });

  it("changes fingerprint for canonical, interval, timestamp, payload, or version changes", () => {
    const first = mapping();
    for (const change of [{ canonicalAssetId: "asset-2" }, { validTo: "2026-03-01T00:00:00.000Z" }, { availableAt: "2026-01-01T00:02:00.000Z" }, { payloadFingerprint: "payload-2" }, { mappingRevisionVersion: "mapping/v2" }]) {
      expect(mapping(change).fingerprint).not.toBe(first.fingerprint);
    }
  });

  it("binds source lineage in the fingerprint without changing logical mapping identity", () => {
    const first = mapping({ sourceLineageId: "lineage-1" });
    const second = mapping({ sourceLineageId: "lineage-2" });
    expect(first.mappingRevisionId).toBe(second.mappingRevisionId);
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it("rejects invalid intervals, UNKNOWN, ticker-only identity, and non-canonical timestamps", () => {
    expect(() => mapping({ validTo: "2025-01-01T00:00:00.000Z" })).toThrow("M5_MAPPING_INTERVAL_INVALID");
    expect(() => mapping({ assetClass: "UNKNOWN" })).toThrow("M5_MAPPING_ASSET_CLASS_UNKNOWN");
    expect(() => mapping({ providerAssetNamespace: "TICKER", providerAssetId: "ABC" })).toThrow("M5_MAPPING_TICKER_ONLY_IDENTITY");
    expect(() => mapping({ observedAt: "2026-01-01T00:00:00Z" })).toThrow("M5_MAPPING_OBSERVED_AT_INVALID");
  });

  it("keeps chain-qualified identities separate", () => {
    expect(mapping({ providerAssetNamespace: "CHAIN:ETHEREUM" }).mappingRevisionId).not.toBe(mapping({ providerAssetNamespace: "CHAIN:BASE" }).mappingRevisionId);
  });

  it("resolves exact identity and uses half-open validity", async () => {
    const value = mapping({ validTo: "2026-02-01T00:00:00.000Z" });
    const repository = readOnly(async (input) => input.asOf < "2026-02-01T00:00:00.000Z" ? [value] : []);
    expect((await resolveAssetMappingRevision(repository, lookup({ asOf: "2026-01-01T00:00:00.000Z" }))).status).toBe("RESOLVED");
    expect((await resolveAssetMappingRevision(repository, lookup({ asOf: "2026-02-01T00:00:00.000Z" }))).status).toBe("NOT_FOUND");
  });

  it("returns NOT_FOUND and AMBIGUOUS without newest-wins fallback", async () => {
    const value = mapping();
    const repository = readOnly(async () => []);
    expect((await resolveAssetMappingRevision(repository, lookup())).status).toBe("NOT_FOUND");
    const ambiguous = readOnly(async () => [value, mapping({ mappingRevisionVersion: "mapping/v2" })]);
    expect((await resolveAssetMappingRevision(ambiguous, lookup())).status).toBe("AMBIGUOUS");
  });

  it("rejects every repository lookup-contract violation instead of filtering it", async () => {
    const cases = [
      { providerId: "other" },
      { datasetId: "other" },
      { datasetVersion: "other" },
      { providerAssetNamespace: "CHAIN:BASE" },
      { providerAssetId: "0xdef" },
    ];
    for (const change of cases) {
      await expect(resolveAssetMappingRevision(readOnly(async () => [mapping(change)]), lookup())).rejects.toThrow("M5_MAPPING_REPOSITORY_CONTRACT_VIOLATION");
    }
    await expect(resolveAssetMappingRevision(readOnly(async () => [mapping({ validFrom: "2027-01-01T00:00:00.000Z" })]), lookup())).rejects.toThrow("M5_MAPPING_REPOSITORY_CONTRACT_VIOLATION");
    const bounded = mapping({ validTo: "2026-02-01T00:00:00.000Z" });
    await expect(resolveAssetMappingRevision(readOnly(async () => [bounded]), lookup({ asOf: "2026-02-01T00:00:00.000Z" }))).rejects.toThrow("M5_MAPPING_REPOSITORY_CONTRACT_VIOLATION");
    await expect(resolveAssetMappingRevision(readOnly(async () => [bounded]), lookup({ asOf: "2026-03-01T00:00:00.000Z" }))).rejects.toThrow("M5_MAPPING_REPOSITORY_CONTRACT_VIOLATION");
    await expect(resolveAssetMappingRevision(readOnly(async () => [mapAssetMappingRevisionRow({ ...row(mapping()), fingerprint: "invalid" })]), lookup())).rejects.toThrow("M5_MAPPING_FINGERPRINT_MISMATCH");
  });

  it("propagates repository failures and rejects invalid stored fingerprints", async () => {
    await expect(resolveAssetMappingRevision(readOnly(async () => { throw new Error("DATABASE_FAILURE"); }), lookup())).rejects.toThrow("DATABASE_FAILURE");
    await expect(resolveAssetMappingRevision(readOnly(async () => [mapAssetMappingRevisionRow({ ...row(mapping()), fingerprint: "wrong" })]), lookup())).rejects.toThrow("M5_MAPPING_FINGERPRINT_MISMATCH");
  });

  it("saves idempotently, rejects conflicts and obvious interval overlap", async () => {
    const value = mapping();
    const calls: string[] = [];
    const fake = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      void _values;
      const sql = strings.join("?"); calls.push(sql);
      if (sql.includes("select mapping_revision_id from")) return [];
      if (sql.includes("insert into")) return [{ mapping_revision_id: value.mappingRevisionId }];
      if (sql.includes("select * from public.intelligence_asset_mapping_revisions")) return [row(value)];
      return [];
    };
    const repository = createAssetMappingRevisionRepository(fake as never);
    await repository.save(value);
    expect(calls.some(call => call.includes("on conflict (mapping_revision_id) do nothing"))).toBe(true);
    expect(calls.every(call => !/\b(update|delete)\b/i.test(call))).toBe(true);
    const conflicting = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      void _values;
      const sql = strings.join("?");
      if (sql.includes("select mapping_revision_id")) return [];
      if (sql.includes("insert into")) return [];
      return [{ ...row(value), fingerprint: "different" }];
    };
    await expect(createAssetMappingRevisionRepository(conflicting as never).save(value)).rejects.toThrow("M5_MAPPING_REVISION_CONFLICT");
    const overlapping = async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      void _values;
      return strings.join("?").includes("select mapping_revision_id") ? [{ mapping_revision_id: "other" }] : [];
    };
    await expect(createAssetMappingRevisionRepository(overlapping as never).save(value)).rejects.toThrow("M5_MAPPING_INTERVAL_CONFLICT");
  });

  it("maps and validates persisted rows through the full domain contract", () => {
    const value = mapping();
    expect(mapAssetMappingRevisionRow(row(value))).toEqual(value);
    expect(() => mapAssetMappingRevisionRow({ ...row(value), fingerprint: "wrong" })).toThrow("M5_MAPPING_FINGERPRINT_MISMATCH");
  });
});

describe("M5 mapping migration safety", () => {
  it("is covered by the structural migration test in the repository test suite", () => {
    expect(assetMappingRevisionFingerprint(mapping())).toHaveLength(64);
    expect(mappingRevisionIdFor(mapping())).toContain("m5-mapping:");
  });
});
