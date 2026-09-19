import type { ProviderAssetIdentityAssertion } from "@/domain/intelligence/provider-asset-identity-assertion";
import type { SourceArtifact, SourceEnvelope } from "@/domain/intelligence/ingestion-provenance";

export interface AsyncProviderAssetIdentityAssertionRepository { readonly save: (assertion: ProviderAssetIdentityAssertion) => Promise<ProviderAssetIdentityAssertion>; readonly readById: (assertionId: string) => Promise<ProviderAssetIdentityAssertion | undefined>; }
export interface ProviderAssetIdentityAuthorityParents { readonly artifacts: Pick<AsyncProviderAssetIdentityAssertionRepository, never> & { readonly readById: (id: string) => Promise<SourceArtifact | undefined> }; readonly envelopes: Pick<AsyncProviderAssetIdentityAssertionRepository, never> & { readonly readById: (id: string) => Promise<SourceEnvelope | undefined> }; }
export type ProviderAssetIdentityAssertionRepositories = Readonly<ProviderAssetIdentityAuthorityParents & { assertions: AsyncProviderAssetIdentityAssertionRepository }>;
export interface ProviderAssetIdentityAssertionUnitOfWork { readonly withTransaction: <T>(work: (repositories: ProviderAssetIdentityAssertionRepositories) => Promise<T>) => Promise<T>; }
