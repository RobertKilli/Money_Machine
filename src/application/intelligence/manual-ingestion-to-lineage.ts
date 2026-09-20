import { createLifecycleEvent, reduceIngestionLifecycle, type LifecycleEvent } from "@/domain/intelligence/ingestion-provenance";
import { createSourceLineage } from "@/domain/intelligence/source-lineage";
import { buildManualIngestionRecords, parseM5NormalizedSourcePackage, type ManualNormalizedSourcePackage } from "@/application/intelligence/parse-m5-normalized-source-package";
import type { ManualIngestionToLineageUnitOfWork } from "@/application/intelligence/manual-ingestion-to-lineage-uow";

export type ManualIngestionPlan = Readonly<{ package: ManualNormalizedSourcePackage; request: ReturnType<typeof buildManualIngestionRecords>["request"]; attempt: ReturnType<typeof buildManualIngestionRecords>["attempt"]; records: ReturnType<typeof buildManualIngestionRecords>["records"]; events: readonly LifecycleEvent[]; sourceLineageId: string; sourceLineageFingerprint: string; memberCount: number }>;
export type ManualIngestionResult = Readonly<{ status: "DRY_RUN_READY"; plan: ManualIngestionPlan }> | Readonly<{ status: "PERSISTED"; requestId: string; attemptId: string; lifecycleStatus: "COMPLETED"; claimIds: readonly string[]; sourceLineageId: string; sourceLineageFingerprint: string; memberCount: number; observedAt: string; effectiveAvailableAt: string }>;

export function buildManualIngestionToLineagePlan(input: unknown): ManualIngestionPlan {
  const packageValue = parseM5NormalizedSourcePackage(input); const { request, attempt, records } = buildManualIngestionRecords(packageValue);
  const events = [createLifecycleEvent({ ingestionAttemptId: attempt.ingestionAttemptId, sequence: 1, eventType: "STARTED", payload: {}, recordedAt: packageValue.recordedAt }), ...records.map((record, index) => createLifecycleEvent({ ingestionAttemptId: attempt.ingestionAttemptId, sequence: index + 2, eventType: "SOURCE_OBSERVED", payload: { sourceObservationId: record.observation.sourceObservationId }, recordedAt: record.observation.recordedAt })), createLifecycleEvent({ ingestionAttemptId: attempt.ingestionAttemptId, sequence: records.length + 2, eventType: "COMPLETED", payload: {}, recordedAt: packageValue.recordedAt })] as const;
  if (reduceIngestionLifecycle(events).status !== "COMPLETED") throw new Error("M5_MANUAL_LIFECYCLE_PLAN_INVALID");
  const lineage = createSourceLineage({ providerId: packageValue.providerId, datasetId: packageValue.datasetId, datasetVersion: packageValue.datasetVersion, members: records.map(record => ({ ...record, attempt, lifecycleStatus: "COMPLETED" as const })), recordedAt: packageValue.recordedAt });
  return Object.freeze({ package: packageValue, request, attempt, records, events: Object.freeze(events), sourceLineageId: lineage.lineage.sourceLineageId, sourceLineageFingerprint: lineage.lineage.fingerprint, memberCount: lineage.lineage.memberCount });
}

export async function executeManualIngestionToLineage(input: unknown, options: Readonly<{ apply: boolean; unitOfWork?: ManualIngestionToLineageUnitOfWork }>): Promise<ManualIngestionResult> {
  const plan = buildManualIngestionToLineagePlan(input);
  if (!options.apply) return Object.freeze({ status: "DRY_RUN_READY", plan });
  if (!options.unitOfWork) throw new Error("M5_MANUAL_DATABASE_UNCONFIGURED");
  return options.unitOfWork.withTransaction(async repositories => {
    const request = await repositories.requests.save(plan.request); await repositories.requests.readById(request.ingestionRequestId);
    const attempt = await repositories.attempts.save(plan.attempt); await repositories.attempts.readById(attempt.ingestionAttemptId);
    await repositories.events.save(plan.events[0]);
    const claimIds: string[] = [];
    for (const [index, record] of plan.records.entries()) { await repositories.artifacts.save(record.artifact); await repositories.artifacts.readById(record.artifact.sourceArtifactId); await repositories.envelopes.save(record.envelope); await repositories.envelopes.readById(record.envelope.sourceEnvelopeId); await repositories.observations.save(record.observation); await repositories.observations.readById(record.observation.sourceObservationId); const claim = await repositories.availabilityClaims.save(record.claim); await repositories.availabilityClaims.readById(claim.availabilityClaimId); claimIds.push(claim.availabilityClaimId); await repositories.events.save(plan.events[index + 1]); }
    await repositories.events.save(plan.events.at(-1)!);
    const lifecycle = await repositories.events.readByAttempt(attempt.ingestionAttemptId); if (reduceIngestionLifecycle(lifecycle).status !== "COMPLETED") throw new Error("M5_MANUAL_LIFECYCLE_CONFLICT");
    const lineage = await repositories.sourceLineage.createFromClaims({ providerId: plan.package.providerId, datasetId: plan.package.datasetId, datasetVersion: plan.package.datasetVersion }, claimIds, plan.package.recordedAt);
    const reread = await repositories.sourceLineage.readById(lineage.sourceLineageId); const members = await repositories.sourceLineage.readMembers(lineage.sourceLineageId);
    if (!reread || reread.fingerprint !== plan.sourceLineageFingerprint || members.length !== claimIds.length || JSON.stringify(reread.availabilityClaimIds) !== JSON.stringify([...claimIds].sort())) throw new Error("M5_MANUAL_LINEAGE_SEALING_FAILURE");
    return Object.freeze({ status: "PERSISTED" as const, requestId: request.ingestionRequestId, attemptId: attempt.ingestionAttemptId, lifecycleStatus: "COMPLETED" as const, claimIds: Object.freeze([...claimIds].sort()), sourceLineageId: reread.sourceLineageId, sourceLineageFingerprint: reread.fingerprint, memberCount: reread.memberCount, observedAt: reread.observedAt, effectiveAvailableAt: reread.effectiveAvailableAt });
  });
}
