import { canonicalSha256 } from "./ingestion-provenance";
import { floorDivision } from "../financial/rounding";

export const CRYPTO_DAILY_CADENCE_POLICY_VERSION = "crypto-daily/v1" as const;
export const HISTORY_SPAN_DERIVATION_VERSION = "history-span/crypto-daily/v1" as const;
export const VOLATILITY_DERIVATION_VERSION = "volatility/crypto-daily/v1" as const;
export const INTEGER_FLOOR_ROUNDING_VERSION = "m5-integer-floor/v1" as const;
export const DAILY_MILLISECONDS = 86_400_000n;
export const MAX_DAILY_GAP_MILLISECONDS = 48n * 60n * 60n * 1000n;
export const MIN_DAILY_OBSERVATIONS = 15;
export const MIN_DAILY_RETURNS = 14;

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;
const MAX_INTERMEDIATE = 10n ** 38n;

export type DailyCloseObservationInput = Readonly<{
  observationId: string;
  observedAt: string;
  availableAt: string;
  closeValue: bigint;
  priceScale: number;
  quoteUnit: string;
}>;

export type NormalizedDailyCloseObservation = Readonly<DailyCloseObservationInput>;

export type M5DailyDiagnosticCode =
  | "M5_DAILY_SERIES_EMPTY"
  | "M5_DAILY_SERIES_INSUFFICIENT_OBSERVATIONS"
  | "M5_DAILY_SERIES_INSUFFICIENT_COVERAGE"
  | "M5_DAILY_SERIES_GAP_EXCEEDED"
  | "M5_DAILY_SERIES_DUPLICATE_TIMESTAMP"
  | "M5_DAILY_SERIES_DUPLICATE_OBSERVATION"
  | "M5_DAILY_SERIES_PRICE_INVALID"
  | "M5_DAILY_SERIES_SCALE_MISMATCH"
  | "M5_DAILY_SERIES_UNIT_MISMATCH"
  | "M5_DAILY_SERIES_TIME_INVALID"
  | "M5_DAILY_SERIES_FUTURE_AVAILABILITY"
  | "M5_DAILY_SERIES_RANGE_INVALID";

export type DailySeriesIncomplete = Readonly<{
  status: "INCOMPLETE";
  diagnostics: readonly M5DailyDiagnosticCode[];
}>;

export type DailySeriesInvalid = Readonly<{
  status: "INVALID";
  diagnostics: readonly M5DailyDiagnosticCode[];
}>;

export type DailySeriesReady = Readonly<{
  status: "READY";
  asOf: string;
  series: readonly NormalizedDailyCloseObservation[];
  earliestObservedAt: string;
  latestObservedAt: string;
  availableAt: string;
  maximumObservedGap: bigint;
  observationCount: number;
  returnCount: number;
  priceScale: number;
  quoteUnit: string;
  seriesFingerprint: string;
}>;

export type DailySeriesResult = DailySeriesReady | DailySeriesIncomplete | DailySeriesInvalid;

export type M5DerivationMaterial = Readonly<{
  derivationVersion: typeof HISTORY_SPAN_DERIVATION_VERSION | typeof VOLATILITY_DERIVATION_VERSION;
  cadencePolicyVersion: typeof CRYPTO_DAILY_CADENCE_POLICY_VERSION;
  metricKind: "HISTORY_SPAN" | "VOLATILITY";
  value: bigint;
  scale: 0;
  unit: "DAYS" | "BPS";
  asOf: string;
  observedAt: string;
  availableAt: string;
  orderedObservationIds: readonly string[];
  observationCount: number;
  returnCount: number;
  earliestObservedAt: string;
  latestObservedAt: string;
  maximumObservedGap: bigint;
  priceScale: number;
  quoteUnit: string;
  roundingVersion: typeof INTEGER_FLOOR_ROUNDING_VERSION;
  fingerprint: string;
}>;

export type M5DerivationResult =
  | Readonly<{ status: "READY"; material: M5DerivationMaterial }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly M5DailyDiagnosticCode[] }>;

export type M5DailyDerivationsResult =
  | Readonly<{ status: "READY"; historySpan: M5DerivationMaterial; volatility: M5DerivationMaterial }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly M5DailyDiagnosticCode[] }>;

function freeze<T extends object>(value: T): Readonly<T> { return Object.freeze(value); }

function diagnostics(values: readonly M5DailyDiagnosticCode[]): readonly M5DailyDiagnosticCode[] {
  const order: readonly M5DailyDiagnosticCode[] = [
    "M5_DAILY_SERIES_EMPTY",
    "M5_DAILY_SERIES_DUPLICATE_OBSERVATION",
    "M5_DAILY_SERIES_DUPLICATE_TIMESTAMP",
    "M5_DAILY_SERIES_TIME_INVALID",
    "M5_DAILY_SERIES_FUTURE_AVAILABILITY",
    "M5_DAILY_SERIES_PRICE_INVALID",
    "M5_DAILY_SERIES_RANGE_INVALID",
    "M5_DAILY_SERIES_SCALE_MISMATCH",
    "M5_DAILY_SERIES_UNIT_MISMATCH",
    "M5_DAILY_SERIES_GAP_EXCEEDED",
    "M5_DAILY_SERIES_INSUFFICIENT_OBSERVATIONS",
    "M5_DAILY_SERIES_INSUFFICIENT_COVERAGE",
  ];
  const unique = new Set(values);
  return freeze(order.filter(code => unique.has(code)));
}

function timestamp(value: unknown): { value: string; milliseconds: bigint } | undefined {
  if (typeof value !== "string" || !UTC_TIMESTAMP.test(value)) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed)) return undefined;
  try {
    const normalized = new Date(parsed).toISOString();
    return normalized === value ? { value: normalized, milliseconds: BigInt(parsed) } : undefined;
  } catch {
    return undefined;
  }
}

function checkedMaterialInteger(value: bigint): boolean {
  return value >= INT64_MIN && value <= INT64_MAX;
}

function checkedIntermediate(value: bigint): boolean {
  return value >= -MAX_INTERMEDIATE && value <= MAX_INTERMEDIATE;
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256;
}

function seriesFingerprint(series: readonly NormalizedDailyCloseObservation[], asOf: string, priceScale: number, quoteUnit: string): string {
  return canonicalSha256({
    policyVersion: CRYPTO_DAILY_CADENCE_POLICY_VERSION,
    asOf,
    priceScale,
    quoteUnit,
    maximumGapMilliseconds: MAX_DAILY_GAP_MILLISECONDS,
    minimumObservationCount: MIN_DAILY_OBSERVATIONS,
    minimumReturnCount: MIN_DAILY_RETURNS,
    timestampSemantics: "canonical-utc-millisecond",
    sortingRule: "observedAt-then-observationId",
    duplicateRule: "reject-observedAt-and-observationId",
    roundingVersion: INTEGER_FLOOR_ROUNDING_VERSION,
    series,
  });
}

export function normalizeCryptoDailyCloseSeries(
  input: readonly DailyCloseObservationInput[],
  asOfInput: string,
): DailySeriesResult {
  const asOf = timestamp(asOfInput);
  if (!asOf) return freeze({ status: "INVALID", diagnostics: diagnostics(["M5_DAILY_SERIES_TIME_INVALID"]) });
  if (!Array.isArray(input) || input.length === 0) return freeze({ status: "INCOMPLETE", diagnostics: diagnostics(["M5_DAILY_SERIES_EMPTY"]) });

  const errors: M5DailyDiagnosticCode[] = [];
  const seenIds = new Set<string>();
  const seenTimes = new Set<string>();
  const rows: Array<NormalizedDailyCloseObservation & { readonly observedMillis: bigint; readonly availableMillis: bigint }> = [];
  let scale: number | undefined;
  let quoteUnit: string | undefined;

  for (const row of input) {
    if (!row || typeof row !== "object" || !nonBlank(row.observationId)) {
      errors.push("M5_DAILY_SERIES_RANGE_INVALID");
      continue;
    }
    const observationId = row.observationId.trim();
    if (seenIds.has(observationId)) errors.push("M5_DAILY_SERIES_DUPLICATE_OBSERVATION");
    seenIds.add(observationId);
    const observed = timestamp(row.observedAt);
    const available = timestamp(row.availableAt);
    if (!observed || !available) {
      errors.push("M5_DAILY_SERIES_TIME_INVALID");
      continue;
    }
    if (seenTimes.has(observed.value)) errors.push("M5_DAILY_SERIES_DUPLICATE_TIMESTAMP");
    seenTimes.add(observed.value);
    if (observed.milliseconds > available.milliseconds) errors.push("M5_DAILY_SERIES_TIME_INVALID");
    if (available.milliseconds > asOf.milliseconds) errors.push("M5_DAILY_SERIES_FUTURE_AVAILABILITY");
    if (typeof row.closeValue !== "bigint" || row.closeValue <= 0n) errors.push("M5_DAILY_SERIES_PRICE_INVALID");
    if (typeof row.closeValue === "bigint" && (!checkedMaterialInteger(row.closeValue) || !checkedIntermediate(row.closeValue))) errors.push("M5_DAILY_SERIES_RANGE_INVALID");
    if (!Number.isInteger(row.priceScale) || row.priceScale < 0 || row.priceScale > 32767) errors.push("M5_DAILY_SERIES_RANGE_INVALID");
    if (!nonBlank(row.quoteUnit)) errors.push("M5_DAILY_SERIES_RANGE_INVALID");
    const normalizedUnit = typeof row.quoteUnit === "string" ? row.quoteUnit.trim() : "";
    if (scale === undefined) scale = row.priceScale;
    else if (scale !== row.priceScale) errors.push("M5_DAILY_SERIES_SCALE_MISMATCH");
    if (quoteUnit === undefined) quoteUnit = normalizedUnit;
    else if (quoteUnit !== normalizedUnit) errors.push("M5_DAILY_SERIES_UNIT_MISMATCH");
    rows.push({
      observationId,
      observedAt: observed.value,
      availableAt: available.value,
      closeValue: row.closeValue,
      priceScale: row.priceScale,
      quoteUnit: normalizedUnit,
      observedMillis: observed.milliseconds,
      availableMillis: available.milliseconds,
    });
  }
  if (errors.length > 0) return freeze({ status: "INVALID", diagnostics: diagnostics(errors) });

  rows.sort((a, b) => a.observedMillis < b.observedMillis ? -1 : a.observedMillis > b.observedMillis ? 1 : a.observationId.localeCompare(b.observationId));
  let maximumObservedGap = 0n;
  for (let index = 1; index < rows.length; index += 1) {
    const gap = rows[index]!.observedMillis - rows[index - 1]!.observedMillis;
    if (gap > maximumObservedGap) maximumObservedGap = gap;
  }
  const span = rows.at(-1)!.observedMillis - rows[0]!.observedMillis;
  const incomplete: M5DailyDiagnosticCode[] = [];
  if (maximumObservedGap > MAX_DAILY_GAP_MILLISECONDS) incomplete.push("M5_DAILY_SERIES_GAP_EXCEEDED");
  if (rows.length < MIN_DAILY_OBSERVATIONS || rows.length - 1 < MIN_DAILY_RETURNS) incomplete.push("M5_DAILY_SERIES_INSUFFICIENT_OBSERVATIONS");
  if (floorDivision(span, DAILY_MILLISECONDS) < 14n) incomplete.push("M5_DAILY_SERIES_INSUFFICIENT_COVERAGE");
  if (incomplete.length > 0) return freeze({ status: "INCOMPLETE", diagnostics: diagnostics(incomplete) });

  const series = freeze(rows.map(row => freeze({ observationId: row.observationId, observedAt: row.observedAt, availableAt: row.availableAt, closeValue: row.closeValue, priceScale: row.priceScale, quoteUnit: row.quoteUnit })));
  const availableAt = rows.reduce((latest, row) => row.availableMillis > latest.availableMillis ? row : latest).availableAt;
  const result: DailySeriesReady = {
    status: "READY",
    asOf: asOf.value,
    series,
    earliestObservedAt: series[0]!.observedAt,
    latestObservedAt: series.at(-1)!.observedAt,
    availableAt,
    maximumObservedGap,
    observationCount: series.length,
    returnCount: series.length - 1,
    priceScale: scale!,
    quoteUnit: quoteUnit!,
    seriesFingerprint: seriesFingerprint(series, asOf.value, scale!, quoteUnit!),
  };
  return freeze(result);
}

function invalidOrIncomplete(series: DailySeriesResult): M5DerivationResult {
  return series.status === "READY" ? freeze({ status: "INVALID", diagnostics: ["M5_DAILY_SERIES_RANGE_INVALID"] as const }) : freeze({ status: series.status, diagnostics: series.diagnostics });
}

function materialFingerprint(material: Omit<M5DerivationMaterial, "fingerprint">, series: readonly NormalizedDailyCloseObservation[]): string {
  return canonicalSha256({ ...material, seriesFingerprint: canonicalSha256(series), series });
}

function makeMaterial(
  series: DailySeriesReady,
  metricKind: M5DerivationMaterial["metricKind"],
  value: bigint,
  derivationVersion: M5DerivationMaterial["derivationVersion"],
): M5DerivationMaterial {
  if (!checkedMaterialInteger(value)) throw new Error("M5_DAILY_SERIES_RANGE_INVALID");
  const body: Omit<M5DerivationMaterial, "fingerprint"> = {
    derivationVersion,
    cadencePolicyVersion: CRYPTO_DAILY_CADENCE_POLICY_VERSION,
    metricKind,
    value,
    scale: 0,
    unit: metricKind === "HISTORY_SPAN" ? "DAYS" : "BPS",
    asOf: series.asOf,
    observedAt: series.latestObservedAt,
    availableAt: series.availableAt,
    orderedObservationIds: freeze(series.series.map(row => row.observationId)),
    observationCount: series.observationCount,
    returnCount: series.returnCount,
    earliestObservedAt: series.earliestObservedAt,
    latestObservedAt: series.latestObservedAt,
    maximumObservedGap: series.maximumObservedGap,
    priceScale: series.priceScale,
    quoteUnit: series.quoteUnit,
    roundingVersion: INTEGER_FLOOR_ROUNDING_VERSION,
  };
  return freeze({ ...body, fingerprint: materialFingerprint(body, series.series) });
}

export function deriveHistorySpan(input: readonly DailyCloseObservationInput[], asOf: string): M5DerivationResult {
  const series = normalizeCryptoDailyCloseSeries(input, asOf);
  if (series.status !== "READY") return invalidOrIncomplete(series);
  const start = BigInt(Date.parse(series.earliestObservedAt));
  const end = BigInt(Date.parse(series.latestObservedAt));
  return freeze({ status: "READY", material: makeMaterial(series, "HISTORY_SPAN", floorDivision(end - start, DAILY_MILLISECONDS), HISTORY_SPAN_DERIVATION_VERSION) });
}

function integerSquareRoot(value: bigint): bigint {
  if (value < 0n) throw new Error("M5_DAILY_SERIES_RANGE_INVALID");
  if (value < 2n) return value;
  let low = 1n;
  let high = value;
  while (low <= high) {
    const middle = (low + high) / 2n;
    const square = middle * middle;
    if (square === value) return middle;
    if (square < value) low = middle + 1n;
    else high = middle - 1n;
  }
  return high;
}

export function deriveVolatility(input: readonly DailyCloseObservationInput[], asOf: string): M5DerivationResult {
  const series = normalizeCryptoDailyCloseSeries(input, asOf);
  if (series.status !== "READY") return invalidOrIncomplete(series);
  try {
    let sum = 0n;
    let sumSquares = 0n;
    for (let index = 1; index < series.series.length; index += 1) {
      const previous = series.series[index - 1]!.closeValue;
      const current = series.series[index]!.closeValue;
      if (previous <= 0n) return freeze({ status: "INVALID", diagnostics: ["M5_DAILY_SERIES_PRICE_INVALID"] as const });
      const numerator = (current - previous) * 10_000n;
      if (!checkedIntermediate(numerator)) return freeze({ status: "INVALID", diagnostics: ["M5_DAILY_SERIES_RANGE_INVALID"] as const });
      const denominator = previous < 0n ? -previous : previous;
      const value = floorDivision(numerator, denominator);
      sum += value;
      sumSquares += value * value;
      if (!checkedIntermediate(sum) || !checkedIntermediate(sumSquares)) return freeze({ status: "INVALID", diagnostics: ["M5_DAILY_SERIES_RANGE_INVALID"] as const });
    }
    const count = BigInt(series.returnCount);
    // Population variance is (Σ(r - mean)^2) = (n·Σr² - (Σr)²) / n.
    // Therefore floor(sqrt(n·Σr² - (Σr)²) / n) is the required integer result.
    const varianceNumerator = count * sumSquares - sum * sum;
    if (varianceNumerator < 0n || !checkedIntermediate(varianceNumerator)) return freeze({ status: "INVALID", diagnostics: ["M5_DAILY_SERIES_RANGE_INVALID"] as const });
    const volatility = floorDivision(integerSquareRoot(varianceNumerator), count);
    return freeze({ status: "READY", material: makeMaterial(series, "VOLATILITY", volatility, VOLATILITY_DERIVATION_VERSION) });
  } catch {
    return freeze({ status: "INVALID", diagnostics: ["M5_DAILY_SERIES_RANGE_INVALID"] as const });
  }
}

export function deriveM5CryptoDailyMetrics(input: readonly DailyCloseObservationInput[], asOf: string): M5DailyDerivationsResult {
  const series = normalizeCryptoDailyCloseSeries(input, asOf);
  if (series.status !== "READY") return freeze({ status: series.status, diagnostics: series.diagnostics });
  const history = deriveHistorySpan(series.series, series.asOf);
  const volatility = deriveVolatility(series.series, series.asOf);
  if (history.status !== "READY" || volatility.status !== "READY") return freeze({ status: "INVALID", diagnostics: ["M5_DAILY_SERIES_RANGE_INVALID"] as const });
  return freeze({ status: "READY", historySpan: history.material, volatility: volatility.material });
}

export { integerSquareRoot };
