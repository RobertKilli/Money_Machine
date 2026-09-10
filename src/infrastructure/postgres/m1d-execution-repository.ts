import "server-only";

import { randomUUID, createHash } from "node:crypto";
import { createConnection } from "node:net";
import postgres, { type Sql } from "postgres";
import { money } from "@/domain/financial/money";
import { price } from "@/domain/financial/price";
import { quantity } from "@/domain/financial/quantity";
import { executeSimulationBuy } from "@/domain/execution/simulation-execution";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION, latestAvailablePrice, type FixturePriceObservation, type ProposedOrder } from "@/domain/strategy/fixture-assets";

export interface ExecutionResult { readonly executionId: string; readonly fillId: string; readonly proposalId: string; readonly state: "FILLED"; readonly totalCashDebitMinorUnits: string; }
type ExecutionRow = { id: string; asset_id: string; side: "BUY"; order_type: "MARKET"; quantity_atoms: string; quantity_scale: number; price_atoms: string; price_scale: number; currency_code: "NOK"; reference_price_id: string; reference_notional_atoms: string; decision_timestamp: Date; strategy_version: "contribution-rebalancing/v1"; registry_version: "fixture-asset-registry/v1"; dataset_version: "mm-fixture-market-data/v1"; strategy_decision_id: string; financial_account_id: string; decision_status: string; decision_nav_atoms: string; risk_disposition: string; owner_id: string; account_status: string; mode: string; base_currency_code: "NOK" };
type IdempotencyRow = { request_hash: string; result_json: ExecutionResult };
type PriceRow = { id: string; asset_id: string; price_atoms: string; price_scale: number; currency_code: "NOK"; observed_at: Date; available_at: Date; ingested_at: Date; dataset_version: "mm-fixture-market-data/v1" };
type AccountRow = { id: string; code: string };

function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export class M1DExecutionRepository {
  private readonly client: Sql;
  constructor(connectionString: string) {
    this.client = postgres(connectionString, { max: 5, prepare: true, ssl: "require", socket: ({ host, port }: { host: string[]; port: number[] }) => {
      const hostname = host[0]; const portNumber = port[0]; if (!hostname || !portNumber) throw new Error("PostgreSQL host and port are required");
      const socket = createConnection({ host: hostname, port: portNumber, family: 4, autoSelectFamily: false });
      Object.defineProperties(socket, { host: { value: hostname, writable: true, configurable: true }, port: { value: portNumber, writable: true, configurable: true } }); return socket;
    }} as Parameters<typeof postgres>[1]);
  }

  async executeApprovedProposal(actorId: string, proposalId: string, idempotencyKey: string, executionTimestamp = new Date()): Promise<ExecutionResult> {
    return this.client.begin(async (sql) => {
      const rows = await sql<ExecutionRow[]>`select po.*, sd.status as decision_status, ra.disposition as risk_disposition, fa.owner_id, fa.status as account_status, fa.mode, fa.base_currency_code, sd.decision_timestamp, coalesce((sd.result_json->>'decisionNavMinorUnits')::numeric, sd.input_cash_atoms)::text as decision_nav_atoms from public.proposed_orders po join public.strategy_decisions sd on sd.id = po.strategy_decision_id join public.risk_assessments ra on ra.strategy_decision_id = sd.id join public.financial_accounts fa on fa.id = po.financial_account_id where po.id = ${proposalId} for update`;
      const row = rows[0]; if (!row || row.owner_id !== actorId) throw new Error("Proposal was not found");
      const existing = await sql<IdempotencyRow[]>`select request_hash, result_json from public.idempotency_records where financial_account_id = ${row.financial_account_id} and command_type = 'EXECUTE_SIMULATION' and idempotency_key = ${idempotencyKey} for update`;
      const requestHash = hash({ proposalId, executionTimestamp: executionTimestamp.toISOString() });
      if (existing[0]) {
        if (existing[0].request_hash !== requestHash) throw new Error("Idempotency key was reused with different input");
        const stored = typeof existing[0].result_json === "string" ? JSON.parse(existing[0].result_json) as ExecutionResult : existing[0].result_json;
        return stored;
      }
      const settled = await sql<{ id: string }[]>`select id from public.simulation_executions where proposed_order_id = ${proposalId} and state = 'FILLED' for update`;
      if (settled[0]) throw new Error("Proposal is already settled");
      if (row.decision_status !== "APPROVED" || row.risk_disposition !== "APPROVE") throw new Error("Decision is not risk approved");
      const asset = FIXTURE_ASSETS.find((item) => item.assetId === row.asset_id); if (!asset) throw new Error("Fixture asset was not found");
      const prices = await sql<PriceRow[]>`select id, asset_id, price_atoms::text, price_scale, currency_code, observed_at, available_at, ingested_at, dataset_version from public.market_prices where asset_id = ${row.asset_id} and dataset_version = ${FIXTURE_DATASET_VERSION} order by available_at desc, observed_at desc, id desc`;
      const observations: FixturePriceObservation[] = prices.map((p) => ({ recordId: p.id, assetId: p.asset_id, price: price(p.currency_code, BigInt(p.price_atoms), p.price_scale), observedAt: new Date(p.observed_at), availableAt: new Date(p.available_at), ingestedAt: new Date(p.ingested_at), datasetVersion: p.dataset_version }));
      const referencePrice = latestAvailablePrice(observations, row.asset_id, new Date(row.decision_timestamp)); if (!referencePrice) throw new Error("No legally available fixture price");
      const cashRows = await sql<{ atoms: string }[]>`select coalesce(sum(case when le.direction = 'DEBIT' then le.amount_atoms else -le.amount_atoms end),0)::text atoms from public.ledger_entries le join public.ledger_transactions lt on lt.id = le.ledger_transaction_id join public.ledger_accounts la on la.id = le.ledger_account_id where lt.financial_account_id = ${row.financial_account_id} and la.code = 'CASH'`;
      const availableCash = money(row.base_currency_code, BigInt(cashRows[0]?.atoms ?? "0"));
      const proposal: ProposedOrder = { proposalId: row.id, financialAccountId: row.financial_account_id, assetId: row.asset_id, side: row.side, orderType: row.order_type, quantity: quantity(row.asset_id, BigInt(row.quantity_atoms), row.quantity_scale), referencePrice: price(row.currency_code, BigInt(row.price_atoms), row.price_scale), referencePriceRecordId: row.reference_price_id, referenceNotional: money(row.currency_code, BigInt(row.reference_notional_atoms)), decisionTimestamp: new Date(row.decision_timestamp), strategyVersion: row.strategy_version, registryVersion: row.registry_version, datasetVersion: row.dataset_version };
      const fill = executeSimulationBuy({ financialAccountId: row.financial_account_id, actorId, accountActive: row.account_status === "ACTIVE", simulationMode: row.mode === "SIMULATION", decisionApproved: true, riskApproved: true, proposal, asset, referencePrice, availableCash, decisionNav: money(row.base_currency_code, BigInt(row.decision_nav_atoms)), executionTimestamp, alreadySettled: false });
      const commandId = randomUUID(); const executionId = randomUUID(); const ledgerId = randomUUID();
      const result: ExecutionResult = { executionId, fillId: fill.fillId, proposalId, state: "FILLED", totalCashDebitMinorUnits: fill.totalCashDebit.minorUnits.toString() };
      await sql`insert into public.idempotency_records (id, financial_account_id, command_type, idempotency_key, request_hash, result_json) values (${commandId}, ${row.financial_account_id}, 'EXECUTE_SIMULATION', ${idempotencyKey}, ${requestHash}, ${JSON.stringify(result)}::jsonb)`;
      const cash = await sql<AccountRow[]>`select id, code from public.ledger_accounts where financial_account_id = ${row.financial_account_id} and code = 'CASH'`;
      if (!cash[0]) throw new Error("Cash ledger account was not found");
      const accounts = await sql<AccountRow[]>`select id, code from public.ledger_accounts where financial_account_id = ${row.financial_account_id} and code in (${"ASSET_HOLDING:" + asset.assetId}, ${"ASSET_CLEARING:" + asset.assetId}, ${"ASSET_COST_BASIS:" + asset.assetId}, 'FEE_EXPENSE')`;
      const ensure = async (code: string, cls: string, normal: string, kind: string, currency: string | null, assetId: string | null) => { const found = accounts.find((a) => a.code === code); if (found) return found; const id = randomUUID(); await sql`insert into public.ledger_accounts (id, financial_account_id, code, account_class, normal_balance, commodity_kind, commodity_currency_code, commodity_asset_id) values (${id}, ${row.financial_account_id}, ${code}, ${cls}, ${normal}, ${kind}, ${currency}, ${assetId})`; return { id, code }; };
      const holding = await ensure(`ASSET_HOLDING:${asset.assetId}`, "ASSET", "DEBIT", "ASSET", null, asset.assetId); const clearing = await ensure(`ASSET_CLEARING:${asset.assetId}`, "CLEARING", "CREDIT", "ASSET", null, asset.assetId); const cost = await ensure(`ASSET_COST_BASIS:${asset.assetId}`, "CLEARING", "DEBIT", "MONEY", row.base_currency_code, null); const feeExpense = await ensure("FEE_EXPENSE", "EXPENSE", "DEBIT", "MONEY", row.base_currency_code, null);
      await sql`insert into public.ledger_transactions (id, financial_account_id, transaction_type, occurred_at, narrative) values (${ledgerId}, ${row.financial_account_id}, 'SIMULATED_BUY_SETTLEMENT', ${executionTimestamp}, 'Simulated BUY settlement')`;
      await sql`insert into public.ledger_entries (ledger_transaction_id, ledger_account_id, direction, amount_atoms) values (${ledgerId}, ${cost.id}, 'DEBIT', ${fill.grossNotional.minorUnits.toString()}::numeric), (${ledgerId}, ${cash[0].id}, 'CREDIT', ${fill.grossNotional.minorUnits.toString()}::numeric), (${ledgerId}, ${feeExpense.id}, 'DEBIT', ${fill.fee.minorUnits.toString()}::numeric), (${ledgerId}, ${cash[0].id}, 'CREDIT', ${fill.fee.minorUnits.toString()}::numeric), (${ledgerId}, ${holding.id}, 'DEBIT', ${fill.quantity.atomicUnits.toString()}::numeric), (${ledgerId}, ${clearing.id}, 'CREDIT', ${fill.quantity.atomicUnits.toString()}::numeric)`;
      await sql`insert into public.simulation_executions (id, financial_account_id, actor_id, strategy_decision_id, proposed_order_id, idempotency_record_id, ledger_transaction_id, state, execution_timestamp, quantity_atoms, quantity_scale, reference_price_atoms, reference_price_scale, execution_price_atoms, execution_price_scale, currency_code, gross_notional_atoms, fee_atoms, total_cash_debit_atoms, execution_policy_version, spread_slippage_policy_version, fee_policy_version, rounding_policy_version, result_json) values (${executionId}, ${row.financial_account_id}, ${actorId}, ${row.strategy_decision_id}, ${proposalId}, ${commandId}, ${ledgerId}, 'FILLED', ${executionTimestamp}, ${fill.quantity.atomicUnits.toString()}::numeric, ${fill.quantity.quantityScale}, ${fill.referencePrice.priceAtoms.toString()}::numeric, ${fill.referencePrice.priceScale}, ${fill.executionPrice.priceAtoms.toString()}::numeric, ${fill.executionPrice.priceScale}, ${fill.totalCashDebit.currencyCode}, ${fill.grossNotional.minorUnits.toString()}::numeric, ${fill.fee.minorUnits.toString()}::numeric, ${fill.totalCashDebit.minorUnits.toString()}::numeric, ${fill.executionPolicyVersion}, ${fill.spreadSlippagePolicyVersion}, ${fill.feePolicyVersion}, ${fill.roundingPolicyVersion}, ${JSON.stringify(result)}::jsonb)`;
      await sql`insert into public.simulation_fills (id, simulation_execution_id, proposed_order_id, financial_account_id, ledger_transaction_id, quantity_atoms, quantity_scale, reference_price_atoms, execution_price_atoms, price_scale, currency_code, gross_notional_atoms, fee_atoms, total_cash_debit_atoms, execution_policy_version, spread_slippage_policy_version, fee_policy_version, rounding_policy_version, execution_timestamp) values (${fill.fillId}, ${executionId}, ${proposalId}, ${row.financial_account_id}, ${ledgerId}, ${fill.quantity.atomicUnits.toString()}::numeric, ${fill.quantity.quantityScale}, ${fill.referencePrice.priceAtoms.toString()}::numeric, ${fill.executionPrice.priceAtoms.toString()}::numeric, ${fill.executionPrice.priceScale}, ${fill.totalCashDebit.currencyCode}, ${fill.grossNotional.minorUnits.toString()}::numeric, ${fill.fee.minorUnits.toString()}::numeric, ${fill.totalCashDebit.minorUnits.toString()}::numeric, ${fill.executionPolicyVersion}, ${fill.spreadSlippagePolicyVersion}, ${fill.feePolicyVersion}, ${fill.roundingPolicyVersion}, ${executionTimestamp})`;
      await sql`insert into public.execution_audit_events (financial_account_id, actor_id, execution_id, command_id, command_type, idempotency_key, outcome, evidence, occurred_at) values (${row.financial_account_id}, ${actorId}, ${executionId}, ${commandId}, 'EXECUTE_SIMULATION', ${idempotencyKey}, 'FILLED', ${JSON.stringify({ result, fill: { referencePriceAtoms: fill.referencePrice.priceAtoms.toString(), executionPriceAtoms: fill.executionPrice.priceAtoms.toString(), quantityAtoms: fill.quantity.atomicUnits.toString(), feeAtoms: fill.fee.minorUnits.toString(), ledgerTransactionId: ledgerId } })}::jsonb, ${executionTimestamp})`;
      return result;
    });
  }
  async close(): Promise<void> { await this.client.end({ timeout: 5 }); }
}
