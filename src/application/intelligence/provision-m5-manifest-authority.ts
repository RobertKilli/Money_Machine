import { assembleM5Evidence, normalizeM5AssemblyContext, normalizeM5EvidenceManifest, normalizeM5EvidenceSemanticCompatibility, type M5AssemblyDiagnostic, type M5DatasetPin } from "./assemble-m5-evidence";
import { canonicalContextIdForProducerContext, validateCanonicalProducerSourceContext, type CanonicalProducerSourceContext } from "./canonical-producer-context";
import { createM5ManifestAuthority, type M5ManifestAuthorityRecord } from "./m5-manifest-authority";
import type { M5ManifestAuthorityConfig } from "./m5-manifest-authority-config";
import type { M5ManifestAuthorityRepository } from "./m5-manifest-authority-repository";
import type { RawEligibilityEvidenceRepository } from "@/infrastructure/postgres/eligibility-evidence-repository";

export type M5ManifestAuthorityProvisioningMode = "DRY_RUN" | "APPLY";

export interface M5ManifestAuthorityProvisioningDependencies {
  readonly rawEvidenceRepository: Pick<RawEligibilityEvidenceRepository, "readAt">;
  readonly authorityRepository: Pick<M5ManifestAuthorityRepository, "save">;
}

export interface M5ManifestAuthorityPreview {
  readonly configIdentifier?: string;
  readonly sourceIdentity: Readonly<{ candidateId: string; assetId: string; canonicalIdentifier: string; assetClass: string }>;
  readonly asOf: string;
  readonly canonicalContextId: string;
  readonly authorityVersion: string;
  readonly manifestAuthorityId: string;
  readonly fingerprint: string;
  readonly allowedDatasetPins: readonly M5DatasetPin[];
  readonly materialEvidence: readonly Readonly<{ evidenceId: string; fingerprint: string }>[];
}

export type M5ProvisioningDiagnosticScope = "CONFIG" | "CONTEXT" | "DATASET_PINS" | "AUTHORITY" | "ASSEMBLY";

export interface M5ProvisioningDiagnostic {
  readonly code: string;
  readonly scope: M5ProvisioningDiagnosticScope;
  readonly assemblyTarget?: M5AssemblyDiagnostic["target"];
  readonly evidenceIds: readonly string[];
}

export type M5ManifestAuthorityProvisioningResult =
  | { readonly status: "DRY_RUN_COMPLETE"; readonly preview: M5ManifestAuthorityPreview }
  | { readonly status: "DRY_RUN_INCOMPLETE"; readonly preview: Readonly<Pick<M5ManifestAuthorityPreview, "sourceIdentity" | "asOf" | "canonicalContextId" | "authorityVersion">>; readonly missingRequirements: readonly M5ProvisioningDiagnostic[]; readonly ambiguityDiagnostics: readonly M5ProvisioningDiagnostic[]; readonly diagnosticEvidenceIds: readonly string[] }
  | { readonly status: "DRY_RUN_INVALID"; readonly preview?: Readonly<Pick<M5ManifestAuthorityPreview, "sourceIdentity" | "asOf" | "canonicalContextId" | "authorityVersion">>; readonly errors: readonly M5ProvisioningDiagnostic[]; readonly diagnosticEvidenceIds: readonly string[] }
  | { readonly status: "APPLIED"; readonly preview: M5ManifestAuthorityPreview };

const scopeForCode = (code: string): Exclude<M5ProvisioningDiagnosticScope, "ASSEMBLY"> => {
  if (code.startsWith("PRODUCER_")) return "CONTEXT";
  if (code.includes("PIN") || code.includes("DATASET")) return "DATASET_PINS";
  if (code.startsWith("M5_MANIFEST_AUTHORITY_") || code.startsWith("M5_AUTHORITY_")) return "AUTHORITY";
  return "CONFIG";
};
const invalidDiagnostic = (error: unknown): M5ProvisioningDiagnostic => Object.freeze({ code: error instanceof Error ? error.message : "M5_AUTHORITY_INPUT_INVALID", scope: scopeForCode(error instanceof Error ? error.message : "M5_AUTHORITY_INPUT_INVALID"), evidenceIds: Object.freeze([]) });
const assemblyDiagnostic = (diagnostic: M5AssemblyDiagnostic): M5ProvisioningDiagnostic => Object.freeze({ code: diagnostic.code, scope: "ASSEMBLY", assemblyTarget: diagnostic.target, evidenceIds: Object.freeze([...diagnostic.evidenceIds]) });
const pinKey = (pin: Pick<M5DatasetPin, "providerId" | "datasetId" | "datasetVersion">): string => `${pin.providerId}\u0000${pin.datasetId}\u0000${pin.datasetVersion}`;
const contextPreview = (context: CanonicalProducerSourceContext, authorityVersion: string) => ({ sourceIdentity: { candidateId: context.candidateId, assetId: context.assetId, canonicalIdentifier: context.canonicalIdentifier, assetClass: context.assetClass }, asOf: context.asOf, canonicalContextId: canonicalContextIdForProducerContext(context), authorityVersion });

function exactMaterialPins(allowed: readonly M5DatasetPin[], material: readonly M5DatasetPin[]): void {
  const allowedKeys = [...new Set(allowed.map(pinKey))].sort();
  const materialKeys = [...new Set(material.map(pinKey))].sort();
  if (allowedKeys.length !== materialKeys.length || allowedKeys.some((value, index) => value !== materialKeys[index])) throw new Error("M5_AUTHORITY_DATASET_PINS_MATERIAL_MISMATCH");
}

function preview(record: M5ManifestAuthorityRecord, rawEvidence: readonly { evidenceId: string; fingerprint: string }[], configIdentifier?: string): M5ManifestAuthorityPreview {
  return Object.freeze({ configIdentifier, sourceIdentity: Object.freeze({ candidateId: record.candidateId, assetId: record.assetId, canonicalIdentifier: record.canonicalIdentifier, assetClass: record.assetClass }), asOf: record.asOf, canonicalContextId: record.canonicalContextId, authorityVersion: record.authorityVersion, manifestAuthorityId: record.manifestAuthorityId, fingerprint: record.fingerprint, allowedDatasetPins: Object.freeze(record.allowedDatasetPins.map(pin => Object.freeze({ ...pin }))), materialEvidence: Object.freeze([...rawEvidence].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId)).map(value => Object.freeze({ evidenceId: value.evidenceId, fingerprint: value.fingerprint }))) });
}

export async function provisionM5ManifestAuthority(config: M5ManifestAuthorityConfig, mode: M5ManifestAuthorityProvisioningMode, dependencies: M5ManifestAuthorityProvisioningDependencies): Promise<M5ManifestAuthorityProvisioningResult> {
  if (mode !== "DRY_RUN" && mode !== "APPLY") throw new Error("M5_AUTHORITY_PROVISIONING_MODE_INVALID");
  let sourceContext: CanonicalProducerSourceContext;
  let authorityVersion: string;
  let manifest: M5ManifestAuthorityConfig["manifest"];
  let compatibility: M5ManifestAuthorityConfig["compatibility"];
  let allowedDatasetPins: readonly M5DatasetPin[];
  try {
    sourceContext = validateCanonicalProducerSourceContext(config.sourceContext);
    authorityVersion = config.authorityVersion.trim();
    if (!authorityVersion) throw new Error("M5_MANIFEST_AUTHORITY_VERSION_INVALID");
    manifest = normalizeM5EvidenceManifest(config.manifest);
    compatibility = normalizeM5EvidenceSemanticCompatibility(config.compatibility);
    allowedDatasetPins = [...config.allowedDatasetPins];
    normalizeM5AssemblyContext({ candidateId: sourceContext.candidateId, assetId: sourceContext.assetId, canonicalIdentifier: sourceContext.canonicalIdentifier, assetClass: sourceContext.assetClass, asOf: sourceContext.asOf, allowedPins: allowedDatasetPins });
  } catch (error) {
    return Object.freeze({ status: "DRY_RUN_INVALID", errors: Object.freeze([invalidDiagnostic(error)]), diagnosticEvidenceIds: Object.freeze([]) });
  }
  const base = contextPreview(sourceContext, authorityVersion);
  const rawEvidence = await dependencies.rawEvidenceRepository.readAt({ candidateId: sourceContext.candidateId, assetId: sourceContext.assetId, canonicalIdentifier: sourceContext.canonicalIdentifier, assetClass: sourceContext.assetClass, asOf: sourceContext.asOf, pins: allowedDatasetPins });
  const assembly = assembleM5Evidence({ context: normalizeM5AssemblyContext({ candidateId: sourceContext.candidateId, assetId: sourceContext.assetId, canonicalIdentifier: sourceContext.canonicalIdentifier, assetClass: sourceContext.assetClass, asOf: sourceContext.asOf, allowedPins: allowedDatasetPins }), manifest, compatibility, rawEvidence });
  if (assembly.status === "INVALID_MANIFEST") return Object.freeze({ status: "DRY_RUN_INVALID", preview: base, errors: assembly.errors.map(assemblyDiagnostic), diagnosticEvidenceIds: assembly.diagnosticEvidenceIds });
  if (assembly.status === "INCOMPLETE") return Object.freeze({ status: "DRY_RUN_INCOMPLETE", preview: base, missingRequirements: assembly.missingRequirements.map(assemblyDiagnostic), ambiguityDiagnostics: assembly.ambiguityDiagnostics.map(assemblyDiagnostic), diagnosticEvidenceIds: assembly.diagnosticEvidenceIds });
  let record: M5ManifestAuthorityRecord;
  let materialEvidence: readonly { evidenceId: string; fingerprint: string }[];
  try {
    exactMaterialPins(allowedDatasetPins, assembly.materialDatasetPins);
    record = createM5ManifestAuthority({ sourceContext, authorityVersion, manifest, compatibility, allowedDatasetPins });
    materialEvidence = assembly.materialEvidenceIds.map(evidenceId => {
      const evidence = rawEvidence.find(value => value.evidenceId === evidenceId);
      if (!evidence) throw new Error("M5_AUTHORITY_MATERIAL_EVIDENCE_MISSING");
      return { evidenceId: evidence.evidenceId, fingerprint: evidence.fingerprint };
    });
  } catch (error) {
    return Object.freeze({ status: "DRY_RUN_INVALID", preview: base, errors: Object.freeze([invalidDiagnostic(error)]), diagnosticEvidenceIds: Object.freeze([]) });
  }
  const resultPreview = preview(record, materialEvidence, config.metadata?.configIdentifier);
  if (mode === "APPLY") await dependencies.authorityRepository.save(record);
  return Object.freeze({ status: mode === "APPLY" ? "APPLIED" : "DRY_RUN_COMPLETE", preview: resultPreview });
}
