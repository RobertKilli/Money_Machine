import { describe, expect, it } from "vitest";
import { encodeM5DatasetPin } from "@/domain/intelligence/m5-dataset-pin";
import { createAssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import { createSuspiciousEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import { createM5SuspiciousRuleSetAuthority, createM5SuspiciousRuleSetAuthorityResolver } from "@/domain/intelligence/m5-suspicious-rule-set";
import { createM5SuspiciousAssessment, m5SuspiciousAssessmentIdFor, type M5SuspiciousAssessment } from "@/domain/intelligence/m5-suspicious-assessment";
import { createM5SuspiciousCoverageAuthority, type M5SuspiciousCoverageAuthority } from "@/domain/intelligence/m5-suspicious-coverage";
import { createM5SuspiciousAssessmentAuthority, persistM5SuspiciousAssessmentWithCoverage } from "@/application/intelligence/create-m5-suspicious-assessment";
import type { SourceLineageClaimAuthority } from "@/application/intelligence/source-lineage-repository";
import type { M5SuspiciousAssessmentRepositories } from "@/application/intelligence/m5-suspicious-assessment-repository";

const observedAt = "2026-01-01T00:00:00.000Z";
const availableAt = "2026-01-01T01:00:00.000Z";
const asOf = "2026-01-02T00:00:00.000Z";
const pin = encodeM5DatasetPin({ providerId: "provider", datasetId: "dataset", datasetVersion: "v1" });
const base = () => ({
  contractVersion: "m5-suspicious-assessment/v1" as const,
  providerId: "provider", datasetId: "dataset", datasetVersion: "v1", candidateId: "candidate", assetId: "canonical-asset", canonicalIdentifier: "asset:canonical", assetClass: "TOKEN",
  mappingRevisionId: "m5-mapping:revision", sourceLineageId: "m5-lineage", ruleSetVersion: "rules/v1", ruleSetFingerprint: "a".repeat(64), ruleSetAuthorityId: "ruleset-authority", coverageAuthorityId: "coverage-authority", coverageFingerprint: "c".repeat(64), evaluatedRuleCount: 2, coverageStatus: "COMPLETE" as const, detectorVersion: "detector/v1", coveredRuleIds: ["RULE_B", "RULE_A"], result: "NO_FINDINGS" as const, findingReferences: [], asOf, observedAt, availableAt, sourceRecordIds: ["artifact-1"], payloadFingerprint: "b".repeat(64), datasetPins: [pin], recordedAt: "2026-01-02T00:00:00.000Z",
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
    const coverage = createM5SuspiciousCoverageAuthority({ contractVersion: "m5-suspicious-coverage-authority/v1", ruleSetAuthorityId: ruleSet.ruleSetAuthorityId, ruleSetFingerprint: ruleSet.fingerprint, providerId: "provider", datasetId: "dataset", datasetVersion: "v1", mappingRevisionId: mapping.mappingRevisionId, providerAssetIdentityAssertionId: "identity", sourceLineageId: "m5-lineage", sourceLineageFingerprint: "b".repeat(64), candidateId: "candidate", assetId: "canonical-asset", canonicalIdentifier: "asset:canonical", assetClass: "TOKEN", asOf, requiredRuleIds: ["RULE_A"], evaluatedRuleIds: ["RULE_A"], materials: [{ materialId: "artifact-1", sourceLineageId: "m5-lineage", sourceLineageMemberOrdinal: 0, sourceLineageMemberFingerprint: "c".repeat(64), availabilityClaimId: "claim-1", availabilityClaimFingerprint: "d".repeat(64), artifactId: "artifact-1", sourceArtifactFingerprint: "e".repeat(64), envelopeId: "envelope-1", envelopeFingerprint: "f".repeat(64), observationId: "observation-1", observationFingerprint: "a".repeat(64), ingestionAttemptId: "attempt-1", payloadFingerprint: "b".repeat(64), observedAt, availableAt }], status: "COMPLETE", observedAt, availableAt, recordedAt: asOf });
    let stored = undefined as ReturnType<typeof createM5SuspiciousAssessment> | undefined;
    const repositories: M5SuspiciousAssessmentRepositories = {
      ruleSets: { ...createM5SuspiciousRuleSetAuthorityResolver([ruleSet]), readById: async id => id === ruleSet.ruleSetAuthorityId ? ruleSet : undefined },
      mappings: { readById: async () => mapping },
      lineages: { validateForRawEvidenceCreation: async () => ({ sourceLineageId: "m5-lineage", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", sourceArtifactIds: ["artifact-1"], availabilityClaimIds: ["claim-1"], ingestionAttemptIds: ["attempt-1"], memberCount: 1, observedAt, effectiveAvailableAt: availableAt, contractVersion: "m5-source-lineage/v1", fingerprint: "b".repeat(64), recordedAt: "2026-01-02T00:00:00.000Z" }), readMembers: async () => [{ sourceLineageId: "m5-lineage", memberOrdinal: 0, availabilityClaimId: "claim-1", sourceArtifactId: "artifact-1", sourceEnvelopeId: "envelope-1", sourceObservationId: "observation-1", ingestionAttemptId: "attempt-1", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", observedAt, effectiveAvailableAt: availableAt, memberFingerprint: "c".repeat(64) }] },
      findings: { readExact: async () => [finding] },
      coverage: { readById: async () => coverage },
      assessments: { save: async value => { stored = value; return value; }, readById: async () => stored, readSealedById: async () => stored ? { assessment: stored, members: stored.findingReferences } : undefined },
      memberships: { save: async (_assessment, members) => members, readByAssessmentId: async () => stored?.findingReferences ?? [] },
    };
    const result = await createM5SuspiciousAssessmentAuthority({ unitOfWork: { withTransaction: async work => work(repositories) }, request: { result: "FINDINGS_PRESENT", ruleSetVersion: "rules/v1", detectorVersion: "detector/v1", ruleSetAuthorityId: ruleSet.ruleSetAuthorityId, coverageAuthorityId: coverage.coverageAuthorityId, coverageFingerprint: coverage.fingerprint, evaluatedRuleCount: 1, coverageStatus: "COMPLETE", asOf, recordedAt: "2026-01-02T00:00:00.000Z", candidateId: "candidate", assetId: "canonical-asset", canonicalIdentifier: "asset:canonical", assetClass: "TOKEN", mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: "m5-lineage", findingEvidenceIds: ["finding-1"] } });
    expect(result.result).toBe("FINDINGS_PRESENT");
    expect(result.findingReferences).toEqual([{ evidenceId: "finding-1", fingerprint: finding.fingerprint }]);
    expect(result.coveredRuleIds).toEqual(["RULE_A"]);
    expect(result.suspiciousAssessmentId).toBe(m5SuspiciousAssessmentIdFor(result));
  });

  it("persists coverage and assessment through one transaction-scoped capability", async () => {
    const ruleSet = createM5SuspiciousRuleSetAuthority({ contractVersion: "m5-suspicious-rule-set/v1", ruleSetVersion: "rules/v1", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", detectorVersion: "detector/v1", requiredRuleIds: ["RULE_A"] });
    const mapping = createAssetMappingRevision({ mappingRevisionVersion: "m5-asset-mapping-revision/v1", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", sourceLineageId: "m5-lineage", providerAssetIdentityAssertionId: "m5-provider-asset-identity:" + "1".repeat(64), providerAssetNamespace: "eip155:1", providerAssetId: "0x" + "1".repeat(40), canonicalAssetId: "canonical-asset", canonicalIdentifier: "asset:canonical", assetClass: "TOKEN", validFrom: observedAt, observedAt, availableAt, sourceRecordIds: ["artifact-1"], payloadFingerprint: "b".repeat(64), recordedAt: asOf });
    const lineage = { sourceLineageId: "m5-lineage", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", sourceArtifactIds: ["artifact-1"], availabilityClaimIds: ["claim-1"], ingestionAttemptIds: ["attempt-1"], memberCount: 1, observedAt, effectiveAvailableAt: availableAt, contractVersion: "m5-source-lineage/v1" as const, fingerprint: "b".repeat(64), recordedAt: asOf };
    let savedCoverage: M5SuspiciousCoverageAuthority | undefined;
    let savedAssessment: M5SuspiciousAssessment | undefined;
    const repos: M5SuspiciousAssessmentRepositories = {
      ruleSets: { ...createM5SuspiciousRuleSetAuthorityResolver([ruleSet]), readById: async id => id === ruleSet.ruleSetAuthorityId ? ruleSet : undefined },
      mappings: { readById: async () => mapping },
      lineages: { validateForRawEvidenceCreation: async () => lineage, readMembers: async () => [{ sourceLineageId: "m5-lineage", memberOrdinal: 0, availabilityClaimId: "claim-1", sourceArtifactId: "artifact-1", sourceEnvelopeId: "envelope-1", sourceObservationId: "observation-1", ingestionAttemptId: "attempt-1", providerId: "provider", datasetId: "dataset", datasetVersion: "v1", observedAt, effectiveAvailableAt: availableAt, memberFingerprint: "c".repeat(64) }], readMemberAuthorities: async () => [{ claim: { availabilityClaimId: "claim-1", claimFingerprint: "d".repeat(64) }, artifact: { sourceArtifactId: "artifact-1", payloadFingerprint: "b".repeat(64), sourceArtifactFingerprint: "e".repeat(64) }, envelope: { sourceEnvelopeId: "envelope-1", observedAt, sourceEnvelopeFingerprint: "f".repeat(64) }, observation: { sourceObservationId: "observation-1", retrievedAt: availableAt, observationFingerprint: "a".repeat(64) }, attempt: { ingestionAttemptId: "attempt-1" } } as unknown as SourceLineageClaimAuthority] },
      findings: { readExact: async () => [] },
      coverage: { readById: async () => savedCoverage, save: async value => { savedCoverage = value; return value; } },
      assessments: { save: async value => { savedAssessment = value; return value; }, readById: async () => savedAssessment, readSealedById: async () => savedAssessment ? { assessment: savedAssessment, members: [] } : undefined },
      memberships: { save: async (_assessment, members) => members, readByAssessmentId: async () => [] },
    };
    let transactions = 0;
    const result = await persistM5SuspiciousAssessmentWithCoverage({ unitOfWork: { withTransaction: async work => { transactions += 1; return work(repos); } }, request: { result: "NO_FINDINGS", ruleSetVersion: "rules/v1", detectorVersion: "detector/v1", ruleSetAuthorityId: ruleSet.ruleSetAuthorityId, asOf, recordedAt: asOf, candidateId: "candidate", assetId: "canonical-asset", canonicalIdentifier: "asset:canonical", assetClass: "TOKEN", mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: "m5-lineage", findingEvidenceIds: [] }, evaluation: { evaluatedRuleIds: ["RULE_A"], materials: [{ materialId: "artifact-1", artifactId: "artifact-1", envelopeId: "envelope-1", observationId: "observation-1", payloadFingerprint: "b".repeat(64), observedAt, availableAt }] } });
    expect(transactions).toBe(1);
    expect(savedCoverage?.status).toBe("COMPLETE");
    expect(result.coverageAuthorityId).toBe(savedCoverage?.coverageAuthorityId);
    expect(savedAssessment?.coverageFingerprint).toBe(savedCoverage?.fingerprint);
  });
});
