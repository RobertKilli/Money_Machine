import "server-only";
import { types as utilTypes } from "node:util";
import { assertAssetMappingRevision, type AssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import { assertProviderAssetIdentityAssertion, type ProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import { isAuthenticSecEdgar8kFixtureClaim, isAuthenticSecEdgar8kFixtureResult, SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION, type SecEdgar8kFixtureClaim, type SecEdgar8kFixtureResult } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { canonicalSha256 } from "@/domain/intelligence/ingestion-provenance";

export const EVENT_ISSUER_MAPPING_VERSION = "event-intelligence-issuer-mapping-authority/v1" as const;
export const EVENT_ASSET_MENTION_BINDING_VERSION = "event-intelligence-asset-mention-binding/v1" as const;
export const EVENT_MAPPED_CLAIM_VERSION = "event-intelligence-mapped-non-authoritative-claim/v1" as const;
export const EVENT_MAPPING_PRODUCTION_CONFIG_VERSION = "event-intelligence-mapping-production-config/v1" as const;
export const EVENT_MAPPED_CLAIM_KIND = "MAPPED_NON_AUTHORITATIVE_EVENT_CLAIM" as const;

export type IssuerMappingStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED" | "INVALID";
export type IssuerMappingKind = "EXACT_REGISTRANT" | "EXACT_SUBSIDIARY" | "PARENT_RELATIONSHIP" | "SUCCESSOR";
export type EvidenceReference = Readonly<{ referenceId: string; classification: "DOCUMENTED" | "OBSERVED" | "INFERRED" | "UNKNOWN"; fingerprint: string }>;

export type EventIssuerMappingAuthority = Readonly<{
  contractVersion: typeof EVENT_ISSUER_MAPPING_VERSION;
  authorityId: string;
  fingerprint: string;
  sourceNamespace: string;
  jurisdiction: string;
  regulator: string;
  normalizedCik: string;
  sourceRegistrantId: string;
  registrantLegalName: string;
  canonicalIssuerId: string;
  canonicalLegalEntityId: string;
  entityType: "CORPORATION" | "LLC" | "PARTNERSHIP" | "OTHER";
  parentCanonicalIssuerId: string | null;
  subsidiaryScope: string;
  mappingKind: IssuerMappingKind;
  evidence: readonly EvidenceReference[];
  reviewedAt: string;
  effectiveFrom: string;
  expiresAt: string | null;
  revokedAt: string | null;
  supersedesAuthorityId: string | null;
  supersedesFingerprint: string | null;
  status: IssuerMappingStatus;
  recordedAt: string;
}>;

export type EventAssetMentionBinding = Readonly<{
  contractVersion: typeof EVENT_ASSET_MENTION_BINDING_VERSION;
  bindingId: string;
  fingerprint: string;
  sourceNamespace: string;
  extractionVersion: typeof SEC_EDGAR_8K_FIXTURE_EXTRACTION_VERSION;
  claimId: string;
  claimFingerprint: string;
  assetCandidateId: string;
  assetCandidateName: string;
  locator: string;
  excerptFingerprint: string;
  chainId: string;
  contractAddress: string;
  representation: "ERC20" | "NATIVE" | "BRIDGED" | "WRAPPED";
  canonicalAssetId: string;
  canonicalRepresentationId: string;
  mappingRevisionId: string;
  mappingRevisionFingerprint: string;
  providerAssetIdentityAssertionId: string;
  providerAssetIdentityAssertionFingerprint: string;
  evidence: readonly EvidenceReference[];
  effectiveFrom: string;
  expiresAt: string | null;
  revokedAt: string | null;
  supersedesBindingId: string | null;
  supersedesFingerprint: string | null;
  status: IssuerMappingStatus;
  recordedAt: string;
}>;

export type IssuerMappingResolution = Readonly<{
  status: "RESOLVED" | "INCOMPLETE" | "CONFLICT" | "EXPIRED" | "REVOKED" | "INVALID";
  authority: EventIssuerMappingAuthority | null;
}>;
export type AssetMappingResolution = Readonly<{
  status: "RESOLVED" | "INCOMPLETE" | "CONFLICT" | "EXPIRED" | "REVOKED" | "INVALID";
  binding: EventAssetMentionBinding | null;
}>;

export type MappedNonAuthoritativeEventClaim = Readonly<{
  contractVersion: typeof EVENT_MAPPED_CLAIM_VERSION;
  classification: typeof EVENT_MAPPED_CLAIM_KIND;
  mappedClaimId: string;
  fingerprint: string;
  claimId: string;
  claimFingerprint: string;
  issuerAuthorityId: string;
  issuerAuthorityFingerprint: string;
  canonicalIssuerId: string;
  canonicalLegalEntityId: string;
  assetBindingId: string;
  assetBindingFingerprint: string;
  mappingRevisionId: string;
  mappingRevisionFingerprint: string;
  canonicalAssetId: string;
  canonicalRepresentationId: string;
  mappingAsOf: string;
  eventTypeCandidate: SecEdgar8kFixtureClaim["eventTypeCandidate"];
  lifecycleStatusCandidate: SecEdgar8kFixtureClaim["lifecycleStatusCandidate"];
}>;

export type IssuerMappingInput = Omit<EventIssuerMappingAuthority, "contractVersion" | "authorityId" | "fingerprint"> & { readonly contractVersion?: string; readonly authorityId?: string; readonly fingerprint?: string };
const issuerTrust = new WeakSet<object>();
const assetBindingTrust = new WeakSet<object>();
const mappedClaimTrust = new WeakSet<object>();
const issuerResolutionTrust = new WeakSet<object>();
const assetResolutionTrust = new WeakSet<object>();
const HEX = /^[0-9a-f]{64}$/;
const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CIK = /^\d{10}$/;
const SOURCE_ID = /^[A-Z][A-Z0-9_:-]{2,95}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const LOWER_ADDRESS = /^0x[0-9a-f]{40}$/;
const OBJECT_INTRINSICS = new Set<PropertyKey>(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "toString", "valueOf", "__proto__"]);
const ARRAY_INTRINSICS = new Set<PropertyKey>(["length", "constructor", "at", "concat", "copyWithin", "fill", "find", "findIndex", "findLast", "findLastIndex", "lastIndexOf", "pop", "push", "reverse", "shift", "unshift", "slice", "sort", "splice", "includes", "indexOf", "join", "keys", "entries", "values", "forEach", "filter", "flat", "flatMap", "map", "every", "some", "reduce", "reduceRight", "toLocaleString", "toString", "toReversed", "toSorted", "toSpliced", "with", Symbol.iterator, Symbol.unscopables]);

function strictObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(Object.prototype).some(key => !OBJECT_INTRINSICS.has(key))) return false;
    const own = Reflect.ownKeys(value);
    return own.length === keys.length && own.every(key => typeof key === "string" && keys.includes(key) && (() => { const d = Object.getOwnPropertyDescriptor(value, key); return !!d && "value" in d && !d.get && !d.set; })());
  } catch { return false; }
}
function strictArray(value: unknown): value is unknown[] {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(Array.prototype).some(key => !ARRAY_INTRINSICS.has(key))) return false;
    const keys = Reflect.ownKeys(value);
    return keys.length === value.length + 1 && keys.every(key => key === "length" || (typeof key === "string" && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length && (() => { const d = Object.getOwnPropertyDescriptor(value, key); return !!d && "value" in d && !d.get && !d.set; })()));
  } catch { return false; }
}
function fail(code: string): never { throw new Error(code); }
function text(value: unknown, code: string, max = 160): string {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > max || /[\u0000-\u001f\u007f]/.test(value) || /https?:\/\/|www\.|\b(?:api[_-]?key|secret|token|password)\b/i.test(value)) return fail(code);
  return value;
}
function time(value: unknown, code: string): string {
  const result = text(value, code, 24);
  if (!TIME.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) return fail(code);
  return result;
}
function hash(value: unknown, code: string): string { const result = text(value, code, 64); if (!HEX.test(result)) return fail(code); return result; }
function usableAt(status: IssuerMappingStatus, effectiveFrom: string, expiresAt: string | null, revokedAt: string | null, asOf: string): boolean {
  return (status === "ACTIVE" || status === "SUPERSEDED" || (status === "REVOKED" && revokedAt !== null && asOf < revokedAt)) && effectiveFrom <= asOf && (expiresAt === null || asOf < expiresAt);
}
function issuerResolution(status: IssuerMappingResolution["status"], authority: EventIssuerMappingAuthority | null = null): IssuerMappingResolution {
  const result = Object.freeze({ status, authority }); if (status === "RESOLVED") issuerResolutionTrust.add(result); return result;
}
function assetResolution(status: AssetMappingResolution["status"], binding: EventAssetMentionBinding | null = null): AssetMappingResolution {
  const result = Object.freeze({ status, binding }); if (status === "RESOLVED") assetResolutionTrust.add(result); return result;
}
function evidence(values: unknown): readonly EvidenceReference[] {
  if (!strictArray(values) || values.length === 0 || values.length > 32) return fail("EVENT_MAPPING_EVIDENCE_INVALID");
  const output = values.map(value => {
    if (!strictObject(value, ["referenceId", "classification", "fingerprint"])) return fail("EVENT_MAPPING_EVIDENCE_INVALID");
    const referenceId = text(value.referenceId, "EVENT_MAPPING_EVIDENCE_INVALID");
    if (!SAFE_ID.test(referenceId) || !["DOCUMENTED", "OBSERVED", "INFERRED", "UNKNOWN"].includes(String(value.classification))) return fail("EVENT_MAPPING_EVIDENCE_INVALID");
    return Object.freeze({ referenceId, classification: value.classification as EvidenceReference["classification"], fingerprint: hash(value.fingerprint, "EVENT_MAPPING_EVIDENCE_INVALID") });
  }).sort((a, b) => a.referenceId.localeCompare(b.referenceId));
  if (new Set(output.map(x => x.referenceId)).size !== output.length) return fail("EVENT_MAPPING_EVIDENCE_DUPLICATE");
  if (!output.some(x => x.classification === "DOCUMENTED" || x.classification === "OBSERVED")) return fail("EVENT_MAPPING_EVIDENCE_UNSUPPORTED");
  return Object.freeze(output);
}
function digest(material: unknown): string { return canonicalSha256(material); }
function freeze<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) freeze(child); Object.freeze(value); } return value; }

const ISSUER_KEYS = ["contractVersion", "authorityId", "fingerprint", "sourceNamespace", "jurisdiction", "regulator", "normalizedCik", "sourceRegistrantId", "registrantLegalName", "canonicalIssuerId", "canonicalLegalEntityId", "entityType", "parentCanonicalIssuerId", "subsidiaryScope", "mappingKind", "evidence", "reviewedAt", "effectiveFrom", "expiresAt", "revokedAt", "supersedesAuthorityId", "supersedesFingerprint", "status", "recordedAt"] as const;
type IssuerMaterial = Omit<EventIssuerMappingAuthority, "contractVersion" | "authorityId" | "fingerprint" | "recordedAt">;
function issuerMaterial(input: IssuerMappingInput | EventIssuerMappingAuthority): IssuerMaterial {
  const normalizedCik = text(input.normalizedCik, "EVENT_ISSUER_CIK_INVALID", 10);
  if (!CIK.test(normalizedCik)) return fail("EVENT_ISSUER_CIK_INVALID");
  const sourceNamespace = text(input.sourceNamespace, "EVENT_ISSUER_SOURCE_INVALID");
  const sourceRegistrantId = text(input.sourceRegistrantId, "EVENT_ISSUER_SOURCE_REGISTRANT_INVALID");
  if (sourceNamespace !== "SEC_EDGAR" && sourceNamespace !== "SEC_EDGAR_8K_FIXTURE") return fail("EVENT_ISSUER_SOURCE_INVALID");
  if (input.jurisdiction !== "US" || input.regulator !== "SEC") return fail("EVENT_ISSUER_REGULATOR_SCOPE_INVALID");
  if ((sourceNamespace === "SEC_EDGAR" && sourceRegistrantId !== normalizedCik) || (sourceNamespace === "SEC_EDGAR_8K_FIXTURE" && !/^SYNTH-CIK-[0-9]{4}$/.test(sourceRegistrantId))) return fail("EVENT_ISSUER_SOURCE_REGISTRANT_INVALID");
  const mappingKind = input.mappingKind;
  if (!["EXACT_REGISTRANT", "EXACT_SUBSIDIARY", "PARENT_RELATIONSHIP", "SUCCESSOR"].includes(String(mappingKind))) return fail("EVENT_ISSUER_MAPPING_KIND_INVALID");
  const parent = input.parentCanonicalIssuerId === null ? null : text(input.parentCanonicalIssuerId, "EVENT_ISSUER_PARENT_INVALID");
  if ((mappingKind === "EXACT_SUBSIDIARY" || mappingKind === "PARENT_RELATIONSHIP") !== (parent !== null)) return fail("EVENT_ISSUER_PARENT_SCOPE_INVALID");
  const expiresAt = input.expiresAt === null ? null : time(input.expiresAt, "EVENT_ISSUER_EXPIRY_INVALID");
  const revokedAt = input.revokedAt === null ? null : time(input.revokedAt, "EVENT_ISSUER_REVOCATION_INVALID");
  const effectiveFrom = time(input.effectiveFrom, "EVENT_ISSUER_EFFECTIVE_FROM_INVALID");
  if (expiresAt !== null && expiresAt <= effectiveFrom) return fail("EVENT_ISSUER_INTERVAL_INVALID");
  const supersedesAuthorityId = input.supersedesAuthorityId === null ? null : text(input.supersedesAuthorityId, "EVENT_ISSUER_SUPERSESSION_INVALID");
  const supersedesFingerprint = input.supersedesFingerprint === null ? null : hash(input.supersedesFingerprint, "EVENT_ISSUER_SUPERSESSION_INVALID");
  if ((supersedesAuthorityId === null) !== (supersedesFingerprint === null)) return fail("EVENT_ISSUER_SUPERSESSION_INVALID");
  const status = input.status;
  if (!["ACTIVE", "SUPERSEDED", "REVOKED", "INVALID"].includes(String(status))) return fail("EVENT_ISSUER_STATUS_INVALID");
  if ((status === "REVOKED") !== (revokedAt !== null) || (revokedAt !== null && revokedAt < effectiveFrom)) return fail("EVENT_ISSUER_REVOCATION_INVALID");
  if (status === "SUPERSEDED" && expiresAt === null) return fail("EVENT_ISSUER_SUPERSESSION_INTERVAL_REQUIRED");
  if (mappingKind === "SUCCESSOR" && supersedesAuthorityId === null) return fail("EVENT_ISSUER_SUCCESSOR_LINEAGE_REQUIRED");
  return Object.freeze({
    sourceNamespace, jurisdiction: text(input.jurisdiction, "EVENT_ISSUER_JURISDICTION_INVALID"), regulator: text(input.regulator, "EVENT_ISSUER_REGULATOR_INVALID"), normalizedCik, sourceRegistrantId, registrantLegalName: text(input.registrantLegalName, "EVENT_ISSUER_NAME_INVALID"), canonicalIssuerId: text(input.canonicalIssuerId, "EVENT_ISSUER_CANONICAL_ID_INVALID"), canonicalLegalEntityId: text(input.canonicalLegalEntityId, "EVENT_ISSUER_LEGAL_ENTITY_INVALID"), entityType: (() => { const x = input.entityType; if (!["CORPORATION", "LLC", "PARTNERSHIP", "OTHER"].includes(String(x))) return fail("EVENT_ISSUER_ENTITY_TYPE_INVALID"); return x as EventIssuerMappingAuthority["entityType"]; })(), parentCanonicalIssuerId: parent, subsidiaryScope: text(input.subsidiaryScope, "EVENT_ISSUER_SUBSIDIARY_SCOPE_INVALID"), mappingKind: mappingKind as IssuerMappingKind, evidence: evidence(input.evidence), reviewedAt: time(input.reviewedAt, "EVENT_ISSUER_REVIEWED_AT_INVALID"), effectiveFrom, expiresAt, revokedAt, supersedesAuthorityId, supersedesFingerprint, status: status as IssuerMappingStatus,
  });
}
function issuerIdFor(material: IssuerMaterial): string { return `event-issuer-authority:${digest({ contractVersion: EVENT_ISSUER_MAPPING_VERSION, ...material })}`; }
function issuerFingerprint(material: IssuerMaterial, authorityId: string): string { return digest({ contractVersion: EVENT_ISSUER_MAPPING_VERSION, authorityId, ...material }); }

export function createEventIssuerMappingAuthority(input: IssuerMappingInput): EventIssuerMappingAuthority {
  try {
    const factoryKeys = [ISSUER_KEYS.filter(key => key !== "authorityId" && key !== "fingerprint"), ISSUER_KEYS.filter(key => key !== "contractVersion" && key !== "authorityId" && key !== "fingerprint"), ISSUER_KEYS];
    if (!factoryKeys.some(keys => strictObject(input, keys))) return fail("EVENT_ISSUER_MAPPING_INVALID");
    if (input.contractVersion !== undefined && input.contractVersion !== EVENT_ISSUER_MAPPING_VERSION) return fail("EVENT_ISSUER_CONTRACT_VERSION_INVALID");
    const material = issuerMaterial(input);
    const authorityId = issuerIdFor(material);
    const fingerprint = issuerFingerprint(material, authorityId);
    if (input.authorityId !== undefined && input.authorityId !== authorityId) return fail("EVENT_ISSUER_AUTHORITY_ID_MISMATCH");
    if (input.fingerprint !== undefined && input.fingerprint !== fingerprint) return fail("EVENT_ISSUER_AUTHORITY_FINGERPRINT_MISMATCH");
    const record = freeze({ contractVersion: EVENT_ISSUER_MAPPING_VERSION, authorityId, fingerprint, ...material, recordedAt: time(input.recordedAt, "EVENT_ISSUER_RECORDED_AT_INVALID") });
    issuerTrust.add(record); return record;
  } catch (error) { throw new Error(error instanceof Error && /^EVENT_[A-Z0-9_]+$/.test(error.message) ? error.message : "EVENT_ISSUER_MAPPING_INVALID"); }
}

export function parseEventIssuerMappingAuthority(input: unknown): EventIssuerMappingAuthority {
  try {
    if (!strictObject(input, ISSUER_KEYS)) return fail("EVENT_ISSUER_MAPPING_INVALID");
    const record = createEventIssuerMappingAuthority(input as unknown as IssuerMappingInput);
    issuerTrust.delete(record);
    return record;
  } catch { return fail("EVENT_ISSUER_MAPPING_INVALID"); }
}
export function isAuthenticEventIssuerMappingAuthority(value: unknown): value is EventIssuerMappingAuthority { return !!value && typeof value === "object" && issuerTrust.has(value); }

function issuerLineageValid(records: readonly EventIssuerMappingAuthority[]): boolean {
  const byId = new Map<string, EventIssuerMappingAuthority>();
  for (const item of records) { if (!isAuthenticEventIssuerMappingAuthority(item) || byId.has(item.authorityId)) return false; byId.set(item.authorityId, item); }
  for (const item of records) if (item.supersedesAuthorityId !== null) {
    const prior = byId.get(item.supersedesAuthorityId);
    if (!prior || prior.fingerprint !== item.supersedesFingerprint || prior.status !== "SUPERSEDED" || prior.expiresAt !== item.effectiveFrom || prior.sourceNamespace !== item.sourceNamespace || prior.jurisdiction !== item.jurisdiction || prior.regulator !== item.regulator || prior.normalizedCik !== item.normalizedCik || prior.sourceRegistrantId !== item.sourceRegistrantId) return false;
    const seen = new Set([item.authorityId]); let current: EventIssuerMappingAuthority | undefined = prior;
    while (current) { if (seen.has(current.authorityId)) return false; seen.add(current.authorityId); current = current.supersedesAuthorityId === null ? undefined : byId.get(current.supersedesAuthorityId); }
  }
  return true;
}

export function resolveEventIssuerMapping(input: { readonly registry: readonly EventIssuerMappingAuthority[]; readonly sourceNamespace: string; readonly jurisdiction: string; readonly regulator: string; readonly cik: string; readonly sourceRegistrantId: string; readonly asOf: string }): IssuerMappingResolution {
  try {
    if (!strictObject(input, ["registry", "sourceNamespace", "jurisdiction", "regulator", "cik", "sourceRegistrantId", "asOf"]) || !strictArray(input.registry) || !TIME.test(input.asOf) || new Date(input.asOf).toISOString() !== input.asOf || !CIK.test(input.cik) || !SOURCE_ID.test(input.sourceNamespace) || !/^[A-Z]{2,3}$/.test(input.jurisdiction) || !SOURCE_ID.test(input.regulator) || !SAFE_ID.test(input.sourceRegistrantId)) return issuerResolution("INVALID");
    const matches = input.registry.filter(record => record.sourceNamespace === input.sourceNamespace && record.jurisdiction === input.jurisdiction && record.regulator === input.regulator && record.normalizedCik === input.cik && record.sourceRegistrantId === input.sourceRegistrantId);
    if (matches.some(record => !isAuthenticEventIssuerMappingAuthority(record)) || !issuerLineageValid(matches)) return issuerResolution("INVALID");
    const active = matches.filter(record => (record.status === "ACTIVE" || record.status === "SUPERSEDED" || (record.status === "REVOKED" && record.revokedAt !== null && input.asOf < record.revokedAt)) && record.effectiveFrom <= input.asOf && (record.expiresAt === null || input.asOf < record.expiresAt));
    if (active.length > 1) return issuerResolution("CONFLICT");
    if (active.length === 1) return issuerResolution("RESOLVED", active[0]!);
    if (matches.some(record => record.status === "REVOKED" && record.revokedAt !== null && record.revokedAt <= input.asOf)) return issuerResolution("REVOKED");
    if (matches.some(record => record.status === "INVALID")) return issuerResolution("INVALID");
    if (matches.some(record => (record.status === "ACTIVE" || record.status === "SUPERSEDED") && record.effectiveFrom <= input.asOf && record.expiresAt !== null && record.expiresAt <= input.asOf)) return issuerResolution("EXPIRED");
    return issuerResolution("INCOMPLETE");
  } catch { return issuerResolution("INVALID"); }
}

export type EventAssetMentionBindingInput = Readonly<{
  readonly sourceNamespace: string;
  readonly claim: SecEdgar8kFixtureClaim;
  readonly chainId: string;
  readonly contractAddress: string;
  readonly representation: EventAssetMentionBinding["representation"];
  readonly canonicalRepresentationId: string;
  readonly mappingRevision: AssetMappingRevision;
  readonly providerIdentity: ProviderAssetIdentityAssertion;
  readonly evidence: readonly EvidenceReference[];
  readonly effectiveFrom: string;
  readonly expiresAt: string | null;
  readonly revokedAt?: string | null;
  readonly supersedesBindingId?: string | null;
  readonly supersedesFingerprint?: string | null;
  readonly status: IssuerMappingStatus;
  readonly recordedAt: string;
}>;

export function createEventAssetMentionBinding(input: EventAssetMentionBindingInput): EventAssetMentionBinding | null {
  try {
    const required = ["sourceNamespace", "claim", "chainId", "contractAddress", "representation", "canonicalRepresentationId", "mappingRevision", "providerIdentity", "evidence", "effectiveFrom", "expiresAt", "status", "recordedAt"] as const;
    const complete = [...required, "revokedAt", "supersedesBindingId", "supersedesFingerprint"];
    if (!strictObject(input, required) && !strictObject(input, complete)) return null;
    if (!isAuthenticSecEdgar8kFixtureClaim(input.claim)) return null;
    assertAssetMappingRevision(input.mappingRevision); assertProviderAssetIdentityAssertion(input.providerIdentity);
    const claim = input.claim; const mapping = input.mappingRevision; const identity = input.providerIdentity;
    const chainId = text(input.chainId, "EVENT_ASSET_CHAIN_INVALID"); const contractAddress = text(input.contractAddress, "EVENT_ASSET_ADDRESS_INVALID");
    if (!/^eip155:[1-9][0-9]*$/.test(chainId) || !LOWER_ADDRESS.test(contractAddress) || identity.identityNamespace !== chainId || identity.identityValue !== contractAddress || identity.providerAssetId !== mapping.providerAssetId || identity.providerId !== mapping.providerId || identity.datasetId !== mapping.datasetId || identity.datasetVersion !== mapping.datasetVersion || identity.providerSourceNamespace !== mapping.providerAssetNamespace || identity.providerAssetIdentityAssertionId !== mapping.providerAssetIdentityAssertionId || mapping.canonicalIdentifier !== input.canonicalRepresentationId || mapping.validFrom > claim.announcementAt || (mapping.validTo !== undefined && claim.announcementAt >= mapping.validTo)) return null;
    if (!["ERC20", "BRIDGED", "WRAPPED"].includes(input.representation)) return null;
    const effectiveFrom = time(input.effectiveFrom, "EVENT_ASSET_EFFECTIVE_FROM_INVALID"); const expiresAt = input.expiresAt === null ? null : time(input.expiresAt, "EVENT_ASSET_EXPIRY_INVALID");
    if (expiresAt !== null && expiresAt <= effectiveFrom) return null;
    if (!["ACTIVE", "SUPERSEDED", "REVOKED", "INVALID"].includes(input.status)) return null;
    const revokedAt = input.revokedAt == null ? null : time(input.revokedAt, "EVENT_ASSET_REVOCATION_INVALID");
    if ((input.status === "REVOKED") !== (revokedAt !== null) || (revokedAt !== null && revokedAt < effectiveFrom) || (input.status === "SUPERSEDED" && expiresAt === null)) return null;
    const supersedesBindingId = input.supersedesBindingId == null ? null : text(input.supersedesBindingId, "EVENT_ASSET_SUPERSESSION_INVALID");
    const supersedesFingerprint = input.supersedesFingerprint == null ? null : hash(input.supersedesFingerprint, "EVENT_ASSET_SUPERSESSION_INVALID");
    if ((supersedesBindingId === null) !== (supersedesFingerprint === null)) return null;
    const body = Object.freeze({ sourceNamespace: text(input.sourceNamespace, "EVENT_ASSET_SOURCE_INVALID"), extractionVersion: claim.extractionVersion, claimId: claim.claimId, claimFingerprint: claim.fingerprint, assetCandidateId: text(claim.assetIdentityCandidate.syntheticAssetId, "EVENT_ASSET_CANDIDATE_INVALID"), assetCandidateName: text(claim.assetIdentityCandidate.displayName, "EVENT_ASSET_CANDIDATE_INVALID"), locator: text(claim.locator, "EVENT_ASSET_LOCATOR_INVALID"), excerptFingerprint: hash(claim.excerptFingerprint, "EVENT_ASSET_EXCERPT_FINGERPRINT_INVALID"), chainId, contractAddress, representation: input.representation, canonicalAssetId: mapping.canonicalAssetId, canonicalRepresentationId: text(input.canonicalRepresentationId, "EVENT_ASSET_REPRESENTATION_ID_INVALID"), mappingRevisionId: mapping.mappingRevisionId, mappingRevisionFingerprint: hash(mapping.fingerprint, "EVENT_ASSET_MAPPING_REVISION_INVALID"), providerAssetIdentityAssertionId: identity.providerAssetIdentityAssertionId, providerAssetIdentityAssertionFingerprint: identity.fingerprint, evidence: evidence(input.evidence), effectiveFrom, expiresAt, revokedAt, supersedesBindingId, supersedesFingerprint, status: input.status });
    const bindingId = `event-asset-mention:${digest({ contractVersion: EVENT_ASSET_MENTION_BINDING_VERSION, ...body })}`; const fingerprint = digest({ contractVersion: EVENT_ASSET_MENTION_BINDING_VERSION, bindingId, ...body });
    const result = freeze({ contractVersion: EVENT_ASSET_MENTION_BINDING_VERSION, bindingId, fingerprint, ...body, recordedAt: time(input.recordedAt, "EVENT_ASSET_RECORDED_AT_INVALID") });
    assetBindingTrust.add(result); return result;
  } catch { return null; }
}
export function isAuthenticEventAssetMentionBinding(value: unknown): value is EventAssetMentionBinding { return !!value && typeof value === "object" && assetBindingTrust.has(value); }

function assetLineageValid(records: readonly EventAssetMentionBinding[]): boolean {
  const byId = new Map<string, EventAssetMentionBinding>();
  for (const item of records) { if (!isAuthenticEventAssetMentionBinding(item) || byId.has(item.bindingId)) return false; byId.set(item.bindingId, item); }
  for (const item of records) if (item.supersedesBindingId !== null) {
    const prior = byId.get(item.supersedesBindingId);
    if (!prior || prior.fingerprint !== item.supersedesFingerprint || prior.status !== "SUPERSEDED" || prior.expiresAt !== item.effectiveFrom || prior.claimId !== item.claimId || prior.claimFingerprint !== item.claimFingerprint || prior.sourceNamespace !== item.sourceNamespace || prior.assetCandidateId !== item.assetCandidateId) return false;
    const seen = new Set([item.bindingId]); let current: EventAssetMentionBinding | undefined = prior;
    while (current) { if (seen.has(current.bindingId)) return false; seen.add(current.bindingId); current = current.supersedesBindingId === null ? undefined : byId.get(current.supersedesBindingId); }
  }
  return true;
}

export function resolveEventAssetMentionBinding(input: { readonly registry: readonly EventAssetMentionBinding[]; readonly claim: SecEdgar8kFixtureClaim; readonly asOf: string }): AssetMappingResolution {
  try {
    if (!strictObject(input, ["registry", "claim", "asOf"]) || !isAuthenticSecEdgar8kFixtureClaim(input.claim) || !strictArray(input.registry) || !TIME.test(input.asOf) || new Date(input.asOf).toISOString() !== input.asOf) return assetResolution("INVALID");
    const claim = input.claim; const matches = input.registry.filter(item => item.claimId === claim.claimId && item.claimFingerprint === claim.fingerprint && item.assetCandidateId === claim.assetIdentityCandidate.syntheticAssetId && item.locator === claim.locator && item.excerptFingerprint === claim.excerptFingerprint && item.extractionVersion === claim.extractionVersion);
    if (matches.some(item => !isAuthenticEventAssetMentionBinding(item)) || !assetLineageValid(matches)) return assetResolution("INVALID");
    const active = matches.filter(item => (item.status === "ACTIVE" || item.status === "SUPERSEDED" || (item.status === "REVOKED" && item.revokedAt !== null && input.asOf < item.revokedAt)) && item.effectiveFrom <= input.asOf && (item.expiresAt === null || input.asOf < item.expiresAt));
    if (active.length > 1) return assetResolution("CONFLICT");
    if (active.length === 1) return assetResolution("RESOLVED", active[0]!);
    if (matches.some(item => item.status === "REVOKED" && item.revokedAt !== null && item.revokedAt <= input.asOf)) return assetResolution("REVOKED");
    if (matches.some(item => item.status === "INVALID")) return assetResolution("INVALID");
    if (matches.some(item => (item.status === "ACTIVE" || item.status === "SUPERSEDED") && item.effectiveFrom <= input.asOf && item.expiresAt !== null && item.expiresAt <= input.asOf)) return assetResolution("EXPIRED");
    return assetResolution("INCOMPLETE");
  } catch { return assetResolution("INVALID"); }
}

export function assembleMappedNonAuthoritativeEventClaim(input: { readonly sourceResult: SecEdgar8kFixtureResult; readonly claim: SecEdgar8kFixtureClaim; readonly issuer: IssuerMappingResolution; readonly asset: AssetMappingResolution; readonly mappingAsOf: string }): MappedNonAuthoritativeEventClaim | null {
  try {
    if (!strictObject(input, ["sourceResult", "claim", "issuer", "asset", "mappingAsOf"]) || !isAuthenticSecEdgar8kFixtureResult(input.sourceResult)) return null;
    const { claim, issuer, asset } = input;
    const sourceResult = input.sourceResult;
    if (!sourceResult.claims.includes(claim) || !sourceResult.claimSet.claimIds.includes(claim.claimId) || sourceResult.correctionLineage.some(edge => edge.originalClaimId === claim.claimId || edge.amendedClaimId === claim.claimId)) return null;
    if (!isAuthenticSecEdgar8kFixtureClaim(claim) || claim.form === "8-K/A" || claim.correctionOfClaimId !== null || claim.lifecycleStatusCandidate === "CONDITIONAL" || issuer.status !== "RESOLVED" || asset.status !== "RESOLVED" || !issuerResolutionTrust.has(issuer as object) || !assetResolutionTrust.has(asset as object) || !issuer.authority || !asset.binding || !isAuthenticEventIssuerMappingAuthority(issuer.authority) || !isAuthenticEventAssetMentionBinding(asset.binding)) return null;
    const asOf = time(input.mappingAsOf, "EVENT_MAPPED_CLAIM_AS_OF_INVALID"); const i = issuer.authority; const a = asset.binding;
    if (asOf !== claim.announcementAt || (i.mappingKind !== "EXACT_REGISTRANT" && i.mappingKind !== "EXACT_SUBSIDIARY") || i.sourceRegistrantId !== claim.issuerIdentityCandidate.syntheticCik || i.registrantLegalName !== claim.issuerIdentityCandidate.displayName || !usableAt(i.status, i.effectiveFrom, i.expiresAt, i.revokedAt, asOf)) return null;
    if (a.claimId !== claim.claimId || a.claimFingerprint !== claim.fingerprint || a.sourceNamespace !== i.sourceNamespace || a.extractionVersion !== claim.extractionVersion || !usableAt(a.status, a.effectiveFrom, a.expiresAt, a.revokedAt, asOf)) return null;
    if (claim.lifecycleStatusCandidate === "COMPLETED" && (claim.itemCode !== "2.01" || claim.completionDate === null)) return null;
    const body = { contractVersion: EVENT_MAPPED_CLAIM_VERSION, classification: EVENT_MAPPED_CLAIM_KIND, claimId: claim.claimId, claimFingerprint: claim.fingerprint, issuerAuthorityId: i.authorityId, issuerAuthorityFingerprint: i.fingerprint, canonicalIssuerId: i.canonicalIssuerId, canonicalLegalEntityId: i.canonicalLegalEntityId, assetBindingId: a.bindingId, assetBindingFingerprint: a.fingerprint, mappingRevisionId: a.mappingRevisionId, mappingRevisionFingerprint: a.mappingRevisionFingerprint, canonicalAssetId: a.canonicalAssetId, canonicalRepresentationId: a.canonicalRepresentationId, mappingAsOf: asOf, eventTypeCandidate: claim.eventTypeCandidate, lifecycleStatusCandidate: claim.lifecycleStatusCandidate };
    const fingerprint = digest(body); const mappedClaimId = `mapped-event-claim:${fingerprint}`;
    const result = freeze({ ...body, fingerprint, mappedClaimId }); mappedClaimTrust.add(result); return result;
  } catch { return null; }
}
export function isAuthenticMappedNonAuthoritativeEventClaim(value: unknown): value is MappedNonAuthoritativeEventClaim { return !!value && typeof value === "object" && mappedClaimTrust.has(value); }
export function rejectMappedClaimAsEventAuthority(value: unknown): null { void value; return null; }

export const EVENT_INTELLIGENCE_MAPPING_PRODUCTION_CONFIG = freeze({ contractVersion: EVENT_MAPPING_PRODUCTION_CONFIG_VERSION, issuerMappings: [] as readonly EventIssuerMappingAuthority[], eventAssetMentionBindings: [] as readonly EventAssetMentionBinding[], selectedMappingAuthorities: [] as readonly string[], issuerMappingReadiness: "BLOCKED" as const, assetMappingReadiness: "BLOCKED" as const, eventAssembly: "BLOCKED" as const, persistence: "BLOCKED" as const, eventAuthority: "BLOCKED" as const, signalGeneration: "BLOCKED" as const });
