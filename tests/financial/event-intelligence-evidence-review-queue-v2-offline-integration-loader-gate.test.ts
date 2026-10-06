import { afterEach, describe, expect, it, vi } from "vitest";

const { fixtureSpy, v1Spy, v2Spy } = vi.hoisted(() => ({ fixtureSpy: vi.fn(), v1Spy: vi.fn(), v2Spy: vi.fn() }));

vi.mock("@/application/intelligence/offline-review-demo-fixtures", () => ({ createOfflineReviewDemoQueueV2Fixtures: fixtureSpy }));
vi.mock("@/application/intelligence/compose-event-intelligence-evidence-review-queue", () => ({ composeEventIntelligenceEvidenceReviewQueue: v1Spy }));
vi.mock("@/application/intelligence/compose-event-intelligence-evidence-review-queue-v2", () => ({ composeEventIntelligenceEvidenceReviewQueueV2: v2Spy }));

import { loadEventIntelligenceOfflineQueueV2Comparison } from "@/application/intelligence/load-event-intelligence-offline-queue-v2-comparison";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("queue V2 comparison direct-loader gate", () => {
  it.each(["production", "test", "", "staging", undefined])("rejects NODE_ENV=%s before fixture, routing, composition or presentation imports are used", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(loadEventIntelligenceOfflineQueueV2Comparison()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(fixtureSpy).not.toHaveBeenCalled();
    expect(v1Spy).not.toHaveBeenCalled();
    expect(v2Spy).not.toHaveBeenCalled();
  });
});
