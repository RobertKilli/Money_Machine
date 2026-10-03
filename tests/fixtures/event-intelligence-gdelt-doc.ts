import { GDELT_DOC_QUERY_PROFILES, gdeltDocQueryProfileFingerprint, gdeltDocRequestFingerprint, type GdeltSyntheticDocResponse } from "../../src/domain/intelligence/event-intelligence-gdelt-doc-source-qualification";

export const GDELT_EVALUATION_AS_OF = "2026-10-03T08:00:00.000Z";
export const GDELT_RECEIVED_AT = "2026-10-03T07:59:00.000Z";
export function syntheticGdeltDocResponse(overrides: Partial<GdeltSyntheticDocResponse> = {}): GdeltSyntheticDocResponse {
  const profile = GDELT_DOC_QUERY_PROFILES[0];
  const windowStart = "2026-10-03T07:35:00.000Z";
  const windowEnd = "2026-10-03T08:00:00.000Z";
  const queryFingerprint = gdeltDocRequestFingerprint(profile.id, windowStart, windowEnd)!;
  return {
    fixtureContract: "gdelt-doc-normalized-fixture/v1", providerId: "gdelt-discovery", queryProfileId: profile.id,
    queryProfileFingerprint: gdeltDocQueryProfileFingerprint(profile.id)!, queryFingerprint, windowStart, windowEnd, receivedAt: GDELT_RECEIVED_AT,
    rawPayloadFingerprint: "a".repeat(64),
    records: [{ articleUrl: "https://news.example/article-1", sourceDomain: "news.example", title: "Company considers Bitcoin treasury purchase", sourceLanguage: "en", sourceCountry: "US", providerSeenAt: "2026-10-03T07:58:00.000Z", articleTime: "2026-10-03T07:50:00.000Z", imageUrl: null }],
    ...overrides,
  };
}
