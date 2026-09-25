import { createHash } from "node:crypto";
import {
  evaluateM5ProviderReadiness,
  isTrustedM5ProviderReadinessEvaluation,
  type ProviderCapabilityRequirement,
  type ProviderReadinessEvaluation,
} from "@/domain/intelligence/m5-provider-readiness";
import { M5_DEFAULT_REQUESTED_USAGES } from "@/application/intelligence/evaluate-m5-provider-readiness";
import { resolveConfiguredM5ProviderApprovalAuthority, isTrustedConfiguredM5ProviderApprovalAuthorityResolution,
  type M5ProviderApprovalAuthorityRequest, type M5ProviderApprovalAuthorityResolution, type M5ProviderApprovalAuthorityResolver } from "@/application/intelligence/resolve-m5-provider-approval-authority";
import {
  M5_AGGREGATE_CAPABILITIES,
  m5ProviderReadinessAggregateConfigFingerprint,
  m5ProviderReadinessConfigIdentity,
  parseM5ProviderReadinessAggregateConfig,
  verifyAggregateSourceBinding,
  type M5AggregateBlockerCode,
  type M5AggregateSource,
  type M5AggregateSourceReference,
  type M5AggregateUsage,
  type M5ProviderReadinessAggregateConfig,
  type M5ProviderReadinessAggregateResult,
} from "@/domain/intelligence/m5-provider-readiness-aggregate";

const trusted = new WeakSet<object>();
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const canonical = (value: unknown): string => {
  const active = new WeakSet<object>();
  const normalize = (item: unknown): unknown => {
    if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number") return item;
    if (typeof item !== "object") throw new Error("invalid");
    if (active.has(item)) throw new Error("invalid");
    active.add(item);
    try {
      if (Object.getOwnPropertySymbols(item).length) throw new Error("invalid");
      if (Array.isArray(item)) {
        const keys = Object.getOwnPropertyNames(item);
        if (keys.length !== item.length + 1 || keys.some(key => key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= item.length))) throw new Error("invalid");
        return Array.from({ length: item.length }, (_, index) => {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw new Error("invalid");
          return normalize(descriptor.value);
        });
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) throw new Error("invalid");
      const record: Record<string, unknown> = {};
      for (const key of Object.getOwnPropertyNames(item).sort(compare)) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) throw new Error("invalid");
        record[key] = normalize(descriptor.value);
      }
      return record;
    } finally { active.delete(item); }
  };
  try { return JSON.stringify(normalize(value)); } catch { return "[invalid-material]"; }
};
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const requirement: readonly ProviderCapabilityRequirement[] = M5_AGGREGATE_CAPABILITIES.map(capability => ({ capability, completeness: "COMPLETE" as const })).sort((a, b) => compare(a.capability, b.capability));
const oldUsage: Readonly<Record<M5AggregateUsage, string | undefined>> = {
  NETWORK_ACQUISITION: "NETWORK_ACQUISITION", RAW_PAYLOAD_PROCESSING: "RAW_PAYLOAD_PROCESSING", RAW_PAYLOAD_STORAGE: "RAW_PAYLOAD_STORAGE",
  NORMALIZED_STORAGE: "NORMALIZED_STORAGE", AUTHORITY_PERSISTENCE: "AUTHORITY_PERSISTENCE", RETENTION: undefined,
  REDISTRIBUTION: "REDISTRIBUTION", COMMERCIAL_USE: "COMMERCIAL_USE",
};
const timestampIsCanonical = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const hasExactOwnDataFields = (value: unknown, fields: readonly string[]): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null || Object.getOwnPropertySymbols(value).length) return false;
  const keys = Object.getOwnPropertyNames(value);
  return keys.length === fields.length && keys.every(key => {
    if (!fields.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor?.enumerable && "value" in descriptor);
  });
};
const exactDefaultRequest = (evaluation: ProviderReadinessEvaluation): boolean =>
  canonical(evaluation.requiredCapabilities) === canonical(requirement) && canonical(evaluation.requestedUsages) === canonical([...M5_DEFAULT_REQUESTED_USAGES].sort(compare));

export function bindM5ProviderReadinessAggregateSource(configInput: unknown, evaluation: ProviderReadinessEvaluation): M5AggregateSource {
  if (!isTrustedM5ProviderReadinessEvaluation(evaluation)) throw new Error("M5_AGGREGATE_SOURCE_NOT_AUTHENTIC");
  const identity = m5ProviderReadinessConfigIdentity(configInput);
  const config = JSON.parse(JSON.stringify(configInput)) as Record<string, unknown>;
  const capabilities = Array.isArray(config.capabilities) ? config.capabilities.map((item: { capability: string }) => item.capability) : [];
  const sourceId = `m5-provider-source:${hash({ providerId: config.providerId, datasetId: config.datasetId, datasetVersion: config.datasetVersion, readinessConfigFingerprint: identity.readinessConfigFingerprint })}`;
  const source = {
    sourceId, providerId: config.providerId as string, datasetId: config.datasetId as string, datasetVersion: config.datasetVersion as string,
    readinessConfigId: identity.readinessConfigId, readinessConfigFingerprint: identity.readinessConfigFingerprint,
    capabilities: [...capabilities].sort(compare), usages: [...evaluation.requestedUsages].sort(compare),
  };
  verifyAggregateSourceBinding(source as M5AggregateSource, { config: configInput, evaluation }, isTrustedM5ProviderReadinessEvaluation,
    (parsed, prior) => evaluateM5ProviderReadiness({ config: parsed, requiredCapabilities: prior.requiredCapabilities, requestedUsages: prior.requestedUsages, evaluatedAt: prior.evaluatedAt }));
  return freeze(source as M5AggregateSource);
}

export function evaluateM5ProviderReadinessAggregate(input: Readonly<{
  config: unknown;
  sources: readonly Readonly<{ sourceId: string; config: unknown; evaluation: ProviderReadinessEvaluation }>[];
  evaluatedAt: string;
}>): M5ProviderReadinessAggregateResult {
  try {
    assertAggregateEvaluationInput(input);
    return evaluateM5ProviderReadinessAggregateInternal(input, resolveConfiguredM5ProviderApprovalAuthority, isTrustedConfiguredM5ProviderApprovalAuthorityResolution, true);
  }
  catch {
    const fingerprint = hash({ contractVersion: "m5-provider-readiness-aggregate/v1", status: "INVALID", blocker: "M5_AGGREGATE_CONFIG_INVALID" });
    const invalid = freeze({ contractVersion: "m5-provider-readiness-aggregate/v1" as const, result: "INVALID" as const, evaluatedAt: "",
      aggregateId: "invalid", aggregateFingerprint: fingerprint, aggregateResultId: `m5-provider-readiness-aggregate-result:${fingerprint}`,
      aggregateResultFingerprint: fingerprint, sources: [], capabilityAssignments: [], usageDecisions: [], blockers: ["M5_AGGREGATE_CONFIG_INVALID"] as const }) as M5ProviderReadinessAggregateResult;
    return invalid;
  }
}

/** Offline synthetic composition for tests/review fixtures. Results are deliberately untrusted by the execution guard. */
export function evaluateM5ProviderReadinessAggregateForSyntheticReview(input: Readonly<{
  config: unknown;
  sources: readonly Readonly<{ sourceId: string; config: unknown; evaluation: ProviderReadinessEvaluation }>[];
  evaluatedAt: string;
  approvalResolver: M5ProviderApprovalAuthorityResolver;
}>): M5ProviderReadinessAggregateResult {
  assertAggregateEvaluationInput(input, ["config", "sources", "evaluatedAt", "approvalResolver"]);
  return evaluateM5ProviderReadinessAggregateInternal(input, input.approvalResolver.resolve, input.approvalResolver.isTrusted, false);
}

function assertAggregateEvaluationInput(input: unknown, fields: readonly string[] = ["config", "sources", "evaluatedAt"]): asserts input is Readonly<{
  config: unknown; sources: readonly Readonly<{ sourceId: string; config: unknown; evaluation: ProviderReadinessEvaluation }>[]; evaluatedAt: string;
}> {
  if (!hasExactOwnDataFields(input, fields)) throw new Error("M5_AGGREGATE_EVALUATION_INPUT_INVALID");
  const value = input as Record<string, unknown>;
  if (typeof value.evaluatedAt !== "string" || !Array.isArray(value.sources)) throw new Error("M5_AGGREGATE_EVALUATION_INPUT_INVALID");
  const sources = value.sources as unknown[];
  const names = Object.getOwnPropertyNames(sources);
  if (Object.getOwnPropertySymbols(sources).length || names.length !== sources.length + 1 || names.some(key => key !== "length" && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= sources.length))) throw new Error("M5_AGGREGATE_EVALUATION_INPUT_INVALID");
  for (let index = 0; index < sources.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(sources, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || !hasExactOwnDataFields(descriptor.value, ["sourceId", "config", "evaluation"])) throw new Error("M5_AGGREGATE_EVALUATION_INPUT_INVALID");
  }
}

function evaluateM5ProviderReadinessAggregateInternal(input: Readonly<{
  config: unknown;
  sources: readonly Readonly<{ sourceId: string; config: unknown; evaluation: ProviderReadinessEvaluation }>[];
  evaluatedAt: string;
}>, resolveAuthority: (request: M5ProviderApprovalAuthorityRequest) => M5ProviderApprovalAuthorityResolution,
isTrustedAuthority: (value: unknown) => boolean, markExecutionTrusted: boolean): M5ProviderReadinessAggregateResult {
  let config: M5ProviderReadinessAggregateConfig;
  try { config = parseM5ProviderReadinessAggregateConfig(input.config); }
  catch {
    const safeEvaluatedAt = timestampIsCanonical(input.evaluatedAt) ? input.evaluatedAt : "";
    return result("INVALID", safeEvaluatedAt, "invalid", "0".repeat(64), [], [], [], ["M5_AGGREGATE_CONFIG_INVALID"]);
  }
  const blockers = new Set<M5AggregateBlockerCode>();
  let invalid = false;
  const evaluatedAt = timestampIsCanonical(input.evaluatedAt) ? input.evaluatedAt : "";
  if (!evaluatedAt) { blockers.add("M5_AGGREGATE_CONFIG_INVALID"); invalid = true; }
  if (config.reviewedAt > evaluatedAt) { blockers.add("M5_AGGREGATE_CONFIG_INVALID"); invalid = true; }
  const bindings = new Map(input.sources.map(binding => [binding.sourceId, binding]));
  if (bindings.size !== input.sources.length) { blockers.add("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH"); invalid = true; }
  if (input.sources.some(binding => !config.sources.some(source => source.sourceId === binding.sourceId))) { blockers.add("M5_AGGREGATE_SOURCE_UNUSED"); invalid = true; }
  const references: M5AggregateSourceReference[] = [];
  const runtimes = new Map<string, ReturnType<typeof verifyAggregateSourceBinding>>();
  const authorityResolutions = new Map<string, M5ProviderApprovalAuthorityResolution>();
  for (const source of config.sources) {
    const binding = bindings.get(source.sourceId);
    if (!binding) { blockers.add("M5_AGGREGATE_SOURCE_MISSING"); continue; }
    try {
      const runtime = verifyAggregateSourceBinding(source, binding, isTrustedM5ProviderReadinessEvaluation,
        (parsed, prior) => evaluateM5ProviderReadiness({ config: parsed, requiredCapabilities: prior.requiredCapabilities, requestedUsages: prior.requestedUsages, evaluatedAt: prior.evaluatedAt }));
      if (!exactDefaultRequest(runtime.evaluation)) throw new Error("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
      runtimes.set(source.sourceId, runtime);
      references.push(Object.freeze({ ...source, readinessResultId: runtime.readinessResultId, readinessResultFingerprint: runtime.readinessResultFingerprint }));
      if (source.approvalAuthorityId && source.approvalAuthorityFingerprint) {
        const resolution = resolveAuthority({
          approvalAuthorityId: source.approvalAuthorityId, approvalAuthorityFingerprint: source.approvalAuthorityFingerprint,
          providerId: source.providerId, datasetId: source.datasetId, datasetVersion: source.datasetVersion, asOf: evaluatedAt });
        authorityResolutions.set(source.sourceId, resolution);
        if (resolution.result === "INVALID") { blockers.add("M5_AGGREGATE_APPROVAL_AUTHORITY_INVALID"); invalid = true; }
        else if (resolution.result !== "RESOLVED" || !isTrustedAuthority(resolution)) {
          if (resolution.blockers.includes("M5_APPROVAL_AUTHORITY_EXPIRED")) blockers.add("M5_AGGREGATE_APPROVAL_AUTHORITY_EXPIRED");
          else if (resolution.blockers.includes("M5_APPROVAL_AUTHORITY_SCOPE_MISMATCH")) blockers.add("M5_AGGREGATE_APPROVAL_AUTHORITY_MISMATCH");
          else blockers.add("M5_AGGREGATE_APPROVAL_AUTHORITY_MISSING");
        }
        else references[references.length - 1] = Object.freeze({ ...source, readinessResultId: runtime.readinessResultId, readinessResultFingerprint: runtime.readinessResultFingerprint,
          approvalAuthorityId: resolution.authority!.approvalAuthorityId, approvalAuthorityFingerprint: resolution.authority!.approvalAuthorityFingerprint });
      } else blockers.add("M5_AGGREGATE_APPROVAL_AUTHORITY_MISSING");
      if (runtime.evaluation.evaluatedAt > evaluatedAt || runtime.config.reviewedAt > evaluatedAt ||
        runtime.config.capabilities.some(decision => decision.reviewedAt > evaluatedAt) ||
        runtime.config.usageDecisions.some(decision => decision.reviewedAt > evaluatedAt)) {
        blockers.add("M5_AGGREGATE_CONFIG_INVALID"); invalid = true;
      }
      if (runtime.evaluation.result !== "READY") blockers.add("M5_AGGREGATE_SOURCE_READINESS_BLOCKED");
    } catch (error) {
      if (error instanceof Error && error.message === "M5_AGGREGATE_SOURCE_NOT_AUTHENTIC") blockers.add("M5_AGGREGATE_SOURCE_NOT_AUTHENTIC");
      else blockers.add("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
      invalid = true;
    }
  }
  const used = new Set(config.capabilityAssignments.flatMap(row => row.sourceIds));
  for (const source of config.sources) if (!used.has(source.sourceId)) blockers.add("M5_AGGREGATE_SOURCE_UNUSED");
  for (const assignment of config.capabilityAssignments) {
    if (!assignment.sourceIds.length) { blockers.add("M5_AGGREGATE_SOURCE_MISSING"); continue; }
    for (const sourceId of assignment.sourceIds) {
      const source = config.sources.find(row => row.sourceId === sourceId);
      const runtime = runtimes.get(sourceId);
      if (!source || !runtime) { blockers.add("M5_AGGREGATE_SOURCE_MISSING"); continue; }
      if (!source.capabilities.includes(assignment.capability)) { blockers.add("M5_AGGREGATE_CAPABILITY_NOT_DECLARED"); continue; }
      const decision = runtime.config.capabilities.find(row => row.capability === assignment.capability);
      if (!decision || decision.status !== "SUPPORTED") blockers.add("M5_AGGREGATE_CAPABILITY_NOT_SUPPORTED");
      if (!decision || decision.completeness !== "COMPLETE") blockers.add("M5_AGGREGATE_CAPABILITY_INCOMPLETE");
    }
  }
  const sourceMap = new Map(config.sources.map(source => [source.sourceId, source]));
  for (const decision of config.usageDecisions) {
    const source = sourceMap.get(decision.sourceId);
    const runtime = runtimes.get(decision.sourceId);
    if (!source || !runtime) { blockers.add("M5_AGGREGATE_SOURCE_MISSING"); continue; }
    if (decision.reviewedAt > evaluatedAt) { blockers.add("M5_AGGREGATE_CONFIG_INVALID"); invalid = true; }
    const mapped = oldUsage[decision.usage];
    const underlying = mapped ? runtime.config.usageDecisions.find(row => row.usage === mapped) : undefined;
    const authorityResolution = authorityResolutions.get(decision.sourceId);
    const authority = authorityResolution && isTrustedAuthority(authorityResolution) ? authorityResolution.authority : undefined;
    const authorityDecision = decision.usage === "RETENTION" ? authority?.retentionDecision.decision : authority?.usageDecisions.find(row => row.usage === mapped)?.decision;
    const expectedAuthorityStatus = decision.approval === "APPROVED" ? "APPROVED" : decision.approval === "REQUIRES_APPROVAL" ? "REQUIRES_APPROVAL" : decision.approval === "REJECTED" ? "DENIED" : decision.approval === "UNKNOWN" ? "UNKNOWN" : undefined;
    if (!authority || !authorityDecision) blockers.add("M5_AGGREGATE_APPROVAL_AUTHORITY_MISSING");
    else if (authorityDecision !== expectedAuthorityStatus) blockers.add("M5_AGGREGATE_APPROVAL_AUTHORITY_MISMATCH");
    else if (authorityDecision !== "APPROVED") blockers.add("M5_AGGREGATE_APPROVAL_AUTHORITY_NOT_APPROVED");
    const expired = decision.approval === "APPROVED" && decision.approvalExpiresAt !== undefined && decision.approvalExpiresAt <= evaluatedAt;
    if (expired || decision.approval === "EXPIRED") blockers.add("M5_AGGREGATE_USAGE_EXPIRED");
    else if (decision.approval === "REQUIRES_APPROVAL" || decision.approval === "UNKNOWN") blockers.add("M5_AGGREGATE_USAGE_REQUIRES_APPROVAL");
    else if (decision.approval !== "APPROVED") blockers.add("M5_AGGREGATE_USAGE_NOT_APPROVED");
    if (mapped && (!underlying || underlying.approval !== "APPROVED" || (runtime.config.approvalExpiresAt && runtime.config.approvalExpiresAt <= evaluatedAt))) blockers.add("M5_AGGREGATE_USAGE_NOT_APPROVED");
  }
  const ordered = [...blockers].sort(compare);
  const configFingerprint = m5ProviderReadinessAggregateConfigFingerprint(config);
  const refs = references.sort((a, b) => compare(a.sourceId, b.sourceId));
  const expiryDates = [
    ...config.usageDecisions.flatMap(decision => decision.approval === "APPROVED" && decision.approvalExpiresAt ? [decision.approvalExpiresAt] : []),
    ...[...runtimes.values()].flatMap(runtime => runtime.config.approvalExpiresAt ? [runtime.config.approvalExpiresAt] : []),
    ...[...authorityResolutions.values()].flatMap(resolution => resolution.authority?.expiresAt ? [resolution.authority.expiresAt] : []),
  ];
  const validUntil = expiryDates.sort(compare)[0];
  const status = invalid ? "INVALID" : ordered.length ? "BLOCKED" : "READY";
  const identityMaterial = { contractVersion: config.contractVersion, policyVersion: config.policyVersion, aggregateId: config.aggregateId,
    configFingerprint, sources: refs, capabilityAssignments: config.capabilityAssignments, usageDecisions: config.usageDecisions, blockers: ordered, result: status };
  const aggregateFingerprint = hash(identityMaterial);
  return result(status, evaluatedAt, config.aggregateId, aggregateFingerprint, refs, config.capabilityAssignments, config.usageDecisions, ordered, aggregateFingerprint, validUntil);

  function result(status: "READY" | "BLOCKED" | "INVALID", evaluatedAt: string, aggregateId: string, aggregateFingerprint: string,
    sources: readonly M5AggregateSourceReference[], assignments: M5ProviderReadinessAggregateConfig["capabilityAssignments"],
    usages: M5ProviderReadinessAggregateConfig["usageDecisions"], blockers: readonly M5AggregateBlockerCode[], resultFingerprint = hash({ aggregateId, aggregateFingerprint, status, sources, assignments, usages, blockers }), validUntil?: string) {
    const value = freeze({ contractVersion: "m5-provider-readiness-aggregate/v1" as const, result: status, evaluatedAt, aggregateId, aggregateFingerprint,
      aggregateResultId: `m5-provider-readiness-aggregate-result:${resultFingerprint}`, aggregateResultFingerprint: resultFingerprint,
      ...(validUntil ? { validUntil } : {}), sources: [...sources], capabilityAssignments: [...assignments], usageDecisions: [...usages], blockers: [...blockers] }) as M5ProviderReadinessAggregateResult;
    if (markExecutionTrusted) trusted.add(value);
    return value;
  }
}

export function isTrustedM5ProviderReadinessAggregate(value: unknown): value is M5ProviderReadinessAggregateResult {
  return typeof value === "object" && value !== null && trusted.has(value);
}

export function assertM5ProviderReadinessAggregateForExecution(result: M5ProviderReadinessAggregateResult, request: Readonly<{
  asOf: string; aggregateId: string; aggregateFingerprint: string; sources: M5ProviderReadinessAggregateResult["sources"];
  capabilityAssignments: M5ProviderReadinessAggregateConfig["capabilityAssignments"];
  usages: M5ProviderReadinessAggregateConfig["usageDecisions"];
}>): void {
  if (!isTrustedM5ProviderReadinessAggregate(result) || result.result !== "READY") throw new Error("M5_PROVIDER_READINESS_AGGREGATE_BLOCKED");
  if (!hasExactOwnDataFields(request, ["asOf", "aggregateId", "aggregateFingerprint", "sources", "capabilityAssignments", "usages"])) throw new Error("M5_PROVIDER_READINESS_AGGREGATE_SCOPE_MISMATCH");
  if (!timestampIsCanonical(request.asOf) || request.asOf < result.evaluatedAt) throw new Error("M5_PROVIDER_READINESS_AGGREGATE_AS_OF_INVALID");
  if (!result.validUntil || result.validUntil <= request.asOf) throw new Error("M5_PROVIDER_READINESS_AGGREGATE_EXPIRED");
  if (result.sources.some(source => !source.approvalAuthorityId || !source.approvalAuthorityFingerprint)) throw new Error("M5_PROVIDER_READINESS_AGGREGATE_SCOPE_MISMATCH");
  if (request.aggregateId !== result.aggregateId || request.aggregateFingerprint !== result.aggregateFingerprint ||
    canonical(request.sources) !== canonical(result.sources) ||
    canonical(request.capabilityAssignments) !== canonical(result.capabilityAssignments) || canonical(request.usages) !== canonical(result.usageDecisions)) throw new Error("M5_PROVIDER_READINESS_AGGREGATE_SCOPE_MISMATCH");
}
