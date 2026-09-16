import { evaluateAssetEligibility, type EligibilityEvaluation } from "@/domain/discovery/asset-eligibility";
import { encodeM5DatasetPin, normalizeM5DatasetPinValues, normalizeM5DatasetPins } from "@/domain/intelligence/m5-dataset-pin";
import { canonicalContextIdForProducerContext, validateCanonicalProducerSourceContext, type CanonicalProducerSourceContext } from "./canonical-producer-context";
import type { M5AssemblyDiagnostic, M5EvidenceAssemblyResult } from "./assemble-m5-evidence";

export interface CanonicalM5Input {
  readonly evaluation: EligibilityEvaluation;
  readonly canonicalIdentifier: string;
  readonly assetClass: string;
  readonly canonicalContextId: string;
  readonly availableAt: Date;
  readonly evidenceIds: readonly string[];
  readonly datasetPins: readonly string[];
  readonly suspiciousFlags: readonly string[];
  readonly suspiciousEvidenceStatus: "CLEAN" | "SUSPICIOUS";
  readonly assemblyFingerprint: string;
}

export type CanonicalM5HandoffResult =
  | { readonly status: "READY"; readonly evaluatorResult: EligibilityEvaluation; readonly canonicalInput: CanonicalM5Input; readonly assemblyFingerprint: string; readonly normalizedPins: readonly string[] }
  | { readonly status: "INCOMPLETE"; readonly evaluatorResult: EligibilityEvaluation; readonly missingRequirements: readonly M5AssemblyDiagnostic[]; readonly ambiguityDiagnostics: readonly M5AssemblyDiagnostic[]; readonly diagnosticEvidenceIds: readonly string[]; readonly assemblyFingerprint: string }
  | { readonly status: "INVALID_ASSEMBLY"; readonly errors: readonly M5AssemblyDiagnostic[]; readonly diagnosticEvidenceIds: readonly string[] };

type ValidAssembly = Exclude<M5EvidenceAssemblyResult, { status: "INVALID_MANIFEST" }>;

const normalizedEvidenceIds = (values: readonly string[]): readonly string[] => {
  const ids = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) throw new Error("CANONICAL_M5_EVIDENCE_IDS_INVALID");
    const id = value.trim();
    if (ids.has(id)) throw new Error("CANONICAL_M5_EVIDENCE_IDS_DUPLICATE");
    ids.add(id);
  }
  return Object.freeze([...ids].sort());
};
const sameValues = (left: readonly string[], right: readonly string[]): boolean => left.length === right.length && left.every((value, index) => value === right[index]);
const assertExactMaterialEvidenceIds = (assembly: ValidAssembly): readonly string[] => {
  const evidenceIds = normalizedEvidenceIds(assembly.evidence.evidenceIds ?? []);
  const materialEvidenceIds = normalizedEvidenceIds(assembly.materialEvidenceIds);
  if (!sameValues(evidenceIds, materialEvidenceIds)) throw new Error("CANONICAL_M5_EVIDENCE_IDS_MISMATCH");
  return materialEvidenceIds;
};
const assertAssemblyContext = (assembly: ValidAssembly, source: CanonicalProducerSourceContext): CanonicalProducerSourceContext => {
  const context = validateCanonicalProducerSourceContext(source);
  const value = assembly.context;
  if (value.candidateId !== context.candidateId || value.assetId !== context.assetId || value.canonicalIdentifier !== context.canonicalIdentifier || value.assetClass !== context.assetClass || value.asOf !== context.asOf) throw new Error("CANONICAL_M5_ASSEMBLY_CONTEXT_MISMATCH");
  return context;
};
const normalizedPins = (assembly: ValidAssembly): readonly string[] => normalizeM5DatasetPins(normalizeM5DatasetPinValues(assembly.materialDatasetPins).map(encodeM5DatasetPin));

/** Pure assembly-to-canonical adapter. Persistence is deliberately a separate boundary. */
export function canonicalM5HandoffFromAssembly(input: { readonly assembly: M5EvidenceAssemblyResult; readonly sourceContext: CanonicalProducerSourceContext }): CanonicalM5HandoffResult {
  if (input.assembly.status === "INVALID_MANIFEST") return Object.freeze({ status: "INVALID_ASSEMBLY", errors: input.assembly.errors, diagnosticEvidenceIds: input.assembly.diagnosticEvidenceIds });
  if (!input.assembly.assemblyFingerprint.trim()) throw new Error("CANONICAL_M5_ASSEMBLY_FINGERPRINT_INVALID");
  const sourceContext = assertAssemblyContext(input.assembly, input.sourceContext);
  const evidenceIds = assertExactMaterialEvidenceIds(input.assembly);
  const evaluation = evaluateAssetEligibility(input.assembly.evidence, new Date(sourceContext.asOf));
  if (input.assembly.status === "INCOMPLETE" || evaluation.status === "INCOMPLETE") return Object.freeze({ status: "INCOMPLETE", evaluatorResult: evaluation, missingRequirements: input.assembly.status === "INCOMPLETE" ? input.assembly.missingRequirements : Object.freeze([]), ambiguityDiagnostics: input.assembly.status === "INCOMPLETE" ? input.assembly.ambiguityDiagnostics : Object.freeze([]), diagnosticEvidenceIds: input.assembly.status === "INCOMPLETE" ? input.assembly.diagnosticEvidenceIds : Object.freeze([]), assemblyFingerprint: input.assembly.assemblyFingerprint });
  if (!input.assembly.materialAvailableAt) throw new Error("CANONICAL_M5_MATERIAL_AVAILABLE_AT_MISSING");
  const availableAt = new Date(input.assembly.materialAvailableAt);
  if (!Number.isFinite(availableAt.getTime()) || availableAt > new Date(sourceContext.asOf)) throw new Error("CANONICAL_M5_MATERIAL_AVAILABLE_AT_INVALID");
  const pins = normalizedPins(input.assembly);
  const canonicalInput: CanonicalM5Input = Object.freeze({ evaluation, canonicalIdentifier: sourceContext.canonicalIdentifier, assetClass: sourceContext.assetClass, canonicalContextId: canonicalContextIdForProducerContext(sourceContext), availableAt, evidenceIds, datasetPins: pins, suspiciousFlags: Object.freeze([...(input.assembly.evidence.suspiciousFlags ?? [])].sort()), suspiciousEvidenceStatus: input.assembly.evidence.suspiciousFlags?.length ? "SUSPICIOUS" : "CLEAN", assemblyFingerprint: input.assembly.assemblyFingerprint });
  return Object.freeze({ status: "READY", evaluatorResult: evaluation, canonicalInput, assemblyFingerprint: input.assembly.assemblyFingerprint, normalizedPins: pins });
}
