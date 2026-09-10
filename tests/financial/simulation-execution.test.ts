import { describe, expect, it } from "vitest";
import { money } from "@/domain/financial/money";
import { price } from "@/domain/financial/price";
import { executeSimulationBuy } from "@/domain/execution/simulation-execution";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION, type FixturePriceObservation, contributionRebalancing } from "@/domain/strategy/fixture-assets";

const asset = FIXTURE_ASSETS[0]!;
const timestamp = new Date("2026-01-01T10:07:00Z");
const observation: FixturePriceObservation = { recordId: "00000000-0000-4000-8000-000000000001", assetId: asset.assetId, price: price("NOK", 10000n, 4), observedAt: new Date("2026-01-01T10:00:00Z"), availableAt: new Date("2026-01-01T10:01:00Z"), ingestedAt: new Date("2026-01-01T10:02:00Z"), datasetVersion: FIXTURE_DATASET_VERSION };
const proposal = contributionRebalancing({ financialAccountId: "account", decisionId: "decision", cash: money("NOK", 100000n), decisionTimestamp: timestamp, assets: [asset], prices: [observation] }).proposedOrders[0]!;

function input(overrides: Partial<Parameters<typeof executeSimulationBuy>[0]> = {}) { return { financialAccountId: "account", actorId: "actor", accountActive: true, simulationMode: true, decisionApproved: true, riskApproved: true, proposal, asset, referencePrice: observation, availableCash: money("NOK", 100000n), decisionNav: money("NOK", 100000n), executionTimestamp: timestamp, alreadySettled: false, ...overrides }; }

describe("simulation execution", () => {
  it("retains the canonical policy identifier and frozen reserve when cash changes", () => {
    expect(executeSimulationBuy(input()).executionPolicyVersion).toBe("m1-market-execution/v1");
    // 54,154 debit leaves 9,846, below the original 10,000 reserve.
    expect(() => executeSimulationBuy(input({ availableCash: money("NOK", 64_000n) }))).toThrow("CASH_RESERVE_VIOLATION");
  });
  it("applies +10 bps BUY price, fee, and preserves policy evidence", () => { const fill = executeSimulationBuy(input()); expect(fill.executionPrice.priceAtoms).toBe(10010n); expect(fill.grossNotional.minorUnits).toBe(54054n); expect(fill.fee.minorUnits).toBe(100n); expect(fill.totalCashDebit.minorUnits).toBe(54154n); });
  it("rejects risk veto, future data, insufficient cash, and settled proposals", () => { expect(() => executeSimulationBuy(input({ riskApproved: false }))).toThrow("RISK_NOT_APPROVED"); expect(() => executeSimulationBuy(input({ referencePrice: { ...observation, availableAt: new Date("2026-01-01T10:10:00Z") } }))).toThrow("LOOKAHEAD_PRICE"); expect(() => executeSimulationBuy(input({ availableCash: money("NOK", 1n) }))).toThrow("INSUFFICIENT_CASH"); expect(() => executeSimulationBuy(input({ alreadySettled: true }))).toThrow("ALREADY_SETTLED"); });
});
