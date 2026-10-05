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
    await expect(invokeRouteWithUntrustedProps({ searchParams: Promise.resolve({ scenario: "issuer-mapping" }) })).rejects.toThrow("MOCK_NOT_FOUND");
    expect(notFoundSpy).toHaveBeenCalledOnce();
    expect(loaderSpy).not.toHaveBeenCalled();
  });

  it.each([{ value: "unknown" }, { value: "" }, { value: ["rights", "correction"] }])("rejects an invalid scenario selection before loading the demo: $value", async ({ value: scenario }) => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(invokeRouteWithUntrustedProps({ searchParams: Promise.resolve({ scenario }) })).rejects.toThrow("MOCK_NOT_FOUND");
    expect(notFoundSpy).toHaveBeenCalledOnce();
    expect(loaderSpy).not.toHaveBeenCalled();
  });

  it.each([{ value: "unknown" }, { value: "" }, { value: ["rights", "correction"] }])("keeps the environment gate ahead of invalid selection: $value", async ({ value: scenario }) => {
    vi.stubEnv("NODE_ENV", "test");
    await expect(invokeRouteWithUntrustedProps({ searchParams: Promise.resolve({ scenario }) })).rejects.toThrow("MOCK_NOT_FOUND");
    expect(notFoundSpy).toHaveBeenCalledOnce();
    expect(loaderSpy).not.toHaveBeenCalled();
  });

  it("rejects outside development before awaiting or examining search parameters", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const then = vi.fn((resolve: (value: unknown) => void) => resolve({ scenario: "unknown" }));
    const unawaitedSearchParams = { then } as unknown as Promise<{ scenario?: string | string[] }>;

    await expect(invokeRouteWithUntrustedProps({ searchParams: unawaitedSearchParams })).rejects.toThrow("MOCK_NOT_FOUND");
    expect(then).not.toHaveBeenCalled();
    expect(loaderSpy).not.toHaveBeenCalled();
  });
});
