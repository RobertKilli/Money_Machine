import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadSecObservationPanelState, SecObservationPanelView, type SecObservationPanelState } from "@/components/admin/sec-observation-panel";
import type { SecObservationReadModel } from "@/domain/intelligence/sec-edgar-8k-observation-read-model";

const field = (value: string | null, source: string) => ({ value, sources: value ? [source] : [] });
const observation: SecObservationReadModel["observations"][number] = {
  requestId: "request-complete", attemptId: "attempt-complete", sourceObservationId: "observation-1", lifecycleStatus: "COMPLETED",
  cik: field("0000789019", "submission#/cik"), accession: field("0001193125-23-255762", "filing-index"), form: field("8-K", "submission#/form"), filingDate: field("2023-10-13", "submission#/filingDate"),
  acceptanceDateTime: field("2023-10-13T16:05:00.000Z", "filing-index#Accepted"), retrievedAt: field("2026-10-07T12:01:00.000Z", "source-observation:observation-1:retrieved_at"),
  authority: "NON_AUTHORITATIVE_SOURCE_OBSERVATION", eventDate: { status: "UNKNOWN", value: null, sources: [] }, primaryDocumentContent: "NOT_RETRIEVED",
};
const empty: SecObservationReadModel = { status: "NO_RECORDED_OBSERVATIONS", observations: [], incomplete: [] };
const incomplete: SecObservationReadModel = { status: "INGESTION_INCOMPLETE", observations: [], incomplete: [{ requestId: "request-open", attemptId: "attempt-open", lifecycleStatus: "OPEN" }] };
const mixed: SecObservationReadModel = { status: "OBSERVATIONS_AVAILABLE", observations: [observation], incomplete: incomplete.incomplete };
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
    expect(html).toContain("request-open");
    expect(html).toContain("attempt-open");
    expect(html).not.toContain("No filing observations are recorded");
  });

  it("does not describe an empty read as proof that no filing exists", () => {
    const html = renderToStaticMarkup(<SecObservationPanelView state={{ kind: "DATA", model: empty }} />);
    expect(html).toContain("No recorded observations");
    expect(html).toContain("not a negative filing determination");
    expect(html).not.toContain("No filing exists");
  });
});
