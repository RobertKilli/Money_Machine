/* eslint-disable @typescript-eslint/no-explicit-any -- strict unknown-object validation needs indexed runtime access. */
import "server-only";
import { types as utilTypes } from "node:util";
import { canonicalSha256 } from "./ingestion-provenance";
import { isAuthenticMappedNonAuthoritativeEventClaim, type MappedNonAuthoritativeEventClaim } from "./event-intelligence-mapping-authority";
import { isAuthenticSecEdgar8kFixtureClaim, type SecEdgar8kFixtureClaim } from "./sec-edgar-8k-fixture-claim-pipeline";

export const EVENT_CORROBORATION_POLICY_VERSION = "event-intelligence-corroboration-authority-policy/v1" as const;
export const EVENT_SOURCE_ORIGIN_VERSION = "event-intelligence-source-origin/v1" as const;
export const EVENT_AUTHORITY_ELIGIBILITY_RESULT_VERSION = "event-intelligence-authority-eligibility-result/v1" as const;
export const EVENT_CORROBORATION_PRODUCTION_CONFIG_VERSION = "event-intelligence-corroboration-production-config/v1" as const;
export type AuthoritySubject = "ISSUER_DISCLOSURE" | "EXTERNALLY_VERIFIED_EVENT_FACT";
export type CorroborationPolicyStatus = "ACTIVE" | "INACTIVE" | "SUPERSEDED" | "REVOKED" | "INVALID";
export type SourceTier = "REGULATORY_FILING" | "ISSUER_CONTROLLED" | "ISSUER_ATTRIBUTED_NEWSWIRE" | "EXCHANGE_REGULATOR" | "INDEPENDENT_JOURNALISM" | "AGGREGATOR_DISCOVERY";
export type EventPolicy = Readonly<{
  contractVersion: typeof EVENT_CORROBORATION_POLICY_VERSION; policyId: string; fingerprint: string;
  status: CorroborationPolicyStatus; authoritySubject: AuthoritySubject; jurisdiction: string;
  supportedEventTypes: readonly string[]; supportedLifecycleStatuses: readonly string[]; requiredSourceTiers: readonly SourceTier[];
  minimumIndependentOriginGroups: number; minimumSourceArtifacts: number; requirePrimarySource: boolean;
  requireMappedIssuer: boolean; requireMappedAsset: boolean; requireExactEventScope: boolean;
  amountPolicy: "EXACT_OR_EXPLICIT_CLASS"; currencyPolicy: "EXACT_OR_UNKNOWN";
  temporalCutoffPolicy: "PUBLICATION_NOT_AFTER_AS_OF"; correctionPolicy: "APPEND_ONLY_COMPLETE_LINEAGE";
  conflictPolicy: "FAIL_CLOSED_NO_VOTING"; rumorPolicy: "NEVER_ELIGIBLE"; discoveryPolicy: "DISCOVERY_ONLY";
  maxEvidenceAgeSeconds: number; reviewedAt: string; effectiveFrom: string; expiresAt: string;
  evidenceReferences: readonly Readonly<{ referenceId: string; fingerprint: string }>[];
  approvals: Readonly<{ rawAcquisition: "APPROVED" | "NOT_APPROVED"; rawStorage: "APPROVED" | "NOT_APPROVED"; normalizedStorage: "APPROVED" | "NOT_APPROVED"; derivedUse: "APPROVED" | "NOT_APPROVED"; retention: "APPROVED" | "NOT_APPROVED"; redistribution: "APPROVED" | "NOT_APPROVED"; commercialUse: "APPROVED" | "NOT_APPROVED" }>;
  blockers: readonly string[]; recordedAt: string;
}>;
export type EventSourceOrigin = Readonly<{
  contractVersion: typeof EVENT_SOURCE_ORIGIN_VERSION; originId: string; fingerprint: string;
  kind: "REGULATORY_FILING" | "ISSUER_PUBLICATION" | "ISSUER_ATTRIBUTED_NEWSWIRE" | "EXCHANGE_REGULATOR_PUBLICATION" | "INDEPENDENT_JOURNALISM" | "AGGREGATOR_COPY";
  publisherId: string; originatingAuthorityId: string; sourceArtifactId: string; sourceArtifactFingerprint: string;
  canonicalPublicationId: string; upstreamPublicationId: string | null; lineageKnown: boolean;
  sourceTier: SourceTier; issuerId: string; publicationAt: string; receivedAt: string;
  correctionStatus: "ACTIVE" | "CORRECTED" | "RETRACTED"; correctsOriginId: string | null;
  deliveryPath: "RSS" | "SUBMISSIONS" | "ARCHIVE" | "IR" | "WIRE" | "ARTICLE" | "AGGREGATOR";
}>;
export type EventClaimEvidence = Readonly<{ mappedClaim: MappedNonAuthoritativeEventClaim; sourceClaim: SecEdgar8kFixtureClaim; rumor: boolean }>;
export type SealedCorroborationInputSet = Readonly<{ contractVersion: "event-intelligence-corroboration-input-set/v1"; fingerprint: string; claims: readonly EventClaimEvidence[]; origins: readonly EventSourceOrigin[] }>;
export type EligibilityStatus = "ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY" | "INCOMPLETE" | "CONFLICT" | "CORRECTED" | "RETRACTED" | "UNSUPPORTED_AUTHORITY_SUBJECT" | "INVALID";
export type EventAuthorityEligibilityResult = Readonly<{
  contractVersion: typeof EVENT_AUTHORITY_ELIGIBILITY_RESULT_VERSION; classification: "EVENT_AUTHORITY_ELIGIBILITY_RESULT";
  resultId: string; fingerprint: string; status: EligibilityStatus; authoritySubject: AuthoritySubject;
  policyId: string; policyFingerprint: string; evaluationAsOf: string; inputSetFingerprint: string;
  claimIds: readonly string[]; claimFingerprints: readonly string[]; originIds: readonly string[]; originFingerprints: readonly string[];
  independentOriginGroups: readonly string[]; canonicalIssuerId: string | null; canonicalAssetId: string | null; canonicalRepresentationId: string | null;
  eventType: string | null; lifecycleStatus: string | null; selectedCurrentClaimId: string | null;
  correctionLineage: readonly string[]; blockers: readonly string[]; conflicts: readonly string[]; evaluatedAt: string;
}>;

export const EVENT_INTELLIGENCE_CORROBORATION_PRODUCTION_CONFIG = Object.freeze({
  contractVersion: EVENT_CORROBORATION_PRODUCTION_CONFIG_VERSION, activePolicies: Object.freeze([]), sourceOrigins: Object.freeze([]), selectedAuthoritySubject: null,
  issuerDisclosureAuthority: "BLOCKED", externallyVerifiedFacts: "UNSUPPORTED", persistence: "BLOCKED", scheduler: "BLOCKED", signalGeneration: "BLOCKED", trading: "BLOCKED", approvals: "NOT_APPROVED",
});

const policyTrust = new WeakSet<object>(), originTrust = new WeakSet<object>(), claimEvidenceTrust = new WeakSet<object>(), inputSetTrust = new WeakSet<object>(), resultTrust = new WeakSet<object>();
const HEX = /^[0-9a-f]{64}$/; const ID = /^[A-Za-z][A-Za-z0-9:_-]{2,127}$/; const TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const P_KEYS = ["contractVersion","policyId","fingerprint","status","authoritySubject","jurisdiction","supportedEventTypes","supportedLifecycleStatuses","requiredSourceTiers","minimumIndependentOriginGroups","minimumSourceArtifacts","requirePrimarySource","requireMappedIssuer","requireMappedAsset","requireExactEventScope","amountPolicy","currencyPolicy","temporalCutoffPolicy","correctionPolicy","conflictPolicy","rumorPolicy","discoveryPolicy","maxEvidenceAgeSeconds","reviewedAt","effectiveFrom","expiresAt","evidenceReferences","approvals","blockers","recordedAt"];
const O_KEYS = ["contractVersion","originId","fingerprint","kind","publisherId","originatingAuthorityId","sourceArtifactId","sourceArtifactFingerprint","canonicalPublicationId","upstreamPublicationId","lineageKnown","sourceTier","issuerId","publicationAt","receivedAt","correctionStatus","correctsOriginId","deliveryPath"];
const OBJECT_KEYS=new Set<PropertyKey>(["constructor","__defineGetter__","__defineSetter__","hasOwnProperty","__lookupGetter__","__lookupSetter__","isPrototypeOf","propertyIsEnumerable","toLocaleString","toString","valueOf","__proto__"]);
const ARRAY_KEYS=new Set<PropertyKey>(["length","constructor","at","concat","copyWithin","fill","find","findIndex","findLast","findLastIndex","lastIndexOf","pop","push","reverse","shift","unshift","slice","sort","splice","includes","indexOf","join","keys","entries","values","forEach","filter","flat","flatMap","map","every","some","reduce","reduceRight","toLocaleString","toString","toReversed","toSorted","toSpliced","with",Symbol.iterator,Symbol.unscopables]);
function plain(x: unknown, keys: readonly string[]): x is Record<string, any> { try { if (!x || typeof x !== "object" || Array.isArray(x) || utilTypes.isProxy(x) || Object.getPrototypeOf(x)!==Object.prototype || Reflect.ownKeys(Object.prototype).some(k=>!OBJECT_KEYS.has(k))) return false; const own=Reflect.ownKeys(x); return own.length===keys.length && own.every(k=>typeof k==="string"&&keys.includes(k)&&!!Object.getOwnPropertyDescriptor(x,k)&&"value" in Object.getOwnPropertyDescriptor(x,k)!); } catch { return false; } }
function allowedObject(x:unknown,required:readonly string[],optional:readonly string[]=[]):boolean { try { if(!x||typeof x!=="object"||Array.isArray(x)||utilTypes.isProxy(x)||Object.getPrototypeOf(x)!==Object.prototype||Reflect.ownKeys(Object.prototype).some(k=>!OBJECT_KEYS.has(k))) return false; const own=Reflect.ownKeys(x); return required.every(k=>own.includes(k))&&own.every(k=>typeof k==="string"&&(required.includes(k)||optional.includes(k))&&!!Object.getOwnPropertyDescriptor(x,k)&&"value" in Object.getOwnPropertyDescriptor(x,k)!); } catch { return false; } }
function arr(x: unknown): x is unknown[] { try { return Array.isArray(x)&&!utilTypes.isProxy(x)&&Object.getPrototypeOf(x)===Array.prototype&&!Reflect.ownKeys(Array.prototype).some(k=>!ARRAY_KEYS.has(k))&&Reflect.ownKeys(x).length===x.length+1&&Array.from({length:x.length},(_,i)=>Object.hasOwn(x,i)).every(Boolean); } catch { return false; } }
function iso(x: unknown): x is string { return typeof x==="string"&&TIME.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x; }
function freeze<T>(x:T):T { if(x&&typeof x==="object"&&!Object.isFrozen(x)){ for(const v of Object.values(x as object)) freeze(v); Object.freeze(x); } return x; }
function digest(x:unknown):string { return canonicalSha256(x); }
function policyMaterial(x:Record<string,any>) { return Object.fromEntries(Object.entries(x).filter(([key])=>key!=="policyId"&&key!=="fingerprint"&&key!=="recordedAt")); }
const tiers: SourceTier[]=["REGULATORY_FILING","ISSUER_CONTROLLED","ISSUER_ATTRIBUTED_NEWSWIRE","EXCHANGE_REGULATOR","INDEPENDENT_JOURNALISM","AGGREGATOR_DISCOVERY"];

/** Create a reviewed policy. Parser output is intentionally untrusted; only this factory result can evaluate. */
export function createEventCorroborationPolicy(input: Omit<EventPolicy,"contractVersion"|"policyId"|"fingerprint"> & { contractVersion?: string; policyId?: string; fingerprint?: string }): EventPolicy {
  try {
    const x=input as any; const keys=[...P_KEYS];
    if(!allowedObject(x,keys.filter(k=>k!=="contractVersion"&&k!=="policyId"&&k!=="fingerprint"),["contractVersion","policyId","fingerprint"])) throw 0;
    if(x.contractVersion!==undefined&&x.contractVersion!==EVENT_CORROBORATION_POLICY_VERSION) throw 0;
    for(const k of ["supportedEventTypes","supportedLifecycleStatuses","requiredSourceTiers","evidenceReferences","blockers"]) if(!arr(x[k])) throw 0;
    if(x.status!=="ACTIVE"&&x.status!=="INACTIVE"&&x.status!=="SUPERSEDED"&&x.status!=="REVOKED"&&x.status!=="INVALID") throw 0;
    if(x.authoritySubject!=="ISSUER_DISCLOSURE"&&x.authoritySubject!=="EXTERNALLY_VERIFIED_EVENT_FACT") throw 0;
    if(!/^[A-Z]{2,3}$/.test(x.jurisdiction)||x.supportedEventTypes.length===0||x.supportedLifecycleStatuses.length===0||x.requiredSourceTiers.length===0) throw 0;
    for(const set of [x.supportedEventTypes,x.supportedLifecycleStatuses,x.requiredSourceTiers]) if(set.some((v:unknown)=>typeof v!=="string")||new Set(set).size!==set.length||[...set].sort().some((v,i)=>v!==set[i])) throw 0;
    if(x.requiredSourceTiers.every((tier:SourceTier)=>tier==="AGGREGATOR_DISCOVERY")||x.requirePrimarySource&&!x.requiredSourceTiers.some((tier:SourceTier)=>tier!=="AGGREGATOR_DISCOVERY")) throw 0;
    if(!Number.isSafeInteger(x.minimumIndependentOriginGroups)||x.minimumIndependentOriginGroups<1||!Number.isSafeInteger(x.minimumSourceArtifacts)||x.minimumSourceArtifacts<1||!Number.isSafeInteger(x.maxEvidenceAgeSeconds)||x.maxEvidenceAgeSeconds<1) throw 0;
    if(["requirePrimarySource","requireMappedIssuer","requireMappedAsset","requireExactEventScope"].some(k=>typeof x[k]!=="boolean")) throw 0;
    if(x.amountPolicy!=="EXACT_OR_EXPLICIT_CLASS"||x.currencyPolicy!=="EXACT_OR_UNKNOWN"||x.temporalCutoffPolicy!=="PUBLICATION_NOT_AFTER_AS_OF"||x.correctionPolicy!=="APPEND_ONLY_COMPLETE_LINEAGE"||x.conflictPolicy!=="FAIL_CLOSED_NO_VOTING"||x.rumorPolicy!=="NEVER_ELIGIBLE"||x.discoveryPolicy!=="DISCOVERY_ONLY") throw 0;
    if(!plain(x.approvals,["rawAcquisition","rawStorage","normalizedStorage","derivedUse","retention","redistribution","commercialUse"])||Object.values(x.approvals).some(v=>v!=="APPROVED"&&v!=="NOT_APPROVED")) throw 0;
    if(!arr(x.evidenceReferences)||x.evidenceReferences.length<1||x.evidenceReferences.some((r:any)=>!plain(r,["referenceId","fingerprint"])||!ID.test(r.referenceId)||!HEX.test(r.fingerprint))||new Set(x.evidenceReferences.map((r:any)=>r.referenceId)).size!==x.evidenceReferences.length) throw 0;
    if(!arr(x.blockers)||x.blockers.some((v:unknown)=>typeof v!=="string"||!ID.test(v))||new Set(x.blockers).size!==x.blockers.length) throw 0;
    if(!iso(x.reviewedAt)||!iso(x.effectiveFrom)||!iso(x.expiresAt)||!iso(x.recordedAt)||x.reviewedAt<x.effectiveFrom||x.expiresAt<=x.effectiveFrom) throw 0;
    // This first-slice policy cannot assert independently verified facts or approve persistence.
    if(x.authoritySubject==="EXTERNALLY_VERIFIED_EVENT_FACT"&&x.status==="ACTIVE") throw 0;
    if(x.status==="ACTIVE"&&(x.blockers.length!==0||Object.values(x.approvals).some(v=>v!=="APPROVED"))) throw 0;
    const evidence=[...x.evidenceReferences].sort((a:any,b:any)=>a.referenceId.localeCompare(b.referenceId));
    const body={contractVersion:EVENT_CORROBORATION_POLICY_VERSION,...x,evidenceReferences:evidence,blockers:[...x.blockers].sort()}; delete (body as any).policyId; delete (body as any).fingerprint;
    const fingerprint=digest(policyMaterial(body)), policyId=`event-policy:${fingerprint}`; if(x.policyId!==undefined&&x.policyId!==policyId||x.fingerprint!==undefined&&x.fingerprint!==fingerprint) throw 0;
    const result=freeze({...body,policyId,fingerprint}) as unknown as EventPolicy; policyTrust.add(result as object); return result;
  } catch { throw new Error("EVENT_CORROBORATION_POLICY_INVALID"); }
}
export function parseEventCorroborationPolicy(input: unknown): Readonly<{status:"VALID";policy:EventPolicy}|{status:"INVALID";blocker:"EVENT_CORROBORATION_POLICY_INVALID"}> {
  try { if(!allowedObject(input,P_KEYS)||(input as Record<string,unknown>).contractVersion!==EVENT_CORROBORATION_POLICY_VERSION) throw 0; const policy=createEventCorroborationPolicy(input as any); policyTrust.delete(policy as object); return Object.freeze({status:"VALID" as const,policy}); } catch { return Object.freeze({status:"INVALID" as const,blocker:"EVENT_CORROBORATION_POLICY_INVALID" as const}); }
}
export function isAuthenticEventCorroborationPolicy(x:unknown):x is EventPolicy { return !!x&&typeof x==="object"&&policyTrust.has(x as object); }

export function createEventSourceOrigin(input: Omit<EventSourceOrigin,"contractVersion"|"originId"|"fingerprint"> & { contractVersion?: string; originId?: string; fingerprint?: string }): EventSourceOrigin {
  try { const x=input as any; if(!plain(x,O_KEYS.filter(k=>!(["contractVersion","originId","fingerprint"] as string[]).includes(k)))&&!plain(x,O_KEYS)) throw 0; if(x.contractVersion!==undefined&&x.contractVersion!==EVENT_SOURCE_ORIGIN_VERSION) throw 0;
    if(!ID.test(x.publisherId)||!ID.test(x.originatingAuthorityId)||!ID.test(x.sourceArtifactId)||!HEX.test(x.sourceArtifactFingerprint)||!ID.test(x.canonicalPublicationId)||x.upstreamPublicationId!==null&&!ID.test(x.upstreamPublicationId)||!ID.test(x.issuerId)||!iso(x.publicationAt)||!iso(x.receivedAt)||x.receivedAt<x.publicationAt) throw 0;
    if(!["REGULATORY_FILING","ISSUER_PUBLICATION","ISSUER_ATTRIBUTED_NEWSWIRE","EXCHANGE_REGULATOR_PUBLICATION","INDEPENDENT_JOURNALISM","AGGREGATOR_COPY"].includes(x.kind)||!tiers.includes(x.sourceTier)||!["ACTIVE","CORRECTED","RETRACTED"].includes(x.correctionStatus)||!["RSS","SUBMISSIONS","ARCHIVE","IR","WIRE","ARTICLE","AGGREGATOR"].includes(x.deliveryPath)||typeof x.lineageKnown!=="boolean") throw 0;
    const expectedTier:Record<EventSourceOrigin["kind"],SourceTier>={REGULATORY_FILING:"REGULATORY_FILING",ISSUER_PUBLICATION:"ISSUER_CONTROLLED",ISSUER_ATTRIBUTED_NEWSWIRE:"ISSUER_ATTRIBUTED_NEWSWIRE",EXCHANGE_REGULATOR_PUBLICATION:"EXCHANGE_REGULATOR",INDEPENDENT_JOURNALISM:"INDEPENDENT_JOURNALISM",AGGREGATOR_COPY:"AGGREGATOR_DISCOVERY"};
    if(x.sourceTier!==expectedTier[x.kind as EventSourceOrigin["kind"]]) throw 0;
    if(x.kind==="AGGREGATOR_COPY"&&(x.sourceTier!=="AGGREGATOR_DISCOVERY"||!x.upstreamPublicationId||!x.lineageKnown)||x.kind==="ISSUER_ATTRIBUTED_NEWSWIRE"&&(!x.upstreamPublicationId||!x.lineageKnown)||x.correctionStatus!=="ACTIVE"&&!x.correctsOriginId) throw 0;
    const m={contractVersion:EVENT_SOURCE_ORIGIN_VERSION,...x}; delete (m as any).originId; delete (m as any).fingerprint; const identity={...m}; delete (identity as any).receivedAt; delete (identity as any).deliveryPath; const fingerprint=digest(identity), originId=`source-origin:${fingerprint}`;
    if(x.originId!==undefined&&x.originId!==originId||x.fingerprint!==undefined&&x.fingerprint!==fingerprint) throw 0;
    const out=freeze({...m,originId,fingerprint}) as EventSourceOrigin; originTrust.add(out as object); return out;
  } catch { throw new Error("EVENT_SOURCE_ORIGIN_INVALID"); }
}
export function isAuthenticEventSourceOrigin(x:unknown):x is EventSourceOrigin { return !!x&&typeof x==="object"&&originTrust.has(x as object); }

export function createEventClaimEvidence(mappedClaim: MappedNonAuthoritativeEventClaim, sourceClaim: SecEdgar8kFixtureClaim, rumor=false): EventClaimEvidence | null {
  if(!isAuthenticMappedNonAuthoritativeEventClaim(mappedClaim)||!isAuthenticSecEdgar8kFixtureClaim(sourceClaim)||mappedClaim.claimId!==sourceClaim.claimId||mappedClaim.claimFingerprint!==sourceClaim.fingerprint||mappedClaim.sourceArtifactId!==sourceClaim.sourceArtifactId||mappedClaim.sourceArtifactFingerprint!==sourceClaim.sourceArtifactFingerprint||typeof rumor!=="boolean") return null;
  const out=freeze({mappedClaim,sourceClaim,rumor}); claimEvidenceTrust.add(out as object); return out;
}
export function isAuthenticEventClaimEvidence(x:unknown):x is EventClaimEvidence { return !!x&&typeof x==="object"&&claimEvidenceTrust.has(x as object); }
export function sealEventCorroborationInputSet(claims: readonly EventClaimEvidence[], origins: readonly EventSourceOrigin[]): SealedCorroborationInputSet | null {
  if(!arr(claims)||claims.length===0||claims.length>128||!arr(origins)||origins.length===0||origins.length>256||claims.some(x=>!isAuthenticEventClaimEvidence(x))||origins.some(x=>!isAuthenticEventSourceOrigin(x))) return null;
  const cs=[...claims].sort((a,b)=>a.mappedClaim.fingerprint.localeCompare(b.mappedClaim.fingerprint)), os=[...new Map(origins.map(o=>[o.fingerprint,o])).values()].sort((a,b)=>a.fingerprint.localeCompare(b.fingerprint));
  if(new Set(cs.map(x=>x.mappedClaim.fingerprint)).size!==cs.length) return null;
  const material={contractVersion:"event-intelligence-corroboration-input-set/v1" as const,claims:cs,origins:os}; const out=freeze({...material,fingerprint:digest({contractVersion:material.contractVersion,claims:cs.map(x=>x.mappedClaim.fingerprint),origins:os.map(x=>x.fingerprint)})}); inputSetTrust.add(out as object); return out;
}

function originGroup(o:EventSourceOrigin):string {
  // All SEC access paths for an accession share the canonical publication id. Wire/IR derivatives share upstream id.
  if(o.kind==="ISSUER_ATTRIBUTED_NEWSWIRE"||o.kind==="AGGREGATOR_COPY") return `${o.originatingAuthorityId}:${o.upstreamPublicationId}`;
  return `${o.originatingAuthorityId}:${o.canonicalPublicationId}`;
}
function claimMaterial(c:SecEdgar8kFixtureClaim,m:MappedNonAuthoritativeEventClaim) { return {issuer:m.canonicalLegalEntityId,asset:m.canonicalRepresentationId,event:c.eventTypeCandidate,lifecycle:c.lifecycleStatusCandidate,form:c.form,item:c.itemCode,amountClass:c.amountClassification,amount:c.amount,currency:c.currency,binding:c.bindingStatus,signing:c.signingDate,completion:c.completionDate,expected:c.expectedClosingDate,correctionOf:c.correctionOfClaimId,extractor:c.extractionVersion}; }
export function compareEventClaims(a:EventClaimEvidence,b:EventClaimEvidence):"SAME_EVENT_SAME_CLAIM"|"SAME_EVENT_COMPATIBLE_CLAIM"|"SAME_EVENT_CONFLICTING_CLAIM"|"DIFFERENT_EVENT"|"INSUFFICIENT_IDENTITY"|"INVALID" {
  if(!isAuthenticEventClaimEvidence(a)||!isAuthenticEventClaimEvidence(b)) return "INVALID";
  const x=claimMaterial(a.sourceClaim,a.mappedClaim),y=claimMaterial(b.sourceClaim,b.mappedClaim);
  if(!x.issuer||!x.asset||!y.issuer||!y.asset) return "INSUFFICIENT_IDENTITY";
  // Matching descriptive fields do not identify a transaction. Only the same
  // immutable extracted claim or an explicit correction edge establishes that
  // two claims concern the same event in v1. This fixture grammar has no
  // independently extracted agreement reference, so do not infer one.
  if(a.sourceClaim.fingerprint===b.sourceClaim.fingerprint&&a.sourceClaim.claimId===b.sourceClaim.claimId) return "SAME_EVENT_SAME_CLAIM";
  const correctionRelated=a.sourceClaim.correctionOfClaimId===b.sourceClaim.claimId||b.sourceClaim.correctionOfClaimId===a.sourceClaim.claimId;
  if(!correctionRelated) {
    if(x.issuer!==y.issuer||x.asset!==y.asset||x.event!==y.event) return "DIFFERENT_EVENT";
    return "INSUFFICIENT_IDENTITY";
  }
  if(x.issuer!==y.issuer||x.asset!==y.asset||x.event!==y.event) return "DIFFERENT_EVENT";
  if(digest(x)===digest(y)) return "SAME_EVENT_COMPATIBLE_CLAIM";
  const sameScope=x.form===y.form&&x.item===y.item&&x.lifecycle===y.lifecycle&&x.binding===y.binding&&x.correctionOf===y.correctionOf;
  if(!sameScope) return "SAME_EVENT_CONFLICTING_CLAIM";
  const compared:[keyof typeof x,keyof typeof x][]=[["amountClass","amountClass"],["amount","amount"],["currency","currency"],["signing","signing"],["completion","completion"],["expected","expected"]];
  for(const [k] of compared) if(x[k]!==null&&y[k]!==null&&x[k]!==y[k]) return "SAME_EVENT_CONFLICTING_CLAIM";
  return "SAME_EVENT_COMPATIBLE_CLAIM";
}

function result(status:EligibilityStatus,policy:EventPolicy,asOf:string,set:SealedCorroborationInputSet, extra:Partial<EventAuthorityEligibilityResult>={}, evaluatedAt=asOf):EventAuthorityEligibilityResult {
  const claims=set.claims, origins=set.origins, c=claims[0];
  const correctionLineage=[...origins.filter(x=>x.correctsOriginId).map(x=>`${x.correctsOriginId}->${x.originId}`),...claims.filter(x=>x.sourceClaim.correctionOfClaimId).map(x=>`${x.sourceClaim.correctionOfClaimId}->${x.mappedClaim.claimId}`)].sort();
  const body={contractVersion:EVENT_AUTHORITY_ELIGIBILITY_RESULT_VERSION,classification:"EVENT_AUTHORITY_ELIGIBILITY_RESULT" as const,status,authoritySubject:policy.authoritySubject,policyId:policy.policyId,policyFingerprint:policy.fingerprint,evaluationAsOf:asOf,inputSetFingerprint:set.fingerprint,
    claimIds:claims.map(x=>x.mappedClaim.claimId),claimFingerprints:claims.map(x=>x.mappedClaim.claimFingerprint),originIds:origins.map(x=>x.originId),originFingerprints:origins.map(x=>x.fingerprint),independentOriginGroups:[...new Set(origins.filter(x=>x.kind!=="AGGREGATOR_COPY"&&x.kind!=="ISSUER_ATTRIBUTED_NEWSWIRE"&&x.lineageKnown).map(originGroup))].sort(),
    canonicalIssuerId:c?.mappedClaim.canonicalIssuerId??null,canonicalAssetId:c?.mappedClaim.canonicalAssetId??null,canonicalRepresentationId:c?.mappedClaim.canonicalRepresentationId??null,eventType:c?.sourceClaim.eventTypeCandidate??null,lifecycleStatus:c?.sourceClaim.lifecycleStatusCandidate??null,selectedCurrentClaimId:status==="ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY"?c?.mappedClaim.claimId??null:null,correctionLineage,blockers:[] as string[],conflicts:[] as string[],evaluatedAt,...extra};
  const identity={...body}; delete (identity as any).evaluatedAt; const fingerprint=digest(identity), out=freeze({...body,resultId:`event-eligibility:${fingerprint}`,fingerprint}); resultTrust.add(out as object); return out;
}
export function evaluateEventCorroboration(input:{policy:EventPolicy;asOf:string;inputSet:SealedCorroborationInputSet;evaluatedAt?:string}):EventAuthorityEligibilityResult {
  try {
    if(!(plain(input,["policy","asOf","inputSet"])||plain(input,["policy","asOf","inputSet","evaluatedAt"]))||!isAuthenticEventCorroborationPolicy(input.policy)||!policyTrust.has(input.policy as object)||!input.policy||!iso(input.asOf)||input.evaluatedAt!==undefined&&!iso(input.evaluatedAt)||!input.inputSet||!inputSetTrust.has(input.inputSet as object)) throw 0;
    const p=input.policy,s=input.inputSet,asOf=input.asOf;
    const evaluatedAt=input.evaluatedAt??asOf;
    if(p.authoritySubject!=="ISSUER_DISCLOSURE") return result("UNSUPPORTED_AUTHORITY_SUBJECT",p,asOf,s,{blockers:["AUTHORITY_SUBJECT_UNSUPPORTED"]},evaluatedAt);
    if(p.status==="INVALID") return result("INVALID",p,asOf,s,{blockers:["POLICY_INVALID"]},evaluatedAt);
    if(p.status!=="ACTIVE"||p.reviewedAt>asOf||p.effectiveFrom>asOf||p.expiresAt<=asOf||s.claims.length===0||s.origins.length===0) return result("INCOMPLETE",p,asOf,s,{blockers:["POLICY_OR_INPUT_NOT_ACTIVE"]},evaluatedAt);
    if(Object.values(p.approvals).some(v=>v!=="APPROVED")||p.blockers.length) return result("INCOMPLETE",p,asOf,s,{blockers:["POLICY_APPROVAL_OR_BLOCKER"]},evaluatedAt);
    const claimFps=new Set(s.claims.map(x=>x.mappedClaim.sourceArtifactFingerprint));
    const unlinked=s.origins.filter(o=>!claimFps.has(o.sourceArtifactFingerprint));
    if(s.claims.some(c=>!s.origins.some(o=>o.sourceArtifactId===c.mappedClaim.sourceArtifactId&&o.sourceArtifactFingerprint===c.mappedClaim.sourceArtifactFingerprint&&o.issuerId===c.mappedClaim.canonicalIssuerId))||unlinked.some(o=>o.correctionStatus==="ACTIVE"||!o.correctsOriginId||!s.origins.some(parent=>parent.originId===o.correctsOriginId))) return result("INCOMPLETE",p,asOf,s,{blockers:["SOURCE_ORIGIN_CLAIM_LINK_MISSING"]},evaluatedAt);
    // v1 accepts claims only from the synthetic SEC fixture pipeline. A caller
    // cannot relabel that same artifact as journalism, a wire, or an issuer
    // release to manufacture an independent origin group. Other source kinds
    // need their own authenticated artifact and claim contracts first.
    if(s.claims.some(c=>s.origins.some(o=>o.sourceArtifactFingerprint===c.mappedClaim.sourceArtifactFingerprint&&o.kind!=="REGULATORY_FILING"))||s.claims.some(c=>!s.origins.some(o=>o.sourceArtifactFingerprint===c.mappedClaim.sourceArtifactFingerprint&&o.kind==="REGULATORY_FILING"&&o.sourceTier==="REGULATORY_FILING"&&o.canonicalPublicationId===c.sourceClaim.accession))) return result("INCOMPLETE",p,asOf,s,{blockers:["ORIGIN_KIND_OR_PUBLICATION_NOT_BOUND_TO_CLAIM"]},evaluatedAt);
    if(s.origins.some(o=>o.publicationAt>asOf||Date.parse(asOf)-Date.parse(o.publicationAt)>p.maxEvidenceAgeSeconds*1000)) return result("INCOMPLETE",p,asOf,s,{blockers:["EVIDENCE_OUTSIDE_TEMPORAL_WINDOW"]},evaluatedAt);
    if(s.claims.some(c=>c.sourceClaim.acceptanceAt>asOf||!s.origins.some(o=>o.sourceArtifactFingerprint===c.mappedClaim.sourceArtifactFingerprint&&o.publicationAt>=c.sourceClaim.acceptanceAt))) return result("INCOMPLETE",p,asOf,s,{blockers:["FILING_NOT_AVAILABLE_AT_CUTOFF"]},evaluatedAt);
    const correctionTargets=s.origins.filter(o=>o.correctionStatus!=="ACTIVE").map(o=>o.correctsOriginId!).filter(Boolean);
    if(new Set(correctionTargets).size!==correctionTargets.length) return result("CONFLICT",p,asOf,s,{blockers:["CORRECTION_FORK"],conflicts:["MULTIPLE_CORRECTIONS_FOR_ORIGIN"]},evaluatedAt);
    if(correctionTargets.some(target=>!s.origins.some(o=>o.originId===target))) return result("INCOMPLETE",p,asOf,s,{blockers:["CORRECTION_LINEAGE_INCOMPLETE"]},evaluatedAt);
    if(s.claims.some(c=>c.sourceClaim.correctionOfClaimId!==null&&!s.claims.some(parent=>parent.mappedClaim.claimId===c.sourceClaim.correctionOfClaimId))) return result("INCOMPLETE",p,asOf,s,{blockers:["CLAIM_CORRECTION_LINEAGE_INCOMPLETE"]},evaluatedAt);
    if(s.origins.some(o=>o.correctionStatus==="RETRACTED")) return result("RETRACTED",p,asOf,s,{blockers:["PRIMARY_ORIGIN_RETRACTED"]},evaluatedAt);
    if(s.origins.some(o=>o.correctionStatus==="CORRECTED")) return result("CORRECTED",p,asOf,s,{blockers:["CORRECTION_REQUIRES_COMPLETE_CURRENT_LINEAGE"]},evaluatedAt);
    if(s.origins.some(o=>!o.lineageKnown)) return result("INCOMPLETE",p,asOf,s,{blockers:["ORIGIN_LINEAGE_UNKNOWN"]},evaluatedAt);
    if(s.claims.some(x=>x.rumor||x.sourceClaim.eventTypeCandidate==="PURCHASE_INTENT_ANNOUNCED"&&x.sourceClaim.lifecycleStatusCandidate==="COMPLETED")) return result("INCOMPLETE",p,asOf,s,{blockers:["RUMOR_OR_LIFECYCLE_UNSUPPORTED"]},evaluatedAt);
    if(s.origins.some(o=>o.kind==="AGGREGATOR_COPY")&&s.origins.every(o=>o.kind==="AGGREGATOR_COPY"||o.sourceTier==="AGGREGATOR_DISCOVERY")) return result("INCOMPLETE",p,asOf,s,{blockers:["DISCOVERY_ONLY_CANNOT_AUTHORIZE"]},evaluatedAt);
    const first=s.claims[0]!; const identityMismatch=s.claims.some(x=>x.mappedClaim.canonicalIssuerId!==first.mappedClaim.canonicalIssuerId||x.mappedClaim.canonicalLegalEntityId!==first.mappedClaim.canonicalLegalEntityId||x.mappedClaim.canonicalRepresentationId!==first.mappedClaim.canonicalRepresentationId||x.sourceClaim.eventTypeCandidate!==first.sourceClaim.eventTypeCandidate);
    if(identityMismatch) return result("CONFLICT",p,asOf,s,{blockers:["EVENT_SCOPE_MISMATCH"],conflicts:["ISSUER_ASSET_OR_EVENT_TYPE"]},evaluatedAt);
    for(let i=1;i<s.claims.length;i++) {
      const comparison=compareEventClaims(first,s.claims[i]!);
      if(comparison==="SAME_EVENT_CONFLICTING_CLAIM") return result("CONFLICT",p,asOf,s,{blockers:["CLAIM_CONFLICT"],conflicts:["MATERIAL_CLAIM_FIELDS"]},evaluatedAt);
      if(comparison==="INSUFFICIENT_IDENTITY"||comparison==="INVALID") return result("INCOMPLETE",p,asOf,s,{blockers:["EVENT_IDENTITY_INSUFFICIENT"]},evaluatedAt);
      if(comparison==="DIFFERENT_EVENT") return result("CONFLICT",p,asOf,s,{blockers:["MULTIPLE_EVENT_CANDIDATES"],conflicts:["DIFFERENT_EVENTS_IN_SEALED_SET"]},evaluatedAt);
    }
    if(s.claims.some(x=>!p.supportedEventTypes.includes(x.sourceClaim.eventTypeCandidate)||!p.supportedLifecycleStatuses.includes(x.sourceClaim.lifecycleStatusCandidate))) return result("INCOMPLETE",p,asOf,s,{blockers:["EVENT_OR_LIFECYCLE_NOT_SUPPORTED"]},evaluatedAt);
    if(s.claims.some(x=>x.sourceClaim.form!=="8-K"||x.sourceClaim.itemCode==="OTHER"||x.sourceClaim.eventTypeCandidate==="PURCHASE_COMPLETED"&&(x.sourceClaim.itemCode!=="2.01"||x.sourceClaim.completionDate===null||x.sourceClaim.completionDate>asOf.slice(0,10))||x.sourceClaim.eventTypeCandidate==="DEFINITIVE_PURCHASE_AGREEMENT"&&(x.sourceClaim.itemCode!=="1.01"||x.sourceClaim.bindingStatus!=="BINDING"||x.sourceClaim.completionDate!==null||x.sourceClaim.signingDate!==null&&x.sourceClaim.signingDate>asOf.slice(0,10)))) return result("INCOMPLETE",p,asOf,s,{blockers:["FORM_ITEM_LIFECYCLE_MATERIAL_MISMATCH"]},evaluatedAt);
    const groups=new Set(s.origins.filter(o=>o.kind!=="AGGREGATOR_COPY"&&o.kind!=="ISSUER_ATTRIBUTED_NEWSWIRE"&&o.sourceTier!=="AGGREGATOR_DISCOVERY").map(originGroup));
    const primary=s.origins.some(o=>o.kind==="REGULATORY_FILING"||o.kind==="ISSUER_PUBLICATION"||o.kind==="EXCHANGE_REGULATOR_PUBLICATION");
    if(p.requiredSourceTiers.some(t=>!s.origins.some(o=>o.sourceTier===t))||groups.size<p.minimumIndependentOriginGroups||new Set(s.origins.map(o=>o.sourceArtifactFingerprint)).size<p.minimumSourceArtifacts||p.requirePrimarySource&&!primary) return result("INCOMPLETE",p,asOf,s,{blockers:["CORROBORATION_THRESHOLD_NOT_MET"]},evaluatedAt);
    return result("ELIGIBLE_FOR_ISSUER_DISCLOSURE_AUTHORITY",p,asOf,s,{},evaluatedAt);
  } catch { return Object.freeze({contractVersion:EVENT_AUTHORITY_ELIGIBILITY_RESULT_VERSION,classification:"EVENT_AUTHORITY_ELIGIBILITY_RESULT",resultId:"",fingerprint:"",status:"INVALID",authoritySubject:"ISSUER_DISCLOSURE",policyId:"",policyFingerprint:"",evaluationAsOf:"",inputSetFingerprint:"",claimIds:Object.freeze([]),claimFingerprints:Object.freeze([]),originIds:Object.freeze([]),originFingerprints:Object.freeze([]),independentOriginGroups:Object.freeze([]),canonicalIssuerId:null,canonicalAssetId:null,canonicalRepresentationId:null,eventType:null,lifecycleStatus:null,selectedCurrentClaimId:null,correctionLineage:Object.freeze([]),blockers:Object.freeze(["CORROBORATION_INPUT_INVALID"]),conflicts:Object.freeze([]),evaluatedAt:""}); }
}
export function isAuthenticEventAuthorityEligibilityResult(x:unknown):x is EventAuthorityEligibilityResult { return !!x&&typeof x==="object"&&resultTrust.has(x as object); }
/** Eligibility is not authority and is never accepted as an event or persistence input. */
export function rejectEligibilityAsEventAuthorityOrPersistence(_value:unknown):null { void _value; return null; }
