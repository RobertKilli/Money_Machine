import { afterEach, describe, expect, it, vi } from "vitest";
const { notFoundSpy, loaderSpy } = vi.hoisted(() => ({ notFoundSpy: vi.fn(() => { throw new Error("MOCK_NOT_FOUND"); }), loaderSpy: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: notFoundSpy }));
vi.mock("@/application/intelligence/load-offline-review-readiness-demo", () => ({ loadOfflineReviewReadinessDemo: loaderSpy }));
import Page from "@/app/intelligence/events/review/offline-demo/review-readiness/page";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("review readiness route gate", () => {
  it.each(["production", "test", "", "staging", undefined])("rejects NODE_ENV=%s before loader and caller parameters", async value => {
    vi.stubEnv("NODE_ENV", value);
    await expect((Page as unknown as (input: unknown) => Promise<unknown>)({ searchParams: Promise.resolve({ environment: "development" }) })).rejects.toThrow("MOCK_NOT_FOUND");
    expect(notFoundSpy).toHaveBeenCalledOnce();
    expect(loaderSpy).not.toHaveBeenCalled();
  });
  it("loads only under exact development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    loaderSpy.mockResolvedValue({ status: "UNAVAILABLE" });
    expect(await Page()).toBeTruthy();
    expect(loaderSpy).toHaveBeenCalledOnce();
  });
});
