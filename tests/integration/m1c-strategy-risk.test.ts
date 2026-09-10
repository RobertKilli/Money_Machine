import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EvaluateContributionRebalancing } from "@/application/decisions/evaluate-contribution-rebalancing";
import { money } from "@/domain/financial/money";
import { assessProposal } from "@/domain/risk/m1-risk";
import { contributionRebalancing } from "@/domain/strategy/fixture-assets";
import { M1CDecisionRepository } from "@/infrastructure/postgres/m1c-decision-repository";
import { PostgresFinancialRepository } from "@/infrastructure/postgres/postgres-financial-repository";

const PROJECT_REF = "flsfallpputejojncyue";
const runId = randomUUID();
const ownerA = randomUUID();
const ownerB = randomUUID();
let sql!: Sql;
let accounts!: PostgresFinancialRepository;
let decisions!: M1CDecisionRepository;
let accountAId: string;
let accountBId: string;

function connectionUrl(): string {
  if (process.env.MONEY_MACHINE_INTEGRATION_TEST !== "1" || process.env.MONEY_MACHINE_INTEGRATION_PROJECT_REF !== PROJECT_REF) throw new Error("M1C integration requires explicit Money Machine authorization flags");
  const value = process.env.DATABASE_URL;
  if (!value || !value.includes(PROJECT_REF)) throw new Error("M1C integration requires the authorized project DATABASE_URL");
  return value;
}

function ipv4Socket({ host, port }: { host: string[]; port: number[] }) {
  const hostname = host[0];
  const portNumber = port[0];
  if (!hostname || !portNumber) throw new Error("Database host and port are required");
  const socket = createConnection({ host: hostname, port: portNumber, family: 4, autoSelectFamily: false });
  Object.defineProperties(socket, { host: { value: hostname, writable: true, configurable: true }, port: { value: portNumber, writable: true, configurable: true } });
  return socket;
}

describe("Money Machine M1C hosted strategy and risk persistence", () => {
  beforeAll(async () => {
    const url = connectionUrl();
    sql = postgres(url, { max: 4, prepare: true, ssl: "require", socket: ipv4Socket } as Parameters<typeof postgres>[1]);
    accounts = new PostgresFinancialRepository(url);
    decisions = new M1CDecisionRepository(url);
    await sql`insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values (${ownerA}, 'authenticated', 'authenticated', ${`m1c-a-${runId}@example.invalid`}, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()), (${ownerB}, 'authenticated', 'authenticated', ${`m1c-b-${runId}@example.invalid`}, '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())`;
    accountAId = (await accounts.getOrCreateDefaultSimulationAccount(ownerA)).id;
    accountBId = (await accounts.getOrCreateDefaultSimulationAccount(ownerB)).id;
    await import("@/application/deposits/create-virtual-deposit").then(({ CreateVirtualDeposit }) => new CreateVirtualDeposit(accounts).execute({ actorId: ownerA, financialAccountId: accountAId, amount: money("NOK", 100_000n), idempotencyKey: `m1c-seed-${runId}` }));
  });

  afterAll(async () => { await decisions.close(); await accounts.close(); await sql.end({ timeout: 5 }); });

  it("persists fixture assets and temporally selects only available prices", async () => {
    const fixtures = await decisions.getFixtureInputs();
    expect(fixtures.assets.map((asset) => asset.symbol)).toEqual(["MM_DEFENSIVE", "MM_GLOBAL", "MM_GROWTH"]);
    const eligible = fixtures.prices.filter((item) => item.assetId === fixtures.assets.find((asset) => asset.symbol === "MM_GLOBAL")!.assetId && item.availableAt <= new Date("2026-01-01T10:07:00Z"));
    expect(eligible).toHaveLength(1);
    expect(eligible[0]!.price.priceAtoms).toBe(10_000n);
  });

  it("persists an approved decision and proposed orders", async () => {
    const command = new EvaluateContributionRebalancing(accounts, decisions);
    const decisionTimestamp = new Date(Date.now() + 60_000);
    const result = await command.execute({ actorId: ownerA, financialAccountId: accountAId, decisionTimestamp, idempotencyKey: `m1c-approved-${runId}` });
    expect(result.status).toBe("APPROVED");
    const rows = await sql<{ decisions: string; orders: string; assessments: string; audits: string }[]>`select (select count(*)::text from public.strategy_decisions where id = ${result.decisionId}) decisions, (select count(*)::text from public.proposed_orders where strategy_decision_id = ${result.decisionId}) orders, (select count(*)::text from public.risk_assessments where strategy_decision_id = ${result.decisionId}) assessments, (select count(*)::text from public.decision_audit_events where decision_id = ${result.decisionId}) audits`;
    expect(rows[0]).toEqual({ decisions: "1", orders: "3", assessments: "1", audits: "1" });
  });

  it("replays idempotently, rejects conflict, and serializes concurrent duplicates", async () => {
    const command = new EvaluateContributionRebalancing(accounts, decisions);
    const key = `m1c-replay-${runId}`;
    const decisionTimestamp = new Date(Date.now() + 60_000);
    const input = { actorId: ownerA, financialAccountId: accountAId, decisionTimestamp, idempotencyKey: key };
    const first = await command.execute(input);
    expect(await command.execute(input)).toEqual(first);
    await expect(command.execute({ ...input, decisionTimestamp: new Date(decisionTimestamp.getTime() + 1_000) })).rejects.toThrow("different input");
    const concurrentKey = `m1c-concurrent-${runId}`;
    const [left, right] = await Promise.all([command.execute({ ...input, idempotencyKey: concurrentKey }), command.execute({ ...input, idempotencyKey: concurrentKey })]);
    expect(left).toEqual(right);
    const count = await sql<{ count: string }[]>`select count(*)::text as count from public.strategy_decisions sd join public.idempotency_records ir on ir.id = sd.idempotency_record_id where ir.financial_account_id = ${accountAId} and ir.idempotency_key = ${concurrentKey}`;
    expect(count[0]?.count).toBe("1");
  });

  it("persists rejection violations and rolls back late failures", async () => {
    const fixtures = await decisions.getFixtureInputs();
    const decision = contributionRebalancing({ financialAccountId: accountBId, decisionId: randomUUID(), cash: money("NOK", 100_000n), decisionTimestamp: new Date("2026-01-01T10:07:00Z"), prices: fixtures.prices, assets: fixtures.assets });
    const proposal = decision.proposedOrders[0]!;
    const risk = assessProposal(proposal, { accountActive: true, simulationMode: true, strategyEnabled: false, strategyVersion: decision.strategyVersion, accountCurrency: "NOK", availableCash: money("NOK", 100_000n), decisionNav: money("NOK", 100_000n), decisionTimestamp: decision.decisionTimestamp, assets: fixtures.assets, prices: fixtures.prices });
    const rejected = await decisions.persist(decision, risk, ownerB, `m1c-rejected-${runId}`, "c".repeat(64));
    expect(rejected.status).toBe("REJECTED");
    expect((await sql`select count(*)::text as count from public.risk_violations rv join public.risk_assessments ra on ra.id = rv.risk_assessment_id where ra.strategy_decision_id = ${decision.decisionId}`)[0]!.count).toBe("1");
    const badKey = `m1c-rollback-${runId}`;
    const badDecision = { ...decision, decisionId: randomUUID(), proposedOrders: [Object.freeze({ ...proposal, proposalId: randomUUID(), referencePriceRecordId: randomUUID() })] };
    await expect(decisions.persist(badDecision, risk, ownerB, badKey, "d".repeat(64))).rejects.toThrow();
    const residue = await sql<{ count: string }[]>`select count(*)::text as count from public.strategy_decisions sd join public.idempotency_records ir on ir.id = sd.idempotency_record_id where ir.idempotency_key = ${badKey}`;
    expect(residue[0]?.count).toBe("0");
  });

  it("isolates decision data with RLS and prevents direct authenticated writes", async () => {
    const counts = await sql.begin(async (tx) => {
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claim.sub', ${ownerB}, true)`;
      return tx<{ decisions: string; orders: string; audits: string }[]>`select (select count(*)::text from public.strategy_decisions where financial_account_id = ${accountAId}) decisions, (select count(*)::text from public.proposed_orders where financial_account_id = ${accountAId}) orders, (select count(*)::text from public.decision_audit_events where financial_account_id = ${accountAId}) audits`;
    });
    expect(counts[0]).toEqual({ decisions: "0", orders: "0", audits: "0" });
    await expect(sql.begin(async (tx) => { await tx`set local role authenticated`; await tx`select set_config('request.jwt.claim.sub', ${ownerB}, true)`; await tx`insert into public.strategy_decisions (financial_account_id, actor_id, idempotency_record_id, decision_timestamp, strategy_version, risk_policy_version, asset_registry_version, dataset_version, input_cash_atoms, reserve_atoms, status, result_json) values (${accountBId}, ${ownerB}, ${randomUUID()}, now(), 'x', 'x', 'x', 'x', 1, 0, 'REJECTED', '{}'::jsonb)`; })).rejects.toThrow();
  });
});
