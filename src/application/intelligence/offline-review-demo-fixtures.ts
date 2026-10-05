import "server-only";

import {
  createSyntheticNewsDiscoveryCandidate,
  NEWS_DISCOVERY_VERSION,
  type NewsDiscoveryCandidate,
} from "@/domain/intelligence/event-intelligence-news-discovery";
import type { SyntheticRoutingMaterial } from "@/domain/intelligence/event-intelligence-source-portfolio-routing-decision";
import type { EvidenceReviewQueueViewModelItem } from "@/domain/intelligence/event-intelligence-evidence-review-queue-view-model";

export const OFFLINE_REVIEW_DEMO_EARLIER_EVALUATION_AS_OF = "2026-10-02T00:00:00.000Z";
export const OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF = "2026-10-03T12:00:00.000Z";
export const OFFLINE_REVIEW_DEMO_EVALUATION_AS_OF = OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF;
const PUBLISHED_AT = "2026-10-01T08:00:00.000Z";
const DISCOVERED_AT = "2026-10-01T09:00:00.000Z";
const RECEIVED_AT = "2026-10-01T09:00:01.000Z";
const RECORDED_AT = "2026-10-01T09:00:02.000Z";
const CORRECTION_PUBLISHED_AT = "2026-10-02T08:00:00.000Z";
const CORRECTION_DISCOVERED_AT = "2026-10-02T08:01:00.000Z";
const CORRECTION_RECEIVED_AT = "2026-10-02T08:01:01.000Z";
const CORRECTION_RECORDED_AT = "2026-10-02T08:01:02.000Z";

export type OfflineReviewDemoSourceMaterial = Readonly<{
  sourceLabel: string;
  sourceType: "NEWS_AGGREGATOR" | "ISSUER_IR";
  fixtureId: string;
  receivedAt: string;
  title: string;
  summary: string;
  evidence: readonly Readonly<{ label: string; value: string }>[];
  relevance: string;
  synthetic: true;
}>;

export type OfflineReviewDemoScenarioKey = "issuer-mapping" | "rights-blocked" | "unresolved-correction";
export type OfflineReviewDemoGuidance = Readonly<{ why: string; missing: string; investigate: string }>;

export type OfflineReviewDemoFixture = Readonly<{
  key: OfflineReviewDemoScenarioKey;
  expectedReviewType: EvidenceReviewQueueViewModelItem["reviewType"];
  label: string;
  description: string;
  reviewGuidance: OfflineReviewDemoGuidance;
  sourceMaterial: OfflineReviewDemoSourceMaterial;
  candidate: NewsDiscoveryCandidate;
  routingMaterial: SyntheticRoutingMaterial;
}>;

export type OfflineReviewDemoReplayEpisodeFixtures = Readonly<{
  key: "EARLIER" | "LATER";
  label: string;
  evaluatedAsOf: string;
  fixtures: readonly OfflineReviewDemoFixture[];
}>;

function newsRecord(options: Readonly<{
  suffix: string;
  sourceType: "NEWS_AGGREGATOR" | "ISSUER_IR";
  jurisdiction: string;
  category: "CORPORATE_CRYPTO_PURCHASE_INTENT" | "CORRECTION_OR_RETRACTION";
  headline: string;
}>) {
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

type FixtureSpec = Omit<OfflineReviewDemoFixture, "candidate" | "routingMaterial"> & Readonly<{
  record: ReturnType<typeof newsRecord>;
  flags: Readonly<{
    issuerMapped: boolean;
    assetMapped: boolean;
    primaryAvailable: boolean;
    qualificationComplete: boolean;
    rightsApproved: boolean;
    correctionPresent: boolean;
  }>;
  eventHint: "PURCHASE_INTENT" | "CORRECTION_AMENDMENT";
}>;

const FIXTURE_SPECS: readonly FixtureSpec[] = [
  {
    key: "issuer-mapping",
    expectedReviewType: "ISSUER_MAPPING_REVIEW",
    label: "Åpen issuer-mapping-review",
    description: "Syntetisk aggregator-kandidat; mapping mangler og kilden er fortsatt bare discovery-materiale.",
    reviewGuidance: {
      why: "Kandidaten nevner et selskap og Bitcoin, men omtalen er bare discovery-materiale.",
      missing: "Issuer- og asset-koblingene er ikke verifisert. OPEN betyr at raden er tilgjengelig for review, ikke at koblingene er godkjent.",
      investigate: "Undersøk om omtalt issuer og asset kan knyttes til verifiserte identiteter og kildemateriale.",
    },
    sourceMaterial: {
      sourceLabel: "Synthetic News Aggregator",
      sourceType: "NEWS_AGGREGATOR",
      fixtureId: "offline-demo-mapping",
      receivedAt: RECEIVED_AT,
      title: "Synthetic Demo Company considers a Bitcoin purchase",
      summary: "Synthetic fixture for an offline review demonstration; no completed event is established.",
      evidence: [
        { label: "Publication time (UTC)", value: PUBLISHED_AT },
        { label: "Discovery time (UTC)", value: DISCOVERED_AT },
      ],
      relevance: "The synthetic headline mentions an issuer and asset whose mapping remains unverified.",
      synthetic: true,
    },
    record: newsRecord({ suffix: "mapping", sourceType: "NEWS_AGGREGATOR", jurisdiction: "US", category: "CORPORATE_CRYPTO_PURCHASE_INTENT", headline: "Synthetic Demo Company considers a Bitcoin purchase" }),
    flags: { issuerMapped: false, assetMapped: false, primaryAvailable: false, qualificationComplete: false, rightsApproved: true, correctionPresent: false },
    eventHint: "PURCHASE_INTENT",
  },
  {
    key: "rights-blocked",
    expectedReviewType: "RIGHTS_APPROVAL_REVIEW",
    label: "Blokkert: rights-gjennomgang",
    description: "Syntetisk issuer-attributed fixture med manglende rights approval; dette er en blocker, ikke en godkjenningshandling.",
    reviewGuidance: {
      why: "Kandidaten er blokkert fordi kildens brukstillatelse ikke er godkjent i dette scenarioet.",
      missing: "Rights approval mangler; neste handling beskriver nødvendig avklaring, ikke en godkjenning i demoen.",
      investigate: "Undersøk tillatt kildebruk og nødvendig godkjenning uten å behandle denne visningen som authority.",
    },
    sourceMaterial: {
      sourceLabel: "Synthetic issuer investor-relations release",
      sourceType: "ISSUER_IR",
      fixtureId: "offline-demo-rights",
      receivedAt: RECEIVED_AT,
      title: "Synthetic Demo Company reviews a Bitcoin purchase",
      summary: "Synthetic issuer-attributed fixture for an offline review demonstration; no completed event is established.",
      evidence: [
        { label: "Publication time (UTC)", value: PUBLISHED_AT },
        { label: "Discovery time (UTC)", value: DISCOVERED_AT },
      ],
      relevance: "This synthetic item is displayed beside the rights-review candidate; its content does not establish permission to use a source.",
      synthetic: true,
    },
    record: newsRecord({ suffix: "rights", sourceType: "ISSUER_IR", jurisdiction: "US", category: "CORPORATE_CRYPTO_PURCHASE_INTENT", headline: "Synthetic Demo Company reviews a Bitcoin purchase" }),
    flags: { issuerMapped: true, assetMapped: true, primaryAvailable: true, qualificationComplete: true, rightsApproved: false, correctionPresent: false },
    eventHint: "PURCHASE_INTENT",
  },
  {
    key: "unresolved-correction",
    expectedReviewType: "CORRECTION_LINEAGE_REVIEW",
    label: "Uavklart correction – lineage krever gjennomgang",
    description: "Syntetisk correction-melding uten løst lineage; ingen retract- eller claim-authority påstås.",
    reviewGuidance: {
      why: "Meldingen rapporterer en correction som krever lineage-review.",
      missing: "Lineage er ikke løst, og meldingen beviser ikke en autentisk lifecycle-relasjon til et tidligere claim.",
      investigate: "Undersøk hvilket tidligere materiale meldingen viser til; vurder raden som historical ved den faste cutoffen.",
    },
    sourceMaterial: {
      sourceLabel: "Synthetic issuer investor-relations correction notice",
      sourceType: "ISSUER_IR",
      fixtureId: "offline-demo-correction",
      receivedAt: CORRECTION_RECEIVED_AT,
      title: "Synthetic Demo Company corrects an earlier notice",
      summary: "Synthetic correction notice; no underlying claim or lifecycle authority is established.",
      evidence: [
        { label: "Publication time (UTC)", value: CORRECTION_PUBLISHED_AT },
        { label: "Lifecycle relationship", value: "Unresolved; no authenticated relation is established" },
      ],
      relevance: "The notice is visible for correction-lineage review, but it does not prove which earlier claim it concerns.",
      synthetic: true,
    },
    record: {
      ...newsRecord({ suffix: "correction", sourceType: "ISSUER_IR", jurisdiction: "US", category: "CORRECTION_OR_RETRACTION", headline: "Synthetic Demo Company corrects an earlier notice" }),
      publishedAt: CORRECTION_PUBLISHED_AT,
      discoveredAt: CORRECTION_DISCOVERED_AT,
      receivedAt: CORRECTION_RECEIVED_AT,
      recordedAt: CORRECTION_RECORDED_AT,
    },
    flags: { issuerMapped: true, assetMapped: true, primaryAvailable: true, qualificationComplete: true, rightsApproved: true, correctionPresent: true },
    eventHint: "CORRECTION_AMENDMENT",
  },
];

function scenarioRoutingMaterial(
  candidate: NewsDiscoveryCandidate,
  flags: FixtureSpec["flags"],
  eventHint: FixtureSpec["eventHint"],
  evaluatedAsOf: string,
): SyntheticRoutingMaterial {
  const isAggregator = candidate.record.sourceType === "NEWS_AGGREGATOR";
  const jurisdiction = candidate.record.jurisdiction === "US" ? "US_SEC" : "UNKNOWN";
  return {
    provenance: "SYNTHETIC",
    candidateId: candidate.candidateId,
    jurisdiction,
    listingScopes: jurisdiction === "US_SEC" ? ["listing:us-sec"] : [],
    eventHint,
    seenFamilies: [isAggregator ? "DISCOVERY_AGGREGATOR" : "ISSUER_ATTRIBUTED_RELEASE"],
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
    correctionFieldHints: flags.correctionPresent ? ["OTHER"] : [],
    retracted: false,
    conflicts: [],
    stale: false,
    originBindings: [],
    publicationAt: candidate.record.publishedAt,
    discoveredAt: candidate.record.discoveredAt,
    receivedAt: candidate.record.receivedAt,
    correctionAvailableAt: flags.correctionPresent ? candidate.record.publishedAt : null,
    evaluationAsOf: evaluatedAsOf,
  };
}

function createFixturesAt(
  evaluatedAsOf: string,
  keys: readonly OfflineReviewDemoFixture["key"][],
): readonly OfflineReviewDemoFixture[] | null {
  const fixtures: OfflineReviewDemoFixture[] = [];
  for (const specification of FIXTURE_SPECS.filter(item => keys.includes(item.key))) {
    const candidate = createSyntheticNewsDiscoveryCandidate(specification.record, evaluatedAsOf);
    if (!candidate) return null;
    const sourceMaterial = Object.freeze({
      ...specification.sourceMaterial,
      evidence: Object.freeze(specification.sourceMaterial.evidence.map(entry => Object.freeze({ ...entry }))),
    });
    fixtures.push(Object.freeze({
      key: specification.key,
      expectedReviewType: specification.expectedReviewType,
      label: specification.label,
      description: specification.description,
      reviewGuidance: Object.freeze(specification.reviewGuidance),
      sourceMaterial,
      candidate,
      routingMaterial: Object.freeze(scenarioRoutingMaterial(candidate, specification.flags, specification.eventHint, evaluatedAsOf)),
    }));
  }
  return Object.freeze(fixtures);
}

/** The existing overview/single-scenario fixtures remain the complete later fixed set. */
export function createOfflineReviewDemoFixtures(): readonly OfflineReviewDemoFixture[] | null {
  return createFixturesAt(OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, ["issuer-mapping", "rights-blocked", "unresolved-correction"]);
}

/** Two explicitly selected input sets; this is fixture selection, not a general as-of retrieval API. */
export function createOfflineReviewDemoReplayEpisodeFixtures(): readonly OfflineReviewDemoReplayEpisodeFixtures[] | null {
  const earlier = createFixturesAt(OFFLINE_REVIEW_DEMO_EARLIER_EVALUATION_AS_OF, ["issuer-mapping", "rights-blocked"]);
  const later = createFixturesAt(OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, ["issuer-mapping", "rights-blocked", "unresolved-correction"]);
  if (!earlier || !later) return null;
  return Object.freeze([
    Object.freeze({ key: "EARLIER" as const, label: "Tidligere observasjon", evaluatedAsOf: OFFLINE_REVIEW_DEMO_EARLIER_EVALUATION_AS_OF, fixtures: earlier }),
    Object.freeze({ key: "LATER" as const, label: "Senere observasjon", evaluatedAsOf: OFFLINE_REVIEW_DEMO_LATER_EVALUATION_AS_OF, fixtures: later }),
  ]);
}
