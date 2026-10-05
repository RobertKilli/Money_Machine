import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEventIntelligenceOfflineSnapshotRoundtrip } from "@/application/intelligence/load-event-intelligence-offline-snapshot-roundtrip";
import { loadEventIntelligenceOfflineTemporalReplay } from "@/application/intelligence/load-event-intelligence-offline-temporal-replay";
import { getComposedCandidatePublicKey } from "@/application/intelligence/compose-event-intelligence-evidence-review-queue";
import { createOfflineReviewDemoFixtures } from "@/application/intelligence/offline-review-demo-fixtures";
import { EvidenceReviewQueueWorkspace } from "@/components/intelligence/evidence-review-queue-workspace";
import { OfflineSnapshotRoundtripView } from "@/components/intelligence/offline-snapshot-roundtrip-view";
import SnapshotPage from "@/app/intelligence/events/review/offline-demo/snapshot/page";
import DemoPage from "@/app/intelligence/events/review/offline-demo/page";
import ReplayPage from "@/app/intelligence/events/review/offline-demo/replay/page";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function workspaceProps(node: ReactNode, result: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!isValidElement(node)) return result;
  if (node.type === EvidenceReviewQueueWorkspace) {
    result.push(node.props as Record<string, unknown>);
    return result;
  }
  Children.forEach((node.props as { children?: ReactNode }).children, child => workspaceProps(child, result));
  return result;
}

describe("offline snapshot roundtrip demo", () => {
  it("encodes the later actual replay payload, then verifies it with independently built scope expectations", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const [replay, result] = await Promise.all([
      loadEventIntelligenceOfflineTemporalReplay(),
      loadEventIntelligenceOfflineSnapshotRoundtrip(),
    ]);
    expect(replay.status).toBe("AVAILABLE");
    expect(result.status).toBe("AVAILABLE");
    if (replay.status !== "AVAILABLE" || result.status !== "AVAILABLE") return;
    const later = replay.episodes[1]!;
    expect(result.model).toEqual(later.model);
    expect(result).toMatchObject({
      formatVersion: "event-intelligence-evidence-review-queue-snapshot/v1",
      cutoff: "2026-10-03T12:00:00.000Z",
      verificationStatus: "VERIFIED_LOCAL_SCOPE_BINDING_NON_AUTHORITATIVE",
      changedBytesCode: "DIGEST_MISMATCH",
      changedScopeCode: "SNAPSHOT_SCOPE_MISMATCH",
      changedScopeCodecStatus: "VALID",
    });
    expect(result.model.items.map(item => [item.reviewType, item.status, item.operationalPriority, item.historical])).toEqual([
      ["CORRECTION_LINEAGE_REVIEW", "BLOCKED", "URGENT_CORRECTION_REVIEW", true],
      ["RIGHTS_APPROVAL_REVIEW", "BLOCKED", "BLOCKED_RIGHTS", true],
      ["ISSUER_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED", true],
    ]);
    expect(result.model.state).toBe("HAS_REVIEW_ITEMS");
    expect(result.model.items).toHaveLength(3);
  });

  it("returns only decoded presentation data and does not restore candidate binding or source-context links", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await loadEventIntelligenceOfflineSnapshotRoundtrip();
    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") return;
    const candidateId = createOfflineReviewDemoFixtures()!.find(fixture => fixture.key === "unresolved-correction")!.candidate.candidateId;
    expect(getComposedCandidatePublicKey(result.model, candidateId)).toBeNull();
    const copied = JSON.parse(JSON.stringify(result.model)) as typeof result.model;
    expect(getComposedCandidatePublicKey(copied, candidateId)).toBeNull();
    const props = workspaceProps(createElement(OfflineSnapshotRoundtripView, { result }));
    expect(props).toHaveLength(1);
    expect(Object.keys(props[0]!).sort()).toEqual(["idPrefix", "model", "presentation"]);
    expect(props[0]!.idPrefix).toBe("snapshot-roundtrip-decoded");
    expect(JSON.stringify(props)).not.toMatch(/candidateId|sourceMaterial|sourceContext|routingMaterial|scopeMaterial|canonicalBytes|fingerprint|trust/i);
    const html = renderToStaticMarkup(await OfflineSnapshotRoundtripView({ result }));
    expect(html).toContain("DIGEST_MISMATCH");
    expect(html).toContain("SNAPSHOT_SCOPE_MISMATCH");
    expect(html).not.toContain("offline-demo-correction");
    expect(html).not.toContain("href=\"#");
  });

  it("keeps control artifacts isolated and proves the alternate artifact passes codec first", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await loadEventIntelligenceOfflineSnapshotRoundtrip();
    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") return;
    const original = await loadEventIntelligenceOfflineSnapshotRoundtrip();
    expect(original).toEqual(result);
    // The loader emits this only after codec decoding of the alternate artifact succeeded.
    expect(result.changedScopeCode).toBe("SNAPSHOT_SCOPE_MISMATCH");
    expect(result.changedScopeCodecStatus).toBe("VALID");
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("links from overview and replay while preserving their existing flows", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const overview = renderToStaticMarkup(await DemoPage());
    const replay = renderToStaticMarkup(await ReplayPage());
    expect(overview).toContain("href=\"/intelligence/events/review/offline-demo/snapshot\"");
    expect(replay).toContain("href=\"/intelligence/events/review/offline-demo/snapshot\"");
    expect(replay).toContain("href=\"/intelligence/events/review/offline-demo/combined\"");
    expect(replay).toContain("href=\"/intelligence/events/review/offline-demo\"");
  });

  it.each(["production", "test", "", "staging", undefined])("gates route before loader when NODE_ENV is %s", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    await expect(SnapshotPage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("gates the direct loader before loading replay fixtures or composition", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(loadEventIntelligenceOfflineSnapshotRoundtrip()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
