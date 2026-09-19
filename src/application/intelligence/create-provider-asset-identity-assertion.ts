import { createProviderAssetIdentityAssertion, type ProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import type { ProviderAssetIdentityProjection } from "@/application/intelligence/provider-asset-identity-projection";
import type { ProviderAssetIdentityAssertionUnitOfWork } from "@/application/intelligence/provider-asset-identity-repository";

export async function createProviderAssetIdentityAssertionAuthority(input: { readonly unitOfWork: ProviderAssetIdentityAssertionUnitOfWork; readonly projection: ProviderAssetIdentityProjection; readonly recordedAt: string }): Promise<ProviderAssetIdentityAssertion> {
  return input.unitOfWork.withTransaction(async repositories => {
    const artifact = await repositories.artifacts.readById(input.projection.sourceArtifactId); if (!artifact) throw new Error("M5_PROVIDER_ASSET_IDENTITY_ARTIFACT_NOT_FOUND");
    const envelope = await repositories.envelopes.readById(input.projection.sourceEnvelopeId); if (!envelope) throw new Error("M5_PROVIDER_ASSET_IDENTITY_ENVELOPE_NOT_FOUND");
    if (envelope.sourceArtifactId !== artifact.sourceArtifactId) throw new Error("M5_PROVIDER_ASSET_IDENTITY_ENVELOPE_ARTIFACT_MISMATCH");
    if (envelope.temporalQualityStatus !== "RESOLVED") throw new Error("M5_PROVIDER_ASSET_IDENTITY_ENVELOPE_INVALID");
    if (envelope.parserContractVersion !== input.projection.parserVersion) throw new Error("M5_PROVIDER_ASSET_IDENTITY_PARSER_MISMATCH");
    if (envelope.envelopeSchemaVersion !== input.projection.envelopeSchemaVersion) throw new Error("M5_PROVIDER_ASSET_IDENTITY_SCHEMA_MISMATCH");
    if (envelope.payloadFingerprint !== artifact.payloadFingerprint) throw new Error("M5_PROVIDER_ASSET_IDENTITY_PAYLOAD_FINGERPRINT_MISMATCH");
    const assertion = createProviderAssetIdentityAssertion({ providerId: artifact.providerId, datasetId: artifact.datasetId, datasetVersion: artifact.datasetVersion, providerSourceNamespace: artifact.providerSourceNamespace, providerAssetId: artifact.providerExternalRecordId, sourceArtifactId: artifact.sourceArtifactId, sourceEnvelopeId: envelope.sourceEnvelopeId, parserVersion: envelope.parserContractVersion, envelopeSchemaVersion: envelope.envelopeSchemaVersion, identityType: input.projection.identity.type, identityNamespace: input.projection.identity.namespace, identityValue: input.projection.identity.value, sourcePayloadFingerprint: artifact.payloadFingerprint, recordedAt: input.recordedAt });
    await repositories.assertions.save(assertion); const authoritative = await repositories.assertions.readById(assertion.providerAssetIdentityAssertionId); if (!authoritative) throw new Error("M5_PROVIDER_ASSET_IDENTITY_REREAD_NOT_FOUND"); return authoritative;
  });
}
