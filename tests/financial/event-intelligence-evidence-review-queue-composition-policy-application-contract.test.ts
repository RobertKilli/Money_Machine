import { describe, expect, it } from "vitest";
import { buildEvidenceReviewQueueScopeIdentity } from "@/domain/intelligence/event-intelligence-evidence-review-queue-scope-identity";
import {
  COMPOSITION_POLICY_APPLICATION_EVIDENCE_VERSION,
  COMPOSITION_POLICY_APPLICATION_PRODUCTION_CONFIG as config,
  parseCompositionPolicyApplicationEvidence,
  parseCompositionPolicyApplicationProductionConfig,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-composition-policy-application-contract";
import { EVENT_INTELLIGENCE_QUEUE_COMPOSITION_VERSION } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import { EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE, EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION } from "@/domain/intelligence/event-intelligence-evidence-review-queue-scope-identity";
import { EVIDENCE_REVIEW_QUEUE_VERSION } from "@/domain/intelligence/event-intelligence-evidence-review-queue";
import { SOURCE_PORTFOLIO_DECISION_VERSION } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const digest = (char: string) => char.repeat(64);
function scope() {
  return {
    scopeMaterialVersion: EVIDENCE_QUEUE_SCOPE_MATERIAL_VERSION,
    canonicalizationProfile: EVIDENCE_QUEUE_SCOPE_CANONICALIZATION_PROFILE,
    reviewPurposePolicyVersion: "event-intelligence-review-purpose/v1",
    reviewPurpose: "FORMAL_ISSUER_DISCLOSURE_REVIEW",
    jurisdictionUniverse: ["US_SEC", "GB_LSE"],
    eventRepresentationUniverse: ["COMPLETED_PURCHASE", "PURCHASE_INTENT"],
    assetRepresentationUniverse: ["asset-representation/v1/ethereum-native"],
    issuerListingEligibilityPolicy: { policyId: "issuer-listing", version: "v1", canonicalMaterialDigest: digest("a") },
    sourcePortfolioPolicy: { contractVersion: SOURCE_PORTFOLIO_DECISION_VERSION, canonicalMaterialDigest: digest("b") },
    routingPolicy: { policyId: "event-routing", version: "v1", canonicalMaterialDigest: digest("c") },
    queueContract: { contractVersion: EVIDENCE_REVIEW_QUEUE_VERSION, canonicalMaterialDigest: digest("d") },
    accessClassificationPolicyVersion: "event-intelligence-review-access-classification/v1",
    accessClassification: "INTERNAL_RESTRICTED",
  };
}
function evidence() {
  const material = scope();
  const identity = buildEvidenceReviewQueueScopeIdentity(material);
  if (identity.status !== "VALID_SYNTAX_ONLY") throw new Error("fixture invalid");
  return {
    contractVersion: COMPOSITION_POLICY_APPLICATION_EVIDENCE_VERSION,
    scopeIdentity: identity.identity,
    expectedScopeMaterial: material,
    declaredAppliedScopeMaterial: clone(material),
    evaluation: {
      compositionContractVersion: EVENT_INTELLIGENCE_QUEUE_COMPOSITION_VERSION,
      evaluationAsOf: "2026-10-04T12:30:00.000Z",
      resultBinding: "MISSING_RUNTIME_RESULT_BINDING",
    },
  };
}

describe("composition policy application evidence contract", () => {
  it("accepts matching syntax while explicitly retaining missing runtime result binding", () => {
    const result = parseCompositionPolicyApplicationEvidence(evidence());
    expect(result.status).toBe("VALID_SYNTAX_ONLY_NON_AUTHORITATIVE");
    if (result.status === "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") {
      expect(result.evidence.scopeIdentity).toMatch(/^eviqs1_[a-f0-9]{64}$/);
      expect(result.evidence.evaluation.resultBinding).toBe("MISSING_RUNTIME_RESULT_BINDING");
      expect(Object.isFrozen(result.evidence)).toBe(true);
      expect(Object.isFrozen(result.evidence.expectedScopeMaterial.jurisdictionUniverse)).toBe(true);
      expect(Object.isFrozen(result.evidence.declaredAppliedScopeMaterial.routingPolicy)).toBe(true);
    }
  });

  it("rejects nested mismatch, unknown/missing fields, unpinned versions, and forged trust claims", () => {
    const changed = evidence();
    changed.declaredAppliedScopeMaterial.routingPolicy.version = "v2";
    expect(parseCompositionPolicyApplicationEvidence(changed).status).toBe("INVALID");
    const nested = { ...evidence(), evaluation: { ...evidence().evaluation, approved: true } };
    expect(parseCompositionPolicyApplicationEvidence(nested).status).toBe("INVALID");
    const missing = evidence() as unknown as Record<string, unknown>;
    delete missing.declaredAppliedScopeMaterial;
    expect(parseCompositionPolicyApplicationEvidence(missing).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationEvidence({ ...evidence(), contractVersion: `${COMPOSITION_POLICY_APPLICATION_EVIDENCE_VERSION.slice(0, -1)}2` }).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationEvidence({ ...evidence(), evaluation: { ...evidence().evaluation, compositionContractVersion: "future/v2" } }).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationEvidence({ ...evidence(), evaluation: { ...evidence().evaluation, evaluationAsOf: "2026-02-30T12:30:00.000Z" } }).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationEvidence({ ...evidence(), evaluation: { ...evidence().evaluation, resultBinding: "TRUSTED" } }).status).toBe("INVALID");
  });

  it("does not invoke getters, accepts no sparse arrays, and isolates parsed output", () => {
    let calls = 0;
    const getter = Object.defineProperty(evidence(), "scopeIdentity", { enumerable: true, get: () => { calls++; return "eviqs1_" + digest("0"); } });
    expect(parseCompositionPolicyApplicationEvidence(getter).status).toBe("INVALID");
    expect(calls).toBe(0);
    const sparse = evidence();
    sparse.expectedScopeMaterial.jurisdictionUniverse = new Array(1) as unknown as string[];
    expect(parseCompositionPolicyApplicationEvidence(sparse).status).toBe("INVALID");
    const input = evidence();
    const result = parseCompositionPolicyApplicationEvidence(input);
    input.expectedScopeMaterial.assetRepresentationUniverse[0] = "asset-representation/v1/changed";
    if (result.status === "VALID_SYNTAX_ONLY_NON_AUTHORITATIVE") {
      expect(result.evidence.expectedScopeMaterial.assetRepresentationUniverse[0]).toBe("asset-representation/v1/ethereum-native");
      expect(Object.isFrozen(input.expectedScopeMaterial)).toBe(false);
    } else throw new Error("fixture rejected");
  });
});

describe("composition policy application blocked config", () => {
  it("accepts only exact blocked state", () => {
    expect(parseCompositionPolicyApplicationProductionConfig(clone(config))).toEqual({ status: "VALID_BLOCKED", config });
    expect(config.applicationEvidenceActivation).toBe("BLOCKED");
    expect(config.selectedApplicationStrategy).toBeNull();
    expect(config.selectedProducer).toBeNull();
    expect(config.selectedAuthorityStrategy).toBeNull();
    expect(config.activeApplicationRegistry).toEqual([]);
    expect(config.activeScopeRegistry).toEqual([]);
    expect(config.activeProducerRegistry).toEqual([]);
    expect(config.activeProvenanceRegistry).toEqual([]);
    expect(Object.values(config.approvals).every(value => value === "NOT_APPROVED")).toBe(true);
    expect(config.producerActivation).toBe("BLOCKED");
    expect(config.currentSelection).toBe("BLOCKED");
    expect(config.authorityUpgrade).toBe("UNSUPPORTED");
    expect(config.signal).toBe("BLOCKED");
    expect(config.trading).toBe("BLOCKED");
  });

  it("rejects activation, registry, approval, missing blockers, and accessor attempts", () => {
    expect(parseCompositionPolicyApplicationProductionConfig({ ...clone(config), applicationEvidenceActivation: "ACTIVE" }).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationProductionConfig({ ...clone(config), selectedApplicationStrategy: "strategy/v1" }).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationProductionConfig({ ...clone(config), selectedAuthorityStrategy: "authority/v1" }).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationProductionConfig({ ...clone(config), activeApplicationRegistry: ["registry"] }).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationProductionConfig({ ...clone(config), activeScopeRegistry: ["scope"] }).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationProductionConfig({ ...clone(config), activeProducerRegistry: ["producer"] }).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationProductionConfig({ ...clone(config), activeProvenanceRegistry: ["family"] }).status).toBe("INVALID");
    const changedApproval = clone(config);
    changedApproval.approvals.policyContent = "APPROVED";
    expect(parseCompositionPolicyApplicationProductionConfig(changedApproval).status).toBe("INVALID");
    const missing = clone(config) as unknown as Record<string, unknown>;
    delete missing.currentSelection;
    expect(parseCompositionPolicyApplicationProductionConfig(missing).status).toBe("INVALID");
    expect(parseCompositionPolicyApplicationProductionConfig({ ...clone(config), deletion: "APPROVED" }).status).toBe("INVALID");
    let calls = 0;
    const getter = Object.defineProperty(clone(config), "producerActivation", { enumerable: true, get: () => { calls++; return "BLOCKED"; } });
    expect(parseCompositionPolicyApplicationProductionConfig(getter).status).toBe("INVALID");
    expect(calls).toBe(0);
  });
});
