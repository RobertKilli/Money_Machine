import { describe, expect, it, vi } from "vitest";
import { M5_EVIDENCE_MANIFEST_VERSION, type M5EvidenceManifest, type M5EvidenceSemanticCompatibility } from "@/application/intelligence/assemble-m5-evidence";
import { M5_MANIFEST_AUTHORITY_CONFIG_VERSION, parseM5ManifestAuthorityConfig, type M5ManifestAuthorityConfig } from "@/application/intelligence/m5-manifest-authority-config";
import { provisionM5ManifestAuthority } from "@/application/intelligence/provision-m5-manifest-authority";
import { formatProvisioningCliError, parseProvisionM5ManifestAuthorityCliArgs } from "@/application/intelligence/provision-m5-manifest-authority-cli";
import { createAgeReferenceEligibilityEvidence, createQuantitativeEligibilityEvidence, createSuspiciousEligibilityEvidence, createVenueEligibilityEvidence, type RawEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";

const asOf = "2026-09-13T00:00:00.000Z";
const base = (overrides: Record<string, unknown> = {}) => ({ evidenceId: "e", candidateId: "candidate", assetId: "asset", canonicalIdentifier: "asset:one", assetClass: "CRYPTO", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", mappingRevisionId: "mapping-1", observedAt: "2026-09-10T00:00:00.000Z", availableAt: "2026-09-12T00:00:00.000Z", provenance: { sourceType: "FIXTURE", sourceRecordIds: ["source"], payloadFingerprint: "payload" }, ...overrides });
const sourceContext = () => ({ candidateId: "candidate", assetId: "asset", canonicalIdentifier: "asset:one", assetClass: "CRYPTO", asOf, providerDatasetPins: [{ providerId: "provider", datasetVersion: "v1" }], relevantEvidence: [] });
const compatibility = (): M5EvidenceSemanticCompatibility => ({ version: "m5-compatibility/v1", permittedAgeBases: ["ASSET_INCEPTION"], ageCalculationVersion: "age-days/v1", historySpanSemanticsVersions: ["history/v1"], historySpanQualificationBases: ["QUALIFYING"], volatilitySemanticsVersions: ["volatility/v1"], monetaryCurrency: "USD", monetaryUnit: "MINOR", monetaryScale: 0, liquiditySemanticsVersions: ["monetary/v1"], volumeSemanticsVersions: ["monetary/v1"], marketCapSemanticsVersions: ["monetary/v1"] });
const pin = { providerId: "provider", datasetId: "dataset", datasetVersion: "v1" } as const;
const ref = (evidence: RawEligibilityEvidence) => ({ evidenceId: evidence.evidenceId, fingerprint: evidence.fingerprint });
const metric = (evidenceId: string, metricKind: string, valueAtoms: bigint) => createQuantitativeEligibilityEvidence(base({ evidenceId, metricKind, valueAtoms, scale: 0, unit: metricKind.includes("CONCENTRATION") || metricKind === "VOLATILITY" ? "BPS" : metricKind === "HISTORY_SPAN" ? "DAYS" : "MINOR", semanticsVersion: metricKind === "HISTORY_SPAN" ? "history/v1" : metricKind === "VOLATILITY" ? "volatility/v1" : "monetary/v1", currencyCode: ["LIQUIDITY", "VOLUME", "MARKET_CAP"].includes(metricKind) ? "USD" : undefined, qualificationBasis: metricKind === "HISTORY_SPAN" ? "QUALIFYING" : undefined, window: metricKind === "MARKET_CAP" || metricKind.includes("CONCENTRATION") ? undefined : { startAt: "2026-09-09T00:00:00.000Z", endAt: "2026-09-10T00:00:00.000Z" } }) as never);
const complete = () => {
  const age = createAgeReferenceEligibilityEvidence(base({ evidenceId: "age", referenceKind: "ASSET_INCEPTION", ageBasis: "ASSET_INCEPTION", referenceAt: "2026-08-01T00:00:00.000Z" }) as never);
  const history = metric("history", "HISTORY_SPAN", 14n); const liquidity = metric("liquidity", "LIQUIDITY", 1_000_000n); const volume = metric("volume", "VOLUME", 500_000n); const marketCap = metric("market-cap", "MARKET_CAP", 10_000_000n); const top10 = metric("top10", "TOP10_CONCENTRATION", 8_000n); const single = metric("single", "SINGLE_CONCENTRATION", 3_000n); const volatility = metric("volatility", "VOLATILITY", 20_000n);
  const venueA = createVenueEligibilityEvidence(base({ evidenceId: "venue-a", venueId: "venue-a", eligibilityState: "ELIGIBLE" }) as never); const venueB = createVenueEligibilityEvidence(base({ evidenceId: "venue-b", venueId: "venue-b", eligibilityState: "ELIGIBLE" }) as never); const suspicious = createSuspiciousEligibilityEvidence(base({ evidenceId: "suspicious", flagCode: "WASH", severity: "LOW", sourceSignalId: "signal" }) as never);
  const raw = [age, history, liquidity, volume, marketCap, top10, single, volatility, venueA, venueB, suspicious] as const;
  const manifest: M5EvidenceManifest = { version: M5_EVIDENCE_MANIFEST_VERSION, age: ref(age), historySpan: ref(history), liquidity: ref(liquidity), volume: ref(volume), marketCap: ref(marketCap), top10HolderConcentration: ref(top10), singleHolderConcentration: ref(single), volatility: ref(volatility), venues: [ref(venueA), ref(venueB)], suspicious: [ref(suspicious)] };
  return { raw, manifest };
};
const config = (overrides: Partial<M5ManifestAuthorityConfig> = {}): M5ManifestAuthorityConfig => { const fixture = complete(); return { configVersion: M5_MANIFEST_AUTHORITY_CONFIG_VERSION, sourceContext: sourceContext(), authorityVersion: "m5-authority-revision/1", manifest: fixture.manifest, compatibility: compatibility(), allowedDatasetPins: [pin], ...overrides }; };
const dependencies = (raw: readonly RawEligibilityEvidence[], save = vi.fn(async () => undefined)) => ({ rawEvidenceRepository: { readAt: vi.fn(async () => raw) }, authorityRepository: { save } });

describe("M5 authority provisioning", () => {
  it("strictly parses and normalizes a valid config", () => {
    const parsed = parseM5ManifestAuthorityConfig(config());
    expect(parsed.configVersion).toBe(M5_MANIFEST_AUTHORITY_CONFIG_VERSION);
    expect(parsed.manifest.venues.map(value => value.evidenceId)).toEqual(["venue-a", "venue-b"]);
  });

  it.each(["extra", "canonicalContextId"])("rejects unknown top-level field %s", field => {
    expect(() => parseM5ManifestAuthorityConfig({ ...config(), [field]: "forbidden" })).toThrow("M5_CONFIG_UNKNOWN_FIELD");
  });

  it("rejects unknown nested fields, missing fields, wrong version, and conflicting pins", () => {
    expect(() => parseM5ManifestAuthorityConfig({ ...config(), manifest: { ...config().manifest, venues: [{ ...config().manifest.venues[0], extra: true }] } })).toThrow("M5_CONFIG_MANIFEST_REF_UNKNOWN_FIELD");
    expect(() => parseM5ManifestAuthorityConfig({ ...config(), authorityVersion: "" })).toThrow("M5_CONFIG_AUTHORITY_VERSION_INVALID");
    expect(() => parseM5ManifestAuthorityConfig({ ...config(), configVersion: "m5-manifest-authority-config/v0" })).toThrow("M5_CONFIG_VERSION_INVALID");
    expect(() => parseM5ManifestAuthorityConfig({ ...config(), allowedDatasetPins: [pin, { ...pin, datasetVersion: "v2" }] })).toThrow("M5_DATASET_PIN_CONFLICT");
  });

  it("dry-runs COMPLETE without saving and applies exactly once", async () => {
    const fixture = complete(); const deps = dependencies(fixture.raw);
    const preview = await provisionM5ManifestAuthority(config(), "DRY_RUN", deps);
    expect(preview.status).toBe("DRY_RUN_COMPLETE"); expect(deps.authorityRepository.save).not.toHaveBeenCalled();
    const applied = await provisionM5ManifestAuthority(config(), "APPLY", deps);
    expect(applied.status).toBe("APPLIED"); expect(deps.authorityRepository.save).toHaveBeenCalledTimes(1);
    if (preview.status === "DRY_RUN_COMPLETE" && applied.status === "APPLIED") expect(applied.preview).toEqual(preview.preview);
  });

  it("does not save incomplete or invalid assemblies", async () => {
    const fixture = complete(); const deps = dependencies(fixture.raw);
    const incomplete = await provisionM5ManifestAuthority(config({ manifest: { ...fixture.manifest, historySpan: undefined } }), "APPLY", deps);
    expect(incomplete.status).toBe("DRY_RUN_INCOMPLETE");
    const invalid = await provisionM5ManifestAuthority(config({ manifest: { ...fixture.manifest, liquidity: { evidenceId: "missing", fingerprint: "missing" } } }), "APPLY", deps);
    expect(invalid.status).toBe("DRY_RUN_INVALID"); expect(deps.authorityRepository.save).not.toHaveBeenCalled();
  });

  it("proves dataset IDs with raw evidence rather than provider/version alone", async () => {
    const fixture = complete(); const deps = dependencies(fixture.raw);
    const result = await provisionM5ManifestAuthority(config({ allowedDatasetPins: [{ ...pin, datasetId: "wrong-dataset" }] }), "DRY_RUN", deps);
    expect(result.status).toBe("DRY_RUN_INVALID"); expect(deps.authorityRepository.save).not.toHaveBeenCalled();
  });

  it("propagates raw repository and authority repository failures", async () => {
    const fixture = complete(); const rawFailure = new Error("DATABASE_FAILURE");
    await expect(provisionM5ManifestAuthority(config(), "DRY_RUN", { rawEvidenceRepository: { readAt: vi.fn(async () => { throw rawFailure; }) }, authorityRepository: { save: vi.fn() } })).rejects.toBe(rawFailure);
    const saveFailure = new Error("M5_MANIFEST_AUTHORITY_CONFLICT"); const deps = dependencies(fixture.raw, vi.fn(async () => { throw saveFailure; }));
    await expect(provisionM5ManifestAuthority(config(), "APPLY", deps)).rejects.toBe(saveFailure);
  });

  it("rejects identity/asOf mismatch and never invokes a producer", async () => {
    const fixture = complete(); const deps = dependencies(fixture.raw);
    const result = await provisionM5ManifestAuthority(config({ sourceContext: { ...sourceContext(), assetClass: "EQUITY" } }), "APPLY", deps);
    expect(["DRY_RUN_INVALID", "DRY_RUN_INCOMPLETE"]).toContain(result.status); expect(deps.authorityRepository.save).not.toHaveBeenCalled();
  });

  it("uses provisioning scopes instead of false AGE diagnostics", async () => {
    const fixture = complete(); const deps = dependencies(fixture.raw);
    const contextInvalid = await provisionM5ManifestAuthority(config({ sourceContext: { ...sourceContext(), assetClass: "UNKNOWN" } as never }), "DRY_RUN", deps);
    expect(contextInvalid.status).toBe("DRY_RUN_INVALID"); if (contextInvalid.status === "DRY_RUN_INVALID") expect(contextInvalid.errors[0]).toMatchObject({ scope: "CONTEXT" });
    const pinInvalid = await provisionM5ManifestAuthority(config({ allowedDatasetPins: [pin, { ...pin, datasetVersion: "v2" }] }), "DRY_RUN", deps);
    expect(pinInvalid.status).toBe("DRY_RUN_INVALID"); if (pinInvalid.status === "DRY_RUN_INVALID") expect(pinInvalid.errors[0]).toMatchObject({ scope: "DATASET_PINS" });
    const authorityInvalid = await provisionM5ManifestAuthority(config({ authorityVersion: "" }), "DRY_RUN", deps);
    expect(authorityInvalid.status).toBe("DRY_RUN_INVALID"); if (authorityInvalid.status === "DRY_RUN_INVALID") expect(authorityInvalid.errors[0]).toMatchObject({ scope: "AUTHORITY" });
    const incomplete = await provisionM5ManifestAuthority(config({ manifest: { ...fixture.manifest, historySpan: undefined } }), "DRY_RUN", deps);
    expect(incomplete.status).toBe("DRY_RUN_INCOMPLETE"); if (incomplete.status === "DRY_RUN_INCOMPLETE") expect(incomplete.missingRequirements[0]).toMatchObject({ scope: "ASSEMBLY", assemblyTarget: "HISTORY_SPAN" });
  });
});

describe("M5 authority CLI arguments", () => {
  it("defaults to dry-run and requires explicit apply", () => {
    expect(parseProvisionM5ManifestAuthorityCliArgs(["--config", "authority.json"])).toEqual({ configPath: "authority.json", mode: "DRY_RUN" });
    expect(parseProvisionM5ManifestAuthorityCliArgs(["--config", "authority.json", "--apply"])).toEqual({ configPath: "authority.json", mode: "APPLY" });
  });
  it("rejects missing and unknown arguments", () => {
    expect(() => parseProvisionM5ManifestAuthorityCliArgs([])).toThrow("M5_CLI_CONFIG_REQUIRED");
    expect(() => parseProvisionM5ManifestAuthorityCliArgs(["--unknown"])).toThrow("M5_CLI_UNKNOWN_ARGUMENT");
    expect(() => parseProvisionM5ManifestAuthorityCliArgs(["--config", "authority.json", "--apply", "--apply"])).toThrow("M5_CLI_DUPLICATE_APPLY");
  });

  it("formats every operational failure without exposing exception text or secrets", () => {
    const secret = new Error("postgres://user:super-secret@secret-host/database");
    expect(formatProvisioningCliError(secret)).toEqual({ status: "INFRASTRUCTURE_FAILURE", code: "M5_AUTHORITY_INFRASTRUCTURE_FAILURE", exitCode: 3 });
    expect(JSON.stringify(formatProvisioningCliError(secret))).not.toMatch(/postgres|super-secret|secret-host/);
    expect(formatProvisioningCliError(new Error("DATABASE_UNCONFIGURED"))).toEqual({ status: "INFRASTRUCTURE_FAILURE", code: "DATABASE_UNCONFIGURED", exitCode: 3 });
    expect(formatProvisioningCliError(new Error("M5_MANIFEST_AUTHORITY_CONFLICT"))).toEqual({ status: "AUTHORITY_CONFLICT", code: "M5_MANIFEST_AUTHORITY_CONFLICT", exitCode: 2 });
    expect(formatProvisioningCliError(new Error("M5_CONFIG_JSON_INVALID"))).toEqual({ status: "DRY_RUN_INVALID", code: "M5_CONFIG_JSON_INVALID", exitCode: 2 });
    expect(formatProvisioningCliError(new Error("M5_CONFIG_FILE_READ_FAILED"))).toEqual({ status: "DRY_RUN_INVALID", code: "M5_CONFIG_FILE_READ_FAILED", exitCode: 2 });
    expect(formatProvisioningCliError(new Error("M5_CLI_UNKNOWN_ARGUMENT"))).toEqual({ status: "CLI_INVALID_ARGUMENTS", code: "M5_CLI_UNKNOWN_ARGUMENT", exitCode: 2 });
  });
});
