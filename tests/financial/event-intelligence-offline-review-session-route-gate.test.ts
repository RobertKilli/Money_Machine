import { afterEach, describe, expect, it, vi } from "vitest";

const { notFoundSpy, loaderSpy } = vi.hoisted(() => ({ notFoundSpy: vi.fn(() => { throw new Error("MOCK_NOT_FOUND"); }), loaderSpy: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: notFoundSpy }));
vi.mock("@/application/intelligence/load-offline-review-session-demo", () => ({ loadOfflineReviewSessionDemo: loaderSpy }));

import OfflineReviewSessionPage from "@/app/intelligence/events/review/offline-demo/review-session/page";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("review session route environment gate", () => {
  it.each(["production", "test", "", "staging", undefined])("returns not-found for NODE_ENV=%s before loader invocation, even with caller parameters", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    const page = OfflineReviewSessionPage as unknown as (input: unknown) => Promise<unknown>;
    await expect(page({ searchParams: Promise.resolve({ environment: "development" }) })).rejects.toThrow("MOCK_NOT_FOUND");
    expect(notFoundSpy).toHaveBeenCalledOnce();
    expect(loaderSpy).not.toHaveBeenCalled();
  });

  it("enters the direct loader only in exact development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    loaderSpy.mockResolvedValue({ status: "UNAVAILABLE" });
    expect(await OfflineReviewSessionPage()).toBeTruthy();
    expect(loaderSpy).toHaveBeenCalledOnce();
  });
});
