import "server-only";
import type { EligibilityEvaluation } from "@/domain/discovery/asset-eligibility";
import type { RawEligibilityEvidenceRepository } from "@/infrastructure/postgres/eligibility-evidence-repository";
import { assembleM5Evidence, normalizeM5AssemblyContext, normalizeM5EvidenceManifest, normalizeM5EvidenceSemanticCompatibility, type M5AssemblyDiagnostic, type M5DatasetPin, type M5EvidenceAssemblyResult, type M5EvidenceManifest, type M5EvidenceSemanticCompatibility } from "./assemble-m5-evidence";
import { canonicalM5HandoffFromAssembly, type CanonicalM5HandoffResult, type CanonicalM5Input } from "./m5-canonical-handoff";
import { persistCanonicalM5Eligibility } from "./persist-canonical-evidence";
import { normalizeProducerDatasetPins, validateCanonicalProducerSourceContext, type CanonicalProducerSourceContext } from "./canonical-producer-context";
import type { M5SuspiciousAssessmentReadCapability } from "./m5-suspicious-assessment-repository";
import type { M5SuspiciousRuleSetAuthorityResolver } from "@/domain/intelligence/m5-suspicious-rule-set";

export interface ProduceCanonicalM5Input {
  readonly sourceContext: CanonicalProducerSourceContext;
  readonly manifest: M5EvidenceManifest;
  readonly compatibility: M5EvidenceSemanticCompatibility;
  readonly allowedDatasetPins: readonly M5DatasetPin[];
}

export interface M5ProducerDependencies {
  readonly rawEvidenceRepository: Pick<RawEligibilityEvidenceRepository, "readAt">;
  readonly suspiciousAssessmentRepository: M5SuspiciousAssessmentReadCapability;
  readonly suspiciousRuleSetResolver: M5SuspiciousRuleSetAuthorityResolver;
  readonly persistCanonicalM5: (input: { readonly canonicalInput: CanonicalM5Input; readonly sourceContext: CanonicalProducerSourceContext }) => Promise<void>;
}

export type CanonicalM5ProducerResult =
  | {
      readonly status: "PERSISTED";
      readonly evaluatorResult: EligibilityEvaluation;
      readonly canonicalInput: CanonicalM5Input;
      readonly assemblyFingerprint: string;
    }
  | {
      readonly status: "INCOMPLETE";
      readonly missingRequirements: readonly M5AssemblyDiagnostic[];
      readonly ambiguityDiagnostics: readonly M5AssemblyDiagnostic[];
      readonly diagnosticEvidenceIds: readonly string[];
      readonly assemblyFingerprint: string;
    }
  | {
      readonly status: "INVALID_ASSEMBLY";
      readonly errors: readonly M5AssemblyDiagnostic[];
      readonly diagnosticEvidenceIds: readonly string[];
    };

const invalid = (error: unknown): CanonicalM5ProducerResult => ({
  status: "INVALID_ASSEMBLY",
  errors: [
    Object.freeze({
      code: error instanceof Error ? error.message : "M5_PRODUCER_INPUT_INVALID",
      target: "AGE",
      evidenceIds: Object.freeze([]),
    }),
  ],
  diagnosticEvidenceIds: Object.freeze([]),
});

const pinIdentity = (pin: Pick<M5DatasetPin, "providerId" | "datasetVersion">): string => `${pin.providerId}\u0000${pin.datasetVersion}`;

function validateAllowedPins(sourceContext: CanonicalProducerSourceContext, pins: readonly M5DatasetPin[]): readonly M5DatasetPin[] {
  const normalizedSourcePins = normalizeProducerDatasetPins(sourceContext.providerDatasetPins);
  const sourcePinIds = new Set(normalizedSourcePins.map(pinIdentity));
  const normalized = normalizeM5AssemblyContext({
    candidateId: sourceContext.candidateId,
    assetId: sourceContext.assetId,
    canonicalIdentifier: sourceContext.canonicalIdentifier,
    assetClass: sourceContext.assetClass,
    asOf: sourceContext.asOf,
    allowedPins: pins,
  }).allowedPins;
  if (normalized.some(pin => !sourcePinIds.has(pinIdentity(pin)))) throw new Error("M5_PRODUCER_ALLOWED_PIN_NOT_IN_SOURCE_CONTEXT");
  if (normalizedSourcePins.some(pin => !normalized.some(value => pinIdentity(value) === pinIdentity(pin)))) {
    throw new Error("M5_PRODUCER_SOURCE_PIN_NOT_ALLOWED");
  }
  return normalized;
}

function validateInput(input: ProduceCanonicalM5Input): { readonly sourceContext: CanonicalProducerSourceContext; readonly allowedPins: readonly M5DatasetPin[] } {
  const sourceContext = validateCanonicalProducerSourceContext(input.sourceContext);
  const allowedPins = validateAllowedPins(sourceContext, input.allowedDatasetPins);
  normalizeM5EvidenceManifest(input.manifest);
  normalizeM5EvidenceSemanticCompatibility(input.compatibility);
  return { sourceContext, allowedPins };
}

function incomplete(result: Extract<CanonicalM5HandoffResult, { status: "INCOMPLETE" }>): CanonicalM5ProducerResult {
  return Object.freeze({
    status: "INCOMPLETE",
    missingRequirements: result.missingRequirements,
    ambiguityDiagnostics: result.ambiguityDiagnostics,
    diagnosticEvidenceIds: result.diagnosticEvidenceIds,
    assemblyFingerprint: result.assemblyFingerprint,
  });
}

const assessmentIncomplete = (code: string): CanonicalM5ProducerResult => Object.freeze({ status: "INCOMPLETE", missingRequirements: Object.freeze([{ code, target: "SUSPICIOUS" as const, evidenceIds: Object.freeze([]) }]), ambiguityDiagnostics: Object.freeze([]), diagnosticEvidenceIds: Object.freeze([]), assemblyFingerprint: "" });

function invalidAssembly(result: Extract<CanonicalM5HandoffResult, { status: "INVALID_ASSEMBLY" }>): CanonicalM5ProducerResult {
  return Object.freeze({ status: "INVALID_ASSEMBLY", errors: result.errors, diagnosticEvidenceIds: result.diagnosticEvidenceIds });
}

/**
 * Runs the server-side M5 producer boundary. Authority is supplied by the caller;
 * this function only reads the scoped raw evidence, assembles it, hands it to the
 * evaluator adapter, and persists a ready canonical result exactly once.
 */
export async function produceCanonicalM5(input: ProduceCanonicalM5Input, dependencies: M5ProducerDependencies): Promise<CanonicalM5ProducerResult> {
  let validated: ReturnType<typeof validateInput>;
  try {
    validated = validateInput(input);
  } catch (error) {
    return invalid(error);
  }

  const { sourceContext, allowedPins } = validated;
  let sealed: Awaited<ReturnType<M5SuspiciousAssessmentReadCapability["readSealedById"]>>;
  try { sealed = await dependencies.suspiciousAssessmentRepository.readSealedById(input.manifest.suspiciousAssessment.assessmentId); }
  catch (error) { if (error instanceof Error && error.message.startsWith("M5_SUSPICIOUS_ASSESSMENT_")) return invalid(error); throw error; }
  if (!sealed) return assessmentIncomplete("M5_ASSEMBLY_SUSPICIOUS_ASSESSMENT_MISSING");
  const assessment = sealed.assessment;
  if (assessment.suspiciousAssessmentId !== input.manifest.suspiciousAssessment.assessmentId || assessment.fingerprint !== input.manifest.suspiciousAssessment.fingerprint || assessment.candidateId !== sourceContext.candidateId || assessment.assetId !== sourceContext.assetId || assessment.canonicalIdentifier !== sourceContext.canonicalIdentifier || assessment.assetClass !== sourceContext.assetClass || assessment.asOf !== sourceContext.asOf || !allowedPins.some(pin => pin.providerId === assessment.providerId && pin.datasetId === assessment.datasetId && pin.datasetVersion === assessment.datasetVersion)) return invalid(new Error("M5_ASSEMBLY_SUSPICIOUS_ASSESSMENT_SCOPE_MISMATCH"));
  let ruleSet;
  try { ruleSet = await dependencies.suspiciousRuleSetResolver.resolve({ providerId: assessment.providerId, datasetId: assessment.datasetId, datasetVersion: assessment.datasetVersion, ruleSetVersion: assessment.ruleSetVersion, detectorVersion: assessment.detectorVersion }); } catch (error) { return invalid(error); }
  if (!ruleSet || ruleSet.fingerprint !== assessment.ruleSetFingerprint) return invalid(new Error("M5_ASSEMBLY_SUSPICIOUS_RULE_SET_INVALID"));
  const rawEvidence = await dependencies.rawEvidenceRepository.readAt({
    candidateId: sourceContext.candidateId,
    assetId: sourceContext.assetId,
    canonicalIdentifier: sourceContext.canonicalIdentifier,
    assetClass: sourceContext.assetClass,
    asOf: sourceContext.asOf,
    pins: allowedPins,
  });
  const assemblyContext = normalizeM5AssemblyContext({
    candidateId: sourceContext.candidateId,
    assetId: sourceContext.assetId,
    canonicalIdentifier: sourceContext.canonicalIdentifier,
    assetClass: sourceContext.assetClass,
    asOf: sourceContext.asOf,
    allowedPins,
  });
  const assembly: M5EvidenceAssemblyResult = assembleM5Evidence({
    context: assemblyContext,
    manifest: input.manifest,
    compatibility: input.compatibility,
    rawEvidence,
    suspiciousAssessment: assessment,
    suspiciousFindings: rawEvidence.filter(value => value.evidenceKind === "SUSPICIOUS"),
    requiredRuleIds: ruleSet.requiredRuleIds,
  });
  const handoff = canonicalM5HandoffFromAssembly({ assembly, sourceContext });
  if (handoff.status === "INVALID_ASSEMBLY") return invalidAssembly(handoff);
  if (handoff.status === "INCOMPLETE") return incomplete(handoff);

  await dependencies.persistCanonicalM5({ canonicalInput: handoff.canonicalInput, sourceContext });
  return Object.freeze({ status: "PERSISTED", evaluatorResult: handoff.evaluatorResult, canonicalInput: handoff.canonicalInput, assemblyFingerprint: handoff.assemblyFingerprint });
}

/** Production wiring remains explicit and server-only; tests inject both boundaries. */
export function createCanonicalM5Producer(dependencies: Omit<M5ProducerDependencies, "persistCanonicalM5"> & Partial<Pick<M5ProducerDependencies, "persistCanonicalM5">>): (input: ProduceCanonicalM5Input) => Promise<CanonicalM5ProducerResult> {
  return input => produceCanonicalM5(input, {
    rawEvidenceRepository: dependencies.rawEvidenceRepository,
    suspiciousAssessmentRepository: dependencies.suspiciousAssessmentRepository,
    suspiciousRuleSetResolver: dependencies.suspiciousRuleSetResolver,
    persistCanonicalM5: dependencies.persistCanonicalM5 ?? persistCanonicalM5Eligibility,
  });
}
