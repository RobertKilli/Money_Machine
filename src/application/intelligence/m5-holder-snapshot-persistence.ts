import type { M5HolderConcentrationResult, M5HolderSnapshot, M5HolderPage } from "@/domain/intelligence/m5-holder-concentration";
import { createM5HolderSnapshot, deriveM5HolderConcentration } from "@/domain/intelligence/m5-holder-concentration";
import type { SourceLineage, SourceLineageMember } from "@/domain/intelligence/source-lineage";
import type { SourceLineageClaimAuthority, SourceLineageRepository } from "./source-lineage-repository";

export type M5HolderSnapshotAuthorityAggregate = Readonly<{
  snapshot: M5HolderSnapshot;
  concentration: Extract<M5HolderConcentrationResult, { status: "READY" }>;
  finalityProof: Readonly<{ referenceBlockNumber: bigint; referenceBlockHash: string; observedAt: string; receivedAt: string }>;
}>;

export interface M5HolderSnapshotAuthorityRepository {
  readonly save: (aggregate: M5HolderSnapshotAuthorityAggregate) => Promise<M5HolderSnapshotAuthorityAggregate>;
  readonly readById: (snapshotId: string) => Promise<M5HolderSnapshotAuthorityAggregate | undefined>;
}

export interface M5HolderSnapshotAuthorityRepositories {
  readonly sourceLineage: Pick<SourceLineageRepository, "readById" | "readMembers" | "readMemberAuthorities" | "validateForRawEvidenceCreation">;
  readonly snapshots: M5HolderSnapshotAuthorityRepository;
}

export interface M5HolderSnapshotAuthorityUnitOfWork {
  readonly withTransaction: <T>(work: (repositories: M5HolderSnapshotAuthorityRepositories) => Promise<T>) => Promise<T>;
}

export type PersistM5HolderSnapshotResult =
  | Readonly<{ status: "PERSISTED"; aggregate: M5HolderSnapshotAuthorityAggregate }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly M5HolderSnapshotPersistenceDiagnostic[] }>;

export type M5HolderSnapshotPersistenceDiagnostic =
  | "M5_HOLDER_PERSISTENCE_LINEAGE_MISSING"
  | "M5_HOLDER_PERSISTENCE_LINEAGE_INCOMPLETE"
  | "M5_HOLDER_PERSISTENCE_LINEAGE_MISMATCH"
  | "M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH"
  | "M5_HOLDER_PERSISTENCE_SNAPSHOT_NOT_READY"
  | "M5_HOLDER_PERSISTENCE_AUTHORITY_UNAVAILABLE";

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};

const sorted = (values: readonly string[]): readonly string[] => Object.freeze([...values].sort((a, b) => a.localeCompare(b)));
const equalSorted = (left: readonly string[], right: readonly string[]): boolean => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
const field = (value: unknown): unknown => value;
const envelopeField = (authority: SourceLineageClaimAuthority, key: string): unknown => field((authority.envelope.normalizedEnvelope as Record<string, unknown>)[key]);

function diagnostic(error: unknown): M5HolderSnapshotPersistenceDiagnostic {
  const code = error instanceof Error ? error.message : "";
  if (code === "M5_SOURCE_LINEAGE_NOT_FOUND") return "M5_HOLDER_PERSISTENCE_LINEAGE_MISSING";
  if (/M5_SOURCE_LINEAGE_ATTEMPT_|M5_RAW_SOURCE_LINEAGE_ATTEMPT_|M5_SOURCE_LINEAGE_SEAL_|M5_SOURCE_LINEAGE_MEMBER_/.test(code)) return "M5_HOLDER_PERSISTENCE_LINEAGE_INCOMPLETE";
  if (code === "M5_HOLDER_PERSISTENCE_AUTHORITY_UNAVAILABLE") return "M5_HOLDER_PERSISTENCE_AUTHORITY_UNAVAILABLE";
  return "M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH";
}

function artifactByExternalId(authorities: readonly SourceLineageClaimAuthority[]): Map<string, SourceLineageClaimAuthority> {
  const result = new Map<string, SourceLineageClaimAuthority>();
  for (const authority of authorities) {
    const key = authority.artifact.providerExternalRecordId;
    if (result.has(key)) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
    result.set(key, authority);
  }
  return result;
}

function validatePageEnvelope(page: M5HolderPage, authority: SourceLineageClaimAuthority, snapshot: M5HolderSnapshot): void {
  if (authority.artifact.payloadFingerprint !== page.payloadFingerprint || authority.envelope.payloadFingerprint !== page.payloadFingerprint) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
  const expected: Record<string, unknown> = {
    chainId: snapshot.chainId,
    contractAddress: snapshot.contractAddress,
    snapshotBlockNumber: snapshot.blockNumber.toString(),
    snapshotBlockHash: snapshot.blockHash,
    snapshotBlockTimestamp: snapshot.blockTimestamp,
    decimals: snapshot.tokenDecimals,
    totalSupplyAtoms: snapshot.denominatorAtoms.toString(),
    declaredHolderCount: snapshot.declaredHolderCount,
    pageOrdinal: page.pageOrdinal,
    isFinal: page.isFinal,
  };
  for (const [key, value] of Object.entries(expected)) if (envelopeField(authority, key) !== value) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
  if (envelopeField(authority, "declaredPageCount") !== snapshot.fullPaginationProof.pageCount) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
  if (authority.observation.retrievedAt !== snapshot.availableAt) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
  const finality = envelopeField(authority, "finality");
  if (!finality || typeof finality !== "object" || Array.isArray(finality)) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
  const finalityRecord = finality as Record<string, unknown>;
  if (finalityRecord.referenceBlockNumber !== (snapshot.blockNumber + BigInt(snapshot.finalityDepth)).toString() || typeof finalityRecord.referenceBlockHash !== "string" || typeof finalityRecord.observedAt !== "string" || typeof finalityRecord.receivedAt !== "string" || String(finalityRecord.receivedAt) > snapshot.availableAt || String(finalityRecord.observedAt) > String(finalityRecord.receivedAt)) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
}

function bindSnapshot(snapshot: M5HolderSnapshot, lineage: SourceLineage, members: readonly SourceLineageMember[], authorities: readonly SourceLineageClaimAuthority[], recordedAt: string): { snapshot: M5HolderSnapshot; finalityProof: Readonly<{ referenceBlockNumber: bigint; referenceBlockHash: string; observedAt: string; receivedAt: string }> } {
  if (lineage.sourceLineageId !== snapshot.sourceLineageId && snapshot.sourceLineageId !== "UNBOUND_FIXTURE") throw new Error("M5_HOLDER_PERSISTENCE_LINEAGE_MISMATCH");
  if (lineage.sourceLineageId === "UNBOUND_FIXTURE" || lineage.providerId !== snapshot.providerId || lineage.datasetId !== snapshot.datasetId || lineage.datasetVersion !== snapshot.datasetVersion || lineage.observedAt !== snapshot.observedAt || lineage.effectiveAvailableAt !== snapshot.availableAt) throw new Error("M5_HOLDER_PERSISTENCE_LINEAGE_MISMATCH");
  if (members.length !== lineage.memberCount || authorities.length !== members.length || !equalSorted(lineage.sourceArtifactIds, authorities.map(value => value.artifact.sourceArtifactId)) || !equalSorted(snapshot.materialSourceRecordIds, authorities.map(value => value.artifact.providerExternalRecordId))) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
  const byExternal = artifactByExternalId(authorities);
  const byArtifact = new Map(authorities.map(value => [value.artifact.sourceArtifactId, value]));
  let proof: Readonly<{ referenceBlockNumber: bigint; referenceBlockHash: string; observedAt: string; receivedAt: string }> | undefined;
  const pages = snapshot.fullPaginationProof.pages.map(page => {
    if (page.sourceRecordIds.length !== 1) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
    const authority = byExternal.get(page.sourceRecordIds[0]!);
    if (!authority) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
    validatePageEnvelope(page, authority, snapshot);
    const finality = envelopeField(authority, "finality") as Record<string, unknown>;
    const current = Object.freeze({ referenceBlockNumber: BigInt(String(finality.referenceBlockNumber)), referenceBlockHash: String(finality.referenceBlockHash), observedAt: String(finality.observedAt), receivedAt: String(finality.receivedAt) });
    if (proof && (proof.referenceBlockNumber !== current.referenceBlockNumber || proof.referenceBlockHash !== current.referenceBlockHash || proof.observedAt !== current.observedAt || proof.receivedAt !== current.receivedAt)) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
    proof = current;
    return freeze({ ...page, sourceRecordIds: freeze([authority.artifact.sourceArtifactId]) });
  });
  const holders = snapshot.holders.map(holder => {
    const authority = byExternal.get(holder.sourceRecordId);
    if (!authority) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
    return freeze({ ...holder, sourceRecordId: authority.artifact.sourceArtifactId });
  });
  if (new Set(pages.flatMap(page => page.sourceRecordIds)).size !== pages.length || pages.some(page => !byArtifact.has(page.sourceRecordIds[0]!))) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
  if (!proof) throw new Error("M5_HOLDER_PERSISTENCE_MATERIAL_MISMATCH");
  const { snapshotId: _snapshotId, fingerprint: _fingerprint, ...snapshotMaterial } = snapshot;
  void _snapshotId; void _fingerprint;
  return { snapshot: createM5HolderSnapshot({ ...snapshotMaterial, sourceLineageId: lineage.sourceLineageId, sourceLineageBinding: "BOUND", fullPaginationProof: { ...snapshot.fullPaginationProof, pages }, holders, materialSourceRecordIds: pages.flatMap(page => page.sourceRecordIds), recordedAt }), finalityProof: proof };
}

export async function persistM5HolderSnapshotFromSourceLineage(input: Readonly<{ snapshot: M5HolderSnapshot; sourceLineageId: string; asOf: string; recordedAt: string; unitOfWork: M5HolderSnapshotAuthorityUnitOfWork }>): Promise<PersistM5HolderSnapshotResult> {
  const initial = deriveM5HolderConcentration(input.snapshot, input.asOf);
  if (initial.status !== "READY") return freeze({ status: initial.status, diagnostics: ["M5_HOLDER_PERSISTENCE_SNAPSHOT_NOT_READY"] });
  return input.unitOfWork.withTransaction(async repositories => {
    const lineage = await repositories.sourceLineage.readById(input.sourceLineageId);
    if (!lineage) return freeze({ status: "INCOMPLETE", diagnostics: ["M5_HOLDER_PERSISTENCE_LINEAGE_MISSING"] });
    if (!repositories.sourceLineage.validateForRawEvidenceCreation || !repositories.sourceLineage.readMemberAuthorities) throw new Error("M5_HOLDER_PERSISTENCE_AUTHORITY_UNAVAILABLE");
    await repositories.sourceLineage.validateForRawEvidenceCreation(input.sourceLineageId);
    const members = await repositories.sourceLineage.readMembers(input.sourceLineageId);
    const authorities = await repositories.sourceLineage.readMemberAuthorities(input.sourceLineageId);
    let aggregate: M5HolderSnapshotAuthorityAggregate;
    try {
      const bound = bindSnapshot(input.snapshot, lineage, members, authorities, input.recordedAt);
      const concentration = deriveM5HolderConcentration(bound.snapshot, input.asOf);
      if (concentration.status !== "READY") return freeze({ status: concentration.status, diagnostics: ["M5_HOLDER_PERSISTENCE_SNAPSHOT_NOT_READY"] });
      aggregate = freeze({ snapshot: bound.snapshot, concentration, finalityProof: bound.finalityProof });
    } catch (error) {
      const code = diagnostic(error);
      return freeze({ status: code === "M5_HOLDER_PERSISTENCE_LINEAGE_INCOMPLETE" ? "INCOMPLETE" : "INVALID", diagnostics: [code] });
    }
    return freeze({ status: "PERSISTED", aggregate: await repositories.snapshots.save(aggregate) });
  });
}
