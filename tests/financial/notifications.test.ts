import { describe, expect, it } from "vitest";
import { assertWebPushConfigured, evaluateHighInterest, evaluatePnlAlert, isWithinQuietHours, milestoneIndex, testNotificationEventId, toSafePushPayload, validateNotificationPreferences } from "@/domain/notifications/alerts";
import { safeNotificationPath } from "@/domain/notifications/safe-url";
import { deriveHighInterestCandidates } from "@/domain/notifications/high-interest-source";
import fs from "node:fs";

const at = new Date("2026-01-01T12:00:00.000Z");
const prefs = { enabledCategories: [], pnlMilestoneThresholdMinor: 1000n, currency: "NOK", quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "07:00", timezone: "Europe/Oslo", maxNonCriticalPerHour: 10 } as const;

describe("M8 deterministic notification alerts", () => {
  it("uses integer milestone floors and deduplicates identity", () => {
    expect(milestoneIndex(499n, 500n)).toBe(0n);
    const a = evaluatePnlAlert({ accountId: "a", asOf: at, pnlMinor: 4820n, currency: "NOK", thresholdMinor: 4000n });
    const b = evaluatePnlAlert({ accountId: "a", asOf: at, pnlMinor: 4820n, currency: "NOK", thresholdMinor: 4000n });
    expect(a?.category).toBe("SIMULATION_PNL_GAIN"); expect(a?.body).toContain("SIMULATION"); expect(a).toEqual(b);
  });
  it("emits loss, and no alert below threshold", () => {
    expect(evaluatePnlAlert({ accountId: "a", asOf: at, pnlMinor: -4001n, currency: "NOK", thresholdMinor: 4000n })?.category).toBe("SIMULATION_PNL_LOSS");
    expect(evaluatePnlAlert({ accountId: "a", asOf: at, pnlMinor: 3999n, currency: "NOK", thresholdMinor: 4000n })).toBeNull();
  });
  it("requires every high-interest condition and keeps context non-authoritative", () => {
    const input = { candidateId: "c", assetDisplayIdentifier: "X", assetClass: "CRYPTO", eligibilityStatus: "ELIGIBLE" as const, trendStatus: "COMPLETE" as const, trendDirection: "UP" as const, signedChangeBps: 500n, accelerationStatus: "COMPLETE" as const, accelerationBps: 100n, distinctProviderCount: 2, suspiciousFlags: [], asOf: at };
    expect(evaluateHighInterest(input)?.category).toBe("HIGH_INTEREST_CANDIDATE");
    expect(evaluateHighInterest({ ...input, signedChangeBps: 499n })).toBeNull();
    expect(evaluateHighInterest({ ...input, eligibilityStatus: "INCOMPLETE" })).toBeNull();
    expect(evaluateHighInterest({ ...input, suspiciousFlags: ["SUSPICIOUS_ACTIVITY"] })).toBeNull();
  });
  it("canonical high-interest source applies temporal visibility before evaluation", () => {
    const input = { candidateId: "c", assetDisplayIdentifier: "X", assetClass: "CRYPTO", eligibilityStatus: "ELIGIBLE" as const, trendStatus: "COMPLETE" as const, trendDirection: "UP" as const, signedChangeBps: 500n, accelerationStatus: "COMPLETE" as const, accelerationBps: 100n, distinctProviderCount: 2, suspiciousFlags: [], asOf: at, availableAt: at, datasetPins: ["fixture:v1"], evidenceIds: ["m4-1", "m5-1"] };
    expect(deriveHighInterestCandidates([input], at)).toHaveLength(1);
    expect(deriveHighInterestCandidates([input], new Date(at.getTime() - 1))).toHaveLength(0);
    expect(deriveHighInterestCandidates([input], at, ["other:v2"])).toHaveLength(0);
    expect(deriveHighInterestCandidates([{ ...input, signedChangeBps: 499n }], at)).toHaveLength(0);
  });
  it("validates quiet-hours timezone and bounds", () => {
    validateNotificationPreferences(prefs);
    expect(isWithinQuietHours(new Date("2026-01-01T22:30:00.000Z"), prefs)).toBe(true);
    expect(() => validateNotificationPreferences({ ...prefs, timezone: "not/a-zone" })).toThrow("INVALID_TIMEZONE");
  });
  it("allowlists safe push payload and rejects external links", () => {
    const candidate = evaluateHighInterest({ candidateId: "c", assetDisplayIdentifier: "X", assetClass: "CRYPTO", eligibilityStatus: "ELIGIBLE", trendStatus: "COMPLETE", trendDirection: "UP", signedChangeBps: 500n, accelerationStatus: "COMPLETE", accelerationBps: 100n, distinctProviderCount: 2, suspiciousFlags: [], asOf: at })!;
    expect(toSafePushPayload(candidate)).not.toHaveProperty("Authorization");
    expect(() => toSafePushPayload({ ...candidate, safeRelativeUrl: "https://evil.example" })).toThrow("UNSAFE_NOTIFICATION_URL");
  });
  it("fails closed when Web Push transport is not configured", () => {
    expect(() => assertWebPushConfigured()).toThrow("WEB_PUSH_TRANSPORT_UNCONFIGURED");
  });
  it("keeps production dedupe stable while giving explicit tests distinct invocations", () => {
    const first = testNotificationEventId("admin", 1);
    const second = testNotificationEventId("admin", 2);
    expect(first).not.toBe(second);
    expect(testNotificationEventId("admin", 1)).toBe(first);
    const productionA = evaluatePnlAlert({ accountId: "a", asOf: at, pnlMinor: 4000n, currency: "NOK", thresholdMinor: 4000n });
    const productionB = evaluatePnlAlert({ accountId: "a", asOf: at, pnlMinor: 4000n, currency: "NOK", thresholdMinor: 4000n });
    expect(productionA?.alertEventId).toBe(productionB?.alertEventId);
  });
  it("accepts only bounded same-origin activity targets", () => {
    expect(safeNotificationPath("/admin/activity")).toBe("/admin/activity");
    expect(safeNotificationPath("/admin/activity?category=SYSTEM%2FERROR&event=test")).toContain("event=test");
    for (const unsafe of ["https://evil.example", "//evil.example", "javascript:alert(1)", "data:text/html,x", "/admin/activity\\evil", "/admin/activity?url=https://evil.example", "/admin/other"]) expect(safeNotificationPath(unsafe)).toBeNull();
  });
  it("keeps the push producer/worker safeRelativeUrl contract and async click ownership", () => {
    const worker = fs.readFileSync("public/sw.js", "utf8");
    expect(worker).toContain("safeRelativeUrl");
    expect(worker).toContain("event.waitUntil");
    expect(worker).toContain("includeUncontrolled: true");
    expect(worker).toContain("await existing.navigate(target)");
    expect(worker).toContain("await existing.focus()");
  });
});
