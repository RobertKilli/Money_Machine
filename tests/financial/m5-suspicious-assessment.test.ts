import { describe, expect, it } from "vitest";
import { encodeM5DatasetPin } from "@/domain/intelligence/m5-dataset-pin";
import { createAssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import { createSuspiciousEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import { createM5SuspiciousRuleSetAuthority, createM5SuspiciousRuleSetAuthorityResolver } from "@/domain/intelligence/m5-suspicious-rule-set";
import { createM5SuspiciousAssessment, m5SuspiciousAssessmentIdFor } from "@/domain/intelligence/m5-suspicious-assessment";
import { createM5SuspiciousAssessmentAuthority } from "@/application/intelligence/create-m5-suspicious-assessment";
import type { M5SuspiciousAssessmentRepositories } from "@/application/intelligence/m5-suspicious-assessment-repository";

const observedAt = "2026-01-01T00:00:00.000Z";
const availableAt = "2026-01-01T01:00:00.000Z";
const asOf = "2026-01-02T00:00:00.000Z";
const pin = encodeM5DatasetPin({ providerId: "provider", datasetId: "dataset", datasetVersion: "v1" });
const base = () => ({
  contractVersion: "m5-suspicious-assessment/v1" as const,
  providerId: "provider", datasetId: "dataset", datasetVersion: "v1", candidateId: "candidate", assetId: "canonical-asset", canonicalIdentifier: "asset:canonical", assetClass: "TOKEN",
  mappingRevisionId: "m5-mapping:revision", sourceLineageId: "m5-lineage", ruleSetVersion: "rules/v1", ruleSetFingerprint: "a".repeat(64), detectorVersion: "detector/v1", coveredRuleIds: ["RULE_B", "RULE_A"], result: "NO_FINDINGS" as const, findingReferences: [], asOf, observedAt, availableAt, sourceRecordIds: ["artifact-1"], payloadFingerprint: "b".repeat(64), datasetPins: [pin], recordedAt: "2026-01-02T00:00:00.000Z",
});

describe("M5 suspicious assessment authority", () => {
  it("normalizes rules, produces deterministic authority, excludes recordedAt, and deep freezes", () => {
    const first = createM5SuspiciousAssessment(base());
    const second = createM5SuspiciousAssessment({ ...base(), recordedAt: "2026-01-03T00:00:00.000Z" });
    expect(first.coveredRuleIds).toEqual(["RULE_A", "RULE_B"]);
    expect(first.suspiciousAssessmentId).toBe(second.suspiciousAssessmentId);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.coveredRuleIds)).toBe(true);
    expect(() => createM5SuspiciousAssessment({ ...base(), suspiciousAssessmentId: "wrong" })).toThrow("M5_SUSPICIOUS_ASSESSMENT_ID_MISMATCH");
    expect(() => createM5SuspiciousAssessment({ ...base(), fingerprint: "c".repeat(64) })).toThrow("M5_SUSPICIOUS_ASSESSMENT_FINGERPRINT_MISMATCH");
  });

  it("requires the explicit result/finding union and rejects duplicate members", () => {
    expect(() => createM5SuspiciousAssessment({ ...base(), result: "NO_FINDINGS", findingReferences: [{ evidenceId: "e1", fingerprint: "a".repeat(64) }] })).toThrow("NO_FINDINGS_HAS_FINDINGS");
    expect(() => createM5SuspiciousAssessment({ ...base(), result: "FINDINGS_PRESENT", findingReferences: [] })).toThrow("FINDINGS_EMPTY");
    expect(() => createM5SuspiciousAssessment({ ...base(), result: "FINDINGS_PRESENT", findingReferences: [{ evidenceId: "e1", fingerprint: "a".repeat(64) }, { evidenceId: "e1", fingerprint: "b".repeat(64) }] })).toThrow("DUPLICATE_FINDING");
  });

  it("rejects noncanonical timestamps and malformed pins/fingerprints", () => {
    expect(() => createM5SuspiciousAssessment({ ...base(), observedAt: "2026-01-01T00:00:00Z" })).toThrow("OBSERVED_INVALID");
    expect(() => createM5SuspiciousAssessment({ ...base(), payloadFingerprint: "A".repeat(64) })).toThrow("PAYLOAD_FINGERPRINT_INVALID");
    expect(() => createM5SuspiciousAssessment({ ...base(), datasetPins: ["wrong"] })).toThrow();
  });

  it("keeps required rules in trusted authority and rejects duplicate rule definitions", async () => {
    const authority = createM5SuspiciousRuleSetAuthority({ contractVersion: "m5-suspicious-rule-set/v1", ruleSetVersion: "rules/v1", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", detectorVersion: "detector/v1", requiredRuleIds: ["RULE_A"] });
    const resolver = createM5SuspiciousRuleSetAuthorityResolver([authority]);
    await expect(resolver.resolve({ providerId: "provider", datasetId: "dataset", datasetVersion: "v1", ruleSetVersion: "unknown", detectorVersion: "detector/v1" })).resolves.toBeUndefined();
    expect(() => createM5SuspiciousRuleSetAuthority({ contractVersion: "m5-suspicious-rule-set/v1", ruleSetVersion: "rules/v2", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", detectorVersion: "detector/v1", requiredRuleIds: ["RULE_A", "RULE_A"] })).toThrow("DUPLICATE_RULE");
  });

  it("derives assessment from trusted rule-set, mapping, lineage and exact findings", async () => {
    const ruleSet = createM5SuspiciousRuleSetAuthority({ contractVersion: "m5-suspicious-rule-set/v1", ruleSetVersion: "rules/v1", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", detectorVersion: "detector/v1", requiredRuleIds: ["RULE_A"] });
    const mapping = createAssetMappingRevision({ mappingRevisionVersion: "m5-asset-mapping-revision/v1", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", sourceLineageId: "m5-lineage", providerAssetIdentityAssertionId: "m5-provider-asset-identity:" + "1".repeat(64), providerAssetNamespace: "eip155:1", providerAssetId: "0x" + "1".repeat(40), canonicalAssetId: "canonical-asset", canonicalIdentifier: "asset:canonical", assetClass: "TOKEN", validFrom: observedAt, observedAt, availableAt, sourceRecordIds: ["artifact-1"], payloadFingerprint: "b".repeat(64), recordedAt: "2026-01-02T00:00:00.000Z" });
    const finding = createSuspiciousEligibilityEvidence({ evidenceId: "finding-1", candidateId: "candidate", assetId: "canonical-asset", canonicalIdentifier: "asset:canonical", assetClass: "TOKEN", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: "m5-lineage", observedAt, availableAt, provenance: { sourceType: "M5_SOURCE_LINEAGE", sourceRecordIds: ["artifact-1"], payloadFingerprint: "b".repeat(64) }, flagCode: "RULE_A", severity: "HIGH", sourceSignalId: "signal-1" });
    let stored = undefined as ReturnType<typeof createM5SuspiciousAssessment> | undefined;
    const repositories: M5SuspiciousAssessmentRepositories = {
      ruleSets: createM5SuspiciousRuleSetAuthorityResolver([ruleSet]),
      mappings: { readById: async () => mapping },
      lineages: { validateForRawEvidenceCreation: async () => ({ sourceLineageId: "m5-lineage", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", sourceArtifactIds: ["artifact-1"], availabilityClaimIds: ["claim-1"], ingestionAttemptIds: ["attempt-1"], memberCount: 1, observedAt, effectiveAvailableAt: availableAt, contractVersion: "m5-source-lineage/v1", fingerprint: "b".repeat(64), recordedAt: "2026-01-02T00:00:00.000Z" }), readMembers: async () => [{ sourceLineageId: "m5-lineage", memberOrdinal: 0, availabilityClaimId: "claim-1", sourceArtifactId: "artifact-1", sourceEnvelopeId: "envelope-1", sourceObservationId: "observation-1", ingestionAttemptId: "attempt-1", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", observedAt, effectiveAvailableAt: availableAt, memberFingerprint: "c".repeat(64) }] },
      findings: { readExact: async () => [finding] },
      assessments: { save: async value => { stored = value; return value; }, readById: async () => stored },
      memberships: { save: async (_assessment, members) => members, readByAssessmentId: async () => stored?.findingReferences ?? [] },
    };
    const result = await createM5SuspiciousAssessmentAuthority({ unitOfWork: { withTransaction: async work => work(repositories) }, request: { result: "FINDINGS_PRESENT", ruleSetVersion: "rules/v1", detectorVersion: "detector/v1", asOf, recordedAt: "2026-01-02T00:00:00.000Z", candidateId: "candidate", assetId: "canonical-asset", canonicalIdentifier: "asset:canonical", assetClass: "TOKEN", mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: "m5-lineage", findingEvidenceIds: ["finding-1"] } });
    expect(result.result).toBe("FINDINGS_PRESENT");
    expect(result.findingReferences).toEqual([{ evidenceId: "finding-1", fingerprint: finding.fingerprint }]);
    expect(result.coveredRuleIds).toEqual(["RULE_A"]);
    expect(result.suspiciousAssessmentId).toBe(m5SuspiciousAssessmentIdFor(result));
  });
});
