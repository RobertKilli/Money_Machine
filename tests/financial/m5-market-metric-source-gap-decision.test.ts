import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  evaluateM5MarketMetricSourceGapDecision,
  parseM5MarketMetricSourceGapDecisionConfig,
} from "@/domain/intelligence/m5-market-metric-source-gap-decision";
import { M5_COINGECKO_REQUIRED_SEMANTICS, parseM5CoinGeckoMarketSourceQualification, type M5CoinGeckoMarketMetric } from "@/domain/intelligence/m5-coingecko-market-source-qualification";

const production = (): Record<string, unknown> => JSON.parse(
  readFileSync(new URL("../../config/m5/market-metric-source-gap-decision.production.json", import.meta.url), "utf8"),
) as Record<string, unknown>;
const parsed = () => {
  const result = parseM5MarketMetricSourceGapDecisionConfig(production());
  if (result.status !== "VALID") throw new Error(result.blocker);
  return result.config;
};

describe("M5 market metric source gap decision", () => {
  it("strictly parses the versioned three-metric production decision and deep-freezes it", () => {
    const config = parsed();
    expect(config.contractVersion).toBe("m5-market-metric-source-gap-decision/v1");
    expect(config.decisions.map(item => item.metric)).toEqual(["DAILY_CLOSE_SERIES", "MARKET_CAP", "VOLUME_24H"]);
    expect(config.decisions.map(item => item.decision)).toEqual(["BLOCKED", "BLOCKED", "BLOCKED"]);
    expect(config.decisions.every(item => item.usageApproval !== "APPROVED" && item.storageApproval !== "APPROVED")).toBe(true);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.decisions[0]?.evidenceReferences[0]?.claims)).toBe(true);
    expect(JSON.stringify(production())).not.toMatch(/api[_-]?key|access[_-]?token|credential|account[_-]?id/i);
  });

  it("excludes recording timestamps from deterministic decision and config identity", () => {
    const original = production();
    const altered = structuredClone(original);
    altered.recordedAt = "2026-09-30T02:00:00.000Z";
    for (const decision of altered.decisions as Array<Record<string, unknown>>) decision.recordedAt = "2026-09-30T02:00:00.000Z";
    const a = parseM5MarketMetricSourceGapDecisionConfig(original);
    const b = parseM5MarketMetricSourceGapDecisionConfig(altered);
    expect(a.status).toBe("VALID");
    expect(b.status).toBe("VALID");
    if (a.status === "VALID" && b.status === "VALID") {
      expect(a.config.configFingerprint).toBe(b.config.configFingerprint);
      expect(a.config.decisions.map(item => item.fingerprint)).toEqual(b.config.decisions.map(item => item.fingerprint));
      expect(a.config.decisions.map(item => item.decisionId)).toEqual(b.config.decisions.map(item => item.decisionId));
    }
  });

  it("rejects duplicate metrics, unknown fields, unsafe shapes and unsafe URLs", () => {
    const duplicate = production();
    duplicate.decisions = [...duplicate.decisions as unknown[], (duplicate.decisions as unknown[])[0]];
    expect(parseM5MarketMetricSourceGapDecisionConfig(duplicate).status).toBe("INVALID");

    const unknown = production();
    (unknown.decisions as Array<Record<string, unknown>>)[0]!.unreviewed = true;
    expect(parseM5MarketMetricSourceGapDecisionConfig(unknown).status).toBe("INVALID");

    const unsafe = production();
    const firstEvidence = ((unsafe.decisions as Array<Record<string, unknown>>)[0]!.evidenceReferences as Array<Record<string, unknown>>)[0]!;
    firstEvidence.url = "https://docs.coingecko.com/reference/x?api_key=secret";
    expect(parseM5MarketMetricSourceGapDecisionConfig(unsafe).status).toBe("INVALID");

    const accessor = production();
    Object.defineProperty(accessor, "reviewedAt", { enumerable: true, get: () => "2026-09-30T01:47:43.000Z" });
    expect(parseM5MarketMetricSourceGapDecisionConfig(accessor).status).toBe("INVALID");
    const inherited = Object.assign(Object.create({ inherited: true }), production());
    expect(parseM5MarketMetricSourceGapDecisionConfig(inherited).status).toBe("INVALID");
    const symbol = production();
    Object.defineProperty(symbol, Symbol("unsafe"), { value: true });
    expect(parseM5MarketMetricSourceGapDecisionConfig(symbol).status).toBe("INVALID");
  });

  it("rejects mismatched evidence/source and noncanonical review times", () => {
    const mismatched = production();
    const row = (mismatched.decisions as Array<Record<string, unknown>>)[0]!;
    row.sourceCandidateId = "not valid";
    expect(parseM5MarketMetricSourceGapDecisionConfig(mismatched).status).toBe("INVALID");

    const wrongMethod = production();
    (wrongMethod.decisions as Array<Record<string, unknown>>)[0]!.methodologyId = "WETH_TOTAL_SUPPLY_X_APPROVED_PRICE_V1";
    expect(parseM5MarketMetricSourceGapDecisionConfig(wrongMethod).status).toBe("INVALID");

    const badTime = production();
    (badTime.decisions as Array<Record<string, unknown>>)[0]!.expiresAt = "2027-09-30T01:47:43Z";
    expect(parseM5MarketMetricSourceGapDecisionConfig(badTime).status).toBe("INVALID");

    const badEvidence = production();
    const refs = (badEvidence.decisions as Array<Record<string, unknown>>)[0]!.evidenceReferences as Array<Record<string, unknown>>;
    refs[0]!.claims = [];
    expect(parseM5MarketMetricSourceGapDecisionConfig(badEvidence).status).toBe("INVALID");
  });

  it("keeps usage, storage and pricing approvals independent and unknown proof blocked", () => {
    const unsafe = production();
    const row = (unsafe.decisions as Array<Record<string, unknown>>)[0]!;
    row.storageApproval = "APPROVED";
    row.usageApproval = "UNKNOWN";
    expect(parseM5MarketMetricSourceGapDecisionConfig(unsafe).status).toBe("VALID");
    const evaluation = evaluateM5MarketMetricSourceGapDecision(parsed(), "DAILY_CLOSE_SERIES", "2026-09-30T12:00:00.000Z");
    expect(evaluation.status).toBe("BLOCKED");
    expect(evaluation.blockers).toContain("M5_MARKET_SOURCE_DECISION_NOT_AUTHORIZED");

    const falselySelected = production();
    const selected = (falselySelected.decisions as Array<Record<string, unknown>>)[0]!;
    selected.decision = "EXTERNAL_PROVIDER";
    selected.completeness = "PROVEN";
    selected.usageApproval = "APPROVED";
    selected.storageApproval = "APPROVED";
    selected.blockers = [];
    const purported = parseM5MarketMetricSourceGapDecisionConfig(falselySelected);
    expect(purported.status).toBe("VALID");
    if (purported.status === "VALID") expect(evaluateM5MarketMetricSourceGapDecision(purported.config, "DAILY_CLOSE_SERIES", "2026-09-30T12:00:00.000Z").status).toBe("BLOCKED");
  });

  it("fails closed at expiry and preserves the existing CoinGecko PARTIAL qualification", () => {
    const config = parsed();
    const expired = evaluateM5MarketMetricSourceGapDecision(config, "VOLUME_24H", "2027-09-30T01:47:43.000Z");
    expect(expired.status).toBe("BLOCKED");
    expect(expired.blockers).toContain("M5_MARKET_SOURCE_DECISION_REVIEW_INACTIVE");

    const coinGeckoConfig = JSON.parse(
      readFileSync(new URL("../../config/m5/coingecko-market-source-qualification.production.json", import.meta.url), "utf8"),
    ) as { scope: Record<string, unknown>; qualifications: Array<Record<string, unknown>>; reviewedAt: string; effectiveFrom: string; expiresAt: string; recordedAt: string; contractVersion: string };
    const coinGecko = coinGeckoConfig.qualifications.map(item => parseM5CoinGeckoMarketSourceQualification({
      ...coinGeckoConfig.scope, ...item, contractVersion: coinGeckoConfig.contractVersion,
      requiredM5Semantics: M5_COINGECKO_REQUIRED_SEMANTICS[item.metric as M5CoinGeckoMarketMetric], reviewedAt: coinGeckoConfig.reviewedAt,
      effectiveFrom: coinGeckoConfig.effectiveFrom, expiresAt: coinGeckoConfig.expiresAt,
      recordedAt: coinGeckoConfig.recordedAt,
    }));
    expect(coinGecko.every(item => item.status === "VALID")).toBe(true);
    expect(coinGecko.every(item => item.status === "VALID" && item.qualification.status === "PARTIAL")).toBe(true);
  });
});
