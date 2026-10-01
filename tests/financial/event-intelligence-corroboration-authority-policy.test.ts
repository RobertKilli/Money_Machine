import { describe, expect, it } from "vitest";
import { createAssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import { createProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import { assembleMappedNonAuthoritativeEventClaim, createEventAssetMentionBinding, createEventIssuerMappingAuthority, resolveEventAssetMentionBinding, resolveEventIssuerMapping } from "@/domain/intelligence/event-intelligence-mapping-authority";
import { runSecEdgar8kFixtureClaimPipeline } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { cloneSyntheticFixtures } from "../fixtures/sec-edgar-8k-fixture-claim-pipeline";
import { createEventClaimEvidence, createEventCorroborationPolicy, createEventSourceOrigin, evaluateEventCorroboration, isAuthenticEventAuthorityEligibilityResult, parseEventCorroborationPolicy, rejectEligibilityAsEventAuthorityOrPersistence, sealEventCorroborationInputSet, type EventSourceOrigin } from "@/domain/intelligence/event-intelligence-corroboration-authority-policy";

const HASH="a".repeat(64);
const run=runSecEdgar8kFixtureClaimPipeline(cloneSyntheticFixtures());
if(run.status!=="VALID") throw new Error("SYNTHETIC_CORROBORATION_FIXTURE_INVALID");
const validRun=run as Extract<typeof run,{status:"VALID"}>;
const sourceClaim=validRun.claims.find(x=>x.accession==="SYNTH-ACC-COMPLETE-0002")!;
const ASOF=sourceClaim.acceptanceAt;
function mapped() {
  const authority=createEventIssuerMappingAuthority({sourceNamespace:"SEC_EDGAR_8K_FIXTURE",jurisdiction:"US",regulator:"SEC",normalizedCik:"0000000002",sourceRegistrantId:sourceClaim.issuerIdentityCandidate.syntheticCik,registrantLegalName:sourceClaim.issuerIdentityCandidate.displayName,canonicalIssuerId:"issuer:synthetic:gossamer-0002",canonicalLegalEntityId:"legal-entity:synthetic:gossamer-0002",entityType:"CORPORATION",parentCanonicalIssuerId:null,subsidiaryScope:"EXACT_REGISTRANT_ONLY",mappingKind:"EXACT_REGISTRANT",evidence:[{referenceId:"synthetic-issuer-evidence-01",classification:"OBSERVED",fingerprint:HASH}],reviewedAt:"2026-04-10T14:00:00.000Z",effectiveFrom:"2026-04-01T00:00:00.000Z",expiresAt:null,revokedAt:null,supersedesAuthorityId:null,supersedesFingerprint:null,status:"ACTIVE",recordedAt:"2026-04-10T14:01:00.000Z"});
  const identity=createProviderAssetIdentityAssertion({providerId:"synthetic-event",datasetId:"synthetic-mention",datasetVersion:"v1",providerSourceNamespace:"synthetic:sec-fixture",providerAssetId:sourceClaim.assetIdentityCandidate.syntheticAssetId,identityType:"EVM_CONTRACT_ADDRESS",identityNamespace:"eip155:1",identityValue:"0x1111111111111111111111111111111111111111",sourceArtifactId:"synthetic-asset-artifact-01",sourceEnvelopeId:"synthetic-envelope-01",parserVersion:"synthetic/v1",envelopeSchemaVersion:"synthetic/v1",sourcePayloadFingerprint:HASH,recordedAt:"2026-04-10T14:01:00.000Z"});
  const revision=createAssetMappingRevision({mappingRevisionVersion:"mapping/v1",providerId:identity.providerId,datasetId:identity.datasetId,datasetVersion:identity.datasetVersion,sourceLineageId:"synthetic-lineage-01",providerAssetIdentityAssertionId:identity.providerAssetIdentityAssertionId,providerAssetNamespace:identity.providerSourceNamespace,providerAssetId:identity.providerAssetId,canonicalAssetId:"asset:synthetic:gossamer-0002",canonicalIdentifier:"representation:eip155:1:erc20:gossamer-0002",assetClass:"CRYPTO",validFrom:"2026-04-01T00:00:00.000Z",observedAt:"2026-04-10T14:00:00.000Z",availableAt:"2026-04-10T14:00:30.000Z",sourceRecordIds:["synthetic-source-01"],payloadFingerprint:HASH,recordedAt:"2026-04-10T14:01:00.000Z"});
  const binding=createEventAssetMentionBinding({sourceNamespace:"SEC_EDGAR_8K_FIXTURE",claim:sourceClaim,chainId:"eip155:1",contractAddress:"0x1111111111111111111111111111111111111111",representation:"ERC20",canonicalRepresentationId:"representation:eip155:1:erc20:gossamer-0002",mappingRevision:revision,providerIdentity:identity,evidence:[{referenceId:"synthetic-asset-evidence-01",classification:"OBSERVED",fingerprint:HASH}],effectiveFrom:"2026-04-01T00:00:00.000Z",reviewedAt:"2026-04-10T14:00:00.000Z",expiresAt:null,revokedAt:null,supersedesBindingId:null,supersedesFingerprint:null,status:"ACTIVE",recordedAt:"2026-04-10T14:01:00.000Z"});
  const asOf=sourceClaim.announcementAt;
  const ir=resolveEventIssuerMapping({registry:[authority],sourceNamespace:"SEC_EDGAR_8K_FIXTURE",jurisdiction:"US",regulator:"SEC",cik:"0000000002",sourceRegistrantId:sourceClaim.issuerIdentityCandidate.syntheticCik,asOf});
  const ar=resolveEventAssetMentionBinding({registry:[binding!],claim:sourceClaim,asOf});
  const mapped=assembleMappedNonAuthoritativeEventClaim({sourceResult:validRun,claim:sourceClaim,issuer:ir,asset:ar,mappingAsOf:asOf});
  if(!mapped) throw new Error("SYNTHETIC_MAPPED_CLAIM_INVALID"); return mapped;
}
function policy(overrides:Record<string,unknown>={}) { return createEventCorroborationPolicy({status:"ACTIVE",authoritySubject:"ISSUER_DISCLOSURE",jurisdiction:"US",supportedEventTypes:["PURCHASE_COMPLETED"],supportedLifecycleStatuses:["COMPLETED"],requiredSourceTiers:["REGULATORY_FILING"],minimumIndependentOriginGroups:1,minimumSourceArtifacts:1,requirePrimarySource:true,requireMappedIssuer:true,requireMappedAsset:true,requireExactEventScope:true,amountPolicy:"EXACT_OR_EXPLICIT_CLASS",currencyPolicy:"EXACT_OR_UNKNOWN",temporalCutoffPolicy:"PUBLICATION_NOT_AFTER_AS_OF",correctionPolicy:"APPEND_ONLY_COMPLETE_LINEAGE",conflictPolicy:"FAIL_CLOSED_NO_VOTING",rumorPolicy:"NEVER_ELIGIBLE",discoveryPolicy:"DISCOVERY_ONLY",maxEvidenceAgeSeconds:86400,reviewedAt:"2026-04-10T14:00:00.000Z",effectiveFrom:"2026-04-01T00:00:00.000Z",expiresAt:"2026-07-01T00:00:00.000Z",evidenceReferences:[{referenceId:"synthetic-policy-evidence-01",fingerprint:HASH}],approvals:{rawAcquisition:"APPROVED",rawStorage:"APPROVED",normalizedStorage:"APPROVED",derivedUse:"APPROVED",retention:"APPROVED",redistribution:"APPROVED",commercialUse:"APPROVED"},blockers:[],recordedAt:"2026-04-10T14:00:01.000Z",...overrides} as never); }
function origin(claim=sourceClaim, mappedClaim=mapped(), overrides:Partial<EventSourceOrigin>={}) { return createEventSourceOrigin({kind:"REGULATORY_FILING",publisherId:"sec-edgar-synthetic",originatingAuthorityId:mappedClaim.canonicalIssuerId,sourceArtifactId:mappedClaim.sourceArtifactId,sourceArtifactFingerprint:mappedClaim.sourceArtifactFingerprint,canonicalPublicationId:claim.accession,upstreamPublicationId:null,lineageKnown:true,sourceTier:"REGULATORY_FILING",issuerId:mappedClaim.canonicalIssuerId,publicationAt:claim.acceptanceAt,receivedAt:claim.acceptanceAt,correctionStatus:"ACTIVE",correctsOriginId:null,deliveryPath:"ARCHIVE",...overrides}); }
function evaluated(policyValue=policy(), origins=[origin()]) { const mc=mapped(), evidence=createEventClaimEvidence(mc,sourceClaim)!; const set=sealEventCorroborationInputSet([evidence],origins); if(!set) throw new Error("SYNTHETIC_INPUT_SET_INVALID"); return evaluateEventCorroboration({policy:policyValue,asOf:ASOF,evaluatedAt:"2026-04-11T00:00:00.000Z",inputSet:set}); }

describe("event corroboration and issuer-disclosure eligibility",()=>{
  it("evaluates only trusted, exact mapped filing material and never grants event authority",()=>{
    const value=evaluated(); expect(value.status).toBe("ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY"); expect(value.classification).toBe("EVENT_AUTHORITY_ELIGIBILITY_RESULT"); expect(value.selectedCurrentClaimId).toBe(sourceClaim.claimId); expect(Object.isFrozen(value)).toBe(true); expect(isAuthenticEventAuthorityEligibilityResult(value)).toBe(true); expect(rejectEligibilityAsEventAuthorityOrPersistence(value)).toBeNull();
  });
  it("uses independent origin groups rather than delivery paths or artifacts",()=>{
    const mc=mapped(), evidence=createEventClaimEvidence(mc,sourceClaim)!; const a=origin(sourceClaim,mc,{deliveryPath:"ARCHIVE"}), b=origin(sourceClaim,mc,{deliveryPath:"RSS"});
    const set=sealEventCorroborationInputSet([evidence],[a,b]); expect(set).not.toBeNull(); expect(set!.origins).toHaveLength(1);
    const p=policy({minimumIndependentOriginGroups:2}); const result=evaluateEventCorroboration({policy:p,asOf:ASOF,inputSet:set!,evaluatedAt:"2026-06-01T00:00:00.000Z"}); expect(result.status).toBe("INCOMPLETE"); expect(result.blockers).toContain("CORROBORATION_THRESHOLD_NOT_MET");
  });
  it("rejects copied policies, mapped claims, origins and sealed sets",()=>{
    const p=policy(), mc=mapped(), ev=createEventClaimEvidence(mc,sourceClaim)!; const o=origin(sourceClaim,mc); const set=sealEventCorroborationInputSet([ev],[o])!;
    expect(parseEventCorroborationPolicy(JSON.parse(JSON.stringify(p))).status).toBe("VALID");
    expect(evaluateEventCorroboration({policy:JSON.parse(JSON.stringify(p)),asOf:ASOF,inputSet:set,evaluatedAt:ASOF} as never).status).toBe("INVALID");
    expect(sealEventCorroborationInputSet([{...ev}],[o])).toBeNull(); expect(sealEventCorroborationInputSet([ev],[{...o}])).toBeNull();
    expect(evaluateEventCorroboration({policy:p,asOf:ASOF,inputSet:JSON.parse(JSON.stringify(set)),evaluatedAt:ASOF} as never).status).toBe("INVALID");
  });
  it("keeps issuer disclosure separate from externally verified facts",()=>{
    expect(()=>policy({authoritySubject:"EXTERNALLY_VERIFIED_EVENT_FACT"})).toThrow("EVENT_CORROBORATION_POLICY_INVALID");
    const unsupported=policy({status:"INACTIVE",authoritySubject:"EXTERNALLY_VERIFIED_EVENT_FACT"}); expect(evaluated(unsupported).status).toBe("UNSUPPORTED_AUTHORITY_SUBJECT");
    expect(evaluated(policy({status:"INVALID"})).status).toBe("INVALID");
  });
  it("rejects unsafe policy and origin input shapes with sanitized errors",()=>{
    const p=policy(); const raw={...p}; (raw as Record<string,unknown>).unexpected="x"; expect(()=>createEventCorroborationPolicy(raw as never)).toThrow("EVENT_CORROBORATION_POLICY_INVALID");
    const inherited=Object.assign(Object.create({polluted:true}),p); expect(()=>createEventCorroborationPolicy(inherited as never)).toThrow("EVENT_CORROBORATION_POLICY_INVALID");
    const accessor={...p}; Object.defineProperty(accessor,"jurisdiction",{enumerable:true,get(){throw new Error("SYNTHETIC_SECRET_SENTINEL");}}); expect(()=>createEventCorroborationPolicy(accessor as never)).toThrow("EVENT_CORROBORATION_POLICY_INVALID");
    let proxyCalls=0; const proxy=new Proxy(p,{get(){proxyCalls++;throw new Error("SYNTHETIC_SECRET_SENTINEL");}}); expect(()=>createEventCorroborationPolicy(proxy as never)).toThrow("EVENT_CORROBORATION_POLICY_INVALID"); expect(proxyCalls).toBe(0);
    const originObject=origin(); const polluted={...originObject,ignored:true}; expect(()=>createEventSourceOrigin(polluted as never)).toThrow("EVENT_SOURCE_ORIGIN_INVALID");
  });
  it("fails closed for future, retracted, corrected and discovery-only material",()=>{
    expect(evaluated(policy(),[origin(sourceClaim,mapped(),{publicationAt:"2026-05-13T15:00:00.000Z",receivedAt:"2026-05-13T15:00:00.000Z"})]).status).toBe("INCOMPLETE");
    const mc=mapped(), evidence=createEventClaimEvidence(mc,sourceClaim)!; const original=origin(sourceClaim,mc);
    const retraction=createEventSourceOrigin({kind:"REGULATORY_FILING",publisherId:"sec-edgar-synthetic",originatingAuthorityId:mc.canonicalIssuerId,sourceArtifactId:"synthetic-correction-artifact-01",sourceArtifactFingerprint:"b".repeat(64),canonicalPublicationId:"SYNTH-ACC-RETRACTION-0001",upstreamPublicationId:null,lineageKnown:true,sourceTier:"REGULATORY_FILING",issuerId:mc.canonicalIssuerId,publicationAt:ASOF,receivedAt:ASOF,correctionStatus:"RETRACTED",correctsOriginId:original.originId,deliveryPath:"ARCHIVE"});
    const corrected=createEventSourceOrigin({kind:"REGULATORY_FILING",publisherId:"sec-edgar-synthetic",originatingAuthorityId:mc.canonicalIssuerId,sourceArtifactId:"synthetic-correction-artifact-02",sourceArtifactFingerprint:"c".repeat(64),canonicalPublicationId:"SYNTH-ACC-CORRECTION-0001",upstreamPublicationId:null,lineageKnown:true,sourceTier:"REGULATORY_FILING",issuerId:mc.canonicalIssuerId,publicationAt:ASOF,receivedAt:ASOF,correctionStatus:"CORRECTED",correctsOriginId:original.originId,deliveryPath:"ARCHIVE"});
    const evalOrigins=(values:EventSourceOrigin[])=>{const set=sealEventCorroborationInputSet([evidence],values)!;return evaluateEventCorroboration({policy:policy(),asOf:ASOF,inputSet:set,evaluatedAt:ASOF});};
    expect(evalOrigins([original,retraction]).status).toBe("RETRACTED"); expect(evalOrigins([original,corrected]).status).toBe("CORRECTED");
    expect(evaluated(policy(),[origin(sourceClaim,mapped(),{kind:"AGGREGATOR_COPY",sourceTier:"AGGREGATOR_DISCOVERY",upstreamPublicationId:"publication:synthetic-original",lineageKnown:true,deliveryPath:"AGGREGATOR"})]).status).toBe("INCOMPLETE");
  });
  it("keeps receipt and evaluation-clock variance outside material identity",()=>{
    const mc=mapped(), evidence=createEventClaimEvidence(mc,sourceClaim)!;
    const a=origin(sourceClaim,mc,{receivedAt:"2026-05-12T16:25:00.000Z",deliveryPath:"ARCHIVE"});
    const b=origin(sourceClaim,mc,{receivedAt:"2026-05-12T17:00:00.000Z",deliveryPath:"RSS"});
    expect(a.fingerprint).toBe(b.fingerprint);
    const setA=sealEventCorroborationInputSet([evidence],[a])!,setB=sealEventCorroborationInputSet([evidence],[b])!;
    const p1=policy(),p2=policy({recordedAt:"2026-05-20T00:00:00.000Z"}); expect(p1.fingerprint).toBe(p2.fingerprint);
    const r1=evaluateEventCorroboration({policy:p1,asOf:ASOF,inputSet:setA,evaluatedAt:"2026-05-12T17:00:00.000Z"});
    const r2=evaluateEventCorroboration({policy:p1,asOf:ASOF,inputSet:setB,evaluatedAt:"2026-05-20T17:00:00.000Z"});
    expect(r1.fingerprint).toBe(r2.fingerprint); expect(r1.evaluatedAt).not.toBe(r2.evaluatedAt);
  });
  it("leaves production policy and downstream boundaries blocked",async()=>{
    const config=await import("@/domain/intelligence/event-intelligence-corroboration-authority-policy");
    expect(config.EVENT_INTELLIGENCE_CORROBORATION_PRODUCTION_CONFIG.activePolicies).toEqual([]); expect(config.EVENT_INTELLIGENCE_CORROBORATION_PRODUCTION_CONFIG.sourceOrigins).toEqual([]); expect(config.EVENT_INTELLIGENCE_CORROBORATION_PRODUCTION_CONFIG.persistence).toBe("BLOCKED");
  });
});
