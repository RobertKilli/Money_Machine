import { afterEach, describe, expect, it, vi } from "vitest";
import { loadOfflineReviewSessionDemo } from "@/application/intelligence/load-offline-review-session-demo";

afterEach(() => vi.unstubAllEnvs());

describe("offline review session demonstration loader", () => {
  it("renders actual isolated session evaluations without handles or domain data", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await loadOfflineReviewSessionDemo();
    expect(result.status).toBe("AVAILABLE");
    if (result.status !== "AVAILABLE") return;
    const byKey = new Map(result.scenarios.map(scenario => [scenario.key, scenario]));
    expect(byKey.get("EMPTY")?.evaluations[0]).toMatchObject({ status: "NO_REVIEW_EVIDENCE", includedAttestations: 0 });
    expect(byKey.get("PROCEED")?.evaluations[0]).toMatchObject({ status: "COMPLETED_PROCEED", outcome: "COMPLETED_PROCEED" });
    expect(byKey.get("STOP")?.evaluations[0]).toMatchObject({ status: "COMPLETED_STOP", outcome: "COMPLETED_STOP" });
    expect(byKey.get("CONFLICT")?.evaluations[0]).toMatchObject({ status: "HELD", outcome: "EVIDENCE_INSUFFICIENT", reason: "EVIDENCE_CONFLICT" });
    expect(byKey.get("CORRECTION")?.evaluations.map(evaluation => evaluation.status)).toEqual(["HELD", "COMPLETED_PROCEED"]);
    expect(byKey.get("REVOCATION")?.evaluations.map(evaluation => evaluation.status)).toEqual(["COMPLETED_PROCEED", "HELD"]);
    expect(byKey.get("CORRECTION")?.evaluations.map(evaluation => evaluation.cutoff)).toEqual(["2026-10-02T00:00:00.000Z", "2026-10-03T12:00:00.000Z"]);
    expect(byKey.get("REVOCATION")?.evaluations.map(evaluation => evaluation.cutoff)).toEqual(["2026-10-02T00:00:00.000Z", "2026-10-03T12:00:00.000Z"]);
    expect(byKey.get("PROCEED")?.evaluations[0]?.inventoryGuarantee).toBe("EXACT_SESSION_OPERATIONS_ONLY");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("news-discovery-candidate:");
    expect(serialized).not.toContain("routingResultId");
    expect(serialized).not.toContain("session-proceed");
    expect(serialized).not.toContain("fingerprint");
    expect(Object.isFrozen(result.scenarios)).toBe(true);
    expect(result.scenarios.every(scenario => Object.isFrozen(scenario) && scenario.evaluations.every(Object.isFrozen))).toBe(true);
  });
});
