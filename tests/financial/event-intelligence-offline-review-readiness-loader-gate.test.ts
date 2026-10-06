import { afterEach, describe, expect, it, vi } from "vitest";
const { fixtureSpy } = vi.hoisted(() => ({ fixtureSpy: vi.fn() }));
vi.mock("@/application/intelligence/offline-review-demo-fixtures", () => ({ createOfflineReviewDemoQueueV2Fixtures: fixtureSpy }));
import { loadOfflineReviewReadinessDemo } from "@/application/intelligence/load-offline-review-readiness-demo";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("review readiness direct-loader gate", () => {
  it.each(["production", "test", "", "staging", undefined])("rejects NODE_ENV=%s before fixture generation", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(loadOfflineReviewReadinessDemo()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(fixtureSpy).not.toHaveBeenCalled();
  });
});
