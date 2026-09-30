import { describe, expect, it } from "vitest";
import { createAssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import { createProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import {
  assembleMappedNonAuthoritativeEventClaim, createEventAssetMentionBinding,
  createEventIssuerMappingAuthority, EVENT_INTELLIGENCE_MAPPING_PRODUCTION_CONFIG,
  isAuthenticEventAssetMentionBinding, isAuthenticEventIssuerMappingAuthority,
  isAuthenticMappedNonAuthoritativeEventClaim, parseEventIssuerMappingAuthority,
  rejectMappedClaimAsEventAuthority, resolveEventAssetMentionBinding,
  resolveEventIssuerMapping, type EventIssuerMappingAuthority,
} from "@/domain/intelligence/event-intelligence-mapping-authority";
import { runSecEdgar8kFixtureClaimPipeline } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { cloneSyntheticFixtures } from "../fixtures/sec-edgar-8k-fixture-claim-pipeline";

const HASH = "a".repeat(64);
const AS_OF = "2026-04-10T14:02:00.000Z";
const claimsResult = runSecEdgar8kFixtureClaimPipeline(cloneSyntheticFixtures());
if (claimsResult.status !== "VALID") throw new Error("SYNTHETIC_MAPPING_TEST_FIXTURE_INVALID");
const claim = claimsResult.claims.find(value => value.accession === "SYNTH-ACC-AGREE-0001")!;
const completedClaim = claimsResult.claims.find(value => value.accession === "SYNTH-ACC-COMPLETE-0002")!;
const COMPLETED_AS_OF = completedClaim.announcementAt;
const SYNTHETIC_NORMALIZED_CIK: Readonly<Record<string, string>> = Object.freeze({ "SYNTH-CIK-0001": "0000000001", "SYNTH-CIK-0002": "0000000002", "SYNTH-CIK-0003": "0000000003" });

function issuer(overrides: Partial<EventIssuerMappingAuthority> = {}) {
  return createEventIssuerMappingAuthority({
    sourceNamespace: "SEC_EDGAR_8K_FIXTURE", jurisdiction: "US", regulator: "SEC",
    normalizedCik: "0000000001", sourceRegistrantId: "SYNTH-CIK-0001",
    registrantLegalName: "Synthetic Issuer QUILL-0001", canonicalIssuerId: "issuer:synthetic:quill-0001",
    canonicalLegalEntityId: "legal-entity:synthetic:quill-0001", entityType: "CORPORATION",
    parentCanonicalIssuerId: null, subsidiaryScope: "EXACT_REGISTRANT_ONLY", mappingKind: "EXACT_REGISTRANT",
    evidence: [{ referenceId: "synthetic-issuer-review-0001", classification: "OBSERVED", fingerprint: HASH }],
    reviewedAt: "2026-04-10T14:00:00.000Z", effectiveFrom: "2026-04-01T00:00:00.000Z", expiresAt: null, revokedAt: null,
    supersedesAuthorityId: null, supersedesFingerprint: null, status: "ACTIVE", recordedAt: "2026-04-10T14:01:00.000Z",
    ...overrides,
  });
}

function issuerForClaim(target: typeof claim, overrides: Partial<EventIssuerMappingAuthority> = {}) {
  return issuer({ normalizedCik: SYNTHETIC_NORMALIZED_CIK[target.issuerIdentityCandidate.syntheticCik]!, sourceRegistrantId: target.issuerIdentityCandidate.syntheticCik, registrantLegalName: target.issuerIdentityCandidate.displayName, ...overrides });
}

function assetBinding(input: { address?: string; declaredAddress?: string; declaredChainId?: string; providerAssetId?: string; candidateClaim?: typeof claim; recordedAt?: string; reviewedAt?: string; representation?: "ERC20" | "BRIDGED" | "WRAPPED"; status?: "ACTIVE" | "SUPERSEDED" | "REVOKED" | "INVALID"; effectiveFrom?: string; expiresAt?: string | null; supersedesBindingId?: string | null; supersedesFingerprint?: string | null } = {}) {
  const targetClaim = input.candidateClaim ?? claim;
  const address = input.address ?? "0x1111111111111111111111111111111111111111";
  const identity = createProviderAssetIdentityAssertion({
    providerId: "synthetic-event-review", datasetId: "event-mention", datasetVersion: "v1",
    providerSourceNamespace: "synthetic:sec-fixture", providerAssetId: input.providerAssetId ?? targetClaim.assetIdentityCandidate.syntheticAssetId,
    identityType: "EVM_CONTRACT_ADDRESS", identityNamespace: "eip155:1", identityValue: address,
    sourceArtifactId: "synthetic-asset-artifact-0001", sourceEnvelopeId: "synthetic-asset-envelope-0001",
    parserVersion: "synthetic-review/v1", envelopeSchemaVersion: "synthetic-envelope/v1", sourcePayloadFingerprint: HASH,
    recordedAt: input.recordedAt ?? "2026-04-10T14:01:00.000Z",
  });
  const mapping = createAssetMappingRevision({
    mappingRevisionVersion: "mapping/v1", providerId: identity.providerId, datasetId: identity.datasetId,
    datasetVersion: identity.datasetVersion, sourceLineageId: "synthetic-lineage-0001",
    providerAssetIdentityAssertionId: identity.providerAssetIdentityAssertionId,
    providerAssetNamespace: identity.providerSourceNamespace, providerAssetId: identity.providerAssetId,
    canonicalAssetId: "asset:synthetic:gossamer-0001", canonicalIdentifier: "representation:eip155:1:erc20:gossamer-0001",
    assetClass: "CRYPTO", validFrom: "2026-04-01T00:00:00.000Z", observedAt: "2026-04-10T14:00:00.000Z",
    availableAt: "2026-04-10T14:00:30.000Z", sourceRecordIds: ["synthetic-asset-source-0001"], payloadFingerprint: HASH,
    recordedAt: input.recordedAt ?? "2026-04-10T14:01:00.000Z",
  });
  return createEventAssetMentionBinding({
    sourceNamespace: "SEC_EDGAR_8K_FIXTURE", claim: targetClaim, chainId: input.declaredChainId ?? "eip155:1", contractAddress: input.declaredAddress ?? address,
    representation: input.representation ?? "ERC20", canonicalRepresentationId: "representation:eip155:1:erc20:gossamer-0001", mappingRevision: mapping,
    providerIdentity: identity, evidence: [{ referenceId: "synthetic-asset-review-0001", classification: "OBSERVED", fingerprint: HASH }],
    effectiveFrom: input.effectiveFrom ?? "2026-04-01T00:00:00.000Z", reviewedAt: input.reviewedAt ?? "2026-04-10T14:00:00.000Z", expiresAt: input.expiresAt ?? null, revokedAt: input.status === "REVOKED" ? "2026-04-11T00:00:00.000Z" : null,
    supersedesBindingId: input.supersedesBindingId ?? null, supersedesFingerprint: input.supersedesFingerprint ?? null, status: input.status ?? "ACTIVE",
    recordedAt: input.recordedAt ?? "2026-04-10T14:01:00.000Z",
  });
}

function issuerLookup(overrides: Record<string, string> = {}) {
  return { registry: [issuer()], sourceNamespace: "SEC_EDGAR_8K_FIXTURE", jurisdiction: "US", regulator: "SEC", cik: "0000000001", sourceRegistrantId: "SYNTH-CIK-0001", asOf: AS_OF, ...overrides };
}
function issuerLookupForClaim(target: typeof claim, registry: readonly EventIssuerMappingAuthority[]) {
  return { registry, sourceNamespace: "SEC_EDGAR_8K_FIXTURE", jurisdiction: "US", regulator: "SEC", cik: SYNTHETIC_NORMALIZED_CIK[target.issuerIdentityCandidate.syntheticCik]!, sourceRegistrantId: target.issuerIdentityCandidate.syntheticCik, asOf: target.announcementAt };
}

describe("event intelligence issuer and asset mapping authority", () => {
  it("resolves exact issuer and mention to the existing canonical asset revision, then assembles a non-authoritative claim", () => {
    const issuerAuthority = issuerForClaim(completedClaim); const binding = assetBinding({ candidateClaim: completedClaim });
    expect(isAuthenticEventIssuerMappingAuthority(issuerAuthority)).toBe(true);
    expect(isAuthenticEventAssetMentionBinding(binding)).toBe(true);
    const issuerResolution = resolveEventIssuerMapping(issuerLookupForClaim(completedClaim, [issuerAuthority]));
    const assetResolution = resolveEventAssetMentionBinding({ registry: [binding!], claim: completedClaim, asOf: COMPLETED_AS_OF });
    expect(issuerResolution.status).toBe("RESOLVED"); expect(assetResolution.status).toBe("RESOLVED");
    const mapped = assembleMappedNonAuthoritativeEventClaim({ sourceResult: claimsResult, claim: completedClaim, issuer: issuerResolution, asset: assetResolution, mappingAsOf: COMPLETED_AS_OF });
    expect(mapped?.classification).toBe("MAPPED_NON_AUTHORITATIVE_EVENT_CLAIM");
    expect(mapped?.canonicalAssetId).toBe("asset:synthetic:gossamer-0001");
    expect(mapped?.claimFingerprint).toBe(completedClaim.fingerprint);
    expect(Object.isFrozen(mapped)).toBe(true); expect(isAuthenticMappedNonAuthoritativeEventClaim(mapped)).toBe(true);
    expect(rejectMappedClaimAsEventAuthority(mapped)).toBeNull();
    expect(assembleMappedNonAuthoritativeEventClaim({ sourceResult: claimsResult, claim: completedClaim, issuer: { status: "RESOLVED", authority: issuerAuthority, asOf: COMPLETED_AS_OF }, asset: { status: "RESOLVED", binding, asOf: COMPLETED_AS_OF }, mappingAsOf: COMPLETED_AS_OF })).toBeNull();
  });

  it("excludes recordedAt from authority and binding identity and keeps parser output untrusted", () => {
    const first = issuer({ recordedAt: "2026-04-10T14:01:00.000Z" });
    const replay = issuer({ recordedAt: "2026-04-11T14:01:00.000Z" });
    expect(replay.authorityId).toBe(first.authorityId); expect(replay.fingerprint).toBe(first.fingerprint);
    const parsed = parseEventIssuerMappingAuthority(JSON.parse(JSON.stringify(first)));
    expect(parsed.fingerprint).toBe(first.fingerprint); expect(isAuthenticEventIssuerMappingAuthority(parsed)).toBe(false);
    const originalBinding = assetBinding(); const laterBinding = assetBinding({ recordedAt: "2026-04-11T14:01:00.000Z" });
    expect(laterBinding?.bindingId).toBe(originalBinding?.bindingId); expect(laterBinding?.fingerprint).toBe(originalBinding?.fingerprint);
  });

  it("rejects unsafe mapping shapes, copied witnesses, and fabricated claims", () => {
    const authority = issuer(); const binding = assetBinding()!;
    expect(() => createEventIssuerMappingAuthority({ ...authority, surprise: true } as never)).toThrow("EVENT_ISSUER_MAPPING_INVALID");
    const inherited = Object.create({ normalizedCik: "0000000001" }) as Record<string, unknown>;
    expect(() => createEventIssuerMappingAuthority(inherited as never)).toThrow("EVENT_ISSUER_MAPPING_INVALID");
    const accessor = { ...authority } as Record<string, unknown>;
    Object.defineProperty(accessor, "sourceRegistrantId", { get() { throw new Error("SYNTHETIC_SENTINEL"); }, enumerable: true });
    expect(() => createEventIssuerMappingAuthority(accessor as never)).toThrow("EVENT_ISSUER_MAPPING_INVALID");
    const symbolField = { ...authority, [Symbol("extra")]: "x" } as never;
    expect(() => createEventIssuerMappingAuthority(symbolField)).toThrow("EVENT_ISSUER_MAPPING_INVALID");
    expect(isAuthenticEventIssuerMappingAuthority({ ...authority })).toBe(false);
    expect(isAuthenticEventIssuerMappingAuthority(structuredClone(authority))).toBe(false);
    expect(isAuthenticEventAssetMentionBinding({ ...binding })).toBe(false);
    expect(isAuthenticEventAssetMentionBinding(JSON.parse(JSON.stringify(binding)))).toBe(false);
    const clonedClaim = structuredClone(claim);
    expect(resolveEventAssetMentionBinding({ registry: [binding], claim: clonedClaim, asOf: AS_OF }).status).toBe("INVALID");
    expect(createEventAssetMentionBinding({ sourceNamespace: "SEC_EDGAR_8K_FIXTURE", claim: clonedClaim, chainId: "eip155:1", contractAddress: "0x1111111111111111111111111111111111111111", representation: "ERC20", canonicalRepresentationId: "x", mappingRevision: {} as never, providerIdentity: {} as never, evidence: [], effectiveFrom: AS_OF, reviewedAt: AS_OF, expiresAt: null, status: "ACTIVE", recordedAt: AS_OF })).toBeNull();
    let proxyReads = 0;
    const hostileMapping = new Proxy({}, { get() { proxyReads += 1; throw new Error("SYNTHETIC_SENTINEL"); } });
    expect(createEventAssetMentionBinding({ sourceNamespace: "SEC_EDGAR_8K_FIXTURE", claim, chainId: "eip155:1", contractAddress: "0x1111111111111111111111111111111111111111", representation: "ERC20", canonicalRepresentationId: "representation:eip155:1:erc20:gossamer-0001", mappingRevision: hostileMapping as never, providerIdentity: {} as never, evidence: [], effectiveFrom: AS_OF, reviewedAt: AS_OF, expiresAt: null, status: "ACTIVE", recordedAt: AS_OF })).toBeNull();
    expect(proxyReads).toBe(0);
    expect(assetBinding({ declaredChainId: "eip155:2" })).toBeNull();
    expect(assetBinding({ declaredAddress: "0x2222222222222222222222222222222222222222" })).toBeNull();
    expect(assetBinding({ representation: "WRAPPED" })).toBeNull();
    const fabricated = { ...claim } as typeof claim;
    expect(assembleMappedNonAuthoritativeEventClaim({ sourceResult: claimsResult, claim: fabricated, issuer: { status: "RESOLVED", authority, asOf: AS_OF }, asset: { status: "RESOLVED", binding, asOf: AS_OF }, mappingAsOf: AS_OF })).toBeNull();
  });

  it("fails closed on CIK, scope, legal entity, conflicts, expiry and revocation", () => {
    const authority = issuer();
    expect(resolveEventIssuerMapping({ ...issuerLookup({ cik: "1" }), registry: [authority] }).status).toBe("INVALID");
    expect(resolveEventIssuerMapping({ ...issuerLookup({ sourceRegistrantId: "SYNTH-CIK-0002" }), registry: [authority] }).status).toBe("INCOMPLETE");
    expect(resolveEventIssuerMapping({ ...issuerLookup({ jurisdiction: "CA" }), registry: [authority] }).status).toBe("INCOMPLETE");
    expect(resolveEventIssuerMapping({ ...issuerLookup({ sourceRegistrantId: "QUILL" }), registry: [authority] }).status).toBe("INCOMPLETE");
    expect(resolveEventIssuerMapping({ ...issuerLookup(), registry: [authority, issuer({ canonicalLegalEntityId: "legal-entity:other" })] }).status).toBe("CONFLICT");
    const expired = issuer({ expiresAt: "2026-04-10T14:00:00.000Z" });
    expect(resolveEventIssuerMapping({ ...issuerLookup(), registry: [expired] }).status).toBe("EXPIRED");
    const revoked = issuer({ status: "REVOKED", revokedAt: "2026-04-10T14:02:00.000Z" });
    expect(resolveEventIssuerMapping({ ...issuerLookup(), registry: [revoked] }).status).toBe("REVOKED");
    expect(resolveEventIssuerMapping({ ...issuerLookup({ asOf: "2026-04-10T14:01:00.000Z" }), registry: [revoked] }).status).toBe("RESOLVED");
    expect(() => createEventIssuerMappingAuthority({ ...issuer(), normalizedCik: "12" } as never)).toThrow("EVENT_ISSUER_CIK_INVALID");
    expect(() => createEventIssuerMappingAuthority({ ...issuer(), sourceNamespace: "SEC_EDGAR", sourceRegistrantId: "QUILL" } as never)).toThrow("EVENT_ISSUER_SOURCE_REGISTRANT_INVALID");
    expect(() => createEventIssuerMappingAuthority({ ...issuer(), mappingKind: "EXACT_SUBSIDIARY", parentCanonicalIssuerId: null } as never)).toThrow("EVENT_ISSUER_PARENT_SCOPE_INVALID");
  });

  it("rejects issuer and provider asset identities that do not match the source claim", () => {
    expect(() => issuerForClaim(completedClaim, { normalizedCik: "0000000001" })).toThrow("EVENT_ISSUER_SOURCE_REGISTRANT_INVALID");
    expect(assetBinding({ providerAssetId: "asset:synthetic:different-candidate" })).toBeNull();
  });

  it("requires exact claim, chain, address, representation revision and effective time", () => {
    const issuerAuthority = issuer(); const binding = assetBinding()!;
    const resolvedIssuer = resolveEventIssuerMapping({ ...issuerLookup(), registry: [issuerAuthority] });
    const resolvedAsset = resolveEventAssetMentionBinding({ registry: [binding], claim, asOf: AS_OF });
    expect(assembleMappedNonAuthoritativeEventClaim({ sourceResult: claimsResult, claim, issuer: resolvedIssuer, asset: resolvedAsset, mappingAsOf: "2026-04-10T14:03:00.000Z" })).toBeNull();
    expect(createEventAssetMentionBinding({ sourceNamespace: "SEC_EDGAR_8K_FIXTURE", claim, chainId: "eip155:2", contractAddress: "0x1111111111111111111111111111111111111111", representation: "ERC20", canonicalRepresentationId: "representation", mappingRevision: {} as never, providerIdentity: {} as never, evidence: [], effectiveFrom: AS_OF, reviewedAt: AS_OF, expiresAt: null, status: "ACTIVE", recordedAt: AS_OF })).toBeNull();
    expect(resolveEventAssetMentionBinding({ registry: [binding], claim, asOf: "2026-04-10T14:02:00.001Z" }).status).toBe("RESOLVED");
    expect(resolveEventAssetMentionBinding({ registry: [binding, assetBinding({ address: "0x2222222222222222222222222222222222222222" })!], claim, asOf: AS_OF }).status).toBe("CONFLICT");
    expect(resolveEventAssetMentionBinding({ registry: [assetBinding({ status: "REVOKED" })!], claim, asOf: "2026-04-12T00:00:00.000Z" }).status).toBe("REVOKED");
    expect(resolveEventAssetMentionBinding({ registry: [], claim, asOf: AS_OF }).status).toBe("INCOMPLETE");
    expect(resolveEventAssetMentionBinding({ registry: [binding], claim: claimsResult.claims.find(value => value.accession === "SYNTH-ACC-COMPLETE-0002")!, asOf: AS_OF }).status).toBe("INCOMPLETE");
  });

  it("does not resolve a parent relationship as the registrant's legal entity", () => {
    const parentRelationship = issuerForClaim(completedClaim, { mappingKind: "PARENT_RELATIONSHIP", parentCanonicalIssuerId: "issuer:synthetic:parent-0001" });
    const issuerResolution = resolveEventIssuerMapping(issuerLookupForClaim(completedClaim, [parentRelationship]));
    const assetResolution = resolveEventAssetMentionBinding({ registry: [assetBinding({ candidateClaim: completedClaim })!], claim: completedClaim, asOf: COMPLETED_AS_OF });
    expect(issuerResolution.status).toBe("RESOLVED");
    expect(assembleMappedNonAuthoritativeEventClaim({ sourceResult: claimsResult, claim: completedClaim, issuer: issuerResolution, asset: assetResolution, mappingAsOf: COMPLETED_AS_OF })).toBeNull();
  });

  it("allows a subsidiary only through an exact explicit legal-entity authority", () => {
    const subsidiary = issuerForClaim(completedClaim, { mappingKind: "EXACT_SUBSIDIARY", parentCanonicalIssuerId: "issuer:synthetic:parent-0002", subsidiaryScope: "EXACT_SUBSIDIARY_ONLY" });
    const issuerResolution = resolveEventIssuerMapping(issuerLookupForClaim(completedClaim, [subsidiary]));
    const assetResolution = resolveEventAssetMentionBinding({ registry: [assetBinding({ candidateClaim: completedClaim })!], claim: completedClaim, asOf: COMPLETED_AS_OF });
    const mapped = assembleMappedNonAuthoritativeEventClaim({ sourceResult: claimsResult, claim: completedClaim, issuer: issuerResolution, asset: assetResolution, mappingAsOf: COMPLETED_AS_OF });
    expect(mapped?.canonicalIssuerId).toBe(subsidiary.canonicalIssuerId);
    expect(mapped?.canonicalLegalEntityId).toBe(subsidiary.canonicalLegalEntityId);
  });

  it("blocks original and amended claims while correction lineage remains unresolved", () => {
    const authority = issuer(); const binding = assetBinding()!;
    const issuerResolution = resolveEventIssuerMapping({ ...issuerLookup(), registry: [authority] });
    const assetResolution = resolveEventAssetMentionBinding({ registry: [binding], claim, asOf: AS_OF });
    expect(claimsResult.correctionLineage.some(edge => edge.originalClaimId === claim.claimId)).toBe(true);
    expect(assembleMappedNonAuthoritativeEventClaim({ sourceResult: claimsResult, claim, issuer: issuerResolution, asset: assetResolution, mappingAsOf: AS_OF })).toBeNull();
  });

  it("keeps production registries empty and every downstream boundary blocked", () => {
    expect(EVENT_INTELLIGENCE_MAPPING_PRODUCTION_CONFIG).toMatchObject({
      issuerMappings: [], eventAssetMentionBindings: [], selectedMappingAuthorities: [],
      issuerMappingReadiness: "BLOCKED", assetMappingReadiness: "BLOCKED", eventAssembly: "BLOCKED",
      persistence: "BLOCKED", eventAuthority: "BLOCKED", signalGeneration: "BLOCKED",
    });
    expect(Object.isFrozen(EVENT_INTELLIGENCE_MAPPING_PRODUCTION_CONFIG.issuerMappings)).toBe(true);
    expect(Object.isFrozen(EVENT_INTELLIGENCE_MAPPING_PRODUCTION_CONFIG.eventAssetMentionBindings)).toBe(true);
  });

  it("requires append-only, exact supersession links and resolves historical intervals", () => {
    const cutover = AS_OF;
    const oldIssuer = issuer({ status: "SUPERSEDED", expiresAt: cutover });
    const newIssuer = issuer({ effectiveFrom: cutover, canonicalIssuerId: "issuer:synthetic:quill-successor", canonicalLegalEntityId: "legal-entity:synthetic:quill-successor", mappingKind: "SUCCESSOR", supersedesAuthorityId: oldIssuer.authorityId, supersedesFingerprint: oldIssuer.fingerprint });
    const issuerRegistry = [oldIssuer, newIssuer];
    expect(resolveEventIssuerMapping({ ...issuerLookup({ asOf: "2026-04-10T14:01:59.999Z" }), registry: issuerRegistry }).authority?.authorityId).toBe(oldIssuer.authorityId);
    expect(resolveEventIssuerMapping({ ...issuerLookup(), registry: issuerRegistry }).authority?.authorityId).toBe(newIssuer.authorityId);
    expect(resolveEventIssuerMapping({ ...issuerLookup(), registry: [newIssuer] }).status).toBe("INVALID");

    const oldAsset = assetBinding({ status: "SUPERSEDED", expiresAt: cutover })!;
    const newAsset = assetBinding({ effectiveFrom: cutover, supersedesBindingId: oldAsset.bindingId, supersedesFingerprint: oldAsset.fingerprint })!;
    expect(resolveEventAssetMentionBinding({ registry: [oldAsset, newAsset], claim, asOf: "2026-04-10T14:01:59.999Z" }).binding?.bindingId).toBe(oldAsset.bindingId);
    expect(resolveEventAssetMentionBinding({ registry: [oldAsset, newAsset], claim, asOf: AS_OF }).binding?.bindingId).toBe(newAsset.bindingId);
    expect(resolveEventAssetMentionBinding({ registry: [newAsset], claim, asOf: AS_OF }).status).toBe("INVALID");
  });

  it("binds resolver and mapped identities to exact asOf, source package, artifact and mention revision", () => {
    const authority = issuerForClaim(completedClaim); const binding = assetBinding({ candidateClaim: completedClaim });
    const issuerResolution = resolveEventIssuerMapping(issuerLookupForClaim(completedClaim, [authority]));
    const assetResolution = resolveEventAssetMentionBinding({ registry: [binding!], claim: completedClaim, asOf: COMPLETED_AS_OF });
    const mapped = assembleMappedNonAuthoritativeEventClaim({ sourceResult: claimsResult, claim: completedClaim, issuer: issuerResolution, asset: assetResolution, mappingAsOf: COMPLETED_AS_OF });
    expect(mapped).toMatchObject({
      sourceFilingPackageId: expect.stringMatching(/^sec-edgar-fixture-filing:/),
      sourceFilingPackageFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      sourceArtifactId: completedClaim.sourceArtifactId,
      sourceArtifactFingerprint: completedClaim.sourceArtifactFingerprint,
      mentionBindingId: binding?.bindingId,
      mentionBindingFingerprint: binding?.fingerprint,
    });
    expect(assembleMappedNonAuthoritativeEventClaim({ sourceResult: claimsResult, claim: completedClaim, issuer: issuerResolution, asset: assetResolution, mappingAsOf: "2026-04-10T14:03:00.000Z" })).toBeNull();
    const futureReviewedIssuer = issuerForClaim(completedClaim, { reviewedAt: "2027-04-10T14:03:00.000Z" });
    expect(resolveEventIssuerMapping(issuerLookupForClaim(completedClaim, [futureReviewedIssuer])).status).toBe("INCOMPLETE");
    const futureReviewedAsset = assetBinding({ candidateClaim: completedClaim, reviewedAt: "2027-04-10T14:03:00.000Z" });
    expect(resolveEventAssetMentionBinding({ registry: [futureReviewedAsset!], claim: completedClaim, asOf: COMPLETED_AS_OF }).status).toBe("INCOMPLETE");
  });

  it("rejects supersession forks before selecting either historical or current authority", () => {
    const cutover = AS_OF;
    const oldIssuer = issuer({ status: "SUPERSEDED", expiresAt: cutover });
    const issuerA = issuer({ effectiveFrom: cutover, canonicalIssuerId: "issuer:synthetic:successor-a", canonicalLegalEntityId: "legal-entity:synthetic:successor-a", mappingKind: "SUCCESSOR", supersedesAuthorityId: oldIssuer.authorityId, supersedesFingerprint: oldIssuer.fingerprint });
    const issuerB = issuer({ effectiveFrom: cutover, canonicalIssuerId: "issuer:synthetic:successor-b", canonicalLegalEntityId: "legal-entity:synthetic:successor-b", mappingKind: "SUCCESSOR", supersedesAuthorityId: oldIssuer.authorityId, supersedesFingerprint: oldIssuer.fingerprint });
    expect(resolveEventIssuerMapping({ ...issuerLookup({ asOf: "2026-04-10T14:01:59.999Z" }), registry: [oldIssuer, issuerA, issuerB] }).status).toBe("INVALID");

    const oldBinding = assetBinding({ status: "SUPERSEDED", expiresAt: cutover })!;
    const childA = assetBinding({ address: "0x2222222222222222222222222222222222222222", effectiveFrom: cutover, supersedesBindingId: oldBinding.bindingId, supersedesFingerprint: oldBinding.fingerprint })!;
    const childB = assetBinding({ address: "0x3333333333333333333333333333333333333333", effectiveFrom: cutover, supersedesBindingId: oldBinding.bindingId, supersedesFingerprint: oldBinding.fingerprint })!;
    expect(resolveEventAssetMentionBinding({ registry: [oldBinding, childA, childB], claim, asOf: "2026-04-10T14:01:59.999Z" }).status).toBe("INVALID");
  });
});
