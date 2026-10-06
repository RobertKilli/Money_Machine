import { afterEach, describe, expect, it, vi } from "vitest";

const { loaderSpy } = vi.hoisted(() => ({ loaderSpy: vi.fn() }));

vi.mock("@/application/intelligence/load-event-intelligence-offline-temporal-replay", () => ({ loadEventIntelligenceOfflineTemporalReplay: loaderSpy }));

import ReplayPage from "@/app/intelligence/events/review/offline-demo/replay/page";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("offline temporal replay route environment boundary", () => {
  it.each(["production", "test", "", "staging", undefined])("returns not-found when NODE_ENV is %s before importing the replay loader", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(ReplayPage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(loaderSpy).not.toHaveBeenCalled();
  });
});
