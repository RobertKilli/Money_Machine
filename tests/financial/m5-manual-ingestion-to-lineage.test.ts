import { describe, expect, it } from "vitest";
import { buildManualIngestionToLineagePlan, executeManualIngestionToLineage } from "@/application/intelligence/manual-ingestion-to-lineage";

const pkg = (records = [{ providerExternalRecordId: "record-1", payloadFingerprint: "a".repeat(64), pageOrdinal: 0, itemOrdinal: 0, retrievedAt: "2026-01-01T00:01:00.000Z", recordedAt: "2026-01-01T00:02:00.000Z", observedAt: "2026-01-01T00:00:00.000Z", normalizedEnvelope: { kind: "synthetic" }, selectedAuditableFields: { id: "record-1" }, metadata: { cursorSafety: "NONE" } }]) => ({ contractVersion: "m5-normalized-source-package/v1", idempotencyKey: "manual-synthetic-1", providerId: "synthetic-provider", datasetId: "synthetic-dataset", datasetVersion: "v1", providerSourceNamespace: "SYNTHETIC", adapterContractVersion: "manual/v1", adapterVersion: "manual/v1", parserContractVersion: "normalized/v1", parserVersion: "normalized/v1", envelopeSchemaVersion: "envelope/v1", attemptNumber: 1, requestedAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:00.000Z", recordedAt: "2026-01-01T00:02:00.000Z", requestScope: { scope: "synthetic" }, provenance: { system: "test" }, executionInput: { mode: "manual" }, records });

describe("M5 manual ingestion-to-lineage", () => {
  it("plans deterministic completed lineage without a UoW during dry run", async () => {
    const first = buildManualIngestionToLineagePlan(pkg()); const second = buildManualIngestionToLineagePlan(pkg());
    expect(first.sourceLineageId).toBe(second.sourceLineageId); expect(first.events.map(event => event.sequence)).toEqual([1, 2, 3]); expect(first.events.map(event => event.eventType)).toEqual(["STARTED", "SOURCE_OBSERVED", "COMPLETED"]);
    await expect(executeManualIngestionToLineage(pkg(), { apply: false })).resolves.toMatchObject({ status: "DRY_RUN_READY" });
  });
  it("rejects empty, unsafe, duplicate, and quarantined input", () => {
    expect(() => buildManualIngestionToLineagePlan(pkg([]))).toThrow("M5_MANUAL_EMPTY_PACKAGE");
    expect(() => buildManualIngestionToLineagePlan({ ...pkg(), token: "no" })).toThrow("M5_MANUAL_SECRET_LIKE_FIELD_REJECTED");
    expect(() => buildManualIngestionToLineagePlan(pkg([{ ...pkg().records[0], itemOrdinal: 0 }, { ...pkg().records[0], itemOrdinal: 0, providerExternalRecordId: "record-2" }]))).toThrow("M5_MANUAL_DUPLICATE_ORDINAL");
    expect(() => buildManualIngestionToLineagePlan(pkg([{ ...pkg().records[0], observedAt: "2026-01-01T00:03:00.000Z" }]))).toThrow("M5_MANUAL_TEMPORAL_INVALID");
  });
});
