import { describe, expect, it, vi } from "vitest";
import { produceCanonicalM5, type M5ProducerDependencies, type ProduceCanonicalM5Input } from "@/application/intelligence/produce-canonical-m5";
import { M5_EVIDENCE_MANIFEST_VERSION, type M5EvidenceManifest, type M5EvidenceSemanticCompatibility } from "@/application/intelligence/assemble-m5-evidence";
import { createAgeReferenceEligibilityEvidence, createQuantitativeEligibilityEvidence, createVenueEligibilityEvidence, type RawEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import { mapQuantitativeEligibilityEvidenceRow, mapReferenceEligibilityEvidenceRow, mapVenueEligibilityEvidenceRow, mapSuspiciousEligibilityEvidenceRow } from "@/infrastructure/postgres/eligibility-evidence-repository";

const asOf = "2026-09-13T00:00:00.000Z";
const base = (overrides: Record<string, unknown> = {}) => ({ evidenceId: "e", candidateId: "candidate", assetId: "asset", canonicalIdentifier: "asset:one", assetClass: "CRYPTO", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", observedAt: "2026-09-10T00:00:00.000Z", availableAt: "2026-09-12T00:00:00.000Z", provenance: { sourceType: "FIXTURE", sourceRecordIds: ["source"], payloadFingerprint: "payload" }, ...overrides });
const sourceContext = () => ({ candidateId: "candidate", assetId: "asset", canonicalIdentifier: "asset:one", assetClass: "CRYPTO", asOf, providerDatasetPins: [{ providerId: "provider", datasetVersion: "v1" }], relevantEvidence: [] });
const compatibility = (): M5EvidenceSemanticCompatibility => ({ version: "m5-compatibility/v1", permittedAgeBases: ["ASSET_INCEPTION"], ageCalculationVersion: "age-days/v1", historySpanSemanticsVersions: ["history/v1"], historySpanQualificationBases: ["QUALIFYING"], volatilitySemanticsVersions: ["volatility/v1"], monetaryCurrency: "USD", monetaryUnit: "MINOR", monetaryScale: 0, liquiditySemanticsVersions: ["monetary/v1"], volumeSemanticsVersions: ["monetary/v1"], marketCapSemanticsVersions: ["monetary/v1"] });
const pin = { providerId: "provider", datasetId: "dataset", datasetVersion: "v1" } as const;
const ref = (evidence: RawEligibilityEvidence) => ({ evidenceId: evidence.evidenceId, fingerprint: evidence.fingerprint });
const metric = (evidenceId: string, metricKind: string, valueAtoms: bigint, overrides: Record<string, unknown> = {}) => createQuantitativeEligibilityEvidence(base({ evidenceId, metricKind, valueAtoms, scale: 0, unit: metricKind.includes("CONCENTRATION") || metricKind === "VOLATILITY" ? "BPS" : metricKind === "HISTORY_SPAN" ? "DAYS" : "MINOR", semanticsVersion: metricKind === "HISTORY_SPAN" ? "history/v1" : metricKind === "VOLATILITY" ? "volatility/v1" : "monetary/v1", currencyCode: ["LIQUIDITY", "VOLUME", "MARKET_CAP"].includes(metricKind) ? "USD" : undefined, qualificationBasis: metricKind === "HISTORY_SPAN" ? "QUALIFYING" : undefined, window: metricKind === "MARKET_CAP" || metricKind.includes("CONCENTRATION") ? undefined : { startAt: "2026-09-09T00:00:00.000Z", endAt: "2026-09-10T00:00:00.000Z" }, ...overrides }) as never);
const complete = (overrides: { readonly liquidity?: bigint } = {}) => {
  const age = createAgeReferenceEligibilityEvidence(base({ evidenceId: "age", referenceKind: "ASSET_INCEPTION", ageBasis: "ASSET_INCEPTION", referenceAt: "2026-08-01T00:00:00.000Z" }) as never);
  const history = metric("history", "HISTORY_SPAN", 14n);
  const liquidity = metric("liquidity", "LIQUIDITY", overrides.liquidity ?? 1_000_000n);
  const volume = metric("volume", "VOLUME", 500_000n);
  const marketCap = metric("market-cap", "MARKET_CAP", 10_000_000n);
  const top10 = metric("top10", "TOP10_CONCENTRATION", 8_000n);
  const single = metric("single", "SINGLE_CONCENTRATION", 3_000n);
  const volatility = metric("volatility", "VOLATILITY", 20_000n);
  const venueA = createVenueEligibilityEvidence(base({ evidenceId: "venue-a", venueId: "venue-a", eligibilityState: "ELIGIBLE" }) as never);
  const venueB = createVenueEligibilityEvidence(base({ evidenceId: "venue-b", venueId: "venue-b", eligibilityState: "ELIGIBLE" }) as never);
  const raw = [age, history, liquidity, volume, marketCap, top10, single, volatility, venueA, venueB] as const;
  const manifest: M5EvidenceManifest = { version: M5_EVIDENCE_MANIFEST_VERSION, age: ref(age), historySpan: ref(history), liquidity: ref(liquidity), volume: ref(volume), marketCap: ref(marketCap), top10HolderConcentration: ref(top10), singleHolderConcentration: ref(single), volatility: ref(volatility), venues: [ref(venueA), ref(venueB)], suspicious: [] };
  return { raw, manifest };
};
const input = (manifest: M5EvidenceManifest): ProduceCanonicalM5Input => ({ sourceContext: sourceContext(), manifest, compatibility: compatibility(), allowedDatasetPins: [pin] });
const dependencies = (rawEvidence: readonly RawEligibilityEvidence[], persisted: (value: unknown) => void = () => undefined): M5ProducerDependencies => ({ rawEvidenceRepository: { readAt: vi.fn(async () => rawEvidence) }, persistCanonicalM5: vi.fn(async value => persisted(value)) });

describe("M5 producer orchestration", () => {
  it("persists COMPLETE + ELIGIBLE exactly once", async () => {
    const fixture = complete(); const deps = dependencies(fixture.raw); const result = await produceCanonicalM5(input(fixture.manifest), deps);
    expect(result.status).toBe("PERSISTED"); expect(deps.persistCanonicalM5).toHaveBeenCalledTimes(1); expect(deps.rawEvidenceRepository.readAt).toHaveBeenCalledWith(expect.objectContaining({ candidateId: "candidate", assetId: "asset", canonicalIdentifier: "asset:one", assetClass: "CRYPTO", asOf, pins: [pin] }));
  });

  it("persists COMPLETE + INELIGIBLE once without inventing evidence", async () => {
    const fixture = complete({ liquidity: 1n }); const deps = dependencies(fixture.raw); const result = await produceCanonicalM5(input(fixture.manifest), deps);
    expect(result.status).toBe("PERSISTED"); if (result.status === "PERSISTED") expect(result.evaluatorResult.status).toBe("INELIGIBLE"); expect(deps.persistCanonicalM5).toHaveBeenCalledTimes(1);
  });

  it("keeps INCOMPLETE diagnostics and never persists", async () => {
    const fixture = complete(); const deps = dependencies(fixture.raw); const result = await produceCanonicalM5(input({ ...fixture.manifest, historySpan: undefined }), deps);
    expect(result.status).toBe("INCOMPLETE"); if (result.status === "INCOMPLETE") expect(result.missingRequirements).toEqual(expect.arrayContaining([expect.objectContaining({ target: "HISTORY_SPAN" })])); expect(deps.persistCanonicalM5).not.toHaveBeenCalled();
  });

  it("rejects INVALID_MANIFEST before evaluator or persistence", async () => {
    const fixture = complete(); const deps = dependencies(fixture.raw); const result = await produceCanonicalM5(input({ ...fixture.manifest, version: "wrong" as typeof M5_EVIDENCE_MANIFEST_VERSION }), deps);
    expect(result.status).toBe("INVALID_ASSEMBLY"); expect(deps.rawEvidenceRepository.readAt).not.toHaveBeenCalled(); expect(deps.persistCanonicalM5).not.toHaveBeenCalled();
  });

  it.each(["candidateId", "assetId", "canonicalIdentifier", "assetClass", "asOf"] as const)("fails closed on source identity field %s", async field => {
    const fixture = complete(); const changed = { ...sourceContext(), [field]: field === "asOf" ? "2026-09-14T00:00:00.000Z" : "other" }; const deps = field === "asOf" ? { rawEvidenceRepository: { readAt: vi.fn(async (scope: { readonly asOf: string }) => scope.asOf === asOf ? fixture.raw : []) }, persistCanonicalM5: vi.fn(async () => undefined) } : dependencies(fixture.raw); const result = await produceCanonicalM5({ ...input(fixture.manifest), sourceContext: changed }, deps);
    expect(["INVALID_ASSEMBLY", "INCOMPLETE"]).toContain(result.status); expect(deps.persistCanonicalM5).not.toHaveBeenCalled();
  });

  it("rejects future evidence and unapproved pins", async () => {
    const fixture = complete(); const future = metric("future", "LIQUIDITY", 1_000_000n, { availableAt: "2026-09-14T00:00:00.000Z" }); const futureDeps = dependencies([...fixture.raw, future]); const futureResult = await produceCanonicalM5(input({ ...fixture.manifest, liquidity: ref(future) }), futureDeps); expect(futureResult.status).toBe("INVALID_ASSEMBLY");
    const pinDeps = dependencies(fixture.raw); const pinResult = await produceCanonicalM5({ ...input(fixture.manifest), allowedDatasetPins: [{ providerId: "unapproved", datasetId: "dataset", datasetVersion: "v1" }] }, pinDeps); expect(pinResult.status).toBe("INVALID_ASSEMBLY"); expect(pinDeps.rawEvidenceRepository.readAt).not.toHaveBeenCalled();
  });

  it("produces identical results regardless of repository ordering", async () => {
    const fixture = complete(); const left = await produceCanonicalM5(input(fixture.manifest), dependencies(fixture.raw)); const right = await produceCanonicalM5(input(fixture.manifest), dependencies([...fixture.raw].reverse())); expect(right).toEqual(left);
  });

  it("propagates persistence failures and does not report PERSISTED", async () => {
    const fixture = complete(); const error = new Error("CANONICAL_WRITE_FAILED"); const deps: M5ProducerDependencies = { rawEvidenceRepository: { readAt: vi.fn(async () => fixture.raw) }, persistCanonicalM5: vi.fn(async () => { throw error; }) }; await expect(produceCanonicalM5(input(fixture.manifest), deps)).rejects.toBe(error);
  });

  it("supports replay through the injected idempotent persistence contract", async () => {
    const fixture = complete(); const saved = new Map<string, string>(); const deps = dependencies(fixture.raw, value => { const item = value as { canonicalInput: { evaluation: { evaluationId: string }; assemblyFingerprint: string } }; const old = saved.get(item.canonicalInput.evaluation.evaluationId); if (old && old !== item.canonicalInput.assemblyFingerprint) throw new Error("CANONICAL_EVIDENCE_CONFLICT"); saved.set(item.canonicalInput.evaluation.evaluationId, item.canonicalInput.assemblyFingerprint); }); const first = await produceCanonicalM5(input(fixture.manifest), deps); const second = await produceCanonicalM5(input(fixture.manifest), deps); expect(first).toEqual(second); expect(saved.size).toBe(1);
  });

  it("maps all four repository evidence families and rejects stored fingerprint conflicts", () => {
    const fixture = complete(); const quantitative = fixture.raw.find(value => value.evidenceKind === "QUANTITATIVE")!; const reference = fixture.raw.find(value => value.evidenceKind === "REFERENCE")!; const venue = fixture.raw.find(value => value.evidenceKind === "VENUE")!; const suspicious = { ...base({ evidenceId: "suspicious", flagCode: "WASH", severity: "LOW", sourceSignalId: "signal" }), evidenceKind: "SUSPICIOUS" as const, fingerprint: "" };
    const row = (value: RawEligibilityEvidence) => ({ evidence_id: value.evidenceId, candidate_id: value.candidateId, asset_id: value.assetId, canonical_identifier: value.canonicalIdentifier, asset_class: value.assetClass, provider_id: value.providerId, dataset_id: value.datasetId, dataset_version: value.datasetVersion, observed_at: value.observedAt, available_at: value.availableAt, provenance: value.provenance, fingerprint: value.fingerprint });
    expect(mapQuantitativeEligibilityEvidenceRow({ ...row(quantitative), metric_kind: quantitative.evidenceKind === "QUANTITATIVE" ? quantitative.metricKind : "LIQUIDITY", value_atoms: quantitative.evidenceKind === "QUANTITATIVE" ? quantitative.valueAtoms.toString() : "1", scale: 0, unit: "MINOR", semantics_version: "monetary/v1", currency_code: "USD", window_start_at: "2026-09-09T00:00:00.000Z", window_end_at: "2026-09-10T00:00:00.000Z", qualification_basis: null })).toBeTruthy();
    expect(mapReferenceEligibilityEvidenceRow({ ...row(reference), reference_kind: "ASSET_INCEPTION", reference_at: "2026-08-01T00:00:00.000Z", age_basis: "ASSET_INCEPTION" })).toBeTruthy();
    expect(mapVenueEligibilityEvidenceRow({ ...row(venue), venue_id: "venue-a", eligibility_state: "ELIGIBLE" })).toBeTruthy();
    const suspiciousEvidence = { ...row(suspicious as never), flag_code: "WASH", severity: "LOW", source_signal_id: "signal", fingerprint: "invalid" };
    expect(() => mapSuspiciousEligibilityEvidenceRow(suspiciousEvidence)).toThrow();
  });
});
