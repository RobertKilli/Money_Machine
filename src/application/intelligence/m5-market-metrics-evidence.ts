import { createQuantitativeEligibilityEvidence, type QuantitativeEligibilityEvidence, type RawEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import type { AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import type { SourceLineage } from "@/domain/intelligence/source-lineage";
import type { ProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import type { M5MarketMetricsAuthorityAggregate } from "@/domain/intelligence/m5-market-metrics-authority";
import type { RawEligibilityEvidenceRepository } from "@/infrastructure/postgres/eligibility-evidence-repository";

export type M5MarketMetricsEvidenceRepositories = Readonly<{
  mapping: Readonly<{ readById: (id: string) => Promise<AssetMappingRevision | undefined> }>;
  lineage: Readonly<{ readById: (id: string) => Promise<SourceLineage | undefined>; validateForRawEvidenceCreation?: (id: string) => Promise<SourceLineage> }>;
  assertion: Readonly<{ readById: (id: string) => Promise<ProviderAssetIdentityAssertion | undefined> }>;
  market: Readonly<{ readById: (id: string) => Promise<M5MarketMetricsAuthorityAggregate | undefined> }>;
  evidence: Pick<RawEligibilityEvidenceRepository, "save">;
}>;
export interface M5MarketMetricsEvidenceUnitOfWork { readonly withTransaction: <T>(work: (repositories: M5MarketMetricsEvidenceRepositories) => Promise<T>) => Promise<T>; }
export type PersistM5MarketMetricsEvidenceResult =
  | Readonly<{ status: "PERSISTED"; evidence: readonly [QuantitativeEligibilityEvidence, QuantitativeEligibilityEvidence, QuantitativeEligibilityEvidence]; authorityId: string; authorityFingerprint: string }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly string[] }>;
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const child of Object.values(v as Record<string, unknown>)) freeze(child); } return v; };
const fail = (status: "INCOMPLETE" | "INVALID", code: string): PersistM5MarketMetricsEvidenceResult => freeze({ status, diagnostics: [code] });
const metricOrder = ["MARKET_CAP", "VOLUME", "LIQUIDITY"] as const;
const asQuantitative = (value: RawEligibilityEvidence): QuantitativeEligibilityEvidence => {
  if (value.evidenceKind !== "QUANTITATIVE" || !metricOrder.includes(value.metricKind as typeof metricOrder[number])) throw new Error("M5_MARKET_EVIDENCE_REREAD_INVALID");
  return value as QuantitativeEligibilityEvidence;
};

export async function persistM5MarketMetricsEvidence(input: Readonly<{ unitOfWork: M5MarketMetricsEvidenceUnitOfWork; mappingRevisionId: string; authorityId: string; candidateId: string }>): Promise<PersistM5MarketMetricsEvidenceResult> {
  return input.unitOfWork.withTransaction(async r => {
    const mapping = await r.mapping.readById(input.mappingRevisionId); if (!mapping) return fail("INCOMPLETE", "M5_MARKET_EVIDENCE_MAPPING_MISSING");
    const lineage = r.lineage.validateForRawEvidenceCreation ? await r.lineage.validateForRawEvidenceCreation(mapping.sourceLineageId) : await r.lineage.readById(mapping.sourceLineageId); if (!lineage) return fail("INCOMPLETE", "M5_MARKET_EVIDENCE_LINEAGE_MISSING");
    const assertion = await r.assertion.readById(mapping.providerAssetIdentityAssertionId); if (!assertion) return fail("INCOMPLETE", "M5_MARKET_EVIDENCE_ASSERTION_MISSING");
    const aggregate = await r.market.readById(input.authorityId); if (!aggregate) return fail("INCOMPLETE", "M5_MARKET_EVIDENCE_AUTHORITY_MISSING");
    let records: QuantitativeEligibilityEvidence[];
    try {
      if (aggregate.authority.sourceLineageId !== lineage.sourceLineageId || mapping.sourceLineageId !== lineage.sourceLineageId || aggregate.authority.providerId !== mapping.providerId || aggregate.authority.datasetId !== mapping.datasetId || aggregate.authority.datasetVersion !== mapping.datasetVersion || assertion.providerId !== mapping.providerId || assertion.datasetId !== mapping.datasetId || assertion.datasetVersion !== mapping.datasetVersion || mapping.validFrom > aggregate.authority.observedAt || (mapping.validTo !== undefined && aggregate.authority.effectiveAvailableAt >= mapping.validTo) || lineage.observedAt !== aggregate.authority.observedAt || lineage.effectiveAvailableAt !== aggregate.authority.effectiveAvailableAt) throw new Error("M5_MARKET_EVIDENCE_SCOPE_MISMATCH");
      const lineageArtifacts = [...new Set(lineage.sourceArtifactIds)].sort().join("|");
      const authorityArtifacts = [...new Set(aggregate.authority.materials.map(m => m.sourceArtifactId))].sort().join("|");
      if (lineageArtifacts !== authorityArtifacts || aggregate.authority.materials.some(m => m.availableAt > lineage.effectiveAvailableAt) || !aggregate.authority.materials.some(m => m.sourceArtifactId === assertion.sourceArtifactId && m.sourceEnvelopeId === assertion.sourceEnvelopeId)) throw new Error("M5_MARKET_EVIDENCE_MATERIAL_MISMATCH");
      if (aggregate.derivations.length !== 3 || new Set(aggregate.derivations.map(d => d.metricKind)).size !== 3 || aggregate.derivations.some(d => !metricOrder.includes(d.metricKind))) throw new Error("M5_MARKET_EVIDENCE_DERIVATION_SET_INVALID");
      const common = { candidateId: input.candidateId, assetId: mapping.canonicalAssetId, canonicalIdentifier: mapping.canonicalIdentifier, assetClass: mapping.assetClass, providerId: mapping.providerId, datasetId: mapping.datasetId, datasetVersion: mapping.datasetVersion, mappingRevisionId: mapping.mappingRevisionId, sourceLineageId: lineage.sourceLineageId, observedAt: aggregate.authority.observedAt, availableAt: aggregate.authority.effectiveAvailableAt, provenance: { sourceType: "M5_SOURCE_LINEAGE" as const, sourceRecordIds: lineage.sourceArtifactIds, payloadFingerprint: lineage.fingerprint }, semanticsVersion: "m5-market-metrics-authority/v1", currencyCode: aggregate.authority.quoteCurrency, asOf: aggregate.authority.asOf };
      records = metricOrder.map(kind => { const d = aggregate.derivations.find(x => x.metricKind === kind)!; const window = d.windowStart && d.windowEnd ? { startAt: d.windowStart, endAt: d.windowEnd } : kind === "LIQUIDITY" ? { startAt: aggregate.authority.observedAt, endAt: aggregate.authority.asOf } : undefined; return createQuantitativeEligibilityEvidence({ ...common, evidenceId: `m5-market-metrics-evidence:${aggregate.authority.authorityId}:${kind}`, metricKind: kind, valueAtoms: d.valueAtoms, unit: d.unit, scale: d.scale, window, marketMetricsAuthorityId: aggregate.authority.authorityId, marketMetricsAuthorityFingerprint: aggregate.authority.fingerprint, marketMetricsDerivationFingerprint: d.fingerprint }); });
    } catch (error) {
      const code = error instanceof Error ? error.message : "M5_MARKET_EVIDENCE_INVALID";
      return fail("INVALID", code.startsWith("M5_") ? code : "M5_MARKET_EVIDENCE_INVALID");
    }
    const saved = [asQuantitative(await r.evidence.save(records[0]!)), asQuantitative(await r.evidence.save(records[1]!)), asQuantitative(await r.evidence.save(records[2]!))] as const;
    if (saved.some((row, i) => row.evidenceKind !== "QUANTITATIVE" || row.marketMetricsAuthorityFingerprint !== aggregate.authority.fingerprint || row.marketMetricsDerivationFingerprint !== records[i]!.marketMetricsDerivationFingerprint)) throw new Error("M5_MARKET_EVIDENCE_REREAD_INVALID");
    return freeze({ status: "PERSISTED", evidence: saved, authorityId: aggregate.authority.authorityId, authorityFingerprint: aggregate.authority.fingerprint });
  });
}
