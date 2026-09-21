import { createQuantitativeEligibilityEvidence, type QuantitativeEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import type { AssetMappingRevisionRepository } from "@/application/intelligence/asset-mapping-revision-repository";
import type { SourceLineageRepository } from "@/application/intelligence/source-lineage-repository";
import { assertProviderAssetIdentityAssertion, type ProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import type { AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { SourceLineage } from "@/domain/intelligence/source-lineage";
import type { M5DailySeriesAuthorityAggregate, M5DailySeriesAuthorityRepository } from "@/application/intelligence/m5-daily-series-authority-persistence";
import type { RawEligibilityEvidenceRepository } from "@/infrastructure/postgres/eligibility-evidence-repository";

export type M5DailySeriesEvidenceRepositories = Readonly<{
  mapping: Pick<AssetMappingRevisionRepository, "readById">;
  lineage: Pick<SourceLineageRepository, "readById" | "validateForRawEvidenceCreation">;
  assertion: Readonly<{ readById: (id: string) => Promise<ProviderAssetIdentityAssertion | undefined> }>;
  dailySeries: Pick<M5DailySeriesAuthorityRepository, "readById">;
  evidence: Pick<RawEligibilityEvidenceRepository, "save">;
}>;
export interface M5DailySeriesEvidenceUnitOfWork { readonly withTransaction: <T>(work: (repositories: M5DailySeriesEvidenceRepositories) => Promise<T>) => Promise<T>; }
export type PersistM5DailySeriesEvidenceResult =
  | Readonly<{ status: "PERSISTED"; evidence: readonly [QuantitativeEligibilityEvidence, QuantitativeEligibilityEvidence]; authorityId: string; authorityFingerprint: string; derivationFingerprints: readonly [string, string] }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly string[] }>;

const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; };
const fail = (status: "INCOMPLETE" | "INVALID", code: string): PersistM5DailySeriesEvidenceResult => freeze({ status, diagnostics: [code] });
const evidenceIdFor = (authorityId: string, metric: string) => `m5-daily-series-evidence:${authorityId}:${metric}`;

function validateCrossAuthority(aggregate: M5DailySeriesAuthorityAggregate, mapping: AssetMappingRevision, assertion: ProviderAssetIdentityAssertion, lineage: SourceLineage): void {
  const authority = aggregate.authority;
  assertProviderAssetIdentityAssertion(assertion);
  if (authority.sourceLineageId !== lineage.sourceLineageId || mapping.sourceLineageId !== lineage.sourceLineageId || authority.providerId !== mapping.providerId || authority.datasetId !== mapping.datasetId || authority.datasetVersion !== mapping.datasetVersion || lineage.providerId !== mapping.providerId || lineage.datasetId !== mapping.datasetId || lineage.datasetVersion !== mapping.datasetVersion) throw new Error("M5_DAILY_EVIDENCE_SCOPE_MISMATCH");
  if (authority.providerAssetIdentity !== assertion.providerAssetId || assertion.providerId !== mapping.providerId || assertion.datasetId !== mapping.datasetId || assertion.datasetVersion !== mapping.datasetVersion || assertion.providerSourceNamespace !== mapping.providerAssetNamespace || assertion.providerAssetId !== mapping.providerAssetId) throw new Error("M5_DAILY_EVIDENCE_ASSERTION_MISMATCH");
  if (assertion.identityNamespace !== authority.chainId || assertion.identityValue !== authority.contractAddress) throw new Error("M5_DAILY_EVIDENCE_IDENTITY_MISMATCH");
  if (mapping.canonicalAssetId.trim() === "" || mapping.canonicalIdentifier.trim() === "" || mapping.assetClass === "UNKNOWN") throw new Error("M5_DAILY_EVIDENCE_MAPPING_INVALID");
  if (mapping.validFrom > authority.earliestObservedAt || (mapping.validTo !== undefined && authority.availableAt >= mapping.validTo)) throw new Error("M5_DAILY_EVIDENCE_MAPPING_VALIDITY_MISMATCH");
  if (mapping.observedAt !== lineage.observedAt || mapping.availableAt !== lineage.effectiveAvailableAt || lineage.observedAt !== authority.latestObservedAt || lineage.effectiveAvailableAt !== authority.availableAt) throw new Error("M5_DAILY_EVIDENCE_TEMPORAL_MISMATCH");
  const sameSet = (left: readonly string[], right: readonly string[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  if (!sameSet(mapping.sourceRecordIds, lineage.sourceArtifactIds) || !sameSet(authority.sourceArtifactIds, lineage.sourceArtifactIds)) throw new Error("M5_DAILY_EVIDENCE_SOURCE_MISMATCH");
}

export async function persistM5DailySeriesEvidence(input: Readonly<{ unitOfWork: M5DailySeriesEvidenceUnitOfWork; mappingRevisionId: string; authorityId: string; candidateId: string }>): Promise<PersistM5DailySeriesEvidenceResult> {
  return input.unitOfWork.withTransaction(async repositories => {
    const mapping = await repositories.mapping.readById?.(input.mappingRevisionId);
    if (!mapping) return fail("INCOMPLETE", "M5_DAILY_EVIDENCE_MAPPING_MISSING");
    const lineage = repositories.lineage.validateForRawEvidenceCreation ? await repositories.lineage.validateForRawEvidenceCreation(mapping.sourceLineageId) : await repositories.lineage.readById(mapping.sourceLineageId);
    if (!lineage) return fail("INCOMPLETE", "M5_DAILY_EVIDENCE_LINEAGE_MISSING");
    const assertion = await repositories.assertion.readById(mapping.providerAssetIdentityAssertionId);
    if (!assertion) return fail("INCOMPLETE", "M5_DAILY_EVIDENCE_ASSERTION_MISSING");
    const aggregate = await repositories.dailySeries.readById(input.authorityId);
    if (!aggregate) return fail("INCOMPLETE", "M5_DAILY_EVIDENCE_AUTHORITY_MISSING");
    let history: QuantitativeEligibilityEvidence;
    let volatility: QuantitativeEligibilityEvidence;
    try {
      validateCrossAuthority(aggregate, mapping, assertion, lineage);
      const { authority, historySpan, volatility: vol } = aggregate;
      if (historySpan.metricKind !== "HISTORY_SPAN" || vol.metricKind !== "VOLATILITY" || historySpan.authorityId !== authority.authorityId || vol.authorityId !== authority.authorityId || historySpan.asOf !== vol.asOf || historySpan.availableAt !== vol.availableAt || historySpan.observationCount !== authority.observationCount || vol.observationCount !== authority.observationCount || historySpan.orderedObservationIds.join("\u0000") !== vol.orderedObservationIds.join("\u0000")) throw new Error("M5_DAILY_EVIDENCE_DERIVATION_PAIR_INVALID");
      const common = { candidateId: input.candidateId, assetId: mapping.canonicalAssetId, canonicalIdentifier: mapping.canonicalIdentifier, assetClass: mapping.assetClass, providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion, mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: lineage.sourceLineageId, observedAt: authority.latestObservedAt, availableAt: authority.availableAt, provenance: { sourceType: "M5_SOURCE_LINEAGE" as const, sourceRecordIds: lineage.sourceArtifactIds, payloadFingerprint: lineage.fingerprint } };
      history = createQuantitativeEligibilityEvidence({ ...common, evidenceId: evidenceIdFor(authority.authorityId, "HISTORY_SPAN"), metricKind: "HISTORY_SPAN", valueAtoms: historySpan.value, scale: historySpan.scale, unit: historySpan.unit, semanticsVersion: historySpan.derivationVersion, qualificationBasis: "QUALIFYING_PRICE_OBSERVATIONS", window: { startAt: historySpan.earliestObservedAt, endAt: historySpan.latestObservedAt }, dailySeriesAuthorityId: authority.authorityId, dailySeriesAuthorityFingerprint: authority.fingerprint, dailySeriesDerivationFingerprint: historySpan.fingerprint, asOf: historySpan.asOf });
      volatility = createQuantitativeEligibilityEvidence({ ...common, evidenceId: evidenceIdFor(authority.authorityId, "VOLATILITY"), metricKind: "VOLATILITY", valueAtoms: vol.value, scale: vol.scale, unit: vol.unit, semanticsVersion: vol.derivationVersion, window: { startAt: vol.earliestObservedAt, endAt: vol.latestObservedAt }, dailySeriesAuthorityId: authority.authorityId, dailySeriesAuthorityFingerprint: authority.fingerprint, dailySeriesDerivationFingerprint: vol.fingerprint, asOf: vol.asOf });
    } catch (error) {
      const code = error instanceof Error ? error.message : "M5_DAILY_EVIDENCE_AUTHORITY_INVALID";
      return fail(code.includes("MISSING") ? "INCOMPLETE" : "INVALID", code.startsWith("M5_") ? code : "M5_DAILY_EVIDENCE_AUTHORITY_INVALID");
    }
    const savedHistory = await repositories.evidence.save(history);
    const savedVolatility = await repositories.evidence.save(volatility);
    if (savedHistory.evidenceKind !== "QUANTITATIVE" || savedVolatility.evidenceKind !== "QUANTITATIVE" || savedHistory.dailySeriesDerivationFingerprint !== history.dailySeriesDerivationFingerprint || savedVolatility.dailySeriesDerivationFingerprint !== volatility.dailySeriesDerivationFingerprint) throw new Error("M5_DAILY_EVIDENCE_REREAD_INVALID");
    return freeze({ status: "PERSISTED", evidence: [savedHistory, savedVolatility] as const, authorityId: aggregate.authority.authorityId, authorityFingerprint: aggregate.authority.fingerprint, derivationFingerprints: [history.dailySeriesDerivationFingerprint!, volatility.dailySeriesDerivationFingerprint!] as const });
  });
}
