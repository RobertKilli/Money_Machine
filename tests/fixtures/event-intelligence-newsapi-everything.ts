import {
  NEWSAPI_QUERY_PROFILES,
  newsApiQueryProfileFingerprint,
  newsApiRequestFingerprint,
} from "../../src/domain/intelligence/event-intelligence-newsapi-everything-source-qualification";

export const NEWSAPI_EVALUATION_AS_OF = "2026-10-03T08:45:00.000Z";
export function syntheticNewsApiEverythingResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const profile = NEWSAPI_QUERY_PROFILES[0];
  const from = "2026-09-27";
  const to = "2026-10-03";
  return {
    normalForm: "newsapi-everything-normalized-fixture/v1",
    providerId: "newsapi-discovery",
    datasetVersion: "v2",
    queryProfileId: profile.id,
    queryProfileFingerprint: newsApiQueryProfileFingerprint(profile.id),
    queryFingerprint: newsApiRequestFingerprint(profile.id, from, to),
    from,
    to,
    receivedAt: "2026-10-03T08:44:00.000Z",
    rawPayloadFingerprint: "a".repeat(64),
    totalResults: 3,
    articles: [{
      sourceId: "business-desk",
      sourceName: "Business Desk",
      author: null,
      title: "Company considers a Bitcoin treasury allocation",
      description: "The company is reviewing a possible allocation.",
      content: "The company is reviewing a possible allocation. This remains an unverified report.",
      articleUrl: "https://publisher.example/news/bitcoin-treasury",
      imageUrl: null,
      publishedAt: "2026-10-03T08:30:00.000Z",
    }],
    ...overrides,
  };
}
