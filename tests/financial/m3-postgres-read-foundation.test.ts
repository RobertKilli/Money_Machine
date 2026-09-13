import { describe, expect, it } from "vitest";
import { InMemoryIntelligenceStore, INTELLIGENCE_FOUNDATION_VERSION } from "@/domain/intelligence/foundation";
import { analyzeIntelligenceAt, EVENT_SIGNATURE_VERSION, HISTORICAL_ANALOGUE_VERSION, INTELLIGENCE_ENGINE_VERSION, INTELLIGENCE_FEATURE_SET_VERSION, REGIME_CLASSIFICATION_VERSION, TREND_ANALYSIS_VERSION } from "@/domain/intelligence/engine";
import { createIntelligenceReadRepository, mapMacroObservationRow, mapMarketObservationRow, mapNewsEventRow } from "@/infrastructure/postgres/intelligence-repository";
import { normalizeProducerDatasetPins, validateCanonicalProducerSourceContext } from "@/application/intelligence/canonical-producer-context";

const date = (value: string) => new Date(value);
const provenance = (providerId = "provider-a", datasetVersion = "dataset-v1") => ({ providerId, datasetId: `${providerId}-dataset`, datasetVersion, externalRecordId: "record-1", sourceType: "SYNTHETIC", payloadFingerprint: "fingerprint", foundationVersion: INTELLIGENCE_FOUNDATION_VERSION });
const marketRow = (id: string, assetId: string, observedAt: string, availableAt = observedAt, providerId = "provider-a", datasetVersion = "dataset-v1") => ({ id, provider_id: providerId, dataset_version: datasetVersion, external_record_id: id, asset_id: assetId, observed_at: observedAt, available_at: availableAt, ingested_at: "2026-01-01T00:00:00.000Z", observation_type: "PRICE", value_atoms: "100", scale: 0, unit: "UNIT", provenance: provenance(providerId, datasetVersion) });
const newsRow = (id: string, availableAt: string) => ({ id, provider_id: "provider-a", dataset_version: "dataset-v1", external_record_id: id, revision: 1, published_at: "2025-01-01T00:00:00.000Z", available_at: availableAt, ingested_at: "2026-01-01T00:00:00.000Z", title: "synthetic", source_url: null, source_type: "SYNTHETIC", provenance: provenance(), mappings: [{ recordId: id, mappingKind: "ASSET", targetId: "asset-a", source: "DETERMINISTIC_FIXTURE", evidence: "fixture" }] });
const macroRow = (id: string, availableAt: string, observedAt: string | null) => ({ id, provider_id: "provider-a", dataset_version: "dataset-v1", external_record_id: id, revision: 1, indicator_code: "SYNTHETIC", geography: "GLOBAL", reference_period_start: "2025-01-01", reference_period_end: "2025-01-01", observed_at: observedAt, published_at: null, available_at: availableAt, ingested_at: "2026-01-01T00:00:00.000Z", value_atoms: "100", scale: 0, unit: "UNIT", provenance: provenance() });

function fakeClient(rows: readonly Record<string, unknown>[], kind: "market" | "news" | "macro" = "news") {
  const calls: string[] = [];
  const client = (strings: TemplateStringsArray) => { const query = strings.join("?"); calls.push(query); const matchesKind = query.includes("market_observations") ? kind === "market" : query.includes("news_event_revisions") ? kind === "news" : query.includes("macro_observations") && kind === "macro"; return Promise.resolve(matchesKind ? rows : []); };
  return { client, calls };
}

describe("M3 PostgreSQL read foundation", () => {
  it("maps valid market and news rows while rejecting malformed dates", () => {
    expect(mapMarketObservationRow(marketRow("m1", "asset-a", "2025-01-01T00:00:00.000Z")).valueAtoms).toBe(100n);
    expect(mapNewsEventRow(newsRow("n1", "2025-01-01T00:00:00.000Z")).mappings[0]!.targetId).toBe("asset-a");
    expect(() => mapMarketObservationRow({ ...marketRow("m1", "asset-a", "2025-01-01T00:00:00.000Z"), observed_at: "bad" })).toThrow("M3_MARKET_OBSERVED_AT_INVALID");
  });

  it("maps source mappings and selects the latest visible news revision", async () => {
    const older = { ...newsRow("n1-v1", "2025-01-01T00:00:00.000Z"), external_record_id: "same-record", revision: 1 };
    const newer = { ...newsRow("n1-v2", "2025-01-01T00:00:00.000Z"), external_record_id: "same-record", revision: 2 };
    const fake = fakeClient([newer, older], "news");
    const repository = createIntelligenceReadRepository(fake.client as never);
    const result = await repository.newsAvailableAt(date("2025-01-02T00:00:00.000Z"), "dataset-v1");
    expect(result.map(item => item.id)).toEqual(["n1-v2"]);
    expect(result[0]!.mappings[0]!.targetId).toBe("asset-a");
  });

  it("matches InMemory macro visibility: availableAt controls visibility, not optional observedAt", async () => {
    expect(mapMacroObservationRow(macroRow("macro", "2025-01-01T00:00:00.000Z", "2025-01-03T00:00:00.000Z")).observedAt).toEqual(date("2025-01-03T00:00:00.000Z"));
    const fake = fakeClient([macroRow("visible", "2025-01-01T00:00:00.000Z", "2025-01-03T00:00:00.000Z")], "macro");
    const repository = createIntelligenceReadRepository(fake.client as never);
    const result = await repository.macroAvailableAt(date("2025-01-02T00:00:00.000Z"), "dataset-v1");
    const memory = new InMemoryIntelligenceStore();
    memory.ingestMacro(mapMacroObservationRow(macroRow("visible", "2025-01-01T00:00:00.000Z", "2025-01-03T00:00:00.000Z")));
    expect(result.map(item => item.id)).toEqual(memory.macroAvailableAt(date("2025-01-02T00:00:00.000Z"), "dataset-v1").map(item => item.id));
    expect(result.map(item => item.id)).toEqual(["visible"]);
    expect(fake.calls[0]).toContain("available_at<=?");
    expect(fake.calls[0]).not.toContain("observed_at<=?");
  });

  it("uses parameterized read-only temporal queries and deterministic ordering", async () => {
    const rows = [marketRow("a", "asset-a", "2025-01-01T00:00:00.000Z"), marketRow("b", "asset-b", "2025-01-01T00:00:00.000Z")];
    const fake = fakeClient(rows, "market");
    const repository = createIntelligenceReadRepository(fake.client as never);
    const result = await repository.marketAvailableAt(date("2025-01-02T00:00:00.000Z"), "dataset-v1");
    expect(result.map(item => item.id)).toEqual(["a", "b"]);
    expect(fake.calls[0]).toContain("available_at<=?");
    expect(fake.calls[0]).toContain("observed_at<=?");
    expect(fake.calls[0]).not.toMatch(/insert|update|delete|create table/i);
  });

  it("loads only pinned providers and preserves InMemoryIntelligenceStore asset scoping", async () => {
    const fake = fakeClient([marketRow("a", "asset-a", "2025-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z", "provider-a"), marketRow("b", "asset-b", "2025-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z", "provider-b")], "market");
    const repository = createIntelligenceReadRepository(fake.client as never);
    const store = await repository.loadStoreAt(date("2025-01-02T00:00:00.000Z"), [{ providerId: "provider-a", datasetVersion: "dataset-v1" }]);
    const config = { engineVersion: INTELLIGENCE_ENGINE_VERSION, featureSetVersion: INTELLIGENCE_FEATURE_SET_VERSION, asOf: date("2025-01-02T00:00:00.000Z"), providerDatasetPins: [{ providerId: "provider-a", datasetVersion: "dataset-v1" }], eventSignatureVersion: EVENT_SIGNATURE_VERSION, trendPolicyVersion: TREND_ANALYSIS_VERSION, regimePolicyVersion: REGIME_CLASSIFICATION_VERSION, analoguePolicyVersion: HISTORICAL_ANALOGUE_VERSION, assetId: "asset-a" } as const;
    const snapshot = analyzeIntelligenceAt(store, config);
    expect(snapshot.inputEvidence).toEqual(["a"]);
  });

  it("excludes future availability and observation timestamps through the SQL contract", async () => {
    const fake = fakeClient([marketRow("visible", "asset-a", "2025-01-01T00:00:00.000Z"), marketRow("future-observed", "asset-a", "2025-01-03T00:00:00.000Z"), marketRow("future-available", "asset-a", "2025-01-01T00:00:00.000Z", "2025-01-03T00:00:00.000Z")], "market");
    const repository = createIntelligenceReadRepository(fake.client as never);
    expect(fake.calls).toHaveLength(0);
    await repository.marketAvailableAt(date("2025-01-02T00:00:00.000Z"), "dataset-v1");
    expect(fake.calls[0]).toMatch(/available_at<=\?.*observed_at<=\?/);
  });

  it("propagates database failures instead of converting them to empty evidence", async () => {
    const calls: string[] = [];
    const client = (strings: TemplateStringsArray) => { calls.push(strings.join("?")); return Promise.reject(new Error("database unavailable")); };
    const repository = createIntelligenceReadRepository(client as never);
    await expect(repository.marketAvailableAt(date("2025-01-02T00:00:00.000Z"), "dataset-v1")).rejects.toThrow("database unavailable");
    expect(calls).toHaveLength(1);
  });

  it("preserves relevant mapped providers while pinning out unrelated providers", async () => {
    const relevant = newsRow("relevant", "2025-01-01T00:00:00.000Z");
    const unrelated = { ...relevant, id: "unrelated", provider_id: "provider-b", provenance: provenance("provider-b") };
    const fake = fakeClient([relevant, unrelated], "news");
    const repository = createIntelligenceReadRepository(fake.client as never);
    const store = await repository.loadStoreAt(date("2025-01-02T00:00:00.000Z"), [{ providerId: "provider-a", datasetVersion: "dataset-v1" }]);
    expect(store.newsAvailableAt(date("2025-01-02T00:00:00.000Z"), "dataset-v1").map(item => item.providerId)).toEqual(["provider-a"]);
  });

  it("feeds the unchanged deterministic M4 engine without financial authority", async () => {
    const rows = [
      marketRow("a1", "asset-a", "2025-01-01T00:00:00.000Z"),
      { ...marketRow("a2", "asset-a", "2025-01-02T00:00:00.000Z"), value_atoms: "110" },
      marketRow("b1", "asset-b", "2025-01-01T00:00:00.000Z"),
    ];
    const fake = fakeClient(rows, "market");
    const repository = createIntelligenceReadRepository(fake.client as never);
    const store = await repository.loadStoreAt(date("2025-01-03T00:00:00.000Z"), [{ providerId: "provider-a", datasetVersion: "dataset-v1" }]);
    const snapshot = analyzeIntelligenceAt(store, { engineVersion: INTELLIGENCE_ENGINE_VERSION, featureSetVersion: INTELLIGENCE_FEATURE_SET_VERSION, asOf: date("2025-01-03T00:00:00.000Z"), providerDatasetPins: [{ providerId: "provider-a", datasetVersion: "dataset-v1" }], eventSignatureVersion: EVENT_SIGNATURE_VERSION, trendPolicyVersion: TREND_ANALYSIS_VERSION, regimePolicyVersion: REGIME_CLASSIFICATION_VERSION, analoguePolicyVersion: HISTORICAL_ANALOGUE_VERSION, assetId: "asset-a" });
    expect(snapshot.trends[0]).toMatchObject({ status: "COMPLETE", direction: "UP", signedChangeBps: "1000" });
  });

  it("normalizes duplicate pins and rejects conflicting pins", () => {
    expect(normalizeProducerDatasetPins([{ providerId: "p", datasetVersion: "v1" }, { providerId: "p", datasetVersion: "v1" }])).toEqual([{ providerId: "p", datasetVersion: "v1" }]);
    expect(() => normalizeProducerDatasetPins([{ providerId: "p", datasetVersion: "v1" }, { providerId: "p", datasetVersion: "v2" }])).toThrow("PRODUCER_DATASET_PIN_CONFLICT");
  });

  it("requires explicit, asset-bound producer context", () => {
    const base = { candidateId: "candidate-a", canonicalIdentifier: "asset-a", assetId: "asset-a", assetClass: "CRYPTO", asOf: "2025-01-02T00:00:00.000Z", availableAt: "2025-01-02T00:00:00.000Z", providerDatasetPins: [{ providerId: "provider-a", datasetVersion: "dataset-v1" }], relevantEvidence: [{ evidenceId: "e1", providerId: "provider-a", datasetVersion: "dataset-v1", assetId: "asset-a", lineage: "MARKET_OBSERVATION" as const }] } as const;
    expect(validateCanonicalProducerSourceContext(base).relevantEvidence).toHaveLength(1);
    const validated = validateCanonicalProducerSourceContext(base);
    expect(typeof validated.asOf).toBe("string");
    expect(() => validateCanonicalProducerSourceContext({ ...base, relevantEvidence: [{ ...base.relevantEvidence[0]!, lineage: "NEWS_MAPPING" as never }] })).toThrow("PRODUCER_EVIDENCE_LINEAGE_UNPROVEN");
    expect(() => validateCanonicalProducerSourceContext({ ...base, assetClass: "UNKNOWN" })).toThrow("PRODUCER_ASSET_CLASS_UNKNOWN");
    expect(() => validateCanonicalProducerSourceContext({ ...base, availableAt: "2025-01-03T00:00:00.000Z" })).toThrow("PRODUCER_AVAILABLE_AT_AFTER_AS_OF");
    expect(() => validateCanonicalProducerSourceContext({ ...base, asOf: "2025-01-02T00:00:00" })).toThrow("PRODUCER_AS_OF_INVALID");
    expect(() => validateCanonicalProducerSourceContext({ ...base, assetId: "asset-b" })).toThrow("PRODUCER_EVIDENCE_ASSET_MISMATCH");
    expect(() => validateCanonicalProducerSourceContext({ ...base, relevantEvidence: [{ ...base.relevantEvidence[0]!, providerId: "provider-b" }] })).toThrow("PRODUCER_EVIDENCE_PIN_MISMATCH");
  });
});
