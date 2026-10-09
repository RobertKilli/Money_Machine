import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { runDeterministicBacktest } from "@/application/backtest/run-deterministic-backtest";
import { projectStandingPaperStatusCard, projectStandingPaperStatusReadModel } from "@/application/paper-trading/standing-paper-status";
import type { StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
import { price } from "@/domain/financial/price";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION } from "@/domain/strategy/fixture-assets";
import { loadStandingPaperStatus, parseStandingPaperStatus, StandingPaperStatusPanelView, type PaperStatusPanelState } from "@/components/standing-paper-status-panel";

const testPolicy: StandingPaperPolicy = {
  policyId: "paper-policy-test", identity: "synthetic-test-account", version: "standing-paper-policy/v1", mode: "PAPER_ONLY", status: "ACTIVE",
  financialAccountId: "paper-account-test", allowedInstrumentIds: FIXTURE_ASSETS.map(asset => asset.assetId), capitalBudgetMinor: 500_000n,
  maxOrderMinor: 100_000n, maxPositionMinor: 300_000n, maxGrossExposureMinor: 500_000n, maxLossMinor: 25_000n, maxPriceAgeMs: 86_400_000,
};
const testAt = "2026-10-08T10:00:00.000Z";
const testResult = runDeterministicBacktest({
  startAt: testAt, endAt: testAt, baseCurrency: "NOK", financialAccountId: testPolicy.financialAccountId,
  contributionEvents: [{ eventId: "ui-fixture-deposit", availableAt: testAt, amountMinor: "200000", currency: "NOK" }], valuationTimestamps: [],
  strategyVersion: "contribution-rebalancing/v1", riskPolicyVersion: "m1-risk-policy/v1", executionPolicyVersion: "m1-market-execution/v1",
  portfolioValuationVersion: "portfolio-valuation/v1", fifoCostBasisVersion: "fifo-cost-basis/v1", assetRegistryVersion: "fixture-asset-registry/v1",
  marketDatasetVersion: FIXTURE_DATASET_VERSION, standingPaperPolicy: testPolicy,
}, FIXTURE_ASSETS.map((asset, index) => ({ recordId: `ui-price-${index}`, assetId: asset.assetId, price: price("NOK", BigInt((index + 1) * 1000), 2), observedAt: new Date("2026-10-08T09:00:00.000Z"), availableAt: new Date("2026-10-08T09:00:00.000Z"), ingestedAt: new Date("2026-10-08T09:00:00.000Z"), datasetVersion: FIXTURE_DATASET_VERSION })));
const projectedCard = projectStandingPaperStatusCard({
  policy: testPolicy, state: testResult.persistentState,
  run: { id: "run-1", createdAt: "2026-10-08T10:00:01.000Z", result: testResult, valuation: { navMinor: testResult.endingState.nav, asOf: testResult.endingState.asOf, complete: testResult.endingState.valuationStatus === "COMPLETE" } },
  decisions: [
    ...testResult.paperPolicyDecisions.map(item => ({ orderId: item.orderId, decisionId: item.decisionId, outcome: item.outcome, reasonCode: item.evidence.reasonCode, disposition: item.evidence.disposition, recordedAt: testAt })),
    { orderId: "order-rejected", decisionId: "decision-rejected", outcome: "REJECTED" as const, reasonCode: "PRICE_STALE", disposition: "REJECT" as const, recordedAt: testAt },
  ],
});
const model = projectStandingPaperStatusReadModel([projectedCard]);
const incompleteCard = projectStandingPaperStatusCard({
  policy: testPolicy, state: testResult.persistentState,
  run: { id: "incomplete-run", createdAt: "2026-10-08T10:00:02.000Z", result: testResult, valuation: { navMinor: null, asOf: testResult.endingState.asOf, complete: false } },
  decisions: [], fills: [],
});
const secondPolicyCard = projectStandingPaperStatusCard({
  policy: { ...testPolicy, policyId: "paper-policy-available", identity: "synthetic-available-account", financialAccountId: "paper-account-available" },
  state: testResult.persistentState,
  run: { id: "available-run", createdAt: "2026-10-08T10:00:03.000Z", result: testResult, valuation: { navMinor: testResult.endingState.nav, asOf: testResult.endingState.asOf, complete: true } },
  decisions: [], fills: [],
});
const incompleteModel = projectStandingPaperStatusReadModel([incompleteCard]);
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("standing paper status view", () => {
  it("requests the private endpoint with no-store and validates the returned model", async () => {
    const fetcher = vi.fn(async () => response(200, model));
    expect(await loadStandingPaperStatus(fetcher)).toEqual({ kind: "DATA", model });
    expect(fetcher).toHaveBeenCalledWith("/api/dashboard/paper-status", { cache: "no-store", credentials: "same-origin" });
    expect(parseStandingPaperStatus({ ...model, workerStatus: "RUNNING" })).toBeNull();
  });

  it("loads and renders backend-projected incomplete valuations alone and alongside available policies", async () => {
    expect(incompleteCard.portfolioValueAsOf).toBe(incompleteCard.lastRound?.asOf);
    expect(incompleteCard.portfolioValueMinor).toBeNull();
    expect(incompleteCard.currentLossMinor).toBeNull();
    expect(incompleteCard.remainingLossMarginMinor).toBeNull();
    const mixedModel = projectStandingPaperStatusReadModel([incompleteCard, secondPolicyCard]);
    for (const projected of [incompleteModel, mixedModel]) {
      expect(parseStandingPaperStatus(projected)).toEqual(projected);
      const state = await loadStandingPaperStatus(async () => response(200, projected));
      expect(state).toEqual({ kind: "DATA", model: projected });
      const html = renderToStaticMarkup(<StandingPaperStatusPanelView state={state} />);
      expect(html).toContain("Ufullstendig verdsettelse");
      expect(html).toContain("Gjelder");
    }
  });

  it("rejects incomplete valuations with conflicting timestamps or financial values", async () => {
    const card = incompleteModel.policies[0]!;
    const conflictingTime = { ...incompleteModel, policies: [{ ...card, portfolioValueAsOf: "2026-10-08T09:59:59.000Z" }] };
    const invalidAmount = { ...incompleteModel, policies: [{ ...card, currentLossMinor: "1" }] };
    for (const invalid of [conflictingTime, invalidAmount]) {
      expect(parseStandingPaperStatus(invalid)).toBeNull();
      expect(await loadStandingPaperStatus(async () => response(200, invalid))).toEqual({ kind: "READ_ERROR" });
    }
  });

  it("rejects contradictory or malformed identity, version, amount and status material", () => {
    const card = model.policies[0]!;
    expect(parseStandingPaperStatus({ ...model, status: "NO_ROUNDS" })).toBeNull();
    expect(parseStandingPaperStatus({ ...model, policies: [{ ...card, identity: { value: "spoof" } }] })).toBeNull();
    expect(parseStandingPaperStatus({ ...model, policies: [{ ...card, version: "other/v9" }] })).toBeNull();
    expect(parseStandingPaperStatus({ ...model, policies: [{ ...card, riskLimits: { ...card.riskLimits, maxOrderMinor: { amount: "100" } } }] })).toBeNull();
    expect(parseStandingPaperStatus({ ...model, policies: [{ ...card, remainingCapitalBudgetMinor: "500000" }] })).toBeNull();
    expect(parseStandingPaperStatus({ ...model, policies: [{ ...card, fills: [{ ...card.fills[0]!, orderId: card.decisions[0]!.orderId }] }] })).toBeNull();
    expect(parseStandingPaperStatus({ ...model, policies: [{ ...card, status: "NO_ROUNDS" }] })).toBeNull();
    expect(parseStandingPaperStatus({ ...model, policies: [card, { ...card, policyId: "duplicate", identity: card.identity }] })).toBeNull();
    expect(parseStandingPaperStatus({ ...model, policies: [card, { ...card, policyId: card.policyId }] })).toBeNull();
  });

  it("turns object-valued text fields into READ_ERROR without attempting to render them", async () => {
    const malformed = { ...model, policies: [{ ...model.policies[0]!, identity: { toString: "not-a-string" } }] };
    const state = await loadStandingPaperStatus(async () => response(200, malformed));
    expect(state).toEqual({ kind: "READ_ERROR" });
    expect(renderToStaticMarkup(<StandingPaperStatusPanelView state={state} />)).toContain("Paper-status utilgjengelig");
  });

  it("separates no policy, invalid payload, forbidden and read failure", async () => {
    const noPolicy = { status: "NO_POLICY", classification: model.classification, workerStatus: "UNKNOWN", policies: [] };
    expect(await loadStandingPaperStatus(async () => response(200, noPolicy))).toMatchObject({ kind: "DATA", model: { status: "NO_POLICY" } });
    expect(await loadStandingPaperStatus(async () => response(200, { ...model, policies: [{}] }))).toEqual({ kind: "READ_ERROR" });
    expect(await loadStandingPaperStatus(async () => response(401, {}))).toEqual({ kind: "FORBIDDEN" });
    expect(await loadStandingPaperStatus(async () => response(503, {}))).toEqual({ kind: "READ_ERROR" });
    expect(await loadStandingPaperStatus(async () => { throw new Error("offline"); })).toEqual({ kind: "READ_ERROR" });
  });

  it("renders saved metrics and simulation labels without activation or trading controls", () => {
    const html = renderToStaticMarkup(<StandingPaperStatusPanelView state={{ kind: "DATA", model }} />);
    expect(html).toContain("PAPER_ONLY");
    expect(html).toContain("Syntetiske priser");
    expect(html).toContain("simulerte fills");
    expect(html).toContain("Worker: ukjent");
    expect(html).toContain("heartbeat ikke lagret");
    expect(html).toContain("2000.00 NOK");
    expect(html).toContain("PRICE_STALE");
    expect(html).toContain("Simulert");
    expect(html).toContain(">Pause</button>");
    expect(html).toContain(">Stopp</button>");
    expect(html).not.toContain("Aktiver");
    expect(html).not.toContain("Pause policy");
    expect(html).not.toContain("Kjøp");
  });

  it("shows only the policy transitions allowed by the current status", () => {
    const render = (policyStatus: "ACTIVE" | "PAUSED" | "STOPPED" | "DRAFT") => renderToStaticMarkup(
      <StandingPaperStatusPanelView state={{ kind: "DATA", model: { ...model, policies: [{ ...model.policies[0]!, policyStatus }] } }} />,
    );
    const active = render("ACTIVE");
    expect(active).toContain(">Pause</button>");
    expect(active).toContain(">Stopp</button>");
    expect(active).not.toContain("Gjenoppta");
    const paused = render("PAUSED");
    expect(paused).toContain("Gjenoppta");
    expect(paused).toContain(">Stopp</button>");
    expect(paused).not.toContain(">Pause</button>");
    const stopped = render("STOPPED");
    expect(stopped).not.toContain(">Pause</button>");
    expect(stopped).not.toContain("Gjenoppta");
    expect(stopped).not.toContain(">Stopp</button>");
    expect(render("DRAFT")).not.toContain("Aktiver");
  });

  it("renders loading, no-rounds, incomplete, invalid and read-error states distinctly", () => {
    const render = (state: PaperStatusPanelState) => renderToStaticMarkup(<StandingPaperStatusPanelView state={state} />);
    expect(render({ kind: "LOADING" })).toContain("Laster paper-status");
    const noRounds = { ...model, status: "NO_ROUNDS" as const, policies: [{ ...model.policies[0]!, status: "NO_ROUNDS" as const, lastRound: null }] };
    expect(render({ kind: "DATA", model: noRounds })).toContain("Ingen fullførte runder");
    expect(render({ kind: "DATA", model: incompleteModel })).toContain("Ufullstendig verdsettelse");
    const invalid = { ...model, status: "INVALID" as const, policies: [{ ...model.policies[0]!, status: "INVALID" as const, identity: null, version: null, policyStatus: "UNKNOWN" as const, mode: "UNKNOWN" as const, allowedInstrumentIds: [], riskLimits: { capitalBudgetMinor: null, maxOrderMinor: null, maxPositionMinor: null, maxGrossExposureMinor: null, maxLossMinor: null, maxPriceAgeMs: null }, lastRound: null, netContributionsMinor: null, committedCapitalMinor: null, remainingCapitalBudgetMinor: null, portfolioValueMinor: null, portfolioValueAsOf: null, currentLossMinor: null, remainingLossMarginMinor: null, decisions: [], fills: [], issueCode: "PAPER_MATERIAL_INVALID" as const }] };
    expect(render({ kind: "DATA", model: invalid })).toContain("Ugyldig eller ufullstendig lagret materiale");
    expect(render({ kind: "READ_ERROR" })).toContain("Paper-status utilgjengelig");
  });
});
