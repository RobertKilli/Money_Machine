import { encodeM5DatasetPin } from "@/domain/intelligence/m5-dataset-pin";
import { createM5SuspiciousAssessment, type M5SuspiciousAssessment } from "@/domain/intelligence/m5-suspicious-assessment";
import { assertM5SuspiciousRuleSetAuthority } from "@/domain/intelligence/m5-suspicious-rule-set";
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
    const reread = await repositories.assessments.readById(stored.suspiciousAssessmentId);
    if (!reread) throw new Error("M5_SUSPICIOUS_ASSESSMENT_REREAD_NOT_FOUND");
    const memberSet = await repositories.memberships.readByAssessmentId(reread.suspiciousAssessmentId);
    if (JSON.stringify(memberSet) !== JSON.stringify(reread.findingReferences)) throw new Error("M5_SUSPICIOUS_ASSESSMENT_MEMBER_SET_INVALID");
    return reread;
  });
}
