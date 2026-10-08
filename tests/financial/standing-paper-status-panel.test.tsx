import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadStandingPaperStatus, parseStandingPaperStatus, StandingPaperStatusPanelView, type PaperStatusPanelState } from "@/components/standing-paper-status-panel";
import type { StandingPaperStatusReadModel } from "@/application/paper-trading/standing-paper-status";

const model: StandingPaperStatusReadModel = {
  status: "AVAILABLE", classification: "PAPER_ONLY_SYNTHETIC_SIMULATION", workerStatus: "UNKNOWN",
  policies: [{
    status: "AVAILABLE", policyId: "paper-policy-test", identity: "synthetic-test-account", version: "standing-paper-policy/v1",
    policyStatus: "ACTIVE", mode: "PAPER_ONLY", workerStatus: "UNKNOWN", allowedInstrumentIds: ["fixture:alpha"],
    riskLimits: { capitalBudgetMinor: "500000", maxOrderMinor: "100000", maxPositionMinor: "300000", maxGrossExposureMinor: "500000", maxLossMinor: "25000", maxPriceAgeMs: 86400000 },
    lastRound: { id: "run-1", completedAt: "2026-10-08T10:00:00.000Z", asOf: "2026-10-08T09:00:00.000Z" },
    netContributionsMinor: "200000", committedCapitalMinor: "80000", remainingCapitalBudgetMinor: "420000",
    portfolioValueMinor: "198500", portfolioValueAsOf: "2026-10-08T09:00:00.000Z", currentLossMinor: "1500", remainingLossMarginMinor: "23500",
    decisions: [{ orderId: "order-1", decisionId: "decision-1", outcome: "REJECTED", reasonCode: "PRICE_STALE", disposition: "REJECT", recordedAt: "2026-10-08T10:00:00.000Z" }],
    fills: [{ fillId: "fill-1", orderId: "order-2", instrumentId: "fixture:alpha", quantityAtoms: "1000000", quantityScale: 6, grossMinor: "79900", feeMinor: "100", currency: "NOK", simulatedAt: "2026-10-08T10:00:00.000Z", executionPolicyVersion: "m1-market-execution/v1" }],
    issueCode: null,
  }],
};
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("standing paper status view", () => {
  it("requests the private endpoint with no-store and validates the returned model", async () => {
    const fetcher = vi.fn(async () => response(200, model));
    expect(await loadStandingPaperStatus(fetcher)).toEqual({ kind: "DATA", model });
    expect(fetcher).toHaveBeenCalledWith("/api/dashboard/paper-status", { cache: "no-store", credentials: "same-origin" });
    expect(parseStandingPaperStatus({ ...model, workerStatus: "RUNNING" })).toBeNull();
  });

  it("separates no policy, invalid payload, forbidden and read failure", async () => {
    const noPolicy = { status: "NO_POLICY", classification: model.classification, workerStatus: "UNKNOWN", policies: [] };
    expect(await loadStandingPaperStatus(async () => response(200, noPolicy))).toMatchObject({ kind: "DATA", model: { status: "NO_POLICY" } });
    expect(await loadStandingPaperStatus(async () => response(200, { ...model, policies: [{}] }))).toEqual({ kind: "READ_ERROR" });
    expect(await loadStandingPaperStatus(async () => response(401, {}))).toEqual({ kind: "FORBIDDEN" });
    expect(await loadStandingPaperStatus(async () => response(503, {}))).toEqual({ kind: "READ_ERROR" });
    expect(await loadStandingPaperStatus(async () => { throw new Error("offline"); })).toEqual({ kind: "READ_ERROR" });
  });

  it("renders saved metrics, explicit simulation labels, worker uncertainty and reason codes without controls", () => {
    const html = renderToStaticMarkup(<StandingPaperStatusPanelView state={{ kind: "DATA", model }} />);
    expect(html).toContain("PAPER_ONLY");
    expect(html).toContain("Syntetiske priser");
    expect(html).toContain("simulerte fills");
    expect(html).toContain("Worker: ukjent");
    expect(html).toContain("heartbeat ikke lagret");
    expect(html).toContain("2000.00 NOK");
    expect(html).toContain("PRICE_STALE");
    expect(html).toContain("Simulert");
    expect(html).not.toContain("Aktiver");
    expect(html).not.toContain("Pause policy");
    expect(html).not.toContain("Kjøp");
  });

  it("renders loading, no-rounds, incomplete, invalid and read-error states distinctly", () => {
    const render = (state: PaperStatusPanelState) => renderToStaticMarkup(<StandingPaperStatusPanelView state={state} />);
    expect(render({ kind: "LOADING" })).toContain("Laster paper-status");
    const noRounds = { ...model, status: "NO_ROUNDS" as const, policies: [{ ...model.policies[0]!, status: "NO_ROUNDS" as const, lastRound: null }] };
    expect(render({ kind: "DATA", model: noRounds })).toContain("Ingen fullførte runder");
    const incomplete = { ...model, status: "INCOMPLETE" as const, policies: [{ ...model.policies[0]!, status: "INCOMPLETE" as const, issueCode: "PAPER_VALUATION_INCOMPLETE" as const }] };
    expect(render({ kind: "DATA", model: incomplete })).toContain("Ufullstendig verdsettelse");
    const invalid = { ...model, status: "INVALID" as const, policies: [{ ...model.policies[0]!, status: "INVALID" as const, identity: null, version: null, policyStatus: "UNKNOWN" as const, mode: "UNKNOWN" as const, allowedInstrumentIds: [], riskLimits: { capitalBudgetMinor: null, maxOrderMinor: null, maxPositionMinor: null, maxGrossExposureMinor: null, maxLossMinor: null, maxPriceAgeMs: null }, lastRound: null, netContributionsMinor: null, committedCapitalMinor: null, remainingCapitalBudgetMinor: null, portfolioValueMinor: null, portfolioValueAsOf: null, currentLossMinor: null, remainingLossMarginMinor: null, decisions: [], fills: [], issueCode: "PAPER_MATERIAL_INVALID" as const }] };
    expect(render({ kind: "DATA", model: invalid })).toContain("Ugyldig eller ufullstendig lagret materiale");
    expect(render({ kind: "READ_ERROR" })).toContain("Paper-status utilgjengelig");
  });
});
