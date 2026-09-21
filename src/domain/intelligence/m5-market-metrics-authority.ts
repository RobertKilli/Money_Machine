import { canonicalSha256 } from "./ingestion-provenance";

export const M5_MARKET_METRICS_AUTHORITY_VERSION = "m5-market-metrics-authority/v1" as const;
export type MarketMetricKind = "MARKET_CAP" | "VOLUME" | "LIQUIDITY";
export type MarketMetricUnit = "MINOR";

export type MarketSourceMaterial = Readonly<{
  metricKind: MarketMetricKind;
  sourceArtifactId: string;
  sourceEnvelopeId: string;
  sourceObservationId: string;
  providerExternalRecordId: string;
  payloadFingerprint: string;
  valueAtoms: bigint;
  scale: number;
  quoteCurrency: string;
  observedAt: string;
  availableAt: string;
  basis: string;
  windowStart?: string;
  windowEnd?: string;
  coverageVersion?: string;
  componentIds?: readonly string[];
  components?: readonly (Readonly<{ id: string; valueAtoms: bigint; scale: number; quoteCurrency: string }>)[];
}>;
export type MarketMetricDerivation = Readonly<{
  authorityId: string;
  metricKind: MarketMetricKind;
  valueAtoms: bigint;
  unit: MarketMetricUnit;
  scale: 0;
  quoteCurrency: string;
  basis: string;
  windowStart?: string;
  windowEnd?: string;
  coverageVersion?: string;
  materialIds: readonly string[];
  materialFingerprints: readonly string[];
  observedAt: string;
  availableAt: string;
  asOf: string;
  fingerprint: string;
}>;
export type M5MarketMetricsAuthority = Readonly<{
  authorityId: string;
  contractVersion: typeof M5_MARKET_METRICS_AUTHORITY_VERSION;
  providerId: string;
  datasetId: string;
  datasetVersion: string;
  sourceLineageId: string;
  asOf: string;
  quoteCurrency: string;
  currencyMinorUnitPolicy: string;
  marketCapBasis: string;
  volumeWindowBasis: string;
  liquidityCoverageBasis: string;
  materials: readonly MarketSourceMaterial[];
  derivations: readonly MarketMetricDerivation[];
  observedAt: string;
  effectiveAvailableAt: string;
  fingerprint: string;
  recordedAt: string;
}>;
export type M5MarketMetricsAuthorityAggregate = Readonly<{ authority: M5MarketMetricsAuthority; derivations: readonly [MarketMetricDerivation, MarketMetricDerivation, MarketMetricDerivation] }>;
export type M5MarketMetricsResult =
  | Readonly<{ status: "READY"; authority: M5MarketMetricsAuthority; derivations: readonly [MarketMetricDerivation, MarketMetricDerivation, MarketMetricDerivation] }>
  | Readonly<{ status: "INCOMPLETE" | "INVALID"; diagnostics: readonly string[] }>;

const SHA = /^[a-f0-9]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const freeze = <T>(v: T): T => { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); for (const child of Object.values(v as Record<string, unknown>)) freeze(child); } return v; };
const validTime = (v: unknown): v is string => typeof v === "string" && UTC.test(v) && new Date(v).toISOString() === v;
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && v.length <= 256;
const atoms = (v: unknown): v is bigint => typeof v === "bigint" && v >= 0n;
const pow10 = (n: number): bigint => 10n ** BigInt(n);
const minor = (value: bigint, scale: number): bigint => scale <= 2 ? value * pow10(2 - scale) : value / pow10(scale - 2);
const invalid = (code: string): M5MarketMetricsResult => freeze({ status: "INVALID", diagnostics: [code] });
const incomplete = (code: string): M5MarketMetricsResult => freeze({ status: "INCOMPLETE", diagnostics: [code] });

function validateMaterial(m: MarketSourceMaterial, expected: MarketMetricKind, asOf: string, currency: string): void {
  if (m.metricKind !== expected || !text(m.sourceArtifactId) || !text(m.sourceEnvelopeId) || !text(m.sourceObservationId) || !text(m.providerExternalRecordId) || !SHA.test(m.payloadFingerprint) || !atoms(m.valueAtoms) || !Number.isSafeInteger(m.scale) || m.scale < 0 || !text(m.quoteCurrency) || m.quoteCurrency !== currency || !validTime(m.observedAt) || !validTime(m.availableAt) || m.observedAt > m.availableAt || m.availableAt > asOf) throw new Error("M5_MARKET_MATERIAL_INVALID");
  if (!text(m.basis)) throw new Error("M5_MARKET_BASIS_INVALID");
  if (expected === "MARKET_CAP" && m.basis !== "MARKET_CAP_REPORTED") throw new Error("M5_MARKET_CAP_BASIS_INVALID");
  if (expected === "VOLUME" && (m.basis !== "ROLLING_24H_REPORTED" || !validTime(m.windowStart) || !validTime(m.windowEnd) || m.windowEnd! > asOf || m.windowStart! > m.windowEnd!)) throw new Error("M5_MARKET_VOLUME_WINDOW_INVALID");
  if (expected === "LIQUIDITY" && (!text(m.coverageVersion) || m.basis !== "COMPLETE_LIQUIDITY_UNIVERSE" || !m.componentIds || !m.components || m.componentIds.length < 2 || m.componentIds.length !== m.components.length || new Set(m.componentIds).size !== m.componentIds.length || new Set(m.components.map(c => c.id)).size !== m.components.length || m.components.some(c => !text(c.id) || !atoms(c.valueAtoms) || !Number.isSafeInteger(c.scale) || c.scale < 0 || c.quoteCurrency !== currency || !m.componentIds!.includes(c.id)))) throw new Error("M5_MARKET_LIQUIDITY_COVERAGE_INVALID");
}

export function createM5MarketMetricsAuthority(input: Readonly<{ providerId: string; datasetId: string; datasetVersion: string; sourceLineageId: string; asOf: string; quoteCurrency: string; materials: readonly MarketSourceMaterial[]; recordedAt: string }>): M5MarketMetricsResult {
  if (![input.providerId, input.datasetId, input.datasetVersion, input.sourceLineageId, input.quoteCurrency].every(text) || !validTime(input.asOf) || !validTime(input.recordedAt)) return invalid("M5_MARKET_SCOPE_INVALID");
  const expected: MarketMetricKind[] = ["MARKET_CAP", "VOLUME", "LIQUIDITY"];
  if (!Array.isArray(input.materials) || input.materials.length !== 3 || new Set(input.materials.map(m => m.metricKind)).size !== 3 || expected.some(kind => !input.materials.some(m => m.metricKind === kind))) return incomplete("M5_MARKET_MATERIAL_INCOMPLETE");
  const liquidityMaterial = input.materials.find(m => m.metricKind === "LIQUIDITY");
  if (!liquidityMaterial?.components || !liquidityMaterial.componentIds || liquidityMaterial.components.length < 2) return incomplete("M5_MARKET_LIQUIDITY_COVERAGE_INCOMPLETE");
  try { expected.forEach(kind => validateMaterial(input.materials.find(m => m.metricKind === kind)!, kind, input.asOf, input.quoteCurrency)); } catch (e) { return invalid(e instanceof Error ? e.message : "M5_MARKET_MATERIAL_INVALID"); }
  const sourceIds = input.materials.map(m => `${m.metricKind}:${m.sourceObservationId}`);
  if (new Set(sourceIds).size !== sourceIds.length) return invalid("M5_MARKET_MATERIAL_DUPLICATE");
  const valueFor = (kind: MarketMetricKind): bigint => { const m = input.materials.find(item => item.metricKind === kind)!; return kind === "LIQUIDITY" ? m.components!.reduce((sum: bigint, c: Readonly<{ valueAtoms: bigint; scale: number }>) => sum + minor(c.valueAtoms, c.scale), 0n) : minor(m.valueAtoms, m.scale); };
  const values = expected.map(valueFor);
  const liquidity = input.materials.find(m => m.metricKind === "LIQUIDITY")!;
  if (minor(liquidity.valueAtoms, liquidity.scale) !== values[2]) return invalid("M5_MARKET_LIQUIDITY_RECONCILIATION_INVALID");
  const observedAt = input.materials.map(m => m.observedAt).sort().at(-1)!;
  const availableAt = input.materials.map(m => m.availableAt).sort().at(-1)!;
  const authorityId = canonicalSha256({ contractVersion: M5_MARKET_METRICS_AUTHORITY_VERSION, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, sourceLineageId: input.sourceLineageId, asOf: input.asOf });
  const derivations = expected.map((kind, i) => {
    const m = input.materials.find(x => x.metricKind === kind)!;
    const body = { contractVersion: M5_MARKET_METRICS_AUTHORITY_VERSION, metricKind: kind, valueAtoms: values[i]!.toString(), unit: "MINOR", scale: 0, quoteCurrency: input.quoteCurrency, basis: m.basis, windowStart: m.windowStart, windowEnd: m.windowEnd, coverageVersion: m.coverageVersion, materialIds: [m.sourceArtifactId, m.sourceEnvelopeId, m.sourceObservationId, m.providerExternalRecordId], materialFingerprints: [m.payloadFingerprint], observedAt: m.observedAt, availableAt: m.availableAt, asOf: input.asOf };
    return { ...body, authorityId, valueAtoms: values[i]!, materialIds: body.materialIds, materialFingerprints: body.materialFingerprints, fingerprint: canonicalSha256({ ...body, authorityId }) } as MarketMetricDerivation;
  });
  const authorityBody = { contractVersion: M5_MARKET_METRICS_AUTHORITY_VERSION, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, sourceLineageId: input.sourceLineageId, asOf: input.asOf, quoteCurrency: input.quoteCurrency, currencyMinorUnitPolicy: "MINOR_SCALE_2_FLOOR_V1", marketCapBasis: "MARKET_CAP_REPORTED", volumeWindowBasis: "ROLLING_24H_REPORTED", liquidityCoverageBasis: "COMPLETE_LIQUIDITY_UNIVERSE", materials: [...input.materials].sort((a, b) => a.metricKind.localeCompare(b.metricKind)), derivations: derivations.map(d => ({ ...d, valueAtoms: d.valueAtoms.toString() })), observedAt, effectiveAvailableAt: availableAt };
  const fingerprint = canonicalSha256(authorityBody);
  const authority = freeze({ ...authorityBody, authorityId, derivations, fingerprint, recordedAt: input.recordedAt });
  return freeze({ status: "READY", authority, derivations: derivations as [MarketMetricDerivation, MarketMetricDerivation, MarketMetricDerivation] });
}

export function assertM5MarketMetricsAuthority(value: M5MarketMetricsAuthority): void {
  const rebuilt = createM5MarketMetricsAuthority({ providerId: value.providerId, datasetId: value.datasetId, datasetVersion: value.datasetVersion, sourceLineageId: value.sourceLineageId, asOf: value.asOf, quoteCurrency: value.quoteCurrency, materials: value.materials, recordedAt: value.recordedAt });
  if (rebuilt.status !== "READY" || rebuilt.authority.authorityId !== value.authorityId || rebuilt.authority.fingerprint !== value.fingerprint) throw new Error("M5_MARKET_AUTHORITY_FINGERPRINT_INVALID");
}
