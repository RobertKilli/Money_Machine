import { NEWS_DISCOVERY_VERSION, type NewsDiscoveryRecord } from "../../src/domain/intelligence/event-intelligence-news-discovery";

export const DISCOVERY_EVALUATION_AT = "2026-10-03T12:00:00.000Z";
export function syntheticNewsRecord(): NewsDiscoveryRecord {
  return {
    contractVersion: NEWS_DISCOVERY_VERSION, authorityStatus: "DISCOVERY_ONLY", provenance: "SYNTHETIC",
    providerId: "issuer-ir", sourceType: "ISSUER_IR", providerRecordId: "synthetic-release-001",
    canonicalSourceUrl: "https://issuer.test/releases/crypto-plan",
    publisher: { publisherId: "synthetic-issuer", displayName: "Synthetic Large Company" },
    attributedIssuer: { candidateId: "synthetic-company", legalName: "Synthetic Large Company", jurisdiction: "US", relationshipHint: "UNRESOLVED" },
    origin: { distribution: "ORIGINAL_PUBLICATION", originalPublisher: { publisherId: "synthetic-issuer", displayName: "Synthetic Large Company" }, originalPublicationId: "release-001", originalSourceUrl: "https://issuer.test/releases/crypto-plan", distributor: null, attributionBasis: "EXPLICIT_SYNTHETIC_DECLARATION" },
    headline: "Synthetic Large Company intends to buy Bitcoin after board review",
    summary: "Synthetic fixture: proposed treasury purchase; closing is expected and no completed purchase is established.",
    publishedAt: "2026-10-01T08:00:00.000Z", discoveredAt: "2026-10-01T09:00:00.000Z", receivedAt: "2026-10-01T09:00:01.000Z", recordedAt: "2026-10-01T09:00:02.000Z", sourceUpdatedAt: null,
    language: "en", jurisdiction: "US",
    mentionedEntities: [{ candidateId: "synthetic-company", legalName: "Synthetic Large Company", jurisdiction: "US", relationshipHint: "UNRESOLVED" }],
    mentionedAssets: [{ candidateId: "bitcoin-mention", label: "Bitcoin", ticker: "BTC", representation: "UNKNOWN" }],
    eventCategories: ["CORPORATE_CRYPTO_PURCHASE_INTENT"], sourceLocator: "article:release-001",
    lifecycleHint: { kind: "NONE", targetCandidateId: null }, discoveryConfidence: "EXPLICIT_ATTRIBUTION",
  };
}
export function syntheticAggregatorRecord(): NewsDiscoveryRecord {
  const record = syntheticNewsRecord();
  return { ...record, providerId: "newsapi-discovery", sourceType: "NEWS_AGGREGATOR", providerRecordId: "aggregated-release-001", origin: { ...record.origin, distribution: "AGGREGATOR_REFERENCE", distributor: { publisherId: "synthetic-aggregator", displayName: "Synthetic Aggregator" } } };
}
export function syntheticWireRecord(): NewsDiscoveryRecord {
  const record = syntheticNewsRecord();
  const distributor = { publisherId: "synthetic-wire", displayName: "Synthetic Wire" };
  return { ...record, providerId: "businesswire-distribution", sourceType: "NEWSWIRE", providerRecordId: "wire-release-001", canonicalSourceUrl: "https://wire.test/releases/crypto-plan", publisher: distributor, origin: { ...record.origin, distribution: "WIRE_COPY", distributor } };
}
