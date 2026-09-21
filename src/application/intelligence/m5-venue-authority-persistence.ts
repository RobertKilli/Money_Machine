import { createM5VenueAuthority, type M5VenueAuthority, type VenueAuthoritySourceMaterial } from "@/domain/intelligence/m5-venue-authority";
import type { SourceLineageRepository } from "./source-lineage-repository";

export interface M5VenueAuthorityRepository {
  readonly save: (authority: M5VenueAuthority) => Promise<M5VenueAuthority>;
  readonly readById: (id: string) => Promise<M5VenueAuthority | undefined>;
}
export interface M5VenueAuthorityPersistenceRepositories {
  readonly sourceLineage: Pick<SourceLineageRepository, "readById" | "readMembers" | "readMemberAuthorities" | "validateForRawEvidenceCreation">;
  readonly venue: M5VenueAuthorityRepository;
}
export interface M5VenueAuthorityPersistenceUnitOfWork {
  readonly withTransaction: <T>(work: (repositories: M5VenueAuthorityPersistenceRepositories) => Promise<T>) => Promise<T>;
}
export type PersistM5VenueAuthorityResult =
  | Readonly<{ status: "PERSISTED"; authority: M5VenueAuthority }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly string[] }>;

const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; };
const fail = (status: "INCOMPLETE" | "INVALID", code: string): PersistM5VenueAuthorityResult => freeze({ status, diagnostics: [code] });
const text = (value: unknown, code: string): string => { if (typeof value !== "string" || value.trim() === "") throw new Error(code); return value.trim(); };
const integer = (value: unknown, code: string): number => { if (!Number.isSafeInteger(value)) throw new Error(code); return value as number; };

function authoritativeMaterial(authority: { readonly artifact: Record<string, unknown>; readonly envelope: Record<string, unknown>; readonly observation: Record<string, unknown>; readonly claim: Record<string, unknown> }): VenueAuthoritySourceMaterial {
  const fields = authority.envelope.normalizedEnvelope as Record<string, unknown>;
  const textField = (key: string) => text(fields[key], "M5_VENUE_AUTHORITY_MATERIAL_MISMATCH");
  return {
    sourceArtifactId: text(authority.artifact.sourceArtifactId, "M5_VENUE_AUTHORITY_MATERIAL_MISMATCH"),
    sourceEnvelopeId: text(authority.envelope.sourceEnvelopeId, "M5_VENUE_AUTHORITY_MATERIAL_MISMATCH"),
    sourceObservationId: text(authority.observation.sourceObservationId, "M5_VENUE_AUTHORITY_MATERIAL_MISMATCH"),
    providerExternalRecordId: text(authority.artifact.providerExternalRecordId, "M5_VENUE_AUTHORITY_MATERIAL_MISMATCH"),
    payloadFingerprint: text(authority.artifact.payloadFingerprint, "M5_VENUE_AUTHORITY_MATERIAL_MISMATCH"),
    venueNamespace: textField("venueNamespace"),
    venueId: textField("venueId"),
    ...(fields.venueType === undefined ? {} : { venueType: textField("venueType") }),
    ...(fields.chainId === undefined ? {} : { chainId: textField("chainId") }),
    pageOrdinal: integer(fields.pageOrdinal, "M5_VENUE_AUTHORITY_ORDINAL_INVALID"),
    recordOrdinal: integer(fields.recordOrdinal, "M5_VENUE_AUTHORITY_ORDINAL_INVALID"),
    finalPage: fields.finalPage === true,
    expectedPageCount: integer(fields.expectedPageCount, "M5_VENUE_AUTHORITY_COVERAGE_INVALID"),
    expectedRecordCount: integer(fields.expectedRecordCount, "M5_VENUE_AUTHORITY_COVERAGE_INVALID"),
    coverageKind: textField("coverageKind") as VenueAuthoritySourceMaterial["coverageKind"],
    coverageVersion: textField("coverageVersion"),
    observedAt: text(authority.envelope.observedAt, "M5_VENUE_AUTHORITY_TIMESTAMP_INVALID"),
    availableAt: text(authority.claim.effectiveAvailableAt, "M5_VENUE_AUTHORITY_TIMESTAMP_INVALID"),
  };
}

/** Rebinds venue claims to the sealed SourceLineage; caller material is never trusted. */
export async function persistM5VenueAuthority(input: Readonly<{
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  sourceLineageId: string;
  asOf: string;
  universeNamespace: string;
  universeId: string;
  recordedAt: string;
  unitOfWork: M5VenueAuthorityPersistenceUnitOfWork;
}>): Promise<PersistM5VenueAuthorityResult> {
  return input.unitOfWork.withTransaction(async repositories => {
    const lineage = await repositories.sourceLineage.readById(input.sourceLineageId);
    if (!lineage) return fail("INCOMPLETE", "M5_VENUE_LINEAGE_MISSING");
    if (!repositories.sourceLineage.readMemberAuthorities || !repositories.sourceLineage.validateForRawEvidenceCreation) throw new Error("M5_VENUE_LINEAGE_REPOSITORY_UNSUPPORTED");
    await repositories.sourceLineage.validateForRawEvidenceCreation(input.sourceLineageId);
    const members = await repositories.sourceLineage.readMembers(input.sourceLineageId);
    const authorities = await repositories.sourceLineage.readMemberAuthorities(input.sourceLineageId);
    if (lineage.providerId !== input.providerId || lineage.datasetId !== input.datasetId || lineage.datasetVersion !== input.datasetVersion || members.length !== lineage.memberCount || authorities.length !== lineage.memberCount) return fail("INVALID", "M5_VENUE_LINEAGE_SCOPE_MISMATCH");
    try {
      const sourceIds = members.map(member => member.sourceArtifactId);
      if (new Set(sourceIds).size !== sourceIds.length || [...sourceIds].sort().join("|") !== [...lineage.sourceArtifactIds].sort().join("|")) throw new Error("M5_VENUE_SOURCE_SET_MISMATCH");
      const authorityByArtifact = new Map(authorities.map(value => [value.artifact.sourceArtifactId, value]));
      const material = [...members].sort((a, b) => a.memberOrdinal - b.memberOrdinal).map(member => {
        const authority = authorityByArtifact.get(member.sourceArtifactId);
        if (!authority || authority.artifact.providerId !== input.providerId || authority.artifact.datasetId !== input.datasetId || authority.artifact.datasetVersion !== input.datasetVersion || authority.envelope.sourceArtifactId !== authority.artifact.sourceArtifactId || authority.observation.sourceArtifactId !== authority.artifact.sourceArtifactId || authority.claim.sourceObservationId !== authority.observation.sourceObservationId || authority.envelope.payloadFingerprint !== authority.artifact.payloadFingerprint) throw new Error("M5_VENUE_SOURCE_BINDING_MISMATCH");
        return authoritativeMaterial(authority);
      });
      const result = createM5VenueAuthority({ providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, sourceLineageId: input.sourceLineageId, asOf: input.asOf, universeNamespace: input.universeNamespace, universeId: input.universeId, expectedPageCount: material[0]?.expectedPageCount ?? 0, expectedRecordCount: material.length, materials: material, recordedAt: input.recordedAt });
      if (result.status !== "READY") return freeze(result);
      const stored = await repositories.venue.save(result.authority);
      return freeze({ status: "PERSISTED", authority: stored });
    } catch (error) {
      const code = error instanceof Error ? error.message : "M5_VENUE_AUTHORITY_INVALID";
      if (code.includes("LINEAGE_MISSING") || code.includes("COVERAGE_INCOMPLETE") || code.includes("SOURCE_SET_INCOMPLETE")) return fail("INCOMPLETE", code);
      if (["M5_VENUE_MATERIAL_INVALID", "M5_VENUE_COVERAGE_INVALID", "M5_VENUE_FINAL_MARKER_INCOMPLETE", "M5_VENUE_RECORD_RECONCILIATION_INVALID", "M5_VENUE_MEMBER_CONFLICT", "M5_VENUE_SOURCE_SET_MISMATCH", "M5_VENUE_SOURCE_BINDING_MISMATCH", "M5_VENUE_LINEAGE_SCOPE_MISMATCH"].includes(code)) return fail("INVALID", code);
      throw error;
    }
  });
}
