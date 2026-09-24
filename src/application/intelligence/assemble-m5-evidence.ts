import { createHash } from "node:crypto";
import type { EligibilityEvidence } from "@/domain/discovery/asset-eligibility";
import {
  assertRawEligibilityEvidence,
  type AgeReferenceEligibilityEvidence,
  type EligibilityQuantitativeMetric,
  type QuantitativeEligibilityEvidence,
  type RawEligibilityEvidence,
  type VenueEligibilityEvidence,
} from "@/domain/intelligence/eligibility-evidence";
import type { SuspiciousEligibilityEvidence } from "@/domain/intelligence/eligibility-evidence";
import type { M5SuspiciousAssessment } from "@/domain/intelligence/m5-suspicious-assessment";

export const M5_EVIDENCE_ASSEMBLY_VERSION = "m5-evidence-assembly/v1";
export const M5_EVIDENCE_MANIFEST_VERSION = "m5-evidence-manifest/v2";

export interface M5DatasetPin {
  readonly providerId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
}

export interface M5AssemblyContext {
  readonly candidateId: string;
  readonly assetId: string;
  readonly canonicalIdentifier: string;
  readonly assetClass: string;
  readonly asOf: string;
  readonly allowedPins: readonly M5DatasetPin[];
}

export interface M5EvidenceAuthorityRef {
  readonly evidenceId: string;
  readonly fingerprint: string;
}

export interface M5SuspiciousAssessmentRef {
  readonly assessmentId: string;
  readonly fingerprint: string;
}

export interface M5EvidenceManifest {
  readonly version: typeof M5_EVIDENCE_MANIFEST_VERSION;
  readonly age?: M5EvidenceAuthorityRef;
  readonly historySpan?: M5EvidenceAuthorityRef;
  readonly liquidity?: M5EvidenceAuthorityRef;
  readonly volume?: M5EvidenceAuthorityRef;
  readonly marketCap?: M5EvidenceAuthorityRef;
  readonly top10HolderConcentration?: M5EvidenceAuthorityRef;
  readonly singleHolderConcentration?: M5EvidenceAuthorityRef;
  readonly volatility?: M5EvidenceAuthorityRef;
  readonly contractVerification?: M5EvidenceAuthorityRef;
  readonly venues: readonly M5EvidenceAuthorityRef[];
  readonly suspiciousAssessment: M5SuspiciousAssessmentRef;
}

export interface M5EvidenceSemanticCompatibility {
  readonly version: string;
  readonly permittedAgeBases: readonly AgeReferenceEligibilityEvidence["ageBasis"][];
  readonly ageCalculationVersion: string;
  readonly historySpanSemanticsVersions: readonly string[];
  readonly historySpanQualificationBases: readonly string[];
  readonly volatilitySemanticsVersions: readonly string[];
  readonly monetaryCurrency: string;
  readonly monetaryUnit: string;
  readonly monetaryScale: number;
  readonly liquiditySemanticsVersions: readonly string[];
  readonly volumeSemanticsVersions: readonly string[];
  readonly marketCapSemanticsVersions: readonly string[];
}

export type M5AssemblyTarget =
  | "AGE"
  | "HISTORY_SPAN"
  | "LIQUIDITY"
  | "VOLUME"
  | "MARKET_CAP"
  | "TOP10_CONCENTRATION"
  | "SINGLE_CONCENTRATION"
  | "VOLATILITY"
  | "CONTRACT_VERIFICATION"
  | "VENUES"
  | "SUSPICIOUS";

export interface M5AssemblyDiagnostic {
  readonly code: string;
  readonly target: M5AssemblyTarget;
  readonly evidenceIds: readonly string[];
}

type CompleteAssembly = {
  readonly status: "COMPLETE";
  readonly context: M5AssemblyContext;
  readonly evidence: EligibilityEvidence;
  readonly materialEvidenceIds: readonly string[];
  readonly diagnosticEvidenceIds: readonly string[];
  readonly materialDatasetPins: readonly M5DatasetPin[];
  readonly materialAvailableAt: string;
  readonly assemblyFingerprint: string;
  readonly assemblyVersion: typeof M5_EVIDENCE_ASSEMBLY_VERSION;
  readonly suspiciousAssessmentId: string;
  readonly suspiciousAssessmentFingerprint: string;
  readonly suspiciousAssessmentResult: M5SuspiciousAssessment["result"];
};

type IncompleteAssembly = {
  readonly status: "INCOMPLETE";
  readonly context: M5AssemblyContext;
  readonly evidence: EligibilityEvidence;
  readonly missingRequirements: readonly M5AssemblyDiagnostic[];
  readonly ambiguityDiagnostics: readonly M5AssemblyDiagnostic[];
  readonly materialEvidenceIds: readonly string[];
  readonly diagnosticEvidenceIds: readonly string[];
  readonly materialDatasetPins: readonly M5DatasetPin[];
  readonly materialAvailableAt: string | null;
  readonly assemblyFingerprint: string;
  readonly assemblyVersion: typeof M5_EVIDENCE_ASSEMBLY_VERSION;
  readonly suspiciousAssessmentId?: string;
  readonly suspiciousAssessmentFingerprint?: string;
  readonly suspiciousAssessmentResult?: M5SuspiciousAssessment["result"];
};

type InvalidManifestAssembly = {
  readonly status: "INVALID_MANIFEST";
  readonly errors: readonly M5AssemblyDiagnostic[];
  readonly diagnosticEvidenceIds: readonly string[];
  readonly assemblyVersion: typeof M5_EVIDENCE_ASSEMBLY_VERSION;
};

export type M5EvidenceAssemblyResult = CompleteAssembly | IncompleteAssembly | InvalidManifestAssembly;

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DAY_MILLISECONDS = 86_400_000n;

const freeze = <T>(value: T): T => Object.freeze(value);
const frozenArray = <T>(values: readonly T[]): readonly T[] => Object.freeze([...values]);
const nonBlank = (value: string, code: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value.trim();
};
const timestamp = (value: string, code: string): string => {
  if (!UTC_TIMESTAMP.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error(code);
  return value;
};
const normalizedStrings = (values: readonly string[], code: string): readonly string[] => frozenArray([...new Set(values.map(value => nonBlank(value, code)))].sort((a, b) => a.localeCompare(b)));
const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const incompleteWithoutAssessment = (context: M5AssemblyContext, manifest: M5EvidenceManifest, compatibility: M5EvidenceSemanticCompatibility): IncompleteAssembly => freeze({ status: "INCOMPLETE", context, evidence: freeze({ candidateId: context.candidateId, assetClass: context.assetClass, evidenceIds: frozenArray([]), suspiciousFlags: frozenArray([]) }), missingRequirements: frozenArray([diagnostic("M5_ASSEMBLY_SUSPICIOUS_ASSESSMENT_MISSING", "SUSPICIOUS")]), ambiguityDiagnostics: frozenArray([]), materialEvidenceIds: frozenArray([]), diagnosticEvidenceIds: frozenArray([]), materialDatasetPins: frozenArray([]), materialAvailableAt: null, assemblyFingerprint: digest({ version: M5_EVIDENCE_ASSEMBLY_VERSION, context, manifest, compatibility, missing: "suspicious-assessment" }), assemblyVersion: M5_EVIDENCE_ASSEMBLY_VERSION });
function canonical(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
const pinKey = (pin: M5DatasetPin): string => `${pin.providerId}\u0000${pin.datasetId}\u0000${pin.datasetVersion}`;
const refKey = (ref: M5EvidenceAuthorityRef): string => `${ref.evidenceId}\u0000${ref.fingerprint}`;
const diagnostic = (code: string, target: M5AssemblyTarget, evidenceIds: readonly string[] = []): M5AssemblyDiagnostic => freeze({ code, target, evidenceIds: normalizedStrings(evidenceIds, "M5_ASSEMBLY_DIAGNOSTIC_INVALID") });

export function normalizeM5AssemblyContext(input: M5AssemblyContext): M5AssemblyContext {
  const candidateId = nonBlank(input.candidateId, "M5_ASSEMBLY_CANDIDATE_ID_INVALID");
  const assetId = nonBlank(input.assetId, "M5_ASSEMBLY_ASSET_ID_INVALID");
  const canonicalIdentifier = nonBlank(input.canonicalIdentifier, "M5_ASSEMBLY_CANONICAL_IDENTIFIER_INVALID");
  const assetClass = nonBlank(input.assetClass, "M5_ASSEMBLY_ASSET_CLASS_INVALID");
  if (assetClass === "UNKNOWN") throw new Error("M5_ASSEMBLY_ASSET_CLASS_UNKNOWN");
  const asOf = timestamp(input.asOf, "M5_ASSEMBLY_AS_OF_INVALID");
  const pins = new Map<string, M5DatasetPin>();
  const providerDatasetVersions = new Map<string, string>();
  for (const value of input.allowedPins) {
    const pin = freeze({ providerId: nonBlank(value.providerId, "M5_ASSEMBLY_PIN_INVALID"), datasetId: nonBlank(value.datasetId, "M5_ASSEMBLY_PIN_INVALID"), datasetVersion: nonBlank(value.datasetVersion, "M5_ASSEMBLY_PIN_INVALID") });
    const logicalKey = `${pin.providerId}\u0000${pin.datasetId}`;
    const previousVersion = providerDatasetVersions.get(logicalKey);
    if (previousVersion && previousVersion !== pin.datasetVersion) throw new Error("M5_ASSEMBLY_PIN_CONFLICT");
    providerDatasetVersions.set(logicalKey, pin.datasetVersion);
    pins.set(pinKey(pin), pin);
  }
  if (!pins.size) throw new Error("M5_ASSEMBLY_PINS_MISSING");
  return freeze({ candidateId, assetId, canonicalIdentifier, assetClass, asOf, allowedPins: frozenArray([...pins.values()].sort((a, b) => pinKey(a).localeCompare(pinKey(b)))) });
}

function normalizeRef(value: M5EvidenceAuthorityRef): M5EvidenceAuthorityRef {
  return freeze({ evidenceId: nonBlank(value.evidenceId, "M5_ASSEMBLY_MANIFEST_REF_INVALID"), fingerprint: nonBlank(value.fingerprint, "M5_ASSEMBLY_MANIFEST_REF_INVALID") });
}

function normalizeRefSet(values: readonly M5EvidenceAuthorityRef[], code: string): readonly M5EvidenceAuthorityRef[] {
  if (!Array.isArray(values)) throw new Error(code);
  const byId = new Map<string, M5EvidenceAuthorityRef>();
  for (const value of values) {
    const ref = normalizeRef(value);
    const previous = byId.get(ref.evidenceId);
    if (previous && previous.fingerprint !== ref.fingerprint) throw new Error("M5_ASSEMBLY_MANIFEST_REF_CONFLICT");
    byId.set(ref.evidenceId, ref);
  }
  return frozenArray([...byId.values()].sort((a, b) => refKey(a).localeCompare(refKey(b))));
}

function normalizeAssessmentRef(value: M5SuspiciousAssessmentRef): M5SuspiciousAssessmentRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("M5_ASSEMBLY_SUSPICIOUS_ASSESSMENT_REF_INVALID");
  if (Object.keys(value).some(key => key !== "assessmentId" && key !== "fingerprint")) throw new Error("M5_ASSEMBLY_SUSPICIOUS_ASSESSMENT_REF_UNKNOWN_FIELD");
  const assessmentId = nonBlank(value.assessmentId, "M5_ASSEMBLY_SUSPICIOUS_ASSESSMENT_ID_INVALID");
  const fingerprint = nonBlank(value.fingerprint, "M5_ASSEMBLY_SUSPICIOUS_ASSESSMENT_FINGERPRINT_INVALID");
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("M5_ASSEMBLY_SUSPICIOUS_ASSESSMENT_FINGERPRINT_INVALID");
  return freeze({ assessmentId, fingerprint });
}

export function normalizeM5EvidenceManifest(input: M5EvidenceManifest): M5EvidenceManifest {
  const allowed = new Set(["version", "age", "historySpan", "liquidity", "volume", "marketCap", "top10HolderConcentration", "singleHolderConcentration", "volatility", "contractVerification", "venues", "suspiciousAssessment"]);
  if (!input || typeof input !== "object" || Object.keys(input).some(key => !allowed.has(key))) throw new Error("M5_ASSEMBLY_MANIFEST_UNKNOWN_FIELD");
  if (input.version !== M5_EVIDENCE_MANIFEST_VERSION) throw new Error("M5_ASSEMBLY_MANIFEST_VERSION_INVALID");
  const scalar = <T extends keyof Pick<M5EvidenceManifest, "age" | "historySpan" | "liquidity" | "volume" | "marketCap" | "top10HolderConcentration" | "singleHolderConcentration" | "volatility" | "contractVerification">>(key: T): M5EvidenceAuthorityRef | undefined => input[key] ? normalizeRef(input[key]!) : undefined;
  return freeze({ version: M5_EVIDENCE_MANIFEST_VERSION, age: scalar("age"), historySpan: scalar("historySpan"), liquidity: scalar("liquidity"), volume: scalar("volume"), marketCap: scalar("marketCap"), top10HolderConcentration: scalar("top10HolderConcentration"), singleHolderConcentration: scalar("singleHolderConcentration"), volatility: scalar("volatility"), contractVerification: scalar("contractVerification"), venues: normalizeRefSet(input.venues, "M5_ASSEMBLY_MANIFEST_VENUES_INVALID"), suspiciousAssessment: normalizeAssessmentRef(input.suspiciousAssessment) });
}

export function normalizeM5EvidenceSemanticCompatibility(input: M5EvidenceSemanticCompatibility): M5EvidenceSemanticCompatibility {
  if (!Number.isInteger(input.monetaryScale) || input.monetaryScale < 0) throw new Error("M5_ASSEMBLY_MONETARY_SCALE_INVALID");
  const permittedAgeBases = normalizedStrings(input.permittedAgeBases, "M5_ASSEMBLY_AGE_BASIS_INVALID") as readonly AgeReferenceEligibilityEvidence["ageBasis"][];
  for (const basis of permittedAgeBases) if (basis !== "ASSET_INCEPTION" && basis !== "LISTING" && basis !== "CONTRACT_DEPLOYMENT") throw new Error("M5_ASSEMBLY_AGE_BASIS_INVALID");
  return freeze({ version: nonBlank(input.version, "M5_ASSEMBLY_SEMANTICS_VERSION_INVALID"), permittedAgeBases, ageCalculationVersion: nonBlank(input.ageCalculationVersion, "M5_ASSEMBLY_AGE_CALCULATION_INVALID"), historySpanSemanticsVersions: normalizedStrings(input.historySpanSemanticsVersions, "M5_ASSEMBLY_HISTORY_SEMANTICS_INVALID"), historySpanQualificationBases: normalizedStrings(input.historySpanQualificationBases, "M5_ASSEMBLY_HISTORY_BASIS_INVALID"), volatilitySemanticsVersions: normalizedStrings(input.volatilitySemanticsVersions, "M5_ASSEMBLY_VOLATILITY_SEMANTICS_INVALID"), monetaryCurrency: nonBlank(input.monetaryCurrency, "M5_ASSEMBLY_MONETARY_CURRENCY_INVALID"), monetaryUnit: nonBlank(input.monetaryUnit, "M5_ASSEMBLY_MONETARY_UNIT_INVALID"), monetaryScale: input.monetaryScale, liquiditySemanticsVersions: normalizedStrings(input.liquiditySemanticsVersions, "M5_ASSEMBLY_LIQUIDITY_SEMANTICS_INVALID"), volumeSemanticsVersions: normalizedStrings(input.volumeSemanticsVersions, "M5_ASSEMBLY_VOLUME_SEMANTICS_INVALID"), marketCapSemanticsVersions: normalizedStrings(input.marketCapSemanticsVersions, "M5_ASSEMBLY_MARKET_CAP_SEMANTICS_INVALID") });
}

type Resolution = { readonly evidence?: RawEligibilityEvidence; readonly error?: M5AssemblyDiagnostic };

function assemblyFingerprint(context: M5AssemblyContext, manifest: M5EvidenceManifest, compatibility: M5EvidenceSemanticCompatibility, material: readonly RawEligibilityEvidence[], diagnostics: readonly M5AssemblyDiagnostic[], assessment: M5SuspiciousAssessment): string {
  return digest({ version: M5_EVIDENCE_ASSEMBLY_VERSION, context, manifest, compatibility, suspiciousAssessmentId: assessment.suspiciousAssessmentId, suspiciousAssessmentFingerprint: assessment.fingerprint, suspiciousAssessmentResult: assessment.result, materialFingerprints: material.map(value => value.fingerprint).sort((a, b) => a.localeCompare(b)), diagnostics });
}

export function assembleM5Evidence(input: { readonly context: M5AssemblyContext; readonly manifest: M5EvidenceManifest; readonly compatibility: M5EvidenceSemanticCompatibility; readonly rawEvidence: readonly RawEligibilityEvidence[]; readonly suspiciousAssessment?: M5SuspiciousAssessment; readonly suspiciousFindings?: readonly SuspiciousEligibilityEvidence[]; readonly requiredRuleIds?: readonly string[] }): M5EvidenceAssemblyResult {
  let context: M5AssemblyContext;
  let manifest: M5EvidenceManifest;
  let compatibility: M5EvidenceSemanticCompatibility;
  try {
    context = normalizeM5AssemblyContext(input.context);
    manifest = normalizeM5EvidenceManifest(input.manifest);
    compatibility = normalizeM5EvidenceSemanticCompatibility(input.compatibility);
  } catch (error) {
    return invalid([diagnostic(error instanceof Error ? error.message : "M5_ASSEMBLY_MANIFEST_INVALID", "AGE")]);
  }
  const assessment = input.suspiciousAssessment;
  if (!assessment) return incompleteWithoutAssessment(context, manifest, compatibility);
  const assessmentErrors: M5AssemblyDiagnostic[] = [];
  if (manifest.suspiciousAssessment.assessmentId !== assessment.suspiciousAssessmentId || manifest.suspiciousAssessment.fingerprint !== assessment.fingerprint) assessmentErrors.push(diagnostic("M5_ASSEMBLY_SUSPICIOUS_ASSESSMENT_REF_MISMATCH", "SUSPICIOUS"));
  if (assessment.candidateId !== context.candidateId || assessment.assetId !== context.assetId || assessment.canonicalIdentifier !== context.canonicalIdentifier || assessment.assetClass !== context.assetClass || assessment.asOf !== context.asOf || assessment.observedAt > context.asOf || assessment.availableAt > context.asOf) assessmentErrors.push(diagnostic("M5_ASSEMBLY_SUSPICIOUS_ASSESSMENT_SCOPE_MISMATCH", "SUSPICIOUS"));
  if (assessment.coverageStatus !== "COMPLETE" || !assessment.ruleSetAuthorityId || !assessment.coverageAuthorityId || !assessment.coverageFingerprint || assessment.evaluatedRuleCount !== assessment.coveredRuleIds.length) assessmentErrors.push(diagnostic("M5_ASSEMBLY_SUSPICIOUS_COVERAGE_AUTHORITY_MISSING", "SUSPICIOUS"));
  const requiredRules = [...(input.requiredRuleIds ?? assessment.coveredRuleIds)].sort((a, b) => a.localeCompare(b));
  if (new Set(requiredRules).size !== requiredRules.length || requiredRules.length !== assessment.coveredRuleIds.length || requiredRules.some((value, index) => value !== assessment.coveredRuleIds[index])) assessmentErrors.push(diagnostic("M5_ASSEMBLY_SUSPICIOUS_RULE_COVERAGE_INVALID", "SUSPICIOUS"));
  const suspiciousFindings = [...(input.suspiciousFindings ?? [])].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  const findingReferences = [...assessment.findingReferences].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  if (new Set(suspiciousFindings.map(value => value.evidenceId)).size !== suspiciousFindings.length) assessmentErrors.push(diagnostic("M5_ASSEMBLY_SUSPICIOUS_FINDING_DUPLICATE", "SUSPICIOUS"));
  if (suspiciousFindings.length !== findingReferences.length || suspiciousFindings.some((value, index) => value.evidenceId !== findingReferences[index]?.evidenceId || value.fingerprint !== findingReferences[index]?.fingerprint || value.candidateId !== assessment.candidateId || value.assetId !== assessment.assetId || value.canonicalIdentifier !== assessment.canonicalIdentifier || value.assetClass !== assessment.assetClass || value.providerId !== assessment.providerId || value.datasetId !== assessment.datasetId || value.datasetVersion !== assessment.datasetVersion || value.mappingRevisionId !== assessment.mappingRevisionId || value.sourceLineageId !== assessment.sourceLineageId || value.observedAt > assessment.asOf || value.availableAt > assessment.asOf)) assessmentErrors.push(diagnostic("M5_ASSEMBLY_SUSPICIOUS_FINDING_SET_INVALID", "SUSPICIOUS"));
  if (assessment.result === "NO_FINDINGS" && findingReferences.length !== 0) assessmentErrors.push(diagnostic("M5_ASSEMBLY_SUSPICIOUS_NO_FINDINGS_INVALID", "SUSPICIOUS"));
  if (assessment.result === "FINDINGS_PRESENT" && findingReferences.length === 0) assessmentErrors.push(diagnostic("M5_ASSEMBLY_SUSPICIOUS_FINDINGS_MISSING", "SUSPICIOUS"));
  if (assessmentErrors.length) return invalid(assessmentErrors);

  const rawById = new Map<string, RawEligibilityEvidence>();
  const errors: M5AssemblyDiagnostic[] = [];
  for (const raw of input.rawEvidence) {
    try { assertRawEligibilityEvidence(raw); } catch (error) { errors.push(diagnostic(error instanceof Error ? error.message : "M5_ASSEMBLY_RAW_EVIDENCE_INVALID", "AGE", [raw.evidenceId])); continue; }
    if (raw.observedAt > context.asOf || raw.availableAt > context.asOf) { errors.push(diagnostic("M5_ASSEMBLY_RAW_EVIDENCE_NOT_VISIBLE", "AGE", [raw.evidenceId])); continue; }
    const previous = rawById.get(raw.evidenceId);
    if (previous && previous.fingerprint !== raw.fingerprint) errors.push(diagnostic("M5_ASSEMBLY_RAW_EVIDENCE_ID_CONFLICT", "AGE", [raw.evidenceId]));
    else rawById.set(raw.evidenceId, raw);
  }
  if (errors.length) return invalid(errors);

  const pinSet = new Set(context.allowedPins.map(pinKey));
  const identityMatches = (raw: RawEligibilityEvidence): boolean => raw.candidateId === context.candidateId && raw.assetId === context.assetId && raw.canonicalIdentifier === context.canonicalIdentifier && raw.assetClass === context.assetClass;
  const resolve = (ref: M5EvidenceAuthorityRef, target: M5AssemblyTarget): Resolution => {
    const raw = rawById.get(ref.evidenceId);
    if (!raw) return { error: diagnostic("M5_ASSEMBLY_SELECTED_EVIDENCE_MISSING", target, [ref.evidenceId]) };
    if (raw.fingerprint !== ref.fingerprint) return { error: diagnostic("M5_ASSEMBLY_SELECTED_FINGERPRINT_MISMATCH", target, [ref.evidenceId]) };
    if (!identityMatches(raw)) return { error: diagnostic("M5_ASSEMBLY_SELECTED_IDENTITY_MISMATCH", target, [ref.evidenceId]) };
    if (!pinSet.has(pinKey(raw))) return { error: diagnostic("M5_ASSEMBLY_SELECTED_PIN_MISMATCH", target, [ref.evidenceId]) };
    return { evidence: raw };
  };

  const material: RawEligibilityEvidence[] = [];
  const diagnosticIds = new Set<string>();
  const missing: M5AssemblyDiagnostic[] = [];
  const ambiguities: M5AssemblyDiagnostic[] = [];
  const evidence: { candidateId: string; assetClass: string; ageDays?: bigint; historySpanDays?: bigint; distinctEligibleVenueCount?: bigint; liquidityMinor?: bigint; volumeMinor?: bigint; marketCapMinor?: bigint; top10HolderConcentrationBps?: bigint; singleHolderConcentrationBps?: bigint; volatilityBps?: bigint; contractVerified?: boolean; suspiciousFlags?: readonly string[]; evidenceIds: readonly string[] } = { candidateId: context.candidateId, assetClass: context.assetClass, evidenceIds: [] };
  const addMaterial = (raw: RawEligibilityEvidence): void => { material.push(raw); };
  const invalidSelected = (item: Resolution): boolean => { if (item.error) { errors.push(item.error); for (const id of item.error.evidenceIds) diagnosticIds.add(id); return true; } return false; };
  const scalar = <T extends RawEligibilityEvidence>(ref: M5EvidenceAuthorityRef | undefined, target: M5AssemblyTarget, predicate: (value: RawEligibilityEvidence) => value is T): T | undefined => {
    if (!ref) { missing.push(diagnostic("M5_ASSEMBLY_AUTHORITY_MISSING", target)); return undefined; }
    const found = resolve(ref, target);
    if (invalidSelected(found)) return undefined;
    if (!predicate(found.evidence!)) { errors.push(diagnostic("M5_ASSEMBLY_SELECTED_KIND_MISMATCH", target, [found.evidence!.evidenceId])); diagnosticIds.add(found.evidence!.evidenceId); return undefined; }
    return found.evidence!;
  };
  const compatibleQuantitative = (raw: QuantitativeEligibilityEvidence, target: M5AssemblyTarget, metric: EligibilityQuantitativeMetric, extra: (value: QuantitativeEligibilityEvidence) => boolean): QuantitativeEligibilityEvidence | undefined => {
    if (raw.metricKind !== metric) { errors.push(diagnostic("M5_ASSEMBLY_SELECTED_METRIC_MISMATCH", target, [raw.evidenceId])); diagnosticIds.add(raw.evidenceId); return undefined; }
    if (!extra(raw)) { errors.push(diagnostic("M5_ASSEMBLY_SELECTED_SEMANTICS_MISMATCH", target, [raw.evidenceId])); diagnosticIds.add(raw.evidenceId); return undefined; }
    return raw;
  };
  const quantity = (ref: M5EvidenceAuthorityRef | undefined, target: M5AssemblyTarget, metric: EligibilityQuantitativeMetric, extra: (value: QuantitativeEligibilityEvidence) => boolean): QuantitativeEligibilityEvidence | undefined => {
    const raw = scalar(ref, target, (value): value is QuantitativeEligibilityEvidence => value.evidenceKind === "QUANTITATIVE");
    return raw ? compatibleQuantitative(raw, target, metric, extra) : undefined;
  };

  const age = scalar(manifest.age, "AGE", (value): value is AgeReferenceEligibilityEvidence => value.evidenceKind === "REFERENCE" && value.referenceKind !== "CONTRACT_VERIFICATION");
  if (age) {
    if (!compatibility.permittedAgeBases.includes(age.ageBasis) || age.referenceKind !== age.ageBasis) { errors.push(diagnostic("M5_ASSEMBLY_AGE_BASIS_MISMATCH", "AGE", [age.evidenceId])); diagnosticIds.add(age.evidenceId); }
    else {
      const ageMilliseconds = BigInt(Date.parse(context.asOf)) - BigInt(Date.parse(age.referenceAt));
      if (ageMilliseconds < 0n) { errors.push(diagnostic("M5_ASSEMBLY_AGE_REFERENCE_FUTURE", "AGE", [age.evidenceId])); diagnosticIds.add(age.evidenceId); }
      else { evidence.ageDays = ageMilliseconds / DAY_MILLISECONDS; addMaterial(age); }
    }
  }

  const history = quantity(manifest.historySpan, "HISTORY_SPAN", "HISTORY_SPAN", value => value.unit === "DAYS" && value.scale === 0 && !!value.window && !!value.qualificationBasis && compatibility.historySpanSemanticsVersions.includes(value.semanticsVersion) && compatibility.historySpanQualificationBases.includes(value.qualificationBasis));
  if (history) { evidence.historySpanDays = history.valueAtoms; addMaterial(history); }
  const monetary = (ref: M5EvidenceAuthorityRef | undefined, target: M5AssemblyTarget, metric: "LIQUIDITY" | "VOLUME" | "MARKET_CAP", versions: readonly string[]): QuantitativeEligibilityEvidence | undefined => quantity(ref, target, metric, value => value.currencyCode === compatibility.monetaryCurrency && value.unit === compatibility.monetaryUnit && value.scale === compatibility.monetaryScale && versions.includes(value.semanticsVersion) && (metric === "MARKET_CAP" || !!value.window));
  const liquidity = monetary(manifest.liquidity, "LIQUIDITY", "LIQUIDITY", compatibility.liquiditySemanticsVersions); if (liquidity) { evidence.liquidityMinor = liquidity.valueAtoms; addMaterial(liquidity); }
  const volume = monetary(manifest.volume, "VOLUME", "VOLUME", compatibility.volumeSemanticsVersions); if (volume) { evidence.volumeMinor = volume.valueAtoms; addMaterial(volume); }
  const marketCap = monetary(manifest.marketCap, "MARKET_CAP", "MARKET_CAP", compatibility.marketCapSemanticsVersions); if (marketCap) { evidence.marketCapMinor = marketCap.valueAtoms; addMaterial(marketCap); }
  const top10 = quantity(manifest.top10HolderConcentration, "TOP10_CONCENTRATION", "TOP10_CONCENTRATION", value => value.unit === "BPS" && value.scale === 0); if (top10) { evidence.top10HolderConcentrationBps = top10.valueAtoms; addMaterial(top10); }
  const single = quantity(manifest.singleHolderConcentration, "SINGLE_CONCENTRATION", "SINGLE_CONCENTRATION", value => value.unit === "BPS" && value.scale === 0); if (single) { evidence.singleHolderConcentrationBps = single.valueAtoms; addMaterial(single); }
  const volatility = quantity(manifest.volatility, "VOLATILITY", "VOLATILITY", value => value.unit === "BPS" && value.scale === 0 && !!value.window && compatibility.volatilitySemanticsVersions.includes(value.semanticsVersion)); if (volatility) { evidence.volatilityBps = volatility.valueAtoms; addMaterial(volatility); }

  if (context.assetClass === "CONTRACT") {
    const contract = scalar(manifest.contractVerification, "CONTRACT_VERIFICATION", (value): value is Extract<RawEligibilityEvidence, { readonly verificationState: string }> => value.evidenceKind === "REFERENCE" && value.referenceKind === "CONTRACT_VERIFICATION");
    if (contract) {
      if (contract.verificationState === "VERIFIED") { evidence.contractVerified = true; addMaterial(contract); }
      else if (contract.verificationState === "UNVERIFIED") { evidence.contractVerified = false; addMaterial(contract); }
      else { missing.push(diagnostic("M5_ASSEMBLY_CONTRACT_VERIFICATION_UNKNOWN", "CONTRACT_VERIFICATION", [contract.evidenceId])); diagnosticIds.add(contract.evidenceId); }
    }
  } else if (manifest.contractVerification) {
    errors.push(diagnostic("M5_ASSEMBLY_CONTRACT_VERIFICATION_NOT_APPLICABLE", "CONTRACT_VERIFICATION", [manifest.contractVerification.evidenceId])); diagnosticIds.add(manifest.contractVerification.evidenceId);
  }

  if (!manifest.venues.length) missing.push(diagnostic("M5_ASSEMBLY_AUTHORITY_MISSING", "VENUES"));
  else {
    const byVenue = new Map<string, VenueEligibilityEvidence[]>();
    const venueAuthorityIds = new Set<string>();
    const venueAuthorityFingerprints = new Set<string>();
    const venueMemberIds = new Set<string>();
    let declaredVenueMemberCount: number | undefined;
    for (const ref of manifest.venues) {
      const found = resolve(ref, "VENUES");
      if (invalidSelected(found)) continue;
      const raw = found.evidence!;
      if (raw.evidenceKind !== "VENUE") { errors.push(diagnostic("M5_ASSEMBLY_SELECTED_KIND_MISMATCH", "VENUES", [raw.evidenceId])); diagnosticIds.add(raw.evidenceId); continue; }
      if (!raw.venueAuthorityId || !raw.venueAuthorityFingerprint || !raw.venueMemberId || !raw.venueMemberFingerprint || raw.venueAuthorityMemberCount === undefined || raw.venueMemberId !== raw.venueId || venueMemberIds.has(raw.venueMemberId)) { errors.push(diagnostic("M5_ASSEMBLY_VENUE_AUTHORITY_BINDING_INVALID", "VENUES", [raw.evidenceId])); diagnosticIds.add(raw.evidenceId); }
      else { venueAuthorityIds.add(raw.venueAuthorityId); venueAuthorityFingerprints.add(raw.venueAuthorityFingerprint); venueMemberIds.add(raw.venueMemberId); declaredVenueMemberCount = declaredVenueMemberCount ?? raw.venueAuthorityMemberCount; if (declaredVenueMemberCount !== raw.venueAuthorityMemberCount) { errors.push(diagnostic("M5_ASSEMBLY_VENUE_AUTHORITY_SET_INVALID", "VENUES", [raw.evidenceId])); diagnosticIds.add(raw.evidenceId); } }
      const values = byVenue.get(raw.venueId) ?? []; values.push(raw); byVenue.set(raw.venueId, values);
    }
    if (venueAuthorityIds.size > 0 && (venueAuthorityIds.size !== 1 || venueAuthorityFingerprints.size !== 1 || declaredVenueMemberCount !== venueMemberIds.size)) { errors.push(diagnostic("M5_ASSEMBLY_VENUE_AUTHORITY_SET_INVALID", "VENUES", [...venueMemberIds])); }
    let conflict = false;
    let eligible = 0n;
    const resolvedVenueEvidence: VenueEligibilityEvidence[] = [];
    for (const [venueId, values] of [...byVenue.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const states = new Set(values.map(value => value.eligibilityState));
      if (states.size !== 1) { conflict = true; const ids = values.map(value => value.evidenceId); ambiguities.push(diagnostic("M5_ASSEMBLY_VENUE_STATE_AMBIGUOUS", "VENUES", ids)); ids.forEach(id => diagnosticIds.add(id)); continue; }
      resolvedVenueEvidence.push(...values);
      if (values[0]!.eligibilityState === "ELIGIBLE") eligible += 1n;
      void venueId;
    }
    if (!conflict) { evidence.distinctEligibleVenueCount = eligible; resolvedVenueEvidence.forEach(addMaterial); }
  }

  const allVisibleSuspicious = input.rawEvidence.filter(raw => raw.evidenceKind === "SUSPICIOUS" && identityMatches(raw) && pinSet.has(pinKey(raw)));
  const visibleRefs = allVisibleSuspicious.map(raw => `${raw.evidenceId}\u0000${raw.fingerprint}`).sort();
  const assessmentRefs = findingReferences.map(ref => `${ref.evidenceId}\u0000${ref.fingerprint}`).sort();
  if (visibleRefs.length !== assessmentRefs.length || visibleRefs.some((value, index) => value !== assessmentRefs[index])) {
    errors.push(diagnostic("M5_ASSEMBLY_SUSPICIOUS_AUTHORITATIVE_SET_MISMATCH", "SUSPICIOUS", allVisibleSuspicious.map(value => value.evidenceId)));
  }
  const flags: string[] = [];
  for (const raw of suspiciousFindings) { flags.push(raw.flagCode); addMaterial(raw); }
  evidence.suspiciousFlags = normalizedStrings(flags, "M5_ASSEMBLY_SUSPICIOUS_INVALID");

  if (errors.length) return invalid(errors, diagnosticIds);
  const materialById = new Map<string, RawEligibilityEvidence>();
  material.forEach(raw => materialById.set(raw.evidenceId, raw));
  const materialValues = [...materialById.values()].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  const materialEvidenceIds = frozenArray(materialValues.map(value => value.evidenceId));
  evidence.evidenceIds = materialEvidenceIds;
  const materialDatasetPins = frozenArray([...new Map(materialValues.map(value => [pinKey(value), freeze({ providerId: value.providerId, datasetId: value.datasetId, datasetVersion: value.datasetVersion })])).values()].sort((a, b) => pinKey(a).localeCompare(pinKey(b))));
  const materialAvailableAt = materialValues.length ? materialValues.map(value => value.availableAt).sort((a, b) => a.localeCompare(b)).at(-1)! : null;
  const diagnostics = frozenArray([...missing, ...ambiguities].sort((a, b) => a.target.localeCompare(b.target) || a.code.localeCompare(b.code) || a.evidenceIds.join("\u0000").localeCompare(b.evidenceIds.join("\u0000"))));
  const fingerprint = assemblyFingerprint(context, manifest, compatibility, materialValues, diagnostics, assessment);
  const frozenEvidence: EligibilityEvidence = freeze({ ...evidence, suspiciousFlags: frozenArray(evidence.suspiciousFlags ?? []), evidenceIds: materialEvidenceIds });
  const diagnosticEvidenceIds = frozenArray([...diagnosticIds].sort((a, b) => a.localeCompare(b)));
  if (errors.length) return invalid(errors, diagnosticIds);
  if (missing.length || ambiguities.length) return freeze({ status: "INCOMPLETE", context, evidence: frozenEvidence, missingRequirements: frozenArray(missing), ambiguityDiagnostics: frozenArray(ambiguities), materialEvidenceIds, diagnosticEvidenceIds, materialDatasetPins, materialAvailableAt, assemblyFingerprint: fingerprint, assemblyVersion: M5_EVIDENCE_ASSEMBLY_VERSION, suspiciousAssessmentId: assessment.suspiciousAssessmentId, suspiciousAssessmentFingerprint: assessment.fingerprint, suspiciousAssessmentResult: assessment.result });
  if (!materialAvailableAt) return freeze({ status: "INCOMPLETE", context, evidence: frozenEvidence, missingRequirements: frozenArray([diagnostic("M5_ASSEMBLY_MATERIAL_EVIDENCE_MISSING", "AGE")]), ambiguityDiagnostics: frozenArray([]), materialEvidenceIds, diagnosticEvidenceIds, materialDatasetPins, materialAvailableAt: null, assemblyFingerprint: fingerprint, assemblyVersion: M5_EVIDENCE_ASSEMBLY_VERSION, suspiciousAssessmentId: assessment.suspiciousAssessmentId, suspiciousAssessmentFingerprint: assessment.fingerprint, suspiciousAssessmentResult: assessment.result });
  return freeze({ status: "COMPLETE", context, evidence: frozenEvidence, materialEvidenceIds, diagnosticEvidenceIds, materialDatasetPins, materialAvailableAt, assemblyFingerprint: fingerprint, assemblyVersion: M5_EVIDENCE_ASSEMBLY_VERSION, suspiciousAssessmentId: assessment.suspiciousAssessmentId, suspiciousAssessmentFingerprint: assessment.fingerprint, suspiciousAssessmentResult: assessment.result });
}

function invalid(errors: readonly M5AssemblyDiagnostic[], ids: ReadonlySet<string> = new Set()): InvalidManifestAssembly {
  const diagnosticEvidenceIds = frozenArray([...new Set([...ids, ...errors.flatMap(error => error.evidenceIds)])].sort((a, b) => a.localeCompare(b)));
  return freeze({ status: "INVALID_MANIFEST", errors: frozenArray([...errors].sort((a, b) => a.target.localeCompare(b.target) || a.code.localeCompare(b.code) || a.evidenceIds.join("\u0000").localeCompare(b.evidenceIds.join("\u0000")))), diagnosticEvidenceIds, assemblyVersion: M5_EVIDENCE_ASSEMBLY_VERSION });
}
