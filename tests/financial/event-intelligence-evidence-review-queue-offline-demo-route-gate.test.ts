import { afterEach, describe, expect, it, vi } from "vitest";

const { notFoundSpy, loaderSpy } = vi.hoisted(() => ({ notFoundSpy: vi.fn(() => { throw new Error("MOCK_NOT_FOUND"); }), loaderSpy: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound: notFoundSpy }));
vi.mock("@/application/intelligence/load-event-intelligence-offline-review-demo", () => ({ loadEventIntelligenceOfflineReviewDemo: loaderSpy }));

import OfflineEvidenceReviewDemoPage from "@/app/intelligence/events/review/offline-demo/page";

const invokeRouteWithUntrustedProps = OfflineEvidenceReviewDemoPage as unknown as (props: unknown) => Promise<unknown>;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("offline demo route environment boundary", () => {
  it.each(["production", "test", "", "staging", undefined])("returns not-found before calling the loader when NODE_ENV is %s", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(invokeRouteWithUntrustedProps({ searchParams: Promise.resolve({ environment: "development" }) })).rejects.toThrow("MOCK_NOT_FOUND");
    expect(notFoundSpy).toHaveBeenCalledOnce();
    expect(loaderSpy).not.toHaveBeenCalled();
  });
});
