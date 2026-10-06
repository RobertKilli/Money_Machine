export const OFFLINE_INPUT_LAB_VERSION = "event-intelligence-offline-input-lab/v1" as const;
export const OFFLINE_INPUT_LAB_MAX_RECORDS = 3;
export const OFFLINE_INPUT_LAB_MAX_PAYLOAD_BYTES = 16 * 1024;
/** Measured with JavaScript String.length and the HTML maxlength attribute: UTF-16 code units. */
export const OFFLINE_INPUT_LAB_MAX_HEADLINE_LENGTH = 160;

export const OFFLINE_INPUT_LAB_PROFILES = ["issuer-mapping", "rights-blocked", "unresolved-correction"] as const;
export const OFFLINE_INPUT_LAB_JURISDICTIONS = ["US", "GB", "AU", "UNKNOWN"] as const;
export const OFFLINE_INPUT_LAB_EVENT_HINTS = ["PURCHASE_INTENT", "BOARD_AUTHORIZATION", "BINDING_AGREEMENT", "COMPLETED_PURCHASE", "TREASURY_POLICY", "CORRECTION_AMENDMENT"] as const;

export type OfflineInputLabProfile = typeof OFFLINE_INPUT_LAB_PROFILES[number];
export type OfflineInputLabJurisdiction = typeof OFFLINE_INPUT_LAB_JURISDICTIONS[number];
export type OfflineInputLabEventHint = typeof OFFLINE_INPUT_LAB_EVENT_HINTS[number];
export type OfflineInputLabRecord = Readonly<{
  profile: OfflineInputLabProfile;
  included: boolean;
  headline: string;
  publishedAt: string;
  discoveredAt: string;
  receivedAt: string;
  recordedAt: string;
  jurisdiction: OfflineInputLabJurisdiction;
  eventHint: OfflineInputLabEventHint;
}>;
export type OfflineInputLabInput = Readonly<{
  version: typeof OFFLINE_INPUT_LAB_VERSION;
  cutoff: string;
  records: readonly OfflineInputLabRecord[];
}>;

export type OfflineInputLabFieldError = Readonly<{ field: string; code: "INPUT_INVALID" | "INPUT_TOO_LARGE" | "UNKNOWN_FIELD" | "DUPLICATE_FIELD" | "FIELD_MISSING"; message: string }>;
export type OfflineInputLabInputParse = Readonly<{ status: "VALID"; input: OfflineInputLabInput }> | Readonly<{ status: "INVALID"; errors: readonly OfflineInputLabFieldError[] }>;
export type OfflineInputLabInputErrors = Extract<OfflineInputLabInputParse, { status: "INVALID" }> ["errors"];

const profileSet = new Set<string>(OFFLINE_INPUT_LAB_PROFILES);
const jurisdictionSet = new Set<string>(OFFLINE_INPUT_LAB_JURISDICTIONS);
const eventHintSet = new Set<string>(OFFLINE_INPUT_LAB_EVENT_HINTS);
const controls = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const PROFILE_LABELS: Readonly<Record<OfflineInputLabProfile, string>> = Object.freeze({
  "issuer-mapping": "Mapping",
  "rights-blocked": "Rights",
  "unresolved-correction": "Correction",
});
const FIELD_NAMES = Object.freeze(["profile", "included", "headline", "publishedAt", "discoveredAt", "receivedAt", "recordedAt", "jurisdiction", "eventHint"] as const);

function hasExactDataShape(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== "string" || !keys.includes(key))) return false;
  return keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !!descriptor && "value" in descriptor && descriptor.enumerable;
  });
}

function validUtc(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function invalid(field: string, code: OfflineInputLabFieldError["code"], message: string): OfflineInputLabFieldError {
  return Object.freeze({ field, code, message });
}

function utf8Bytes(value: string): number { return new TextEncoder().encode(value).length; }

export function parseOfflineInputLabInput(value: unknown): OfflineInputLabInputParse {
  try {
    if (!hasExactDataShape(value, ["version", "cutoff", "records"])) return Object.freeze({ status: "INVALID", errors: Object.freeze([invalid("form", "INPUT_INVALID", "Input must match the closed v1 shape.")]) });
    if (value.version !== OFFLINE_INPUT_LAB_VERSION || !validUtc(value.cutoff) || !Array.isArray(value.records) || Object.getPrototypeOf(value.records) !== Array.prototype) {
      return Object.freeze({ status: "INVALID", errors: Object.freeze([invalid("form", "INPUT_INVALID", "Version, canonical UTC cutoff, or record list is invalid.")]) });
    }
    const recordsArray = value.records as unknown[];
    const lengthDescriptor = Object.getOwnPropertyDescriptor(recordsArray, "length");
    const length = lengthDescriptor?.value;
    if (!Number.isSafeInteger(length) || (length as number) > OFFLINE_INPUT_LAB_MAX_RECORDS || Reflect.ownKeys(recordsArray).length !== (length as number) + 1) {
      return Object.freeze({ status: "INVALID", errors: Object.freeze([invalid("records", "INPUT_INVALID", "At most three dense record slots are supported.")]) });
    }
    const records: OfflineInputLabRecord[] = [];
    const errors: OfflineInputLabFieldError[] = [];
    const includedProfiles = new Set<string>();
    for (let index = 0; index < (length as number); index++) {
      const descriptor = Object.getOwnPropertyDescriptor(recordsArray, String(index));
      const fieldBase = `records.${index}`;
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || !hasExactDataShape(descriptor.value, FIELD_NAMES)) {
        errors.push(invalid(fieldBase, "INPUT_INVALID", "Record must match the closed v1 shape."));
        continue;
      }
      const row = descriptor.value;
      if (typeof row.profile !== "string" || !profileSet.has(row.profile)) {
        errors.push(invalid(`${fieldBase}.profile`, "INPUT_INVALID", "Choose one fixed synthetic profile."));
        continue;
      }
      if (typeof row.included !== "boolean") {
        errors.push(invalid(`${fieldBase}.included`, "INPUT_INVALID", "Choose whether this profile is included."));
        continue;
      }
      if (typeof row.headline !== "string" || row.headline.length === 0 || row.headline.length > OFFLINE_INPUT_LAB_MAX_HEADLINE_LENGTH || row.headline.trim() !== row.headline || controls.test(row.headline) || row.headline.normalize("NFC") !== row.headline) {
        errors.push(invalid(`${fieldBase}.headline`, "INPUT_INVALID", "Use a non-empty synthetic headline up to 160 UTF-16 code units."));
        continue;
      }
      const timestamps = ["publishedAt", "discoveredAt", "receivedAt", "recordedAt"] as const;
      const invalidTimestamp = timestamps.find(name => !validUtc(row[name]));
      if (invalidTimestamp) {
        errors.push(invalid(`${fieldBase}.${invalidTimestamp}`, "INPUT_INVALID", "Use canonical UTC timestamp format YYYY-MM-DDTHH:mm:ss.sssZ."));
        continue;
      }
      if (typeof row.jurisdiction !== "string" || !jurisdictionSet.has(row.jurisdiction)) {
        errors.push(invalid(`${fieldBase}.jurisdiction`, "INPUT_INVALID", "Choose US, GB, AU, or UNKNOWN."));
        continue;
      }
      if (typeof row.eventHint !== "string" || !eventHintSet.has(row.eventHint)) {
        errors.push(invalid(`${fieldBase}.eventHint`, "INPUT_INVALID", "Choose a supported synthetic event hint."));
        continue;
      }
      if (row.profile === "unresolved-correction" ? row.eventHint !== "CORRECTION_AMENDMENT" : row.eventHint === "CORRECTION_AMENDMENT") {
        errors.push(invalid(`${fieldBase}.eventHint`, "INPUT_INVALID", "Correction hints are fixed to the correction profile; the other profiles use supported purchase-related hints."));
        continue;
      }
      if (row.included && includedProfiles.has(row.profile)) {
        errors.push(invalid(`${fieldBase}.profile`, "INPUT_INVALID", "Each fixed profile may be included at most once."));
        continue;
      }
      if (row.included) includedProfiles.add(row.profile);
      records.push(Object.freeze({
        profile: row.profile as OfflineInputLabProfile,
        included: row.included,
        headline: row.headline,
        publishedAt: row.publishedAt as string,
        discoveredAt: row.discoveredAt as string,
        receivedAt: row.receivedAt as string,
        recordedAt: row.recordedAt as string,
        jurisdiction: row.jurisdiction as OfflineInputLabJurisdiction,
        eventHint: row.eventHint as OfflineInputLabEventHint,
      }));
    }
    if (errors.length) return Object.freeze({ status: "INVALID", errors: Object.freeze(errors) });
    const input = Object.freeze({ version: OFFLINE_INPUT_LAB_VERSION, cutoff: value.cutoff, records: Object.freeze(records) });
    if (utf8Bytes(JSON.stringify(input)) > OFFLINE_INPUT_LAB_MAX_PAYLOAD_BYTES) return Object.freeze({ status: "INVALID", errors: Object.freeze([invalid("form", "INPUT_TOO_LARGE", "Application input exceeds the 16 KiB UTF-8 limit; no evaluation was run.")]) });
    return Object.freeze({ status: "VALID", input });
  } catch {
    return Object.freeze({ status: "INVALID", errors: Object.freeze([invalid("form", "INPUT_INVALID", "Input could not be read safely; no evaluation was run.")]) });
  }
}

/** Converts bounded native form fields into the versioned application input and rejects duplicate or unknown names. */
export function parseOfflineInputLabFormData(formData: FormData): OfflineInputLabInputParse {
  const expected = new Set<string>(["version", "cutoff"]);
  for (let index = 0; index < OFFLINE_INPUT_LAB_MAX_RECORDS; index++) for (const field of FIELD_NAMES) expected.add(`records.${index}.${field}`);
  const values = new Map<string, string>();
  const errors: OfflineInputLabFieldError[] = [];
  let byteCount = 0;
  let entryCount = 0;
  try {
    for (const [name, raw] of formData.entries()) {
      entryCount++;
      if (entryCount > 32) return Object.freeze({ status: "INVALID", errors: Object.freeze([invalid("form", "INPUT_TOO_LARGE", "Too many submitted fields; no evaluation was run.")]) });
      byteCount += utf8Bytes(name) + (typeof raw === "string" ? utf8Bytes(raw) : raw.size);
      if (byteCount > OFFLINE_INPUT_LAB_MAX_PAYLOAD_BYTES) return Object.freeze({ status: "INVALID", errors: Object.freeze([invalid("form", "INPUT_TOO_LARGE", "Application form input exceeds the 16 KiB UTF-8 limit; no evaluation was run.")]) });
      if (!expected.has(name)) {
        errors.push(invalid("form", "UNKNOWN_FIELD", "Unexpected form field; no evaluation was run."));
        continue;
      }
      if (values.has(name)) {
        errors.push(invalid(name, "DUPLICATE_FIELD", "Duplicate field; no evaluation was run."));
        continue;
      }
      if (typeof raw !== "string") {
        errors.push(invalid(name, "INPUT_INVALID", "Files are not accepted; no evaluation was run."));
        continue;
      }
      values.set(name, raw);
    }
  } catch {
    return Object.freeze({ status: "INVALID", errors: Object.freeze([invalid("form", "INPUT_INVALID", "Form fields could not be read safely; no evaluation was run.")]) });
  }
  for (const name of expected) if (!values.has(name)) errors.push(invalid(name === "version" || name === "cutoff" ? name : name.split(".").slice(0, 2).join("."), "FIELD_MISSING", "Required form field is missing; no evaluation was run."));
  if (errors.length) return Object.freeze({ status: "INVALID", errors: Object.freeze(errors) });

      const records = Array.from({ length: OFFLINE_INPUT_LAB_MAX_RECORDS }, (_, index) => Object.fromEntries(FIELD_NAMES.map(field => {
    const name = `records.${index}.${field}`;
    const raw = values.get(name)!;
    if (field === "included") return [field, raw === "yes" ? true : raw === "no" ? false : raw];
    return [field, raw];
  })));
  const parsed = parseOfflineInputLabInput({ version: values.get("version"), cutoff: values.get("cutoff"), records });
  return parsed;
}

export function defaultOfflineInputLabInput(): OfflineInputLabInput {
  return Object.freeze({
    version: OFFLINE_INPUT_LAB_VERSION,
    cutoff: "2026-10-03T12:00:00.000Z",
    records: Object.freeze([
      Object.freeze({ profile: "issuer-mapping" as const, included: true, headline: "Synthetic Demo Company considers a Bitcoin purchase", publishedAt: "2026-10-01T08:00:00.000Z", discoveredAt: "2026-10-01T09:00:00.000Z", receivedAt: "2026-10-01T09:00:01.000Z", recordedAt: "2026-10-01T09:00:02.000Z", jurisdiction: "US" as const, eventHint: "PURCHASE_INTENT" as const }),
      Object.freeze({ profile: "rights-blocked" as const, included: true, headline: "Synthetic Demo Company reviews a Bitcoin purchase", publishedAt: "2026-10-01T08:00:00.000Z", discoveredAt: "2026-10-01T09:00:00.000Z", receivedAt: "2026-10-01T09:00:01.000Z", recordedAt: "2026-10-01T09:00:02.000Z", jurisdiction: "US" as const, eventHint: "PURCHASE_INTENT" as const }),
      Object.freeze({ profile: "unresolved-correction" as const, included: true, headline: "Synthetic Demo Company corrects an earlier notice", publishedAt: "2026-10-02T08:00:00.000Z", discoveredAt: "2026-10-02T08:01:00.000Z", receivedAt: "2026-10-02T08:01:01.000Z", recordedAt: "2026-10-02T08:01:01.000Z", jurisdiction: "US" as const, eventHint: "CORRECTION_AMENDMENT" as const }),
    ]),
  });
}

export function offlineInputLabFieldName(index: number, field: typeof FIELD_NAMES[number]): string {
  return `records.${index}.${field}`;
}

export function offlineInputLabProfileLabel(profile: OfflineInputLabProfile): string { return PROFILE_LABELS[profile]; }
