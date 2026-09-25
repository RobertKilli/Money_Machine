import { createHash } from "node:crypto";
import {
  evaluateM5ProviderReadiness,
  isTrustedM5ProviderReadinessEvaluation,
  type ProviderCapabilityRequirement,
  type ProviderReadinessEvaluation,
} from "@/domain/intelligence/m5-provider-readiness";
import { M5_DEFAULT_REQUESTED_USAGES } from "@/application/intelligence/evaluate-m5-provider-readiness";
import {
  M5_AGGREGATE_CAPABILITIES,
  m5ProviderReadinessAggregateFingerprint,
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
const canonical = (value: unknown): string => JSON.stringify(value);
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const hash = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
const requirement: readonly ProviderCapabilityRequirement[] = M5_AGGREGATE_CAPABILITIES.map(capability => ({ capability, completeness: "COMPLETE" as const })).sort((a, b) => compare(a.capability, b.capability));
const oldUsage: Readonly<Record<M5AggregateUsage, string | undefined>> = {
  PROVIDER_ACCESS: "NETWORK_ACQUISITION", RAW_PAYLOAD_PROCESSING: "RAW_PAYLOAD_PROCESSING", RAW_STORAGE: "RAW_PAYLOAD_STORAGE",
  NORMALIZED_STORAGE: "NORMALIZED_STORAGE", AUTHORITY_PERSISTENCE: "AUTHORITY_PERSISTENCE", RETENTION: undefined,
  REDISTRIBUTION: "REDISTRIBUTION", COMMERCIAL_USE: "COMMERCIAL_USE",
};
const timestampIsCanonical = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
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
  let config: M5ProviderReadinessAggregateConfig;
  try { config = parseM5ProviderReadinessAggregateConfig(input.config); }
  catch {
    return result("INVALID", "invalid", "0".repeat(64), [], [], [], ["M5_AGGREGATE_CONFIG_INVALID"]);
  }
  const blockers = new Set<M5AggregateBlockerCode>();
  if (!timestampIsCanonical(input.evaluatedAt)) blockers.add("M5_AGGREGATE_CONFIG_INVALID");
  if (config.reviewedAt > input.evaluatedAt) blockers.add("M5_AGGREGATE_CONFIG_INVALID");
  const bindings = new Map(input.sources.map(binding => [binding.sourceId, binding]));
  if (bindings.size !== input.sources.length) blockers.add("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
  if (input.sources.some(binding => !config.sources.some(source => source.sourceId === binding.sourceId))) blockers.add("M5_AGGREGATE_SOURCE_UNUSED");
  const references: M5AggregateSourceReference[] = [];
  const runtimes = new Map<string, ReturnType<typeof verifyAggregateSourceBinding>>();
  for (const source of config.sources) {
    const binding = bindings.get(source.sourceId);
    if (!binding) { blockers.add("M5_AGGREGATE_SOURCE_MISSING"); continue; }
    try {
      const runtime = verifyAggregateSourceBinding(source, binding, isTrustedM5ProviderReadinessEvaluation,
        (parsed, prior) => evaluateM5ProviderReadiness({ config: parsed, requiredCapabilities: prior.requiredCapabilities, requestedUsages: prior.requestedUsages, evaluatedAt: prior.evaluatedAt }));
      if (!exactDefaultRequest(runtime.evaluation)) throw new Error("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
      runtimes.set(source.sourceId, runtime);
      references.push(Object.freeze({ ...source, readinessResultId: runtime.readinessResultId, readinessResultFingerprint: runtime.readinessResultFingerprint }));
      if (runtime.evaluation.result !== "READY") blockers.add("M5_AGGREGATE_SOURCE_READINESS_BLOCKED");
    } catch (error) {
      blockers.add(error instanceof Error && error.message === "M5_AGGREGATE_SOURCE_NOT_AUTHENTIC" ? "M5_AGGREGATE_SOURCE_NOT_AUTHENTIC" : "M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
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
    if (decision.reviewedAt > input.evaluatedAt) blockers.add("M5_AGGREGATE_CONFIG_INVALID");
    const mapped = oldUsage[decision.usage];
    const underlying = mapped ? runtime.config.usageDecisions.find(row => row.usage === mapped) : undefined;
    const expired = decision.approval === "APPROVED" && decision.approvalExpiresAt !== undefined && decision.approvalExpiresAt <= input.evaluatedAt;
    if (expired || decision.approval === "EXPIRED") blockers.add("M5_AGGREGATE_USAGE_EXPIRED");
    else if (decision.approval === "REQUIRES_APPROVAL" || decision.approval === "UNKNOWN") blockers.add("M5_AGGREGATE_USAGE_REQUIRES_APPROVAL");
    else if (decision.approval !== "APPROVED") blockers.add("M5_AGGREGATE_USAGE_NOT_APPROVED");
    if (mapped && (!underlying || underlying.approval !== "APPROVED" || (runtime.config.approvalExpiresAt && runtime.config.approvalExpiresAt <= input.evaluatedAt))) blockers.add("M5_AGGREGATE_USAGE_NOT_APPROVED");
  }
  const ordered = [...blockers].sort(compare);
  const fingerprint = m5ProviderReadinessAggregateFingerprint(config);
  const refs = references.sort((a, b) => compare(a.sourceId, b.sourceId));
  const expiryDates = [
    ...config.usageDecisions.flatMap(decision => decision.approval === "APPROVED" && decision.approvalExpiresAt ? [decision.approvalExpiresAt] : []),
    ...[...runtimes.values()].flatMap(runtime => runtime.config.approvalExpiresAt ? [runtime.config.approvalExpiresAt] : []),
  ];
  const validUntil = expiryDates.sort(compare)[0];
  const resultFingerprint = hash({ fingerprint, sources: refs, blockers: ordered, result: ordered.length ? "BLOCKED" : "READY" });
  return result(ordered.length ? "BLOCKED" : "READY", config.aggregateId, fingerprint, refs, config.capabilityAssignments, config.usageDecisions, ordered, resultFingerprint, validUntil);

  function result(status: "READY" | "BLOCKED" | "INVALID", aggregateId: string, aggregateFingerprint: string,
    sources: readonly M5AggregateSourceReference[], assignments: M5ProviderReadinessAggregateConfig["capabilityAssignments"],
    usages: M5ProviderReadinessAggregateConfig["usageDecisions"], blockers: readonly M5AggregateBlockerCode[], resultFingerprint = hash({ aggregateId, aggregateFingerprint, status, sources, assignments, usages, blockers }), validUntil?: string) {
    const value = freeze({ contractVersion: "m5-provider-readiness-aggregate/v1" as const, result: status, aggregateId, aggregateFingerprint,
      aggregateResultId: `m5-provider-readiness-aggregate-result:${resultFingerprint}`, aggregateResultFingerprint: resultFingerprint,
      ...(validUntil ? { validUntil } : {}), sources: [...sources], capabilityAssignments: [...assignments], usageDecisions: [...usages], blockers: [...blockers] }) as M5ProviderReadinessAggregateResult;
    trusted.add(value);
    return value;
  }
}

export function isTrustedM5ProviderReadinessAggregate(value: unknown): value is M5ProviderReadinessAggregateResult {
  return typeof value === "object" && value !== null && trusted.has(value);
}

export function assertM5ProviderReadinessAggregateForExecution(result: M5ProviderReadinessAggregateResult, request: Readonly<{
  aggregateId: string; aggregateFingerprint: string; sources: M5ProviderReadinessAggregateResult["sources"];
  capabilityAssignments: M5ProviderReadinessAggregateConfig["capabilityAssignments"];
  usages: M5ProviderReadinessAggregateConfig["usageDecisions"];
}>): void {
  if (!isTrustedM5ProviderReadinessAggregate(result) || result.result !== "READY") throw new Error("M5_PROVIDER_READINESS_AGGREGATE_BLOCKED");
  if (result.validUntil !== undefined && Date.parse(result.validUntil) <= Date.now()) throw new Error("M5_PROVIDER_READINESS_AGGREGATE_EXPIRED");
  if (request.aggregateId !== result.aggregateId || request.aggregateFingerprint !== result.aggregateFingerprint ||
    canonical(request.sources) !== canonical(result.sources) ||
    canonical(request.capabilityAssignments) !== canonical(result.capabilityAssignments) || canonical(request.usages) !== canonical(result.usageDecisions)) throw new Error("M5_PROVIDER_READINESS_AGGREGATE_SCOPE_MISMATCH");
}
