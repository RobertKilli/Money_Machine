import { afterEach, describe, expect, it, vi } from "vitest";

const { fixtureSpy, composeSpy } = vi.hoisted(() => ({ fixtureSpy: vi.fn(), composeSpy: vi.fn() }));

vi.mock("@/application/intelligence/offline-review-demo-fixtures", () => ({ createOfflineReviewDemoFixtures: fixtureSpy }));
vi.mock("@/application/intelligence/compose-event-intelligence-evidence-review-queue", () => ({ composeEventIntelligenceEvidenceReviewQueue: composeSpy }));

import { loadEventIntelligenceOfflineCombinedReviewQueue } from "@/application/intelligence/load-event-intelligence-offline-combined-review-queue";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("offline combined queue loader environment boundary", () => {
  it.each(["production", "test", "", "staging", undefined])("rejects direct loader use for NODE_ENV=%s before fixtures or composition", async environment => {
    vi.stubEnv("NODE_ENV", environment);

    await expect(loadEventIntelligenceOfflineCombinedReviewQueue()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

    expect(fixtureSpy).not.toHaveBeenCalled();
    expect(composeSpy).not.toHaveBeenCalled();
  });
});
