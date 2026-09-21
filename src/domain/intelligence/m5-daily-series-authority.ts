import { canonicalSha256 } from "./ingestion-provenance";
import {
  deriveM5CryptoDailyMetrics,
  type DailyCloseObservationInput,
  type M5DerivationMaterial,
  type M5DailyDiagnosticCode,
} from "./m5-daily-derivations";

export const M5_DAILY_SERIES_AUTHORITY_VERSION = "m5-daily-series-authority/v1" as const;

export type M5DailySeriesObservationInput = Readonly<DailyCloseObservationInput & {
  ordinal: number;
  sourceArtifactId: string;
  sourceEnvelopeId: string;
  sourceObservationId: string;
  providerExternalRecordId: string;
  payloadFingerprint: string;
}>;

export type M5DailySeriesObservation = Readonly<M5DailySeriesObservationInput & { observationFingerprint: string }>;
export type M5DailySeriesDerivation = Readonly<M5DerivationMaterial & { authorityId: string }>;
export type M5DailySeriesAuthority = Readonly<{
  authorityId: string;
  contractVersion: typeof M5_DAILY_SERIES_AUTHORITY_VERSION;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  providerSourceNamespace: string;
  sourceLineageId: string;
  chainId: string;
  contractAddress: string;
  providerAssetIdentity: string;
  quoteUnit: string;
  priceScale: number;
  asOf: string;
  observations: readonly M5DailySeriesObservation[];
  sourceArtifactIds: readonly string[];
  sourceEnvelopeIds: readonly string[];
  sourceObservationIds: readonly string[];
  payloadFingerprints: readonly string[];
  observationCount: number;
  earliestObservedAt: string;
  latestObservedAt: string;
  availableAt: string;
  fingerprint: string;
  recordedAt: string;
}>;

export type M5DailySeriesResult =
  | Readonly<{ status: "READY"; authority: M5DailySeriesAuthority; historySpan: M5DailySeriesDerivation; volatility: M5DailySeriesDerivation }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly M5DailyDiagnosticCode[] }>;

const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
  }
  return value;
};
const SHA = /^[a-f0-9]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const nonblank = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= 256;
const timestamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && new Date(v).toISOString() === v;

function invalid(code: M5DailyDiagnosticCode): M5DailySeriesResult { return freeze({ status: "INVALID", diagnostics: [code] }); }

export function createM5DailySeriesAuthority(input: Readonly<{
  providerId: string; datasetId: string; datasetVersion: string; providerSourceNamespace: string;
  sourceLineageId: string; chainId: string; contractAddress: string; providerAssetIdentity: string;
  observations: readonly M5DailySeriesObservationInput[]; asOf: string; recordedAt: string;
}>): M5DailySeriesResult {
  if (![input.providerId, input.datasetId, input.datasetVersion, input.providerSourceNamespace, input.sourceLineageId, input.providerAssetIdentity].every(nonblank)) return invalid("M5_DAILY_SERIES_RANGE_INVALID");
  if (input.chainId !== "eip155:1" || !ADDRESS.test(input.contractAddress) || input.contractAddress !== input.contractAddress.toLowerCase()) return invalid("M5_DAILY_SERIES_RANGE_INVALID");
  if (!timestamp(input.asOf) || !timestamp(input.recordedAt)) return invalid("M5_DAILY_SERIES_TIME_INVALID");
  if (!Array.isArray(input.observations) || input.observations.length === 0) return freeze({ status: "INCOMPLETE", diagnostics: ["M5_DAILY_SERIES_EMPTY"] });
  const ids = new Set<string>(); const artifacts = new Set<string>(); const envelopes = new Set<string>(); const sourceObservations = new Set<string>(); const payloads = new Set<string>();
  const observations = [...input.observations].sort((a, b) => a.ordinal - b.ordinal);
  if (observations.some((o, i) => o.ordinal !== i || !nonblank(o.sourceArtifactId) || !nonblank(o.sourceEnvelopeId) || !nonblank(o.sourceObservationId) || !nonblank(o.providerExternalRecordId) || !SHA.test(o.payloadFingerprint) || ids.has(o.observationId) || artifacts.has(o.sourceArtifactId) || envelopes.has(o.sourceEnvelopeId) || sourceObservations.has(o.sourceObservationId) || payloads.has(o.payloadFingerprint))) return invalid("M5_DAILY_SERIES_RANGE_INVALID");
  for (const o of observations) { ids.add(o.observationId); artifacts.add(o.sourceArtifactId); envelopes.add(o.sourceEnvelopeId); sourceObservations.add(o.sourceObservationId); payloads.add(o.payloadFingerprint); }
  const daily: DailyCloseObservationInput[] = observations.map(o => ({ observationId: o.observationId, observedAt: o.observedAt, availableAt: o.availableAt, closeValue: o.closeValue, priceScale: o.priceScale, quoteUnit: o.quoteUnit }));
  const derived = deriveM5CryptoDailyMetrics(daily, input.asOf);
  if (derived.status !== "READY") return freeze({ status: derived.status, diagnostics: derived.diagnostics });
  const authorityAvailableAt = derived.historySpan.availableAt;
  const materialObservations = freeze(observations.map(o => freeze({ ...o, observationFingerprint: canonicalSha256({ contractVersion: M5_DAILY_SERIES_AUTHORITY_VERSION, sourceArtifactId: o.sourceArtifactId, sourceEnvelopeId: o.sourceEnvelopeId, sourceObservationId: o.sourceObservationId, providerExternalRecordId: o.providerExternalRecordId, payloadFingerprint: o.payloadFingerprint, observationId: o.observationId, ordinal: o.ordinal, observedAt: o.observedAt, availableAt: o.availableAt, closeValue: o.closeValue, priceScale: o.priceScale, quoteUnit: o.quoteUnit }) })));
  const body = { contractVersion: M5_DAILY_SERIES_AUTHORITY_VERSION, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, providerSourceNamespace: input.providerSourceNamespace, sourceLineageId: input.sourceLineageId, chainId: input.chainId, contractAddress: input.contractAddress, providerAssetIdentity: input.providerAssetIdentity, quoteUnit: derived.historySpan.quoteUnit, priceScale: derived.historySpan.priceScale, asOf: input.asOf, observations: materialObservations, sourceArtifactIds: materialObservations.map(o => o.sourceArtifactId), sourceEnvelopeIds: materialObservations.map(o => o.sourceEnvelopeId), sourceObservationIds: materialObservations.map(o => o.sourceObservationId), payloadFingerprints: materialObservations.map(o => o.payloadFingerprint), observationCount: materialObservations.length, earliestObservedAt: derived.historySpan.earliestObservedAt, latestObservedAt: derived.historySpan.latestObservedAt, availableAt: authorityAvailableAt };
  const fingerprint = canonicalSha256(body);
  const authority = freeze({ ...body, authorityId: canonicalSha256({ contractVersion: M5_DAILY_SERIES_AUTHORITY_VERSION, fingerprint }), fingerprint, recordedAt: input.recordedAt });
  const withAuthority = (m: M5DerivationMaterial): M5DailySeriesDerivation => freeze({ ...m, authorityId: authority.authorityId });
  return freeze({ status: "READY", authority, historySpan: withAuthority(derived.historySpan), volatility: withAuthority(derived.volatility) });
}

export function assertM5DailySeriesAuthority(value: M5DailySeriesAuthority): void {
  const rebuilt = createM5DailySeriesAuthority({ providerId: value.providerId, datasetId: value.datasetId, datasetVersion: value.datasetVersion, providerSourceNamespace: value.providerSourceNamespace, sourceLineageId: value.sourceLineageId, chainId: value.chainId, contractAddress: value.contractAddress, providerAssetIdentity: value.providerAssetIdentity, observations: value.observations, asOf: value.asOf, recordedAt: value.recordedAt });
  if (rebuilt.status !== "READY" || rebuilt.authority.authorityId !== value.authorityId || rebuilt.authority.fingerprint !== value.fingerprint) throw new Error("M5_DAILY_SERIES_AUTHORITY_FINGERPRINT_INVALID");
}
