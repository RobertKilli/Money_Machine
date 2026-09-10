import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreateVirtualDeposit } from "@/application/deposits/create-virtual-deposit";
import { EvaluateContributionRebalancing } from "@/application/decisions/evaluate-contribution-rebalancing";
import { GetPortfolioProjection } from "@/application/portfolio/get-portfolio-projection";
import { money } from "@/domain/financial/money";
import { price } from "@/domain/financial/price";
import { M1CDecisionRepository } from "@/infrastructure/postgres/m1c-decision-repository";
import { M1DExecutionRepository } from "@/infrastructure/postgres/m1d-execution-repository";
import { PostgresFinancialRepository } from "@/infrastructure/postgres/postgres-financial-repository";
import { PostgresPortfolioReadRepository } from "@/infrastructure/postgres/portfolio-read-repository";

const REF = "flsfallpputejojncyue";
const enabled = process.env.MONEY_MACHINE_INTEGRATION_TEST === "1";
function socket({ host, port }: { host: string[]; port: number[] }) {
  const hostname = host[0]; const portNumber = port[0];
  if (!hostname || !portNumber) throw new Error("Database host and port are required");
  const s = createConnection({ host: hostname, port: portNumber, family: 4, autoSelectFamily: false });
  Object.defineProperties(s, { host: { value: hostname, writable: true, configurable: true }, port: { value: portNumber, writable: true, configurable: true } }); return s;
}

describe.skipIf(!enabled)("M1E hosted portfolio read model", () => {
  const run = randomUUID(); const actorA = randomUUID(); const actorB = randomUUID();
  let sql: Sql; let financial: PostgresFinancialRepository; let decisions: M1CDecisionRepository; let executions: M1DExecutionRepository; let repository: PostgresPortfolioReadRepository;
  let accountA: string; let accountB: string; let cashAt: Date; let firstAt: Date; let secondAt: Date;
  let firstFill: string; let secondFill: string; let decisionAt: Date;
  const clock = async () => new Date((await sql`select clock_timestamp() now`)[0]!.now);
  beforeAll(async () => {
    if (process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF !== REF) throw new Error("Unauthorized project");
    const url = process.env.DATABASE_URL; if (!url || !url.includes(REF)) throw new Error("Unauthorized database");
    sql = postgres(url, { max: 4, prepare: true, ssl: "require", socket } as Parameters<typeof postgres>[1]);
    financial = new PostgresFinancialRepository(url); decisions = new M1CDecisionRepository(url); executions = new M1DExecutionRepository(url); repository = new PostgresPortfolioReadRepository(url);
    await sql`insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values (${actorA}, 'authenticated', 'authenticated', ${`m1e-a-${run}@example.invalid`}, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()), (${actorB}, 'authenticated', 'authenticated', ${`m1e-b-${run}@example.invalid`}, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`;
    accountA = (await financial.getOrCreateDefaultSimulationAccount(actorA)).id; accountB = (await financial.getOrCreateDefaultSimulationAccount(actorB)).id;
    await new CreateVirtualDeposit(financial).execute({ actorId: actorA, financialAccountId: accountA, amount: money("NOK", 100_000n), idempotencyKey: `m1e-seed-${run}`, occurredAt: await clock() });
    cashAt = await clock();
    decisionAt = await clock();
    const decision = await new EvaluateContributionRebalancing(financial, decisions).execute({ actorId: actorA, financialAccountId: accountA, decisionTimestamp: decisionAt, idempotencyKey: `m1e-decision-one-${run}` });
    const proposals = await sql`select id from public.proposed_orders where strategy_decision_id = ${decision.decisionId} and asset_id = 'mm.fixture.defensive.v1'`;
    firstFill = (await executions.executeApprovedProposal(actorA, proposals[0]!.id, `m1e-execute-one-${run}`, await clock())).fillId;
    firstAt = await clock();
    // A separate frozen decision and fill for the same holding, on the remaining cash.
    const next = await new EvaluateContributionRebalancing(financial, decisions).execute({ actorId: actorA, financialAccountId: accountA, decisionTimestamp: await clock(), idempotencyKey: `m1e-decision-two-${run}` });
    const nextProposals = await sql`select id from public.proposed_orders where strategy_decision_id = ${next.decisionId} and asset_id = 'mm.fixture.defensive.v1'`;
    secondFill = (await executions.executeApprovedProposal(actorA, nextProposals[0]!.id, `m1e-execute-two-${run}`, await clock())).fillId;
    secondAt = await clock();
  });
  afterAll(async () => { await repository?.close(); await executions?.close(); await decisions?.close(); await financial?.close(); await sql?.end({ timeout: 5 }); });
  const read = (asOf: Date, actorId = actorA, financialAccountId = accountA) => new GetPortfolioProjection(repository).execute({ actorId, financialAccountId, asOf });

  it("historical single fill reconciles exact ledger cash, quantity, basis, market value, NAV, P&L and weights", async () => {
    const p = (await read(firstAt))!;
    expect(p).toMatchObject({ valuationStatus: "COMPLETE", integrityStatus: "CONSISTENT", cash: "86386", investedMarketValue: "14850", nav: "101236", totalOpenCostBasis: "13614", unrealizedPnl: "1236" });
    expect(p.holdings[0]).toMatchObject({ quantityAtoms: "270000000", marketValueMinor: "14850", openCostBasisMinor: "13614", selectedPrice: { recordId: "1c000000-0000-4000-8000-000000000013", priceAtoms: "5500" } });
    expect(p.provenance.fillIds).toEqual([firstFill]); expect(p.provenance.fillIds).not.toContain(secondFill);
    expect(p.holdings[0]!.portfolioWeightBps).toBe((14850n * 10000n / 101236n).toString());
    expect(p.cashWeightBps).toBe((86386n * 10000n / 101236n).toString());
    const rows = await sql`select la.code, sum(case when le.direction = 'DEBIT' then le.amount_atoms else -le.amount_atoms end)::text atoms from public.ledger_entries le join public.ledger_transactions lt on lt.id = le.ledger_transaction_id join public.ledger_accounts la on la.id = le.ledger_account_id where lt.financial_account_id = ${accountA} and lt.occurred_at <= ${firstAt} and lt.recorded_at <= ${firstAt} group by la.code`;
    expect(rows.find(r => r.code === "CASH")!.atoms).toBe(p.cash);
    expect(rows.find(r => r.code === "ASSET_HOLDING:mm.fixture.defensive.v1")!.atoms).toBe(p.holdings[0]!.quantityAtoms);
  });

  it("multiple fills aggregate into one ledger holding and chronological fee-inclusive open lots", async () => {
    const p = (await read(secondAt))!;
    const fills = await sql`select id, quantity_atoms::text quantity, gross_notional_atoms::text gross, fee_atoms::text fee from public.simulation_fills where financial_account_id = ${accountA} order by execution_timestamp, id`;
    expect(fills).toHaveLength(2); expect(p.holdings).toHaveLength(1);
    const quantity = fills.reduce((n, f) => n + BigInt(f.quantity), 0n); const basis = fills.reduce((n, f) => n + BigInt(f.gross) + BigInt(f.fee), 0n);
    const value = quantity * 5500n / 100000000n;
    expect(p.holdings[0]!.quantityAtoms).toBe(quantity.toString()); expect(p.totalOpenCostBasis).toBe(basis.toString());
    expect(p.investedMarketValue).toBe(value.toString()); expect(p.nav).toBe((BigInt(p.cash) + value).toString()); expect(p.unrealizedPnl).toBe((value - basis).toString());
    expect(p.holdings[0]!.lots.map(l => l.fillId)).toEqual([firstFill, secondFill]);
    expect(p.holdings[0]!.lots.every(l => l.quantityAtoms === l.remainingQuantityAtoms)).toBe(true);
  });

  it("cash-only, empty and historical-before-execution projections are complete and deterministic", async () => {
    expect(await read(cashAt)).toMatchObject({ holdings: [], cash: "100000", nav: "100000", investedMarketValue: "0", unrealizedPnl: "0" });
    expect(await read(secondAt, actorB, accountB)).toMatchObject({ holdings: [], cash: "0", nav: "0", valuationStatus: "COMPLETE" });
    expect(await read(firstAt)).toEqual(await read(firstAt));
  });

  it("future-only or unavailable prices on hosted evidence return INCOMPLETE, never fake totals", async () => {
    // Controlled read-source fault, not a mutation of the immutable shared dataset.
    // Normal M1D fixtures always retain an eligible acquisition price, so missing
    // data is introduced only at the read boundary while the real ledger/fills load.
    const source = (await repository.loadOwnedEvidence(actorA, accountA, firstAt))!;
    for (const prices of [[], source.prices.map(p => ({ ...p, recordId: "controlled-future", availableAt: new Date(firstAt.getTime() + 60_000), price: price("NOK", 999999n, 4) }))]) {
      const command = new GetPortfolioProjection({ loadOwnedEvidence: async () => ({ ...source, prices }) });
      const p = (await command.execute({ actorId: actorA, financialAccountId: accountA, asOf: firstAt }))!;
      expect(p).toMatchObject({ valuationStatus: "INCOMPLETE", cash: "86386", nav: null, unrealizedPnl: null, totalOpenCostBasis: "13614" });
      expect(p.holdings[0]!.marketValueMinor).toBeNull(); expect(p.missingPriceAssets).toEqual(["mm.fixture.defensive.v1"]);
    }
  });

  it("PostgreSQL excludes a persisted future fixture from historical valuation", async () => {
    const futureId = randomUUID(); const futureAt = new Date(secondAt.getTime() + 86_400_000);
    await sql`insert into public.market_prices (id, asset_id, price_atoms, price_scale, currency_code, observed_at, available_at, ingested_at, dataset_version) values (${futureId}, 'mm.fixture.defensive.v1', 999999, 4, 'NOK', ${futureAt}, ${futureAt}, ${futureAt}, 'mm-fixture-market-data/v1')`;
    const p = (await read(secondAt))!;
    expect(p.holdings[0]!.selectedPrice!.recordId).toBe("1c000000-0000-4000-8000-000000000013");
    expect(p.provenance.priceRecordIds).not.toContain(futureId);
    expect(new Date(p.holdings[0]!.selectedPrice!.availableAt) <= secondAt).toBe(true);
  });

  it("hosted read boundary rejects mismatched acquisition evidence without fabricated cost basis", async () => {
    const source = (await repository.loadOwnedEvidence(actorA, accountA, firstAt))!;
    const command = new GetPortfolioProjection({ loadOwnedEvidence: async () => ({ ...source, acquisitions: [] }) });
    const p = (await command.execute({ actorId: actorA, financialAccountId: accountA, asOf: firstAt }))!;
    expect(p.totalOpenCostBasis).toBeNull(); expect(p.nav).toBeNull(); expect(p.violations).toContain("LEDGER_FILL_QUANTITY_MISMATCH");
  });

  it("two-user authorization and RLS isolate the entire read path", async () => {
    expect(await read(firstAt, actorB, accountA)).toBeUndefined();
    expect(await read(firstAt, actorA, accountB)).toBeUndefined();
    expect((await read(firstAt))!.provenance.fillIds).toEqual([firstFill]);
    expect((await read(firstAt, actorB, accountB))!.provenance.fillIds).toEqual([]);
  });

  it("read transaction cannot mutate ledger, fills, executions or prices even after role escalation", async () => {
    const internal = repository as unknown as { client: Sql }; const original = internal.client;
    for (const table of ["ledger_entries", "ledger_transactions", "simulation_fills", "simulation_executions", "market_prices"]) {
      internal.client = new Proxy(original, { get(target, property, receiver) {
        if (property !== "begin") return Reflect.get(target, property, receiver);
        return (operation: (tx: TransactionSql) => Promise<unknown>) => original.begin(async tx => {
          await operation(tx);
          const settings = await tx`select current_setting('transaction_read_only') read_only, current_setting('transaction_isolation') isolation, current_user role`;
          expect(settings[0]).toMatchObject({ read_only: "on", isolation: "repeatable read", role: "authenticated" });
          await tx`set local role postgres`;
          // No rows targeted; PostgreSQL must prohibit the write statement itself.
          await tx`update ${tx(`public.${table}`)} set id = id where false`;
          throw new Error("unexpected read-only write accepted");
        });
      } });
      try { await expect(read(firstAt)).rejects.toMatchObject({ code: "25006" }); }
      finally { internal.client = original; }
    }
    expect((await read(firstAt))!.cash).toBe("86386");
  });
});
