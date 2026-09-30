import "server-only";
import { isTrustedM5ProviderLiveAcquisitionForIngestion } from "./m5-provider-live-acquisition";
import { isTrustedConfiguredM5CoinGeckoQualification } from "./resolve-m5-coingecko-market-source-qualification";
import {
  isM5CoinGeckoQualificationActive,
  M5_COINGECKO_METRICS,
  parseM5CoinGeckoMarketSourceQualification,
  type M5CoinGeckoMarketMetric,
  type M5CoinGeckoMarketSourceQualification,
} from "@/domain/intelligence/m5-coingecko-market-source-qualification";

export type M5CoinGeckoMetricProjection = Readonly<{
  status: "PROJECTED";
  metric: M5CoinGeckoMarketMetric;
  qualificationId: string;
  qualificationFingerprint: string;
  providerId: "coingecko";
  datasetId: "coingecko-market-chart";
  datasetVersion: "coingecko-market-chart/range-v1";
  chainId: "eip155:1";
  assetSymbol: "WETH";
  contractAddress: string;
  asOf: string;
  payloadFingerprint: string;
  points: readonly Readonly<{ observedAt: string; availableAt: string; valueAtoms: string; scale: number; unit: "USD" | "MINOR"; sourceValueAtoms: string; sourceScale: number; quoteCurrency: "USD"; providerExternalRecordId: string; payloadFingerprint: string; providerRevision: string; basis?: "MARKET_CAP_REPORTED" | "ROLLING_24H_REPORTED"; windowStart?: string; windowEnd?: string }>[];
}>;
export type M5CoinGeckoProjectionGuardResult = M5CoinGeckoMetricProjection | Readonly<{ status: "BLOCKED" | "INVALID"; blocker: string; blockers: readonly string[] }>;

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const failed = (status: "BLOCKED" | "INVALID", blocker: string, blockers: readonly string[] = [blocker]): M5CoinGeckoProjectionGuardResult => freeze({ status, blocker, blockers: [...blockers] });
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  try {
    if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const ownKeys = Reflect.ownKeys(value);
    return ownKeys.length === keys.length && ownKeys.every(key => typeof key === "string" && keys.includes(key) && "value" in (Object.getOwnPropertyDescriptor(value, key) ?? {}));
  } catch { return false; }
};
const canonicalTime = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

function revalidateQualification(value: M5CoinGeckoMarketSourceQualification): boolean {
  const { qualificationId, qualificationFingerprint, status, ...input } = value;
  const rebuilt = parseM5CoinGeckoMarketSourceQualification(input);
  return rebuilt.status === "VALID" && rebuilt.qualification.qualificationId === qualificationId && rebuilt.qualification.qualificationFingerprint === qualificationFingerprint && rebuilt.qualification.status === status;
}

/**
 * Pure server-side projection guard. It has no provider, database, or UoW port;
 * a metric is emitted only from authentic acquisition material and an active,
 * configured QUALIFIED contract.
 */
export function qualifyM5CoinGeckoMarketProjection(input: unknown): M5CoinGeckoProjectionGuardResult {
  if (!exact(input, ["acquisition", "qualification", "metric", "asOf"])) return failed("INVALID", "M5_CG_PROJECTION_REQUEST_INVALID");
  const acquisition = input.acquisition;
  const qualification = input.qualification;
  const metric = input.metric;
  const asOf = input.asOf;
  if (!isTrustedM5ProviderLiveAcquisitionForIngestion(acquisition)) return failed("BLOCKED", "M5_CG_PROJECTION_UNTRUSTED_ACQUISITION");
  if (!isTrustedConfiguredM5CoinGeckoQualification(qualification)) return failed("BLOCKED", "M5_CG_PROJECTION_UNTRUSTED_QUALIFICATION");
  if (!M5_COINGECKO_METRICS.includes(metric as M5CoinGeckoMarketMetric)) return failed("INVALID", "M5_CG_PROJECTION_METRIC_INVALID");
  const requestedMetric = metric as M5CoinGeckoMarketMetric;
  if (!revalidateQualification(qualification)) return failed("INVALID", "M5_CG_QUALIFICATION_FINGERPRINT_INVALID");
  if (requestedMetric !== qualification.metric || !canonicalTime(asOf) || asOf !== acquisition.asOf || !isM5CoinGeckoQualificationActive(qualification, asOf)) return failed("BLOCKED", "M5_CG_PROJECTION_SCOPE_OR_TIME_MISMATCH");
  const binding = acquisition.ingestionHandoffBinding;
  if (!binding || acquisition.scope.providerId !== qualification.providerId || acquisition.scope.datasetId !== qualification.datasetId || acquisition.scope.datasetVersion !== qualification.datasetVersion || binding.endpointProfile !== qualification.endpointProfile || qualification.queryProfile !== "COINGECKO_MARKET_CHART_USD_DAILY" || binding.endpointHostname !== qualification.endpointHost || binding.endpointPath !== `/api/v3/coins/ethereum/contract/${qualification.contractAddress}/market_chart/range` || binding.chain !== "ethereum" || binding.contractAddress !== qualification.contractAddress || acquisition.normalizedPackage.requestScope.network !== "eth" || acquisition.normalizedPackage.requestScope.coinId !== "ethereum" || acquisition.normalizedPackage.requestScope.contractAddress !== qualification.contractAddress || acquisition.normalizedPackage.executionInput.endpointPath !== `https://${qualification.endpointHost}/api/v3/coins/ethereum/contract/{address}/market_chart/range` || acquisition.normalizedPackage.executionInput.interval !== "daily") return failed("BLOCKED", "M5_CG_PROJECTION_SCOPE_MISMATCH");
  if (qualification.status !== "QUALIFIED") return failed("BLOCKED", "M5_CG_PROJECTION_QUALIFICATION_NOT_QUALIFIED", qualification.blockers);

  const points: M5CoinGeckoMetricProjection["points"][number][] = [];
  const valueKey = requestedMetric === "DAILY_CLOSE_SERIES" ? "closeValueAtoms" : requestedMetric === "MARKET_CAP" ? "marketCapAtoms" : "volumeAtoms";
  const scaleKey = requestedMetric === "DAILY_CLOSE_SERIES" ? "priceScale" : requestedMetric === "MARKET_CAP" ? "marketCapScale" : "volumeScale";
  for (const record of acquisition.normalizedPackage.records) {
    const material = record.normalizedEnvelope as Readonly<Record<string, unknown>>;
    const valueAtoms = material[valueKey];
    const scale = material[scaleKey];
    if (typeof valueAtoms !== "string" || !/^(0|[1-9]\d*)$/.test(valueAtoms) || typeof scale !== "number" || !Number.isSafeInteger(scale) || scale < 0 || scale > 18 || record.providerRevision !== binding.payloadFingerprint) continue;
    if (material.quoteUnit !== "USD" || !canonicalTime(record.observedAt) || !canonicalTime(record.retrievedAt) || record.observedAt > record.retrievedAt || record.retrievedAt > asOf || !/^[a-f0-9]{64}$/.test(record.payloadFingerprint) || requestedMetric === "DAILY_CLOSE_SERIES" && (material.observationType !== "DAILY_CLOSE" || !record.observedAt.endsWith("T00:00:00.000Z"))) continue;
    const sourceAtoms = BigInt(valueAtoms);
    if (requestedMetric === "DAILY_CLOSE_SERIES" && sourceAtoms <= 0n) continue;
    const minorAtoms = scale <= 2 ? sourceAtoms * (10n ** BigInt(2 - scale)) : sourceAtoms / (10n ** BigInt(scale - 2));
    const point = {
      observedAt: record.observedAt,
      availableAt: record.retrievedAt,
      valueAtoms: requestedMetric === "DAILY_CLOSE_SERIES" ? valueAtoms : minorAtoms.toString(),
      scale: requestedMetric === "DAILY_CLOSE_SERIES" ? scale : 0,
      unit: requestedMetric === "DAILY_CLOSE_SERIES" ? "USD" as const : "MINOR" as const,
      sourceValueAtoms: valueAtoms,
      sourceScale: scale,
      quoteCurrency: "USD" as const,
      providerExternalRecordId: record.providerExternalRecordId,
      payloadFingerprint: record.payloadFingerprint,
      providerRevision: record.providerRevision,
      ...(requestedMetric === "MARKET_CAP" ? { basis: "MARKET_CAP_REPORTED" as const } : requestedMetric === "VOLUME_24H" ? { basis: "ROLLING_24H_REPORTED" as const } : {}),
      ...(requestedMetric === "VOLUME_24H" && typeof material.windowStart === "string" && typeof material.windowEnd === "string" ? { windowStart: material.windowStart, windowEnd: material.windowEnd } : {}),
    };
    if (requestedMetric === "VOLUME_24H" && (!point.windowStart || !point.windowEnd || !canonicalTime(point.windowStart) || !canonicalTime(point.windowEnd) || Date.parse(point.windowEnd) - Date.parse(point.windowStart) !== 86_400_000 || point.windowEnd > asOf)) continue;
    points.push(freeze(point));
  }
  if (points.length === 0) return failed("BLOCKED", "M5_CG_PROJECTION_MATERIAL_INCOMPLETE");
  if (requestedMetric === "DAILY_CLOSE_SERIES") {
    const ordered = [...points].sort((left, right) => left.observedAt.localeCompare(right.observedAt));
    const times = ordered.map(point => Date.parse(point.observedAt));
    const gapExceeded = times.some((timestamp, index) => index > 0 && timestamp - times[index - 1]! > 172_800_000);
    const scaleMismatch = ordered.some(point => point.scale !== ordered[0]!.scale);
    if (ordered.length < 15 || times.at(-1)! - times[0]! < 14 * 86_400_000 || gapExceeded || scaleMismatch || new Set(ordered.map(point => point.observedAt)).size !== ordered.length || new Set(ordered.map(point => point.providerExternalRecordId)).size !== ordered.length) return failed("BLOCKED", "M5_CG_PROJECTION_DAILY_SERIES_INCOMPLETE");
    points.splice(0, points.length, ...ordered);
  }
  return freeze({ status: "PROJECTED", metric: requestedMetric, qualificationId: qualification.qualificationId, qualificationFingerprint: qualification.qualificationFingerprint, providerId: "coingecko", datasetId: "coingecko-market-chart", datasetVersion: "coingecko-market-chart/range-v1", chainId: "eip155:1", assetSymbol: "WETH", contractAddress: qualification.contractAddress, asOf, payloadFingerprint: binding.payloadFingerprint, points });
}
