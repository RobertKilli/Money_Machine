import { createM5DailySeriesAuthority, type M5DailySeriesAuthority, type M5DailySeriesDerivation, type M5DailySeriesObservationInput } from "@/domain/intelligence/m5-daily-series-authority";
import type { SourceLineageClaimAuthority, SourceLineageRepository } from "./source-lineage-repository";

export type M5DailySeriesAuthorityAggregate = Readonly<{ authority: M5DailySeriesAuthority; historySpan: M5DailySeriesDerivation; volatility: M5DailySeriesDerivation }>;
export interface M5DailySeriesAuthorityRepository { readonly save: (aggregate: M5DailySeriesAuthorityAggregate) => Promise<M5DailySeriesAuthorityAggregate>; readonly readById: (id: string) => Promise<M5DailySeriesAuthorityAggregate | undefined>; }
export interface M5DailySeriesAuthorityRepositories { readonly sourceLineage: Pick<SourceLineageRepository, "readById" | "readMembers" | "readMemberAuthorities" | "validateForRawEvidenceCreation">; readonly dailySeries: M5DailySeriesAuthorityRepository; }
export interface M5DailySeriesAuthorityUnitOfWork { readonly withTransaction: <T>(work: (repositories: M5DailySeriesAuthorityRepositories) => Promise<T>) => Promise<T>; }
export type PersistM5DailySeriesResult = Readonly<{ status: "PERSISTED"; aggregate: M5DailySeriesAuthorityAggregate }> | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly M5DailySeriesDiagnostic[] }>;
export type M5DailySeriesDiagnostic = "M5_DAILY_AUTHORITY_LINEAGE_MISSING" | "M5_DAILY_AUTHORITY_LINEAGE_INCOMPLETE" | "M5_DAILY_AUTHORITY_MATERIAL_MISMATCH" | "M5_DAILY_AUTHORITY_NOT_READY";
const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; };

function authorityByArtifact(authorities: readonly SourceLineageClaimAuthority[]): Map<string, SourceLineageClaimAuthority> { return new Map(authorities.map(a => [a.artifact.sourceArtifactId, a])); }
function bindMaterial(material: readonly M5DailySeriesObservationInput[], authorities: readonly SourceLineageClaimAuthority[]): readonly M5DailySeriesObservationInput[] {
  const byArtifact = authorityByArtifact(authorities);
  return material.map(row => {
    const a = byArtifact.get(row.sourceArtifactId);
    if (!a || a.artifact.providerExternalRecordId !== row.providerExternalRecordId || a.artifact.payloadFingerprint !== row.payloadFingerprint || a.envelope.payloadFingerprint !== row.payloadFingerprint || a.observation.sourceObservationId !== row.sourceObservationId || a.envelope.sourceEnvelopeId !== row.sourceEnvelopeId) throw new Error("M5_DAILY_AUTHORITY_MATERIAL_MISMATCH");
    return freeze({ ...row });
  });
}

export async function persistM5DailySeriesAuthority(input: Readonly<{ providerId: string; datasetId: string; datasetVersion: string; providerSourceNamespace: string; chainId: string; contractAddress: string; providerAssetIdentity: string; observations: readonly M5DailySeriesObservationInput[]; sourceLineageId: string; asOf: string; recordedAt: string; unitOfWork: M5DailySeriesAuthorityUnitOfWork }>): Promise<PersistM5DailySeriesResult> {
  const initial = createM5DailySeriesAuthority(input);
  if (initial.status !== "READY") return freeze({ status: initial.status, diagnostics: ["M5_DAILY_AUTHORITY_NOT_READY"] });
  return input.unitOfWork.withTransaction(async repositories => {
    try {
      const lineage = await repositories.sourceLineage.readById(input.sourceLineageId);
      if (!lineage) return freeze({ status: "INCOMPLETE", diagnostics: ["M5_DAILY_AUTHORITY_LINEAGE_MISSING"] });
      if (!repositories.sourceLineage.validateForRawEvidenceCreation || !repositories.sourceLineage.readMemberAuthorities) throw new Error("M5_DAILY_AUTHORITY_MATERIAL_MISMATCH");
      await repositories.sourceLineage.validateForRawEvidenceCreation(input.sourceLineageId);
      const authorities = await repositories.sourceLineage.readMemberAuthorities(input.sourceLineageId);
      const members = await repositories.sourceLineage.readMembers(input.sourceLineageId);
      if (lineage.providerId !== input.providerId || lineage.datasetId !== input.datasetId || lineage.datasetVersion !== input.datasetVersion || authorities.length !== input.observations.length || members.length !== input.observations.length) throw new Error("M5_DAILY_AUTHORITY_MATERIAL_MISMATCH");
      input.observations.forEach((observation, index) => {
        const member = members[index];
        const authority = authorities[index];
        if (!member || !authority || member.memberOrdinal !== index || member.sourceLineageId !== input.sourceLineageId || member.providerId !== input.providerId || member.datasetId !== input.datasetId || member.datasetVersion !== input.datasetVersion || member.sourceArtifactId !== observation.sourceArtifactId || member.sourceEnvelopeId !== observation.sourceEnvelopeId || member.sourceObservationId !== observation.sourceObservationId || member.observedAt !== observation.observedAt || member.effectiveAvailableAt !== observation.availableAt || authority.artifact.sourceArtifactId !== member.sourceArtifactId || authority.envelope.sourceEnvelopeId !== member.sourceEnvelopeId || authority.observation.sourceObservationId !== member.sourceObservationId) throw new Error("M5_DAILY_AUTHORITY_MATERIAL_MISMATCH");
      });
      const bound = createM5DailySeriesAuthority({ ...input, observations: bindMaterial(input.observations, authorities) });
      if (bound.status !== "READY") return freeze({ status: bound.status, diagnostics: ["M5_DAILY_AUTHORITY_NOT_READY"] });
      return freeze({ status: "PERSISTED", aggregate: await repositories.dailySeries.save({ authority: bound.authority, historySpan: bound.historySpan, volatility: bound.volatility }) });
    } catch (error) {
      if (error instanceof Error && error.message.includes("LINEAGE")) return freeze({ status: "INCOMPLETE", diagnostics: ["M5_DAILY_AUTHORITY_LINEAGE_INCOMPLETE"] });
      if (error instanceof Error && error.message === "M5_DAILY_AUTHORITY_MATERIAL_MISMATCH") return freeze({ status: "INVALID", diagnostics: ["M5_DAILY_AUTHORITY_MATERIAL_MISMATCH"] });
      throw error;
    }
  });
}
