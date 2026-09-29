import { describe, expect, it } from "vitest";
import {
  M5_COINGECKO_ENDPOINT_PROFILE,
  M5_COINGECKO_MARKET_SOURCE_QUALIFICATION_VERSION,
  M5_COINGECKO_QUERY_PROFILE,
  M5_COINGECKO_REQUIRED_SEMANTICS,
  M5_COINGECKO_WETH_ADDRESS,
  isM5CoinGeckoQualificationActive,
  parseM5CoinGeckoMarketSourceQualification,
  type M5CoinGeckoMarketMetric,
} from "@/domain/intelligence/m5-coingecko-market-source-qualification";
import { resolveConfiguredM5CoinGeckoMarketSourceQualification } from "@/application/intelligence/resolve-m5-coingecko-market-source-qualification";

const now = "2026-09-29T16:43:05.000Z";
const closeProofs = ["M5_CADENCE_AND_HISTORY_COMPLETENESS_DOCUMENTED", "M5_DAILY_CLOSE_DEFINITION_DOCUMENTED", "M5_GAP_AND_DUPLICATE_POLICY_DOCUMENTED", "M5_UTC_DAILY_BOUNDARY_DOCUMENTED"];
const metrics: Readonly<Record<M5CoinGeckoMarketMetric, Readonly<{ field: string; proofs: readonly string[] }>>> = {
  DAILY_CLOSE_SERIES: { field: "prices", proofs: closeProofs },
  MARKET_CAP: { field: "market_caps", proofs: ["M5_MARKET_CAP_FORMULA_AND_BASIS_DOCUMENTED", "M5_MISSING_VALUE_POLICY_DOCUMENTED", "M5_OBSERVATION_TIME_AND_AS_OF_DOCUMENTED", "M5_QUOTE_CURRENCY_DOCUMENTED", "M5_DECIMAL_SCALE_DOCUMENTED"] },
  VOLUME_24H: { field: "total_volumes", proofs: ["M5_EXACT_ROLLING_24H_WINDOW_DOCUMENTED", "M5_MARKET_UNIVERSE_COMPLETENESS_DOCUMENTED", "M5_QUOTE_CURRENCY_DOCUMENTED", "M5_WINDOW_END_BINDS_AS_OF_DOCUMENTED", "M5_DECIMAL_SCALE_DOCUMENTED"] },
};
const officialUrl = "https://docs.coingecko.com/reference/contract-address-market-chart-range";

function fixture(metric: M5CoinGeckoMarketMetric = "DAILY_CLOSE_SERIES", overrides: Record<string, unknown> = {}) {
  const proof = metrics[metric].proofs;
  return {
    contractVersion: M5_COINGECKO_MARKET_SOURCE_QUALIFICATION_VERSION,
    providerId: "coingecko",
    datasetId: "coingecko-market-chart",
    datasetVersion: "coingecko-market-chart/range-v1",
    endpointProfile: M5_COINGECKO_ENDPOINT_PROFILE,
    queryProfile: M5_COINGECKO_QUERY_PROFILE,
    endpointHost: "pro-api.coingecko.com",
    endpointPath: "/api/v3/coins/ethereum/contract/{address}/market_chart/range",
    chainId: "eip155:1",
    assetSymbol: "WETH",
    contractAddress: M5_COINGECKO_WETH_ADDRESS,
    metric,
    providerField: metrics[metric].field,
    requiredM5Semantics: M5_COINGECKO_REQUIRED_SEMANTICS[metric],
    documentedProviderSemantics: proof,
    evidenceReferences: [{ url: officialUrl, title: "Coin Historical Chart Data within Time Range by Token Address", evidenceLevel: "DOCUMENTED", checkedAt: now, claims: proof }],
    reviewedAt: now,
    effectiveFrom: now,
    expiresAt: "2027-09-29T16:43:05.000Z",
    blockers: [],
    recordedAt: now,
    ...overrides,
  };
}

describe("M5 CoinGecko market-source qualification contract", () => {
  it.each(Object.keys(metrics) as M5CoinGeckoMarketMetric[])("computes an immutable qualified contract for fully evidenced synthetic %s", metric => {
    const parsed = parseM5CoinGeckoMarketSourceQualification(fixture(metric));
    expect(parsed.status).toBe("VALID");
    if (parsed.status !== "VALID") return;
    expect(parsed.qualification.status).toBe("QUALIFIED");
    expect(parsed.qualification.qualificationId).toBe(`m5-coingecko-market-source-qualification:${parsed.qualification.qualificationFingerprint}`);
    expect(Object.isFrozen(parsed.qualification.evidenceReferences[0]?.claims)).toBe(true);
    expect(Object.isFrozen(parsed.qualification.requiredM5Semantics)).toBe(true);
    expect(Object.isFrozen(parsed.qualification)).toBe(true);
    expect(() => { (parsed.qualification as { status: string }).status = "PARTIAL"; }).toThrow();
  });

  it("normalizes set ordering and excludes recordedAt from material identity", () => {
    const first = parseM5CoinGeckoMarketSourceQualification(fixture());
    const reversed = fixture("DAILY_CLOSE_SERIES", {
      documentedProviderSemantics: [...closeProofs].reverse(),
      evidenceReferences: [{ url: officialUrl, title: "Coin Historical Chart Data within Time Range by Token Address", evidenceLevel: "DOCUMENTED", checkedAt: now, claims: [...closeProofs].reverse() }],
      recordedAt: "2026-09-30T00:00:00.000Z",
    });
    const second = parseM5CoinGeckoMarketSourceQualification(reversed);
    expect(first.status).toBe("VALID");
    expect(second.status).toBe("VALID");
    if (first.status === "VALID" && second.status === "VALID") {
      expect(second.qualification.qualificationFingerprint).toBe(first.qualification.qualificationFingerprint);
      expect(second.qualification.qualificationId).toBe(first.qualification.qualificationId);
      expect(second.qualification.recordedAt).not.toBe(first.qualification.recordedAt);
    }
  });

  it.each([
    ["unknown field", fixture("DAILY_CLOSE_SERIES", { surprise: true })],
    ["symbol field", Object.assign(fixture(), { [Symbol("extra")]: true })],
    ["wrong symbol", fixture("DAILY_CLOSE_SERIES", { assetSymbol: "ETH" })],
    ["wrong chain", fixture("DAILY_CLOSE_SERIES", { chainId: "eip155:137" })],
    ["wrong contract", fixture("DAILY_CLOSE_SERIES", { contractAddress: "0x1111111111111111111111111111111111111111" })],
    ["wrong endpoint", fixture("DAILY_CLOSE_SERIES", { endpointHost: "api.coingecko.com" })],
    ["wrong query profile", fixture("DAILY_CLOSE_SERIES", { queryProfile: "COINGECKO_MARKET_CHART_EUR_HOURLY" })],
    ["metric-field mismatch", fixture("DAILY_CLOSE_SERIES", { providerField: "market_caps" })],
    ["duplicate semantics", fixture("DAILY_CLOSE_SERIES", { documentedProviderSemantics: [...closeProofs, closeProofs[0]] })],
    ["duplicate blocker", fixture("DAILY_CLOSE_SERIES", { blockers: ["M5_CLOSE_PRICE_SEMANTICS_NOT_DOCUMENTED", "M5_CLOSE_PRICE_SEMANTICS_NOT_DOCUMENTED"] })],
    ["duplicate evidence URL", fixture("DAILY_CLOSE_SERIES", { evidenceReferences: [{ url: officialUrl, title: "a", evidenceLevel: "DOCUMENTED", checkedAt: now, claims: closeProofs }, { url: officialUrl, title: "b", evidenceLevel: "DOCUMENTED", checkedAt: now, claims: closeProofs }] })],
    ["unofficial evidence URL", fixture("DAILY_CLOSE_SERIES", { evidenceReferences: [{ url: "https://example.com/x", title: "fake", evidenceLevel: "DOCUMENTED", checkedAt: now, claims: closeProofs }] })],
    ["noncanonical URL", fixture("DAILY_CLOSE_SERIES", { evidenceReferences: [{ url: `${officialUrl}?x=1`, title: "query", evidenceLevel: "DOCUMENTED", checkedAt: now, claims: closeProofs }] })],
    ["nonstandard URL port", fixture("DAILY_CLOSE_SERIES", { evidenceReferences: [{ url: officialUrl.replace("https://", "https://docs.coingecko.com:444/"), title: "port", evidenceLevel: "DOCUMENTED", checkedAt: now, claims: closeProofs }] })],
    ["bad timestamp", fixture("DAILY_CLOSE_SERIES", { expiresAt: "2027-02-30T00:00:00.000Z" })],
    ["expiration before effectiveness", fixture("DAILY_CLOSE_SERIES", { effectiveFrom: "2027-10-01T00:00:00.000Z" })],
    ["provider mismatch", fixture("DAILY_CLOSE_SERIES", { providerId: "other" })],
    ["dataset mismatch", fixture("DAILY_CLOSE_SERIES", { datasetId: "other" })],
    ["dataset version mismatch", fixture("DAILY_CLOSE_SERIES", { datasetVersion: "coingecko-market-chart/v2" })],
    ["unsupported documented claim", fixture("DAILY_CLOSE_SERIES", { documentedProviderSemantics: [...closeProofs, "MADE_UP"], evidenceReferences: [{ url: officialUrl, title: "Coin Historical Chart Data within Time Range by Token Address", evidenceLevel: "DOCUMENTED", checkedAt: now, claims: [...closeProofs, "MADE_UP"] }] })],
    ["missing blocker for a partial decision", fixture("DAILY_CLOSE_SERIES", { documentedProviderSemantics: ["M5_UTC_DAILY_BOUNDARY_DOCUMENTED"], evidenceReferences: [{ url: officialUrl, title: "Coin Historical Chart Data within Time Range by Token Address", evidenceLevel: "DOCUMENTED", checkedAt: now, claims: ["M5_UTC_DAILY_BOUNDARY_DOCUMENTED"] }], blockers: [] })],
    ["evidence checked after review", fixture("DAILY_CLOSE_SERIES", { evidenceReferences: [{ url: officialUrl, title: "future evidence", evidenceLevel: "DOCUMENTED", checkedAt: "2026-09-30T00:00:00.000Z", claims: closeProofs }] })],
  ] as const)("rejects strict-shape or scope violation: %s", (_name, value) => {
    expect(parseM5CoinGeckoMarketSourceQualification(value).status).toBe("INVALID");
  });

  it("rejects inherited objects and accessors without evaluating the accessor", () => {
    const inherited = Object.assign(Object.create({ inherited: true }), fixture());
    expect(parseM5CoinGeckoMarketSourceQualification(inherited).status).toBe("INVALID");
    let accessed = false;
    const accessor = fixture() as Record<string, unknown>;
    Object.defineProperty(accessor, "providerId", { get() { accessed = true; return "coingecko"; }, enumerable: true });
    expect(parseM5CoinGeckoMarketSourceQualification(accessor).status).toBe("INVALID");
    expect(accessed).toBe(false);
    const hostileProxy = new Proxy(fixture(), { ownKeys() { throw new Error("must be converted to INVALID"); } });
    expect(parseM5CoinGeckoMarketSourceQualification(hostileProxy).status).toBe("INVALID");
  });

  it("uses explicit BLOCKED/PARTIAL statuses and strict temporal bounds", () => {
    const blocked = parseM5CoinGeckoMarketSourceQualification(fixture("DAILY_CLOSE_SERIES", { documentedProviderSemantics: [], blockers: ["M5_CLOSE_PRICE_SEMANTICS_NOT_DOCUMENTED"] }));
    const partial = parseM5CoinGeckoMarketSourceQualification(fixture("DAILY_CLOSE_SERIES", { blockers: ["M5_CLOSE_PRICE_SEMANTICS_NOT_DOCUMENTED"] }));
    expect(blocked.status === "VALID" && blocked.qualification.status).toBe("BLOCKED");
    expect(partial.status === "VALID" && partial.qualification.status).toBe("PARTIAL");
    if (partial.status === "VALID") {
      expect(isM5CoinGeckoQualificationActive(partial.qualification, now)).toBe(true);
      expect(isM5CoinGeckoQualificationActive(partial.qualification, partial.qualification.expiresAt)).toBe(false);
      expect(isM5CoinGeckoQualificationActive(partial.qualification, "2026-09-29T16:43:04.999Z")).toBe(false);
    }
  });

  it("does not upgrade a daily timestamp sample into a close without a close definition", () => {
    const sampleClaims = ["AUTO_GRANULARITY_DAILY_ABOVE_90_DAYS_AT_00_00_UTC", "DATA_POINTS_ARE_TIMESTAMP_VALUE_PAIRS"];
    const decision = parseM5CoinGeckoMarketSourceQualification(fixture("DAILY_CLOSE_SERIES", {
      documentedProviderSemantics: sampleClaims,
      evidenceReferences: [{ url: officialUrl, title: "Coin Historical Chart Data within Time Range by Token Address", evidenceLevel: "DOCUMENTED", checkedAt: now, claims: sampleClaims }],
      blockers: ["M5_CLOSE_PRICE_SEMANTICS_NOT_DOCUMENTED"],
    }));
    expect(decision.status).toBe("VALID");
    if (decision.status === "VALID") expect(decision.qualification.status).toBe("PARTIAL");
  });

  it("keeps every configured production metric partial and readiness qualification separate", () => {
    for (const metric of Object.keys(metrics) as M5CoinGeckoMarketMetric[]) {
      const resolution = resolveConfiguredM5CoinGeckoMarketSourceQualification(metric);
      expect(resolution.status).toBe("RESOLVED");
      expect(resolution.qualification?.status).toBe("PARTIAL");
      expect(resolution.qualification?.blockers.length).toBeGreaterThan(0);
    }
  });
});
