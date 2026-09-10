import { createConnection } from "node:net";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { runDeterministicBacktest } from "@/application/backtest/run-deterministic-backtest";
import { CONTRIBUTION_REBALANCING_VERSION, FIXTURE_ASSET_REGISTRY_VERSION, FIXTURE_DATASET_VERSION, type FixturePriceObservation } from "@/domain/strategy/fixture-assets";

const enabled = process.env.MONEY_MACHINE_INTEGRATION_TEST === "1";
const ref = "flsfallpputejojncyue";
function socket({ host, port }: { host: string[]; port: number[] }) { const h = host[0]; const p = port[0]; if (!h || !p) throw new Error("Database host and port are required"); return createConnection({ host: h, port: p, family: 4, autoSelectFamily: false }); }

describe.skipIf(!enabled)("M2 ROB-47 hosted non-mutation", () => {
  it("runs pure replay with zero authoritative hosted mutation", async () => {
    if (process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF !== ref) throw new Error("Unauthorized project");
    const url = process.env.DATABASE_URL; if (!url || !url.includes(ref)) throw new Error("Unauthorized database");
    const sql = postgres(url, { max: 1, prepare: true, ssl: "require", socket } as Parameters<typeof postgres>[1]);
    try {
      const tables = ["financial_accounts", "ledger_accounts", "ledger_transactions", "ledger_entries", "strategy_decisions", "proposed_orders", "risk_assessments", "simulation_executions", "simulation_fills", "market_prices"];
      const before = await sql`select table_name, (xpath('/row/count/text()', query_to_xml(format('select count(*) as count from public.%I', table_name), false, true, '')))[1]::text::bigint count from information_schema.tables where table_schema = 'public' and table_name in ${sql(tables)}`;
      const prices = (await sql`select id, asset_id, price_atoms::text, price_scale, currency_code, observed_at, available_at, ingested_at, dataset_version from public.market_prices where dataset_version = ${FIXTURE_DATASET_VERSION}`).map(p => ({ recordId: p.id, assetId: p.asset_id, price: { currencyCode: p.currency_code, priceAtoms: BigInt(p.price_atoms), priceScale: p.price_scale }, observedAt: new Date(p.observed_at), availableAt: new Date(p.available_at), ingestedAt: new Date(p.ingested_at), datasetVersion: FIXTURE_DATASET_VERSION })) as FixturePriceObservation[];
      runDeterministicBacktest({ startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-03T00:00:00Z", baseCurrency: "NOK", contributionEvents: [{ eventId: "rob47", availableAt: "2026-01-01T00:00:00Z", amountMinor: "100000", currency: "NOK" }], valuationTimestamps: ["2026-01-02T00:00:00Z"], strategyVersion: CONTRIBUTION_REBALANCING_VERSION, riskPolicyVersion: "m1-risk-policy/v1", executionPolicyVersion: "m1-market-execution/v1", portfolioValuationVersion: "portfolio-valuation/v1", fifoCostBasisVersion: "fifo-cost-basis/v1", assetRegistryVersion: FIXTURE_ASSET_REGISTRY_VERSION, marketDatasetVersion: FIXTURE_DATASET_VERSION }, prices);
      const after = await sql`select table_name, (xpath('/row/count/text()', query_to_xml(format('select count(*) as count from public.%I', table_name), false, true, '')))[1]::text::bigint count from information_schema.tables where table_schema = 'public' and table_name in ${sql(tables)}`;
      expect(after).toEqual(before);
    } finally { await sql.end({ timeout: 5 }); }
  });
});
