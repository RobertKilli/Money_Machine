import { createM5MarketMetricsAuthority, type MarketSourceMaterial, type M5MarketMetricsAuthorityAggregate } from "@/domain/intelligence/m5-market-metrics-authority";
import type { SourceLineageRepository } from "./source-lineage-repository";

export interface M5MarketMetricsAuthorityRepository {
  readonly save: (aggregate: M5MarketMetricsAuthorityAggregate) => Promise<M5MarketMetricsAuthorityAggregate>;
  readonly readById: (id: string) => Promise<M5MarketMetricsAuthorityAggregate | undefined>;
}
export interface M5MarketMetricsAuthorityPersistenceRepositories {
  readonly sourceLineage: Pick<SourceLineageRepository, "readById" | "readMembers" | "readMemberAuthorities" | "validateForRawEvidenceCreation">;
  readonly market: M5MarketMetricsAuthorityRepository;
}
export interface M5MarketMetricsAuthorityPersistenceUnitOfWork {
  readonly withTransaction: <T>(work: (repositories: M5MarketMetricsAuthorityPersistenceRepositories) => Promise<T>) => Promise<T>;
}
export type PersistM5MarketMetricsAuthorityResult =
  | Readonly<{ status: "PERSISTED"; aggregate: M5MarketMetricsAuthorityAggregate }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly string[] }>;

const freeze = <T>(value: T): T => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) freeze(child); } return value; };
const incomplete = (code: string): PersistM5MarketMetricsAuthorityResult => freeze({ status: "INCOMPLETE", diagnostics: [code] });
const invalid = (code: string): PersistM5MarketMetricsAuthorityResult => freeze({ status: "INVALID", diagnostics: [code] });
const envelopeText = (fields: Record<string, unknown>, key: string): string => { const value = fields[key]; if (typeof value !== "string" || value.trim() === "") throw new Error("M5_MARKET_AUTHORITY_MATERIAL_MISMATCH"); return value; };
const envelopeAtoms = (fields: Record<string, unknown>, key: string): bigint => { const value = fields[key]; if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("M5_MARKET_AUTHORITY_MATERIAL_MISMATCH"); return BigInt(value); };
const envelopeScale = (fields: Record<string, unknown>, key: string): number => { const value = fields[key]; if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error("M5_MARKET_AUTHORITY_MATERIAL_MISMATCH"); return value as number; };

/** Binds caller-supplied metric material to the exact sealed SourceLineage before saving. */
export async function persistM5MarketMetricsAuthority(input: Readonly<{
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  sourceLineageId: string;
  asOf: string;
  quoteCurrency: string;
  materials: readonly MarketSourceMaterial[];
  recordedAt: string;
  unitOfWork: M5MarketMetricsAuthorityPersistenceUnitOfWork;
}>): Promise<PersistM5MarketMetricsAuthorityResult> {
  const initial = createM5MarketMetricsAuthority(input);
  if (initial.status !== "READY") return freeze({ status: initial.status, diagnostics: initial.diagnostics });
  return input.unitOfWork.withTransaction(async repositories => {
    const lineage = await repositories.sourceLineage.readById(input.sourceLineageId);
    if (!lineage) return incomplete("M5_MARKET_AUTHORITY_LINEAGE_MISSING");
    if (!repositories.sourceLineage.validateForRawEvidenceCreation || !repositories.sourceLineage.readMemberAuthorities) throw new Error("M5_MARKET_AUTHORITY_LINEAGE_REPOSITORY_UNSUPPORTED");
    await repositories.sourceLineage.validateForRawEvidenceCreation(input.sourceLineageId);
    const members = await repositories.sourceLineage.readMembers(input.sourceLineageId);
    const authorities = await repositories.sourceLineage.readMemberAuthorities(input.sourceLineageId);
    if (lineage.providerId !== input.providerId || lineage.datasetId !== input.datasetId || lineage.datasetVersion !== input.datasetVersion || members.length !== input.materials.length || authorities.length !== input.materials.length) return invalid("M5_MARKET_AUTHORITY_LINEAGE_SCOPE_MISMATCH");
    try {
      const materialArtifactIds = input.materials.map(material => material.sourceArtifactId);
      const materialEnvelopeIds = input.materials.map(material => material.sourceEnvelopeId);
      const materialObservationIds = input.materials.map(material => material.sourceObservationId);
      const memberArtifactIds = members.map(member => member.sourceArtifactId);
      const authorityArtifactIds = authorities.map(value => value.artifact.sourceArtifactId);
      const sameSet = (left: readonly string[], right: readonly string[]): boolean => [...left].sort().join("|") === [...right].sort().join("|");
      if (new Set(materialArtifactIds).size !== materialArtifactIds.length || new Set(materialEnvelopeIds).size !== materialEnvelopeIds.length || new Set(materialObservationIds).size !== materialObservationIds.length || new Set(memberArtifactIds).size !== memberArtifactIds.length || new Set(authorityArtifactIds).size !== authorityArtifactIds.length || !sameSet(materialArtifactIds, memberArtifactIds) || !sameSet(materialArtifactIds, authorityArtifactIds) || !sameSet(lineage.sourceArtifactIds, materialArtifactIds)) throw new Error("M5_MARKET_AUTHORITY_MATERIAL_MISMATCH");
      const byArtifact = new Map(authorities.map(value => [value.artifact.sourceArtifactId, value]));
      const bound = input.materials.map(material => {
        const authority = byArtifact.get(material.sourceArtifactId);
        const member = members.find(value => value.sourceArtifactId === material.sourceArtifactId);
        if (!authority || !member || member.sourceLineageId !== input.sourceLineageId || member.providerId !== input.providerId || member.datasetId !== input.datasetId || member.datasetVersion !== input.datasetVersion || member.sourceEnvelopeId !== material.sourceEnvelopeId || member.sourceObservationId !== material.sourceObservationId || authority.artifact.providerId !== input.providerId || authority.artifact.datasetId !== input.datasetId || authority.artifact.datasetVersion !== input.datasetVersion || authority.envelope.sourceArtifactId !== material.sourceArtifactId || authority.envelope.sourceEnvelopeId !== material.sourceEnvelopeId || authority.observation.sourceArtifactId !== material.sourceArtifactId || authority.observation.sourceObservationId !== material.sourceObservationId || authority.envelope.payloadFingerprint !== authority.artifact.payloadFingerprint || authority.artifact.providerExternalRecordId !== material.providerExternalRecordId || authority.artifact.payloadFingerprint !== material.payloadFingerprint || authority.envelope.payloadFingerprint !== material.payloadFingerprint) throw new Error("M5_MARKET_AUTHORITY_MATERIAL_MISMATCH");
        const fields = authority.envelope.normalizedEnvelope as Record<string, unknown>;
        const metricKind = envelopeText(fields, "metricKind") as MarketSourceMaterial["metricKind"];
        const valueAtoms = envelopeAtoms(fields, "valueAtoms");
        const scale = envelopeScale(fields, "sourceScale");
        const quoteCurrency = envelopeText(fields, "quoteCurrency");
        const basis = envelopeText(fields, "basis");
        const derived: MarketSourceMaterial = { ...material, metricKind, valueAtoms, scale, quoteCurrency, basis, observedAt: authority.envelope.observedAt, availableAt: authority.claim.effectiveAvailableAt, providerExternalRecordId: authority.artifact.providerExternalRecordId, payloadFingerprint: authority.artifact.payloadFingerprint };
        const withWindow = metricKind === "VOLUME" ? { ...derived, windowStart: envelopeText(fields, "windowStart"), windowEnd: envelopeText(fields, "windowEnd") } : derived;
        if (metricKind === "LIQUIDITY") {
          if (fields.coverageComplete !== true || fields.expectedComponentCount !== 2) throw new Error("M5_MARKET_AUTHORITY_MATERIAL_MISMATCH");
          const componentA = { id: envelopeText(fields, "componentAId"), valueAtoms: envelopeAtoms(fields, "componentAAtoms"), scale: envelopeScale(fields, "componentScale"), quoteCurrency };
          const componentB = { id: envelopeText(fields, "componentBId"), valueAtoms: envelopeAtoms(fields, "componentBAtoms"), scale: componentA.scale, quoteCurrency };
          return { ...withWindow, coverageVersion: envelopeText(fields, "coverageVersion"), coverageComplete: true, expectedComponentCount: 2, componentIds: [componentA.id, componentB.id], components: [componentA, componentB] };
        }
        return withWindow;
      });
      const rebuilt = createM5MarketMetricsAuthority({ ...input, materials: bound });
      if (rebuilt.status !== "READY") return freeze({ status: rebuilt.status, diagnostics: rebuilt.diagnostics });
      return freeze({ status: "PERSISTED", aggregate: await repositories.market.save({ authority: rebuilt.authority, derivations: rebuilt.derivations }) });
    } catch (error) {
      if (error instanceof Error && error.message === "M5_MARKET_AUTHORITY_MATERIAL_MISMATCH") return invalid(error.message);
      throw error;
    }
  });
}
