import { createHash } from "node:crypto";

export const ELIGIBILITY_RAW_EVIDENCE_VERSION = "eligibility-raw-evidence/v1";

export type EligibilityQuantitativeMetric = "LIQUIDITY" | "VOLUME" | "MARKET_CAP" | "TOP10_CONCENTRATION" | "SINGLE_CONCENTRATION" | "VOLATILITY" | "HISTORY_SPAN";
export type EligibilityReferenceKind = "ASSET_INCEPTION" | "LISTING" | "CONTRACT_DEPLOYMENT" | "CONTRACT_VERIFICATION";
export type ContractVerificationState = "VERIFIED" | "UNVERIFIED" | "UNKNOWN";
export type VenueEligibilityState = "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN";
export type SuspiciousEvidenceSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface EligibilityEvidenceProvenance {
  readonly sourceType: string;
  readonly sourceRecordIds: readonly string[];
  readonly payloadFingerprint: string;
}

export interface RawEligibilityEvidenceEnvelope {
  readonly evidenceId: string;
  readonly candidateId: string;
  readonly assetId: string;
  readonly canonicalIdentifier: string;
  readonly assetClass: string;
  readonly providerId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly mappingRevisionId: string;
  readonly sourceLineageId: string;
  readonly observedAt: string;
  readonly availableAt: string;
  readonly provenance: EligibilityEvidenceProvenance;
  readonly fingerprint: string;
}

export interface QuantitativeEligibilityEvidence extends RawEligibilityEvidenceEnvelope {
  readonly evidenceKind: "QUANTITATIVE";
  readonly metricKind: EligibilityQuantitativeMetric;
  readonly valueAtoms: bigint;
  readonly scale: number;
  readonly unit: string;
  readonly semanticsVersion: string;
  readonly currencyCode?: string;
  readonly window?: Readonly<{ startAt: string; endAt: string }>;
  readonly qualificationBasis?: string;
  /** Holder concentration authority; forbidden for every other metric. */
  readonly holderSnapshotId?: string;
  readonly holderSnapshotFingerprint?: string;
  readonly holderDerivationFingerprint?: string;
  /** Daily-series authority; forbidden for every non-daily metric. */
  readonly dailySeriesAuthorityId?: string;
  readonly dailySeriesAuthorityFingerprint?: string;
  readonly dailySeriesDerivationFingerprint?: string;
  readonly asOf?: string;
}

export interface AgeReferenceEligibilityEvidence extends RawEligibilityEvidenceEnvelope {
  readonly evidenceKind: "REFERENCE";
  readonly referenceKind: "ASSET_INCEPTION" | "LISTING" | "CONTRACT_DEPLOYMENT";
  readonly referenceAt: string;
  readonly ageBasis: "ASSET_INCEPTION" | "LISTING" | "CONTRACT_DEPLOYMENT";
}

export interface ContractVerificationEligibilityEvidence extends RawEligibilityEvidenceEnvelope {
  readonly evidenceKind: "REFERENCE";
  readonly referenceKind: "CONTRACT_VERIFICATION";
  readonly verificationState: ContractVerificationState;
}

export type ReferenceEligibilityEvidence = AgeReferenceEligibilityEvidence | ContractVerificationEligibilityEvidence;

export interface VenueEligibilityEvidence extends RawEligibilityEvidenceEnvelope {
  readonly evidenceKind: "VENUE";
  readonly venueId: string;
  readonly eligibilityState: VenueEligibilityState;
}

export interface SuspiciousEligibilityEvidence extends RawEligibilityEvidenceEnvelope {
  readonly evidenceKind: "SUSPICIOUS";
  readonly flagCode: string;
  readonly severity: SuspiciousEvidenceSeverity;
  readonly sourceSignalId: string;
}

export type RawEligibilityEvidence = QuantitativeEligibilityEvidence | ReferenceEligibilityEvidence | VenueEligibilityEvidence | SuspiciousEligibilityEvidence;

type EnvelopeInput = Omit<RawEligibilityEvidenceEnvelope, "fingerprint" | "provenance"> & { readonly provenance: EligibilityEvidenceProvenance };
export type QuantitativeEligibilityEvidenceInput = EnvelopeInput & Omit<QuantitativeEligibilityEvidence, keyof RawEligibilityEvidenceEnvelope | "evidenceKind" | "fingerprint">;
export type AgeReferenceEligibilityEvidenceInput = EnvelopeInput & Omit<AgeReferenceEligibilityEvidence, keyof RawEligibilityEvidenceEnvelope | "evidenceKind" | "fingerprint">;
export type ContractVerificationEligibilityEvidenceInput = EnvelopeInput & Omit<ContractVerificationEligibilityEvidence, keyof RawEligibilityEvidenceEnvelope | "evidenceKind" | "fingerprint">;
export type VenueEligibilityEvidenceInput = EnvelopeInput & Omit<VenueEligibilityEvidence, keyof RawEligibilityEvidenceEnvelope | "evidenceKind" | "fingerprint">;
export type SuspiciousEligibilityEvidenceInput = EnvelopeInput & Omit<SuspiciousEligibilityEvidence, keyof RawEligibilityEvidenceEnvelope | "evidenceKind" | "fingerprint">;

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const QUANTITATIVE_METRICS = new Set<EligibilityQuantitativeMetric>(["LIQUIDITY", "VOLUME", "MARKET_CAP", "TOP10_CONCENTRATION", "SINGLE_CONCENTRATION", "VOLATILITY", "HISTORY_SPAN"]);
const CONCENTRATION_METRICS = new Set<EligibilityQuantitativeMetric>(["TOP10_CONCENTRATION", "SINGLE_CONCENTRATION"]);
const MONETARY_METRICS = new Set<EligibilityQuantitativeMetric>(["LIQUIDITY", "VOLUME", "MARKET_CAP"]);
const AGE_REFERENCE_KINDS = new Set<AgeReferenceEligibilityEvidence["referenceKind"]>(["ASSET_INCEPTION", "LISTING", "CONTRACT_DEPLOYMENT"]);
const CONTRACT_STATES = new Set<ContractVerificationState>(["VERIFIED", "UNVERIFIED", "UNKNOWN"]);
const VENUE_STATES = new Set<VenueEligibilityState>(["ELIGIBLE", "INELIGIBLE", "UNKNOWN"]);
const SEVERITIES = new Set<SuspiciousEvidenceSeverity>(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const SHA256 = /^[a-f0-9]{64}$/;

function nonBlank(value: string, code: string): void { if (typeof value !== "string" || value.trim() === "") throw new Error(code); }
function timestamp(value: string, code: string): void { if (!UTC_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(code); }
function normalizedValues(values: readonly string[], code: string): readonly string[] { if (!Array.isArray(values) || values.length === 0) throw new Error(code); return Object.freeze([...new Set(values.map(value => { nonBlank(value, code); return value.trim(); }))].sort((a, b) => a.localeCompare(b))); }
function normalize(value: unknown): unknown { if (typeof value === "bigint") return value.toString(); if (Array.isArray(value)) return value.map(normalize); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)])); return value; }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex"); }
function frozen<T extends object>(value: T): Readonly<T> { return Object.freeze(value); }

function normalizedEnvelope(input: EnvelopeInput): Omit<RawEligibilityEvidenceEnvelope, "fingerprint"> {
  for (const [field, value] of Object.entries({ evidenceId: input.evidenceId, candidateId: input.candidateId, assetId: input.assetId, canonicalIdentifier: input.canonicalIdentifier, assetClass: input.assetClass, providerId: input.providerId, datasetId: input.datasetId, datasetVersion: input.datasetVersion, mappingRevisionId: input.mappingRevisionId, sourceLineageId: input.sourceLineageId })) nonBlank(value, `M5_RAW_${field.toUpperCase()}_INVALID`);
  if (input.assetClass.trim() === "UNKNOWN") throw new Error("M5_RAW_ASSET_CLASS_UNKNOWN");
  timestamp(input.observedAt, "M5_RAW_OBSERVED_AT_INVALID");
  timestamp(input.availableAt, "M5_RAW_AVAILABLE_AT_INVALID");
  if (input.observedAt > input.availableAt) throw new Error("M5_RAW_TEMPORAL_ORDER_INVALID");
  if (input.provenance.sourceType !== "M5_SOURCE_LINEAGE") throw new Error("M5_RAW_SOURCE_TYPE_INVALID");
  if (!SHA256.test(input.provenance.payloadFingerprint)) throw new Error("M5_RAW_PAYLOAD_FINGERPRINT_INVALID");
  return frozen({ evidenceId: input.evidenceId.trim(), candidateId: input.candidateId.trim(), assetId: input.assetId.trim(), canonicalIdentifier: input.canonicalIdentifier.trim(), assetClass: input.assetClass.trim(), providerId: input.providerId.trim(), datasetId: input.datasetId.trim(), datasetVersion: input.datasetVersion.trim(), mappingRevisionId: input.mappingRevisionId.trim(), sourceLineageId: input.sourceLineageId.trim(), observedAt: input.observedAt, availableAt: input.availableAt, provenance: frozen({ sourceType: input.provenance.sourceType, sourceRecordIds: normalizedValues(input.provenance.sourceRecordIds, "M5_RAW_PROVENANCE_INVALID"), payloadFingerprint: input.provenance.payloadFingerprint }) });
}

function normalizedWindow(window: QuantitativeEligibilityEvidenceInput["window"]): Readonly<{ startAt: string; endAt: string }> | undefined {
  if (!window) return undefined;
  timestamp(window.startAt, "M5_RAW_WINDOW_INVALID"); timestamp(window.endAt, "M5_RAW_WINDOW_INVALID");
  if (window.startAt > window.endAt) throw new Error("M5_RAW_WINDOW_INVALID");
  return frozen({ startAt: window.startAt, endAt: window.endAt });
}

function quantitativeBody(input: QuantitativeEligibilityEvidenceInput): Omit<QuantitativeEligibilityEvidence, "fingerprint"> {
  const envelope = normalizedEnvelope(input);
  if (!QUANTITATIVE_METRICS.has(input.metricKind)) throw new Error("M5_RAW_METRIC_INVALID");
  if (typeof input.valueAtoms !== "bigint" || input.valueAtoms < 0n) throw new Error("M5_RAW_VALUE_INVALID");
  if (!Number.isInteger(input.scale) || input.scale < 0) throw new Error("M5_RAW_SCALE_INVALID");
  nonBlank(input.unit, "M5_RAW_UNIT_INVALID"); nonBlank(input.semanticsVersion, "M5_RAW_SEMANTICS_VERSION_INVALID");
  const window = normalizedWindow(input.window);
  if (MONETARY_METRICS.has(input.metricKind)) { nonBlank(input.currencyCode ?? "", "M5_RAW_CURRENCY_INVALID"); if (input.metricKind !== "MARKET_CAP" && !window) throw new Error("M5_RAW_WINDOW_REQUIRED"); }
  if (CONCENTRATION_METRICS.has(input.metricKind) && (input.unit !== "BPS" || input.scale !== 0 || input.valueAtoms > 10000n)) throw new Error("M5_RAW_BPS_INVALID");
  if (input.metricKind === "VOLATILITY" && (input.unit !== "BPS" || input.scale !== 0)) throw new Error("M5_RAW_BPS_INVALID");
  if (input.metricKind === "VOLATILITY" && !window) throw new Error("M5_RAW_WINDOW_REQUIRED");
  if (input.metricKind === "HISTORY_SPAN") { if (input.unit !== "DAYS" || input.scale !== 0 || !window) throw new Error("M5_RAW_HISTORY_SPAN_INVALID"); nonBlank(input.qualificationBasis ?? "", "M5_RAW_HISTORY_SPAN_INVALID"); }
  const holderFields = [input.holderSnapshotId, input.holderSnapshotFingerprint, input.holderDerivationFingerprint];
  const dailyFields = [input.dailySeriesAuthorityId, input.dailySeriesAuthorityFingerprint, input.dailySeriesDerivationFingerprint];
  if (CONCENTRATION_METRICS.has(input.metricKind)) {
    nonBlank(input.holderSnapshotId ?? "", "M5_RAW_HOLDER_SNAPSHOT_ID_REQUIRED");
    if (!input.holderSnapshotFingerprint || !SHA256.test(input.holderSnapshotFingerprint)) throw new Error("M5_RAW_HOLDER_SNAPSHOT_FINGERPRINT_REQUIRED");
    if (!input.holderDerivationFingerprint || !SHA256.test(input.holderDerivationFingerprint)) throw new Error("M5_RAW_HOLDER_DERIVATION_FINGERPRINT_REQUIRED");
    timestamp(input.asOf ?? "", "M5_RAW_AS_OF_REQUIRED");
  } else if (holderFields.some(value => value !== undefined)) throw new Error("M5_RAW_HOLDER_AUTHORITY_FORBIDDEN");
  if (input.metricKind === "HISTORY_SPAN" || input.metricKind === "VOLATILITY") {
    if (dailyFields.some(value => typeof value !== "string" || value.trim() === "")) throw new Error("M5_RAW_DAILY_AUTHORITY_REQUIRED");
    if (!SHA256.test(input.dailySeriesAuthorityFingerprint!) || !SHA256.test(input.dailySeriesDerivationFingerprint!)) throw new Error("M5_RAW_DAILY_AUTHORITY_FINGERPRINT_REQUIRED");
    timestamp(input.asOf ?? "", "M5_RAW_AS_OF_REQUIRED");
  } else if (dailyFields.some(value => value !== undefined) || (!CONCENTRATION_METRICS.has(input.metricKind) && input.asOf !== undefined)) throw new Error("M5_RAW_DAILY_AUTHORITY_FORBIDDEN");
  return frozen({ ...envelope, evidenceKind: "QUANTITATIVE", metricKind: input.metricKind, valueAtoms: input.valueAtoms, scale: input.scale, unit: input.unit.trim(), semanticsVersion: input.semanticsVersion.trim(), ...(input.currencyCode ? { currencyCode: input.currencyCode.trim() } : {}), ...(window ? { window } : {}), ...(input.qualificationBasis ? { qualificationBasis: input.qualificationBasis.trim() } : {}), ...(CONCENTRATION_METRICS.has(input.metricKind) ? { holderSnapshotId: input.holderSnapshotId!.trim(), holderSnapshotFingerprint: input.holderSnapshotFingerprint!, holderDerivationFingerprint: input.holderDerivationFingerprint!, asOf: input.asOf } : {}), ...((input.metricKind === "HISTORY_SPAN" || input.metricKind === "VOLATILITY") ? { dailySeriesAuthorityId: input.dailySeriesAuthorityId!.trim(), dailySeriesAuthorityFingerprint: input.dailySeriesAuthorityFingerprint!, dailySeriesDerivationFingerprint: input.dailySeriesDerivationFingerprint!, asOf: input.asOf } : {}) });
}

export function rawEligibilityEvidenceFingerprint(record: Omit<RawEligibilityEvidence, "fingerprint">): string { return digest({ version: ELIGIBILITY_RAW_EVIDENCE_VERSION, ...record }); }

export function createQuantitativeEligibilityEvidence(input: QuantitativeEligibilityEvidenceInput): QuantitativeEligibilityEvidence { const body = quantitativeBody(input); return frozen({ ...body, fingerprint: rawEligibilityEvidenceFingerprint(body) }); }

export function createAgeReferenceEligibilityEvidence(input: AgeReferenceEligibilityEvidenceInput): AgeReferenceEligibilityEvidence {
  const envelope = normalizedEnvelope(input); timestamp(input.referenceAt, "M5_RAW_REFERENCE_AT_INVALID");
  if (!AGE_REFERENCE_KINDS.has(input.referenceKind) || input.referenceKind !== input.ageBasis) throw new Error("M5_RAW_AGE_BASIS_INVALID");
  const body = frozen({ ...envelope, evidenceKind: "REFERENCE" as const, referenceKind: input.referenceKind, referenceAt: input.referenceAt, ageBasis: input.ageBasis });
  return frozen({ ...body, fingerprint: rawEligibilityEvidenceFingerprint(body) });
}

export function createContractVerificationEligibilityEvidence(input: ContractVerificationEligibilityEvidenceInput): ContractVerificationEligibilityEvidence {
  const envelope = normalizedEnvelope(input); if (!CONTRACT_STATES.has(input.verificationState)) throw new Error("M5_RAW_CONTRACT_VERIFICATION_INVALID");
  const body = frozen({ ...envelope, evidenceKind: "REFERENCE" as const, referenceKind: "CONTRACT_VERIFICATION" as const, verificationState: input.verificationState });
  return frozen({ ...body, fingerprint: rawEligibilityEvidenceFingerprint(body) });
}

export function createVenueEligibilityEvidence(input: VenueEligibilityEvidenceInput): VenueEligibilityEvidence {
  const envelope = normalizedEnvelope(input); nonBlank(input.venueId, "M5_RAW_VENUE_ID_INVALID"); if (!VENUE_STATES.has(input.eligibilityState)) throw new Error("M5_RAW_VENUE_STATE_INVALID");
  const body = frozen({ ...envelope, evidenceKind: "VENUE" as const, venueId: input.venueId.trim(), eligibilityState: input.eligibilityState });
  return frozen({ ...body, fingerprint: rawEligibilityEvidenceFingerprint(body) });
}

export function createSuspiciousEligibilityEvidence(input: SuspiciousEligibilityEvidenceInput): SuspiciousEligibilityEvidence {
  const envelope = normalizedEnvelope(input); nonBlank(input.flagCode, "M5_RAW_SUSPICIOUS_FLAG_INVALID"); nonBlank(input.sourceSignalId, "M5_RAW_SOURCE_SIGNAL_INVALID"); if (!SEVERITIES.has(input.severity)) throw new Error("M5_RAW_SUSPICIOUS_SEVERITY_INVALID");
  const body = frozen({ ...envelope, evidenceKind: "SUSPICIOUS" as const, flagCode: input.flagCode.trim(), severity: input.severity, sourceSignalId: input.sourceSignalId.trim() });
  return frozen({ ...body, fingerprint: rawEligibilityEvidenceFingerprint(body) });
}

export function assertRawEligibilityEvidence(record: RawEligibilityEvidence): void {
  let validated: RawEligibilityEvidence;
  if (record.evidenceKind === "QUANTITATIVE") validated = createQuantitativeEligibilityEvidence(record);
  else if (record.evidenceKind === "VENUE") validated = createVenueEligibilityEvidence(record);
  else if (record.evidenceKind === "SUSPICIOUS") validated = createSuspiciousEligibilityEvidence(record);
  else if (record.referenceKind === "CONTRACT_VERIFICATION") validated = createContractVerificationEligibilityEvidence(record);
  else validated = createAgeReferenceEligibilityEvidence(record);
  if (validated.fingerprint !== record.fingerprint) throw new Error("M5_RAW_FINGERPRINT_MISMATCH");
}
