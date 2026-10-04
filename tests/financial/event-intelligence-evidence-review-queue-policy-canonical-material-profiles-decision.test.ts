import { describe, expect, it } from "vitest";
import {
  POLICY_CANONICAL_MATERIAL_PROFILES_DECISION as decision,
  POLICY_CANONICAL_MATERIAL_PROFILES_PRODUCTION_CONFIG as config,
  parsePolicyCanonicalMaterialProfilesDecision,
  parsePolicyCanonicalMaterialProfilesProductionConfig,
} from "@/domain/intelligence/event-intelligence-evidence-review-queue-policy-canonical-material-profiles-decision";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("policy canonical material profiles decision", () => {
  it("accepts only the fixed versioned recommendation and keeps every profile inactive", () => {
    const parsed = parsePolicyCanonicalMaterialProfilesDecision(clone(decision));
    expect(parsed.status).toBe("VALID_DECISION_ONLY_BLOCKED_UPSTREAM");
    expect(decision.status).toBe("DECISION_ONLY_BLOCKED_UPSTREAM");
    expect(decision.profiles).toHaveLength(4);
    expect(decision.profiles.map(profile => profile.disposition)).toEqual(Array(4).fill("RECOMMENDED_NOT_IMPLEMENTED"));
    expect(decision.profiles.every(profile => profile.requiresNewScopeMaterialVersion)).toBe(true);
    expect(decision.canonicalProfile.preimage).toContain("event-intelligence-policy-content-identity/v1\\0");
    expect(decision.canonicalProfile.preimageFieldRules).toContain("exactly one 0x00 byte");
    expect(decision.canonicalProfile.preimageFieldRules).toContain("contain no NUL");
    expect(decision.canonicalProfile.schemaRules.join(" ")).toContain("minimal base-10");
    expect(decision.canonicalProfile.schemaRules.join(" ")).toContain("lowercase \\u00xx");
    expect(Object.isFrozen(decision)).toBe(true);
    expect(Object.isFrozen(decision.profiles[0].requiredSemantics)).toBe(true);
  });

  it("rejects unknown versions, nested fields, omissions, and changed fixed recommendations", () => {
    expect(parsePolicyCanonicalMaterialProfilesDecision({ ...clone(decision), contractVersion: "future/v2" }).status).toBe("INVALID");
    const extra = clone(decision) as Record<string, unknown>;
    (extra.canonicalProfile as Record<string, unknown>).unreviewed = true;
    expect(parsePolicyCanonicalMaterialProfilesDecision(extra).status).toBe("INVALID");
    const missing = clone(decision) as Record<string, unknown>;
    delete missing.blockers;
    expect(parsePolicyCanonicalMaterialProfilesDecision(missing).status).toBe("INVALID");
    const changed = clone(decision) as unknown as { profiles: Array<Record<string, unknown>> };
    changed.profiles[0].materialProfileVersion = "active/profile/v1";
    expect(parsePolicyCanonicalMaterialProfilesDecision(changed).status).toBe("INVALID");
    const future = clone(decision) as unknown as { profiles: Array<Record<string, unknown>> };
    future.profiles[2].currentContractVersion = "routing/v9";
    expect(parsePolicyCanonicalMaterialProfilesDecision(future).status).toBe("INVALID");
  });

  it("rejects getters without invoking them, sparse arrays, cycles, and unsupported values", () => {
    let invoked = 0;
    const getter = clone(decision) as Record<string, unknown>;
    Object.defineProperty(getter, "status", { enumerable: true, get: () => { invoked++; return decision.status; } });
    expect(parsePolicyCanonicalMaterialProfilesDecision(getter).status).toBe("INVALID");
    expect(invoked).toBe(0);

    const sparse = clone(decision) as unknown as { blockers: string[] };
    sparse.blockers = new Array(2) as string[];
    expect(parsePolicyCanonicalMaterialProfilesDecision(sparse).status).toBe("INVALID");

    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(parsePolicyCanonicalMaterialProfilesDecision(cycle).status).toBe("INVALID");
    expect(parsePolicyCanonicalMaterialProfilesDecision({ ...clone(decision), extra: undefined }).status).toBe("INVALID");
    const symbol = clone(decision) as Record<symbol, unknown>;
    symbol[Symbol("extra")] = true;
    expect(parsePolicyCanonicalMaterialProfilesDecision(symbol).status).toBe("INVALID");
  });

  it("returns isolated frozen fixed material without freezing caller input", () => {
    const input = clone(decision);
    const parsed = parsePolicyCanonicalMaterialProfilesDecision(input);
    expect(parsed.status).toBe("VALID_DECISION_ONLY_BLOCKED_UPSTREAM");
    expect(Object.isFrozen(input)).toBe(false);
    if (parsed.status === "VALID_DECISION_ONLY_BLOCKED_UPSTREAM") {
      expect(parsed.decision).toBe(decision);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(Object.isFrozen(parsed.decision.canonicalProfile.schemaRules)).toBe(true);
      expect(Reflect.set(parsed.decision.profiles[0], "family", "FORGED")).toBe(false);
    }
  });
});

describe("policy canonical material profiles blocked production config", () => {
  it("accepts only the exact blocked config", () => {
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig(clone(config))).toEqual({ status: "VALID_BLOCKED", config });
    expect(config.selectedMaterialVerificationStrategy).toBeNull();
    expect(config.selectedPolicyResolver).toBeNull();
    expect(config.activeProfileRegistry).toEqual([]);
    expect(config.activePolicyRegistry).toEqual([]);
    expect(config.activeProducerRegistry).toEqual([]);
    expect(config.contentVerification).toBe("BLOCKED");
    expect(config.applicationEvidence).toBe("BLOCKED");
    expect(config.producer).toBe("BLOCKED");
    expect(Object.values(config.approvals).every(value => value === "NOT_APPROVED")).toBe(true);
    expect(config.persistence).toBe("BLOCKED");
    expect(config.storageRead).toBe("BLOCKED");
    expect(config.currentSelection).toBe("BLOCKED");
    expect(config.authorityUpgrade).toBe("UNSUPPORTED");
    expect(config.signal).toBe("BLOCKED");
    expect(config.trading).toBe("BLOCKED");
  });

  it("rejects resolver/strategy selection, registries, approval changes, and missing blockers", () => {
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig({ ...clone(config), selectedPolicyResolver: "resolver/v1" }).status).toBe("INVALID");
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig({ ...clone(config), selectedMaterialVerificationStrategy: "sha256/v1" }).status).toBe("INVALID");
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig({ ...clone(config), activeProfileRegistry: ["profile"] }).status).toBe("INVALID");
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig({ ...clone(config), activePolicyRegistry: ["policy"] }).status).toBe("INVALID");
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig({ ...clone(config), activeProducerRegistry: ["producer"] }).status).toBe("INVALID");
    const approval = clone(config);
    approval.approvals.rights = "APPROVED";
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig(approval).status).toBe("INVALID");
    const missing = clone(config) as Record<string, unknown>;
    delete missing.contentVerification;
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig(missing).status).toBe("INVALID");
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig({ ...clone(config), currentSelection: "ACTIVE" }).status).toBe("INVALID");
  });

  it("rejects future versions and accessors without executing them", () => {
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig({ ...clone(config), contractVersion: "future/v2" }).status).toBe("INVALID");
    let invoked = 0;
    const getter = clone(config) as Record<string, unknown>;
    Object.defineProperty(getter, "producer", { enumerable: true, get: () => { invoked++; return "BLOCKED"; } });
    expect(parsePolicyCanonicalMaterialProfilesProductionConfig(getter).status).toBe("INVALID");
    expect(invoked).toBe(0);
  });
});
