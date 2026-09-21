import { describe, expect, it } from "vitest";
import { assertRawEligibilityEvidence, createAgeReferenceEligibilityEvidence, createContractVerificationEligibilityEvidence, createQuantitativeEligibilityEvidence, createSuspiciousEligibilityEvidence, createVenueEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";

const base = (overrides: Record<string, unknown> = {}) => ({ evidenceId: "evidence-1", candidateId: "candidate-1", assetId: "asset-1", canonicalIdentifier: "asset:one", assetClass: "CRYPTO", providerId: "provider-1", datasetId: "dataset-1", datasetVersion: "v1", mappingRevisionId: "mapping-1", sourceLineageId: "lineage-1", observedAt: "2026-09-13T10:00:00.000Z", availableAt: "2026-09-13T10:05:00.000Z", provenance: { sourceType: "M5_SOURCE_LINEAGE", sourceRecordIds: ["record-b", "record-a"], payloadFingerprint: "a".repeat(64) }, ...overrides });
const quantitative = (metricKind: "LIQUIDITY" | "VOLUME" | "MARKET_CAP" | "TOP10_CONCENTRATION" | "SINGLE_CONCENTRATION" | "VOLATILITY" | "HISTORY_SPAN", overrides: Record<string, unknown> = {}) => createQuantitativeEligibilityEvidence(base({ metricKind, valueAtoms: 1000n, scale: 0, unit: "MINOR", semanticsVersion: "metric/v1", currencyCode: "USD", window: { startAt: "2026-09-12T10:00:00.000Z", endAt: "2026-09-13T10:00:00.000Z" }, ...(metricKind.includes("CONCENTRATION") ? { holderSnapshotId: "snapshot-1", holderSnapshotFingerprint: "b".repeat(64), holderDerivationFingerprint: "c".repeat(64), asOf: "2026-09-13T00:00:00.000Z" } : {}), ...(metricKind === "VOLATILITY" || metricKind === "HISTORY_SPAN" ? { dailySeriesAuthorityId: "authority-1", dailySeriesAuthorityFingerprint: "d".repeat(64), dailySeriesDerivationFingerprint: "e".repeat(64), asOf: "2026-09-13T00:00:00.000Z" } : {}), ...overrides }) as never);

describe("M5 raw eligibility evidence", () => {
  it("creates provider-neutral monetary and concentration facts using bigint values", () => {
    expect(quantitative("LIQUIDITY").valueAtoms).toBe(1000n); expect(quantitative("VOLUME").metricKind).toBe("VOLUME"); expect(quantitative("MARKET_CAP").currencyCode).toBe("USD");
    expect(quantitative("TOP10_CONCENTRATION", { valueAtoms: 8000n, unit: "BPS", currencyCode: undefined }).unit).toBe("BPS"); expect(quantitative("SINGLE_CONCENTRATION", { valueAtoms: 3000n, unit: "BPS", currencyCode: undefined }).valueAtoms).toBe(3000n);
  });
  it("requires explicit raw volatility and history-span semantics without deriving either", () => {
    for (const valueAtoms of [15000n, 20000n, 25000n]) expect(quantitative("VOLATILITY", { valueAtoms, unit: "BPS", currencyCode: undefined, semanticsVersion: "volatility-raw/v1" }).semanticsVersion).toBe("volatility-raw/v1");
    expect(quantitative("HISTORY_SPAN", { valueAtoms: 14n, unit: "DAYS", currencyCode: undefined, semanticsVersion: "history-span-raw/v1", qualificationBasis: "QUALIFYING_PRICE_OBSERVATIONS" }).qualificationBasis).toBe("QUALIFYING_PRICE_OBSERVATIONS");
    expect(() => quantitative("VOLATILITY", { semanticsVersion: "" })).toThrow("M5_RAW_SEMANTICS_VERSION_INVALID"); expect(() => quantitative("HISTORY_SPAN", { qualificationBasis: "" })).toThrow("M5_RAW_HISTORY_SPAN_INVALID");
  });
  it("models age references and all raw contract verification states", () => {
    expect(createAgeReferenceEligibilityEvidence(base({ referenceKind: "ASSET_INCEPTION", ageBasis: "ASSET_INCEPTION", referenceAt: "2025-09-13T10:00:00.000Z" }) as never).referenceAt).toBe("2025-09-13T10:00:00.000Z");
    for (const verificationState of ["VERIFIED", "UNVERIFIED", "UNKNOWN"] as const) expect(createContractVerificationEligibilityEvidence(base({ verificationState }) as never).verificationState).toBe(verificationState);
  });
  it("keeps venue eligibility distinct from the provider and preserves suspicious severity as metadata", () => {
    const venue = createVenueEligibilityEvidence(base({ venueId: "venue-1", eligibilityState: "ELIGIBLE" }) as never); expect(venue.venueId).not.toBe(venue.providerId);
    const low = createSuspiciousEligibilityEvidence(base({ flagCode: "WASH_TRADING", severity: "LOW", sourceSignalId: "signal-1" }) as never); const critical = createSuspiciousEligibilityEvidence(base({ flagCode: "WASH_TRADING", severity: "CRITICAL", sourceSignalId: "signal-1" }) as never);
    expect(low.flagCode).toBe(critical.flagCode); expect(low.severity).toBe("LOW"); expect(critical.severity).toBe("CRITICAL"); expect("status" in low).toBe(false);
  });
  it("normalizes unordered provenance and replays a deterministic immutable fingerprint", () => {
    const a = quantitative("LIQUIDITY"); const b = quantitative("LIQUIDITY", { provenance: { sourceType: "M5_SOURCE_LINEAGE", sourceRecordIds: ["record-a", "record-b", "record-a"], payloadFingerprint: "a".repeat(64) } });
    expect(a.fingerprint).toBe(b.fingerprint); expect(a.provenance.sourceRecordIds).toEqual(["record-a", "record-b"]); expect(Object.isFrozen(a)).toBe(true); expect(Object.isFrozen(a.provenance.sourceRecordIds)).toBe(true); assertRawEligibilityEvidence(a);
  });
  it("changes fingerprints for material value, provider, dataset, and timestamp changes", () => {
    const a = quantitative("LIQUIDITY"); for (const change of [{ valueAtoms: 1001n }, { providerId: "provider-2" }, { datasetVersion: "v2" }, { mappingRevisionId: "mapping-2" }, { availableAt: "2026-09-13T10:06:00.000Z" }]) expect(quantitative("LIQUIDITY", change).fingerprint).not.toBe(a.fingerprint);
  });

  it("requires an explicit mapping revision on every raw evidence envelope", () => {
    expect(() => quantitative("LIQUIDITY", { mappingRevisionId: " " })).toThrow("M5_RAW_MAPPINGREVISIONID_INVALID");
    expect(() => quantitative("LIQUIDITY", { sourceLineageId: " " })).toThrow("M5_RAW_SOURCELINEAGEID_INVALID");
    expect(() => quantitative("LIQUIDITY", { provenance: { sourceType: "PROVIDER", sourceRecordIds: ["record"], payloadFingerprint: "a".repeat(64) } })).toThrow("M5_RAW_SOURCE_TYPE_INVALID");
    expect(() => quantitative("LIQUIDITY", { provenance: { sourceType: "M5_SOURCE_LINEAGE", sourceRecordIds: ["record"], payloadFingerprint: "payload" } })).toThrow("M5_RAW_PAYLOAD_FINGERPRINT_INVALID");
  });
  it("rejects as-of and partial authority on non-daily, non-concentration metrics", () => {
    expect(() => quantitative("LIQUIDITY", { asOf: "2026-09-13T00:00:00.000Z" })).toThrow("M5_RAW_DAILY_AUTHORITY_FORBIDDEN");
    expect(() => quantitative("LIQUIDITY", { dailySeriesAuthorityId: "authority-1" })).toThrow("M5_RAW_DAILY_AUTHORITY_FORBIDDEN");
  });
  it("fails closed for invalid identity, timestamps, numeric representations, and ranges", () => {
    expect(() => quantitative("LIQUIDITY", { assetClass: " UNKNOWN " })).toThrow("M5_RAW_ASSET_CLASS_UNKNOWN"); expect(() => quantitative("LIQUIDITY", { candidateId: " " })).toThrow("M5_RAW_CANDIDATEID_INVALID"); expect(() => quantitative("LIQUIDITY", { observedAt: "2026-09-13T10:00:00Z" })).toThrow("M5_RAW_OBSERVED_AT_INVALID");
    expect(() => quantitative("LIQUIDITY", { valueAtoms: 1.5 })).toThrow("M5_RAW_VALUE_INVALID"); for (const metricKind of ["TOP10_CONCENTRATION", "SINGLE_CONCENTRATION"] as const) { expect(quantitative(metricKind, { valueAtoms: 10000n, unit: "BPS", currencyCode: undefined }).valueAtoms).toBe(10000n); expect(() => quantitative(metricKind, { valueAtoms: 10001n, unit: "BPS", currencyCode: undefined })).toThrow("M5_RAW_BPS_INVALID"); } expect(() => quantitative("VOLATILITY", { valueAtoms: -1n, unit: "BPS", currencyCode: undefined })).toThrow("M5_RAW_VALUE_INVALID"); expect(() => createVenueEligibilityEvidence(base({ venueId: "", eligibilityState: "ELIGIBLE" }) as never)).toThrow("M5_RAW_VENUE_ID_INVALID"); expect(() => createSuspiciousEligibilityEvidence(base({ flagCode: "", severity: "LOW", sourceSignalId: "s" }) as never)).toThrow("M5_RAW_SUSPICIOUS_FLAG_INVALID");
  });
  it("has no M4 coupling, eligibility decision, or wall-clock input", () => {
    const evidence = quantitative("LIQUIDITY"); expect("canonicalContextId" in evidence).toBe(false); expect("datasetPins" in evidence).toBe(false); expect("status" in evidence).toBe(false); expect(quantitative("LIQUIDITY")).toEqual(evidence);
  });
});
