import { afterEach, describe, expect, it, vi } from "vitest";

const { notFoundSpy, loaderSpy } = vi.hoisted(() => ({ notFoundSpy: vi.fn(() => { throw new Error("MOCK_NOT_FOUND"); }), loaderSpy: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound: notFoundSpy }));
vi.mock("@/application/intelligence/load-event-intelligence-offline-combined-review-queue", () => ({ loadEventIntelligenceOfflineCombinedReviewQueue: loaderSpy }));

import CombinedQueuePage from "@/app/intelligence/events/review/offline-demo/combined/page";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("offline combined queue route environment boundary", () => {
  it.each(["production", "test", "", "staging", undefined])("returns not-found for NODE_ENV=%s before loading fixtures", async environment => {
    vi.stubEnv("NODE_ENV", environment);

    await expect(CombinedQueuePage()).rejects.toThrow("MOCK_NOT_FOUND");

    expect(notFoundSpy).toHaveBeenCalledOnce();
    expect(loaderSpy).not.toHaveBeenCalled();
  });

  it("enters the loader only in exact development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    loaderSpy.mockResolvedValue({ status: "UNAVAILABLE", reason: "CANDIDATE_REJECTED" });

    const page = await CombinedQueuePage();

    expect(page).toBeTruthy();
    expect(loaderSpy).toHaveBeenCalledOnce();
    expect(notFoundSpy).not.toHaveBeenCalled();
  });
});
