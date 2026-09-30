import { isAuthenticM5ReportedCapQualification } from "./m5-reported-circulating-market-cap-source-qualification";
import type { M5ReportedCapQualification } from "./m5-reported-circulating-market-cap-source-qualification";

const mappings = new WeakSet<object>();
export type M5ReportedCapMappingAuthority = Readonly<{ authorityId: string; fingerprint: string; canonicalAssetId: string; representation: string; chain: string; contractAddress: string; revisionId: string }>;
/** No mapping authority is issued by this qualification slice; only a future trusted resolver may register one. */
export type M5ReportedCapProjectionInput = Readonly<{ qualification: M5ReportedCapQualification; providerId: string; datasetId: string; datasetVersion: string; providerAssetId: string; chain: string; contractAddress: string; canonicalAssetId: string; representation: string; mappingRevisionId: string; metricScopeFingerprint: string; quoteCurrency: string; valueScale: number; metricKind: "REPORTED_CIRCULATING_MARKET_CAP"; reportedValueBasis: "PROVIDER_CALCULATED_CIRCULATING"; valueAtoms: string | null; supplyTimestamp: string; quoteTimestamp: string; effectiveAsOf: string; now: string; mappingAuthority: M5ReportedCapMappingAuthority | null }>;
const time=(x:unknown):x is string=>typeof x==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
export function projectM5ReportedCirculatingMarketCap(input: M5ReportedCapProjectionInput): Readonly<{ valueAtoms: string; asOf: string }> | null {
  try {
    const q=input.qualification; if(!isAuthenticM5ReportedCapQualification(q)||q.status!=="QUALIFIED"||!input.mappingAuthority||!mappings.has(input.mappingAuthority)) return null;
    if(q.providerId!==input.providerId||q.datasetId!==input.datasetId||q.datasetVersion!==input.datasetVersion||q.providerAssetId!==input.providerAssetId||q.chain!==input.chain||q.contractAddress!==input.contractAddress||q.expectedCanonicalAssetId!==input.canonicalAssetId||q.canonicalRepresentation!==input.representation||q.mappingRevisionId!==input.mappingRevisionId||q.metricScopeFingerprint!==input.metricScopeFingerprint||q.quoteCurrency!==input.quoteCurrency||q.valueScale!==input.valueScale||input.metricKind!==q.metricKind||input.reportedValueBasis!==q.reportedValueBasis) return null;
    if(!input.valueAtoms||!/^(0|[1-9][0-9]*)$/.test(input.valueAtoms)||q.reportedValueBasis!=="PROVIDER_CALCULATED_CIRCULATING"||q.supplyBasis!=="CIRCULATING") return null;
    if(!input.supplyTimestamp||input.supplyTimestamp!==input.quoteTimestamp||input.quoteTimestamp!==input.effectiveAsOf||q.providerValueTimestamp!==input.effectiveAsOf||q.supplyTimestamp!==input.supplyTimestamp||q.quoteTimestamp!==input.quoteTimestamp||q.effectiveAsOf!==input.effectiveAsOf) return null;
    if(!time(input.now)||!time(input.effectiveAsOf)||!time(input.supplyTimestamp)||!time(input.quoteTimestamp)||Date.parse(input.now)-Date.parse(input.effectiveAsOf)>60*60*1000||Date.parse(input.effectiveAsOf)>Date.parse(input.now)) return null;
    const m=input.mappingAuthority; if(m.canonicalAssetId!==q.expectedCanonicalAssetId||m.representation!==q.canonicalRepresentation||m.chain!==q.chain||m.contractAddress!==q.contractAddress||m.revisionId!==q.mappingRevisionId||m.fingerprint!==q.mappingRevisionFingerprint) return null;
    if(q.usageApprovals.length!==7||q.usageApprovals.some(a=>a.approval!=="APPROVED")||[q.storageApproval,q.retentionApproval,q.redistributionApproval,q.commercialApproval].some(a=>a!=="APPROVED")) return null;
    return Object.freeze({valueAtoms:input.valueAtoms,asOf:input.effectiveAsOf});
  } catch { return null; }
}
