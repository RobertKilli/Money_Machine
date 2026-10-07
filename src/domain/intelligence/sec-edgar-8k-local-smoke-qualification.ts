import "server-only";
import { types as utilTypes } from "node:util";
import { canonicalSha256 } from "./ingestion-provenance";
import { SEC_EDGAR_8K_LOCAL_SMOKE_RESTRICTIONS, SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE } from "./sec-edgar-8k-local-smoke-scope";

export const SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_VERSION = "sec-edgar-8k-local-smoke-qualification/v1" as const;
export const SEC_EDGAR_8K_LOCAL_SMOKE_REQUIRED_EVIDENCE = Object.freeze([
  "SEC_PUBLIC_ACCESS_AND_REUSE",
  "SEC_SUBMISSIONS_AND_HISTORY_FORMAT",
  "SEC_FAIR_ACCESS_AND_USER_AGENT",
  "SELECTED_FILING_IDENTITY",
] as const);
const REQUIRED_CLAIM_BY_EVIDENCE: Readonly<Record<SecEdgar8kLocalSmokeEvidenceId, string>> = Object.freeze({
  SEC_PUBLIC_ACCESS_AND_REUSE: "PUBLIC_ACCESS_AND_REUSE",
  SEC_SUBMISSIONS_AND_HISTORY_FORMAT: "SUBMISSIONS_MANIFEST_AND_HISTORY",
  SEC_FAIR_ACCESS_AND_USER_AGENT: "FAIR_ACCESS_AND_IDENTIFYING_USER_AGENT",
  SELECTED_FILING_IDENTITY: "SELECTED_FILING_IDENTITY_REVIEWED",
});
export type SecEdgar8kLocalSmokeEvidenceId = typeof SEC_EDGAR_8K_LOCAL_SMOKE_REQUIRED_EVIDENCE[number];
export type SecEdgar8kLocalSmokeEvidence = Readonly<{
  id: SecEdgar8kLocalSmokeEvidenceId;
  title: string;
  url: string;
  checkedAt: string;
  claims: readonly string[];
}>;
export type SecEdgar8kLocalSmokeQualification = Readonly<{
  contractVersion: typeof SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_VERSION;
  status: "PROPOSED" | "APPROVED_FOR_LOCAL_SMOKE";
  scope: typeof SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE;
  restrictions: typeof SEC_EDGAR_8K_LOCAL_SMOKE_RESTRICTIONS;
  acquisitionDecision: "NOT_APPROVED" | "REQUIRES_REVIEW" | "APPROVED";
  processMemoryDecision: "NOT_APPROVED" | "REQUIRES_REVIEW" | "APPROVED";
  /** Opaque User-Agent identity reference, fingerprinted and not proof of a person's identity. */
  userAgentIdentityRef: string;
  evidence: readonly SecEdgar8kLocalSmokeEvidence[];
  blockers: readonly string[];
  reviewedAt: string;
  effectiveFrom: string;
  expiresAt: string;
  recordedAt: string;
  qualificationReference: string;
  fingerprint: string;
}>;
export type SecEdgar8kLocalSmokeQualificationPin = Readonly<{ reference: string; material: unknown }>;

/** Runtime qualification pins are empty until a separately reviewed decision. */
export const SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS: readonly SecEdgar8kLocalSmokeQualificationPin[] = Object.freeze([]);

export type SecEdgar8kLocalSmokeQualificationFailure =
  | "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID"
  | "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_APPROVED"
  | "SEC_LOCAL_SMOKE_QUALIFICATION_EVIDENCE_REQUIRED"
  | "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_PINNED"
  | "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_YET_EFFECTIVE"
  | "SEC_LOCAL_SMOKE_QUALIFICATION_EXPIRED";
export type SecEdgar8kLocalSmokeQualificationGate =
  | Readonly<{ status: "APPROVED_FOR_LOCAL_SMOKE"; qualification: SecEdgar8kLocalSmokeQualification }>
  | Readonly<{ status: "BLOCKED"; code: SecEdgar8kLocalSmokeQualificationFailure }>;

const TRUSTED = new WeakSet<object>();
const INVALID: SecEdgar8kLocalSmokeQualificationGate = Object.freeze({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
const FIELDS = ["contractVersion", "status", "scope", "restrictions", "acquisitionDecision", "processMemoryDecision", "userAgentIdentityRef", "evidence", "blockers", "reviewedAt", "effectiveFrom", "expiresAt", "recordedAt", "qualificationReference", "fingerprint"] as const;
const EVIDENCE_FIELDS = ["id", "title", "url", "checkedAt", "claims"] as const;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const PUBLIC_SEC_HOSTS = new Set(["sec.gov", "www.sec.gov", "data.sec.gov"]);
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== "object" || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
    const own = Reflect.ownKeys(value);
    return own.length === keys.length && own.every((key) => typeof key === "string" && keys.includes(key) && (() => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return !!descriptor && "value" in descriptor && descriptor.get === undefined && descriptor.set === undefined;
    })());
  } catch { return false; }
}
function denseStrings(value: unknown, maximum: number): value is string[] {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) return false;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
    for (let i = 0; i < value.length; i++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") return false;
    }
    return true;
  } catch { return false; }
}
const canonicalTime = (value: unknown): value is string => typeof value === "string" && UTC.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const boundedText = (value: unknown, maximum: number): value is string => typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
const canonicalStrings = (value: unknown, maximum: number): value is string[] => denseStrings(value, maximum) && value.every((entry) => boundedText(entry, 160)) && [...value].sort().every((entry, index) => entry === value[index]) && new Set(value).size === value.length;
function matchesFixedRecord(value: unknown, expected: Readonly<Record<string, unknown>>): boolean {
  if (!exactObject(value, Object.keys(expected))) return false;
  return Object.keys(expected).every((key) => {
    const actual = Object.getOwnPropertyDescriptor(value, key)?.value;
    const target = expected[key];
    return Array.isArray(target) ? denseStrings(actual, target.length) && JSON.stringify(actual) === JSON.stringify(target) : actual === target;
  });
}
const MATERIAL_KEYS = FIELDS.filter((field) => !["recordedAt", "qualificationReference", "fingerprint"].includes(field));

export function createSecEdgar8kLocalSmokeQualificationFingerprint(material: Omit<SecEdgar8kLocalSmokeQualification, "qualificationReference" | "fingerprint" | "recordedAt">): string {
  return canonicalSha256(material);
}

export function parseSecEdgar8kLocalSmokeQualification(input: unknown): Readonly<{ status: "VALID"; qualification: SecEdgar8kLocalSmokeQualification }> | Readonly<{ status: "INVALID"; code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" }> {
  try {
    if (!exactObject(input, FIELDS)) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
    const value = input;
    if (value.contractVersion !== SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_VERSION || !["PROPOSED", "APPROVED_FOR_LOCAL_SMOKE"].includes(value.status as string)) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
    if (!matchesFixedRecord(value.scope, SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE) || !matchesFixedRecord(value.restrictions, SEC_EDGAR_8K_LOCAL_SMOKE_RESTRICTIONS)) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
    if (!["NOT_APPROVED", "REQUIRES_REVIEW", "APPROVED"].includes(value.acquisitionDecision as string) || !["NOT_APPROVED", "REQUIRES_REVIEW", "APPROVED"].includes(value.processMemoryDecision as string)) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
    // Opaque code-level binding label only; it does not establish operator authorization.
    if (!boundedText(value.userAgentIdentityRef, 128) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,95}$/.test(value.userAgentIdentityRef)) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
    if (!Array.isArray(value.evidence) || utilTypes.isProxy(value.evidence) || Object.getPrototypeOf(value.evidence) !== Array.prototype || value.evidence.length > SEC_EDGAR_8K_LOCAL_SMOKE_REQUIRED_EVIDENCE.length || Reflect.ownKeys(value.evidence).length !== value.evidence.length + 1) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
    const evidence: SecEdgar8kLocalSmokeEvidence[] = [];
    for (let index = 0; index < value.evidence.length; index++) {
      const item = Object.getOwnPropertyDescriptor(value.evidence, String(index))?.value as unknown;
      if (!exactObject(item, EVIDENCE_FIELDS) || !SEC_EDGAR_8K_LOCAL_SMOKE_REQUIRED_EVIDENCE.includes(item.id as SecEdgar8kLocalSmokeEvidenceId) || !boundedText(item.title, 160) || !canonicalTime(item.checkedAt) || !canonicalStrings(item.claims, 12) || item.claims.length !== 1 || item.claims[0] !== REQUIRED_CLAIM_BY_EVIDENCE[item.id as SecEdgar8kLocalSmokeEvidenceId] || typeof item.url !== "string" || item.url.length > 2048) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
      const url = new URL(item.url);
      if (url.protocol !== "https:" || !PUBLIC_SEC_HOSTS.has(url.hostname) || url.username || url.password || url.search || url.hash || url.href !== item.url) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
      evidence.push({ id: item.id as SecEdgar8kLocalSmokeEvidenceId, title: item.title as string, url: item.url, checkedAt: item.checkedAt as string, claims: [...item.claims as string[]] });
    }
    evidence.sort((left, right) => left.id.localeCompare(right.id));
    if (new Set(evidence.map((item) => item.id)).size !== evidence.length || !canonicalStrings(value.blockers, 12)) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
    if (![value.reviewedAt, value.effectiveFrom, value.expiresAt, value.recordedAt].every(canonicalTime) || String(value.reviewedAt) > String(value.effectiveFrom) || String(value.effectiveFrom) >= String(value.expiresAt) || evidence.some((item) => item.checkedAt > String(value.reviewedAt))) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
    if (typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.fingerprint) || value.fingerprint !== createSecEdgar8kLocalSmokeQualificationFingerprint(Object.fromEntries(MATERIAL_KEYS.map((key) => [key, value[key]])) as never) || value.qualificationReference !== `sec-edgar-8k-local-smoke-qualification:${value.fingerprint}`) return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" });
    const parsed = deepFreeze({ ...value, scope: SEC_EDGAR_8K_LOCAL_SMOKE_SCOPE, restrictions: SEC_EDGAR_8K_LOCAL_SMOKE_RESTRICTIONS, evidence, blockers: [...value.blockers as string[]] }) as unknown as SecEdgar8kLocalSmokeQualification;
    TRUSTED.add(parsed);
    return Object.freeze({ status: "VALID", qualification: parsed });
  } catch { return Object.freeze({ status: "INVALID", code: "SEC_LOCAL_SMOKE_QUALIFICATION_INVALID" }); }
}

export const isAuthenticSecEdgar8kLocalSmokeQualification = (value: unknown): value is SecEdgar8kLocalSmokeQualification => !!value && typeof value === "object" && TRUSTED.has(value);

export function evaluateSecEdgar8kLocalSmokeQualification(value: unknown, now: unknown): SecEdgar8kLocalSmokeQualificationGate {
  if (!isAuthenticSecEdgar8kLocalSmokeQualification(value) || !canonicalTime(now)) return INVALID;
  const qualification = value;
  if (qualification.status !== "APPROVED_FOR_LOCAL_SMOKE" || qualification.acquisitionDecision !== "APPROVED" || qualification.processMemoryDecision !== "APPROVED" || qualification.blockers.length > 0) return Object.freeze({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_APPROVED" });
  const evidenceIds = new Set(qualification.evidence.map((item) => item.id));
  if (SEC_EDGAR_8K_LOCAL_SMOKE_REQUIRED_EVIDENCE.some((id) => !evidenceIds.has(id))) return Object.freeze({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_EVIDENCE_REQUIRED" });
  if (Date.parse(now) < Date.parse(qualification.effectiveFrom)) return Object.freeze({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_YET_EFFECTIVE" });
  if (Date.parse(now) >= Date.parse(qualification.expiresAt)) return Object.freeze({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_EXPIRED" });
  const pins = SEC_EDGAR_8K_LOCAL_SMOKE_QUALIFICATION_PINS.filter((pin) => pin.reference === qualification.qualificationReference);
  if (pins.length !== 1) return Object.freeze({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_PINNED" });
  const pinned = parseSecEdgar8kLocalSmokeQualification(pins[0]!.material);
  if (pinned.status !== "VALID" || pinned.qualification.fingerprint !== qualification.fingerprint) return Object.freeze({ status: "BLOCKED", code: "SEC_LOCAL_SMOKE_QUALIFICATION_NOT_PINNED" });
  return Object.freeze({ status: "APPROVED_FOR_LOCAL_SMOKE", qualification });
}

export const isCurrentlySecEdgar8kLocalSmokeQualified = (value: unknown, now: unknown): value is SecEdgar8kLocalSmokeQualification => evaluateSecEdgar8kLocalSmokeQualification(value, now).status === "APPROVED_FOR_LOCAL_SMOKE";
