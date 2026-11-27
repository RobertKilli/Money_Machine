// Exact, bounded parsing shared by offline Kraken response adapters.
// Timestamp normalization is mechanical; it does not grant availability semantics.
const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

interface ExactTimestamp {
  readonly original: string;
  readonly epochNanoseconds: bigint;
}

interface ExactDecimal {
  readonly original: string;
  readonly coefficient: bigint;
  readonly scale: number;
}

function floorDivide(value: bigint, divisor: bigint): bigint {
  const quotient = value / divisor;
  return value % divisor < 0n ? quotient - 1n : quotient;
}

function ceilDivide(value: bigint, divisor: bigint): bigint {
  return -floorDivide(-value, divisor);
}

function daysFromCivil(yearValue: bigint, monthValue: bigint, dayValue: bigint): bigint {
  let year = yearValue;
  const month = monthValue;
  const day = dayValue;
  if (month <= 2n) year -= 1n;
  const era = floorDivide(year, 400n);
  const yearOfEra = year - era * 400n;
  const adjustedMonth = month + (month > 2n ? -3n : 9n);
  const dayOfYear = (153n * adjustedMonth + 2n) / 5n + day - 1n;
  const dayOfEra = yearOfEra * 365n + yearOfEra / 4n - yearOfEra / 100n + dayOfYear;
  return era * 146097n + dayOfEra - 719468n;
}

export function parseTimestamp(value: unknown): ExactTimestamp | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = ""] = match;
  const year = BigInt(yearText);
  const month = BigInt(monthText);
  const day = BigInt(dayText);
  const hour = BigInt(hourText);
  const minute = BigInt(minuteText);
  const second = BigInt(secondText);
  if (year < 1n || month < 1n || month > 12n || hour > 23n || minute > 59n || second > 59n) return null;
  const leapYear = year % 4n === 0n && (year % 100n !== 0n || year % 400n === 0n);
  const daysInMonth = month === 2n ? (leapYear ? 29n : 28n) : month === 4n || month === 6n || month === 9n || month === 11n ? 30n : 31n;
  if (day < 1n || day > daysInMonth) return null;
  const seconds = daysFromCivil(year, month, day) * 86_400n + hour * 3_600n + minute * 60n + second;
  const fractionNanoseconds = BigInt(fractionText.padEnd(9, "0") || "0");
  return { original: value, epochNanoseconds: seconds * NANOSECONDS_PER_SECOND + fractionNanoseconds };
}

export function normalizeTimestamp(timestamp: ExactTimestamp, direction: "FLOOR" | "CEIL"): string | null {
  const millis = direction === "FLOOR"
    ? floorDivide(timestamp.epochNanoseconds, NANOSECONDS_PER_MILLISECOND)
    : ceilDivide(timestamp.epochNanoseconds, NANOSECONDS_PER_MILLISECOND);
  const maxDateMillis = 8_640_000_000_000_000n;
  if (millis < -maxDateMillis || millis > maxDateMillis) return null;
  const date = new Date(Number(millis));
  if (!Number.isFinite(date.getTime())) return null;
  const normalized = date.toISOString();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(normalized) ? normalized : null;
}

export function parsePositiveDecimal(value: unknown): ExactDecimal | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  const coefficient = BigInt(`${whole}${fraction}`);
  if (coefficient <= 0n) return null;
  return { original: value, coefficient, scale: fraction.length };
}
