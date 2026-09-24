import { describe, expect, it } from "vitest";
import { createM5SuspiciousCoverageAuthority } from "@/domain/intelligence/m5-suspicious-coverage";
import { constructM5SuspiciousCoverage } from "@/application/intelligence/create-m5-suspicious-coverage";

const base = () => ({
  contractVersion: "m5-suspicious-coverage-authority/v1" as const,
  ruleSetAuthorityId: "m5-suspicious-ruleset:rules",
  ruleSetFingerprint: "a".repeat(64), providerId: "provider", datasetId: "dataset", datasetVersion: "v1",
  mappingRevisionId: "mapping", providerAssetIdentityAssertionId: "identity", sourceLineageId: "lineage", sourceLineageFingerprint: "b".repeat(64),
  candidateId: "candidate", assetId: "asset", canonicalIdentifier: "asset:one", assetClass: "CRYPTO", asOf: "2026-09-20T00:00:00.000Z",
  requiredRuleIds: ["RULE_A", "RULE_B"], evaluatedRuleIds: ["RULE_B", "RULE_A"], status: "COMPLETE" as const,
  materials: [{ materialId: "material-1", artifactId: "artifact-1", envelopeId: "envelope-1", observationId: "observation-1", payloadFingerprint: "c".repeat(64), observedAt: "2026-09-18T00:00:00.000Z", availableAt: "2026-09-19T00:00:00.000Z" }],
  observedAt: "2026-09-18T00:00:00.000Z", availableAt: "2026-09-19T00:00:00.000Z", recordedAt: "2026-09-20T00:00:00.000Z",
});

describe("M5 suspicious coverage authority", () => {
  it("normalizes permutations and excludes recordedAt", () => {
    const first = createM5SuspiciousCoverageAuthority(base());
    const second = createM5SuspiciousCoverageAuthority({ ...base(), recordedAt: "2026-09-21T00:00:00.000Z", requiredRuleIds: ["RULE_B", "RULE_A"] });
    expect(first.coverageAuthorityId).toBe(second.coverageAuthorityId);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(Object.isFrozen(first)).toBe(true);
  });
  it("rejects duplicate material and incomplete complete coverage", () => {
    expect(() => createM5SuspiciousCoverageAuthority({ ...base(), materials: [base().materials[0], base().materials[0]] })).toThrow("DUPLICATE_MATERIAL");
    expect(constructM5SuspiciousCoverage({ ...base(), status: "INCOMPLETE", evaluatedRuleIds: ["RULE_A"] }).status).toBe("INCOMPLETE");
  });
  it("rejects missing evaluated rules for COMPLETE", () => {
    expect(() => createM5SuspiciousCoverageAuthority({ ...base(), evaluatedRuleIds: ["RULE_A"] })).toThrow("NOT_COMPLETE");
  });
  it("detects material sensitivity", () => {
    const first = createM5SuspiciousCoverageAuthority(base());
    const second = createM5SuspiciousCoverageAuthority({ ...base(), materials: [{ ...base().materials[0], payloadFingerprint: "d".repeat(64) }] });
    expect(second.fingerprint).not.toBe(first.fingerprint);
  });
});
