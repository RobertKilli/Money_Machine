import "server-only";

import { createHash, randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { runDeterministicBacktest, type BacktestRunConfig, type BacktestResult, type DeterministicBacktestState } from "@/application/backtest/run-deterministic-backtest";
import { assertValidPaperPolicy, transitionPaperPolicy, type StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
import type { FixturePriceObservation } from "@/domain/strategy/fixture-assets";

type StoredPolicy = { policy_json: unknown; status: StandingPaperPolicy["status"]; financial_account_id: string; owner_id: string };
const encode = (value: unknown): unknown => {
  if (typeof value === "bigint") return { $type: "bigint", value: value.toString() };
  if (value instanceof Date) return { $type: "date", value: value.toISOString() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
  return value;
};
const decode = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.$type === "bigint" && typeof record.value === "string") return BigInt(record.value);
    if (record.$type === "date" && typeof record.value === "string") return new Date(record.value);
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, decode(item)]));
  }
  return value;
};
const stable = (value: unknown) => JSON.stringify(encode(value));
const sha256 = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
const parsePolicy = (raw: unknown): StandingPaperPolicy => {
  const parsed = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
  const policy = decode(parsed) as StandingPaperPolicy;
  assertValidPaperPolicy(policy);
  return policy;
};
const parseState = (raw: unknown): DeterministicBacktestState => {
  const parsed = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
  const state = decode(parsed) as Partial<DeterministicBacktestState>;
  return {
    ledger: state.ledger ?? [], acquisitions: state.acquisitions ?? [],
    netContributionsMinor: BigInt(state.netContributionsMinor ?? 0n),
    adjustedEquityHighWaterMinor: BigInt(state.adjustedEquityHighWaterMinor ?? 0n),
    committedCapitalMinor: BigInt(state.committedCapitalMinor ?? 0n), lastProcessedAt: state.lastProcessedAt ?? null,
  };
};
const json = (value: unknown): JsonValue => encode(value) as JsonValue;

/** PostgreSQL UoW for an existing PAPER FinancialAccount. Every round locks its policy row. */
export class StandingPaperPolicyRepository {
  private readonly client: Sql;
  constructor(connectionString: string) {
    this.client = postgres(connectionString, { max: 5, prepare: true });
  }

  async create(policy: StandingPaperPolicy): Promise<void> {
    assertValidPaperPolicy(policy);
    if (policy.status !== "DRAFT") throw new Error("PAPER_POLICY_MUST_START_DRAFT");
    await this.client.begin(async tx => {
      const accounts = await tx<{ id: string }[]>`select id from public.financial_accounts where id = ${policy.financialAccountId} and mode = 'PAPER' and status = 'ACTIVE' and base_currency_code = 'NOK' for update`;
      if (!accounts[0]) throw new Error("STANDING_PAPER_REQUIRES_ACTIVE_PAPER_NOK_ACCOUNT");
      await tx`insert into public.standing_paper_policies (policy_id, financial_account_id, policy_version, status, policy_json) values (${policy.policyId}, ${policy.financialAccountId}, ${policy.version}, ${policy.status}, ${tx.json(json(policy))})`;
      await tx`insert into public.standing_paper_policy_transitions (policy_id, financial_account_id, policy_version, action, from_status, to_status, input_hash) values (${policy.policyId}, ${policy.financialAccountId}, ${policy.version}, 'INITIALIZE', null, 'DRAFT', ${sha256(policy)})`;
    });
  }

  async transition(policyId: string, action: "ACTIVATE" | "PAUSE" | "STOP"): Promise<StandingPaperPolicy> {
    return this.client.begin(async tx => {
      const rows = await tx<StoredPolicy[]>`select sp.policy_json, sp.status, sp.financial_account_id, fa.owner_id from public.standing_paper_policies sp join public.financial_accounts fa on fa.id = sp.financial_account_id where sp.policy_id = ${policyId} and fa.status = 'ACTIVE' and fa.mode = 'PAPER' for update of sp`;
      if (!rows[0]) throw new Error("PAPER_POLICY_NOT_FOUND");
      const current = parsePolicy(rows[0].policy_json);
      if (current.financialAccountId !== rows[0].financial_account_id || current.status !== rows[0].status) throw new Error("PAPER_POLICY_STATE_CORRUPT");
      const next = transitionPaperPolicy(current, action);
      await tx`update public.standing_paper_policies set status = ${next.status}, policy_json = ${tx.json(json(next))}, updated_at = now() where policy_id = ${policyId}`;
      await tx`insert into public.standing_paper_policy_transitions (policy_id, financial_account_id, policy_version, action, from_status, to_status, input_hash) values (${policyId}, ${current.financialAccountId}, ${current.version}, ${action}, ${current.status}, ${next.status}, ${sha256({ current, action, next })})`;
      return structuredClone(next);
    });
  }

  async run(policyId: string, config: Omit<BacktestRunConfig, "standingPaperPolicy">, prices: readonly FixturePriceObservation[], idempotencyKey: string): Promise<BacktestResult> {
    const snapshot = structuredClone({ config, prices });
    if (!idempotencyKey.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    return this.client.begin(async tx => {
      const rows = await tx<StoredPolicy[]>`select sp.policy_json, sp.status, sp.financial_account_id, fa.owner_id from public.standing_paper_policies sp join public.financial_accounts fa on fa.id = sp.financial_account_id where sp.policy_id = ${policyId} and fa.status = 'ACTIVE' and fa.mode = 'PAPER' for update of sp`;
      if (!rows[0]) throw new Error("PAPER_POLICY_NOT_FOUND");
      const policy = parsePolicy(rows[0].policy_json);
      if (policy.financialAccountId !== rows[0].financial_account_id || policy.status !== rows[0].status) throw new Error("PAPER_POLICY_STATE_CORRUPT");
      if (snapshot.config.financialAccountId && snapshot.config.financialAccountId !== policy.financialAccountId) throw new Error("PAPER_ACCOUNT_MISMATCH");

      const requestHash = sha256({ policy, ...snapshot });
      const existing = await tx<{ input_hash: string; result_json: unknown }[]>`select input_hash, result_json from public.standing_paper_runs where financial_account_id = ${policy.financialAccountId} and policy_id = ${policyId} and idempotency_key = ${idempotencyKey}`;
      if (existing[0]) {
        if (existing[0].input_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT");
        return decode(typeof existing[0].result_json === "string" ? JSON.parse(existing[0].result_json) : existing[0].result_json) as BacktestResult;
      }
      if (policy.status !== "ACTIVE") throw new Error("POLICY_NOT_ACTIVE");

      const contributionIds = snapshot.config.contributionEvents.map(event => event.eventId);
      if (new Set(contributionIds).size !== contributionIds.length) throw new Error("DUPLICATE_PAPER_CONTRIBUTION_EVENT");
      if (contributionIds.length) {
        const duplicate = await tx<{ event_id: string }[]>`select event_id from public.standing_paper_contributions where financial_account_id = ${policy.financialAccountId} and policy_id = ${policyId} and event_id in ${tx(contributionIds)}`;
        if (duplicate[0]) throw new Error("PAPER_CONTRIBUTION_ALREADY_PROCESSED");
      }

      const stateRows = await tx<{ state_json: unknown }[]>`select state_json from public.standing_paper_policies where policy_id = ${policyId}`;
      const initial = parseState(stateRows[0]!.state_json);
      const result = runDeterministicBacktest({ ...snapshot.config, financialAccountId: policy.financialAccountId, standingPaperPolicy: policy }, snapshot.prices, initial);
      const runId = randomUUID();
      await tx`insert into public.standing_paper_runs (id, policy_id, financial_account_id, idempotency_key, input_hash, result_json) values (${runId}, ${policyId}, ${policy.financialAccountId}, ${idempotencyKey}, ${requestHash}, ${tx.json(json(result))})`;

      for (const event of snapshot.config.contributionEvents) {
        await tx`insert into public.standing_paper_contributions (policy_id, financial_account_id, event_id, input_hash, run_id) values (${policyId}, ${policy.financialAccountId}, ${event.eventId}, ${sha256(event)}, ${runId})`;
      }
      for (const decision of result.paperPolicyDecisions) {
        const evidence = decision.evidence;
        await tx`insert into public.standing_paper_decisions (policy_id, financial_account_id, order_id, input_hash, decision_json, run_id) values (${policyId}, ${policy.financialAccountId}, ${decision.orderId}, ${evidence.inputHash}, ${tx.json(json(decision))}, ${runId})`;
      }
      for (const journal of result.journals) {
        const journalHash = sha256(journal);
        const commandType = journal.type === "VIRTUAL_DEPOSIT" ? "STANDING_PAPER_CONTRIBUTION" : "STANDING_PAPER_EXECUTION";
        const commandKey = journal.id;
        const commandId = journal.idempotencyRecordId ?? randomUUID();
        await tx`insert into public.idempotency_records (id, financial_account_id, command_type, idempotency_key, request_hash, result_json) values (${commandId}, ${policy.financialAccountId}, ${commandType}, ${commandKey}, ${journalHash}, ${tx.json(json({ ledgerTransactionId: journal.id, outcome: "RECORDED" }))})`;
        for (const entry of journal.entries) {
          await tx`insert into public.ledger_accounts (id, financial_account_id, code, account_class, normal_balance, commodity_kind, commodity_currency_code, commodity_asset_id) values (${randomUUID()}, ${policy.financialAccountId}, ${entry.ledgerAccount.code}, ${entry.ledgerAccount.accountClass}, ${entry.ledgerAccount.normalBalance}, ${entry.ledgerAccount.commodity.kind}, ${entry.ledgerAccount.commodity.kind === "MONEY" ? entry.ledgerAccount.commodity.currencyCode : null}, ${entry.ledgerAccount.commodity.kind === "ASSET" ? entry.ledgerAccount.commodity.assetId : null}) on conflict (financial_account_id, code) do nothing`;
        }
        const accounts = await tx<{ id: string; code: string; account_class: string; normal_balance: string; commodity_kind: string; commodity_currency_code: string | null; commodity_asset_id: string | null }[]>`select id, code, account_class, normal_balance, commodity_kind, commodity_currency_code, commodity_asset_id from public.ledger_accounts where financial_account_id = ${policy.financialAccountId} and code in ${tx(journal.entries.map(entry => entry.ledgerAccount.code))}`;
        for (const entry of journal.entries) {
          const account = accounts.find(item => item.code === entry.ledgerAccount.code);
          const commodity = entry.ledgerAccount.commodity;
          if (!account || account.account_class !== entry.ledgerAccount.accountClass || account.normal_balance !== entry.ledgerAccount.normalBalance || account.commodity_kind !== commodity.kind || account.commodity_currency_code !== (commodity.kind === "MONEY" ? commodity.currencyCode : null) || account.commodity_asset_id !== (commodity.kind === "ASSET" ? commodity.assetId : null)) throw new Error("PAPER_LEDGER_ACCOUNT_MISMATCH");
        }
        await tx`insert into public.ledger_transactions (id, financial_account_id, idempotency_record_id, transaction_type, occurred_at, narrative) values (${journal.id}, ${policy.financialAccountId}, ${journal.type === "VIRTUAL_DEPOSIT" ? commandId : null}, ${journal.type}, ${journal.occurredAt}, ${journal.narrative})`;
        for (const entry of journal.entries) {
          const accountId = accounts.find(item => item.code === entry.ledgerAccount.code)!.id;
          await tx`insert into public.ledger_entries (ledger_transaction_id, ledger_account_id, direction, amount_atoms) values (${journal.id}, ${accountId}, ${entry.direction}, ${entry.amountAtoms.toString()}::numeric)`;
        }
        await tx`insert into public.audit_events (financial_account_id, actor_id, command_id, command_type, idempotency_key, outcome, policy_versions, ledger_transaction_id, input_hash, output_hash, occurred_at) values (${policy.financialAccountId}, ${rows[0]!.owner_id}, ${commandId}, ${commandType}, ${commandKey}, 'SUCCEEDED', ${tx.json(json({ standingPaperPolicy: policy.version, execution: "m1-market-execution/v1", fee: "m1-fee/v1", rounding: "m1-rounding/v1" }))}, ${journal.id}, ${journalHash}, ${sha256({ ledgerTransactionId: journal.id, entries: journal.entries })}, ${journal.occurredAt})`;
      }
      for (const fill of result.executions) {
        const acquisition = result.persistentState.acquisitions.find(item => item.fillId === fill.fillId);
        if (!acquisition) throw new Error("PAPER_FILL_LEDGER_LINK_MISSING");
        await tx`insert into public.standing_paper_fills (policy_id, financial_account_id, fill_id, order_id, ledger_transaction_id, execution_json, run_id) values (${policyId}, ${policy.financialAccountId}, ${fill.fillId}, ${fill.proposalId}, ${acquisition.ledgerTransactionId}, ${tx.json(json(fill))}, ${runId})`;
      }
      await tx`update public.standing_paper_policies set state_json = ${tx.json(json(result.persistentState))}, updated_at = now() where policy_id = ${policyId}`;
      return result;
    });
  }

  async close(): Promise<void> { await this.client.end({ timeout: 5 }); }
}
