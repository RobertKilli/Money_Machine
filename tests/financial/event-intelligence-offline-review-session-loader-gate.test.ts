import { afterEach, describe, expect, it, vi } from "vitest";

const { fixtureSpy } = vi.hoisted(() => ({ fixtureSpy: vi.fn() }));
vi.mock("@/application/intelligence/offline-review-demo-fixtures", () => ({ createOfflineReviewDemoReplayEpisodeFixtures: fixtureSpy }));

import { loadOfflineReviewSessionDemo } from "@/application/intelligence/load-offline-review-session-demo";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("review session direct-loader environment gate", () => {
  it.each(["production", "test", "", "staging", undefined])("rejects NODE_ENV=%s before loading fixtures or sessions", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(loadOfflineReviewSessionDemo()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(fixtureSpy).not.toHaveBeenCalled();
  });
});
