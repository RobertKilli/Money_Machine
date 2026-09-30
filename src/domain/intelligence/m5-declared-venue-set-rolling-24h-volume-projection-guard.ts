import "server-only";
import { isAuthenticM5DeclaredVenueSetRolling24hVolumeQualification, type M5DeclaredVolumeQualification } from "./m5-declared-venue-set-rolling-24h-volume-source-qualification";

export type M5DeclaredVolumeMappingWitness = Readonly<{
  authorityId: string; fingerprint: string; canonicalAssetId: string; representation: string;
  chainId: string; revisionId: string; venueScopeFingerprint: string;
}>;
export type M5DeclaredVolumeProjectionRequest = Readonly<{
  qualification: M5DeclaredVolumeQualification;
  metricKind: "DECLARED_VENUE_SET_ROLLING_24H_VOLUME";
  scopedContractFingerprint: string; providerId: string; datasetId: string; datasetVersion: string;
  canonicalAssetId: string; representation: string; chainId: string; mappingRevisionId: string | null;
  quoteCurrency: string; volumeUnit: "BASE_ASSET" | "QUOTE_ASSET" | "QUOTE_NOTIONAL";
  windowStart: string; windowEnd: string; asOf: string; now: string;
  venueMembers: readonly Readonly<{ venueId: string; stableVenueId: string; instrumentId: string; baseAsset: string; quoteAsset: string; marketType: string; volumeUnit: string; windowStart: string; windowEnd: string; asOf: string; valueAtoms: string | null; currentOrIncomplete: boolean; finality: string }>[];
  mappingAuthority: M5DeclaredVolumeMappingWitness | null;
}>;
export type M5DeclaredVolumeProjection = Readonly<{ valueAtoms: string; scale: number; asOf: string; venueIds: readonly string[] }>;
const trustedMappings = new WeakSet<object>();
const exact24h = (start: string, end: string): boolean => {
  const a = Date.parse(start); const b = Date.parse(end);
  return Number.isFinite(a) && Number.isFinite(b) && b - a === 86_400_000;
};

/** Pure fail-closed projection boundary. This slice has no mapping-witness issuer. */
export function projectM5DeclaredVenueSetRolling24hVolume(request: M5DeclaredVolumeProjectionRequest): M5DeclaredVolumeProjection | null {
  try {
    const q = request.qualification;
    if (!isAuthenticM5DeclaredVenueSetRolling24hVolumeQualification(q) || q.status !== "QUALIFIED") return null;
    if (q.venueUniverse !== "EXPLICIT_SEALED_DECLARED" || q.venues.length === 0 || q.venues.some(v => v.venueCoverage !== "EXPLICIT_SEALED" || v.windowKind !== "ROLLING_EXACT_24H" || v.tradeCoverage !== "COMPLETE" || v.paginationTermination !== "PROVEN" || v.currentOrIncompleteIncluded || v.finality !== "FINAL" || v.volumeUnit === "UNKNOWN" || v.freshnessPolicy !== "max-age-1h") || q.currencyConversionPolicy !== "NONE") return null;
    if (request.metricKind !== q.metricKind || request.scopedContractFingerprint !== q.scopedMetricContractFingerprint || !/^[a-f0-9]{64}$/.test(request.scopedContractFingerprint)) return null;
    if (request.providerId !== q.providerId || request.datasetId !== q.datasetId || request.datasetVersion !== q.datasetVersion || request.canonicalAssetId !== q.canonicalAssetId || request.representation !== q.representation || request.chainId !== q.chainId || request.mappingRevisionId !== q.mappingRevisionId || request.quoteCurrency !== q.quoteCurrency || request.volumeUnit !== q.aggregationVolumeUnit) return null;
    if (!exact24h(request.windowStart, request.windowEnd) || request.windowEnd !== request.asOf || !exact24h(q.venues[0]?.windowStart ?? "", q.venues[0]?.windowEnd ?? "") || q.venues[0]?.windowEnd !== request.asOf) return null;
    const now = Date.parse(request.now); const asOf = Date.parse(request.asOf);
    if (!Number.isFinite(now) || !Number.isFinite(asOf) || asOf > now || now - asOf > 60 * 60 * 1000) return null;
    if (!Array.isArray(request.venueMembers) || request.venueMembers.length !== q.venues.length || request.venueMembers.length === 0) return null;
    const expected = q.venues.map(v => `${v.venueId}/${v.stableVenueId}/${v.instrumentId}`);
    const actual = request.venueMembers.map(v => `${v.venueId}/${v.stableVenueId}/${v.instrumentId}`);
    if (expected.some((x, i) => actual[i] !== x) || new Set(actual).size !== actual.length) return null;
    for (let i = 0; i < q.venues.length; i++) {
      const qv = q.venues[i]; const v = request.venueMembers[i];
      if (v.baseAsset !== qv.baseAsset || v.quoteAsset !== qv.quoteAsset || v.marketType !== qv.marketType || v.volumeUnit !== qv.volumeUnit || v.windowStart !== request.windowStart || v.windowEnd !== request.windowEnd || v.asOf !== request.asOf || v.currentOrIncomplete || v.finality !== "FINAL" || v.valueAtoms === null || !/^(0|[1-9][0-9]*)$/.test(v.valueAtoms)) return null;
    }
    if (!request.mappingAuthority || !trustedMappings.has(request.mappingAuthority) || request.mappingAuthority.canonicalAssetId !== q.canonicalAssetId || request.mappingAuthority.representation !== q.representation || request.mappingAuthority.chainId !== q.chainId || request.mappingAuthority.revisionId !== q.mappingRevisionId) return null;
    if ([...q.usageApprovals.map(a => a.approval), q.storageApproval, q.retentionApproval, q.redistributionApproval, q.commercialApproval].some(a => a !== "APPROVED")) return null;
    // A future separately reviewed authority may enable this result. None is issued in this qualification slice.
    return null;
  } catch { return null; }
}
