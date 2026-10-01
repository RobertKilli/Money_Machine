import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createAssetMappingRevision } from "@/domain/intelligence/asset-mapping-revision";
import { createProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import { assembleMappedNonAuthoritativeEventClaim, createEventAssetMentionBinding, createEventIssuerMappingAuthority, resolveEventAssetMentionBinding, resolveEventIssuerMapping, type MappedNonAuthoritativeEventClaim } from "@/domain/intelligence/event-intelligence-mapping-authority";
import { runSecEdgar8kFixtureClaimPipeline } from "@/domain/intelligence/sec-edgar-8k-fixture-claim-pipeline";
import { cloneSyntheticFixtures } from "../fixtures/sec-edgar-8k-fixture-claim-pipeline";
import { createEventClaimEvidence, createEventCorroborationPolicy, createEventSourceOrigin, evaluateEventCorroboration, isAuthenticEventAuthorityEligibilityResult, parseEventCorroborationPolicy, rejectEligibilityAsEventAuthorityOrPersistence, sealEventCorroborationInputSet, type EventSourceOrigin } from "@/domain/intelligence/event-intelligence-corroboration-authority-policy";

const HASH="a".repeat(64);
const run=runSecEdgar8kFixtureClaimPipeline(cloneSyntheticFixtures());
if(run.status!=="VALID") throw new Error("SYNTHETIC_CORROBORATION_FIXTURE_INVALID");
const validRun=run as Extract<typeof run,{status:"VALID"}>;
const sourceClaim=validRun.claims.find(x=>x.accession==="SYNTH-ACC-COMPLETE-0002")!;
const ASOF=sourceClaim.acceptanceAt;
function mapped(claim=sourceClaim, correctionParent?: MappedNonAuthoritativeEventClaim, sourceResult:typeof validRun=validRun) {
  const authority=createEventIssuerMappingAuthority({sourceNamespace:"SEC_EDGAR_8K_FIXTURE",jurisdiction:"US",regulator:"SEC",normalizedCik:claim.issuerIdentityCandidate.syntheticCik.slice(-4).padStart(10,"0"),sourceRegistrantId:claim.issuerIdentityCandidate.syntheticCik,registrantLegalName:claim.issuerIdentityCandidate.displayName,canonicalIssuerId:"issuer:synthetic:gossamer-0002",canonicalLegalEntityId:"legal-entity:synthetic:gossamer-0002",entityType:"CORPORATION",parentCanonicalIssuerId:null,subsidiaryScope:"EXACT_REGISTRANT_ONLY",mappingKind:"EXACT_REGISTRANT",evidence:[{referenceId:"synthetic-issuer-evidence-01",classification:"OBSERVED",fingerprint:HASH}],reviewedAt:"2026-04-10T14:00:00.000Z",effectiveFrom:"2026-04-01T00:00:00.000Z",expiresAt:null,revokedAt:null,supersedesAuthorityId:null,supersedesFingerprint:null,status:"ACTIVE",recordedAt:"2026-04-10T14:01:00.000Z"});
  const identity=createProviderAssetIdentityAssertion({providerId:"synthetic-event",datasetId:"synthetic-mention",datasetVersion:"v1",providerSourceNamespace:"synthetic:sec-fixture",providerAssetId:claim.assetIdentityCandidate.syntheticAssetId,identityType:"EVM_CONTRACT_ADDRESS",identityNamespace:"eip155:1",identityValue:"0x1111111111111111111111111111111111111111",sourceArtifactId:"synthetic-asset-artifact-01",sourceEnvelopeId:"synthetic-envelope-01",parserVersion:"synthetic/v1",envelopeSchemaVersion:"synthetic/v1",sourcePayloadFingerprint:HASH,recordedAt:"2026-04-10T14:01:00.000Z"});
  const revision=createAssetMappingRevision({mappingRevisionVersion:"mapping/v1",providerId:identity.providerId,datasetId:identity.datasetId,datasetVersion:identity.datasetVersion,sourceLineageId:"synthetic-lineage-01",providerAssetIdentityAssertionId:identity.providerAssetIdentityAssertionId,providerAssetNamespace:identity.providerSourceNamespace,providerAssetId:identity.providerAssetId,canonicalAssetId:"asset:synthetic:gossamer-0002",canonicalIdentifier:"representation:eip155:1:erc20:gossamer-0002",assetClass:"CRYPTO",validFrom:"2026-04-01T00:00:00.000Z",observedAt:"2026-04-10T14:00:00.000Z",availableAt:"2026-04-10T14:00:30.000Z",sourceRecordIds:["synthetic-source-01"],payloadFingerprint:HASH,recordedAt:"2026-04-10T14:01:00.000Z"});
  const binding=createEventAssetMentionBinding({sourceNamespace:"SEC_EDGAR_8K_FIXTURE",claim,chainId:"eip155:1",contractAddress:"0x1111111111111111111111111111111111111111",representation:"ERC20",canonicalRepresentationId:"representation:eip155:1:erc20:gossamer-0002",mappingRevision:revision,providerIdentity:identity,evidence:[{referenceId:"synthetic-asset-evidence-01",classification:"OBSERVED",fingerprint:HASH}],effectiveFrom:"2026-04-01T00:00:00.000Z",reviewedAt:"2026-04-10T14:00:00.000Z",expiresAt:null,revokedAt:null,supersedesBindingId:null,supersedesFingerprint:null,status:"ACTIVE",recordedAt:"2026-04-10T14:01:00.000Z"});
  const asOf=claim.announcementAt;
  const ir=resolveEventIssuerMapping({registry:[authority],sourceNamespace:"SEC_EDGAR_8K_FIXTURE",jurisdiction:"US",regulator:"SEC",cik:claim.issuerIdentityCandidate.syntheticCik.slice(-4).padStart(10,"0"),sourceRegistrantId:claim.issuerIdentityCandidate.syntheticCik,asOf});
  const ar=resolveEventAssetMentionBinding({registry:[binding!],claim,asOf});
  const mapped=assembleMappedNonAuthoritativeEventClaim({sourceResult,claim,issuer:ir,asset:ar,mappingAsOf:asOf,...(correctionParent?{correctionParent}:{})});
  if(!mapped) throw new Error(`SYNTHETIC_MAPPED_CLAIM_INVALID:${claim.accession}`); return mapped;
}
function policy(overrides:Record<string,unknown>={}) { return createEventCorroborationPolicy({status:"ACTIVE",authoritySubject:"ISSUER_DISCLOSURE",jurisdiction:"US",supportedEventTypes:["PURCHASE_COMPLETED"],supportedLifecycleStatuses:["COMPLETED"],requiredSourceTiers:["REGULATORY_FILING"],minimumIndependentOriginGroups:1,minimumSourceArtifacts:1,requirePrimarySource:true,requireMappedIssuer:true,requireMappedAsset:true,requireExactEventScope:true,amountPolicy:"EXACT_OR_EXPLICIT_CLASS",currencyPolicy:"EXACT_OR_UNKNOWN",temporalCutoffPolicy:"PUBLICATION_NOT_AFTER_AS_OF",correctionPolicy:"APPEND_ONLY_COMPLETE_LINEAGE",conflictPolicy:"FAIL_CLOSED_NO_VOTING",rumorPolicy:"NEVER_ELIGIBLE",discoveryPolicy:"DISCOVERY_ONLY",maxEvidenceAgeSeconds:86400,reviewedAt:"2026-04-10T14:00:00.000Z",effectiveFrom:"2026-04-01T00:00:00.000Z",expiresAt:"2026-07-01T00:00:00.000Z",evidenceReferences:[{referenceId:"synthetic-policy-evidence-01",fingerprint:HASH}],approvals:{rawAcquisition:"APPROVED",rawStorage:"APPROVED",normalizedStorage:"APPROVED",derivedUse:"APPROVED",retention:"APPROVED",redistribution:"APPROVED",commercialUse:"APPROVED"},blockers:[],recordedAt:"2026-04-10T14:00:01.000Z",...overrides} as never); }
function origin(claim=sourceClaim, mappedClaim=mapped(), overrides:Partial<EventSourceOrigin>={}) { return createEventSourceOrigin({kind:"REGULATORY_FILING",publisherId:"sec-edgar-synthetic",originatingAuthorityId:mappedClaim.canonicalIssuerId,sourceArtifactId:mappedClaim.sourceArtifactId,sourceArtifactFingerprint:mappedClaim.sourceArtifactFingerprint,canonicalPublicationId:claim.accession,upstreamPublicationId:null,lineageKnown:true,sourceTier:"REGULATORY_FILING",issuerId:mappedClaim.canonicalIssuerId,publicationAt:claim.acceptanceAt,receivedAt:claim.acceptanceAt,correctionStatus:"ACTIVE",correctsOriginId:null,correctionKind:null,deliveryPath:"ARCHIVE",...overrides}); }
function withThirdAmendment(options:{amount?:string;amountClassification?:string;currency?:string;signingDate?:string;expectedClosingDate?:string;correctedField?:string}={}) {
  const fixtures=cloneSyntheticFixtures();
  const pkg=JSON.parse(JSON.stringify(fixtures.find(value=>(value.filingIndex as Record<string,unknown>).accession==="SYNTH-ACC-AMEND-0001"))) as Record<string,unknown>;
  const accession="SYNTH-ACC-AMEND-0002",accepted="2026-04-20T09:15:00.000Z",published="2026-04-20T09:10:00.000Z";
  pkg.receipt={receiptId:"SYNTH-RECEIPT-AMEND-0002",sourcePublishedAt:published,receivedAt:"2026-04-20T09:16:00.000Z",effectiveAvailableAt:"2026-04-20T09:16:01.000Z"};
  const submissions=pkg.submissions as {recent:Record<string,unknown[]>};const recent=submissions.recent;recent.accessionNumber=[accession];recent.filingDate=["2026-04-20"];recent.acceptanceDateTime=[accepted];
  const index=pkg.filingIndex as Record<string,unknown>;index.accession=accession;index.archivePath=`/synthetic-edgar/archive/SYNTH-CIK-0001/${accession}/index.txt`;index.filingDate="2026-04-20";index.acceptanceDateTime=accepted;index.amendmentOfAccession="SYNTH-ACC-AMEND-0001";
  const documents=pkg.documents as Record<string,string>[];const document=documents[0]!;
  const replacements:[string,string][]=[["AMOUNT|1300000",`AMOUNT|${options.amount??"1300000"}`],["ORIGINAL_ACCESSION|SYNTH-ACC-AGREE-0001","ORIGINAL_ACCESSION|SYNTH-ACC-AMEND-0001"],["CORRECTS_FIELD|AMOUNT",`CORRECTS_FIELD|${options.correctedField??"AMOUNT"}`]];
  if(options.amountClassification)replacements.push(["AMOUNT_CLASS|EXACT",`AMOUNT_CLASS|${options.amountClassification}`]);
  if(options.currency)replacements.push(["CURRENCY|SYNTH-CUR-01",`CURRENCY|${options.currency}`]);
  if(options.signingDate)replacements.push(["SIGNING_DATE|2026-04-09",`SIGNING_DATE|${options.signingDate}`]);
  if(options.expectedClosingDate)replacements.push(["EXPECTED_CLOSING_DATE|2026-09-30",`EXPECTED_CLOSING_DATE|${options.expectedClosingDate}`]);
  for(const [before,after] of replacements)document.content=document.content.replace(before,after);
  const descriptors=index.documents as Record<string,unknown>[];const descriptor=descriptors[0]!;descriptor.byteLength=Buffer.byteLength(document.content,"utf8");descriptor.contentSha256=createHash("sha256").update(document.content,"utf8").digest("hex");
  const expected=pkg.expected as Record<string,unknown>;expected.amount=options.amount??"1300000";expected.amountClassification=options.amountClassification??"EXACT";expected.currency=options.currency??"SYNTH-CUR-01";expected.signingDate=options.signingDate??"2026-04-09";expected.expectedClosingDate=options.expectedClosingDate??"2026-09-30";
  fixtures.push(pkg);
  return fixtures;
}
function evaluated(policyValue=policy(), origins=[origin()]) { const mc=mapped(), evidence=createEventClaimEvidence(mc,sourceClaim)!; const set=sealEventCorroborationInputSet([evidence],origins); if(!set) throw new Error("SYNTHETIC_INPUT_SET_INVALID"); return evaluateEventCorroboration({policy:policyValue,asOf:ASOF,evaluatedAt:"2026-04-11T00:00:00.000Z",inputSet:set}); }

describe("event corroboration and issuer-disclosure eligibility",()=>{
  it("maps an original claim that has a trusted amendment edge",()=>{
    const original=validRun.claims.find(x=>x.accession==="SYNTH-ACC-AGREE-0001")!;
    const amendment=validRun.claims.find(x=>x.accession==="SYNTH-ACC-AMEND-0001")!;
    expect(original.correctionOfClaimId).toBeNull();
    const originalMapped=mapped(original); expect(originalMapped).not.toBeNull();
    const amendmentMapped=mapped(amendment,originalMapped!); expect(amendmentMapped).not.toBeNull();
    expect(amendmentMapped!.correctionOfMappedClaimId).toBe(originalMapped!.mappedClaimId);
    expect(amendmentMapped!.eventCandidateId).toBe(originalMapped!.eventCandidateId);
    expect(originalMapped!.claimFingerprint).toBe(original.fingerprint);
  });
  it("selects the current mapped claim across a complete amendment lineage at evaluationAsOf",()=>{
    const original=validRun.claims.find(x=>x.accession==="SYNTH-ACC-AGREE-0001")!;
    const amendment=validRun.claims.find(x=>x.accession==="SYNTH-ACC-AMEND-0001")!;
    const originalMapped=mapped(original), amendmentMapped=mapped(amendment,originalMapped);
    const originalEvidence=createEventClaimEvidence(originalMapped,original)!;
    const amendmentEvidence=createEventClaimEvidence(amendmentMapped,amendment)!;
    const originalOrigin=origin(original,originalMapped);
    const amendmentOrigin=origin(amendment,amendmentMapped,{correctionStatus:"CORRECTED",correctionKind:"REPLACE_FIELD_VALUES",correctsOriginId:originalOrigin.originId});
    const sealed=sealEventCorroborationInputSet([originalEvidence,amendmentEvidence],[originalOrigin,amendmentOrigin]);
    expect(sealed).not.toBeNull();
    const activePolicy=policy({supportedEventTypes:["DEFINITIVE_PURCHASE_AGREEMENT"],supportedLifecycleStatuses:["SIGNED"],maxEvidenceAgeSeconds:31_536_000});
    const before=evaluateEventCorroboration({policy:activePolicy,asOf:"2026-04-15T09:14:59.999Z",inputSet:sealed!,evaluatedAt:"2026-04-15T10:00:00.000Z"});
    const at=evaluateEventCorroboration({policy:activePolicy,asOf:amendment.acceptanceAt,inputSet:sealed!,evaluatedAt:"2026-04-15T10:00:00.000Z"});
    const after=evaluateEventCorroboration({policy:activePolicy,asOf:"2026-04-16T00:00:00.000Z",inputSet:sealed!,evaluatedAt:"2026-04-16T00:01:00.000Z"});
    expect(before.status).toBe("ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY"); expect(before.selectedCurrentClaimId).toBe(originalMapped.claimId);
    expect(at.status).toBe("ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY"); expect(at.selectedCurrentClaimId).toBe(amendmentMapped.claimId);
    expect(after.status).toBe("ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY"); expect(after.selectedCurrentClaimId).toBe(amendmentMapped.claimId);
    expect(at.correctionLineage).toEqual([`${original.claimId}->${amendment.claimId}`]);
    expect(at.independentOriginGroups).toHaveLength(1);
    expect(at.fingerprint).toBe(evaluateEventCorroboration({policy:activePolicy,asOf:amendment.acceptanceAt,inputSet:sealed!,evaluatedAt:"2026-05-01T00:00:00.000Z"}).fingerprint);
  });
  it("rejects incomplete correction parents and returns RETRACTED after a terminal retraction",()=>{
    const original=validRun.claims.find(x=>x.accession==="SYNTH-ACC-AGREE-0001")!;
    const amendment=validRun.claims.find(x=>x.accession==="SYNTH-ACC-AMEND-0001")!;
    const originalMapped=mapped(original), amendmentMapped=mapped(amendment,originalMapped);
    const amendmentEvidence=createEventClaimEvidence(amendmentMapped,amendment)!;
    expect(sealEventCorroborationInputSet([amendmentEvidence],[origin(amendment,amendmentMapped)])).toBeNull();
    const originalEvidence=createEventClaimEvidence(originalMapped,original)!;
    const originalOrigin=origin(original,originalMapped);
    const amendmentOrigin=origin(amendment,amendmentMapped,{correctionStatus:"CORRECTED",correctionKind:"REPLACE_FIELD_VALUES",correctsOriginId:originalOrigin.originId});
    const retraction=createEventSourceOrigin({kind:"REGULATORY_FILING",publisherId:"sec-edgar-synthetic",originatingAuthorityId:originalMapped.canonicalIssuerId,sourceArtifactId:"synthetic-retraction-artifact-01",sourceArtifactFingerprint:"d".repeat(64),canonicalPublicationId:"SYNTH-ACC-RETRACTION-0001",upstreamPublicationId:null,lineageKnown:true,sourceTier:"REGULATORY_FILING",issuerId:originalMapped.canonicalIssuerId,publicationAt:"2026-04-20T09:00:00.000Z",receivedAt:"2026-04-20T09:01:00.000Z",correctionStatus:"RETRACTED",correctsOriginId:amendmentOrigin.originId,correctionKind:"RETRACTION",deliveryPath:"ARCHIVE"});
    const sealed=sealEventCorroborationInputSet([originalEvidence,amendmentEvidence],[originalOrigin,amendmentOrigin,retraction])!;
    const activePolicy=policy({supportedEventTypes:["DEFINITIVE_PURCHASE_AGREEMENT"],supportedLifecycleStatuses:["SIGNED"],maxEvidenceAgeSeconds:31_536_000});
    const before=evaluateEventCorroboration({policy:activePolicy,asOf:"2026-04-19T23:59:59.999Z",inputSet:sealed});
    const after=evaluateEventCorroboration({policy:activePolicy,asOf:"2026-04-20T09:00:00.000Z",inputSet:sealed});
    expect(before.status).toBe("ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY"); expect(before.selectedCurrentClaimId).toBe(amendmentMapped.claimId);
    expect(after.status).toBe("RETRACTED"); expect(after.selectedCurrentClaimId).toBeNull();
  });
  it("replays a multi-amendment chain and selects its as-of terminal without counting amendments as origins",()=>{
    const pipeline=runSecEdgar8kFixtureClaimPipeline(withThirdAmendment({amount:"1400000"})); expect(pipeline.status).toBe("VALID");
    if(pipeline.status!=="VALID")return;
    const original=pipeline.claims.find(x=>x.accession==="SYNTH-ACC-AGREE-0001")!;
    const first=pipeline.claims.find(x=>x.accession==="SYNTH-ACC-AMEND-0001")!;
    const terminal=pipeline.claims.find(x=>x.accession==="SYNTH-ACC-AMEND-0002")!;
    const a=mapped(original,undefined,pipeline),b=mapped(first,a,pipeline),c=mapped(terminal,b,pipeline);
    const evidence=[createEventClaimEvidence(a,original)!,createEventClaimEvidence(b,first)!,createEventClaimEvidence(c,terminal)!];
    const root=origin(original,a),middle=origin(first,b,{correctionStatus:"CORRECTED",correctionKind:"REPLACE_FIELD_VALUES",correctsOriginId:root.originId}),last=origin(terminal,c,{correctionStatus:"CORRECTED",correctionKind:"REPLACE_FIELD_VALUES",correctsOriginId:middle.originId});
    const sealed=sealEventCorroborationInputSet(evidence,[root,middle,last]);expect(sealed).not.toBeNull();
    const p=policy({supportedEventTypes:["DEFINITIVE_PURCHASE_AGREEMENT"],supportedLifecycleStatuses:["SIGNED"],maxEvidenceAgeSeconds:31_536_000});
    const atB=evaluateEventCorroboration({policy:p,asOf:first.acceptanceAt,inputSet:sealed!});
    const atC=evaluateEventCorroboration({policy:p,asOf:terminal.acceptanceAt,inputSet:sealed!});
    expect(atB.status).toBe("ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY");expect(atB.selectedCurrentClaimId).toBe(b.claimId);
    expect(atC.status).toBe("ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY");expect(atC.selectedCurrentClaimId).toBe(c.claimId);
    expect(atC.correctionLineage).toEqual([`${original.claimId}->${first.claimId}`,`${first.claimId}->${terminal.claimId}`]);
    expect(atC.independentOriginGroups).toHaveLength(1);
    const replay=sealEventCorroborationInputSet([...evidence].reverse(),[last,middle,root]);expect(replay?.fingerprint).toBe(sealed!.fingerprint);
  });
  it("binds each supported corrected field and preserves amount classes",()=>{
    const scenarios=[
      {options:{amount:"1400000",amountClassification:"MAXIMUM"},fields:["amount","amountClassification"]},
      {options:{amount:"1500000",amountClassification:"TARGET"},fields:["amount","amountClassification"]},
      {options:{currency:"SYNTH-CUR-99"},fields:["currency"]},
      {options:{signingDate:"2026-04-08",correctedField:"SIGNING_DATE"},fields:["signingDate"]},
      {options:{expectedClosingDate:"2026-10-15",correctedField:"EXPECTED_CLOSING_DATE"},fields:["expectedClosingDate"]},
    ] as const;
    for(const scenario of scenarios){
      const run=runSecEdgar8kFixtureClaimPipeline(withThirdAmendment(scenario.options));expect(run.status).toBe("VALID");
      if(run.status!=="VALID")continue;
      const original=run.claims.find(x=>x.accession==="SYNTH-ACC-AGREE-0001")!,middle=run.claims.find(x=>x.accession==="SYNTH-ACC-AMEND-0001")!,amendment=run.claims.find(x=>x.accession==="SYNTH-ACC-AMEND-0002")!;
      const root=mapped(original,undefined,run),parent=mapped(middle,root,run),corrected=mapped(amendment,parent,run);
      expect(corrected.correctedFields).toEqual(scenario.fields);
      expect(corrected.correctionKind).toBe("REPLACE_FIELD_VALUES");
      expect(corrected.eventCandidateId).toBe(parent.eventCandidateId);
      expect(amendment.amountClassification).toBe("amountClassification" in scenario.options?scenario.options.amountClassification:"EXACT");
    }
  });
  it("evaluates only trusted, exact mapped filing material and never grants event authority",()=>{
    const value=evaluated(); expect(value.status).toBe("ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY"); expect(value.classification).toBe("EVENT_AUTHORITY_ELIGIBILITY_RESULT"); expect(value.selectedCurrentClaimId).toBe(sourceClaim.claimId); expect(Object.isFrozen(value)).toBe(true); expect(isAuthenticEventAuthorityEligibilityResult(value)).toBe(true); expect(rejectEligibilityAsEventAuthorityOrPersistence(value)).toBeNull();
  });
  it("uses independent origin groups rather than delivery paths or artifacts",()=>{
    const mc=mapped(), evidence=createEventClaimEvidence(mc,sourceClaim)!; const a=origin(sourceClaim,mc,{deliveryPath:"ARCHIVE"}), b=origin(sourceClaim,mc,{deliveryPath:"RSS"});
    const set=sealEventCorroborationInputSet([evidence],[a,b]); expect(set).not.toBeNull(); expect(set!.origins).toHaveLength(1);
    const p=policy({minimumIndependentOriginGroups:2}); const result=evaluateEventCorroboration({policy:p,asOf:ASOF,inputSet:set!,evaluatedAt:"2026-06-01T00:00:00.000Z"}); expect(result.status).toBe("INCOMPLETE"); expect(result.blockers).toContain("CORROBORATION_THRESHOLD_NOT_MET");
  });
  it("does not let caller relabel one SEC artifact as independent journalism",()=>{
    const mc=mapped(), evidence=createEventClaimEvidence(mc,sourceClaim)!;
    const filing=origin(sourceClaim,mc);
    const relabeled=createEventSourceOrigin({kind:"INDEPENDENT_JOURNALISM",publisherId:"synthetic-news-publisher",originatingAuthorityId:"journalist:synthetic-01",sourceArtifactId:mc.sourceArtifactId,sourceArtifactFingerprint:mc.sourceArtifactFingerprint,canonicalPublicationId:"article:synthetic-01",upstreamPublicationId:null,lineageKnown:true,sourceTier:"INDEPENDENT_JOURNALISM",issuerId:mc.canonicalIssuerId,publicationAt:sourceClaim.acceptanceAt,receivedAt:sourceClaim.acceptanceAt,correctionStatus:"ACTIVE",correctsOriginId:null,correctionKind:null,deliveryPath:"ARTICLE"});
    const set=sealEventCorroborationInputSet([evidence],[filing,relabeled])!;
    const result=evaluateEventCorroboration({policy:policy({minimumIndependentOriginGroups:2}),asOf:ASOF,inputSet:set,evaluatedAt:ASOF});
    expect(result.status).toBe("INCOMPLETE"); expect(result.blockers).toContain("ORIGIN_KIND_OR_PUBLICATION_NOT_BOUND_TO_CLAIM");
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
    const correctionAt="2026-05-12T16:25:00.000Z";
    const retraction=createEventSourceOrigin({kind:"REGULATORY_FILING",publisherId:"sec-edgar-synthetic",originatingAuthorityId:mc.canonicalIssuerId,sourceArtifactId:"synthetic-correction-artifact-01",sourceArtifactFingerprint:"b".repeat(64),canonicalPublicationId:"SYNTH-ACC-RETRACTION-0001",upstreamPublicationId:null,lineageKnown:true,sourceTier:"REGULATORY_FILING",issuerId:mc.canonicalIssuerId,publicationAt:correctionAt,receivedAt:correctionAt,correctionStatus:"RETRACTED",correctsOriginId:original.originId,correctionKind:"RETRACTION",deliveryPath:"ARCHIVE"});
    const corrected=createEventSourceOrigin({kind:"REGULATORY_FILING",publisherId:"sec-edgar-synthetic",originatingAuthorityId:mc.canonicalIssuerId,sourceArtifactId:"synthetic-correction-artifact-02",sourceArtifactFingerprint:"c".repeat(64),canonicalPublicationId:"SYNTH-ACC-CORRECTION-0001",upstreamPublicationId:null,lineageKnown:true,sourceTier:"REGULATORY_FILING",issuerId:mc.canonicalIssuerId,publicationAt:correctionAt,receivedAt:correctionAt,correctionStatus:"CORRECTED",correctionKind:"REPLACE_FIELD_VALUES",correctsOriginId:original.originId,deliveryPath:"ARCHIVE"});
    const evalOrigins=(values:EventSourceOrigin[])=>{const set=sealEventCorroborationInputSet([evidence],values)!;return evaluateEventCorroboration({policy:policy(),asOf:correctionAt,inputSet:set,evaluatedAt:correctionAt});};
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
  it("fails closed when a policy review is from after evaluationAsOf",()=>{
    const result=evaluated(policy({reviewedAt:"2026-05-20T00:00:00.000Z"}));
    expect(result.status).toBe("INCOMPLETE"); expect(result.blockers).toContain("POLICY_OR_INPUT_NOT_ACTIVE");
  });
  it("leaves production policy and downstream boundaries blocked",async()=>{
    const config=await import("@/domain/intelligence/event-intelligence-corroboration-authority-policy");
    expect(config.EVENT_INTELLIGENCE_CORROBORATION_PRODUCTION_CONFIG.activePolicies).toEqual([]); expect(config.EVENT_INTELLIGENCE_CORROBORATION_PRODUCTION_CONFIG.sourceOrigins).toEqual([]); expect(config.EVENT_INTELLIGENCE_CORROBORATION_PRODUCTION_CONFIG.persistence).toBe("BLOCKED");
  });
});
