import { ISSUER_RELEASE_NORMAL_FORM_VERSION, type SyntheticIssuerReleaseInput } from "../../src/domain/intelligence/event-intelligence-issuer-attributed-release-source-qualification";

export const REVIEW_AS_OF = "2026-10-02T12:00:00.000Z";
export function syntheticIssuerRelease(overrides: Partial<SyntheticIssuerReleaseInput> = {}): SyntheticIssuerReleaseInput {
  return {
    normalForm: ISSUER_RELEASE_NORMAL_FORM_VERSION, provenance: "SYNTHETIC", sourceId: "issuer-ir-release", sourceClass: "DIRECT_ISSUER_RELEASE",
    publisherId: "issuer-example", distributorId: null, issuerCandidateId: "issuer-candidate-example", issuerDisplayedName: "Example Holdings",
    canonicalReleaseUrl: "https://issuer.example.test/ir/releases/20261002", releaseIdentifier: "release-2026-10-02",
    headline: "Example Holdings announces intent to acquire Bitcoin", summary: "Synthetic fixture; the company says it is considering a treasury purchase.",
    publicationAt: "2026-10-02T10:00:00.000Z", discoveredAt: "2026-10-02T10:01:00.000Z", receivedAt: "2026-10-02T10:01:01.000Z", evaluatedAsOf: REVIEW_AS_OF,
    categoryCandidate: "CORPORATE_CRYPTO_PURCHASE_INTENT", assetMentions: ["Bitcoin", "BTC"], amountText: null, currencyText: null,
    lifecycleHint: "NONE", explicitOriginBinding: { issuerCandidateId: "issuer-candidate-example", releaseIdentifier: "release-2026-10-02", canonicalOriginUrl: "https://issuer.example.test/ir/releases/20261002" },
    payloadFingerprint: "a".repeat(64), ...overrides,
  };
}
