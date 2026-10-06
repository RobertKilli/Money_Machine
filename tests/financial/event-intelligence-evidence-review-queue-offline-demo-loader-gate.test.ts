import { afterEach, describe, expect, it, vi } from "vitest";

const { composeSpy, candidateSpy } = vi.hoisted(() => ({ composeSpy: vi.fn(), candidateSpy: vi.fn() }));

vi.mock("@/application/intelligence/compose-event-intelligence-evidence-review-queue", () => ({ composeEventIntelligenceEvidenceReviewQueue: composeSpy }));
vi.mock("@/domain/intelligence/event-intelligence-news-discovery", () => ({ NEWS_DISCOVERY_VERSION: "event-intelligence-news-discovery/v1", createSyntheticNewsDiscoveryCandidate: candidateSpy }));

import { loadEventIntelligenceOfflineReviewDemo } from "@/application/intelligence/load-event-intelligence-offline-review-demo";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("offline demo loader environment boundary", () => {
  it.each(["production", "test", "", "staging", undefined])("rejects direct loader use when NODE_ENV is %s before importing fixtures or composing", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(loadEventIntelligenceOfflineReviewDemo()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(composeSpy).not.toHaveBeenCalled();
    expect(candidateSpy).not.toHaveBeenCalled();
  });
});
