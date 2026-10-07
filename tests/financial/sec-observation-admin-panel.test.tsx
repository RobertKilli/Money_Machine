import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadSecObservationPanelState, SecObservationPanelView, type SecObservationPanelState } from "@/components/admin/sec-observation-panel";
import { createLifecycleEvent } from "@/domain/intelligence/ingestion-provenance";
import { projectSecEdgar8kObservations, type SecObservationReadRow } from "@/domain/intelligence/sec-edgar-8k-observation-read-model";

const field = (value: string | null, source: string) => ({ value, sources: value ? [source] : [] });
const now = "2026-10-07T12:00:00.000Z";
const lifecycle = (attemptId: string, terminal: "COMPLETED" | null) => [
  createLifecycleEvent({ ingestionAttemptId: attemptId, sequence: 1, eventType: "STARTED", payload: {}, recordedAt: now }),
  ...(terminal === "COMPLETED" ? [
    createLifecycleEvent({ ingestionAttemptId: attemptId, sequence: 2, eventType: "SOURCE_OBSERVED", payload: { sourceObservationId: `observation-${attemptId}` }, recordedAt: now }),
    createLifecycleEvent({ ingestionAttemptId: attemptId, sequence: 3, eventType: "COMPLETED", payload: {}, recordedAt: now }),
  ] : []),
];
const envelope = { identity: {
  cik: field("0000789019", "submission#/cik"), accession: field("0001193125-23-255762", "filing-index"), form: field("8-K", "submission#/form"), filingDate: field("2023-10-13", "submission#/filingDate"),
  acceptanceDateTime: field("2023-10-13T16:05:00.000Z", "filing-index#Accepted"), eventDate: { value: null, sources: [] }, primaryDocument: { contentRetrieved: false },
} };
const row = (requestId: string, attemptId: string, matchCount: number, terminal: "COMPLETED" | null): SecObservationReadRow => ({
  requestId, attemptId, sourceObservationId: terminal ? `observation-${attemptId}` : null, retrievedAt: terminal ? "2026-10-07T12:01:00.000Z" : null,
  envelope, envelopeMatchCount: matchCount, events: lifecycle(attemptId, terminal),
});
const empty = projectSecEdgar8kObservations([]);
const incomplete = projectSecEdgar8kObservations([row("request-open", "attempt-open", 0, null)]);
const incompleteCompleted = projectSecEdgar8kObservations([row("request-ambiguous", "attempt-ambiguous", 2, "COMPLETED")]);
const mixed = projectSecEdgar8kObservations([row("request-complete", "attempt-complete", 1, "COMPLETED"), row("request-ambiguous", "attempt-ambiguous", 2, "COMPLETED")]);
const observation = mixed.observations[0]!;
const response = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("SEC filing admin observation panel", () => {
  it("requests only the existing no-store admin read endpoint", async () => {
    const fetcher = vi.fn(async () => response(200, mixed));
    const result = await loadSecObservationPanelState(fetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/admin/intelligence/sec-edgar-8k-observations", { cache: "no-store" });
    expect(result).toMatchObject({ kind: "DATA", model: mixed });
  });

  it("separates forbidden, unavailable, malformed and transport failures", async () => {
    expect(await loadSecObservationPanelState(async () => response(403, { error: "FORBIDDEN" }))).toEqual({ kind: "FORBIDDEN" });
    expect(await loadSecObservationPanelState(async () => response(503, { error: "UNAVAILABLE" }))).toEqual({ kind: "READ_ERROR" });
    expect(await loadSecObservationPanelState(async () => response(200, { status: "OBSERVATIONS_AVAILABLE" }))).toEqual({ kind: "READ_ERROR" });
    expect(await loadSecObservationPanelState(async () => { throw new Error("offline"); })).toEqual({ kind: "READ_ERROR" });
  });

  it("rejects observations without the identity, lifecycle, fields, provenance or fixed markings it renders", async () => {
    const invalidBodies = [
      { ...mixed, observations: [{}] },
      { ...mixed, observations: [{ ...observation, cik: { value: "0000789019", sources: [7] } }] },
      { ...mixed, observations: [{ ...observation, lifecycleStatus: "OPEN" }] },
      { ...mixed, observations: [{ ...observation, attemptId: " " }] },
      { ...mixed, observations: [{ ...observation, authority: "AUTHORITATIVE" }] },
      { ...mixed, observations: [{ ...observation, eventDate: { status: "KNOWN", value: "2023-10-13", sources: [] } }] },
      { ...mixed, observations: [{ ...observation, primaryDocumentContent: "RETRIEVED" }] },
    ];
    for (const body of invalidBodies) {
      expect(await loadSecObservationPanelState(async () => response(200, body))).toEqual({ kind: "READ_ERROR" });
    }
  });

  it("rejects malformed fields, source lists, and incomplete attempts", async () => {
    expect(await loadSecObservationPanelState(async () => response(200, { ...incomplete, incomplete: [{}] }))).toEqual({ kind: "READ_ERROR" });
    expect(await loadSecObservationPanelState(async () => response(200, { ...incomplete, incomplete: [{ requestId: "r1", attemptId: "a1", lifecycleStatus: "UNKNOWN" }] }))).toEqual({ kind: "READ_ERROR" });
    expect(await loadSecObservationPanelState(async () => response(200, { ...mixed, observations: [{ ...observation, acceptanceDateTime: { value: null, sources: [""] } }] }))).toEqual({ kind: "READ_ERROR" });
    expect(await loadSecObservationPanelState(async () => response(200, { ...mixed, observations: [{ ...observation, retrievedAt: { value: "2026-10-07T12:01:00.000Z", sources: [] } }] }))).toEqual({ kind: "READ_ERROR" });
  });

  it("rejects contradictory status and result contents while keeping valid mixed results", async () => {
    for (const body of [
      { ...mixed, status: "OBSERVATIONS_AVAILABLE", observations: [] },
      { ...mixed, status: "NO_RECORDED_OBSERVATIONS" },
      { ...incomplete, status: "INGESTION_INCOMPLETE", observations: [observation] },
      { ...empty, observations: [observation] },
    ]) {
      expect(await loadSecObservationPanelState(async () => response(200, body))).toEqual({ kind: "READ_ERROR" });
    }
    expect(await loadSecObservationPanelState(async () => response(200, mixed))).toMatchObject({ kind: "DATA", model: mixed });
  });

  it("accepts and renders backend-projected incomplete results with COMPLETED lifecycle status", async () => {
    expect(incompleteCompleted).toMatchObject({ status: "INGESTION_INCOMPLETE", observations: [], incomplete: [{ lifecycleStatus: "COMPLETED" }] });
    const result = await loadSecObservationPanelState(async () => response(200, incompleteCompleted));
    expect(result).toMatchObject({ kind: "DATA", model: incompleteCompleted });
    if (result.kind !== "DATA") throw new Error("Expected validated backend read model");
    const html = renderToStaticMarkup(<SecObservationPanelView state={result} />);
    expect(html).toContain("Ingestion incomplete");
    expect(html).toContain("Request request-ambiguous");
    expect(html).toContain("COMPLETED");
  });

  it("accepts a backend-projected observation together with a COMPLETED but incomplete attempt", async () => {
    expect(mixed).toMatchObject({ status: "OBSERVATIONS_AVAILABLE", observations: [{ lifecycleStatus: "COMPLETED" }], incomplete: [{ lifecycleStatus: "COMPLETED" }] });
    const result = await loadSecObservationPanelState(async () => response(200, mixed));
    expect(result).toMatchObject({ kind: "DATA", model: mixed });
    if (result.kind !== "DATA") throw new Error("Expected validated mixed read model");
    const html = renderToStaticMarkup(<SecObservationPanelView state={result} />);
    expect(html).toContain("0001193125-23-255762");
    expect(html).toContain("Incomplete ingestion attempts");
    expect(html).toContain("Request request-ambiguous");
  });

  it("renders the distinct loading, no records, incomplete, available, forbidden and read-error states", () => {
    const render = (state: SecObservationPanelState) => renderToStaticMarkup(<SecObservationPanelView state={state} />);
    expect(render({ kind: "LOADING" })).toContain("Loading observations");
    expect(render({ kind: "DATA", model: empty })).toContain("No filing observations are recorded");
    expect(render({ kind: "DATA", model: incomplete })).toContain("Incomplete ingestion attempts");
    expect(render({ kind: "FORBIDDEN" })).toContain("Access denied");
    expect(render({ kind: "READ_ERROR" })).toContain("Observation read unavailable");
  });

  it("preserves available observations and incomplete attempts together with field provenance", () => {
    const html = renderToStaticMarkup(<SecObservationPanelView state={{ kind: "DATA", model: mixed }} />);
    expect(html).toContain("Observations available");
    expect(html).toContain("0000789019");
    expect(html).toContain("0001193125-23-255762");
    expect(html).toContain("2023-10-13T16:05:00.000Z");
    expect(html).toContain("2026-10-07T12:01:00.000Z");
    expect(html).toContain("filing-index#Accepted");
    expect(html).toContain("submission#/filingDate");
    expect(html).toContain("NON-AUTHORITATIVE SOURCE OBSERVATION");
    expect(html).toContain("Event date:");
    expect(html).toContain("Unknown");
    expect(html).toContain("Not retrieved");
    expect(html).toContain("request-ambiguous");
    expect(html).toContain("attempt-ambiguous");
    expect(html).not.toContain("No filing observations are recorded");
  });

  it("does not describe an empty read as proof that no filing exists", () => {
    const html = renderToStaticMarkup(<SecObservationPanelView state={{ kind: "DATA", model: empty }} />);
    expect(html).toContain("No recorded observations");
    expect(html).toContain("not a negative filing determination");
    expect(html).not.toContain("No filing exists");
  });
});
