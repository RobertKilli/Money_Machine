import { createHash } from "node:crypto";
import {
  M5_PROVIDER_CAPABILITIES,
  M5_PROVIDER_USAGES,
  parseM5ProviderReadinessConfig,
  type M5ProviderCapability,
  type M5ProviderUsage,
  type ProviderReadinessConfig,
  type ProviderReadinessEvaluation,
} from "./m5-provider-readiness";

export const M5_PROVIDER_READINESS_AGGREGATE_VERSION = "m5-provider-readiness-aggregate/v1" as const;
export const M5_AGGREGATE_CAPABILITIES = M5_PROVIDER_CAPABILITIES;
export const M5_AGGREGATE_USAGES = [
  "PROVIDER_ACCESS",
  "RAW_PAYLOAD_PROCESSING",
  "RAW_STORAGE",
  "NORMALIZED_STORAGE",
  "AUTHORITY_PERSISTENCE",
  "RETENTION",
  "REDISTRIBUTION",
  "COMMERCIAL_USE",
] as const;
export type M5AggregateUsage = typeof M5_AGGREGATE_USAGES[number];
export type M5AggregateApproval = "APPROVED" | "REQUIRES_APPROVAL" | "REJECTED" | "EXPIRED" | "UNKNOWN";
export type M5AggregateMode = "ALL_OF";

export type M5AggregateSource = Readonly<{
  sourceId: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  readinessConfigId: string;
  readinessConfigFingerprint: string;
  capabilities: readonly M5ProviderCapability[];
  usages: readonly M5ProviderUsage[];
}>;

export type M5AggregateSourceReference = M5AggregateSource & Readonly<{
  readinessResultId: string;
  readinessResultFingerprint: string;
}>;

export type M5AggregateCapabilityAssignment = Readonly<{
  capability: M5ProviderCapability;
  mode: M5AggregateMode;
  sourceIds: readonly string[];
}>;

export type M5AggregateUsageDecision = Readonly<{
  sourceId: string;
  usage: M5AggregateUsage;
  approval: M5AggregateApproval;
  reviewedAt: string;
  reviewReference: string;
  approvalExpiresAt?: string;
}>;

export type M5ProviderReadinessAggregateConfig = Readonly<{
  contractVersion: typeof M5_PROVIDER_READINESS_AGGREGATE_VERSION;
  aggregateId: string;
  reviewedAt: string;
  reviewReference: string;
  sources: readonly M5AggregateSource[];
  capabilityAssignments: readonly M5AggregateCapabilityAssignment[];
  usageDecisions: readonly M5AggregateUsageDecision[];
}>;

export type M5AggregateBlockerCode =
  | "M5_AGGREGATE_SOURCE_MISSING"
  | "M5_AGGREGATE_SOURCE_UNUSED"
  | "M5_AGGREGATE_SOURCE_NOT_AUTHENTIC"
  | "M5_AGGREGATE_SOURCE_SCOPE_MISMATCH"
  | "M5_AGGREGATE_SOURCE_READINESS_BLOCKED"
  | "M5_AGGREGATE_CAPABILITY_NOT_DECLARED"
  | "M5_AGGREGATE_CAPABILITY_NOT_SUPPORTED"
  | "M5_AGGREGATE_CAPABILITY_INCOMPLETE"
  | "M5_AGGREGATE_USAGE_REQUIRES_APPROVAL"
  | "M5_AGGREGATE_USAGE_NOT_APPROVED"
  | "M5_AGGREGATE_USAGE_EXPIRED"
  | "M5_AGGREGATE_CONFIG_INVALID";

export type M5ProviderReadinessAggregateResult = Readonly<{
  contractVersion: typeof M5_PROVIDER_READINESS_AGGREGATE_VERSION;
  result: "READY" | "BLOCKED" | "INVALID";
  aggregateId: string;
  aggregateFingerprint: string;
  aggregateResultId: string;
  aggregateResultFingerprint: string;
  validUntil?: string;
  sources: readonly M5AggregateSourceReference[];
  capabilityAssignments: readonly M5AggregateCapabilityAssignment[];
  usageDecisions: readonly M5AggregateUsageDecision[];
  blockers: readonly M5AggregateBlockerCode[];
}>;

const SECRET = /(?:api[-_]?key|authorization|cookie|credential|password|secret|token|private[-_]?key|raw[-_]?payload|terms[-_]?text)/i;
const URLISH = /(?:https?:\/\/|[?#])/i;
const ID = /^[a-z0-9][a-z0-9._:/-]{0,255}$/;
const SHA = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const cmp = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const canonicalJson = (value: unknown): string => JSON.stringify(canonical(value));
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort(cmp).map(key => [key, canonical((value as Record<string, unknown>)[key])]));
  return value;
}

function assertDataTree(value: unknown, path = "root", seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) throw new Error("M5_AGGREGATE_CYCLIC_VALUE_REJECTED");
  seen.add(value);
  if (Object.getOwnPropertySymbols(value).length) throw new Error("M5_AGGREGATE_SYMBOL_FIELD");
  if (Array.isArray(value)) {
    const ownKeys = Object.getOwnPropertyNames(value);
    if (ownKeys.length !== value.length + 1 || ownKeys.some(key => key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) throw new Error("M5_AGGREGATE_ARRAY_PROPERTY_REJECTED");
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("M5_AGGREGATE_ACCESSOR_REJECTED");
      assertDataTree(descriptor.value, `${path}[${index}]`, seen);
    }
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("M5_AGGREGATE_NON_PLAIN_OBJECT");
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !("value" in descriptor)) throw new Error("M5_AGGREGATE_ACCESSOR_REJECTED");
    assertDataTree(descriptor.value, `${path}.${key}`, seen);
  }
}
function exact(value: Record<string, unknown>, fields: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) throw new Error(SECRET.test(key) ? "M5_AGGREGATE_SECRET_FIELD_REJECTED" : "M5_AGGREGATE_UNKNOWN_FIELD");
  }
}
function str(value: unknown): string {
  if (typeof value !== "string" || value.trim() !== value || !value || value.length > 256 || SECRET.test(value) || URLISH.test(value)) throw new Error("M5_AGGREGATE_TEXT_INVALID");
  return value;
}
function id(value: unknown): string {
  const result = str(value);
  if (!ID.test(result)) throw new Error("M5_AGGREGATE_ID_INVALID");
  return result;
}
function fingerprint(value: unknown): string {
  if (typeof value !== "string" || !SHA.test(value)) throw new Error("M5_AGGREGATE_FINGERPRINT_INVALID");
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !UTC.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error("M5_AGGREGATE_TIMESTAMP_INVALID");
  return value;
}
function enumArray<T extends string>(value: unknown, allowed: readonly T[], code: string, allowEmpty = false): readonly T[] {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.some(item => typeof item !== "string" || !allowed.includes(item as T))) throw new Error(code);
  const result = [...value] as T[];
  if (new Set(result).size !== result.length) throw new Error(code);
  return Object.freeze(result.sort(cmp));
}

function parseSource(value: unknown): M5AggregateSource {
  const row = value as Record<string, unknown>;
  exact(row, ["sourceId", "providerId", "datasetId", "datasetVersion", "readinessConfigId", "readinessConfigFingerprint", "capabilities", "usages"]);
  const providerId = id(row.providerId); const datasetId = id(row.datasetId); const datasetVersion = id(row.datasetVersion);
  const readinessConfigFingerprint = fingerprint(row.readinessConfigFingerprint);
  const expectedConfigId = `m5-provider-readiness-config:${readinessConfigFingerprint}`;
  const readinessConfigId = id(row.readinessConfigId);
  if (readinessConfigId !== expectedConfigId) throw new Error("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
  const expectedSourceId = `m5-provider-source:${digest({ providerId, datasetId, datasetVersion, readinessConfigFingerprint })}`;
  const sourceId = id(row.sourceId);
  if (sourceId !== expectedSourceId) throw new Error("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
  return freeze({ sourceId, providerId, datasetId, datasetVersion, readinessConfigId, readinessConfigFingerprint,
    capabilities: enumArray(row.capabilities, M5_PROVIDER_CAPABILITIES, "M5_AGGREGATE_SOURCE_CAPABILITIES_INVALID"),
    usages: enumArray(row.usages, M5_PROVIDER_USAGES, "M5_AGGREGATE_SOURCE_USAGES_INVALID") });
}
function parseAssignment(value: unknown): M5AggregateCapabilityAssignment {
  const row = value as Record<string, unknown>;
  exact(row, ["capability", "mode", "sourceIds"]);
  if (typeof row.capability !== "string" || !M5_PROVIDER_CAPABILITIES.includes(row.capability as M5ProviderCapability)) throw new Error("M5_AGGREGATE_CAPABILITY_INVALID");
  if (row.mode !== "ALL_OF") throw new Error("M5_AGGREGATE_MODE_INVALID");
  const sourceIds = Array.isArray(row.sourceIds) ? row.sourceIds.map(id).sort(cmp) : (() => { throw new Error("M5_AGGREGATE_ASSIGNMENT_SOURCES_INVALID"); })();
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error("M5_AGGREGATE_DUPLICATE_ASSIGNMENT_SOURCE");
  return freeze({ capability: row.capability as M5ProviderCapability, mode: "ALL_OF", sourceIds: Object.freeze(sourceIds) });
}
function parseUsageDecision(value: unknown): M5AggregateUsageDecision {
  const row = value as Record<string, unknown>;
  exact(row, ["sourceId", "usage", "approval", "reviewedAt", "reviewReference", "approvalExpiresAt"]);
  if (typeof row.usage !== "string" || !M5_AGGREGATE_USAGES.includes(row.usage as M5AggregateUsage)) throw new Error("M5_AGGREGATE_USAGE_INVALID");
  const approval = row.approval;
  if (typeof approval !== "string" || !["APPROVED", "REQUIRES_APPROVAL", "REJECTED", "EXPIRED", "UNKNOWN"].includes(approval)) throw new Error("M5_AGGREGATE_APPROVAL_INVALID");
  const reviewedAt = timestamp(row.reviewedAt);
  const approvalExpiresAt = row.approvalExpiresAt === undefined ? undefined : timestamp(row.approvalExpiresAt);
  if (approval === "APPROVED" && (!approvalExpiresAt || approvalExpiresAt <= reviewedAt)) throw new Error("M5_AGGREGATE_APPROVAL_EXPIRY_REQUIRED");
  return freeze({ sourceId: id(row.sourceId), usage: row.usage as M5AggregateUsage, approval: approval as M5AggregateApproval, reviewedAt,
    reviewReference: id(row.reviewReference), ...(approvalExpiresAt ? { approvalExpiresAt } : {}) });
}

export function parseM5ProviderReadinessAggregateConfig(input: unknown): M5ProviderReadinessAggregateConfig {
  assertDataTree(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("M5_AGGREGATE_CONFIG_INVALID");
  const root = input as Record<string, unknown>;
  exact(root, ["contractVersion", "aggregateId", "reviewedAt", "reviewReference", "sources", "capabilityAssignments", "usageDecisions"]);
  if (root.contractVersion !== M5_PROVIDER_READINESS_AGGREGATE_VERSION) throw new Error("M5_AGGREGATE_VERSION_INVALID");
  if (!Array.isArray(root.sources) || !root.sources.length) throw new Error("M5_AGGREGATE_SOURCES_INVALID");
  if (!Array.isArray(root.capabilityAssignments) || !Array.isArray(root.usageDecisions)) throw new Error("M5_AGGREGATE_CONFIG_INVALID");
  const sources = root.sources.map(parseSource).sort((a, b) => cmp(a.sourceId, b.sourceId));
  if (new Set(sources.map(source => source.sourceId)).size !== sources.length) throw new Error("M5_AGGREGATE_DUPLICATE_SOURCE");
  const assignments = root.capabilityAssignments.map(parseAssignment).sort((a, b) => cmp(a.capability, b.capability));
  if (new Set(assignments.map(item => item.capability)).size !== assignments.length) throw new Error("M5_AGGREGATE_DUPLICATE_CAPABILITY_ASSIGNMENT");
  if (assignments.length !== M5_PROVIDER_CAPABILITIES.length || assignments.some((item, index) => item.capability !== [...M5_PROVIDER_CAPABILITIES].sort(cmp)[index])) throw new Error("M5_AGGREGATE_CAPABILITY_COVERAGE_INVALID");
  const usages = root.usageDecisions.map(parseUsageDecision).sort((a, b) => cmp(`${a.sourceId}:${a.usage}`, `${b.sourceId}:${b.usage}`));
  if (new Set(usages.map(item => `${item.sourceId}:${item.usage}`)).size !== usages.length) throw new Error("M5_AGGREGATE_DUPLICATE_USAGE_DECISION");
  const expectedUsageKeys = sources.flatMap(source => M5_AGGREGATE_USAGES.map(usage => `${source.sourceId}:${usage}`)).sort(cmp);
  if (JSON.stringify(usages.map(item => `${item.sourceId}:${item.usage}`)) !== JSON.stringify(expectedUsageKeys)) throw new Error("M5_AGGREGATE_USAGE_COVERAGE_INVALID");
  if (usages.some(item => !sources.some(source => source.sourceId === item.sourceId))) throw new Error("M5_AGGREGATE_USAGE_SCOPE_MISMATCH");
  return freeze({ contractVersion: M5_PROVIDER_READINESS_AGGREGATE_VERSION, aggregateId: id(root.aggregateId), reviewedAt: timestamp(root.reviewedAt),
    reviewReference: id(root.reviewReference), sources: Object.freeze(sources), capabilityAssignments: Object.freeze(assignments), usageDecisions: Object.freeze(usages) });
}

export function m5ProviderReadinessConfigIdentity(input: unknown): Readonly<{ readinessConfigId: string; readinessConfigFingerprint: string }> {
  const config = parseM5ProviderReadinessConfig(input);
  const readinessConfigFingerprint = digest(config);
  return freeze({ readinessConfigId: `m5-provider-readiness-config:${readinessConfigFingerprint}`, readinessConfigFingerprint });
}

export function m5ProviderReadinessEvaluationIdentity(evaluation: ProviderReadinessEvaluation): Readonly<{ readinessResultId: string; readinessResultFingerprint: string }> {
  const material = Object.fromEntries(Object.entries(evaluation).filter(([key]) => key !== "evaluatedAt"));
  const readinessResultFingerprint = digest(material);
  return freeze({ readinessResultId: `m5-provider-readiness-result:${readinessResultFingerprint}`, readinessResultFingerprint });
}

export function m5ProviderReadinessAggregateFingerprint(config: M5ProviderReadinessAggregateConfig): string {
  return digest({ contractVersion: config.contractVersion, aggregateId: config.aggregateId, reviewedAt: config.reviewedAt, reviewReference: config.reviewReference,
    sources: config.sources, capabilityAssignments: config.capabilityAssignments, usageDecisions: config.usageDecisions });
}

export type M5AggregateSourceBinding = Readonly<{ config: unknown; evaluation: ProviderReadinessEvaluation }>;
export type M5AggregateSourceRuntime = Readonly<{ source: M5AggregateSource; config: ProviderReadinessConfig; evaluation: ProviderReadinessEvaluation; readinessResultId: string; readinessResultFingerprint: string }>;

export function verifyAggregateSourceBinding(source: M5AggregateSource, binding: M5AggregateSourceBinding,
  isTrusted: (value: ProviderReadinessEvaluation) => boolean,
  reevaluate: (config: ProviderReadinessConfig, evaluation: ProviderReadinessEvaluation) => ProviderReadinessEvaluation): M5AggregateSourceRuntime {
  if (!isTrusted(binding.evaluation)) throw new Error("M5_AGGREGATE_SOURCE_NOT_AUTHENTIC");
  const config = parseM5ProviderReadinessConfig(binding.config);
  const identity = m5ProviderReadinessConfigIdentity(config);
  if (config.providerId !== source.providerId || config.datasetId !== source.datasetId || config.datasetVersion !== source.datasetVersion ||
      identity.readinessConfigId !== source.readinessConfigId || identity.readinessConfigFingerprint !== source.readinessConfigFingerprint ||
      JSON.stringify(config.capabilities.map(item => item.capability)) !== JSON.stringify(source.capabilities)) throw new Error("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
  const evaluation = binding.evaluation;
  if (evaluation.providerId !== source.providerId || evaluation.datasetId !== source.datasetId || evaluation.datasetVersion !== source.datasetVersion ||
      JSON.stringify(evaluation.requestedUsages) !== JSON.stringify(source.usages)) throw new Error("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
  const repeated = reevaluate(config, evaluation);
  if (canonicalJson(repeated) !== canonicalJson(evaluation)) throw new Error("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
  const resultIdentity = m5ProviderReadinessEvaluationIdentity(evaluation);
  return freeze({ source, config, evaluation, ...resultIdentity });
}
