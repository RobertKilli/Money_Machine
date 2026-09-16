import "server-only";
import { canonicalContextIdForProducerContext, validateCanonicalProducerSourceContext, type CanonicalProducerSourceContext } from "./canonical-producer-context";
import { produceCanonicalM5, type CanonicalM5ProducerResult, type ProduceCanonicalM5Input } from "./produce-canonical-m5";
import type { M5ManifestAuthorityRepository } from "./m5-manifest-authority-repository";

export interface ProduceCanonicalM5FromAuthorityInput {
  readonly manifestAuthorityId: string;
  readonly sourceContext: CanonicalProducerSourceContext;
}

export interface M5AuthorityProducerDependencies {
  readonly authorityRepository: Pick<M5ManifestAuthorityRepository, "readById">;
  readonly produce: (input: ProduceCanonicalM5Input) => Promise<CanonicalM5ProducerResult>;
}

const invalidAuthority = (code: string): CanonicalM5ProducerResult => ({
  status: "INVALID_ASSEMBLY",
  errors: [{ code, target: "AGE", evidenceIds: [] }],
  diagnosticEvidenceIds: [],
});

type ContextIdentity = Pick<CanonicalProducerSourceContext, "candidateId" | "assetId" | "canonicalIdentifier" | "assetClass" | "asOf">;
const sameContext = (left: ContextIdentity, right: ContextIdentity): boolean => left.candidateId === right.candidateId && left.assetId === right.assetId && left.canonicalIdentifier === right.canonicalIdentifier && left.assetClass === right.assetClass && left.asOf === right.asOf;

/** Reads exactly one configured authority revision; callers cannot override its material inputs. */
export async function produceCanonicalM5FromAuthority(input: ProduceCanonicalM5FromAuthorityInput, dependencies: M5AuthorityProducerDependencies): Promise<CanonicalM5ProducerResult> {
  let sourceContext: CanonicalProducerSourceContext;
  try { sourceContext = validateCanonicalProducerSourceContext(input.sourceContext); } catch (error) { return invalidAuthority(error instanceof Error ? error.message : "M5_MANIFEST_AUTHORITY_SOURCE_INVALID"); }
  let authority;
  try {
    authority = await dependencies.authorityRepository.readById(input.manifestAuthorityId);
  } catch (error) {
    if (error instanceof Error && error.message === "M5_MANIFEST_AUTHORITY_NOT_FOUND") return invalidAuthority(error.message);
    throw error;
  }
  const expectedContextId = canonicalContextIdForProducerContext(sourceContext);
  if (!sameContext(authority, sourceContext) || authority.canonicalContextId !== expectedContextId) return invalidAuthority("M5_MANIFEST_AUTHORITY_SOURCE_CONTEXT_MISMATCH");
  return dependencies.produce({
    sourceContext,
    manifest: authority.manifest,
    compatibility: authority.compatibility,
    allowedDatasetPins: authority.allowedDatasetPins,
  });
}

export function createCanonicalM5ProducerFromAuthority(dependencies: Omit<M5AuthorityProducerDependencies, "produce"> & Partial<Pick<M5AuthorityProducerDependencies, "produce">> & { readonly producerDependencies?: Parameters<typeof produceCanonicalM5>[1] }): (input: ProduceCanonicalM5FromAuthorityInput) => Promise<CanonicalM5ProducerResult> {
  const produce = dependencies.produce ?? (input => produceCanonicalM5(input, dependencies.producerDependencies!));
  if (!dependencies.produce && !dependencies.producerDependencies) throw new Error("M5_MANIFEST_AUTHORITY_PRODUCER_DEPENDENCIES_MISSING");
  return input => produceCanonicalM5FromAuthority(input, { authorityRepository: dependencies.authorityRepository, produce });
}
