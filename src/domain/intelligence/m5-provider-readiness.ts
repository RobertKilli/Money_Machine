import { normalizeIngestionTimestamp } from "./ingestion-provenance";

export const M5_PROVIDER_READINESS_CONFIG_VERSION = "m5-provider-readiness-config/v1" as const;

export const M5_PROVIDER_CAPABILITIES = [
  "DAILY_CLOSE_SERIES",
  "MARKET_CAP",
  "VOLUME_24H",
  "LIQUIDITY_COMPLETE_SET",
  "CONTRACT_VERIFICATION",
  "HOLDER_COMPLETE_UNIVERSE",
  "HOLDER_FINALITY",
  "VENUE_COMPLETE_UNIVERSE",
  "SUSPICIOUS_REQUIRED_INPUTS",
  "SUSPICIOUS_RULE_COVERAGE",
  "CANONICAL_ASSET_IDENTITY",
] as const;
export type M5ProviderCapability = typeof M5_PROVIDER_CAPABILITIES[number];
export type M5CapabilityStatus = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "UNKNOWN";
export type M5ApprovalStatus = "APPROVED" | "REQUIRES_APPROVAL" | "REJECTED" | "EXPIRED";
export type M5ProviderUsage = "NETWORK_ACQUISITION" | "RAW_PAYLOAD_PROCESSING" | "RAW_PAYLOAD_STORAGE" | "NORMALIZED_STORAGE" | "AUTHORITY_PERSISTENCE" | "REDISTRIBUTION" | "COMMERCIAL_USE";
export type M5Completeness = "COMPLETE" | "PARTIAL" | "SAMPLE" | "TOP_N_ONLY" | "UNKNOWN";
export type M5ReadinessResult = "READY" | "BLOCKED" | "INVALID";

export const M5_PROVIDER_USAGES = ["AUTHORITY_PERSISTENCE", "COMMERCIAL_USE", "NETWORK_ACQUISITION", "NORMALIZED_STORAGE", "RAW_PAYLOAD_PROCESSING", "RAW_PAYLOAD_STORAGE", "REDISTRIBUTION"] as const satisfies readonly M5ProviderUsage[];

export type ProviderCapabilityDecision = Readonly<{
  capability: M5ProviderCapability;
  status: M5CapabilityStatus;
  completeness: M5Completeness;
  reviewedAt: string;
  reviewReference: string;
  documentationUrls: readonly string[];
  termsUrls: readonly string[];
  limitations: readonly string[];
  zeroVenuePolicy?: "ALLOWED_EMPTY" | "NONEMPTY_REQUIRED" | "UNKNOWN";
}>;

export type ProviderUsageDecision = Readonly<{
  usage: M5ProviderUsage;
  approval: M5ApprovalStatus;
  reviewedAt: string;
  reviewReference: string;
  limitations: readonly string[];
}>;

export type ProviderReadinessMetadata = Readonly<{
  sourceKind?: "OFFICIAL_DOCUMENTATION" | "SYNTHETIC_FIXTURE";
  reviewer?: string;
  policyVersion?: string;
}>;

export type ProviderDatasetReadiness = Readonly<{
  configVersion: typeof M5_PROVIDER_READINESS_CONFIG_VERSION;
  providerNamespace: string;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  reviewedAt: string;
  reviewReference: string;
  documentationUrls: readonly string[];
  termsUrls: readonly string[];
  capabilities: readonly ProviderCapabilityDecision[];
  usageDecisions: readonly ProviderUsageDecision[];
  limitations: readonly string[];
  approvalExpiresAt?: string;
  metadata?: ProviderReadinessMetadata;
}>;

export type ProviderReadinessConfig = ProviderDatasetReadiness;
export type ProviderCapabilityRequirement = Readonly<{ capability: M5ProviderCapability; completeness: "ANY" | "COMPLETE" }>;

export type M5ReadinessBlockerCode =
  | "M5_READINESS_CONFIG_INVALID"
  | "M5_READINESS_SCOPE_MISMATCH"
  | "M5_READINESS_CAPABILITY_MISSING"
  | "M5_READINESS_CAPABILITY_NOT_SUPPORTED"
  | "M5_READINESS_CAPABILITY_INCOMPLETE"
  | "M5_READINESS_USAGE_MISSING"
  | "M5_READINESS_USAGE_REQUIRES_APPROVAL"
  | "M5_READINESS_USAGE_REJECTED"
  | "M5_READINESS_USAGE_EXPIRED"
  | "M5_READINESS_ZERO_VENUE_UNDECIDED"
  | "M5_READINESS_HOLDER_FINALITY_UNPROVEN"
  | "M5_READINESS_SUSPICIOUS_COVERAGE_INCOMPLETE"
  | "M5_READINESS_RAW_STORAGE_NOT_APPROVED"
  | "M5_READINESS_COMMERCIAL_USE_NOT_APPROVED"
  | "M5_READINESS_REDISTRIBUTION_NOT_APPROVED"
  | "M5_READINESS_INVALID_REQUIREMENTS";

export type ProviderReadinessBlocker = Readonly<{
  code: M5ReadinessBlockerCode;
  capability?: M5ProviderCapability;
  usage?: M5ProviderUsage;
}>;

export type ProviderReadinessEvaluation = Readonly<{
  result: M5ReadinessResult;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  evaluatedAt: string;
  requiredCapabilities: readonly ProviderCapabilityRequirement[];
  requestedUsages: readonly M5ProviderUsage[];
  blockers: readonly ProviderReadinessBlocker[];
}>;
export type ProviderReadinessScope = Readonly<{ providerId: string; datasetId: string; datasetVersion: string }>;
export type ProviderReadinessExecutionRequest = Readonly<ProviderReadinessScope & {
  requiredCapabilities: readonly ProviderCapabilityRequirement[];
  requestedUsages: readonly M5ProviderUsage[];
}>;

type Obj = Record<string, unknown>;
const SHA_SAFE_FIELD = /(?:api[-_]?key|authorization|cookie|credential|password|secret|token|private[-_]?key|raw[-_]?payload|terms[-_]?text)/i;
const ID = /^[a-z0-9][a-z0-9._:/-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CAPABILITY_SET = new Set<string>(M5_PROVIDER_CAPABILITIES);
const USAGE_SET = new Set<string>(M5_PROVIDER_USAGES);
const CAPABILITY_STATUS = new Set<M5CapabilityStatus>(["SUPPORTED", "PARTIAL", "UNSUPPORTED", "UNKNOWN"]);
const APPROVAL_STATUS = new Set<M5ApprovalStatus>(["APPROVED", "REQUIRES_APPROVAL", "REJECTED", "EXPIRED"]);
const COMPLETENESS = new Set<M5Completeness>(["COMPLETE", "PARTIAL", "SAMPLE", "TOP_N_ONLY", "UNKNOWN"]);
const trustedEvaluations = new WeakSet<object>();

const compareLexical = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Obj)) deepFreeze(child);
  }
  return value;
};

const asObject = (value: unknown, code: string): Obj => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(code);
  return value as Obj;
};

const exact = (value: Obj, allowed: readonly string[], code: string): void => {
  const keys = new Set(allowed);
  const unknown = Object.keys(value).find(key => !keys.has(key));
  if (unknown) throw new Error(SHA_SAFE_FIELD.test(unknown) ? "M5_PROVIDER_READINESS_SECRET_FIELD_REJECTED" : code);
  if (Object.getOwnPropertySymbols(value).length > 0) throw new Error(code);
};

const text = (value: unknown, code: string, max = 512): string => {
  if (typeof value !== "string" || value.trim() !== value || !value || value.length > max || SHA_SAFE_FIELD.test(value)) throw new Error(code);
  return value;
};

const id = (value: unknown, code: string): string => {
  const result = text(value, code, 256);
  if (!ID.test(result)) throw new Error(code);
  return result;
};

const timestamp = (value: unknown, code: string): string => {
  if (typeof value !== "string" || !ISO.test(value)) throw new Error(code);
  try { return normalizeIngestionTimestamp(value, code); } catch { throw new Error(code); }
};

const url = (value: unknown, code: string): string => {
  if (typeof value !== "string" || value.trim() !== value || !value || value.length > 2048) throw new Error(code);
  const raw = value;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error(code); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("M5_PROVIDER_READINESS_URL_UNSAFE");
  return raw;
};

const stringArray = (value: unknown, code: string, maxItems = 32): readonly string[] => {
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(code);
  const values = value.map(item => text(item, code, 2048));
  if (new Set(values).size !== values.length) throw new Error(code);
  return Object.freeze([...values].sort(compareLexical));
};

const urlArray = (value: unknown, code: string): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error(code);
  const values = value.map(item => {
    try { return url(item, code); } catch (error) { if (error instanceof Error && error.message === "M5_PROVIDER_READINESS_URL_UNSAFE") throw error; throw new Error(code); }
  });
  if (new Set(values).size !== values.length) throw new Error(code);
  return Object.freeze([...values].sort(compareLexical));
};

const limitations = (value: unknown): readonly string[] => stringArray(value, "M5_PROVIDER_READINESS_LIMITATIONS_INVALID", 16);

function parseCapability(value: unknown): ProviderCapabilityDecision {
  const item = asObject(value, "M5_PROVIDER_READINESS_CAPABILITY_INVALID");
  exact(item, ["capability", "status", "completeness", "reviewedAt", "reviewReference", "documentationUrls", "termsUrls", "limitations", "zeroVenuePolicy"], "M5_PROVIDER_READINESS_CAPABILITY_UNKNOWN_FIELD");
  if (typeof item.capability !== "string" || !CAPABILITY_SET.has(item.capability)) throw new Error("M5_PROVIDER_READINESS_CAPABILITY_INVALID");
  if (typeof item.status !== "string" || !CAPABILITY_STATUS.has(item.status as M5CapabilityStatus)) throw new Error("M5_PROVIDER_READINESS_CAPABILITY_STATUS_INVALID");
  if (typeof item.completeness !== "string" || !COMPLETENESS.has(item.completeness as M5Completeness)) throw new Error("M5_PROVIDER_READINESS_COMPLETENESS_INVALID");
  const reviewedAt = timestamp(item.reviewedAt, "M5_PROVIDER_READINESS_REVIEWED_AT_INVALID");
  const reviewReference = id(item.reviewReference, "M5_PROVIDER_READINESS_REVIEW_REFERENCE_INVALID");
  const documentationUrls = urlArray(item.documentationUrls, "M5_PROVIDER_READINESS_DOCUMENTATION_URLS_INVALID");
  const termsUrls = urlArray(item.termsUrls, "M5_PROVIDER_READINESS_TERMS_URLS_INVALID");
  const parsedLimitations = limitations(item.limitations);
  if (item.completeness === "COMPLETE" && parsedLimitations.some(value => /top[- ]?n|sample|partial/i.test(value))) throw new Error("M5_PROVIDER_READINESS_COMPLETENESS_CONFLICT");
  if (item.capability === "VENUE_COMPLETE_UNIVERSE" && item.zeroVenuePolicy !== "ALLOWED_EMPTY" && item.zeroVenuePolicy !== "NONEMPTY_REQUIRED" && item.zeroVenuePolicy !== "UNKNOWN") throw new Error("M5_PROVIDER_READINESS_ZERO_VENUE_POLICY_REQUIRED");
  const result = { capability: item.capability as M5ProviderCapability, status: item.status as M5CapabilityStatus, completeness: item.completeness as M5Completeness, reviewedAt, reviewReference, documentationUrls, termsUrls, limitations: parsedLimitations, ...(item.zeroVenuePolicy === undefined ? {} : { zeroVenuePolicy: item.zeroVenuePolicy as "ALLOWED_EMPTY" | "NONEMPTY_REQUIRED" | "UNKNOWN" }) };
  return deepFreeze(result);
}

function parseUsage(value: unknown): ProviderUsageDecision {
  const item = asObject(value, "M5_PROVIDER_READINESS_USAGE_INVALID");
  exact(item, ["usage", "approval", "reviewedAt", "reviewReference", "limitations"], "M5_PROVIDER_READINESS_USAGE_UNKNOWN_FIELD");
  if (typeof item.usage !== "string" || !USAGE_SET.has(item.usage)) throw new Error("M5_PROVIDER_READINESS_USAGE_INVALID");
  if (typeof item.approval !== "string" || !APPROVAL_STATUS.has(item.approval as M5ApprovalStatus)) throw new Error("M5_PROVIDER_READINESS_APPROVAL_INVALID");
  const result = { usage: item.usage as M5ProviderUsage, approval: item.approval as M5ApprovalStatus, reviewedAt: timestamp(item.reviewedAt, "M5_PROVIDER_READINESS_REVIEWED_AT_INVALID"), reviewReference: id(item.reviewReference, "M5_PROVIDER_READINESS_REVIEW_REFERENCE_INVALID"), limitations: limitations(item.limitations) };
  return deepFreeze(result);
}

export function parseM5ProviderReadinessConfig(input: unknown): ProviderReadinessConfig {
  const root = asObject(input, "M5_PROVIDER_READINESS_CONFIG_INVALID");
  exact(root, ["configVersion", "providerNamespace", "providerId", "datasetId", "datasetVersion", "reviewedAt", "reviewReference", "documentationUrls", "termsUrls", "capabilities", "usageDecisions", "limitations", "approvalExpiresAt", "metadata"], "M5_PROVIDER_READINESS_CONFIG_UNKNOWN_FIELD");
  if (root.configVersion !== M5_PROVIDER_READINESS_CONFIG_VERSION) throw new Error("M5_PROVIDER_READINESS_CONFIG_VERSION_INVALID");
  const providerNamespace = id(root.providerNamespace, "M5_PROVIDER_READINESS_PROVIDER_NAMESPACE_INVALID");
  const providerId = id(root.providerId, "M5_PROVIDER_READINESS_PROVIDER_ID_INVALID");
  const datasetId = id(root.datasetId, "M5_PROVIDER_READINESS_DATASET_ID_INVALID");
  const datasetVersion = id(root.datasetVersion, "M5_PROVIDER_READINESS_DATASET_VERSION_INVALID");
  const reviewedAt = timestamp(root.reviewedAt, "M5_PROVIDER_READINESS_REVIEWED_AT_INVALID");
  const reviewReference = id(root.reviewReference, "M5_PROVIDER_READINESS_REVIEW_REFERENCE_INVALID");
  const documentationUrls = urlArray(root.documentationUrls, "M5_PROVIDER_READINESS_DOCUMENTATION_URLS_INVALID");
  const termsUrls = urlArray(root.termsUrls, "M5_PROVIDER_READINESS_TERMS_URLS_INVALID");
  if (!Array.isArray(root.capabilities) || root.capabilities.length === 0) throw new Error("M5_PROVIDER_READINESS_CAPABILITIES_INVALID");
  const capabilities = root.capabilities.map(parseCapability).sort((a, b) => compareLexical(a.capability, b.capability));
  if (new Set(capabilities.map(item => item.capability)).size !== capabilities.length) throw new Error("M5_PROVIDER_READINESS_DUPLICATE_CAPABILITY");
  if (!Array.isArray(root.usageDecisions) || root.usageDecisions.length === 0) throw new Error("M5_PROVIDER_READINESS_USAGES_INVALID");
  const usageDecisions = root.usageDecisions.map(parseUsage).sort((a, b) => compareLexical(a.usage, b.usage));
  if (new Set(usageDecisions.map(item => item.usage)).size !== usageDecisions.length) throw new Error("M5_PROVIDER_READINESS_DUPLICATE_USAGE");
  const approvalExpiresAt = root.approvalExpiresAt === undefined ? undefined : timestamp(root.approvalExpiresAt, "M5_PROVIDER_READINESS_APPROVAL_EXPIRY_INVALID");
  if (approvalExpiresAt !== undefined && approvalExpiresAt <= reviewedAt) throw new Error("M5_PROVIDER_READINESS_APPROVAL_EXPIRY_INVALID");
  if (usageDecisions.some(item => item.approval === "APPROVED") && approvalExpiresAt === undefined) throw new Error("M5_PROVIDER_READINESS_APPROVAL_EXPIRY_REQUIRED");
  const metadata = root.metadata === undefined ? undefined : (() => {
    const item = asObject(root.metadata, "M5_PROVIDER_READINESS_METADATA_INVALID");
    exact(item, ["sourceKind", "reviewer", "policyVersion"], "M5_PROVIDER_READINESS_METADATA_UNKNOWN_FIELD");
    if (item.sourceKind !== undefined && item.sourceKind !== "OFFICIAL_DOCUMENTATION" && item.sourceKind !== "SYNTHETIC_FIXTURE") throw new Error("M5_PROVIDER_READINESS_METADATA_INVALID");
    return deepFreeze({ ...(item.sourceKind === undefined ? {} : { sourceKind: item.sourceKind as "OFFICIAL_DOCUMENTATION" | "SYNTHETIC_FIXTURE" }), ...(item.reviewer === undefined ? {} : { reviewer: id(item.reviewer, "M5_PROVIDER_READINESS_METADATA_INVALID") }), ...(item.policyVersion === undefined ? {} : { policyVersion: id(item.policyVersion, "M5_PROVIDER_READINESS_METADATA_INVALID") }) });
  })();
  return deepFreeze({ configVersion: M5_PROVIDER_READINESS_CONFIG_VERSION, providerNamespace, providerId, datasetId, datasetVersion, reviewedAt, reviewReference, documentationUrls, termsUrls, capabilities: Object.freeze(capabilities), usageDecisions: Object.freeze(usageDecisions), limitations: limitations(root.limitations), ...(approvalExpiresAt === undefined ? {} : { approvalExpiresAt }), ...(metadata === undefined ? {} : { metadata }) });
}

const requirementKey = (item: ProviderCapabilityRequirement): string => `${item.capability}:${item.completeness}`;

export function evaluateM5ProviderReadiness(input: Readonly<{ config: ProviderReadinessConfig; requiredCapabilities: readonly ProviderCapabilityRequirement[]; requestedUsages: readonly M5ProviderUsage[]; evaluatedAt: string; expectedScope?: ProviderReadinessScope }>): ProviderReadinessEvaluation {
  const evaluatedAt = timestamp(input.evaluatedAt, "M5_PROVIDER_READINESS_EVALUATED_AT_INVALID");
  const capabilityRequirements = [...input.requiredCapabilities].sort((a, b) => compareLexical(requirementKey(a), requirementKey(b)));
  const requestedUsages = [...input.requestedUsages].sort(compareLexical);
  const blockers: ProviderReadinessBlocker[] = [];
  if (input.expectedScope !== undefined && (input.expectedScope.providerId !== input.config.providerId || input.expectedScope.datasetId !== input.config.datasetId || input.expectedScope.datasetVersion !== input.config.datasetVersion)) blockers.push({ code: "M5_READINESS_SCOPE_MISMATCH" });
  if (new Set(capabilityRequirements.map(requirementKey)).size !== capabilityRequirements.length || requestedUsages.some(usage => !USAGE_SET.has(usage)) || new Set(requestedUsages).size !== requestedUsages.length) blockers.push({ code: "M5_READINESS_INVALID_REQUIREMENTS" });
  for (const requirement of capabilityRequirements) {
    const decision = input.config.capabilities.find(item => item.capability === requirement.capability);
    if (!decision) { blockers.push({ code: "M5_READINESS_CAPABILITY_MISSING", capability: requirement.capability }); continue; }
    if (decision.status !== "SUPPORTED") blockers.push({ code: "M5_READINESS_CAPABILITY_NOT_SUPPORTED", capability: requirement.capability });
    else if (requirement.completeness === "COMPLETE" && decision.completeness !== "COMPLETE") blockers.push({ code: "M5_READINESS_CAPABILITY_INCOMPLETE", capability: requirement.capability });
    if (requirement.capability === "HOLDER_FINALITY" && decision.completeness !== "COMPLETE") blockers.push({ code: "M5_READINESS_HOLDER_FINALITY_UNPROVEN", capability: requirement.capability });
    if (requirement.capability === "SUSPICIOUS_RULE_COVERAGE" && (decision.status !== "SUPPORTED" || decision.completeness !== "COMPLETE")) blockers.push({ code: "M5_READINESS_SUSPICIOUS_COVERAGE_INCOMPLETE", capability: requirement.capability });
    if (requirement.capability === "VENUE_COMPLETE_UNIVERSE" && (decision.completeness !== "COMPLETE" || decision.zeroVenuePolicy === undefined || decision.zeroVenuePolicy === "UNKNOWN")) blockers.push({ code: "M5_READINESS_ZERO_VENUE_UNDECIDED", capability: requirement.capability });
  }
  for (const usage of requestedUsages) {
    const decision = input.config.usageDecisions.find(item => item.usage === usage);
    if (!decision) { blockers.push({ code: "M5_READINESS_USAGE_MISSING", usage }); continue; }
    if (decision.approval === "REQUIRES_APPROVAL") blockers.push({ code: usage === "RAW_PAYLOAD_STORAGE" ? "M5_READINESS_RAW_STORAGE_NOT_APPROVED" : usage === "COMMERCIAL_USE" ? "M5_READINESS_COMMERCIAL_USE_NOT_APPROVED" : usage === "REDISTRIBUTION" ? "M5_READINESS_REDISTRIBUTION_NOT_APPROVED" : "M5_READINESS_USAGE_REQUIRES_APPROVAL", usage });
    else if (decision.approval === "REJECTED") blockers.push({ code: "M5_READINESS_USAGE_REJECTED", usage });
    else if (decision.approval === "EXPIRED" || (decision.approval === "APPROVED" && input.config.approvalExpiresAt !== undefined && input.config.approvalExpiresAt <= evaluatedAt)) blockers.push({ code: "M5_READINESS_USAGE_EXPIRED", usage });
  }
  const unique = new Map(blockers.map(blocker => [`${blocker.code}:${blocker.capability ?? ""}:${blocker.usage ?? ""}`, blocker]));
  const ordered = [...unique.values()].sort((a, b) => compareLexical(`${a.code}:${a.capability ?? ""}:${a.usage ?? ""}`, `${b.code}:${b.capability ?? ""}:${b.usage ?? ""}`));
  const result: ProviderReadinessEvaluation = deepFreeze({ result: (ordered.length === 0 ? "READY" : "BLOCKED") as M5ReadinessResult, providerId: input.config.providerId, datasetId: input.config.datasetId, datasetVersion: input.config.datasetVersion, evaluatedAt, requiredCapabilities: capabilityRequirements, requestedUsages, blockers: ordered });
  trustedEvaluations.add(result);
  return result;
}

export function isTrustedM5ProviderReadinessEvaluation(value: ProviderReadinessEvaluation): boolean {
  return typeof value === "object" && value !== null && trustedEvaluations.has(value);
}
