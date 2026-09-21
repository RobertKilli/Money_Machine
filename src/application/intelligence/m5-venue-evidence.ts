import { createVenueEligibilityEvidence, type VenueEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import type { AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { SourceLineage } from "@/domain/intelligence/source-lineage";
import type { ProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import type { M5VenueAuthority } from "@/domain/intelligence/m5-venue-authority";
import type { RawEligibilityEvidenceRepository } from "@/infrastructure/postgres/eligibility-evidence-repository";

export type M5VenueEvidenceRepositories = Readonly<{
  mapping: Readonly<{ readById: (id: string) => Promise<AssetMappingRevision | undefined> }>;
  lineage: Readonly<{ readById: (id: string) => Promise<SourceLineage | undefined>; validateForRawEvidenceCreation?: (id: string) => Promise<SourceLineage> }>;
  assertion: Readonly<{ readById: (id: string) => Promise<ProviderAssetIdentityAssertion | undefined> }>;
  venue: Readonly<{ readById: (id: string) => Promise<M5VenueAuthority | undefined> }>;
  evidence: Pick<RawEligibilityEvidenceRepository, "save">;
}>;
export interface M5VenueEvidenceUnitOfWork { readonly withTransaction: <T>(work: (repositories: M5VenueEvidenceRepositories) => Promise<T>) => Promise<T>; }
export type PersistM5VenueEvidenceResult =
  | Readonly<{ status: "PERSISTED"; evidence: readonly VenueEligibilityEvidence[]; authorityId: string; authorityFingerprint: string }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly string[] }>;

const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; };
const fail = (status: "INCOMPLETE" | "INVALID", code: string): PersistM5VenueEvidenceResult => freeze({ status, diagnostics: [code] });

export async function persistM5VenueEvidence(input: Readonly<{ unitOfWork: M5VenueEvidenceUnitOfWork; mappingRevisionId: string; authorityId: string; candidateId: string }>): Promise<PersistM5VenueEvidenceResult> {
  return input.unitOfWork.withTransaction(async repositories => {
    const mapping = await repositories.mapping.readById(input.mappingRevisionId); if (!mapping) return fail("INCOMPLETE", "M5_VENUE_EVIDENCE_MAPPING_MISSING");
    const lineage = repositories.lineage.validateForRawEvidenceCreation ? await repositories.lineage.validateForRawEvidenceCreation(mapping.sourceLineageId) : await repositories.lineage.readById(mapping.sourceLineageId); if (!lineage) return fail("INCOMPLETE", "M5_VENUE_EVIDENCE_LINEAGE_MISSING");
    const assertion = await repositories.assertion.readById(mapping.providerAssetIdentityAssertionId); if (!assertion) return fail("INCOMPLETE", "M5_VENUE_EVIDENCE_ASSERTION_MISSING");
    const authority = await repositories.venue.readById(input.authorityId); if (!authority) return fail("INCOMPLETE", "M5_VENUE_EVIDENCE_AUTHORITY_MISSING");
    try {
      if (authority.sourceLineageId !== lineage.sourceLineageId || mapping.sourceLineageId !== lineage.sourceLineageId || authority.providerId !== mapping.providerId || authority.datasetId !== mapping.datasetId || authority.datasetVersion !== mapping.datasetVersion || lineage.providerId !== mapping.providerId || lineage.datasetId !== mapping.datasetId || lineage.datasetVersion !== mapping.datasetVersion || assertion.providerId !== mapping.providerId || assertion.datasetId !== mapping.datasetId || assertion.datasetVersion !== mapping.datasetVersion) throw new Error("M5_VENUE_EVIDENCE_SCOPE_MISMATCH");
      if (authority.effectiveAvailableAt > authority.asOf || lineage.effectiveAvailableAt !== authority.effectiveAvailableAt || lineage.observedAt !== authority.observedAt || mapping.validFrom > authority.observedAt || (mapping.validTo !== undefined && authority.effectiveAvailableAt >= mapping.validTo)) throw new Error("M5_VENUE_EVIDENCE_TEMPORAL_MISMATCH");
      const lineageArtifacts = [...lineage.sourceArtifactIds].sort().join("|");
      const authorityArtifacts = [...authority.sourceMaterials.map(material => material.sourceArtifactId)].sort().join("|");
      if (lineageArtifacts !== authorityArtifacts) throw new Error("M5_VENUE_EVIDENCE_SOURCE_MISMATCH");
      const records = authority.members.map(member => createVenueEligibilityEvidence({ evidenceId: `m5-venue-evidence:${authority.authorityId}:${member.memberId}`, candidateId: input.candidateId, assetId: mapping.canonicalAssetId, canonicalIdentifier: mapping.canonicalIdentifier, assetClass: mapping.assetClass, providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion, mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: lineage.sourceLineageId, observedAt: authority.observedAt, availableAt: authority.effectiveAvailableAt, provenance: { sourceType: "M5_SOURCE_LINEAGE", sourceRecordIds: lineage.sourceArtifactIds, payloadFingerprint: lineage.fingerprint }, venueId: member.memberId, eligibilityState: "ELIGIBLE", venueAuthorityId: authority.authorityId, venueAuthorityFingerprint: authority.fingerprint, venueMemberId: member.memberId, venueMemberFingerprint: member.fingerprint, venueAuthorityMemberCount: authority.members.length, asOf: authority.asOf }));
      const saved: VenueEligibilityEvidence[] = [];
      for (const record of records) saved.push(await repositories.evidence.save(record) as VenueEligibilityEvidence);
      if (saved.length !== authority.members.length || saved.some(record => !authority.members.some(member => record.venueMemberId === member.memberId && record.venueMemberFingerprint === member.fingerprint && record.venueAuthorityFingerprint === authority.fingerprint))) throw new Error("M5_VENUE_EVIDENCE_REREAD_INVALID");
      return freeze({ status: "PERSISTED", evidence: saved, authorityId: authority.authorityId, authorityFingerprint: authority.fingerprint });
    } catch (error) {
      const code = error instanceof Error ? error.message : "M5_VENUE_EVIDENCE_INVALID";
      if (code.includes("MISSING")) return fail("INCOMPLETE", code);
      if (["M5_VENUE_EVIDENCE_SCOPE_MISMATCH", "M5_VENUE_EVIDENCE_TEMPORAL_MISMATCH", "M5_VENUE_EVIDENCE_SOURCE_MISMATCH", "M5_VENUE_EVIDENCE_REREAD_INVALID"].includes(code)) return fail("INVALID", code);
      throw error;
    }
  });
}
