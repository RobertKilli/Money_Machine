/* eslint-disable @typescript-eslint/no-explicit-any -- mutation fixtures intentionally model hostile unknown runtime shapes. */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { evaluateM5ScopedMarketMetric } from "@/application/intelligence/evaluate-m5-scoped-market-metric";
import {
  fingerprintM5ScopedMarketMetricContract,
  m5ScopedMetricQualificationScopeFingerprint,
  M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION,
  parseM5ScopedMarketMetricContract,
  parseM5ScopedMetricDirectionConfig,
} from "@/domain/intelligence/m5-scoped-market-metric-contract";
import { M5_COINGECKO_REQUIRED_SEMANTICS, parseM5CoinGeckoMarketSourceQualification, type M5CoinGeckoMarketMetric } from "@/domain/intelligence/m5-coingecko-market-source-qualification";
import { evaluateM5ProviderReadinessConfig, M5_DEFAULT_REQUIRED_CAPABILITIES, M5_DEFAULT_REQUESTED_USAGES } from "@/application/intelligence/evaluate-m5-provider-readiness";

const at = "2026-09-30T00:00:00.000Z";
const qualification = (metric: M5CoinGeckoMarketMetric = "DAILY_CLOSE_SERIES") => {
  const config = JSON.parse(readFileSync(new URL("../../config/m5/coingecko-market-source-qualification.production.json", import.meta.url), "utf8")) as any;
  const row = config.qualifications.find((item: any) => item.metric === metric);
  const result = parseM5CoinGeckoMarketSourceQualification({ ...config.scope, ...row, contractVersion: config.contractVersion, requiredM5Semantics: M5_COINGECKO_REQUIRED_SEMANTICS[row.metric as M5CoinGeckoMarketMetric], reviewedAt: config.reviewedAt, effectiveFrom: config.effectiveFrom, expiresAt: config.expiresAt, recordedAt: config.recordedAt });
  if (result.status !== "VALID") throw new Error("fixture invalid");
  return result.qualification;
};
const closeInput = (): Record<string, any> => {
  const q = qualification();
  const body: Record<string, unknown> = {
    metricKind: "NAMED_VENUE_DAILY_CLOSE", providerId: q.providerId, datasetId: q.datasetId, datasetVersion: q.datasetVersion,
    canonicalAssetId: "eip155:1/erc20:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", mappingRevision: "UNMAPPED", mappingAuthority: null, chainId: "eip155:1", representation: "WETH",
    currency: "USD", observedAt: at, asOf: at,
    sourceQualification: { contractVersion: q.contractVersion, qualificationId: q.qualificationId, qualificationFingerprint: q.qualificationFingerprint, providerId: q.providerId, datasetId: q.datasetId, datasetVersion: q.datasetVersion, metric: q.metric, metricScopeFingerprint: "0".repeat(64) },
    methodologyVersion: "UTC_DAILY_CLOSE_V1", completeness: "COMPLETE_DECLARED_SCOPE",
    evidenceReferences: [{ url: "https://docs.coingecko.com/reference/contract-address-market-chart-range", title: "Synthetic contract fixture", evidenceId: "evidence:close:v1", checkedAt: at }],
    venueId: "venue:synthetic", instrumentId: "instrument:weth-usd", baseAsset: "WETH", quoteAsset: "USD", marketType: "SPOT", timezone: "UTC", sessionBoundary: "00:00:00Z", candleInterval: "P1D", candleOpen: "2026-09-29T00:00:00.000Z", candleClose: at,
    closePriceBasis: "LAST_TRADE_AT_OR_BEFORE_BOUNDARY", correctionPolicy: "VERSIONED_RESTATEMENT", gapPolicy: "GAPS_BLOCK", recordedAt: "2026-09-30T00:10:00.000Z",
  };
  (body.sourceQualification as Record<string, unknown>).metricScopeFingerprint = m5ScopedMetricQualificationScopeFingerprint(body);
  return { ...body, contractVersion: M5_SCOPED_MARKET_METRIC_CONTRACT_VERSION, fingerprint: fingerprintM5ScopedMarketMetricContract(body) };
};
const marketCapInput = (): Record<string, any> => {
  const q = qualification("MARKET_CAP"); const row: Record<string, any> = closeInput();
  for (const key of ["venueId", "instrumentId", "baseAsset", "quoteAsset", "marketType", "timezone", "sessionBoundary", "candleInterval", "candleOpen", "candleClose", "closePriceBasis", "correctionPolicy", "gapPolicy"]) delete row[key];
  Object.assign(row, { metricKind: "REPORTED_CIRCULATING_MARKET_CAP", sourceQualification: { contractVersion: q.contractVersion, qualificationId: q.qualificationId, qualificationFingerprint: q.qualificationFingerprint, providerId: q.providerId, datasetId: q.datasetId, datasetVersion: q.datasetVersion, metric: "MARKET_CAP", metricScopeFingerprint: "0".repeat(64) }, reportedValueAtoms: "987654321012345678901234", scale: 18, supplyBasis: "CIRCULATING", providerMethodologyVersion: "CMC_CAP_METHODOLOGY_V1", valueKind: "PROVIDER_REPORTED" });
  row.sourceQualification.metricScopeFingerprint = m5ScopedMetricQualificationScopeFingerprint(row);
  row.fingerprint = fingerprintM5ScopedMarketMetricContract(row);
  return row;
};

describe("M5 scoped market metric contracts", () => {
  it("parses the explicitly versioned product direction and keeps every metric blocked", () => {
    const raw = JSON.parse(readFileSync(new URL("../../config/m5/scoped-market-metric-direction.production.json", import.meta.url), "utf8"));
    const result = parseM5ScopedMetricDirectionConfig(raw);
    expect(result.status).toBe("VALID");
    if (result.status === "VALID") {
      expect(result.config.decisions.map(x => x.metricKind)).toEqual(["DECLARED_VENUE_SET_ROLLING_24H_VOLUME", "NAMED_VENUE_DAILY_CLOSE", "REPORTED_CIRCULATING_MARKET_CAP"]);
      expect(result.config.decisions.every(x => x.status === "BLOCKED")).toBe(true);
      expect(Object.isFrozen(result.config.decisions[0]?.blockers)).toBe(true);
      const replay = structuredClone(raw); replay.recordedAt = "2026-10-01T00:00:00.000Z";
      for (const decision of replay.decisions) decision.recordedAt = replay.recordedAt;
      const sameMaterial = parseM5ScopedMetricDirectionConfig(replay);
      expect(sameMaterial.status).toBe("VALID");
      if (sameMaterial.status === "VALID") expect(sameMaterial.config.fingerprint).toBe(result.config.fingerprint);
    }
  });

  it("has deterministic material identity, excludes recordedAt, and deep-freezes normalized results", () => {
    const original = closeInput();
    const later = structuredClone(original);
    later.recordedAt = "2026-09-30T01:00:00.000Z";
    expect(fingerprintM5ScopedMarketMetricContract(original)).toBe(fingerprintM5ScopedMarketMetricContract(later));
    const a = parseM5ScopedMarketMetricContract(original);
    const b = parseM5ScopedMarketMetricContract(later);
    expect(a.status).toBe("VALID"); expect(b.status).toBe("VALID");
    if (a.status === "VALID" && b.status === "VALID") {
      expect(a.contract.fingerprint).toBe(b.contract.fingerprint);
      expect(a.contract.materialId).toBe(b.contract.materialId);
      expect(Object.isFrozen(a.contract)).toBe(true);
      expect(Object.isFrozen(a.contract.evidenceReferences)).toBe(true);
    }
  });

  it("rejects unsafe shapes, noncanonical ids, evidence duplication and credential-like material", () => {
    const unknown = closeInput() as any; unknown.extra = 1;
    const inherited = Object.assign(Object.create({ inherited: true }), closeInput());
    const symbol = closeInput() as any; symbol[Symbol("unsafe")] = 1;
    const accessor = closeInput() as any; Object.defineProperty(accessor, "providerId", { enumerable: true, get: () => "coingecko" });
    const blank = closeInput() as any; blank.instrumentId = " ";
    const badUrl = closeInput() as any; badUrl.evidenceReferences[0].url = "https://docs.coingecko.com/reference/x?token=secret";
    const secret = closeInput() as any; secret.datasetId = "api_key=synthetic-sentinel";
    const dup = closeInput() as any; dup.evidenceReferences.push(structuredClone(dup.evidenceReferences[0]));
    for (const value of [unknown, inherited, symbol, accessor, blank, badUrl, secret, dup]) expect(parseM5ScopedMarketMetricContract(value).status).toBe("INVALID");
  });

  it("requires an exact UTC daily close, named venue, correction and gap policy", () => {
    for (const mutate of [
      (x: any) => { x.timezone = "Europe/Oslo"; }, (x: any) => { x.sessionBoundary = "23:59:59Z"; },
      (x: any) => { x.candleInterval = "AUTO"; }, (x: any) => { x.candleClose = "2026-09-30T00:00:01.000Z"; },
      (x: any) => { x.closePriceBasis = "SNAPSHOT"; }, (x: any) => { x.gapPolicy = "FILL_FORWARD"; },
      (x: any) => { x.correctionPolicy = "SILENT_OVERWRITE"; }, (x: any) => { x.venueId = ""; },
    ]) { const x = closeInput() as any; mutate(x); x.fingerprint = fingerprintM5ScopedMarketMetricContract(x); expect(parseM5ScopedMarketMetricContract(x).status).toBe("INVALID"); }
  });

  it("rejects total supply, FDV, WETH-to-ETH substitution without a mapping authority, and partial qualification", () => {
    const raw = closeInput() as any;
    const forged = structuredClone(raw); forged.sourceQualification.qualificationFingerprint = "f".repeat(64); forged.fingerprint = fingerprintM5ScopedMarketMetricContract(forged);
    const parsed = parseM5CoinGeckoMarketSourceQualification({});
    expect(parsed.status).toBe("INVALID");
    const q = qualification();
    const gate = evaluateM5ScopedMarketMetric(raw, q);
    expect(gate.status).toBe("BLOCKED");
    if (gate.status === "BLOCKED") expect(gate.blockers).toContain("M5_SCOPED_METRIC_QUALIFICATION_NOT_QUALIFIED");
    expect(evaluateM5ScopedMarketMetric(forged, q).status).toBe("BLOCKED");
    expect(parseM5ScopedMarketMetricContract(marketCapInput()).status).toBe("VALID");
    for (const basis of ["TOTAL_SUPPLY", "FULLY_DILUTED", null]) {
      const cap = marketCapInput(); cap.supplyBasis = basis; cap.fingerprint = fingerprintM5ScopedMarketMetricContract(cap);
      expect(parseM5ScopedMarketMetricContract(cap).status).toBe("INVALID");
    }
    const internal = marketCapInput(); internal.valueKind = "INTERNAL_DERIVATION"; internal.fingerprint = fingerprintM5ScopedMarketMetricContract(internal);
    expect(parseM5ScopedMarketMetricContract(internal).status).toBe("INVALID");
    const noValue = marketCapInput(); noValue.reportedValueAtoms = null; noValue.fingerprint = fingerprintM5ScopedMarketMetricContract(noValue);
    expect(parseM5ScopedMarketMetricContract(noValue).status).toBe("INVALID");
    const wethAsEth = marketCapInput(); wethAsEth.canonicalAssetId = "eip155:1/native:ETH"; wethAsEth.representation = "WETH";
    wethAsEth.sourceQualification.metricScopeFingerprint = m5ScopedMetricQualificationScopeFingerprint(wethAsEth); wethAsEth.fingerprint = fingerprintM5ScopedMarketMetricContract(wethAsEth);
    const noImplicitEth = evaluateM5ScopedMarketMetric(wethAsEth, qualification("MARKET_CAP"));
    expect(noImplicitEth.status).toBe("BLOCKED");
    if (noImplicitEth.status === "BLOCKED") expect(noImplicitEth.blockers).toContain("M5_SCOPED_METRIC_QUALIFICATION_ASSET_MISMATCH");
  });

  it("requires an exact rolling 24h window and a sorted unique declared venue/instrument set", () => {
    const q = qualification("VOLUME_24H");
    const row: any = closeInput();
    delete row.venueId; delete row.instrumentId; delete row.baseAsset; delete row.quoteAsset; delete row.marketType; delete row.timezone; delete row.sessionBoundary; delete row.candleInterval; delete row.candleOpen; delete row.candleClose; delete row.closePriceBasis; delete row.correctionPolicy; delete row.gapPolicy;
    Object.assign(row, { metricKind: "DECLARED_VENUE_SET_ROLLING_24H_VOLUME", sourceQualification: { contractVersion: q.contractVersion, qualificationId: q.qualificationId, qualificationFingerprint: q.qualificationFingerprint, providerId: q.providerId, datasetId: q.datasetId, datasetVersion: q.datasetVersion, metric: "VOLUME_24H", metricScopeFingerprint: "0".repeat(64) }, venues: [{ venueId: "venue:a", instrumentId: "weth-usd", marketType: "SPOT" }, { venueId: "venue:b", instrumentId: "weth-usd", marketType: "SPOT" }], windowStart: "2026-09-29T00:00:00.000Z", windowEnd: at, aggregationMethodologyVersion: "ROLLING_V1", duplicateMarketPolicy: "CANONICAL_INSTRUMENT_DEDUPLICATION", correctionPolicy: "VERSIONED_RESTATEMENT", reportedValueAtoms: "123456789012345678901234", scale: 18 });
    row.sourceQualification.metricScopeFingerprint = m5ScopedMetricQualificationScopeFingerprint(row);
    row.fingerprint = fingerprintM5ScopedMarketMetricContract(row);
    expect(parseM5ScopedMarketMetricContract(row).status).toBe("VALID");
    for (const mutate of [(x: any) => { x.windowStart = "2026-09-29T01:00:00.000Z"; }, (x: any) => { x.windowEnd = "2026-09-29T23:59:59.999Z"; }, (x: any) => { x.venues.push(structuredClone(x.venues[0])); }, (x: any) => { x.venues.reverse(); }, (x: any) => { x.venues[0].marketType = "DEX_SPOT"; }, (x: any) => { x.venues.push({ venueId: "venue:c", instrumentId: "weth-usd", marketType: "SPOT" }); }, (x: any) => { x.venues.pop(); }]) {
      const bad = structuredClone(row); mutate(bad); bad.fingerprint = fingerprintM5ScopedMarketMetricContract(bad); expect(parseM5ScopedMarketMetricContract(bad).status).toBe("INVALID");
    }
  });

  it("rejects copied/fabricated qualifications and leaves legacy production readiness blocked", () => {
    const q = qualification(); const input = closeInput();
    expect(evaluateM5ScopedMarketMetric(input, { ...q }).status).toBe("BLOCKED");
    expect(evaluateM5ScopedMarketMetric(input, q).status).toBe("BLOCKED");
    const readiness = JSON.parse(readFileSync(new URL("../../config/m5/provider-readiness.production.json", import.meta.url), "utf8"));
    const evaluation = evaluateM5ProviderReadinessConfig({ config: readiness, evaluatedAt: "2026-09-30T00:00:00.000Z", requiredCapabilities: M5_DEFAULT_REQUIRED_CAPABILITIES, requestedUsages: M5_DEFAULT_REQUESTED_USAGES });
    expect(evaluation.result).toBe("BLOCKED");
  });

  it("requires explicit canonical asset mapping authority and rejects mismatches", () => {
    const q = qualification();
    const missing = closeInput();
    const noMapping = evaluateM5ScopedMarketMetric(missing, q);
    expect(noMapping.status).toBe("BLOCKED");
    if (noMapping.status === "BLOCKED") expect(noMapping.blockers).toContain("M5_SCOPED_METRIC_ASSET_MAPPING_UNAUTHORIZED");
    const mismatch = closeInput(); mismatch.mappingRevision = "MAP_V1"; mismatch.mappingAuthority = { authorityId: "mapping:synthetic", fingerprint: "a".repeat(64), canonicalAssetId: mismatch.canonicalAssetId, representation: "WETH", revision: "MAP_V0" };
    (mismatch.sourceQualification as Record<string, unknown>).metricScopeFingerprint = m5ScopedMetricQualificationScopeFingerprint(mismatch);
    mismatch.fingerprint = fingerprintM5ScopedMarketMetricContract(mismatch);
    const wrongMapping = evaluateM5ScopedMarketMetric(mismatch, q);
    expect(wrongMapping.status).toBe("BLOCKED");
    if (wrongMapping.status === "BLOCKED") expect(wrongMapping.blockers).toContain("M5_SCOPED_METRIC_ASSET_MAPPING_UNAUTHORIZED");
  });

  it("binds exact scoped qualification, expiry and has no transport or persistence side effects", () => {
    const q = qualification(); const input = closeInput();
    const mismatchedScope = structuredClone(input);
    mismatchedScope.venueId = "venue:other";
    mismatchedScope.fingerprint = fingerprintM5ScopedMarketMetricContract(mismatchedScope);
    expect(parseM5ScopedMarketMetricContract(mismatchedScope).status).toBe("INVALID");
    const expired = structuredClone(input); expired.recordedAt = "2027-09-30T00:00:00.000Z";
    expired.fingerprint = fingerprintM5ScopedMarketMetricContract(expired);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const gate = evaluateM5ScopedMarketMetric(expired, q);
    expect(gate.status).toBe("BLOCKED");
    if (gate.status === "BLOCKED") {
      expect(gate.blockers).toContain("M5_SCOPED_METRIC_QUALIFICATION_INACTIVE");
      expect(gate.blockers).toContain("M5_SCOPED_METRIC_QUALIFICATION_SCOPE_BINDING_UNAVAILABLE");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
