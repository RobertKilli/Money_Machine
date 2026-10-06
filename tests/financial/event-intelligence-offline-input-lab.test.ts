import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultOfflineInputLabInput,
  offlineInputLabFieldName,
  parseOfflineInputLabFormData,
  parseOfflineInputLabInput,
  OFFLINE_INPUT_LAB_MAX_PAYLOAD_BYTES,
  OFFLINE_INPUT_LAB_VERSION,
  type OfflineInputLabInput,
  type OfflineInputLabRecord,
} from "@/application/intelligence/offline-input-lab-contract";
import { runOfflineReviewInputLab } from "@/application/intelligence/run-offline-review-input-lab";

afterEach(() => vi.unstubAllEnvs());

type MutableInput = { version: typeof OFFLINE_INPUT_LAB_VERSION; cutoff: string; records: OfflineInputLabRecord[] };
function cloneInput(): MutableInput { return structuredClone(defaultOfflineInputLabInput()) as MutableInput; }
function formFrom(input: OfflineInputLabInput): FormData {
  const form = new FormData();
  form.append("version", input.version);
  form.append("cutoff", input.cutoff);
  input.records.forEach((record, index) => {
    for (const field of ["profile", "included", "headline", "publishedAt", "discoveredAt", "receivedAt", "recordedAt", "jurisdiction", "eventHint"] as const) {
      const value = record[field];
      form.append(offlineInputLabFieldName(index, field), field === "included" ? value ? "yes" : "no" : String(value));
    }
  });
  return form;
}

describe("bounded offline review input lab", () => {
  it("runs the fixed three-profile input through discovery, V2 composition and the V2 projection", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = await runOfflineReviewInputLab(defaultOfflineInputLabInput());
    expect(result.status).toBe("EVALUATED");
    if (result.status !== "EVALUATED") return;
    expect(result.cutoff).toBe("2026-10-03T12:00:00.000Z");
    expect(result.submittedCount).toBe(3);
    expect(result.includedCount).toBe(3);
    expect(result.discoveryAcceptedCount).toBe(3);
    expect(result.discoveryRejectedCount).toBe(0);
    expect(result.composedCount).toBe(3);
    expect(result.compositionStatus).toBe("NON_AUTHORITATIVE_SYNTHETIC_COMPOSITION");
    expect(result.queueStatus).toBe("HAS_REVIEW_ITEMS");
    expect(result.model?.items.map(item => [item.reviewType, item.status, item.operationalPriority])).toEqual([
      ["CORRECTION_LINEAGE_REVIEW", "BLOCKED", "URGENT_CORRECTION_REVIEW"],
      ["RIGHTS_APPROVAL_REVIEW", "BLOCKED", "BLOCKED_RIGHTS"],
      ["ISSUER_MAPPING_REVIEW", "OPEN", "MAPPING_REQUIRED"],
    ]);
    expect(result.model?.items.every(item => item.historical && item.evaluatedAsOf === result.cutoff)).toBe(true);
    const safe = JSON.stringify(result);
    expect(safe).not.toMatch(/candidateId|fingerprint|routingMaterial|routingResultId|decisionFingerprint|policyReference/);
  });

  it("rejects one future recordedAt through discovery while composing the other valid candidates", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const input = cloneInput();
    input.records[2] = Object.freeze({ ...input.records[2]!, recordedAt: "2026-10-03T12:00:00.001Z" });
    const result = await runOfflineReviewInputLab(input);
    expect(result.status).toBe("EVALUATED");
    if (result.status !== "EVALUATED") return;
    expect(result.discoveryAcceptedCount).toBe(2);
    expect(result.discoveryRejectedCount).toBe(1);
    expect(result.outcomes[2]).toMatchObject({ state: "DISCOVERY_REJECTED", rejectionCode: "NEWS_DISCOVERY_INVALID" });
    expect(result.model?.items.map(item => item.reviewType)).toEqual(["RIGHTS_APPROVAL_REVIEW", "ISSUER_MAPPING_REVIEW"]);
  });

  it("lets the parent discovery API reject reversed publication/discovery times", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const input = cloneInput();
    input.records[0] = Object.freeze({ ...input.records[0]!, publishedAt: "2026-10-01T10:00:00.000Z" });
    const result = await runOfflineReviewInputLab(input);
    expect(result.status).toBe("EVALUATED");
    if (result.status !== "EVALUATED") return;
    expect(result.outcomes[0]).toMatchObject({ state: "DISCOVERY_REJECTED", rejectionCode: "NEWS_DISCOVERY_INVALID" });
    expect(result.discoveryAcceptedCount).toBe(2);
    expect(result.model?.items.map(item => item.reviewType)).not.toContain("ISSUER_MAPPING_REVIEW");
  });

  it("accepts recordedAt equal to cutoff and supports represented jurisdiction and event-hint variants", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const input = cloneInput();
    input.records[0] = Object.freeze({ ...input.records[0]!, recordedAt: input.cutoff, jurisdiction: "GB", eventHint: "BOARD_AUTHORIZATION" });
    input.records[1] = Object.freeze({ ...input.records[1]!, included: false });
    input.records[2] = Object.freeze({ ...input.records[2]!, included: false });
    const result = await runOfflineReviewInputLab(input);
    expect(result.status).toBe("EVALUATED");
    if (result.status !== "EVALUATED") return;
    expect(result.discoveryAcceptedCount).toBe(1);
    expect(result.discoveryRejectedCount).toBe(0);
    expect(result.model?.items).toHaveLength(1);
    expect(result.model?.items[0]?.status).toBe("OPEN");
  });

  it("isolates form values from the immutable returned presentation", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const input = cloneInput();
    const promise = runOfflineReviewInputLab(input);
    input.records[0] = Object.freeze({ ...input.records[0]!, headline: "Changed after invocation" });
    const result = await promise;
    expect(result.status).toBe("EVALUATED");
    if (result.status !== "EVALUATED") return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.outcomes)).toBe(true);
    expect(result.outcomes[0]?.headline).toBe("Synthetic Demo Company considers a Bitcoin purchase");
  });

  it("reports the parent V2 composer’s actual empty-input rejection without inventing an empty queue", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const input = cloneInput();
    input.records.forEach((record, index) => { input.records[index] = Object.freeze({ ...record, included: false }); });
    const result = await runOfflineReviewInputLab(input);
    expect(result.status).toBe("EVALUATED");
    if (result.status !== "EVALUATED") return;
    expect(result.includedCount).toBe(0);
    expect(result.submittedCount).toBe(3);
    expect(result.omittedCount).toBe(3);
    expect(result.compositionStatus).toBe("BLOCKED_NO_ACCEPTED_RECORDS");
    expect(result.compositionCode).toBe("COMPOSITION_INPUT_INVALID");
    expect(result.queueStatus).toBe("NOT_CREATED");
    expect(result.model).toBeNull();
    expect(result.composedCount).toBe(0);
  });

  it("does not substitute a default record when all included inputs fail discovery", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const input = cloneInput();
    input.records = input.records.map(record => Object.freeze({ ...record, recordedAt: "2026-10-03T12:00:00.001Z" }));
    const result = await runOfflineReviewInputLab(input);
    expect(result.status).toBe("EVALUATED");
    if (result.status !== "EVALUATED") return;
    expect(result.discoveryAcceptedCount).toBe(0);
    expect(result.discoveryRejectedCount).toBe(3);
    expect(result.outcomes.every(item => item.state === "DISCOVERY_REJECTED")).toBe(true);
    expect(result.model).toBeNull();
  });

  it("strictly rejects unknown fields, duplicate singular form fields, unsupported enums and overlong headlines", () => {
    const baseline = defaultOfflineInputLabInput();
    expect(parseOfflineInputLabInput({ ...baseline, extra: true }).status).toBe("INVALID");
    const tooLong = cloneInput();
    tooLong.records[0] = Object.freeze({ ...tooLong.records[0]!, headline: "x".repeat(161) });
    expect(parseOfflineInputLabInput(tooLong)).toMatchObject({ status: "INVALID" });
    const unknownEnum = cloneInput();
    unknownEnum.records[0] = Object.freeze({ ...unknownEnum.records[0]!, jurisdiction: "CA" as never });
    expect(parseOfflineInputLabInput(unknownEnum).status).toBe("INVALID");
    const duplicateProfile = cloneInput();
    duplicateProfile.records[1] = Object.freeze({ ...duplicateProfile.records[1]!, profile: "issuer-mapping" });
    expect(parseOfflineInputLabInput(duplicateProfile)).toMatchObject({ status: "INVALID", errors: [{ field: "records.1.profile" }] });
    const sparse = { ...baseline, records: new Array(3) };
    expect(parseOfflineInputLabInput(sparse).status).toBe("INVALID");
    const tooMany = { ...baseline, records: [...baseline.records, baseline.records[0]!] };
    expect(parseOfflineInputLabInput(tooMany).status).toBe("INVALID");

    const duplicated = formFrom(baseline);
    duplicated.append("cutoff", baseline.cutoff);
    expect(parseOfflineInputLabFormData(duplicated)).toMatchObject({ status: "INVALID", errors: [{ code: "DUPLICATE_FIELD" }] });
    const unknownField = formFrom(baseline);
    unknownField.append("routingMaterial", "caller value");
    expect(parseOfflineInputLabFormData(unknownField)).toMatchObject({ status: "INVALID", errors: [{ code: "UNKNOWN_FIELD" }] });
    const tooLarge = formFrom(baseline);
    tooLarge.append("extra", "x".repeat(OFFLINE_INPUT_LAB_MAX_PAYLOAD_BYTES));
    expect(parseOfflineInputLabFormData(tooLarge)).toMatchObject({ status: "INVALID", errors: [{ code: "INPUT_TOO_LARGE" }] });
  });

  it("does not read caller accessors and gates before inspecting input outside development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    let getterRead = false;
    const accessor = Object.defineProperty({}, "version", { enumerable: true, get() { getterRead = true; throw new Error("caller hook"); } });
    const rejected = await runOfflineReviewInputLab(accessor);
    expect(rejected.status).toBe("INVALID");
    expect(getterRead).toBe(false);

    vi.stubEnv("NODE_ENV", "test");
    const hostile = new Proxy({}, { get() { throw new Error("must not inspect before gate"); } });
    await expect(runOfflineReviewInputLab(hostile)).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });
});
