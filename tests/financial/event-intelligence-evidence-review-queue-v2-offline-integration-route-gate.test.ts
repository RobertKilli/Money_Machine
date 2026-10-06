import { afterEach, describe, expect, it, vi } from "vitest";

const { notFoundSpy, loaderSpy } = vi.hoisted(() => ({ notFoundSpy: vi.fn(() => { throw new Error("MOCK_NOT_FOUND"); }), loaderSpy: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: notFoundSpy }));
vi.mock("@/application/intelligence/load-event-intelligence-offline-queue-v2-comparison", () => ({ loadEventIntelligenceOfflineQueueV2Comparison: loaderSpy }));

import QueueV2Page from "@/app/intelligence/events/review/offline-demo/queue-v2/page";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("queue V2 comparison route gate", () => {
  it.each(["production", "test", "", "staging", undefined])("returns not-found for NODE_ENV=%s before loader invocation", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(QueueV2Page()).rejects.toThrow("MOCK_NOT_FOUND");
    expect(notFoundSpy).toHaveBeenCalledOnce();
    expect(loaderSpy).not.toHaveBeenCalled();
  });

  it("enters the loader in exact development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    loaderSpy.mockResolvedValue({ status: "UNAVAILABLE", reason: "FIXTURE_REJECTED" });
    const page = await QueueV2Page();
    expect(page).toBeTruthy();
    expect(loaderSpy).toHaveBeenCalledOnce();
  });
});
