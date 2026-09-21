import { canonicalSha256 } from "./ingestion-provenance";

export const M5_VENUE_AUTHORITY_VERSION = "m5-venue-universe-authority/v1" as const;
export type VenueCoverageKind = "PAGINATED_COMPLETE_UNIVERSE";

export type VenueAuthoritySourceMaterial = Readonly<{
  sourceArtifactId: string;
  sourceEnvelopeId: string;
  sourceObservationId: string;
  providerExternalRecordId: string;
  payloadFingerprint: string;
  venueNamespace: string;
  venueId: string;
  venueType?: string;
  chainId?: string;
  pageOrdinal: number;
  recordOrdinal: number;
  finalPage: boolean;
  expectedPageCount: number;
  expectedRecordCount: number;
  coverageKind: VenueCoverageKind;
  coverageVersion: string;
  observedAt: string;
  availableAt: string;
}>;

export type VenueAuthorityMember = Readonly<{
  memberId: string;
  venueNamespace: string;
  venueId: string;
  venueType?: string;
  chainId?: string;
  sourceRecordIds: readonly string[];
  sourceArtifactIds: readonly string[];
  sourceEnvelopeIds: readonly string[];
  sourceObservationIds: readonly string[];
  payloadFingerprints: readonly string[];
  observedAt: string;
  availableAt: string;
  fingerprint: string;
}>;

export type M5VenueAuthority = Readonly<{
  authorityId: string;
  contractVersion: typeof M5_VENUE_AUTHORITY_VERSION;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  sourceLineageId: string;
  asOf: string;
  coverageKind: VenueCoverageKind;
  coverageVersion: string;
  universeNamespace: string;
  universeId: string;
  expectedPageCount: number;
  expectedRecordCount: number;
  finalPageOrdinal: number;
  sourceMaterials: readonly VenueAuthoritySourceMaterial[];
  members: readonly VenueAuthorityMember[];
  observedAt: string;
  effectiveAvailableAt: string;
  fingerprint: string;
  recordedAt: string;
}>;

export type M5VenueAuthorityResult =
  | Readonly<{ status: "READY"; authority: M5VenueAuthority }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly string[] }>;

const SHA = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "" && value.length <= 256;
const time = (value: unknown): value is string => typeof value === "string" && UTC.test(value) && new Date(value).toISOString() === value;
const invalid = (code: string): M5VenueAuthorityResult => freeze({ status: "INVALID", diagnostics: [code] });
const incomplete = (code: string): M5VenueAuthorityResult => freeze({ status: "INCOMPLETE", diagnostics: [code] });
const sorted = (values: readonly string[]): readonly string[] => Object.freeze([...values].sort((a, b) => a.localeCompare(b)));

function memberIdFor(namespace: string, venueId: string, chainId?: string): string {
  return `m5-venue-member:${canonicalSha256({ version: M5_VENUE_AUTHORITY_VERSION, namespace, venueId, chainId: chainId ?? null })}`;
}

function validateMaterial(material: VenueAuthoritySourceMaterial, input: { asOf: string; providerId: string; datasetId: string; datasetVersion: string }): void {
  if (![material.sourceArtifactId, material.sourceEnvelopeId, material.sourceObservationId, material.providerExternalRecordId, material.venueNamespace, material.venueId, material.coverageVersion].every(text) || !SHA.test(material.payloadFingerprint) || !time(material.observedAt) || !time(material.availableAt) || material.observedAt > material.availableAt || material.availableAt > input.asOf || !Number.isSafeInteger(material.pageOrdinal) || material.pageOrdinal < 0 || !Number.isSafeInteger(material.recordOrdinal) || material.recordOrdinal < 0 || !Number.isSafeInteger(material.expectedPageCount) || material.expectedPageCount < 1 || !Number.isSafeInteger(material.expectedRecordCount) || material.expectedRecordCount < 1 || material.coverageKind !== "PAGINATED_COMPLETE_UNIVERSE" || (material.chainId !== undefined && !text(material.chainId)) || (material.venueType !== undefined && !text(material.venueType))) throw new Error("M5_VENUE_MATERIAL_INVALID");
  if (material.pageOrdinal >= material.expectedPageCount || material.recordOrdinal >= material.expectedRecordCount) throw new Error("M5_VENUE_ORDINAL_INVALID");
  if (material.pageOrdinal >= material.expectedPageCount || material.expectedRecordCount < material.expectedPageCount) throw new Error("M5_VENUE_COVERAGE_INVALID");
  void input.providerId; void input.datasetId; void input.datasetVersion;
}

export function createM5VenueAuthority(input: Readonly<{
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  sourceLineageId: string;
  asOf: string;
  universeNamespace: string;
  universeId: string;
  expectedPageCount: number;
  expectedRecordCount: number;
  materials: readonly VenueAuthoritySourceMaterial[];
  recordedAt: string;
}>): M5VenueAuthorityResult {
  if (![input.providerId, input.datasetId, input.datasetVersion, input.sourceLineageId, input.universeNamespace, input.universeId].every(text) || !time(input.asOf) || !time(input.recordedAt)) return invalid("M5_VENUE_SCOPE_INVALID");
  if (!Number.isSafeInteger(input.expectedPageCount) || input.expectedPageCount < 1 || !Number.isSafeInteger(input.expectedRecordCount) || input.expectedRecordCount < 1) return incomplete("M5_VENUE_COVERAGE_INCOMPLETE");
  if (!Array.isArray(input.materials) || input.materials.length !== input.expectedRecordCount) return incomplete("M5_VENUE_SOURCE_SET_INCOMPLETE");
  try { input.materials.forEach(material => validateMaterial(material, input)); } catch (error) { return invalid(error instanceof Error ? error.message : "M5_VENUE_MATERIAL_INVALID"); }
  const records = input.materials.map(material => material.providerExternalRecordId);
  if (new Set(records).size !== records.length) return invalid("M5_VENUE_SOURCE_RECORD_DUPLICATE");
  const pages = new Map<number, VenueAuthoritySourceMaterial[]>();
  for (const material of input.materials) pages.set(material.pageOrdinal, [...(pages.get(material.pageOrdinal) ?? []), material]);
  if (pages.size !== input.expectedPageCount || [...pages.keys()].sort((a, b) => a - b).some((page, index) => page !== index)) return incomplete("M5_VENUE_PAGE_SET_INCOMPLETE");
  const finalPages = [...pages.entries()].filter(([, values]) => values.some(value => value.finalPage));
  if (finalPages.length !== 1 || finalPages[0]![0] !== input.expectedPageCount - 1 || finalPages[0]![1].some(value => !value.finalPage) || [...pages.entries()].some(([page, values]) => page < input.expectedPageCount - 1 && values.some(value => value.finalPage))) return incomplete("M5_VENUE_FINAL_MARKER_INCOMPLETE");
  const ordered = [...input.materials].sort((a, b) => a.recordOrdinal - b.recordOrdinal || a.providerExternalRecordId.localeCompare(b.providerExternalRecordId));
  if (ordered.some((material, index) => material.recordOrdinal !== index)) return invalid("M5_VENUE_RECORD_ORDINAL_INVALID");
  const scope = `${input.universeNamespace}\u0000${input.universeId}\u0000${input.expectedPageCount}\u0000${input.expectedRecordCount}`;
  const memberGroups = new Map<string, VenueAuthoritySourceMaterial[]>();
  for (const material of ordered) {
    const key = `${material.venueNamespace}\u0000${material.venueId}\u0000${material.chainId ?? ""}`;
    memberGroups.set(key, [...(memberGroups.get(key) ?? []), material]);
  }
  const members = [...memberGroups.values()].map(group => {
    const first = group[0]!;
    const sourceRecordIds = sorted(group.map(value => value.providerExternalRecordId));
    const sourceArtifactIds = sorted(group.map(value => value.sourceArtifactId));
    const sourceEnvelopeIds = sorted(group.map(value => value.sourceEnvelopeId));
    const sourceObservationIds = sorted(group.map(value => value.sourceObservationId));
    const payloadFingerprints = sorted(group.map(value => value.payloadFingerprint));
    const memberId = memberIdFor(first.venueNamespace, first.venueId, first.chainId);
    const body = { contractVersion: M5_VENUE_AUTHORITY_VERSION, memberId, venueNamespace: first.venueNamespace, venueId: first.venueId, venueType: first.venueType, chainId: first.chainId, sourceRecordIds, sourceArtifactIds, sourceEnvelopeIds, sourceObservationIds, payloadFingerprints, observedAt: group.map(value => value.observedAt).sort().at(-1)!, availableAt: group.map(value => value.availableAt).sort().at(-1)! };
    if (group.some(value => value.venueNamespace !== first.venueNamespace || value.venueId !== first.venueId || value.venueType !== first.venueType || value.chainId !== first.chainId)) throw new Error("M5_VENUE_IDENTITY_CONFLICT");
    return { ...body, fingerprint: canonicalSha256(body) } as VenueAuthorityMember;
  }).sort((a, b) => a.memberId.localeCompare(b.memberId));
  const authorityId = `m5-venue-authority:${canonicalSha256({ version: M5_VENUE_AUTHORITY_VERSION, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, sourceLineageId: input.sourceLineageId, asOf: input.asOf, universeNamespace: input.universeNamespace, universeId: input.universeId })}`;
  const observedAt = ordered.map(value => value.observedAt).sort().at(-1)!;
  const effectiveAvailableAt = ordered.map(value => value.availableAt).sort().at(-1)!;
  if (observedAt > effectiveAvailableAt || effectiveAvailableAt > input.asOf) return invalid("M5_VENUE_TEMPORAL_INVALID");
  const authorityBody = { contractVersion: M5_VENUE_AUTHORITY_VERSION, authorityId, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, sourceLineageId: input.sourceLineageId, asOf: input.asOf, coverageKind: "PAGINATED_COMPLETE_UNIVERSE" as const, coverageVersion: ordered[0]!.coverageVersion, universeNamespace: input.universeNamespace, universeId: input.universeId, expectedPageCount: input.expectedPageCount, expectedRecordCount: input.expectedRecordCount, finalPageOrdinal: input.expectedPageCount - 1, members, observedAt, effectiveAvailableAt };
  if (ordered.some(value => value.coverageVersion !== authorityBody.coverageVersion || value.expectedPageCount !== input.expectedPageCount || value.expectedRecordCount !== input.expectedRecordCount)) return invalid("M5_VENUE_COVERAGE_MISMATCH");
  const fingerprint = canonicalSha256({ ...authorityBody, sourceMaterials: ordered, scope });
  return freeze({ status: "READY", authority: { ...authorityBody, sourceMaterials: ordered, fingerprint, recordedAt: input.recordedAt } });
}

export function assertM5VenueAuthority(value: M5VenueAuthority): void {
  const expected = createM5VenueAuthority({ providerId: value.providerId, datasetId: value.datasetId, datasetVersion: value.datasetVersion, sourceLineageId: value.sourceLineageId, asOf: value.asOf, universeNamespace: value.universeNamespace, universeId: value.universeId, expectedPageCount: value.expectedPageCount, expectedRecordCount: value.expectedRecordCount, materials: value.sourceMaterials, recordedAt: value.recordedAt });
  if (expected.status !== "READY" || expected.authority.authorityId !== value.authorityId || expected.authority.fingerprint !== value.fingerprint || canonicalSha256(expected.authority.members) !== canonicalSha256(value.members)) throw new Error("M5_VENUE_AUTHORITY_FINGERPRINT_INVALID");
}

export { memberIdFor };
