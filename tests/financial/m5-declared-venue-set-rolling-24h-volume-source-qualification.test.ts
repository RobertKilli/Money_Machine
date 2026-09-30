import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isAuthenticM5DeclaredVenueSetRolling24hVolumeQualification, M5_DECLARED_VENUE_SET_ROLLING_24H_VOLUME_QUALIFICATION_VERSION, parseM5DeclaredVenueSetRolling24hVolumeQualification } from "../../src/domain/intelligence/m5-declared-venue-set-rolling-24h-volume-source-qualification";
import { projectM5DeclaredVenueSetRolling24hVolume } from "../../src/domain/intelligence/m5-declared-venue-set-rolling-24h-volume-projection-guard";

const reviewedAt = "2026-09-30T05:32:15.000Z";
function candidate(providerId: "coinbase-exchange" | "kraken-spot" | "coinmarketcap" = "coinbase-exchange") {
  const candidates = {
    "coinbase-exchange": { datasetId: "product-stats", datasetVersion: "coinbase-exchange-product-stats/v1", venueId: "coinbase-exchange", stableVenueId: "cbx", instrumentId: "ETH-USD", field: "volume", unit: "BASE_ASSET" as const, universe: "UNKNOWN" as const, coverage: "UNKNOWN" as const },
    "kraken-spot": { datasetId: "spot-ticker", datasetVersion: "kraken-spot-ticker/v1", venueId: "kraken-spot", stableVenueId: "kraken", instrumentId: "ETH/USD", field: "v[1]", unit: "UNKNOWN" as const, universe: "UNKNOWN" as const, coverage: "UNKNOWN" as const },
    coinmarketcap: { datasetId: "cryptocurrency-quotes", datasetVersion: "coinmarketcap-pro/v1", venueId: "coinmarketcap", stableVenueId: "cmc-aggregate", instrumentId: "aggregate", field: "volume_24h", unit: "QUOTE_NOTIONAL" as const, universe: "PROVIDER_SELECTED" as const, coverage: "PROVIDER_SELECTED" as const },
  };
  const p = candidates[providerId];
  return {
    contractVersion: M5_DECLARED_VENUE_SET_ROLLING_24H_VOLUME_QUALIFICATION_VERSION,
    scopedContractVersion: "m5-scoped-market-metric-contract/v1", metricKind: "DECLARED_VENUE_SET_ROLLING_24H_VOLUME", providerId,
    datasetId: p.datasetId, datasetVersion: p.datasetVersion, canonicalAssetId: "eip155:1/native:ETH", representation: "ETH", chainId: "eip155:1", contractAddress: null,
    mappingRevisionId: null, mappingRevisionFingerprint: null, scopedMetricContractFingerprint: "a".repeat(64), venueUniverse: p.universe,
    venues: [{ venueId: p.venueId, stableVenueId: p.stableVenueId, instrumentId: p.instrumentId, marketType: "SPOT", baseAsset: "ETH", quoteAsset: "USD", volumeUnit: p.unit, volumeField: p.field, windowKind: "UNKNOWN", windowStart: "2026-09-29T05:32:15.000Z", windowEnd: reviewedAt, asOf: reviewedAt, currentOrIncompleteIncluded: false, tradeCoverage: "UNKNOWN", venueCoverage: p.coverage, paginationTermination: "UNPROVEN", gapPolicy: "unknown", duplicatePolicy: "unknown", correctionPolicy: "unknown", freshnessPolicy: "unknown", finality: "UNKNOWN" }],
    quoteCurrency: "USD", aggregationVolumeUnit: p.unit, aggregationPolicy: "sum-compatible-members-v1", currencyConversionPolicy: "SEPARATE_AUTHORITY_REQUIRED",
    evidenceReferences: [{ url: providerId === "coinbase-exchange" ? "https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-stats" : providerId === "kraken-spot" ? "https://docs.kraken.com/api-reference/market-data/get-ticker-information" : "https://coinmarketcap.com/api/documentation/pro-api-reference/~schemas", title: "Official API documentation", evidenceId: `${providerId}-volume-docs`, checkedAt: reviewedAt, classification: "DOCUMENTED", claims: ["VOLUME_FIELD_SCHEMA"] }],
    usageApprovals: ["AUTHORITY_PERSISTENCE", "COMMERCIAL_USE", "NETWORK_ACQUISITION", "NORMALIZED_STORAGE", "RAW_PAYLOAD_PROCESSING", "RAW_PAYLOAD_STORAGE", "REDISTRIBUTION"].map(usage => ({ usage, approval: "NOT_APPROVED" })),
    storageApproval: "NOT_APPROVED", retentionApproval: "NOT_APPROVED", redistributionApproval: "NOT_APPROVED", commercialApproval: "NOT_APPROVED",
    blockers: ["M5_VOLUME_SOURCE_SEMANTICS_UNPROVEN"], reviewedAt, effectiveFrom: reviewedAt, expiresAt: "2027-09-30T05:32:15.000Z", recordedAt: reviewedAt,
  };
}

describe("M5 declared venue set rolling 24h volume qualification", () => {
  it("parses immutable strict candidate records and excludes recordedAt from identity", () => {
    const result = parseM5DeclaredVenueSetRolling24hVolumeQualification(candidate());
    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") return;
    expect(result.qualification.status).toBe("PARTIAL");
    expect(isAuthenticM5DeclaredVenueSetRolling24hVolumeQualification(result.qualification)).toBe(true);
    expect(Object.isFrozen(result.qualification.venues[0])).toBe(true);
    expect(Object.isFrozen(result.qualification.evidenceReferences[0].claims)).toBe(true);
    const rerecorded = parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...candidate(), recordedAt: "2026-09-30T05:33:15.000Z" });
    expect(rerecorded.status).toBe("VALID");
    if (rerecorded.status === "VALID") expect(rerecorded.qualification.qualificationFingerprint).toBe(result.qualification.qualificationFingerprint);
  });

  it("rejects unsafe shapes, noncanonical ordering, duplicate members, and invalid windows", () => {
    const input = candidate();
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, extra: true }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification(Object.assign(Object.create({ inherited: true }), input)).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, [Symbol("hidden")]: true }).status).toBe("INVALID");
    const accessor = { ...input };
    Object.defineProperty(accessor, "recordedAt", { get: () => reviewedAt, enumerable: true });
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification(accessor).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification(Object.assign(Object.create(null), input)).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, venues: [input.venues[0], input.venues[0]] }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, venues: [{ ...input.venues[0], windowStart: "2026-09-29T05:32:16.000Z" }] }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, venues: [{ ...input.venues[0], windowEnd: "2026-09-30T05:32:16.000Z" }] }).status).toBe("INVALID");
    const accessorArray = [input.venues[0]];
    Object.defineProperty(accessorArray, "0", { get: () => input.venues[0], enumerable: true });
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, venues: accessorArray }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, venues: [] }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, venueUniverse: "EXPLICIT_SEALED_DECLARED", venues: [{ ...input.venues[0], venueCoverage: "TOP_N" }] }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, datasetId: "other-dataset" }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, chainId: "eip155:2" }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, representation: "WETH" }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, quoteCurrency: "EUR" }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, venues: [{ ...input.venues[0], quoteAsset: "EUR" }] }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, venues: [{ ...input.venues[0], windowEnd: "2026-09-30T05:32:14.000Z" }] }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, evidenceReferences: [input.evidenceReferences[0], input.evidenceReferences[0]] }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, blockers: [...input.blockers, input.blockers[0]] }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, evidenceReferences: [{ ...input.evidenceReferences[0], claims: ["VOLUME_FIELD_SCHEMA", "VOLUME_FIELD_SCHEMA"] }] }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...input, venues: [{ ...input.venues[0], venueId: "https://example.invalid" }] }).status).toBe("INVALID");
  });

  it("keeps provider scope, units, member window/asOf, and aggregate universe distinct", () => {
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification(candidate("coinbase-exchange")).status).toBe("VALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification(candidate("kraken-spot")).status).toBe("VALID");
    const cmc = parseM5DeclaredVenueSetRolling24hVolumeQualification(candidate("coinmarketcap"));
    expect(cmc.status).toBe("VALID");
    if (cmc.status === "VALID") expect(cmc.qualification.status).toBe("BLOCKED");
    const changed = candidate();
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...changed, datasetVersion: "wrong" }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...changed, aggregationVolumeUnit: "QUOTE_NOTIONAL" }).status).toBe("INVALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...changed, venueUniverse: "TOP_N", venues: [{ ...changed.venues[0], venueCoverage: "TOP_N" }] }).status).toBe("VALID");
    expect(parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...changed, venues: [{ ...changed.venues[0], currentOrIncompleteIncluded: true }] }).status).toBe("VALID");
    const base = parseM5DeclaredVenueSetRolling24hVolumeQualification(changed);
    const modified = parseM5DeclaredVenueSetRolling24hVolumeQualification({ ...changed, aggregationPolicy: "different-policy-v1" });
    expect(base.status).toBe("VALID");
    expect(modified.status).toBe("VALID");
    if (base.status === "VALID" && modified.status === "VALID") expect(modified.qualification.qualificationFingerprint).not.toBe(base.qualification.qualificationFingerprint);
  });

  it("never projects candidates or copied/serialized qualifications", () => {
    const parsed = parseM5DeclaredVenueSetRolling24hVolumeQualification(candidate());
    expect(parsed.status).toBe("VALID");
    if (parsed.status !== "VALID") return;
    const request: Record<string, unknown> = { qualification: parsed.qualification, metricKind: parsed.qualification.metricKind, venueMembers: [], mappingAuthority: null };
    expect(projectM5DeclaredVenueSetRolling24hVolume(request as never)).toBeNull();
    expect(projectM5DeclaredVenueSetRolling24hVolume({ ...request, qualification: { ...parsed.qualification } } as never)).toBeNull();
    expect(projectM5DeclaredVenueSetRolling24hVolume({ ...request, qualification: JSON.parse(JSON.stringify(parsed.qualification)) } as never)).toBeNull();
    expect(isAuthenticM5DeclaredVenueSetRolling24hVolumeQualification(JSON.parse(JSON.stringify(parsed.qualification)))).toBe(false);
  });

  it("keeps production selection, venue set, mapping, and approvals blocked", () => {
    const config = JSON.parse(readFileSync(new URL("../../config/m5/declared-venue-set-rolling-24h-volume-source-qualification.production.json", import.meta.url), "utf8"));
    expect(config.productionStatus).toBe("BLOCKED");
    expect(config.selectedSource).toBeNull();
    expect(config.declaredVenueSet).toBeNull();
    expect(config.mappingAuthority).toBeNull();
    expect(config.approvals.usageApprovals).toHaveLength(7);
    expect(config.approvals.usageApprovals.every((a: { approval: string }) => a.approval === "NOT_APPROVED")).toBe(true);
    expect(config.approvals.storage).toBe("NOT_APPROVED");
    expect(config.approvals.retention).toBe("NOT_APPROVED");
    expect(config.approvals.redistribution).toBe("NOT_APPROVED");
    expect(config.approvals.commercial).toBe("NOT_APPROVED");
    expect(config.candidates.map((c: { qualificationStatus: string }) => c.qualificationStatus)).toEqual(["PARTIAL", "PARTIAL", "BLOCKED"]);
  });
});
