import { encodeM5DatasetPin } from "@/domain/intelligence/m5-dataset-pin";
import { createM5SuspiciousAssessment, type M5SuspiciousAssessment } from "@/domain/intelligence/m5-suspicious-assessment";
import { assertM5SuspiciousRuleSetAuthority } from "@/domain/intelligence/m5-suspicious-rule-set";
import { assertM5SuspiciousCoverageAuthority, type M5SuspiciousCoverageAuthority } from "@/domain/intelligence/m5-suspicious-coverage";
import type { M5SuspiciousAssessmentUnitOfWork, CreateM5SuspiciousAssessmentRequest } from "@/application/intelligence/m5-suspicious-assessment-repository";

const same = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index]);

export async function createM5SuspiciousAssessmentAuthority(input: Readonly<{ unitOfWork: M5SuspiciousAssessmentUnitOfWork; request: CreateM5SuspiciousAssessmentRequest }>): Promise<M5SuspiciousAssessment> {
  return input.unitOfWork.withTransaction(async repositories => {
    const request = input.request;
    const mapping = await repositories.mappings.readById(request.mappingRevisionId);
    if (!mapping) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MAPPING_NOT_FOUND");
    if (mapping.sourceLineageId !== request.sourceLineageId || mapping.canonicalIdentifier !== request.canonicalIdentifier || mapping.assetClass !== request.assetClass || mapping.canonicalAssetId !== request.assetId) throw new Error("M5_SUSPICIOUS_ASSESSMENT_SCOPE_MISMATCH");
    if (mapping.providerId === "" || mapping.datasetId === "" || mapping.datasetVersion === "") throw new Error("M5_SUSPICIOUS_ASSESSMENT_SCOPE_INVALID");
    const ruleSet = await repositories.ruleSets.resolve({ providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion, ruleSetVersion: request.ruleSetVersion, detectorVersion: request.detectorVersion });
    if (!ruleSet) throw new Error("M5_SUSPICIOUS_ASSESSMENT_RULE_SET_NOT_FOUND");
    assertM5SuspiciousRuleSetAuthority(ruleSet);
    if (ruleSet.providerId !== mapping.providerId || ruleSet.datasetId !== mapping.datasetId || ruleSet.datasetVersion !== mapping.datasetVersion || ruleSet.detectorVersion !== request.detectorVersion || ruleSet.ruleSetVersion !== request.ruleSetVersion) throw new Error("M5_SUSPICIOUS_ASSESSMENT_RULE_SET_SCOPE_MISMATCH");
    const lineage = await repositories.lineages.validateForRawEvidenceCreation(request.sourceLineageId);
    const members = await repositories.lineages.readMembers(request.sourceLineageId);
    if (lineage.providerId !== mapping.providerId || lineage.datasetId !== mapping.datasetId || lineage.datasetVersion !== mapping.datasetVersion) throw new Error("M5_SUSPICIOUS_ASSESSMENT_LINEAGE_SCOPE_MISMATCH");
    if (mapping.payloadFingerprint !== lineage.fingerprint || !same(mapping.sourceRecordIds, lineage.sourceArtifactIds) || mapping.observedAt !== lineage.observedAt || mapping.availableAt !== lineage.effectiveAvailableAt) throw new Error("M5_SUSPICIOUS_ASSESSMENT_LINEAGE_BINDING_INVALID");
    if (members.length !== lineage.memberCount || members.some(member => member.sourceLineageId !== lineage.sourceLineageId || member.providerId !== lineage.providerId || member.datasetId !== lineage.datasetId || member.datasetVersion !== lineage.datasetVersion)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_LINEAGE_MEMBERS_INVALID");
    const findingIds = [...request.findingEvidenceIds].sort((a, b) => a.localeCompare(b));
    if (new Set(findingIds).size !== findingIds.length) throw new Error("M5_SUSPICIOUS_ASSESSMENT_DUPLICATE_FINDING");
    if (request.result === "NO_FINDINGS" && findingIds.length) throw new Error("M5_SUSPICIOUS_ASSESSMENT_NO_FINDINGS_HAS_FINDINGS");
    if (request.result === "FINDINGS_PRESENT" && !findingIds.length) throw new Error("M5_SUSPICIOUS_ASSESSMENT_FINDINGS_EMPTY");
    const pins = [{ providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion }];
    const findings = await repositories.findings.readExact({ providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion, candidateId: request.candidateId, assetId: request.assetId, canonicalIdentifier: request.canonicalIdentifier, assetClass: request.assetClass, mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: mapping.sourceLineageId, asOf: request.asOf, pins });
    const found = [...findings].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
    if (!same(found.map(value => value.evidenceId), findingIds)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_FINDING_SET_MISMATCH");
    const references = found.map(value => ({ evidenceId: value.evidenceId, fingerprint: value.fingerprint }));
    const assessment = createM5SuspiciousAssessment({
      contractVersion: "m5-suspicious-assessment/v1",
      providerId: mapping.providerId,
      datasetId: mapping.datasetId,
      datasetVersion: mapping.datasetVersion,
      candidateId: request.candidateId,
      assetId: request.assetId,
      canonicalIdentifier: request.canonicalIdentifier,
      assetClass: request.assetClass,
      mappingRevisionId: mapping.mappingRevisionId,
      sourceLineageId: mapping.sourceLineageId,
      ruleSetVersion: ruleSet.ruleSetVersion,
      ruleSetFingerprint: ruleSet.fingerprint,
      ruleSetAuthorityId: request.ruleSetAuthorityId ?? ruleSet.ruleSetAuthorityId,
      coverageAuthorityId: request.coverageAuthorityId,
      coverageFingerprint: request.coverageFingerprint,
      evaluatedRuleCount: request.evaluatedRuleCount,
      detectorVersion: ruleSet.detectorVersion,
      coveredRuleIds: ruleSet.requiredRuleIds,
      result: request.result,
      findingReferences: references,
      asOf: request.asOf,
      observedAt: lineage.observedAt,
      availableAt: lineage.effectiveAvailableAt,
      sourceRecordIds: lineage.sourceArtifactIds,
      payloadFingerprint: lineage.fingerprint,
      datasetPins: [encodeM5DatasetPin({ providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion })],
      recordedAt: request.recordedAt,
    });
    const stored = await repositories.assessments.save(assessment);
    await repositories.memberships.save(stored, references);
    const reread = await repositories.assessments.readSealedById(stored.suspiciousAssessmentId);
    if (!reread) throw new Error("M5_SUSPICIOUS_ASSESSMENT_REREAD_NOT_FOUND");
    return reread.assessment;
  });
}

/** Strict v1 entry point.  Coverage is persisted/re-read by the caller's
 * transaction-scoped repository before this function is invoked. */
export async function createM5SuspiciousAssessmentFromCompleteCoverage(input: Readonly<{
  unitOfWork: M5SuspiciousAssessmentUnitOfWork;
  request: CreateM5SuspiciousAssessmentRequest & { ruleSetAuthorityId: string; coverageAuthorityId: string; coverageFingerprint: string; evaluatedRuleCount: number };
  coverage: M5SuspiciousCoverageAuthority;
}>): Promise<M5SuspiciousAssessment> {
  assertM5SuspiciousCoverageAuthority(input.coverage);
  if (input.coverage.status !== "COMPLETE") throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_NOT_COMPLETE");
  if (input.coverage.ruleSetAuthorityId !== input.request.ruleSetAuthorityId || input.coverage.coverageAuthorityId !== input.request.coverageAuthorityId || input.coverage.fingerprint !== input.request.coverageFingerprint) throw new Error("M5_SUSPICIOUS_ASSESSMENT_COVERAGE_BINDING_MISMATCH");
  if (input.request.evaluatedRuleCount !== input.coverage.evaluatedRuleIds.length) throw new Error("M5_SUSPICIOUS_ASSESSMENT_EVALUATED_RULE_COUNT_INVALID");
  return createM5SuspiciousAssessmentAuthority({ unitOfWork: input.unitOfWork, request: input.request });
}
