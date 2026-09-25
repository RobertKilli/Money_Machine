import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { M5_PROVIDER_READINESS_CONFIG_VERSION, M5_PROVIDER_USAGES } from "@/domain/intelligence/m5-provider-readiness";
import { evaluateM5ProviderReadinessConfig, M5_DEFAULT_REQUIRED_CAPABILITIES, M5_DEFAULT_REQUESTED_USAGES } from "@/application/intelligence/evaluate-m5-provider-readiness";
import {
  assertM5ProviderReadinessAggregateForExecution,
  bindM5ProviderReadinessAggregateSource,
  evaluateM5ProviderReadinessAggregate,
} from "@/application/intelligence/evaluate-m5-provider-readiness-aggregate";
import { M5_AGGREGATE_USAGES, M5_PROVIDER_READINESS_AGGREGATE_POLICY_VERSION, m5ProviderReadinessAggregateConfigFingerprint, m5ProviderReadinessEvaluationIdentity, parseM5ProviderReadinessAggregateConfig } from "@/domain/intelligence/m5-provider-readiness-aggregate";

const now = "2026-09-25T12:00:00.000Z";
const expiry = "2027-09-25T12:00:00.000Z";
const refs = "review/synthetic-aggregate/v1";
const docs = ["https://docs.example.test/source"];
type TestAssignment = { capability: string; mode: string; sourceIds: string[] };
type TestUsageDecision = { sourceId: string; usage: string; approval: string; reviewedAt: string; reviewReference: string; approvalExpiresAt?: string };
function providerConfig(overrides: Record<string, unknown> = {}) {
  return {
    configVersion: M5_PROVIDER_READINESS_CONFIG_VERSION, providerNamespace: "synthetic:provider", providerId: "synthetic-provider",
    datasetId: "synthetic-dataset", datasetVersion: "synthetic-dataset/v1", reviewedAt: now, reviewReference: refs,
    documentationUrls: docs, termsUrls: docs,
    capabilities: M5_DEFAULT_REQUIRED_CAPABILITIES.map(({ capability }) => ({ capability, status: "SUPPORTED", completeness: "COMPLETE", reviewedAt: now, reviewReference: refs,
      documentationUrls: docs, termsUrls: docs, limitations: [], ...(capability === "VENUE_COMPLETE_UNIVERSE" ? { zeroVenuePolicy: "ALLOWED_EMPTY" } : {}) })),
    usageDecisions: M5_DEFAULT_REQUESTED_USAGES.map(usage => ({ usage, approval: "APPROVED", reviewedAt: now, reviewReference: refs, limitations: [] })),
    limitations: [], approvalExpiresAt: expiry, metadata: { sourceKind: "SYNTHETIC_FIXTURE", policyVersion: "m5-provider-readiness-policy/v1" },
    ...overrides,
  };
}
function build(override: Record<string, unknown> = {}, evaluationTime = now) {
  const raw = providerConfig();
  const evaluation = evaluateM5ProviderReadinessConfig({ config: raw, evaluatedAt: evaluationTime });
  const source = bindM5ProviderReadinessAggregateSource(raw, evaluation);
  const config = {
    contractVersion: "m5-provider-readiness-aggregate/v1", policyVersion: M5_PROVIDER_READINESS_AGGREGATE_POLICY_VERSION, aggregateId: "m5-synthetic-stack", reviewedAt: now, reviewReference: refs,
    sources: [source], capabilityAssignments: M5_DEFAULT_REQUIRED_CAPABILITIES.map(({ capability }) => ({ capability, mode: "ALL_OF", sourceIds: [source.sourceId] })),
    usageDecisions: M5_AGGREGATE_USAGES.map(usage => ({ sourceId: source.sourceId, usage, approval: "APPROVED", reviewedAt: now, reviewReference: refs, approvalExpiresAt: expiry })),
    ...override,
  };
  return { raw, evaluation, source, config, run: () => evaluateM5ProviderReadinessAggregate({ config, sources: [{ sourceId: source.sourceId, config: raw, evaluation }], evaluatedAt: evaluationTime }) };
}

describe("M5 provider readiness aggregate", () => {
  it("composes authentic complete synthetic source and separate usages into READY", () => {
    const state = build();
    const result = state.run();
    expect(result.result).toBe("READY");
    expect(result.sources).toHaveLength(1);
    expect(result.blockers).toEqual([]);
    expect(result.capabilityAssignments).toHaveLength(11);
    expect(result.capabilityAssignments.map(row => row.capability)).toEqual([
      "CANONICAL_ASSET_IDENTITY", "CONTRACT_VERIFICATION", "DAILY_CLOSE_SERIES", "HOLDER_COMPLETE_UNIVERSE", "HOLDER_FINALITY",
      "LIQUIDITY_COMPLETE_SET", "MARKET_CAP", "SUSPICIOUS_REQUIRED_INPUTS", "SUSPICIOUS_RULE_COVERAGE", "VENUE_COMPLETE_UNIVERSE", "VOLUME_24H",
    ]);
    expect(M5_PROVIDER_USAGES).toEqual(["AUTHORITY_PERSISTENCE", "COMMERCIAL_USE", "NETWORK_ACQUISITION", "NORMALIZED_STORAGE", "RAW_PAYLOAD_PROCESSING", "RAW_PAYLOAD_STORAGE", "REDISTRIBUTION"]);
    expect(M5_AGGREGATE_USAGES).toEqual(["AUTHORITY_PERSISTENCE", "COMMERCIAL_USE", "NETWORK_ACQUISITION", "NORMALIZED_STORAGE", "RAW_PAYLOAD_PROCESSING", "RAW_PAYLOAD_STORAGE", "REDISTRIBUTION", "RETENTION"]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.sources[0])).toBe(true);
    expect(Object.isFrozen(result.capabilityAssignments[0]?.sourceIds)).toBe(true);
    expect(Object.isFrozen(result.usageDecisions[0])).toBe(true);
    expect(Object.isFrozen(result.blockers)).toBe(true);
    const request = { asOf: now, aggregateId: result.aggregateId, aggregateFingerprint: result.aggregateFingerprint, sources: result.sources, capabilityAssignments: result.capabilityAssignments, usages: result.usageDecisions };
    expect(() => assertM5ProviderReadinessAggregateForExecution(result, request)).not.toThrow();
    expect(() => assertM5ProviderReadinessAggregateForExecution({ ...result }, request)).toThrow("M5_PROVIDER_READINESS_AGGREGATE_BLOCKED");
    expect(() => assertM5ProviderReadinessAggregateForExecution(result, { ...request, sources: [] })).toThrow("M5_PROVIDER_READINESS_AGGREGATE_SCOPE_MISMATCH");
    expect(() => assertM5ProviderReadinessAggregateForExecution(result, { ...request, aggregateFingerprint: "0".repeat(64) })).toThrow("M5_PROVIDER_READINESS_AGGREGATE_SCOPE_MISMATCH");
    expect(() => assertM5ProviderReadinessAggregateForExecution(result, { ...request, sources: [{ ...result.sources[0]!, readinessResultFingerprint: "0".repeat(64) }] })).toThrow("M5_PROVIDER_READINESS_AGGREGATE_SCOPE_MISMATCH");
    expect(() => assertM5ProviderReadinessAggregateForExecution(result, { ...request, asOf: "2026-09-25T11:59:59.000Z" })).toThrow("M5_PROVIDER_READINESS_AGGREGATE_AS_OF_INVALID");
    expect(JSON.stringify(result)).not.toContain("https://");
    expect(JSON.stringify(result)).not.toContain("secret");
    const shuffled = { ...state.config, capabilityAssignments: [...(state.config as { capabilityAssignments: TestAssignment[] }).capabilityAssignments].reverse(), usageDecisions: [...(state.config as { usageDecisions: TestUsageDecision[] }).usageDecisions].reverse() };
    const replay = evaluateM5ProviderReadinessAggregate({ config: shuffled, sources: [{ sourceId: state.source.sourceId, config: state.raw, evaluation: state.evaluation }], evaluatedAt: now });
    expect(replay.aggregateFingerprint).toBe(result.aggregateFingerprint);
  });

  it("execution guard is side-effect free", () => {
    const state = build(); const result = state.run();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const request = { asOf: now, aggregateId: result.aggregateId, aggregateFingerprint: result.aggregateFingerprint, sources: result.sources, capabilityAssignments: result.capabilityAssignments, usages: result.usageDecisions };
    assertM5ProviderReadinessAggregateForExecution(result, request);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("execution guard refuses a formerly READY result after its approval expiry", () => {
    const result = build().run();
    expect(result.validUntil).toBe(expiry);
    const request = { asOf: expiry, aggregateId: result.aggregateId, aggregateFingerprint: result.aggregateFingerprint, sources: result.sources, capabilityAssignments: result.capabilityAssignments, usages: result.usageDecisions };
    expect(() => assertM5ProviderReadinessAggregateForExecution(result, request)).toThrow("M5_PROVIDER_READINESS_AGGREGATE_EXPIRED");
  });

  it("rejects unknown, secret-like, symbol, accessor, and non-plain fields", () => {
    const c = build().config as Record<string, unknown>;
    expect(() => parseM5ProviderReadinessAggregateConfig({ ...c, surprise: 1 })).toThrow("M5_AGGREGATE_UNKNOWN_FIELD");
    expect(() => parseM5ProviderReadinessAggregateConfig({ ...c, apiKey: "secret" })).toThrow("M5_AGGREGATE_SECRET_FIELD_REJECTED");
    const symbol = { ...c, [Symbol("secret")]: true };
    expect(() => parseM5ProviderReadinessAggregateConfig(symbol)).toThrow("M5_AGGREGATE_SYMBOL_FIELD");
    const accessor = Object.defineProperty({ ...c }, "aggregateId", { get: () => "fake" });
    expect(() => parseM5ProviderReadinessAggregateConfig(accessor)).toThrow("M5_AGGREGATE_ACCESSOR_REJECTED");
    const setter = Object.defineProperty({ ...c }, "aggregateId", { set: () => undefined });
    expect(() => parseM5ProviderReadinessAggregateConfig(setter)).toThrow("M5_AGGREGATE_ACCESSOR_REJECTED");
    expect(() => parseM5ProviderReadinessAggregateConfig(new Date())).toThrow("M5_AGGREGATE_NON_PLAIN_OBJECT");
    const extraArray = [...(c.sources as unknown[])]; Object.defineProperty(extraArray, "named", { value: true, enumerable: true });
    expect(() => parseM5ProviderReadinessAggregateConfig({ ...c, sources: extraArray })).toThrow("M5_AGGREGATE_ARRAY_PROPERTY_REJECTED");
    const cyclic: Record<string, unknown> = { ...c }; cyclic.loop = cyclic;
    expect(() => parseM5ProviderReadinessAggregateConfig(cyclic)).toThrow("M5_AGGREGATE_CYCLIC_VALUE_REJECTED");
    expect(() => parseM5ProviderReadinessAggregateConfig(Object.assign(Object.create({ polluted: true }), c))).toThrow("M5_AGGREGATE_NON_PLAIN_OBJECT");
    const polluted = JSON.parse(JSON.stringify(c)) as Record<string, unknown>;
    Object.defineProperty(polluted, "__proto__", { value: { polluted: true }, enumerable: true });
    expect(() => parseM5ProviderReadinessAggregateConfig(polluted)).toThrow("M5_AGGREGATE_UNKNOWN_FIELD");
    const missingAggregateId = { ...c }; delete missingAggregateId.aggregateId;
    Object.defineProperty(Object.prototype, "aggregateId", { configurable: true, value: "inherited-stack" });
    try { expect(() => parseM5ProviderReadinessAggregateConfig(missingAggregateId)).toThrow("M5_AGGREGATE_INHERITED_FIELD_REJECTED"); }
    finally { delete (Object.prototype as { aggregateId?: unknown }).aggregateId; }
    expect(() => parseM5ProviderReadinessAggregateConfig({ ...c, documentationUrls: ["https://example.test/?token=x"] })).toThrow("M5_AGGREGATE_UNKNOWN_FIELD");
    const nested = { ...c, sources: [{ ...(c.sources as Record<string, unknown>[])[0], credential: "never-return-this" }] };
    expect(() => parseM5ProviderReadinessAggregateConfig(nested)).toThrow("M5_AGGREGATE_SECRET_FIELD_REJECTED");
    expect(() => parseM5ProviderReadinessAggregateConfig({ ...c, reviewedAt: "2026-09-25T12:00:00Z" })).toThrow("M5_AGGREGATE_TIMESTAMP_INVALID");
  });

  it("canonicalizes permutation order, freezes deeply, and fingerprints material changes", () => {
    const { config } = build();
    const parsed = parseM5ProviderReadinessAggregateConfig(config);
    const shuffled = parseM5ProviderReadinessAggregateConfig({ ...config, sources: [...parsed.sources].reverse(), capabilityAssignments: [...parsed.capabilityAssignments].reverse(), usageDecisions: [...parsed.usageDecisions].reverse() });
    expect(shuffled).toEqual(parsed);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.sources[0])).toBe(true);
    expect(Object.isFrozen(parsed.capabilityAssignments[0]!.sourceIds)).toBe(true);
    expect(Object.isFrozen(parsed.usageDecisions[0])).toBe(true);
    expect(() => parseM5ProviderReadinessAggregateConfig({ ...config, aggregateId: "different-stack" })).not.toThrow();
    const first = m5ProviderReadinessAggregateConfigFingerprint(parsed);
    const changed = parseM5ProviderReadinessAggregateConfig({ ...config, usageDecisions: (config as { usageDecisions: TestUsageDecision[] }).usageDecisions.map(row => row.usage === "RAW_PAYLOAD_STORAGE" ? { ...row, approval: "REQUIRES_APPROVAL", approvalExpiresAt: undefined } : row) });
    expect(m5ProviderReadinessAggregateConfigFingerprint(changed)).not.toBe(first);
    const later = evaluateM5ProviderReadinessConfig({ config: build().raw, evaluatedAt: "2026-09-26T12:00:00.000Z" });
    expect(m5ProviderReadinessEvaluationIdentity(later)).toEqual(m5ProviderReadinessEvaluationIdentity(build().evaluation));
    const state = build();
    const afterExpiryEvaluation = evaluateM5ProviderReadinessConfig({ config: state.raw, evaluatedAt: expiry });
    const afterExpiry = evaluateM5ProviderReadinessAggregate({ config: state.config, sources: [{ sourceId: state.source.sourceId, config: state.raw, evaluation: afterExpiryEvaluation }], evaluatedAt: expiry });
    expect(afterExpiry.result).toBe("BLOCKED");
    expect(afterExpiry.aggregateFingerprint).not.toBe(state.run().aggregateFingerprint);
  });

  it("blocks absent assignments and invalidates duplicate or incorrect assignments", () => {
    const state = build();
    const assignments = (state.config as { capabilityAssignments: TestAssignment[] }).capabilityAssignments;
    const noSource = { ...state.config, capabilityAssignments: assignments.map(row => row.capability === "HOLDER_FINALITY" ? { ...row, sourceIds: [] } : row) };
    expect(evaluateM5ProviderReadinessAggregate({ config: noSource, sources: [{ sourceId: state.source.sourceId, config: state.raw, evaluation: state.evaluation }], evaluatedAt: now }).blockers).toContain("M5_AGGREGATE_SOURCE_MISSING");
    const absentAllOf = { ...state.config, capabilityAssignments: assignments.map(row => row.capability === "DAILY_CLOSE_SERIES" ? { ...row, sourceIds: [state.source.sourceId, "missing-source"] } : row) };
    expect(evaluateM5ProviderReadinessAggregate({ config: absentAllOf, sources: [{ sourceId: state.source.sourceId, config: state.raw, evaluation: state.evaluation }], evaluatedAt: now }).blockers).toContain("M5_AGGREGATE_SOURCE_MISSING");
    const duplicate = { ...state.config, capabilityAssignments: [...(state.config as { capabilityAssignments: unknown[] }).capabilityAssignments, (state.config as { capabilityAssignments: unknown[] }).capabilityAssignments[0]] };
    expect(evaluateM5ProviderReadinessAggregate({ config: duplicate, sources: [], evaluatedAt: now }).result).toBe("INVALID");
    const duplicateUsage = { ...state.config, usageDecisions: [...(state.config as { usageDecisions: TestUsageDecision[] }).usageDecisions, (state.config as { usageDecisions: TestUsageDecision[] }).usageDecisions[0]] };
    expect(evaluateM5ProviderReadinessAggregate({ config: duplicateUsage, sources: [], evaluatedAt: now }).result).toBe("INVALID");
    const unused = { ...state.config, sources: [ ...(state.config as { sources: unknown[] }).sources, { ...state.source, providerId: "other-provider" }] };
    expect(evaluateM5ProviderReadinessAggregate({ config: unused, sources: [{ sourceId: state.source.sourceId, config: state.raw, evaluation: state.evaluation }], evaluatedAt: now }).result).toBe("INVALID");
    const secondRaw = providerConfig({ reviewReference: "review/synthetic-aggregate/revision-2" });
    const secondEval = evaluateM5ProviderReadinessConfig({ config: secondRaw, evaluatedAt: now });
    const secondSource = bindM5ProviderReadinessAggregateSource(secondRaw, secondEval);
    expect(() => parseM5ProviderReadinessAggregateConfig({ ...state.config, sources: [state.source, secondSource] })).toThrow("M5_AGGREGATE_DUPLICATE_SOURCE_SCOPE");
  });

  it("blocks partial/top-N/unknown capability evidence without upgrading completeness", () => {
    const raw = providerConfig({ capabilities: (providerConfig().capabilities as { capability: string; completeness: string }[]).map(row => row.capability === "LIQUIDITY_COMPLETE_SET" ? { ...row, completeness: "TOP_N_ONLY" } : row) });
    const evaluation = evaluateM5ProviderReadinessConfig({ config: raw, evaluatedAt: now });
    const source = bindM5ProviderReadinessAggregateSource(raw, evaluation);
    const base = build();
    const config = { ...base.config, sources: [source], capabilityAssignments: (base.config as { capabilityAssignments: TestAssignment[] }).capabilityAssignments.map(row => ({ ...row, sourceIds: row.sourceIds.length ? [source.sourceId] : [] })), usageDecisions: (base.config as { usageDecisions: TestUsageDecision[] }).usageDecisions.map(row => ({ ...row, sourceId: source.sourceId })) };
    const result = evaluateM5ProviderReadinessAggregate({ config, sources: [{ sourceId: source.sourceId, config: raw, evaluation }], evaluatedAt: now });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers).toContain("M5_AGGREGATE_CAPABILITY_INCOMPLETE");
  });

  it("applies ALL_OF to every explicitly assigned source", () => {
    const first = build();
    const secondRaw = providerConfig({ providerId: "second-provider", providerNamespace: "second:provider", datasetId: "second-dataset", datasetVersion: "second-dataset/v1",
      capabilities: (providerConfig().capabilities as { capability: string; completeness: string }[]).map(row => row.capability === "DAILY_CLOSE_SERIES" ? { ...row, completeness: "PARTIAL" } : row) });
    const secondEvaluation = evaluateM5ProviderReadinessConfig({ config: secondRaw, evaluatedAt: now });
    const second = bindM5ProviderReadinessAggregateSource(secondRaw, secondEvaluation);
    const firstAssignments = (first.config as { capabilityAssignments: TestAssignment[] }).capabilityAssignments.map(row => row.capability === "DAILY_CLOSE_SERIES" ? { ...row, sourceIds: [first.source.sourceId, second.sourceId] } : row);
    const usageDecisions = [
      ...(first.config as { usageDecisions: TestUsageDecision[] }).usageDecisions,
      ...M5_AGGREGATE_USAGES.map(usage => ({ sourceId: second.sourceId, usage, approval: "APPROVED", reviewedAt: now, reviewReference: refs, approvalExpiresAt: expiry })),
    ];
    const config = { ...first.config, sources: [first.source, second], capabilityAssignments: firstAssignments, usageDecisions };
    const result = evaluateM5ProviderReadinessAggregate({ config, sources: [
      { sourceId: first.source.sourceId, config: first.raw, evaluation: first.evaluation },
      { sourceId: second.sourceId, config: secondRaw, evaluation: secondEvaluation },
    ], evaluatedAt: now });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers).toContain("M5_AGGREGATE_CAPABILITY_INCOMPLETE");
  });

  it("does not carry usage approval between independently scoped providers", () => {
    const first = build();
    const secondRaw = providerConfig({ providerId: "second-provider", providerNamespace: "second:provider", datasetId: "second-dataset", datasetVersion: "second-dataset/v1" });
    const secondEvaluation = evaluateM5ProviderReadinessConfig({ config: secondRaw, evaluatedAt: now });
    const second = bindM5ProviderReadinessAggregateSource(secondRaw, secondEvaluation);
    const assignments = (first.config as { capabilityAssignments: TestAssignment[] }).capabilityAssignments.map(row => ({ ...row, sourceIds: [first.source.sourceId, second.sourceId] }));
    const usages = [
      ...(first.config as { usageDecisions: TestUsageDecision[] }).usageDecisions,
      ...M5_AGGREGATE_USAGES.map(usage => ({ sourceId: second.sourceId, usage, approval: usage === "COMMERCIAL_USE" ? "REQUIRES_APPROVAL" : "APPROVED", reviewedAt: now, reviewReference: refs, ...(usage === "COMMERCIAL_USE" ? {} : { approvalExpiresAt: expiry }) })),
    ];
    const config = { ...first.config, sources: [first.source, second], capabilityAssignments: assignments, usageDecisions: usages };
    const result = evaluateM5ProviderReadinessAggregate({ config, sources: [
      { sourceId: first.source.sourceId, config: first.raw, evaluation: first.evaluation },
      { sourceId: second.sourceId, config: secondRaw, evaluation: secondEvaluation },
    ], evaluatedAt: now });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers).toContain("M5_AGGREGATE_USAGE_REQUIRES_APPROVAL");
    const swappedScopes = evaluateM5ProviderReadinessAggregate({ config, sources: [
      { sourceId: first.source.sourceId, config: secondRaw, evaluation: secondEvaluation },
      { sourceId: second.sourceId, config: first.raw, evaluation: first.evaluation },
    ], evaluatedAt: now });
    expect(swappedScopes.result).toBe("INVALID");
    expect(swappedScopes.blockers).toContain("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
  });

  it("requires authentic, scope-matched exact source fingerprints", () => {
    const state = build();
    expect(evaluateM5ProviderReadinessAggregate({ config: state.config, sources: [{ sourceId: state.source.sourceId, config: state.raw, evaluation: { ...state.evaluation } }], evaluatedAt: now }).blockers).toContain("M5_AGGREGATE_SOURCE_NOT_AUTHENTIC");
    expect(evaluateM5ProviderReadinessAggregate({ config: state.config, sources: [{ sourceId: state.source.sourceId, config: state.raw, evaluation: { ...state.evaluation } }], evaluatedAt: now }).result).toBe("INVALID");
    expect(evaluateM5ProviderReadinessAggregate({ config: state.config, sources: [{ sourceId: state.source.sourceId, config: providerConfig({ datasetId: "other" }), evaluation: state.evaluation }], evaluatedAt: now }).blockers).toContain("M5_AGGREGATE_SOURCE_SCOPE_MISMATCH");
    expect(() => assertM5ProviderReadinessAggregateForExecution(state.run(), { asOf: now, aggregateId: "other", aggregateFingerprint: "x", sources: [], capabilityAssignments: [], usages: [] })).toThrow();
    const other = build({ aggregateId: "other-stack" });
    const expected = state.run(); const swapped = other.run();
    expect(() => assertM5ProviderReadinessAggregateForExecution(swapped, { asOf: now, aggregateId: expected.aggregateId, aggregateFingerprint: expected.aggregateFingerprint, sources: expected.sources, capabilityAssignments: expected.capabilityAssignments, usages: expected.usageDecisions })).toThrow("M5_PROVIDER_READINESS_AGGREGATE_SCOPE_MISMATCH");
    const futureEvaluation = evaluateM5ProviderReadinessConfig({ config: state.raw, evaluatedAt: "2026-09-26T12:00:00.000Z" });
    expect(evaluateM5ProviderReadinessAggregate({ config: state.config, sources: [{ sourceId: state.source.sourceId, config: state.raw, evaluation: futureEvaluation }], evaluatedAt: now }).result).toBe("INVALID");
  });

  it("blocks usage approval from one usage or provider being generalized to the rest", () => {
    const decisions = (build().config as { usageDecisions: TestUsageDecision[] }).usageDecisions;
    const state = build({ usageDecisions: decisions.map(row => row.usage === "RAW_PAYLOAD_STORAGE" ? { ...row, approval: "REQUIRES_APPROVAL" } : row) });
    expect(state.run().blockers).toContain("M5_AGGREGATE_USAGE_REQUIRES_APPROVAL");
    const expired = build({ usageDecisions: decisions.map(row => ({ ...row, approvalExpiresAt: "2026-09-25T12:00:01.000Z" })) }, "2026-09-25T12:00:02.000Z");
    expect(expired.run().blockers).toContain("M5_AGGREGATE_USAGE_EXPIRED");
  });

  it("keeps the checked-in production aggregate blocked with concrete capability and usage blockers", () => {
    const config = JSON.parse(readFileSync("config/m5/provider-readiness.aggregate.production.json", "utf8"));
    const provider = JSON.parse(readFileSync("config/m5/provider-readiness.production.json", "utf8"));
    const evaluation = evaluateM5ProviderReadinessConfig({ config: provider, evaluatedAt: now });
    const sourceId = config.sources[0].sourceId as string;
    const result = evaluateM5ProviderReadinessAggregate({ config, sources: [{ sourceId, config: provider, evaluation }], evaluatedAt: now });
    expect(result.result).toBe("BLOCKED");
    expect(result.blockers).toContain("M5_AGGREGATE_CAPABILITY_INCOMPLETE");
    expect(result.blockers).toContain("M5_AGGREGATE_USAGE_REQUIRES_APPROVAL");
    expect(result.sources[0]?.providerId).toBe("coingecko");
  });

  it("sanitizes malformed evaluator input without returning raw timestamps or exception text", () => {
    const result = evaluateM5ProviderReadinessAggregate({ config: { malformed: true }, sources: [], evaluatedAt: "credential-secret-value" });
    expect(result.result).toBe("INVALID");
    expect(result.evaluatedAt).toBe("");
    expect(JSON.stringify(result)).not.toContain("credential-secret-value");
  });
});
