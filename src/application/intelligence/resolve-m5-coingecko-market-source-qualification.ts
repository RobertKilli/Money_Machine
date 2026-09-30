import "server-only";
import sourceConfig from "../../../config/m5/coingecko-market-source-qualification.production.json";
import {
  M5_COINGECKO_METRICS,
  M5_COINGECKO_REQUIRED_SEMANTICS,
  parseM5CoinGeckoMarketSourceQualification,
  type M5CoinGeckoMarketMetric,
  type M5CoinGeckoMarketSourceQualification,
} from "@/domain/intelligence/m5-coingecko-market-source-qualification";

type QualificationConfig = Readonly<{
  contractVersion: string;
  reviewedAt: string;
  effectiveFrom: string;
  expiresAt: string;
  recordedAt: string;
  scope: Readonly<Record<string, unknown>>;
  qualifications: readonly Readonly<Record<string, unknown>>[];
}>;

const trusted = new WeakSet<object>();
const config = sourceConfig as QualificationConfig;
const configured = new Map<M5CoinGeckoMarketMetric, M5CoinGeckoMarketSourceQualification>();
for (const item of config.qualifications) {
  const metric = item.metric as M5CoinGeckoMarketMetric;
  if (!M5_COINGECKO_METRICS.includes(metric)) throw new Error("M5_CG_QUALIFICATION_CONFIG_INVALID");
  const parsed = parseM5CoinGeckoMarketSourceQualification({
    ...config.scope,
    ...item,
    contractVersion: config.contractVersion,
    requiredM5Semantics: M5_COINGECKO_REQUIRED_SEMANTICS[metric],
    reviewedAt: config.reviewedAt,
    effectiveFrom: config.effectiveFrom,
    expiresAt: config.expiresAt,
    recordedAt: config.recordedAt,
  });
  if (parsed.status !== "VALID" || configured.has(metric)) throw new Error("M5_CG_QUALIFICATION_CONFIG_INVALID");
  configured.set(metric, parsed.qualification);
  trusted.add(parsed.qualification);
}
if (M5_COINGECKO_METRICS.some(metric => !configured.has(metric))) throw new Error("M5_CG_QUALIFICATION_CONFIG_INCOMPLETE");

export type M5ConfiguredCoinGeckoQualificationResolution = Readonly<{
  status: "RESOLVED" | "NOT_CONFIGURED";
  qualification?: M5CoinGeckoMarketSourceQualification;
}>;

export function resolveConfiguredM5CoinGeckoMarketSourceQualification(metric: M5CoinGeckoMarketMetric): M5ConfiguredCoinGeckoQualificationResolution {
  const qualification = configured.get(metric);
  return Object.freeze(qualification ? { status: "RESOLVED" as const, qualification } : { status: "NOT_CONFIGURED" as const });
}

export function isTrustedConfiguredM5CoinGeckoQualification(value: unknown): value is M5CoinGeckoMarketSourceQualification {
  return typeof value === "object" && value !== null && trusted.has(value);
}
