import { EXCHANGE_ANNOUNCEMENT_NORMAL_FORM_VERSION, type SyntheticExchangeAnnouncementInput } from "../../src/domain/intelligence/event-intelligence-exchange-regulatory-announcement-source-qualification";

export const EXCHANGE_REVIEW_AS_OF = "2026-10-03T10:00:00.000Z";
export function syntheticExchangeAnnouncement(overrides: Partial<SyntheticExchangeAnnouncementInput> = {}): SyntheticExchangeAnnouncementInput {
  return {
    normalForm: EXCHANGE_ANNOUNCEMENT_NORMAL_FORM_VERSION,
    provenance: "SYNTHETIC",
    sourceCandidateId: "lse-rns",
    jurisdiction: "GB",
    operator: "London Stock Exchange Group / RNS",
    sourceRole: "REGULATORY_ANNOUNCEMENT",
    issuerDisplayName: "Example Holdings plc",
    issuerIdentifiers: [{ scheme: "TICKER", value: "EXM", scope: "LISTED_SECURITY_CANDIDATE" }],
    announcementId: "rns-announcement-2026-10-02-001",
    canonicalAnnouncementUrl: "https://www.londonstockexchange.com/news-article/EXM/treasury-policy/2026-10-02",
    canonicalDocumentUrl: "https://www.londonstockexchange.com/news-article/EXM/treasury-policy/2026-10-02.pdf",
    headline: "Example Holdings announces a Bitcoin treasury policy review",
    categoryHint: "TREASURY_POLICY",
    publishedAt: "2026-10-02T09:00:00.000Z",
    discoveredAt: "2026-10-02T09:00:03.000Z",
    receivedAt: "2026-10-02T09:00:04.000Z",
    evaluatedAsOf: EXCHANGE_REVIEW_AS_OF,
    marketSensitive: true,
    lifecycleHint: "NONE",
    assetMentions: ["Bitcoin", "BTC"],
    amountText: null,
    currencyText: null,
    sourceLocator: "announcement:synthetic-rns-001",
    materialFingerprint: "c".repeat(64),
    payloadFingerprint: "a".repeat(64),
    originBinding: { issuerCandidateId: "issuer-example-candidate", announcementId: "rns-announcement-2026-10-02-001", canonicalOriginUrl: "https://www.londonstockexchange.com/news-article/EXM/treasury-policy/2026-10-02" },
    ...overrides,
  };
}
