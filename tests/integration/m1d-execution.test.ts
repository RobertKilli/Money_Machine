import { createHash, randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { money } from "@/domain/financial/money";
import { CreateVirtualDeposit } from "@/application/deposits/create-virtual-deposit";
import { EvaluateContributionRebalancing } from "@/application/decisions/evaluate-contribution-rebalancing";
import { assessProposal } from "@/domain/risk/m1-risk";
import { contributionRebalancing } from "@/domain/strategy/fixture-assets";
import { M1CDecisionRepository } from "@/infrastructure/postgres/m1c-decision-repository";
import { M1DExecutionRepository } from "@/infrastructure/postgres/m1d-execution-repository";
import { PostgresFinancialRepository } from "@/infrastructure/postgres/postgres-financial-repository";

const PROJECT_REF = "flsfallpputejojncyue";
const timestamp = new Date(Date.now() + 60_000);
const enabled = process.env.MONEY_MACHINE_INTEGRATION_TEST === "1";
function socket({ host, port }: { host: string[]; port: number[] }) {
  const h = host[0]; const p = port[0];
  if (!h || !p) throw new Error("Database host and port are required");
  const s = createConnection({ host: h, port: p, family: 4, autoSelectFamily: false });
  Object.defineProperties(s, { host: { value: h, writable: true, configurable: true }, port: { value: p, writable: true, configurable: true } });
  return s;
}
type Fixture = { actor: string; accountId: string; proposalId: string; assetId: string; key: string };
const zero = { executions: "0", fills: "0", journals: "0", entries: "0", audits: "0", commands: "0" };

describe.skipIf(!enabled)("Money Machine M1D hosted execution", () => {
  const run = randomUUID();
  let sql: Sql; let accounts: PostgresFinancialRepository; let decisions: M1CDecisionRepository; let executions: M1DExecutionRepository;
  beforeAll(() => {
    if (process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF !== PROJECT_REF) throw new Error("Unauthorized project");
    const url = process.env.DATABASE_URL;
    if (!url || !url.includes(PROJECT_REF)) throw new Error("Unauthorized database");
    sql = postgres(url, { max: 4, prepare: true, ssl: "require", socket } as Parameters<typeof postgres>[1]);
    accounts = new PostgresFinancialRepository(url); decisions = new M1CDecisionRepository(url); executions = new M1DExecutionRepository(url);
  });
  // Retain isolated simulation evidence; never disable append-only triggers for cleanup.
  afterAll(async () => { await executions?.close(); await decisions?.close(); await accounts?.close(); await sql?.end({ timeout: 5 }); });

  async function identity(label: string, deposit = 100_000n) {
    const actor = randomUUID();
    await sql`insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values (${actor}, 'authenticated', 'authenticated', ${`m1d-${label}-${run}@example.invalid`}, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`;
    const accountId = (await accounts.getOrCreateDefaultSimulationAccount(actor)).id;
    if (deposit > 0n) await new CreateVirtualDeposit(accounts).execute({ actorId: actor, financialAccountId: accountId, amount: money("NOK", deposit), idempotencyKey: `m1d-${label}-seed-${run}` });
    return { actor, accountId };
  }
  async function fixture(label: string): Promise<Fixture> {
    const owner = await identity(label);
    const decision = await new EvaluateContributionRebalancing(accounts, decisions).execute({ actorId: owner.actor, financialAccountId: owner.accountId, decisionTimestamp: timestamp, idempotencyKey: `m1d-${label}-decision-${run}` });
    expect(decision.status).toBe("APPROVED");
    const rows = await sql`select id, asset_id, price_atoms::text, price_scale, reference_price_id from public.proposed_orders where strategy_decision_id = ${decision.decisionId} and asset_id = 'mm.fixture.defensive.v1'`;
    expect(rows).toHaveLength(1);
    // Shared canonical price fixtures are read-only and pinned; tests never insert competing prices.
    expect(rows[0]).toMatchObject({ price_atoms: "5000", price_scale: 4, reference_price_id: "1c000000-0000-4000-8000-000000000003" });
    return { ...owner, proposalId: rows[0]!.id, assetId: rows[0]!.asset_id, key: `m1d-${label}-execution-${run}` };
  }
  const execute = (f: Fixture, key = f.key, at = timestamp) => executions.executeApprovedProposal(f.actor, f.proposalId, key, at);
  async function evidence(accountId: string, db: Sql | TransactionSql = sql) {
    const rows = await db`select
      (select count(*)::text from public.simulation_executions where financial_account_id = ${accountId}) executions,
      (select count(*)::text from public.simulation_fills where financial_account_id = ${accountId}) fills,
      (select count(*)::text from public.ledger_transactions where financial_account_id = ${accountId} and transaction_type = 'SIMULATED_BUY_SETTLEMENT') journals,
      (select count(*)::text from public.ledger_entries le join public.ledger_transactions lt on lt.id = le.ledger_transaction_id where lt.financial_account_id = ${accountId} and lt.transaction_type = 'SIMULATED_BUY_SETTLEMENT') entries,
      (select count(*)::text from public.execution_audit_events where financial_account_id = ${accountId}) audits,
      (select count(*)::text from public.idempotency_records where financial_account_id = ${accountId} and command_type = 'EXECUTE_SIMULATION') commands`;
    return { ...rows[0] };
  }
  async function balances(accountId: string) {
    const rows = await sql`select la.code, coalesce(sum(case when le.direction = 'DEBIT' then le.amount_atoms else -le.amount_atoms end),0)::text atoms from public.ledger_accounts la left join public.ledger_entries le on le.ledger_account_id = la.id where la.financial_account_id = ${accountId} group by la.code order by la.code`;
    return Object.fromEntries(rows.map(r => [r.code, BigInt(r.atoms)]));
  }
  async function assertSettlement(f: Fixture, cashBefore: bigint) {
    expect(await evidence(f.accountId)).toEqual({ executions: "1", fills: "1", journals: "1", entries: "6", audits: "1", commands: "1" });
    const rows = await sql`select se.quantity_atoms::text quantity, po.quantity_atoms::text proposal_quantity, sf.quantity_atoms::text fill_quantity, se.reference_price_atoms::text reference, se.execution_price_atoms::text price, se.gross_notional_atoms::text gross, se.fee_atoms::text fee, se.total_cash_debit_atoms::text total, se.ledger_transaction_id journal from public.simulation_executions se join public.proposed_orders po on po.id = se.proposed_order_id join public.simulation_fills sf on sf.simulation_execution_id = se.id where se.financial_account_id = ${f.accountId} and se.state = 'FILLED'`;
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({ quantity: "270000000", proposal_quantity: "270000000", fill_quantity: "270000000", reference: "5000", price: "5005", gross: "13514", fee: "100", total: "13614" });
    const after = await balances(f.accountId);
    expect(after.CASH).toBe(cashBefore - BigInt(row.gross) - BigInt(row.fee));
    expect(after[`ASSET_HOLDING:${f.assetId}`]).toBe(BigInt(row.quantity));
    expect(after.FEE_EXPENSE).toBe(100n);
    const sums = await sql`select la.commodity_kind kind, coalesce(la.commodity_currency_code, la.commodity_asset_id) commodity, sum(case when le.direction = 'DEBIT' then le.amount_atoms else -le.amount_atoms end)::text atoms from public.ledger_entries le join public.ledger_accounts la on la.id = le.ledger_account_id where le.ledger_transaction_id = ${row.journal} group by la.commodity_kind, la.commodity_currency_code, la.commodity_asset_id order by la.commodity_kind::text`;
    expect(sums.map(r => ({ ...r }))).toEqual([{ kind: "ASSET", commodity: f.assetId, atoms: "0" }, { kind: "MONEY", commodity: "NOK", atoms: "0" }]);
  }

  it("approved execution: exact pricing, fee, settlement accounting and ledger-derived quantity", async () => {
    const f = await fixture("approved"); const before = await balances(f.accountId);
    expect((await execute(f)).state).toBe("FILLED");
    await assertSettlement(f, before.CASH!);
  });

  it("idempotent replay/conflict and same-proposal second settlement protection", async () => {
    const f = await fixture("replay"); const first = await execute(f);
    expect(await execute(f)).toEqual(first);
    await expect(execute(f, f.key, new Date("2026-01-01T10:07:01Z"))).rejects.toThrow("different input");
    await expect(execute(f, `${f.key}-other`)).rejects.toThrow("already settled");
    await assertSettlement(f, 100_000n);
  });

  it("rejected decision: absolute risk veto with zero execution or monetary effect", async () => {
    const owner = await identity("rejected"); const inputs = await decisions.getFixtureInputs();
    const decision = contributionRebalancing({ financialAccountId: owner.accountId, decisionId: randomUUID(), cash: money("NOK", 100_000n), decisionTimestamp: timestamp, ...inputs });
    const proposal = decision.proposedOrders[0]!;
    const risk = assessProposal(proposal, { accountActive: true, simulationMode: true, strategyEnabled: false, strategyVersion: decision.strategyVersion, accountCurrency: "NOK", availableCash: money("NOK", 100_000n), decisionNav: money("NOK", 100_000n), decisionTimestamp: timestamp, ...inputs });
    const result = await decisions.persist(decision, risk, owner.actor, `m1d-rejected-decision-${run}`, createHash("sha256").update(`rejected-${run}`).digest("hex"));
    expect(result.status).toBe("REJECTED"); expect(risk.disposition).toBe("REJECT");
    const before = await balances(owner.accountId);
    await expect(executions.executeApprovedProposal(owner.actor, proposal.proposalId, `m1d-rejected-execution-${run}`, timestamp)).rejects.toThrow("not risk approved");
    expect(await evidence(owner.accountId)).toEqual(zero);
    expect(await balances(owner.accountId)).toEqual(before);
  });

  it("concurrent exact duplicate execution: one settlement, acquisition and fee effect", async () => {
    const f = await fixture("concurrent");
    const results = await Promise.all([execute(f), execute(f)]);
    expect(results[0]).toEqual(results[1]);
    await assertSettlement(f, 100_000n);
  });

  it("controlled late rollback after execution, fill, journal and audit writes leaves zero residue", async () => {
    const f = await fixture("rollback"); const before = await balances(f.accountId);
    // Test-only interception of the transaction callback, after the real repository has
    // performed every write. The real Postgres.js transaction must roll back the throw.
    const internal = executions as unknown as { client: Sql };
    const original = internal.client; let reached = false;
    internal.client = new Proxy(original, { get(target, property, receiver) {
      if (property !== "begin") return Reflect.get(target, property, receiver);
      return (operation: (tx: TransactionSql) => Promise<unknown>) => original.begin(async tx => {
        await operation(tx);
        expect(await evidence(f.accountId, tx)).toEqual({ executions: "1", fills: "1", journals: "1", entries: "6", audits: "1", commands: "1" });
        reached = true;
        throw new Error("controlled M1D failure after audit persistence");
      });
    } });
    try { await expect(execute(f)).rejects.toThrow("controlled M1D failure after audit persistence"); }
    finally { internal.client = original; }
    expect(reached).toBe(true);
    expect(await evidence(f.accountId)).toEqual(zero);
    expect(await balances(f.accountId)).toEqual(before);
    // Same key remains usable, rather than replaying an aborted FILLED result.
    expect((await execute(f)).state).toBe("FILLED");
    await assertSettlement(f, before.CASH!);
  });

  async function replaceSeedWithSmallerDeposit(f: Fixture, amount: bigint) {
    // Append an explicit balanced reversal of the seed, retaining all history.
    await sql.begin(async tx => {
      const deposits = await tx`select id from public.ledger_transactions where financial_account_id = ${f.accountId} and transaction_type = 'VIRTUAL_DEPOSIT'`;
      expect(deposits).toHaveLength(1);
      const reversalId = randomUUID(); const commandId = randomUUID(); const key = `${f.key}-seed-reversal`;
      await tx`insert into public.idempotency_records (id, financial_account_id, command_type, idempotency_key, request_hash, result_json) values (${commandId}, ${f.accountId}, 'CONTROLLED_TEST_REVERSAL', ${key}, ${createHash("sha256").update(key).digest("hex")}, ${JSON.stringify({ ledgerTransactionId: reversalId })}::jsonb)`;
      await tx`insert into public.ledger_transactions (id, financial_account_id, transaction_type, reversal_of_transaction_id, occurred_at, narrative) values (${reversalId}, ${f.accountId}, 'REVERSAL', ${deposits[0]!.id}, ${timestamp}, 'Controlled M1D seed reversal for full-or-none evidence')`;
      await tx`insert into public.ledger_entries (ledger_transaction_id, ledger_account_id, direction, amount_atoms) select ${reversalId}, ledger_account_id, (case when direction = 'DEBIT' then 'CREDIT' else 'DEBIT' end)::public.ledger_direction, amount_atoms from public.ledger_entries where ledger_transaction_id = ${deposits[0]!.id}`;
      await tx`insert into public.audit_events (financial_account_id, actor_id, command_id, command_type, idempotency_key, outcome, policy_versions, ledger_transaction_id, occurred_at) values (${f.accountId}, ${f.actor}, ${commandId}, 'CONTROLLED_TEST_REVERSAL', ${key}, 'SUCCEEDED', '{"rounding":"m1-rounding/v1"}'::jsonb, ${reversalId}, ${timestamp})`;
    });
    await new CreateVirtualDeposit(accounts).execute({ actorId: f.actor, financialAccountId: f.accountId, amount: money("NOK", amount), idempotencyKey: `${f.key}-smaller-seed` });
  }

  it("full-or-none: insufficient cash cannot resize or partially settle a complete proposal", async () => {
    const f = await fixture("full-none");
    await replaceSeedWithSmallerDeposit(f, 1_000n);
    const before = await balances(f.accountId); expect(before.CASH).toBe(1_000n);
    await expect(execute(f)).rejects.toThrow("INSUFFICIENT_CASH");
    expect(await evidence(f.accountId)).toEqual(zero);
    expect(await balances(f.accountId)).toEqual(before);
    const proposal = await sql`select quantity_atoms::text quantity from public.proposed_orders where id = ${f.proposalId}`;
    expect(proposal[0]!.quantity).toBe("270000000");
  });

  it("canonical policy: execution preserves the frozen decision reserve after cash changes", async () => {
    const f = await fixture("reserve");
    await replaceSeedWithSmallerDeposit(f, 23_000n);
    // Full debit 13,614 leaves 9,386: below the frozen 10,000 reserve,
    // although above an incorrectly recomputed reserve of 2,300.
    await expect(execute(f)).rejects.toThrow("CASH_RESERVE_VIOLATION");
    expect(await evidence(f.accountId)).toEqual(zero);
    expect((await balances(f.accountId)).CASH).toBe(23_000n);
  });

  it("canonical policy: persists the FINANCIAL_POLICIES execution version", async () => {
    const f = await fixture("policy-version"); await execute(f);
    const rows = await sql`select se.execution_policy_version execution, sf.execution_policy_version fill from public.simulation_executions se join public.simulation_fills sf on sf.simulation_execution_id = se.id where se.financial_account_id = ${f.accountId}`;
    expect(rows[0]).toEqual({ execution: "m1-market-execution/v1", fill: "m1-market-execution/v1" });
  });

  async function asUser<T>(actor: string, operation: (tx: TransactionSql) => Promise<T>) {
    return sql.begin(async tx => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claim.sub', ${actor}, true)`;
      const roles = await tx`select current_user as role, auth.uid() = ${actor}::uuid as identity_matches`;
      expect(roles[0]).toMatchObject({ role: "authenticated", identity_matches: true });
      return operation(tx);
    });
  }
  it("two-user RLS: owner sees execution and ledger evidence, other authenticated user sees none", async () => {
    const a = await fixture("rls-a"); const b = await fixture("rls-b");
    await execute(a); await execute(b);
    expect(await asUser(a.actor, tx => evidence(a.accountId, tx))).toEqual({ executions: "1", fills: "1", journals: "1", entries: "6", audits: "1", commands: "1" });
    expect(await asUser(b.actor, tx => evidence(a.accountId, tx))).toEqual(zero);
    expect(await asUser(a.actor, tx => evidence(b.accountId, tx))).toEqual(zero);
  });

  const protectedTables = ["simulation_executions", "simulation_fills", "execution_audit_events", "ledger_transactions", "ledger_entries"] as const;
  it("browser role session: direct INSERT/UPDATE/DELETE denied on execution and ledger tables", async () => {
    const f = await fixture("browser"); await execute(f);
    for (const table of protectedTables) {
      const rows = table === "ledger_entries"
        ? await sql`select le.id from public.ledger_entries le join public.ledger_transactions lt on lt.id = le.ledger_transaction_id where lt.financial_account_id = ${f.accountId}`
        : await sql`select id from ${sql(`public.${table}`)} where financial_account_id = ${f.accountId}`;
      expect(rows.length).toBeGreaterThan(0);
      for (const action of ["insert", "update", "delete"] as const) {
        // Always roll back this probe, including if an unexpected write were accepted.
        let denied = false;
        await expect(asUser(f.actor, async tx => {
          try {
            const result = action === "insert" ? await tx`insert into ${tx(`public.${table}`)} select * from ${tx(`public.${table}`)} where id = ${rows[0]!.id} returning id`
              : action === "update" ? await tx`update ${tx(`public.${table}`)} set id = id where id = ${rows[0]!.id} returning id`
                : await tx`delete from ${tx(`public.${table}`)} where id = ${rows[0]!.id} returning id`;
            // An RLS USING policy may deny UPDATE/DELETE by filtering all rows.
            denied = action !== "insert" && result.length === 0;
          } catch (error) {
            if ((error as { code?: string }).code !== "42501") throw error;
            denied = true;
          }
          throw new Error("rollback browser mutation probe");
        })).rejects.toThrow("rollback browser mutation probe");
        expect(denied, `${table} ${action} must be denied by grants/RLS`).toBe(true);
      }
    }
    await assertSettlement(f, 100_000n);
  });

  it("append-only: privileged UPDATE and DELETE reject existing execution, fill, audit and ledger evidence", async () => {
    const f = await fixture("immutable"); await execute(f);
    for (const table of protectedTables) {
      const rows = table === "ledger_entries"
        ? await sql`select le.id from public.ledger_entries le join public.ledger_transactions lt on lt.id = le.ledger_transaction_id where lt.financial_account_id = ${f.accountId}`
        : await sql`select id from ${sql(`public.${table}`)} where financial_account_id = ${f.accountId}`;
      expect(rows.length).toBeGreaterThan(0);
      await expect(sql.begin(async tx => { await tx`update ${tx(`public.${table}`)} set id = id where id = ${rows[0]!.id}`; throw new Error("unexpected update accepted"); })).rejects.toThrow("append-only");
      await expect(sql.begin(async tx => { await tx`delete from ${tx(`public.${table}`)} where id = ${rows[0]!.id}`; throw new Error("unexpected delete accepted"); })).rejects.toThrow("append-only");
    }
    await assertSettlement(f, 100_000n);
  });
});
