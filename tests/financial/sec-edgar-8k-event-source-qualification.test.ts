import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalSha256 } from "../../src/domain/intelligence/ingestion-provenance";
import { SEC_8K_ITEM_SEMANTICS } from "../../src/domain/intelligence/event-intelligence-source-decision";
import {
  SEC_EDGAR_8K_ENDPOINT_PROFILES, SEC_EDGAR_8K_PRODUCTION_DECISION, SEC_EDGAR_8K_QUALIFICATION_VERSION, SEC_EDGAR_8K_SOURCE_ID,
  SEC_EDGAR_8K_USAGES, createSecEdgar8kRequestPlan, isAuthenticSecEdgar8kQualification,
  isAuthenticSecEdgar8kRequestPlan, parseSecEdgar8kQualification, secEdgarFilingIdentity,
  secEdgarFilingIndexPath, secEdgarAccessionDigits, type SecEdgar8kAmendmentLineageDesign,
  type SecEdgar8kRequestPlanInput,
} from "../../src/domain/intelligence/sec-edgar-8k-event-source-qualification";

const at="2026-09-30T07:17:32.000Z";
const sourceEvidence=[
  {url:"https://www.sec.gov/search-filings/edgar-application-programming-interfaces",title:"EDGAR Application Programming Interfaces (APIs)",checkedAt:at,classification:"DOCUMENTED",claims:["CIK_ACCESSION_FORM_IDENTITY","SUBMISSIONS_HISTORY_BULK","TIMESTAMP_FIELDS"].sort()},
  {url:"https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data",title:"Accessing EDGAR Data",checkedAt:at,classification:"DOCUMENTED",claims:["ARCHIVE_INDEX_CORRECTIONS","ACCESSION_AND_CIK","FAIR_ACCESS_USER_AGENT"].sort()},
  {url:"https://www.sec.gov/files/about/secrss.shtml",title:"RSS Feeds",checkedAt:at,classification:"DOCUMENTED",claims:["RSS_FILTERS_DISCOVERY_ONLY" ]},
  {url:"https://www.sec.gov/divisions/corpfin/forms/8-k.htm",title:"Form 8-K",checkedAt:at,classification:"DOCUMENTED",claims:["FORM_8K_ITEM_SEMANTICS"]},
];
function fixture(status:"QUALIFIED"|"PARTIAL"|"BLOCKED"|"INVALID"="PARTIAL"){
  const approvals=[...SEC_EDGAR_8K_USAGES].map(usage=>({usage,status:status==="QUALIFIED"?"APPROVED":"NOT_APPROVED"})).sort((a,b)=>a.usage.localeCompare(b.usage));
  const raw={
    contractVersion:SEC_EDGAR_8K_QUALIFICATION_VERSION,sourceId:SEC_EDGAR_8K_SOURCE_ID,sourceKind:"REGULATORY_FILING",authorityTier:"REGULATORY_PRIMARY",status,
    jurisdiction:"US",regulator:"US_SEC",supportedRegistrantClass:"SEC_EDGAR_FILERS",supportedForms:["8-K","8-K/A"],unsupportedSeparateScopes:["10-K","10-Q","6-K","REGISTRATION_STATEMENTS"],
    endpoints:SEC_EDGAR_8K_ENDPOINT_PROFILES,hostnameAllowlist:["data.sec.gov","www.sec.gov"],
    requestPolicy:{protocol:"https:",method:"GET",authentication:"NONE",maxRequestsPerSecond:10,userAgentPolicy:"IDENTIFIABLE_ORGANIZATION_AND_CONTACT",concurrency:1,redirects:"SAME_ALLOWLISTED_HOST_ONLY",timeoutMsMax:30000,responseBytesMax:25*1024*1024,pageCountMax:100,fileCountMax:100,attemptsMax:3,retryBaseDelayMs:1000,retryMaxDelayMs:8000,retryStatuses:[429,503],backoff:"DETERMINISTIC_CAPPED_EXPONENTIAL",rawBodyLogging:"FORBIDDEN"},
    paginationUpdateSemantics:["CURRENT_ROWS_PLUS_REFERENCED_HISTORY_FILES","RSS_IS_DISCOVERY_ONLY","SUBMISSIONS_API_UPDATES_DURING_DAY"],
    historyBulkAvailability:["AT_LEAST_ONE_YEAR_OR_1000_FILINGS","NIGHTLY_SUBMISSIONS_ZIP_APPROX_0300_ET","REFERENCED_HISTORICAL_SUBMISSION_FILES"],
    stableIdentityFields:["ACCESSION_DASHED_AND_DIGITS","CIK_ZERO_PADDED_10","DOCUMENT_SEQUENCE_AND_TYPE","FILING_INDEX_LOCATOR","FORM_TYPE","PRIMARY_DOCUMENT_FILENAME","REGISTRANT_IDENTITY_FROM_HEADER"],
    timestampFields:["ACCEPTANCE_DATETIME","EXPECTED_CLOSING_SEPARATE","FILING_DATE","PUBLICATION_DISCOVERY_TIME_SEPARATE","REPORT_DATE_OR_PERIOD","SIGNING_AND_COMPLETION_SEPARATE","SYSTEM_RECEIVED_AT"],
    documentDiscovery:["ACCESSION_BOUND_FILING_INDEX","EXHIBITS_FROM_INDEX","PRIMARY_DOCUMENT_FROM_INDEX"],amendmentSupersessionPolicy:"APPEND_ONLY_LINK_ORIGINAL",
    completeness:status==="QUALIFIED"?"PROVEN_FOR_SCOPE":"PARTIAL",latency:"DOCUMENTED_TYPICAL_NOT_GUARANTEED",correctionRetraction:"VERSIONED_WITH_KNOWN_LIMITS",
    rawStorage:status==="QUALIFIED"?"APPROVED":"NOT_APPROVED",normalizedStorage:status==="QUALIFIED"?"APPROVED":"NOT_APPROVED",approvals,retention:status==="QUALIFIED"?"APPROVED":"NOT_APPROVED",redistribution:status==="QUALIFIED"?"APPROVED":"NOT_APPROVED",commercialUse:status==="QUALIFIED"?"APPROVED":"NOT_APPROVED",
    evidence:sourceEvidence.map(e=>({...e,claims:[...e.claims]})),blockers:status==="QUALIFIED"?[]:["COVERAGE_NOT_PROVEN","USAGE_APPROVALS_REQUIRED"].sort(),reviewedAt:at,effectiveFrom:at,expiresAt:"2027-09-30T07:17:32.000Z",recordedAt:at,
    qualificationId:"",fingerprint:"",
  };
  const material={...raw,evidence:[...raw.evidence].sort((a,b)=>a.url.localeCompare(b.url))};Reflect.deleteProperty(material,"recordedAt");Reflect.deleteProperty(material,"qualificationId");Reflect.deleteProperty(material,"fingerprint");
  raw.fingerprint=canonicalSha256(material);raw.qualificationId=`sec-edgar-8k-qualification:${raw.fingerprint}`;return raw;
}
const ready=()=>{const parsed=parseSecEdgar8kQualification(fixture());if(parsed.status!=="VALID")throw new Error("synthetic fixture invalid");return parsed.qualification;};
const request=(overrides:Record<string,unknown>={})=>({profileId:"PRIMARY_DOCUMENT",form:"8-K",cik:"0000123456",accession:"0000320193-26-000001",documentFilename:"form8-k.htm",userAgentIdentityRef:"approved-identity:sec-contact-review",now:at,timeoutMs:30000,maxResponseBytes:25*1024*1024,pageCount:1,fileCount:10,attempts:3,redirectHost:"www.sec.gov",approvals:[...SEC_EDGAR_8K_USAGES].sort(),...overrides});

describe("SEC EDGAR 8-K source qualification",()=>{
  it("strictly parses, fingerprints and deep-freezes a complete synthetic qualification",()=>{
    const raw=fixture();const parsed=parseSecEdgar8kQualification(raw);expect(parsed.status).toBe("VALID");if(parsed.status!=="VALID")return;
    const later=parseSecEdgar8kQualification({...raw,recordedAt:"2026-10-01T00:00:00.000Z"});expect(later.status).toBe("VALID");if(later.status==="VALID")expect(parsed.qualification.fingerprint).toBe(later.qualification.fingerprint);
    expect(isAuthenticSecEdgar8kQualification(parsed.qualification)).toBe(true);expect(isAuthenticSecEdgar8kQualification({...parsed.qualification})).toBe(false);expect(isAuthenticSecEdgar8kQualification(JSON.parse(JSON.stringify(parsed.qualification)))).toBe(false);
    expect(Object.isFrozen(parsed.qualification)).toBe(true);expect(Object.isFrozen(parsed.qualification.requestPolicy.retryStatuses)).toBe(true);expect(Object.isFrozen(parsed.qualification.endpoints[0].requestHeaders)).toBe(true);expect(Object.isFrozen(parsed.qualification.approvals[0])).toBe(true);expect(Object.isFrozen(parsed.qualification.evidence[0].claims)).toBe(true);
  });
  it("rejects unsafe object and array shapes, duplicates, URL identifiers and malformed scope",()=>{
    const x=fixture();expect(parseSecEdgar8kQualification({...x,extra:true}).status).toBe("INVALID");expect(parseSecEdgar8kQualification(Object.assign(Object.create({inherited:true}),x)).status).toBe("INVALID");expect(parseSecEdgar8kQualification({...x,[Symbol("hidden")]:1}).status).toBe("INVALID");
    const getter={...x};Object.defineProperty(getter,"recordedAt",{get:()=>at});expect(parseSecEdgar8kQualification(getter).status).toBe("INVALID");expect(parseSecEdgar8kQualification(Object.assign(Object.create(null),x)).status).toBe("INVALID");
    Object.defineProperty(Object.prototype,"secQualificationPollutionFixture",{value:true,configurable:true});try{expect(parseSecEdgar8kQualification(x).status).toBe("INVALID");}finally{Reflect.deleteProperty(Object.prototype,"secQualificationPollutionFixture");}
    Object.defineProperty(Array.prototype,"secQualificationPollutionFixture",{value:true,configurable:true});try{expect(parseSecEdgar8kQualification(x).status).toBe("INVALID");}finally{Reflect.deleteProperty(Array.prototype,"secQualificationPollutionFixture");}expect(parseSecEdgar8kQualification(x).status).toBe("VALID");
    expect(parseSecEdgar8kQualification({...x,supportedForms:["8-K","8-K","8-K/A"]}).status).toBe("INVALID");expect(parseSecEdgar8kQualification({...x,stableIdentityFields:["ticker","https://sec.gov/x"]}).status).toBe("INVALID");
    const unsafe=Object.setPrototypeOf([...x.supportedForms],{polluted:true});expect(parseSecEdgar8kQualification({...x,supportedForms:unsafe}).status).toBe("INVALID");
    const badEndpoint=x.endpoints.map((e:typeof SEC_EDGAR_8K_ENDPOINT_PROFILES[number])=>({...e,hostname:"example.com"}));expect(parseSecEdgar8kQualification({...x,endpoints:badEndpoint}).status).toBe("INVALID");
    expect(parseSecEdgar8kQualification({...x,supportedForms:["6-K","8-K"]}).status).toBe("INVALID");expect(parseSecEdgar8kQualification({...x,requestPolicy:{...x.requestPolicy,method:"POST"}}).status).toBe("INVALID");
    expect(parseSecEdgar8kQualification({...x,approvals:[...x.approvals,...x.approvals.slice(0,1)]}).status).toBe("INVALID");expect(parseSecEdgar8kQualification({...x,evidence:[...x.evidence,x.evidence[0]]}).status).toBe("INVALID");
    expect(parseSecEdgar8kQualification({...x,requestPolicy:{...x.requestPolicy,userAgentPolicy:"GENERIC"}}).status).toBe("INVALID");expect(parseSecEdgar8kQualification({...x,requestPolicy:{...x.requestPolicy,retryStatuses:[503,429]}}).status).toBe("INVALID");
    const weakQualified=fixture("QUALIFIED");weakQualified.evidence[0].classification="UNKNOWN";weakQualified.fingerprint="";weakQualified.qualificationId="";const weakMaterial={...weakQualified,evidence:[...weakQualified.evidence].sort((a,b)=>a.url.localeCompare(b.url))};Reflect.deleteProperty(weakMaterial,"recordedAt");Reflect.deleteProperty(weakMaterial,"qualificationId");Reflect.deleteProperty(weakMaterial,"fingerprint");weakQualified.fingerprint=canonicalSha256(weakMaterial);weakQualified.qualificationId=`sec-edgar-8k-qualification:${weakQualified.fingerprint}`;expect(parseSecEdgar8kQualification(weakQualified).status).toBe("INVALID");
  });
  it("binds canonical filing identity to CIK/accession/form, not ticker, filename or discovery channel",()=>{
    const id=secEdgarFilingIdentity("0000123456","0000320193-26-000001","8-K");expect(id).toBe("sec-edgar-filing:0000123456:0000320193-26-000001:8-K");expect(secEdgarAccessionDigits("0000320193-26-000001")).toBe("000032019326000001");expect(secEdgarAccessionDigits("broken")).toBeNull();
    expect(secEdgarFilingIdentity("123456","0000320193-26-000001","8-K")).toBeNull();expect(secEdgarFilingIdentity("0000000000","0000320193-26-000001","8-K")).toBeNull();expect(secEdgarFilingIdentity("12345678901","0000320193-26-000001","8-K")).toBeNull();expect(secEdgarFilingIdentity("0000123456","bad","8-K")).toBeNull();expect(secEdgarFilingIdentity("0000123456","0000320193-26-000001/../x","8-K")).toBeNull();expect(secEdgarFilingIdentity("0000123456","0000320193-26-000001","6-K")).toBeNull();
    expect(secEdgarFilingIdentity("0000123456","0000320193-26-000001","8-K")).toBe(secEdgarFilingIdentity("0000123456","0000320193-26-000001","8-K"));
    expect(secEdgarFilingIdentity("ticker-A","0000320193-26-000001","8-K")).toBeNull();expect(secEdgarFilingIdentity("0000000000","0000320193-26-000001","8-K")).toBeNull();expect(secEdgarFilingIndexPath("0000123456","0000320193-26-000001","8-K")).toBe("/Archives/edgar/data/123456/000032019326000001/0000320193-26-000001-index.htm");
  });
  it("models 8-K agreement versus consummation and keeps all filing/event times distinct",()=>{
    expect(SEC_8K_ITEM_SEMANTICS["1.01"].completionProven).toBe(false);expect(SEC_8K_ITEM_SEMANTICS["2.01"].completionProven).toBe(true);
    const times={filingDate:"2026-01-02",reportDate:"2026-01-01",acceptanceAt:"2026-01-02T08:00:00Z",signedAt:"2026-01-01T18:00:00Z",completionAt:"2026-01-03T10:00:00Z",receivedAt:"2026-01-02T08:00:02Z"};expect(new Set(Object.values(times)).size).toBe(6);
    expect(fixture().supportedForms).toEqual(["8-K","8-K/A"]);expect(fixture().unsupportedSeparateScopes).toContain("6-K");
    const amendment:SecEdgar8kAmendmentLineageDesign={originalFilingIdentity:secEdgarFilingIdentity("0000123456","0000320193-26-000001","8-K")!,amendmentFilingIdentity:secEdgarFilingIdentity("0000123456","0000320193-26-000002","8-K/A")!,relation:"AMENDS_OR_CORRECTS",originalMetadataFingerprint:"original-metadata-fp",amendmentMetadataFingerprint:"amended-metadata-fp",originalDocumentFingerprints:["original-doc-fp"],amendmentDocumentFingerprints:["amended-doc-fp"],originalRetained:true};expect(amendment.originalFilingIdentity).not.toBe(amendment.amendmentFilingIdentity);expect(amendment.originalRetained).toBe(true);expect(amendment.originalMetadataFingerprint).not.toBe(amendment.amendmentMetadataFingerprint);
  });
  it("fails closed until an independently reviewed QUALIFIED fingerprint is pinned",()=>{
    const q=ready();expect(parseSecEdgar8kQualification(fixture("QUALIFIED")).status).toBe("INVALID");const plan=createSecEdgar8kRequestPlan(q,request() as unknown as SecEdgar8kRequestPlanInput);expect(plan).toBeNull();expect(isAuthenticSecEdgar8kRequestPlan(plan)).toBe(false);
    const history=createSecEdgar8kRequestPlan(q,request({profileId:"SUBMISSIONS_HISTORY_JSON",documentFilename:"CIK0000123456-submissions-001.json",redirectHost:"data.sec.gov"}) as unknown as SecEdgar8kRequestPlanInput);expect(history).toBeNull();
    expect(isAuthenticSecEdgar8kRequestPlan({...plan!})).toBe(false);expect(isAuthenticSecEdgar8kRequestPlan(JSON.parse(JSON.stringify(plan)))).toBe(false);
    const amendment=createSecEdgar8kRequestPlan(q,request({form:"8-K/A"}) as unknown as SecEdgar8kRequestPlanInput);expect(amendment).toBeNull();
    for(const bad of [{form:"6-K"},{cik:"ticker"},{cik:"123456"},{cik:"0000000000"},{cik:"12345678901"},{cik:""},{accession:"broken"},{accession:""},{accession:"0000320193-26-000001/../x"},{profileId:"LATEST_FILINGS_RSS",redirectHost:"attacker.invalid"},{profileId:"SUBMISSIONS_BULK_ZIP",redirectHost:"www.sec.gov"},{profileId:"SUBMISSIONS_HISTORY_JSON",documentFilename:"CIK0000999999-submissions-001.json",redirectHost:"data.sec.gov"},{redirectHost:"data.sec.gov"},{userAgentIdentityRef:"generic"},{timeoutMs:30001},{maxResponseBytes:30*1024*1024},{pageCount:101},{fileCount:101},{attempts:4},{approvals:["ACQUISITION"]},{documentFilename:"../secrets"}])expect(createSecEdgar8kRequestPlan(q,request(bad) as unknown as SecEdgar8kRequestPlanInput)).toBeNull();
    expect(createSecEdgar8kRequestPlan({...q},request() as unknown as SecEdgar8kRequestPlanInput)).toBeNull();for(const status of ["PARTIAL","BLOCKED","INVALID"] as const){const parsed=parseSecEdgar8kQualification(fixture(status));expect(parsed.status).toBe("VALID");if(parsed.status==="VALID")expect(createSecEdgar8kRequestPlan(parsed.qualification,request() as unknown as SecEdgar8kRequestPlanInput)).toBeNull();}
    const badRequest={...request()};Object.defineProperty(badRequest,"cik",{get:()=>"0000123456"});expect(createSecEdgar8kRequestPlan(q,badRequest as unknown as SecEdgar8kRequestPlanInput)).toBeNull();
    let coercionObserved=false;const maliciousNow={toString:()=>{coercionObserved=true;return at;}};expect(createSecEdgar8kRequestPlan(q,request({now:maliciousNow}) as unknown as SecEdgar8kRequestPlanInput)).toBeNull();expect(coercionObserved).toBe(false);
  });
  it("keeps the production decision blocked and has no transport or persistence contract",()=>{
    const config=JSON.parse(readFileSync(new URL("../../config/intelligence/sec-edgar-8k-source-qualification.production.json",import.meta.url),"utf8"));expect(config.qualificationStatus).toBe("PARTIAL");expect(config.selectedAcquisitionProfile).toBeNull();expect(config.productionAcquisition).toBe("BLOCKED");expect(config.authorityPersistence).toBe("NOT_APPROVED");expect(Object.values(config.approvals).every((x)=>x==="NOT_APPROVED")).toBe(true);expect(config.scheduler).toBe("BLOCKED");expect(config.eventExtraction).toBe("BLOCKED");expect(config.sourceMapping).toBeNull();expect(config.blockers.length).toBeGreaterThan(0);expect(Object.values(SEC_EDGAR_8K_PRODUCTION_DECISION.approvals).every((x)=>x==="NOT_APPROVED")).toBe(true);
    expect(SEC_EDGAR_8K_ENDPOINT_PROFILES.every((e:typeof SEC_EDGAR_8K_ENDPOINT_PROFILES[number])=>e.protocol==="https:"&&e.method==="GET"&&e.authentication==="NONE")).toBe(true);
  });
});
