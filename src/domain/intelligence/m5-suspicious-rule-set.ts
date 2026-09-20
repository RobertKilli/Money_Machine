import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";

export const M5_SUSPICIOUS_RULE_SET_CONTRACT_VERSION = "m5-suspicious-rule-set/v1" as const;

export type M5SuspiciousRuleSetAuthority = Readonly<{
  contractVersion: typeof M5_SUSPICIOUS_RULE_SET_CONTRACT_VERSION;
  ruleSetVersion: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  detectorVersion: string;
  requiredRuleIds: readonly string[];
  fingerprint: string;
}>;

export type M5SuspiciousRuleSetAuthorityInput = Omit<M5SuspiciousRuleSetAuthority, "fingerprint"> & { readonly fingerprint?: string };
export interface M5SuspiciousRuleSetAuthorityResolver {
  readonly resolve: (scope: Readonly<{ providerId: string; datasetId: string; datasetVersion: string; ruleSetVersion: string; detectorVersion: string }>) => Promise<M5SuspiciousRuleSetAuthority | undefined>;
}

function text(value: unknown, code: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(code); return value.trim(); }
function rules(values: readonly string[]): readonly string[] { if (!Array.isArray(values) || values.length === 0) throw new Error("M5_SUSPICIOUS_RULE_SET_RULES_INVALID"); const normalized = values.map(value => text(value, "M5_SUSPICIOUS_RULE_SET_RULE_INVALID")).sort((a, b) => a.localeCompare(b)); if (new Set(normalized).size !== normalized.length) throw new Error("M5_SUSPICIOUS_RULE_SET_DUPLICATE_RULE"); return Object.freeze(normalized); }
function material(input: M5SuspiciousRuleSetAuthorityInput): Omit<M5SuspiciousRuleSetAuthority, "fingerprint"> { if (input.contractVersion !== M5_SUSPICIOUS_RULE_SET_CONTRACT_VERSION) throw new Error("M5_SUSPICIOUS_RULE_SET_CONTRACT_INVALID"); return { contractVersion: input.contractVersion, ruleSetVersion: text(input.ruleSetVersion, "M5_SUSPICIOUS_RULE_SET_VERSION_INVALID"), providerId: text(input.providerId, "M5_SUSPICIOUS_RULE_SET_PROVIDER_INVALID"), datasetId: text(input.datasetId, "M5_SUSPICIOUS_RULE_SET_DATASET_INVALID"), datasetVersion: text(input.datasetVersion, "M5_SUSPICIOUS_RULE_SET_DATASET_VERSION_INVALID"), detectorVersion: text(input.detectorVersion, "M5_SUSPICIOUS_RULE_SET_DETECTOR_INVALID"), requiredRuleIds: rules(input.requiredRuleIds) }; }
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
