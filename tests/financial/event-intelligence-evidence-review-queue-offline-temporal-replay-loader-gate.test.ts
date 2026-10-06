import { afterEach, describe, expect, it, vi } from "vitest";

const { fixtureSpy, composeSpy } = vi.hoisted(() => ({ fixtureSpy: vi.fn(), composeSpy: vi.fn() }));

vi.mock("@/application/intelligence/offline-review-demo-fixtures", () => ({ createOfflineReviewDemoReplayEpisodeFixtures: fixtureSpy }));
vi.mock("@/application/intelligence/compose-event-intelligence-evidence-review-queue", () => ({ composeEventIntelligenceEvidenceReviewQueue: composeSpy }));

import { loadEventIntelligenceOfflineTemporalReplay } from "@/application/intelligence/load-event-intelligence-offline-temporal-replay";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("offline temporal replay loader environment boundary", () => {
  it.each(["production", "test", "", "staging", undefined])("rejects direct loader use when NODE_ENV is %s before fixture generation or composition", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(loadEventIntelligenceOfflineTemporalReplay()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(fixtureSpy).not.toHaveBeenCalled();
    expect(composeSpy).not.toHaveBeenCalled();
  });
});
