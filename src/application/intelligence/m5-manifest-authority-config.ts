import {
  M5_EVIDENCE_MANIFEST_VERSION,
  normalizeM5EvidenceManifest,
  normalizeM5EvidenceSemanticCompatibility,
  type M5DatasetPin,
  type M5EvidenceManifest,
  type M5EvidenceSemanticCompatibility,
} from "./assemble-m5-evidence";
import {
  validateCanonicalProducerSourceContext,
  type CanonicalProducerSourceContext,
} from "./canonical-producer-context";
import { normalizeM5DatasetPinValues } from "@/domain/intelligence/m5-dataset-pin";

export const M5_MANIFEST_AUTHORITY_CONFIG_VERSION = "m5-manifest-authority-config/v1" as const;

export interface M5ManifestAuthorityConfig {
  readonly configVersion: typeof M5_MANIFEST_AUTHORITY_CONFIG_VERSION;
  readonly sourceContext: CanonicalProducerSourceContext;
  readonly authorityVersion: string;
  readonly manifest: M5EvidenceManifest;
  readonly compatibility: M5EvidenceSemanticCompatibility;
  readonly allowedDatasetPins: readonly M5DatasetPin[];
  readonly metadata?: Readonly<{
    readonly configIdentifier?: string;
    readonly reviewReference?: string;
  }>;
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function record(value: unknown, code: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(code);
  return value;
}

function exactKeys(value: UnknownRecord, allowed: readonly string[], code: string): void {
  const permitted = new Set(allowed);
  for (const key of Object.keys(value)) if (!permitted.has(key)) throw new Error(`${code}:${key}`);
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
}

function optionalString(value: unknown, code: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, code);
}

function requiredArray(value: unknown, code: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(code);
  return value;
}

function parseDatasetPin(value: unknown): M5DatasetPin {
  const item = record(value, "M5_CONFIG_DATASET_PIN_INVALID");
  exactKeys(item, ["providerId", "datasetId", "datasetVersion"], "M5_CONFIG_DATASET_PIN_UNKNOWN_FIELD");
  return {
    providerId: requiredString(item.providerId, "M5_CONFIG_PROVIDER_ID_INVALID"),
    datasetId: requiredString(item.datasetId, "M5_CONFIG_DATASET_ID_INVALID"),
    datasetVersion: requiredString(item.datasetVersion, "M5_CONFIG_DATASET_VERSION_INVALID"),
  };
}

function parseProducerPin(value: unknown): { providerId: string; datasetVersion: string } {
  const item = record(value, "M5_CONFIG_SOURCE_PIN_INVALID");
  exactKeys(item, ["providerId", "datasetVersion"], "M5_CONFIG_SOURCE_PIN_UNKNOWN_FIELD");
  return {
    providerId: requiredString(item.providerId, "M5_CONFIG_PROVIDER_ID_INVALID"),
    datasetVersion: requiredString(item.datasetVersion, "M5_CONFIG_DATASET_VERSION_INVALID"),
  };
}

function parseEvidenceRef(value: unknown): { evidenceId: string; fingerprint: string } {
  const item = record(value, "M5_CONFIG_MANIFEST_REF_INVALID");
  exactKeys(item, ["evidenceId", "fingerprint"], "M5_CONFIG_MANIFEST_REF_UNKNOWN_FIELD");
  return {
    evidenceId: requiredString(item.evidenceId, "M5_CONFIG_EVIDENCE_ID_INVALID"),
    fingerprint: requiredString(item.fingerprint, "M5_CONFIG_EVIDENCE_FINGERPRINT_INVALID"),
  };
}

function parseSuspiciousAssessmentRef(value: unknown): { assessmentId: string; fingerprint: string } {
  const item = record(value, "M5_CONFIG_SUSPICIOUS_ASSESSMENT_INVALID");
  exactKeys(item, ["assessmentId", "fingerprint"], "M5_CONFIG_SUSPICIOUS_ASSESSMENT_UNKNOWN_FIELD");
  const assessmentId = requiredString(item.assessmentId, "M5_CONFIG_SUSPICIOUS_ASSESSMENT_ID_INVALID");
  const fingerprint = requiredString(item.fingerprint, "M5_CONFIG_SUSPICIOUS_ASSESSMENT_FINGERPRINT_INVALID");
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("M5_CONFIG_SUSPICIOUS_ASSESSMENT_FINGERPRINT_INVALID");
  return { assessmentId, fingerprint };
}

function parseManifest(value: unknown): M5EvidenceManifest {
  const item = record(value, "M5_CONFIG_MANIFEST_INVALID");
  const keys = ["version", "age", "historySpan", "liquidity", "volume", "marketCap", "top10HolderConcentration", "singleHolderConcentration", "volatility", "contractVerification", "venues", "suspiciousAssessment"] as const;
  exactKeys(item, keys, "M5_CONFIG_MANIFEST_UNKNOWN_FIELD");
  const scalar = (key: (typeof keys)[number]) => item[key] === undefined ? undefined : parseEvidenceRef(item[key]);
  return {
    version: requiredString(item.version, "M5_CONFIG_MANIFEST_VERSION_INVALID") as typeof M5_EVIDENCE_MANIFEST_VERSION,
    age: scalar("age"),
    historySpan: scalar("historySpan"),
    liquidity: scalar("liquidity"),
    volume: scalar("volume"),
    marketCap: scalar("marketCap"),
    top10HolderConcentration: scalar("top10HolderConcentration"),
    singleHolderConcentration: scalar("singleHolderConcentration"),
    volatility: scalar("volatility"),
    contractVerification: scalar("contractVerification"),
    venues: requiredArray(item.venues, "M5_CONFIG_MANIFEST_VENUES_INVALID").map(parseEvidenceRef),
    suspiciousAssessment: parseSuspiciousAssessmentRef(item.suspiciousAssessment),
  };
}

function parseCompatibility(value: unknown): M5EvidenceSemanticCompatibility {
  const item = record(value, "M5_CONFIG_COMPATIBILITY_INVALID");
  const keys = ["version", "permittedAgeBases", "ageCalculationVersion", "historySpanSemanticsVersions", "historySpanQualificationBases", "volatilitySemanticsVersions", "monetaryCurrency", "monetaryUnit", "monetaryScale", "liquiditySemanticsVersions", "volumeSemanticsVersions", "marketCapSemanticsVersions"] as const;
  exactKeys(item, keys, "M5_CONFIG_COMPATIBILITY_UNKNOWN_FIELD");
  const strings = (key: string): readonly string[] => requiredArray(item[key], `M5_CONFIG_COMPATIBILITY_${key.toUpperCase()}_INVALID`).map(value => requiredString(value, "M5_CONFIG_COMPATIBILITY_VALUE_INVALID"));
  if (typeof item.monetaryScale !== "number" || !Number.isInteger(item.monetaryScale)) throw new Error("M5_CONFIG_COMPATIBILITY_MONETARY_SCALE_INVALID");
  return {
    version: requiredString(item.version, "M5_CONFIG_COMPATIBILITY_VERSION_INVALID"),
    permittedAgeBases: strings("permittedAgeBases") as M5EvidenceSemanticCompatibility["permittedAgeBases"],
    ageCalculationVersion: requiredString(item.ageCalculationVersion, "M5_CONFIG_COMPATIBILITY_AGE_CALCULATION_INVALID"),
    historySpanSemanticsVersions: strings("historySpanSemanticsVersions"),
    historySpanQualificationBases: strings("historySpanQualificationBases"),
    volatilitySemanticsVersions: strings("volatilitySemanticsVersions"),
    monetaryCurrency: requiredString(item.monetaryCurrency, "M5_CONFIG_COMPATIBILITY_CURRENCY_INVALID"),
    monetaryUnit: requiredString(item.monetaryUnit, "M5_CONFIG_COMPATIBILITY_UNIT_INVALID"),
    monetaryScale: item.monetaryScale,
    liquiditySemanticsVersions: strings("liquiditySemanticsVersions"),
    volumeSemanticsVersions: strings("volumeSemanticsVersions"),
    marketCapSemanticsVersions: strings("marketCapSemanticsVersions"),
  };
}

function parseSourceContext(value: unknown): CanonicalProducerSourceContext {
  const item = record(value, "M5_CONFIG_SOURCE_CONTEXT_INVALID");
  exactKeys(item, ["candidateId", "canonicalIdentifier", "assetId", "assetClass", "asOf", "availableAt", "providerDatasetPins", "relevantEvidence"], "M5_CONFIG_SOURCE_CONTEXT_UNKNOWN_FIELD");
  const pins = requiredArray(item.providerDatasetPins, "M5_CONFIG_SOURCE_PINS_INVALID").map(parseProducerPin);
  const relevantEvidence = requiredArray(item.relevantEvidence, "M5_CONFIG_SOURCE_EVIDENCE_INVALID").map(value => {
    const evidence = record(value, "M5_CONFIG_SOURCE_EVIDENCE_INVALID");
    exactKeys(evidence, ["evidenceId", "providerId", "datasetVersion", "assetId", "lineage"], "M5_CONFIG_SOURCE_EVIDENCE_UNKNOWN_FIELD");
    const lineage = requiredString(evidence.lineage, "M5_CONFIG_SOURCE_LINEAGE_INVALID");
    if (lineage !== "MARKET_OBSERVATION" && lineage !== "EXPLICIT_ASSET_EVIDENCE") throw new Error("M5_CONFIG_SOURCE_LINEAGE_INVALID");
    return { evidenceId: requiredString(evidence.evidenceId, "M5_CONFIG_EVIDENCE_ID_INVALID"), providerId: requiredString(evidence.providerId, "M5_CONFIG_PROVIDER_ID_INVALID"), datasetVersion: requiredString(evidence.datasetVersion, "M5_CONFIG_DATASET_VERSION_INVALID"), assetId: requiredString(evidence.assetId, "M5_CONFIG_ASSET_ID_INVALID"), lineage } as const;
  });
  const availableAt = optionalString(item.availableAt, "M5_CONFIG_AVAILABLE_AT_INVALID");
  return {
    candidateId: requiredString(item.candidateId, "M5_CONFIG_CANDIDATE_ID_INVALID"),
    canonicalIdentifier: requiredString(item.canonicalIdentifier, "M5_CONFIG_CANONICAL_IDENTIFIER_INVALID"),
    assetId: requiredString(item.assetId, "M5_CONFIG_ASSET_ID_INVALID"),
    assetClass: requiredString(item.assetClass, "M5_CONFIG_ASSET_CLASS_INVALID"),
    asOf: requiredString(item.asOf, "M5_CONFIG_AS_OF_INVALID"),
    ...(availableAt === undefined ? {} : { availableAt }),
    providerDatasetPins: pins,
    relevantEvidence,
  };
}

export function parseM5ManifestAuthorityConfig(input: unknown): M5ManifestAuthorityConfig {
  const root = record(input, "M5_CONFIG_INVALID");
  exactKeys(root, ["configVersion", "sourceContext", "authorityVersion", "manifest", "compatibility", "allowedDatasetPins", "metadata"], "M5_CONFIG_UNKNOWN_FIELD");
  if (root.configVersion !== M5_MANIFEST_AUTHORITY_CONFIG_VERSION) throw new Error("M5_CONFIG_VERSION_INVALID");
  const sourceContext = validateCanonicalProducerSourceContext(parseSourceContext(root.sourceContext));
  const manifest = normalizeM5EvidenceManifest(parseManifest(root.manifest));
  const compatibility = normalizeM5EvidenceSemanticCompatibility(parseCompatibility(root.compatibility));
  const allowedDatasetPins = normalizeM5DatasetPinValues(requiredArray(root.allowedDatasetPins, "M5_CONFIG_DATASET_PINS_INVALID").map(parseDatasetPin));
  const authorityVersion = requiredString(root.authorityVersion, "M5_CONFIG_AUTHORITY_VERSION_INVALID");
  let metadata: M5ManifestAuthorityConfig["metadata"];
  if (root.metadata !== undefined) {
    const value = record(root.metadata, "M5_CONFIG_METADATA_INVALID");
    exactKeys(value, ["configIdentifier", "reviewReference"], "M5_CONFIG_METADATA_UNKNOWN_FIELD");
    const configIdentifier = optionalString(value.configIdentifier, "M5_CONFIG_IDENTIFIER_INVALID");
    const reviewReference = optionalString(value.reviewReference, "M5_CONFIG_REVIEW_REFERENCE_INVALID");
    metadata = { ...(configIdentifier === undefined ? {} : { configIdentifier }), ...(reviewReference === undefined ? {} : { reviewReference }) };
  }
  return Object.freeze({ configVersion: M5_MANIFEST_AUTHORITY_CONFIG_VERSION, sourceContext, authorityVersion, manifest, compatibility, allowedDatasetPins, ...(metadata === undefined ? {} : { metadata }) });
}
