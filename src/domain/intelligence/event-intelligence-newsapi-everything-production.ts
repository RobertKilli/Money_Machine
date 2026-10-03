import "server-only";
import { types } from "node:util";
import config from "../../../config/intelligence/event-intelligence-newsapi-everything.production.json";

const operations = ["acquisition", "rawArticleStorage", "metadataProcessing", "metadataPersistence", "normalizedDiscoveryPersistence", "issuerMapping", "assetMapping", "corroboration", "eventAuthority", "scheduler", "signal", "trading"] as const;
const usages = ["RAW_ACQUISITION", "RAW_ARTIFACT_STORAGE", "NORMALIZED_CLAIM_STORAGE", "AUTHORITY_ISSUANCE", "REDISTRIBUTION", "COMMERCIAL_USE", "SIGNAL_RESEARCH"] as const;
const blockers = ["PRODUCTION_PLAN_AND_ACQUISITION_NOT_APPROVED", "DEVELOPER_PLAN_NOT_ALLOWED_OUTSIDE_DEVELOPMENT", "THIRD_PARTY_ARTICLE_CONTENT_RIGHTS_UNRESOLVED", "METADATA_STORAGE_RETENTION_AND_REDISTRIBUTION_NOT_APPROVED", "NATIVE_RESPONSE_NULL_AND_RUNTIME_SCHEMA_NOT_QUALIFIED", "SOURCE_COVERAGE_COMPLETENESS_UNKNOWN", "CORRECTION_RETRACTION_LINEAGE_NOT_PROVIDED", "FRESHNESS_AND_PLAN_DEPENDENT_HISTORY"] as const;
const rootKeys = ["contractVersion", "status", "candidateStatus", "selectedSource", "credentialReference", "authenticationTransport", "operations", "usages", "rawArticleStorage", "metadataStorage", "normalizedStorage", "retention", "redistribution", "commercialUse", "blockers", "credentialReferences", "environmentReferences"] as const;
export type NewsApiEverythingProductionConfig = Readonly<{
  contractVersion: "event-intelligence-newsapi-everything-production/v1"; status: "BLOCKED_BACKEND_UNAPPROVED"; candidateStatus: "PARTIAL_DISCOVERY_ONLY";
  selectedSource: null; credentialReference: null; authenticationTransport: "X-Api-Key";
  operations: Readonly<Record<typeof operations[number], "BLOCKED">>; usages: Readonly<Record<typeof usages[number], "NOT_APPROVED">>;
  rawArticleStorage: "NOT_APPROVED"; metadataStorage: "NOT_APPROVED"; normalizedStorage: "NOT_APPROVED"; retention: "NOT_APPROVED"; redistribution: "NOT_APPROVED"; commercialUse: "NOT_APPROVED";
  blockers: readonly string[]; credentialReferences: readonly []; environmentReferences: readonly [];
}>;
function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || types.isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || own.some(k => typeof k !== "string" || !keys.includes(k))) return null;
    const out: Record<string, unknown> = Object.create(null);
    for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d || !("value" in d) || !d.enumerable) return null; out[key] = d.value; }
    return out;
  } catch { return null; }
}
function stringArray(value: unknown, expected: readonly string[]): boolean {
  if (!value || typeof value !== "object" || types.isProxy(value) || !Array.isArray(value)) return false;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false;
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (length !== expected.length || Reflect.ownKeys(value).length !== length + 1) return false;
    return expected.every((_, i) => { const d = Object.getOwnPropertyDescriptor(value, String(i)); return !!d && "value" in d && d.enumerable && d.value === expected[i]; });
  } catch { return false; }
}
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); Object.freeze(value); } return value; }
export function parseNewsApiEverythingProductionConfig(input: unknown): NewsApiEverythingProductionConfig | null {
  const v = exactObject(input, rootKeys); if (!v) return null;
  if (v.contractVersion !== "event-intelligence-newsapi-everything-production/v1" || v.status !== "BLOCKED_BACKEND_UNAPPROVED" || v.candidateStatus !== "PARTIAL_DISCOVERY_ONLY" || v.selectedSource !== null || v.credentialReference !== null || v.authenticationTransport !== "X-Api-Key") return null;
  const op = exactObject(v.operations, operations), usage = exactObject(v.usages, usages);
  if (!op || operations.some(k => op[k] !== "BLOCKED") || !usage || usages.some(k => usage[k] !== "NOT_APPROVED")) return null;
  if (["rawArticleStorage", "metadataStorage", "normalizedStorage", "retention", "redistribution", "commercialUse"].some(k => v[k] !== "NOT_APPROVED")) return null;
  if (!stringArray(v.blockers, blockers) || !stringArray(v.credentialReferences, []) || !stringArray(v.environmentReferences, [])) return null;
  return deepFreeze({ ...v, operations: { ...op }, usages: { ...usage }, blockers: [...blockers], credentialReferences: [], environmentReferences: [] }) as unknown as NewsApiEverythingProductionConfig;
}
const parsed = parseNewsApiEverythingProductionConfig(config);
if (!parsed) throw new Error("NEWSAPI_EVERYTHING_PRODUCTION_CONFIG_INVALID");
export const NEWSAPI_EVERYTHING_PRODUCTION_CONFIG = parsed;
