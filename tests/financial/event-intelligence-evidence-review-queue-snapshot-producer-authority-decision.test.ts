import { describe, expect, it } from "vitest";
import {
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PRODUCER_AUTHORITY_DECISION as decision,
  EVIDENCE_REVIEW_QUEUE_SNAPSHOT_PRODUCER_PRODUCTION_CONFIG as config,
  parseEvidenceReviewQueueSnapshotProducerAuthorityDecision,
  parseEvidenceReviewQueueSnapshotProducerProductionConfig,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-producer-authority-decision";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("snapshot producer authority decision", () => {
  it("parses the exact versioned recommendation as decision-only and blocked upstream", () => {
    const result = parseEvidenceReviewQueueSnapshotProducerAuthorityDecision(clone(decision));
    expect(result.status).toBe("VALID_DECISION_ONLY_BLOCKED_UPSTREAM");
    expect(result.status === "VALID_DECISION_ONLY_BLOCKED_UPSTREAM" && result.decision).toBe(decision);
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.familyRules)).toBe(true);
    expect(decision.familyRules.map(rule => rule.family)).toEqual([
      "SEC_EVENT_DOCUMENT", "ISSUER_EVIDENCE", "ASSET_MAPPING_REVISION", "DISCOVERY_SOURCE_RECORD",
      "CORRECTION_LINEAGE", "DERIVED_COMPOSITION", "DERIVED_QUEUE_SET", "DERIVED_VIEW_MODEL",
    ]);
    expect(decision.capacity).toEqual({ viewModelItems: 512, snapshotBytes: 1_048_576, manifestMembers: 128, manifestBytes: 786_432, scopeMaterialBytes: 18_264, overflow: "FAIL_CLOSED_NO_TRUNCATION_OR_IMPLICIT_BATCHING" });
    expect(decision.semantics.scopePolicyApplication).toContain("no scope or policy binding");
    expect(decision.semantics.completeness).toContain("cannot prove that graph");
  });

  it("rejects unknown versions, fields, and nested-field changes", () => {
    expect(parseEvidenceReviewQueueSnapshotProducerAuthorityDecision({ ...clone(decision), contractVersion: "event-intelligence-evidence-review-queue-snapshot-producer-authority-decision/v2" }).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueSnapshotProducerAuthorityDecision({ ...clone(decision), futureReady: true }).status).toBe("INVALID");
    const nested = clone(decision) as unknown as { semantics: Record<string, unknown> };
    nested.semantics.unreviewedClaim = "ready";
    expect(parseEvidenceReviewQueueSnapshotProducerAuthorityDecision(nested).status).toBe("INVALID");
    const omitted = clone(decision) as unknown as { requiredProducerInputs: unknown[] };
    omitted.requiredProducerInputs.pop();
    expect(parseEvidenceReviewQueueSnapshotProducerAuthorityDecision(omitted).status).toBe("INVALID");
  });

  it("rejects accessors, sparse arrays, and caller mutation without invoking getters", () => {
    let calls = 0;
    const getter = Object.defineProperty(clone(decision), "status", { enumerable: true, get: () => { calls++; return "DECISION_ONLY_BLOCKED_UPSTREAM"; } });
    expect(parseEvidenceReviewQueueSnapshotProducerAuthorityDecision(getter).status).toBe("INVALID");
    expect(calls).toBe(0);
    const sparse = clone(decision) as unknown as { requiredProducerInputs: string[] };
    sparse.requiredProducerInputs = new Array(sparse.requiredProducerInputs.length);
    expect(parseEvidenceReviewQueueSnapshotProducerAuthorityDecision(sparse).status).toBe("INVALID");
    const cyclic = clone(decision) as unknown as { provenanceClosure: unknown[] };
    cyclic.provenanceClosure = [cyclic];
    expect(parseEvidenceReviewQueueSnapshotProducerAuthorityDecision(cyclic).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueSnapshotProducerAuthorityDecision(Object.assign(Object.create({ inherited: true }), clone(decision))).status).toBe("INVALID");
    const input = clone(decision) as unknown as { recommendation: string };
    const accepted = parseEvidenceReviewQueueSnapshotProducerAuthorityDecision(input);
    input.recommendation = "CALLER_CHANGED";
    expect(accepted.status === "VALID_DECISION_ONLY_BLOCKED_UPSTREAM" && accepted.decision.recommendation).toBe("FUTURE_AUTHENTIC_PRODUCER_REQUIRED_BLOCKED_FOR_RUNTIME");
    expect(Object.isFrozen(input)).toBe(false);
  });
});

describe("snapshot producer production config", () => {
  it("accepts only the exact blocked config with empty registries and unapproved rights", () => {
    const result = parseEvidenceReviewQueueSnapshotProducerProductionConfig(clone(config));
    expect(result).toEqual({ status: "VALID_BLOCKED", config });
    expect(config.producerActivation).toBe("BLOCKED");
    expect(config.selectedProducer).toBeNull();
    expect(config.selectedAuthorityStrategy).toBeNull();
    expect(config.activeProducerRegistry).toEqual([]);
    expect(config.activeScopeRegistry).toEqual([]);
    expect(config.activeProvenanceRegistry).toEqual([]);
    expect(Object.values(config.approvals).every(value => value === "NOT_APPROVED")).toBe(true);
    expect(config.persistence).toBe("BLOCKED");
    expect(config.readPath).toBe("BLOCKED");
    expect(config.currentSelection).toBe("BLOCKED");
    expect(config.authorityUpgrade).toBe("UNSUPPORTED");
    expect(config.signal).toBe("BLOCKED");
    expect(config.trading).toBe("BLOCKED");
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.approvals)).toBe(true);
  });

  it("rejects activation, selected authority, registry contents, approvals, and omitted blockers", () => {
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig({ ...clone(config), producerActivation: "ACTIVE" }).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig({ ...clone(config), selectedProducer: "producer/v1" }).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig({ ...clone(config), selectedAuthorityStrategy: "strategy/v1" }).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig({ ...clone(config), activeProducerRegistry: ["producer"] }).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig({ ...clone(config), activeScopeRegistry: ["scope"] }).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig({ ...clone(config), activeProvenanceRegistry: ["family"] }).status).toBe("INVALID");
    const approved = clone(config);
    approved.approvals.deletion = "APPROVED";
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig(approved).status).toBe("INVALID");
    const missing = clone(config) as unknown as Record<string, unknown>;
    delete missing.currentSelection;
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig(missing).status).toBe("INVALID");
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig({ ...clone(config), authorityUpgrade: "SUPPORTED" }).status).toBe("INVALID");
  });

  it("rejects getters without invocation and sparse active registries", () => {
    let calls = 0;
    const getter = Object.defineProperty(clone(config), "producerActivation", { enumerable: true, get: () => { calls++; return "BLOCKED"; } });
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig(getter).status).toBe("INVALID");
    expect(calls).toBe(0);
    const sparse = clone(config) as unknown as { activeProducerRegistry: unknown[] };
    sparse.activeProducerRegistry = new Array(1);
    expect(parseEvidenceReviewQueueSnapshotProducerProductionConfig(sparse).status).toBe("INVALID");
  });
});
