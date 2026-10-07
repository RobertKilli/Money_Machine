import { describe, expect, it } from "vitest";
import { createLifecycleEvent } from "@/domain/intelligence/ingestion-provenance";
import { projectSecEdgar8kObservations } from "@/domain/intelligence/sec-edgar-8k-observation-read-model";

const now = "2026-10-07T12:00:00.000Z";
const started = (attemptId: string) => createLifecycleEvent({ ingestionAttemptId: attemptId, sequence: 1, eventType: "STARTED", payload: {}, recordedAt: now });
const completion = (attemptId: string, sourceObservationId: string) => [started(attemptId), createLifecycleEvent({ ingestionAttemptId: attemptId, sequence: 2, eventType: "SOURCE_OBSERVED", payload: { sourceObservationId }, recordedAt: now }), createLifecycleEvent({ ingestionAttemptId: attemptId, sequence: 3, eventType: "COMPLETED", payload: {}, recordedAt: now })];
const field = (value: string | null, source: string) => ({ value, sources: [source] });
const envelope = { identity: { cik: field("0000789019", "https://data.sec.gov/submissions/CIK0000789019.json#/cik"), accession: field("0001193125-23-255762", "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/index.json"), form: field("8-K", "https://data.sec.gov/submissions/CIK0000789019.json#/form"), filingDate: field("2023-10-13", "https://data.sec.gov/submissions/CIK0000789019.json#/filingDate"), acceptanceDateTime: field("2023-10-13T16:05:00.000Z", "https://www.sec.gov/Archives/edgar/data/789019/000119312523255762/index.json#Accepted"), eventDate: { value: null, sources: [] }, primaryDocument: { contentRetrieved: false } } };

describe("SEC filing observation read model", () => {
  it("distinguishes no records from incomplete ingestion without asserting a negative filing", () => {
    expect(projectSecEdgar8kObservations([])).toMatchObject({ status: "NO_RECORDED_OBSERVATIONS", observations: [], incomplete: [] });
    expect(projectSecEdgar8kObservations([{ requestId: "r1", attemptId: "a1", sourceObservationId: null, retrievedAt: null, envelope: null, events: [started("a1")] }])).toMatchObject({ status: "INGESTION_INCOMPLETE", observations: [], incomplete: [{ lifecycleStatus: "OPEN" }] });
  });

  it("keeps acceptance and retrieval times separate and makes temporal/authority limits explicit", () => {
    const model = projectSecEdgar8kObservations([{ requestId: "r1", attemptId: "a1", sourceObservationId: "o1", retrievedAt: "2026-10-07T12:01:00.000Z", envelope, events: completion("a1", "o1") }]);
    expect(model.status).toBe("OBSERVATIONS_AVAILABLE");
    expect(model.observations[0]).toMatchObject({ cik: { value: "0000789019" }, accession: { value: "0001193125-23-255762" }, form: { value: "8-K" }, filingDate: { value: "2023-10-13" }, acceptanceDateTime: { value: "2023-10-13T16:05:00.000Z" }, retrievedAt: { value: "2026-10-07T12:01:00.000Z" }, authority: "NON_AUTHORITATIVE_SOURCE_OBSERVATION", eventDate: { status: "UNKNOWN", value: null, sources: [] }, primaryDocumentContent: "NOT_RETRIEVED" });
    expect(model.observations[0]!.retrievedAt.value).not.toBe(model.observations[0]!.acceptanceDateTime.value);
  });

  it("does not promote malformed completed rows to observations", () => {
    const model = projectSecEdgar8kObservations([{ requestId: "r1", attemptId: "a1", sourceObservationId: "o1", retrievedAt: "2026-10-07T12:01:00.000Z", envelope: { identity: { ...envelope.identity, eventDate: { value: "2023-10-13", sources: [] } } }, events: completion("a1", "o1") }]);
    expect(model).toMatchObject({ status: "INGESTION_INCOMPLETE", observations: [], incomplete: [{ lifecycleStatus: "COMPLETED" }] });
  });
});
