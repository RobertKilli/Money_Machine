import { afterEach, describe, expect, it, vi } from "vitest";

const { replaySpy, scopeSpy, codecSpy, bindingSpy } = vi.hoisted(() => ({
  replaySpy: vi.fn(), scopeSpy: vi.fn(), codecSpy: vi.fn(), bindingSpy: vi.fn(),
}));

vi.mock("@/application/intelligence/load-event-intelligence-offline-temporal-replay", () => ({ loadEventIntelligenceOfflineTemporalReplay: replaySpy }));
vi.mock("@/domain/intelligence/event-intelligence-evidence-review-queue-scope-identity", () => ({ buildEvidenceReviewQueueScopeIdentity: scopeSpy }));
vi.mock("@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-codec", () => ({ encodeEvidenceReviewQueueSnapshot: codecSpy, decodeEvidenceReviewQueueSnapshot: codecSpy }));
vi.mock("@/domain/intelligence/event-intelligence-evidence-review-queue-snapshot-scope-binding", () => ({ verifyEvidenceReviewQueueSnapshotScopeBinding: bindingSpy }));

import { loadEventIntelligenceOfflineSnapshotRoundtrip } from "@/application/intelligence/load-event-intelligence-offline-snapshot-roundtrip";
import SnapshotPage from "@/app/intelligence/events/review/offline-demo/snapshot/page";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("offline snapshot roundtrip gates", () => {
  it.each(["production", "test", "", "staging", undefined])("rejects the direct loader before replay, scope, codec or binding when NODE_ENV is %s", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(loadEventIntelligenceOfflineSnapshotRoundtrip()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(replaySpy).not.toHaveBeenCalled();
    expect(scopeSpy).not.toHaveBeenCalled();
    expect(codecSpy).not.toHaveBeenCalled();
    expect(bindingSpy).not.toHaveBeenCalled();
  });

  it.each(["production", "test", "", "staging", undefined])("rejects the route before invoking its loader when NODE_ENV is %s", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(SnapshotPage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(replaySpy).not.toHaveBeenCalled();
  });
});
