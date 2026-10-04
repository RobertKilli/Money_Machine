import "server-only";

import { notFound } from "next/navigation";
import type { NewsDiscoveryCandidate } from "@/domain/intelligence/event-intelligence-news-discovery";
import type { EvidenceReviewQueueViewModel } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";

const EVALUATION_AS_OF = "2026-10-03T12:00:00.000Z";
const PUBLISHED_AT = "2026-10-01T08:00:00.000Z";
const DISCOVERED_AT = "2026-10-01T09:00:00.000Z";
const RECEIVED_AT = "2026-10-01T09:00:01.000Z";
const RECORDED_AT = "2026-10-01T09:00:02.000Z";

type DemoScenario = Readonly<{
  key: "issuer-mapping" | "rights-blocked" | "unresolved-correction";
  label: string;
  description: string;
  model: EvidenceReviewQueueViewModel;
}>;

export type OfflineReviewDemoResult = Readonly<
  | { status: "AVAILABLE"; evaluatedAsOf: string; scenarios: readonly DemoScenario[] }
  | { status: "UNAVAILABLE"; reason: "CANDIDATE_REJECTED" | "COMPOSITION_INPUT_INVALID" | "COMPOSITION_CANDIDATE_UNTRUSTED" | "COMPOSITION_CUTOFF_MISMATCH" | "COMPOSITION_DISCOVERY_SET_INVALID" | "COMPOSITION_ROUTING_REJECTED" | "COMPOSITION_QUEUE_REJECTED" | "COMPOSITION_VIEW_MODEL_REJECTED" }
>;

function newsRecord(
  NEWS_DISCOVERY_VERSION: string,
  options: Readonly<{
    suffix: string;
    sourceType: "NEWS_AGGREGATOR" | "ISSUER_IR";
    jurisdiction: string;
    category: "CORPORATE_CRYPTO_PURCHASE_INTENT" | "CORRECTION_OR_RETRACTION";
    headline: string;
  }>,
) {
  const publisher = { publisherId: `synthetic-issuer-${options.suffix}`, displayName: "Synthetic Demo Company" };
  const url = `https://issuer.test/releases/offline-demo-${options.suffix}`;
  return {
    contractVersion: NEWS_DISCOVERY_VERSION,
    authorityStatus: "DISCOVERY_ONLY" as const,
    provenance: "SYNTHETIC" as const,
    providerId: options.sourceType === "NEWS_AGGREGATOR" ? "newsapi-discovery" : "issuer-ir",
    sourceType: options.sourceType,
    providerRecordId: `offline-demo-${options.suffix}`,
    canonicalSourceUrl: url,
    publisher: options.sourceType === "NEWS_AGGREGATOR" ? { publisherId: `synthetic-aggregator-${options.suffix}`, displayName: "Synthetic News Aggregator" } : publisher,
    attributedIssuer: options.jurisdiction === "UNKNOWN" ? null : {
      candidateId: `synthetic-company-${options.suffix}`,
      legalName: "Synthetic Demo Company",
      jurisdiction: options.jurisdiction,
      relationshipHint: "UNRESOLVED" as const,
    },
    origin: {
      distribution: options.sourceType === "NEWS_AGGREGATOR" ? "AGGREGATOR_REFERENCE" as const : "ORIGINAL_PUBLICATION" as const,
      originalPublisher: publisher,
      originalPublicationId: `offline-demo-publication-${options.suffix}`,
      originalSourceUrl: url,
      distributor: options.sourceType === "NEWS_AGGREGATOR" ? { publisherId: `synthetic-aggregator-${options.suffix}`, displayName: "Synthetic News Aggregator" } : null,
      attributionBasis: "EXPLICIT_SYNTHETIC_DECLARATION" as const,
    },
    headline: options.headline,
    summary: options.category === "CORRECTION_OR_RETRACTION"
      ? "Synthetic correction notice; no underlying claim or lifecycle authority is established."
      : "Synthetic fixture for an offline review demonstration; no completed event is established.",
    publishedAt: PUBLISHED_AT,
    discoveredAt: DISCOVERED_AT,
    receivedAt: RECEIVED_AT,
    recordedAt: RECORDED_AT,
    sourceUpdatedAt: null,
    language: "en",
    jurisdiction: options.jurisdiction,
    mentionedEntities: options.jurisdiction === "UNKNOWN" ? [] : [{
      candidateId: `synthetic-company-${options.suffix}`,
      legalName: "Synthetic Demo Company",
      jurisdiction: options.jurisdiction,
      relationshipHint: "UNRESOLVED" as const,
    }],
    mentionedAssets: [{ candidateId: `synthetic-asset-${options.suffix}`, label: "Bitcoin", ticker: "BTC", representation: "UNKNOWN" as const }],
    eventCategories: [options.category],
    sourceLocator: `article:offline-demo-${options.suffix}`,
    lifecycleHint: { kind: "NONE" as const, targetCandidateId: null },
    discoveryConfidence: "EXPLICIT_ATTRIBUTION" as const,
  };
}

function scenarioRoutingMaterial(
  candidate: NewsDiscoveryCandidate,
  flags: Readonly<{ issuerMapped: boolean; assetMapped: boolean; primaryAvailable: boolean; qualificationComplete: boolean; rightsApproved: boolean; correctionPresent: boolean }>,
  eventHint: "PURCHASE_INTENT" | "CORRECTION_AMENDMENT",
) {
  const isAggregator = candidate.record.sourceType === "NEWS_AGGREGATOR";
  const jurisdiction = candidate.record.jurisdiction === "US" ? "US_SEC" : "UNKNOWN";
  return {
    provenance: "SYNTHETIC" as const,
    candidateId: candidate.candidateId,
    jurisdiction,
    listingScopes: jurisdiction === "US_SEC" ? ["listing:us-sec"] : [],
    eventHint,
    seenFamilies: [isAggregator ? "DISCOVERY_AGGREGATOR" as const : "ISSUER_ATTRIBUTED_RELEASE" as const],
    availableFamilies: [],
    issuerMapped: flags.issuerMapped,
    assetMapped: flags.assetMapped,
    duplicate: false,
    rightsApproved: flags.rightsApproved,
    credentialAvailable: true,
    completionMaterialPresent: false,
    primaryAvailable: flags.primaryAvailable,
    qualificationComplete: flags.qualificationComplete,
    correctionPresent: flags.correctionPresent,
    correctionResolved: false,
    correctionFieldHints: flags.correctionPresent ? ["OTHER"] as const : [] as const,
    retracted: false,
    conflicts: [],
    stale: false,
    originBindings: [],
    publicationAt: candidate.record.publishedAt,
    discoveredAt: candidate.record.discoveredAt,
    receivedAt: candidate.record.receivedAt,
    correctionAvailableAt: flags.correctionPresent ? candidate.record.publishedAt : null,
    evaluationAsOf: EVALUATION_AS_OF,
  };
}

/** Development-only local composition. Returns only safe projected view models. */
export async function loadEventIntelligenceOfflineReviewDemo(): Promise<OfflineReviewDemoResult> {
  if (process.env.NODE_ENV !== "development") notFound();

  const [discovery, compositionModule] = await Promise.all([
    import("@/domain/intelligence/event-intelligence-news-discovery"),
    import("@/application/intelligence/compose-event-intelligence-evidence-review-queue"),
  ]);

  const specifications = [
    {
      key: "issuer-mapping" as const,
      label: "Åpen issuer-mapping-review",
      description: "Syntetisk aggregator-kandidat; mapping mangler og kilden er fortsatt bare discovery-materiale.",
      record: newsRecord(discovery.NEWS_DISCOVERY_VERSION, { suffix: "mapping", sourceType: "NEWS_AGGREGATOR", jurisdiction: "US", category: "CORPORATE_CRYPTO_PURCHASE_INTENT", headline: "Synthetic Demo Company considers a Bitcoin purchase" }),
      flags: { issuerMapped: false, assetMapped: false, primaryAvailable: false, qualificationComplete: false, rightsApproved: true, correctionPresent: false },
      eventHint: "PURCHASE_INTENT" as const,
    },
    {
      key: "rights-blocked" as const,
      label: "Blokkert: rights-gjennomgang",
      description: "Syntetisk issuer-attributed fixture med manglende rights approval; dette er en blocker, ikke en godkjenningshandling.",
      record: newsRecord(discovery.NEWS_DISCOVERY_VERSION, { suffix: "rights", sourceType: "ISSUER_IR", jurisdiction: "US", category: "CORPORATE_CRYPTO_PURCHASE_INTENT", headline: "Synthetic Demo Company reviews a Bitcoin purchase" }),
      flags: { issuerMapped: true, assetMapped: true, primaryAvailable: true, qualificationComplete: true, rightsApproved: false, correctionPresent: false },
      eventHint: "PURCHASE_INTENT" as const,
    },
    {
      key: "unresolved-correction" as const,
      label: "Uavklart correction – lineage krever gjennomgang",
      description: "Syntetisk correction-melding uten løst lineage; ingen retract- eller claim-authority påstås.",
      record: newsRecord(discovery.NEWS_DISCOVERY_VERSION, { suffix: "correction", sourceType: "ISSUER_IR", jurisdiction: "US", category: "CORRECTION_OR_RETRACTION", headline: "Synthetic Demo Company corrects an earlier notice" }),
      flags: { issuerMapped: true, assetMapped: true, primaryAvailable: true, qualificationComplete: true, rightsApproved: true, correctionPresent: true },
      eventHint: "CORRECTION_AMENDMENT" as const,
    },
  ];

  const scenarios: DemoScenario[] = [];
  for (const specification of specifications) {
    const candidate = discovery.createSyntheticNewsDiscoveryCandidate(specification.record, EVALUATION_AS_OF);
    if (!candidate) return Object.freeze({ status: "UNAVAILABLE", reason: "CANDIDATE_REJECTED" });

    const composed = compositionModule.composeEventIntelligenceEvidenceReviewQueue({
      evaluationAsOf: EVALUATION_AS_OF,
      candidates: [{
        candidate,
        routingMaterial: scenarioRoutingMaterial(candidate, specification.flags, specification.eventHint),
      }],
    });
    if (composed.status !== "COMPOSED") return Object.freeze({ status: "UNAVAILABLE", reason: composed.code });

    scenarios.push(Object.freeze({
      key: specification.key,
      label: specification.label,
      description: specification.description,
      model: composed.composition.viewModel,
    }));
  }

  return Object.freeze({
    status: "AVAILABLE",
    evaluatedAsOf: EVALUATION_AS_OF,
    scenarios: Object.freeze(scenarios),
  });
}
