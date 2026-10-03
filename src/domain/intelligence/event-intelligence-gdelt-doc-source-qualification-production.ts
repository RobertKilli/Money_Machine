import "server-only";
import config from "../../../config/intelligence/event-intelligence-gdelt-doc-source-qualification.production.json";
import { types } from "node:util";

const operationKeys = ["acquisition", "metadataProcessing", "rawContentStorage", "metadataPersistence", "normalizedDiscoveryPersistence", "issuerMapping", "assetMapping", "corroboration", "eventAuthority", "scheduler", "signal", "trading"] as const;
const usageKeys = ["rawAcquisition", "metadataProcessing", "metadataStorage", "normalizedStorage", "authorityPersistence", "redistribution", "commercialUse"] as const;
const blockerSet = ["DOC_JSON_NATIVE_FIELD_SCHEMA_NOT_PINNED", "LIVE_COVERAGE_COMPLETENESS_NOT_PROVEN", "CURRENT_FRESHNESS_AND_LATENCY_NOT_PINNED", "CORRECTION_AND_RETRACTION_LINEAGE_NOT_PROVIDED", "ARTICLE_CONTENT_RIGHTS_NOT_ESTABLISHED_BY_GDELT_METADATA_TERMS", "ACQUISITION_AND_ALL_STORAGE_APPROVALS_NOT_APPROVED"] as const;
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { for (const child of Object.values(v as Record<string, unknown>)) freeze(child); Object.freeze(v); } return v; };
function object(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
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
function stringArray(value: unknown): string[] | null {
  if (!value || typeof value !== "object" || types.isProxy(value) || !Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > 16 || Reflect.ownKeys(value).length !== length + 1) return null;
    const items: string[] = [];
    for (let i = 0; i < length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d || !("value" in d) || !d.enumerable || typeof d.value !== "string") return null; items.push(d.value); }
    return items;
  } catch { return null; }
}
export type GdeltDocProductionConfig = Readonly<{
  contractVersion: "event-intelligence-gdelt-doc-source-qualification-production/v1"; status: "BLOCKED_BACKEND_UNAPPROVED";
  candidateStatus: "PARTIAL_DISCOVERY_ONLY"; selectedSource: null; operations: Readonly<Record<typeof operationKeys[number], "BLOCKED">>;
  usages: Readonly<Record<typeof usageKeys[number], "NOT_APPROVED">>; retention: "NOT_APPROVED"; redistribution: "NOT_APPROVED";
  commercialUse: "NOT_APPROVED"; credentialReferences: readonly []; environmentReferences: readonly []; blockers: readonly string[];
}>;
export function parseGdeltDocProductionConfig(input: unknown): GdeltDocProductionConfig | null {
  const v = object(input, ["contractVersion", "status", "candidateStatus", "selectedSource", "operations", "usages", "retention", "redistribution", "commercialUse", "credentialReferences", "environmentReferences", "blockers"]);
  if (!v || v.contractVersion !== "event-intelligence-gdelt-doc-source-qualification-production/v1" || v.status !== "BLOCKED_BACKEND_UNAPPROVED" || v.candidateStatus !== "PARTIAL_DISCOVERY_ONLY" || v.selectedSource !== null || v.retention !== "NOT_APPROVED" || v.redistribution !== "NOT_APPROVED" || v.commercialUse !== "NOT_APPROVED") return null;
  const operations = object(v.operations, operationKeys), usages = object(v.usages, usageKeys);
  if (!operations || operationKeys.some(k => operations[k] !== "BLOCKED") || !usages || usageKeys.some(k => usages[k] !== "NOT_APPROVED")) return null;
  const credentials = stringArray(v.credentialReferences), environment = stringArray(v.environmentReferences), blockers = stringArray(v.blockers);
  if (!credentials || credentials.length !== 0 || !environment || environment.length !== 0 || !blockers || blockers.length !== blockerSet.length || blockers.some((x, i) => x !== blockerSet[i])) return null;
  return freeze({ ...v, operations, usages, credentialReferences: [], environmentReferences: [], blockers: [...blockerSet] }) as unknown as GdeltDocProductionConfig;
}
const parsed = parseGdeltDocProductionConfig(config);
if (!parsed) throw new Error("GDELT_DOC_PRODUCTION_CONFIG_INVALID");
export const GDELT_DOC_PRODUCTION_CONFIG = parsed;
