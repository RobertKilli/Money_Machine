import { describe, expect, it } from "vitest";
import {
  M5_PROVIDER_READINESS_CONFIG_VERSION,
  evaluateM5ProviderReadiness,
  parseM5ProviderReadinessConfig,
  type M5ProviderUsage,
} from "@/domain/intelligence/m5-provider-readiness";
import { evaluateM5ProviderReadinessConfig, M5_DEFAULT_REQUIRED_CAPABILITIES, M5_DEFAULT_REQUESTED_USAGES } from "@/application/intelligence/evaluate-m5-provider-readiness";

const reviewedAt = "2026-09-25T12:00:00.000Z";
const expiry = "2027-09-25T12:00:00.000Z";
const docs = ["https://docs.example.test/provider", "https://docs.example.test/dataset"];
const terms = ["https://provider.example.test/terms"];
const allCapabilities = M5_DEFAULT_REQUIRED_CAPABILITIES.map(({ capability }) => ({ capability, status: "SUPPORTED", completeness: "COMPLETE", reviewedAt, reviewReference: "review/m5-provider-readiness/v1", documentationUrls: docs, termsUrls: terms, limitations: [], ...(capability === "VENUE_COMPLETE_UNIVERSE" ? { zeroVenuePolicy: "ALLOWED_EMPTY" } : {}) }));
const allUsages = M5_DEFAULT_REQUESTED_USAGES.map(usage => ({ usage, approval: "APPROVED", reviewedAt, reviewReference: "review/m5-provider-readiness/v1", limitations: [] }));

function config(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    configVersion: M5_PROVIDER_READINESS_CONFIG_VERSION,
    providerNamespace: "synthetic:provider",
    providerId: "synthetic-provider",
    datasetId: "synthetic-dataset",
    datasetVersion: "synthetic-dataset/v1",
    reviewedAt,
    reviewReference: "review/m5-provider-readiness/v1",
    documentationUrls: docs,
    termsUrls: terms,
    capabilities: allCapabilities,
    usageDecisions: allUsages,
    limitations: [],
    approvalExpiresAt: expiry,
    metadata: { sourceKind: "SYNTHETIC_FIXTURE", policyVersion: "m5-provider-readiness-policy/v1" },
    ...overrides,
  };
}

describe("M5 provider readiness gate", () => {
  it("parses strict configs, normalizes permutations, and deep-freezes the result", () => {
    const raw = config({ capabilities: [...allCapabilities].reverse(), usageDecisions: [...allUsages].reverse(), documentationUrls: [...docs].reverse() });
    const parsed = parseM5ProviderReadinessConfig(raw);
    expect(parsed.capabilities.map(item => item.capability)).toEqual([...parsed.capabilities].map(item => item.capability).sort());
    expect(parsed.documentationUrls).toEqual([...docs].sort());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.capabilities)).toBe(true);
    expect(Object.isFrozen(parsed.capabilities[0])).toBe(true);
  });

  it("rejects unknown, secret-like, and unsafe URL fields", () => {
    expect(() => parseM5ProviderReadinessConfig(config({ unexpected: true }))).toThrow("M5_PROVIDER_READINESS_CONFIG_UNKNOWN_FIELD");
    expect(() => parseM5ProviderReadinessConfig(config({ apiKey: "secret" }))).toThrow("M5_PROVIDER_READINESS_SECRET_FIELD_REJECTED");
    expect(() => parseM5ProviderReadinessConfig(config({ documentationUrls: ["https://docs.example.test/path?token=secret"] }))).toThrow("M5_PROVIDER_READINESS_URL_UNSAFE");
    expect(() => parseM5ProviderReadinessConfig(config({ termsUrls: ["http://provider.example.test/terms"] }))).toThrow("M5_PROVIDER_READINESS_URL_UNSAFE");
  });

  it("rejects duplicate decisions, invalid timestamps, and expired approval metadata", () => {
    expect(() => parseM5ProviderReadinessConfig(config({ capabilities: [...allCapabilities, allCapabilities[0]] }))).toThrow("M5_PROVIDER_READINESS_DUPLICATE_CAPABILITY");
    expect(() => parseM5ProviderReadinessConfig(config({ usageDecisions: [...allUsages, allUsages[0]] }))).toThrow("M5_PROVIDER_READINESS_DUPLICATE_USAGE");
    expect(() => parseM5ProviderReadinessConfig(config({ reviewedAt: "2026-09-25T12:00:00Z" }))).toThrow("M5_PROVIDER_READINESS_REVIEWED_AT_INVALID");
    expect(() => parseM5ProviderReadinessConfig(config({ approvalExpiresAt: reviewedAt }))).toThrow("M5_PROVIDER_READINESS_APPROVAL_EXPIRY_INVALID");
    expect(() => parseM5ProviderReadinessConfig(config({ approvalExpiresAt: undefined }))).toThrow("M5_PROVIDER_READINESS_APPROVAL_EXPIRY_REQUIRED");
    expect(() => parseM5ProviderReadinessConfig(config({ capabilities: allCapabilities.map(item => item.capability === "DAILY_CLOSE_SERIES" ? { ...item, limitations: ["top-N only"] } : item) }))).toThrow("M5_PROVIDER_READINESS_COMPLETENESS_CONFLICT");
  });

  it("returns READY for a complete, explicitly approved synthetic configuration without side effects", () => {
    const result = evaluateM5ProviderReadinessConfig({ config: config(), evaluatedAt: "2026-09-25T13:00:00.000Z" });
    expect(result.result).toBe("READY");
    expect(result.blockers).toEqual([]);
  });

  it("represents the current fixture-provider posture as BLOCKED", () => {
    const current = config({ providerNamespace: "coingecko:eth", providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/v1", capabilities: allCapabilities.map(item => item.capability === "LIQUIDITY_COMPLETE_SET" ? { ...item, completeness: "TOP_N_ONLY" } : item.capability === "HOLDER_COMPLETE_UNIVERSE" || item.capability === "HOLDER_FINALITY" ? { ...item, status: "UNKNOWN", completeness: "UNKNOWN" } : item.capability === "VENUE_COMPLETE_UNIVERSE" ? { ...item, status: "UNKNOWN", completeness: "UNKNOWN", zeroVenuePolicy: "UNKNOWN" } : item.capability === "SUSPICIOUS_RULE_COVERAGE" ? { ...item, status: "UNKNOWN", completeness: "UNKNOWN" } : item), usageDecisions: allUsages.map(item => item.usage === "NORMALIZED_STORAGE" || item.usage === "AUTHORITY_PERSISTENCE" ? item : { ...item, approval: "REQUIRES_APPROVAL" }) });
    const result = evaluateM5ProviderReadinessConfig({ config: current, evaluatedAt: "2026-09-25T13:00:00.000Z" });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers.map(item => item.code)).toContain("M5_READINESS_CAPABILITY_INCOMPLETE");
    expect(result.blockers.map(item => item.code)).toContain("M5_READINESS_HOLDER_FINALITY_UNPROVEN");
    expect(result.blockers.map(item => item.code)).toContain("M5_READINESS_SUSPICIOUS_COVERAGE_INCOMPLETE");
  });

  it.each([
    ["missing capability", () => config({ capabilities: allCapabilities.filter(item => item.capability !== "MARKET_CAP") }), "M5_READINESS_CAPABILITY_MISSING"],
    ["partial capability", () => config({ capabilities: allCapabilities.map(item => item.capability === "DAILY_CLOSE_SERIES" ? { ...item, completeness: "PARTIAL" } : item) }), "M5_READINESS_CAPABILITY_INCOMPLETE"],
    ["sample capability", () => config({ capabilities: allCapabilities.map(item => item.capability === "HOLDER_COMPLETE_UNIVERSE" ? { ...item, completeness: "SAMPLE" } : item) }), "M5_READINESS_CAPABILITY_INCOMPLETE"],
    ["unknown capability status", () => config({ capabilities: allCapabilities.map(item => item.capability === "CONTRACT_VERIFICATION" ? { ...item, status: "UNKNOWN" } : item) }), "M5_READINESS_CAPABILITY_NOT_SUPPORTED"],
  ])("blocks %s", (_name, makeConfig, expected) => {
    const result = evaluateM5ProviderReadinessConfig({ config: makeConfig(), evaluatedAt: "2026-09-25T13:00:00.000Z" });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers.map(item => item.code)).toContain(expected);
  });

  it.each([
    ["requires approval", "REQUIRES_APPROVAL", "M5_READINESS_USAGE_REQUIRES_APPROVAL"],
    ["rejected", "REJECTED", "M5_READINESS_USAGE_REJECTED"],
    ["expired", "EXPIRED", "M5_READINESS_USAGE_EXPIRED"],
  ] as const)("blocks usage when it is %s", (_name, approval, expected) => {
    const raw = config({ usageDecisions: allUsages.map(item => item.usage === "NETWORK_ACQUISITION" ? { ...item, approval } : item) });
    const result = evaluateM5ProviderReadinessConfig({ config: raw, evaluatedAt: "2026-09-25T13:00:00.000Z" });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers.map(item => item.code)).toContain(expected);
  });

  it("keeps normalized storage approval separate from raw storage, commercial use, and redistribution", () => {
    const raw = config({ usageDecisions: allUsages.map(item => item.usage === "RAW_PAYLOAD_STORAGE" || item.usage === "COMMERCIAL_USE" || item.usage === "REDISTRIBUTION" ? { ...item, approval: "REQUIRES_APPROVAL" } : item) });
    const result = evaluateM5ProviderReadinessConfig({ config: raw, evaluatedAt: "2026-09-25T13:00:00.000Z", requestedUsages: ["NORMALIZED_STORAGE"] });
    expect(result.result).toBe("READY");
    const blocked = evaluateM5ProviderReadinessConfig({ config: raw, evaluatedAt: "2026-09-25T13:00:00.000Z", requestedUsages: ["NORMALIZED_STORAGE", "RAW_PAYLOAD_STORAGE", "COMMERCIAL_USE", "REDISTRIBUTION"] });
    expect(blocked.result).toBe("BLOCKED");
    expect(blocked.blockers.map(item => item.code)).toEqual(expect.arrayContaining(["M5_READINESS_RAW_STORAGE_NOT_APPROVED", "M5_READINESS_COMMERCIAL_USE_NOT_APPROVED", "M5_READINESS_REDISTRIBUTION_NOT_APPROVED"]));
  });

  it("does not treat documentation as approval and orders blockers deterministically", () => {
    const raw = config({ usageDecisions: allUsages.map(item => item.usage === "COMMERCIAL_USE" ? { ...item, approval: "REQUIRES_APPROVAL" } : item), capabilities: allCapabilities.filter(item => item.capability !== "MARKET_CAP") });
    const first = evaluateM5ProviderReadinessConfig({ config: raw, evaluatedAt: "2026-09-25T13:00:00.000Z" });
    const second = evaluateM5ProviderReadinessConfig({ config: raw, evaluatedAt: "2026-09-25T13:00:00.000Z" });
    expect(first).toEqual(second);
    expect(first.result).toBe("BLOCKED");
    expect(first.blockers[0]!.code).toBe("M5_READINESS_CAPABILITY_MISSING");
  });

  it("returns INVALID for malformed config and invalid programmatic requirements", () => {
    expect(evaluateM5ProviderReadinessConfig({ config: { nope: true }, evaluatedAt: reviewedAt }).result).toBe("INVALID");
    const parsed = parseM5ProviderReadinessConfig(config());
    const result = evaluateM5ProviderReadiness({ config: parsed, evaluatedAt: reviewedAt, requiredCapabilities: [{ capability: "MARKET_CAP", completeness: "ANY" }, { capability: "MARKET_CAP", completeness: "ANY" }], requestedUsages: [] });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers[0]!.code).toBe("M5_READINESS_INVALID_REQUIREMENTS");
  });

  it("blocks scope mismatches and undecided zero-venue semantics", () => {
    const parsed = parseM5ProviderReadinessConfig(config({
      capabilities: allCapabilities.map(item => item.capability === "VENUE_COMPLETE_UNIVERSE" ? { ...item, zeroVenuePolicy: "UNKNOWN" } : item),
    }));
    const result = evaluateM5ProviderReadiness({
      config: parsed,
      evaluatedAt: reviewedAt,
      requiredCapabilities: [{ capability: "VENUE_COMPLETE_UNIVERSE", completeness: "COMPLETE" }],
      requestedUsages: [],
      expectedScope: { providerId: "other-provider", datasetId: parsed.datasetId, datasetVersion: parsed.datasetVersion },
    });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers.map(blocker => blocker.code)).toEqual(expect.arrayContaining([
      "M5_READINESS_SCOPE_MISMATCH",
      "M5_READINESS_ZERO_VENUE_UNDECIDED",
    ]));
  });

  it("accepts a documentation-only review without inferring approval", () => {
    const result = evaluateM5ProviderReadinessConfig({ config: config({ usageDecisions: allUsages.map(item => ({ ...item, approval: "REQUIRES_APPROVAL" })) }), evaluatedAt: reviewedAt, requiredCapabilities: [], requestedUsages: ["NETWORK_ACQUISITION"] });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers).toEqual([{ code: "M5_READINESS_USAGE_REQUIRES_APPROVAL", usage: "NETWORK_ACQUISITION" }]);
  });

  it("keeps the usage union exhaustive at the test boundary", () => {
    const usages: readonly M5ProviderUsage[] = M5_DEFAULT_REQUESTED_USAGES;
    expect(usages).toHaveLength(7);
  });
});
