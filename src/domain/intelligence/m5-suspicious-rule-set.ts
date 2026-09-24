import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";

export const M5_SUSPICIOUS_RULE_SET_CONTRACT_VERSION = "m5-suspicious-rule-set/v1" as const;
export const M5_SUSPICIOUS_RULE_SET_AUTHORITY_CONTRACT_VERSION = "m5-suspicious-rule-set-authority/v1" as const;

export type M5SuspiciousRule = Readonly<{
  ruleId: string;
  contractVersion: string;
  enabled: boolean;
  required: boolean;
  supportedAssetClasses: readonly string[];
  inputRequirements: readonly string[];
  configuration: Readonly<Record<string, unknown>>;
  evaluatorVersion: string;
  fingerprint: string;
}>;

export type M5SuspiciousRuleSetAuthority = Readonly<{
  contractVersion: typeof M5_SUSPICIOUS_RULE_SET_CONTRACT_VERSION | typeof M5_SUSPICIOUS_RULE_SET_AUTHORITY_CONTRACT_VERSION;
  ruleSetVersion: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  detectorVersion: string;
  requiredRuleIds: readonly string[];
  ruleSetAuthorityId: string;
  ruleCount: number;
  rules: readonly M5SuspiciousRule[];
  fingerprint: string;
}>;

export type M5SuspiciousRuleSetAuthorityInput = Omit<M5SuspiciousRuleSetAuthority, "fingerprint" | "ruleSetAuthorityId" | "ruleCount" | "rules"> & { readonly fingerprint?: string; readonly ruleSetAuthorityId?: string; readonly ruleCount?: number; readonly rules?: readonly M5SuspiciousRule[] };
export interface M5SuspiciousRuleSetAuthorityResolver {
  readonly resolve: (scope: Readonly<{ providerId: string; datasetId: string; datasetVersion: string; ruleSetVersion: string; detectorVersion: string }>) => Promise<M5SuspiciousRuleSetAuthority | undefined>;
}

function text(value: unknown, code: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(code); return value.trim(); }
function rules(values: readonly string[], allowEmpty = false): readonly string[] { if (!Array.isArray(values) || (!allowEmpty && values.length === 0)) throw new Error("M5_SUSPICIOUS_RULE_SET_RULES_INVALID"); const normalized = values.map(value => text(value, "M5_SUSPICIOUS_RULE_SET_RULE_INVALID")).sort((a, b) => a.localeCompare(b)); if (new Set(normalized).size !== normalized.length) throw new Error("M5_SUSPICIOUS_RULE_SET_DUPLICATE_RULE"); return Object.freeze(normalized); }
function material(input: M5SuspiciousRuleSetAuthorityInput): Omit<M5SuspiciousRuleSetAuthority, "fingerprint"> { if (input.contractVersion !== M5_SUSPICIOUS_RULE_SET_CONTRACT_VERSION && input.contractVersion !== M5_SUSPICIOUS_RULE_SET_AUTHORITY_CONTRACT_VERSION) throw new Error("M5_SUSPICIOUS_RULE_SET_CONTRACT_INVALID"); const requiredRuleIds = rules(input.requiredRuleIds); const supplied = (input as Partial<M5SuspiciousRuleSetAuthority>).rules; const normalizedRules = (supplied && supplied.length ? supplied : requiredRuleIds.map(ruleId => ({ ruleId, contractVersion: "m5-suspicious-rule/v1", enabled: true, required: true, supportedAssetClasses: [], inputRequirements: [], configuration: {}, evaluatorVersion: input.detectorVersion, fingerprint: "" }))).map(rule => { const ruleId = text(rule.ruleId, "M5_SUSPICIOUS_RULE_ID_INVALID"); if (/https?:\/\//i.test(JSON.stringify(rule.configuration)) || /[?&](token|secret|key)=/i.test(JSON.stringify(rule.configuration))) throw new Error("M5_SUSPICIOUS_RULE_CONFIGURATION_INVALID"); const normalized = { ruleId, contractVersion: text(rule.contractVersion, "M5_SUSPICIOUS_RULE_CONTRACT_INVALID"), enabled: rule.enabled === true, required: rule.required === true, supportedAssetClasses: rules(rule.supportedAssetClasses, true), inputRequirements: rules(rule.inputRequirements, true), configuration: deepFreeze({ ...(rule.configuration ?? {}) }), evaluatorVersion: text(rule.evaluatorVersion, "M5_SUSPICIOUS_RULE_EVALUATOR_INVALID"), fingerprint: "" }; return { ...normalized, fingerprint: canonicalSha256({ ...normalized, fingerprint: undefined }) }; }).sort((a, b) => a.ruleId.localeCompare(b.ruleId)); if (new Set(normalizedRules.map(rule => rule.ruleId)).size !== normalizedRules.length) throw new Error("M5_SUSPICIOUS_RULE_SET_DUPLICATE_RULE"); const finalRules = Object.freeze(normalizedRules); const finalRuleIds = Object.freeze(finalRules.filter(rule => rule.required && rule.enabled).map(rule => rule.ruleId)); if (finalRuleIds.length !== requiredRuleIds.length || finalRuleIds.some((id, index) => id !== requiredRuleIds[index])) throw new Error("M5_SUSPICIOUS_RULE_SET_REQUIRED_RULE_MISMATCH"); const authorityId = (input as Partial<M5SuspiciousRuleSetAuthority>).ruleSetAuthorityId ?? `m5-suspicious-ruleset:${canonicalSha256({ providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, ruleSetVersion: input.ruleSetVersion, detectorVersion: input.detectorVersion })}`; return { contractVersion: input.contractVersion, ruleSetVersion: text(input.ruleSetVersion, "M5_SUSPICIOUS_RULE_SET_VERSION_INVALID"), providerId: text(input.providerId, "M5_SUSPICIOUS_RULE_SET_PROVIDER_INVALID"), datasetId: text(input.datasetId, "M5_SUSPICIOUS_RULE_SET_DATASET_INVALID"), datasetVersion: text(input.datasetVersion, "M5_SUSPICIOUS_RULE_SET_DATASET_VERSION_INVALID"), detectorVersion: text(input.detectorVersion, "M5_SUSPICIOUS_RULE_SET_DETECTOR_INVALID"), requiredRuleIds, ruleSetAuthorityId: text(authorityId, "M5_SUSPICIOUS_RULE_SET_AUTHORITY_ID_INVALID"), ruleCount: finalRules.length, rules: finalRules }; }
function deepFreeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }

export function m5SuspiciousRuleSetFingerprint(input: M5SuspiciousRuleSetAuthorityInput): string { return canonicalSha256(material(input)); }
export function createM5SuspiciousRuleSetAuthority(input: M5SuspiciousRuleSetAuthorityInput): M5SuspiciousRuleSetAuthority { const value = material(input); const fingerprint = canonicalSha256(value); if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) throw new Error("M5_SUSPICIOUS_RULE_SET_FINGERPRINT_MISMATCH"); return deepFreeze({ ...value, fingerprint }); }
export function assertM5SuspiciousRuleSetAuthority(record: M5SuspiciousRuleSetAuthority): void { if (record.fingerprint !== m5SuspiciousRuleSetFingerprint(record)) throw new Error("M5_SUSPICIOUS_RULE_SET_FINGERPRINT_MISMATCH"); }

export function createM5SuspiciousRuleSetAuthorityResolver(values: readonly M5SuspiciousRuleSetAuthority[]): M5SuspiciousRuleSetAuthorityResolver {
  const records = values.map(value => { const record = createM5SuspiciousRuleSetAuthority(value); return record; });
  const key = (value: Pick<M5SuspiciousRuleSetAuthority, "providerId" | "datasetId" | "datasetVersion" | "ruleSetVersion" | "detectorVersion">) => [value.providerId, value.datasetId, value.datasetVersion, value.ruleSetVersion, value.detectorVersion].join("\u0000");
  const index = new Map<string, M5SuspiciousRuleSetAuthority>();
  for (const record of records) {
    const existing = index.get(key(record));
    if (existing && existing.fingerprint !== record.fingerprint) throw new Error("M5_SUSPICIOUS_RULE_SET_CONFLICT");
    index.set(key(record), record);
  }
  return Object.freeze({ resolve: async (scope: Parameters<M5SuspiciousRuleSetAuthorityResolver["resolve"]>[0]) => index.get(key(scope)) });
}
