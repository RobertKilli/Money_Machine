import { createQuantitativeEligibilityEvidence, type QuantitativeEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import type { AssetMappingRevisionRepository } from "@/application/intelligence/asset-mapping-revision-repository";
import type { SourceLineageRepository } from "@/application/intelligence/source-lineage-repository";
import { assertProviderAssetIdentityAssertion, type ProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import type { AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { SourceLineage } from "@/domain/intelligence/source-lineage";
import type { M5HolderSnapshotAuthorityAggregate, M5HolderSnapshotAuthorityRepository } from "@/application/intelligence/m5-holder-snapshot-persistence";
import type { RawEligibilityEvidenceRepository } from "@/infrastructure/postgres/eligibility-evidence-repository";

export type M5HolderConcentrationEvidenceRepositories = Readonly<{
  mapping: Pick<AssetMappingRevisionRepository, "readById">;
  lineage: Pick<SourceLineageRepository, "readById" | "validateForRawEvidenceCreation">;
  assertion: Readonly<{ readById: (id: string) => Promise<ProviderAssetIdentityAssertion | undefined> }>;
  snapshots: Pick<M5HolderSnapshotAuthorityRepository, "readById">;
  evidence: Pick<RawEligibilityEvidenceRepository, "save">;
}>;

export interface M5HolderConcentrationEvidenceUnitOfWork {
  readonly withTransaction: <T>(work: (repositories: M5HolderConcentrationEvidenceRepositories) => Promise<T>) => Promise<T>;
}

export type PersistM5HolderConcentrationEvidenceResult =
  | Readonly<{ status: "PERSISTED"; evidence: readonly [QuantitativeEligibilityEvidence, QuantitativeEligibilityEvidence]; snapshotId: string; snapshotFingerprint: string; derivationFingerprints: readonly [string, string] }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly string[] }>;

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); }
  return value;
};
const evidenceIdFor = (snapshotId: string, metric: string) => `m5-holder-concentration-evidence:${snapshotId}:${metric}`;
const fail = (status: "INCOMPLETE" | "INVALID", code: string): PersistM5HolderConcentrationEvidenceResult => freeze({ status, diagnostics: [code] });

function validateCrossAuthority(aggregate: M5HolderSnapshotAuthorityAggregate, mapping: AssetMappingRevision, assertion: ProviderAssetIdentityAssertion, lineage: SourceLineage): void {
  const snapshot = aggregate.snapshot;
  assertProviderAssetIdentityAssertion(assertion);
  if (mapping.sourceLineageId !== lineage.sourceLineageId || snapshot.sourceLineageId !== lineage.sourceLineageId || mapping.providerId !== snapshot.providerId || mapping.datasetId !== snapshot.datasetId || mapping.datasetVersion !== snapshot.datasetVersion || lineage.providerId !== mapping.providerId || lineage.datasetId !== mapping.datasetId || lineage.datasetVersion !== mapping.datasetVersion) throw new Error("M5_HOLDER_CONCENTRATION_AUTHORITY_SCOPE_MISMATCH");
  if (mapping.canonicalAssetId.trim() === "" || mapping.canonicalIdentifier.trim() === "" || mapping.assetClass === "UNKNOWN") throw new Error("M5_HOLDER_CONCENTRATION_AUTHORITY_MAPPING_INVALID");
  if (mapping.validFrom > snapshot.observedAt || (mapping.validTo !== undefined && snapshot.availableAt >= mapping.validTo)) throw new Error("M5_HOLDER_CONCENTRATION_AUTHORITY_MAPPING_VALIDITY_MISMATCH");
  if (assertion.providerId !== mapping.providerId || assertion.datasetId !== mapping.datasetId || assertion.datasetVersion !== mapping.datasetVersion || assertion.providerSourceNamespace !== mapping.providerAssetNamespace || assertion.providerAssetId !== mapping.providerAssetId) throw new Error("M5_HOLDER_CONCENTRATION_AUTHORITY_ASSERTION_MISMATCH");
  if (assertion.identityNamespace !== snapshot.chainId || assertion.identityValue !== snapshot.contractAddress) throw new Error("M5_HOLDER_CONCENTRATION_AUTHORITY_IDENTITY_MISMATCH");
  if (mapping.observedAt !== snapshot.observedAt || mapping.availableAt !== snapshot.availableAt || lineage.observedAt !== snapshot.observedAt || lineage.effectiveAvailableAt !== snapshot.availableAt) throw new Error("M5_HOLDER_CONCENTRATION_AUTHORITY_TEMPORAL_MISMATCH");
  if (JSON.stringify(mapping.sourceRecordIds) !== JSON.stringify(lineage.sourceArtifactIds)) throw new Error("M5_HOLDER_CONCENTRATION_AUTHORITY_SOURCE_MISMATCH");
}

export async function persistM5HolderConcentrationEvidence(input: Readonly<{ unitOfWork: M5HolderConcentrationEvidenceUnitOfWork; mappingRevisionId: string; snapshotId: string; candidateId: string }>): Promise<PersistM5HolderConcentrationEvidenceResult> {
  return input.unitOfWork.withTransaction(async repositories => {
    const mapping = await repositories.mapping.readById?.(input.mappingRevisionId);
    if (!mapping) return fail("INCOMPLETE", "M5_HOLDER_CONCENTRATION_MAPPING_MISSING");
    const lineage = repositories.lineage.validateForRawEvidenceCreation ? await repositories.lineage.validateForRawEvidenceCreation(mapping.sourceLineageId) : await repositories.lineage.readById(mapping.sourceLineageId);
    if (!lineage) return fail("INCOMPLETE", "M5_HOLDER_CONCENTRATION_LINEAGE_MISSING");
    const assertion = await repositories.assertion.readById(mapping.providerAssetIdentityAssertionId);
    if (!assertion) return fail("INCOMPLETE", "M5_HOLDER_CONCENTRATION_ASSERTION_MISSING");
    const aggregate = await repositories.snapshots.readById(input.snapshotId);
    if (!aggregate) return fail("INCOMPLETE", "M5_HOLDER_CONCENTRATION_SNAPSHOT_MISSING");
    let single: QuantitativeEligibilityEvidence;
    let top10: QuantitativeEligibilityEvidence;
    try {
      validateCrossAuthority(aggregate, mapping, assertion, lineage);
      if (aggregate.concentration.snapshot !== aggregate.snapshot || aggregate.concentration.single.metricKind !== "SINGLE_CONCENTRATION" || aggregate.concentration.top10.metricKind !== "TOP10_CONCENTRATION" || aggregate.concentration.single.snapshotId !== aggregate.snapshot.snapshotId || aggregate.concentration.top10.snapshotId !== aggregate.snapshot.snapshotId || aggregate.concentration.single.asOf !== aggregate.concentration.top10.asOf || aggregate.concentration.single.orderedMaterialSourceRecordIds.join("\u0000") !== aggregate.concentration.top10.orderedMaterialSourceRecordIds.join("\u0000") || aggregate.concentration.single.valueAtoms > aggregate.concentration.top10.valueAtoms || aggregate.concentration.top10.valueAtoms > 10000n) throw new Error("M5_HOLDER_CONCENTRATION_DERIVATION_PAIR_INVALID");
      const common = { candidateId: input.candidateId, assetId: mapping.canonicalAssetId, canonicalIdentifier: mapping.canonicalIdentifier, assetClass: mapping.assetClass, providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion, mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: lineage.sourceLineageId, observedAt: aggregate.snapshot.observedAt, availableAt: aggregate.snapshot.availableAt, provenance: { sourceType: "M5_SOURCE_LINEAGE" as const, sourceRecordIds: lineage.sourceArtifactIds, payloadFingerprint: lineage.fingerprint }, unit: "BPS", scale: 0, semanticsVersion: "m5-holder-concentration-evidence/v1", holderSnapshotId: aggregate.snapshot.snapshotId, holderSnapshotFingerprint: aggregate.snapshot.fingerprint, asOf: aggregate.concentration.single.asOf };
      single = createQuantitativeEligibilityEvidence({ ...common, evidenceId: evidenceIdFor(aggregate.snapshot.snapshotId, "SINGLE_CONCENTRATION"), metricKind: "SINGLE_CONCENTRATION", valueAtoms: aggregate.concentration.single.valueAtoms, holderDerivationFingerprint: aggregate.concentration.single.fingerprint });
      top10 = createQuantitativeEligibilityEvidence({ ...common, evidenceId: evidenceIdFor(aggregate.snapshot.snapshotId, "TOP10_CONCENTRATION"), metricKind: "TOP10_CONCENTRATION", valueAtoms: aggregate.concentration.top10.valueAtoms, holderDerivationFingerprint: aggregate.concentration.top10.fingerprint });
    } catch (error) {
      const code = error instanceof Error ? error.message : "M5_HOLDER_CONCENTRATION_AUTHORITY_INVALID";
      return fail(code.includes("MISSING") ? "INCOMPLETE" : "INVALID", code.startsWith("M5_") ? code : "M5_HOLDER_CONCENTRATION_AUTHORITY_INVALID");
    }
    const savedSingle = await repositories.evidence.save(single);
    const savedTop10 = await repositories.evidence.save(top10);
    if (savedSingle.evidenceKind !== "QUANTITATIVE" || savedTop10.evidenceKind !== "QUANTITATIVE" || savedSingle.holderDerivationFingerprint !== aggregate.concentration.single.fingerprint || savedTop10.holderDerivationFingerprint !== aggregate.concentration.top10.fingerprint) throw new Error("M5_HOLDER_CONCENTRATION_EVIDENCE_REREAD_INVALID");
    return freeze({ status: "PERSISTED", evidence: [savedSingle, savedTop10] as const, snapshotId: aggregate.snapshot.snapshotId, snapshotFingerprint: aggregate.snapshot.fingerprint, derivationFingerprints: [aggregate.concentration.single.fingerprint, aggregate.concentration.top10.fingerprint] as const });
  });
}
