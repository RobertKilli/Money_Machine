import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  evaluateM5ProviderReadinessConfig,
  M5_DEFAULT_REQUESTED_USAGES,
  M5_DEFAULT_REQUIRED_CAPABILITIES,
} from "@/application/intelligence/evaluate-m5-provider-readiness";
import { parseM5ProviderReadinessConfig } from "@/domain/intelligence/m5-provider-readiness";

const productionConfig = (): Record<string, unknown> => JSON.parse(
  readFileSync(new URL("../../config/m5/provider-readiness.production.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

const evaluate = (config: unknown = productionConfig(), expectedScope?: { providerId: string; datasetId: string; datasetVersion: string }) =>
  evaluateM5ProviderReadinessConfig({
    config,
    evaluatedAt: "2026-09-25T12:00:00.000Z",
    requiredCapabilities: M5_DEFAULT_REQUIRED_CAPABILITIES,
    requestedUsages: M5_DEFAULT_REQUESTED_USAGES,
    ...(expectedScope === undefined ? {} : { expectedScope }),
  });

describe("M5 production provider source decision", () => {
  it("strictly parses the versioned production config with deterministic order and deep immutability", () => {
    const parsed = parseM5ProviderReadinessConfig(productionConfig());
    expect(parsed.configVersion).toBe("m5-provider-readiness-config/v1");
    expect(parsed.capabilities.map(({ capability }) => capability)).toEqual([...parsed.capabilities.map(({ capability }) => capability)].sort());
    expect(parsed.usageDecisions.map(({ usage }) => usage)).toEqual([...parsed.usageDecisions.map(({ usage }) => usage)].sort());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.capabilities)).toBe(true);
    expect(Object.isFrozen(parsed.capabilities[0])).toBe(true);
    expect(parsed.usageDecisions.every(({ approval }) => approval === "REQUIRES_APPROVAL")).toBe(true);
    expect(JSON.stringify(productionConfig())).not.toMatch(/api[_-]?key|access[_-]?token|termsText|"approval"\s*:\s*"APPROVED"/i);
  });

  it("rejects unknown and secret-like fields", () => {
    const unknown = productionConfig();
    unknown.unreviewedField = true;
    expect(() => parseM5ProviderReadinessConfig(unknown)).toThrow("M5_PROVIDER_READINESS_CONFIG_UNKNOWN_FIELD");

    const secretLike = productionConfig();
    secretLike.apiKey = "must-not-be-present";
    expect(() => parseM5ProviderReadinessConfig(secretLike)).toThrow("M5_PROVIDER_READINESS_SECRET_FIELD_REJECTED");

    const termsText = productionConfig();
    termsText.termsText = "terms text should never be copied here";
    expect(() => parseM5ProviderReadinessConfig(termsText)).toThrow("M5_PROVIDER_READINESS_SECRET_FIELD_REJECTED");
  });

  it("evaluates the current production posture as BLOCKED for all complete M5 requirements", () => {
    const result = evaluate();
    expect(result.result).toBe("BLOCKED");
    expect(result.requiredCapabilities).toHaveLength(11);
    expect(result.requestedUsages).toHaveLength(7);
    expect(result.blockers.some(({ code }) => code === "M5_READINESS_CAPABILITY_INCOMPLETE")).toBe(true);
    expect(result.blockers.some(({ code }) => code === "M5_READINESS_HOLDER_FINALITY_UNPROVEN")).toBe(true);
    expect(result.blockers.some(({ code }) => code === "M5_READINESS_SUSPICIOUS_COVERAGE_INCOMPLETE")).toBe(true);
    expect(result.blockers.some(({ code }) => code === "M5_READINESS_RAW_STORAGE_NOT_APPROVED")).toBe(true);
    expect(result.blockers.some(({ code }) => code === "M5_READINESS_REDISTRIBUTION_NOT_APPROVED")).toBe(true);
    expect(result.blockers.some(({ code }) => code === "M5_READINESS_COMMERCIAL_USE_NOT_APPROVED")).toBe(true);
  });

  it("binds the decision to provider, dataset, and exact version", () => {
    const result = evaluate(productionConfig(), {
      providerId: "m5-production-stack",
      datasetId: "m5-production-inputs",
      datasetVersion: "m5-provider-source-decision/other",
    });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers.map(({ code }) => code)).toContain("M5_READINESS_SCOPE_MISMATCH");
  });

  it("treats TOP_N_ONLY and UNKNOWN capabilities as blockers", () => {
    const config = productionConfig();
    const capabilities = config.capabilities as Array<Record<string, unknown>>;
    expect(capabilities.find(({ capability }) => capability === "LIQUIDITY_COMPLETE_SET")).toMatchObject({ status: "PARTIAL", completeness: "TOP_N_ONLY" });
    expect(capabilities.find(({ capability }) => capability === "HOLDER_FINALITY")).toMatchObject({ status: "UNKNOWN", completeness: "UNKNOWN" });
    const result = evaluate(config);
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers.some(({ capability, code }) => capability === "LIQUIDITY_COMPLETE_SET" && code === "M5_READINESS_CAPABILITY_NOT_SUPPORTED")).toBe(true);
  });

  it("blocks missing capabilities and PARTIAL completeness", () => {
    const missingConfig = productionConfig();
    missingConfig.capabilities = (missingConfig.capabilities as Array<Record<string, unknown>>)
      .filter(({ capability }) => capability !== "MARKET_CAP");
    const missingResult = evaluate(missingConfig);
    expect(missingResult.result).toBe("BLOCKED");
    expect(missingResult.blockers.some(({ capability, code }) => capability === "MARKET_CAP" && code === "M5_READINESS_CAPABILITY_MISSING")).toBe(true);

    const partialConfig = productionConfig();
    const capability = (partialConfig.capabilities as Array<Record<string, unknown>>)
      .find(({ capability }) => capability === "DAILY_CLOSE_SERIES");
    if (capability) {
      capability.status = "SUPPORTED";
      capability.completeness = "PARTIAL";
    }
    const partialResult = evaluate(partialConfig);
    expect(partialResult.result).toBe("BLOCKED");
    expect(partialResult.blockers.some(({ capability: blocked, code }) => blocked === "DAILY_CLOSE_SERIES" && code === "M5_READINESS_CAPABILITY_INCOMPLETE")).toBe(true);
  });

  it("blocks expired approval metadata", () => {
    const config = productionConfig();
    config.reviewedAt = "2026-09-01T00:00:00.000Z";
    config.approvalExpiresAt = "2026-09-02T00:00:00.000Z";
    const usageDecisions = config.usageDecisions as Array<Record<string, unknown>>;
    for (const decision of usageDecisions) decision.reviewedAt = "2026-09-01T00:00:00.000Z";
    const acquisition = usageDecisions.find(({ usage }) => usage === "NETWORK_ACQUISITION");
    if (acquisition) acquisition.approval = "APPROVED";
    const result = evaluate(config);
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers.some(({ code, usage }) => code === "M5_READINESS_USAGE_EXPIRED" && usage === "NETWORK_ACQUISITION")).toBe(true);
  });

  it("performs no network, database, or credential side effects while evaluating the config", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      expect(evaluate().result).toBe("BLOCKED");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("returns deterministic, deeply frozen readiness evaluations", () => {
    const first = evaluate();
    const second = evaluate();
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.requiredCapabilities)).toBe(true);
    expect(Object.isFrozen(first.blockers)).toBe(true);
  });
});
