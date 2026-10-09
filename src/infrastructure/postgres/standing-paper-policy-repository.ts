import "server-only";

import { createHash, randomUUID } from "node:crypto";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { runDeterministicBacktest, type BacktestRunConfig, type BacktestResult, type DeterministicBacktestState } from "@/application/backtest/run-deterministic-backtest";
import { assertStandingPaperPolicyTransitionAction, assertValidPaperPolicy, standingPaperActivationConfirmationHash, transitionPaperPolicy, type StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
import { FIXTURE_ASSETS, type FixturePriceObservation } from "@/domain/strategy/fixture-assets";
import type { ContributionEvent } from "@/application/backtest/run-deterministic-backtest";
import { projectStandingPaperStatusCard, projectStandingPaperStatusReadModel, type StandingPaperPolicyStatusCard, type StandingPaperStatusReadModel, type StandingPaperStatusDecision, type StandingPaperStatusFill, type StandingPaperWorkerInstanceStatus, type StandingPaperWorkerInstanceStatusRecord } from "@/application/paper-trading/standing-paper-status";

type StoredPolicy = { policy_json: unknown; status: StandingPaperPolicy["status"]; financial_account_id: string };
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
const normalize = (value: unknown): unknown => {
  const encoded = encode(value);
  if (Array.isArray(encoded)) return encoded.map(normalize);
  if (encoded && typeof encoded === "object") return Object.fromEntries(Object.entries(encoded).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, normalize(item)]));
  return encoded;
};
const stable = (value: unknown) => JSON.stringify(normalize(value));
const sha256 = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");
type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
const validDate = (value: unknown): Date => {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new Error("PAPER_MATERIAL_INVALID");
  return date;
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PAPER_MATERIAL_INVALID");
  return value as Record<string, unknown>;
};
const signedInteger = (value: unknown): value is string => typeof value === "string" && /^-?\d+$/.test(value);
const isProcessInstanceUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const invalidCard = (policyId: string): StandingPaperPolicyStatusCard => ({
  status: "INVALID", policyId, identity: null, version: null, policyStatus: "UNKNOWN", activationConfirmationHash: null, mode: "UNKNOWN", workerStatus: "UNKNOWN", workerInstances: [], workerInstanceCount: 0, workerInstancesTruncated: false,
  allowedInstrumentIds: [], riskLimits: { capitalBudgetMinor: null, maxOrderMinor: null, maxPositionMinor: null, maxGrossExposureMinor: null, maxLossMinor: null, maxPriceAgeMs: null },
  lastRound: null, netContributionsMinor: null, committedCapitalMinor: null, remainingCapitalBudgetMinor: null,
  portfolioValueMinor: null, portfolioValueAsOf: null, currentLossMinor: null, remainingLossMarginMinor: null,
  decisions: [], fills: [], issueCode: "PAPER_MATERIAL_INVALID",
});

function validateSavedResult(raw: unknown, state: DeterministicBacktestState, accountId: string): { navMinor: string | null; asOf: string; complete: boolean } {
  const result = record(raw);
  const config = record(result.config);
  const ending = record(result.endingState);
  const savedState = record(result.persistentState);
  const startAt = validDate(config.startAt);
  const endAt = validDate(config.endAt);
  const contributionEvents = config.contributionEvents;
  const valuationTimestamps = config.valuationTimestamps;
  const strategyEvaluationTimestamps = config.strategyEvaluationTimestamps ?? [];
  const snapshots = result.portfolioSnapshots;
  if (result.integrityStatus !== "CONSISTENT" || config.financialAccountId !== accountId || config.baseCurrency !== "NOK" ||
    startAt.getTime() > endAt.getTime() || !Array.isArray(contributionEvents) || !Array.isArray(valuationTimestamps) || !Array.isArray(strategyEvaluationTimestamps) || !Array.isArray(snapshots) ||
    sha256(savedState) !== sha256(state) || !["COMPLETE", "INCOMPLETE"].includes(String(ending.valuationStatus)) || ending.integrityStatus !== (ending.valuationStatus === "COMPLETE" ? "CONSISTENT" : "INCOMPLETE") ||
    ending.baseCurrency !== "NOK" || typeof ending.asOf !== "string" || !signedInteger(ending.cash) ||
    !(ending.nav === null || signedInteger(ending.nav)) || !(ending.investedMarketValue === null || signedInteger(ending.investedMarketValue)) ||
    !(ending.totalOpenCostBasis === null || signedInteger(ending.totalOpenCostBasis)) || !(ending.unrealizedPnl === null || signedInteger(ending.unrealizedPnl))) {
    throw new Error("PAPER_MATERIAL_INVALID");
  }
  const asOf = validDate(ending.asOf).toISOString();
  const snapshotTimes = snapshots.map(snapshot => validDate(record(snapshot).asOf).getTime());
  if (snapshotTimes.some((time, index) => index > 0 && time < snapshotTimes[index - 1]!)) throw new Error("PAPER_MATERIAL_INVALID");
  const expectedSnapshot = snapshots.length ? record(snapshots[snapshots.length - 1]) : null;
  const expectedAsOf = expectedSnapshot ? validDate(expectedSnapshot.asOf).toISOString() : endAt.toISOString();
  if (asOf !== expectedAsOf) throw new Error("PAPER_MATERIAL_INVALID");
  const eventTimes = [
    ...contributionEvents.map(event => validDate(record(event).availableAt).getTime()),
    ...valuationTimestamps.map(timestamp => validDate(timestamp).getTime()),
    ...strategyEvaluationTimestamps.map(timestamp => validDate(timestamp).getTime()),
  ];
  if (contributionEvents.some(event => {
    const time = validDate(record(event).availableAt).getTime();
    return time < startAt.getTime() || time > endAt.getTime();
  }) || strategyEvaluationTimestamps.some(timestamp => {
    const time = validDate(timestamp).getTime();
    return time < startAt.getTime() || time > endAt.getTime();
  })) throw new Error("PAPER_MATERIAL_INVALID");
  const lastEventTime = eventTimes.reduce((latest, time) => Math.max(latest, time), Number.NEGATIVE_INFINITY);
  if (eventTimes.length && (!state.lastProcessedAt || state.lastProcessedAt.getTime() !== lastEventTime)) throw new Error("PAPER_MATERIAL_INVALID");
  const complete = ending.valuationStatus === "COMPLETE" && ending.nav !== null;
  if (ending.valuationStatus === "COMPLETE" && !complete) throw new Error("PAPER_MATERIAL_INVALID");
  return { navMinor: complete ? ending.nav as string : null, asOf, complete };
}

function validateDecisionRow(row: { policy_id: string; financial_account_id: string; order_id: string; input_hash: string; decision_json: unknown; created_at: Date }, policyId: string, accountId: string): StandingPaperStatusDecision {
  const decision = record(decode(typeof row.decision_json === "string" ? JSON.parse(row.decision_json) as unknown : row.decision_json));
  const evidence = record(decision.evidence);
  const reasonCode = evidence.reasonCode;
  if (row.policy_id !== policyId || row.financial_account_id !== accountId || !/^[0-9a-f]{64}$/.test(row.input_hash) ||
    decision.orderId !== row.order_id || typeof decision.decisionId !== "string" || !["SIMULATED_FILLED", "REJECTED"].includes(String(decision.outcome)) ||
    evidence.policyId !== policyId || evidence.policyVersion !== "standing-paper-policy/v1" || evidence.inputHash !== row.input_hash ||
    !["POLICY_NOT_ACTIVE", "PRICE_MISSING", "PRICE_STALE", "INSTRUMENT_NOT_ALLOWED", "ORDER_LIMIT_EXCEEDED", "POSITION_LIMIT_EXCEEDED", "EXPOSURE_LIMIT_EXCEEDED", "CAPITAL_BUDGET_EXCEEDED", "LOSS_LIMIT_EXCEEDED", "M1_RISK_REJECTED", "APPROVED"].includes(String(reasonCode)) ||
    !["APPROVE", "REJECT"].includes(String(evidence.disposition)) ||
    (decision.outcome === "SIMULATED_FILLED" && (reasonCode !== "APPROVED" || evidence.disposition !== "APPROVE")) ||
    (decision.outcome === "REJECTED" && (reasonCode === "APPROVED" || evidence.disposition !== "REJECT"))) throw new Error("PAPER_MATERIAL_INVALID");
  return { orderId: row.order_id, decisionId: decision.decisionId as string, outcome: decision.outcome as StandingPaperStatusDecision["outcome"], reasonCode: reasonCode as string, disposition: evidence.disposition as StandingPaperStatusDecision["disposition"], recordedAt: validDate(row.created_at).toISOString() };
}

function validateFillRow(row: { policy_id: string; financial_account_id: string; fill_id: string; order_id: string; execution_json: unknown; acquisition_json: unknown }, policyId: string, accountId: string): StandingPaperStatusFill {
  const fill = record(decode(typeof row.execution_json === "string" ? JSON.parse(row.execution_json) as unknown : row.execution_json));
  const acquisition = record(decode(typeof row.acquisition_json === "string" ? JSON.parse(row.acquisition_json) as unknown : row.acquisition_json));
  const quantity = record(fill.quantity); const gross = record(fill.grossNotional); const fee = record(fill.fee); const total = record(fill.totalCashDebit);
  if (row.policy_id !== policyId || row.financial_account_id !== accountId || fill.fillId !== row.fill_id || fill.proposalId !== row.order_id ||
    fill.financialAccountId !== accountId || acquisition.fillId !== row.fill_id || acquisition.financialAccountId !== accountId ||
    acquisition.executionMatchesFill !== true || typeof acquisition.assetId !== "string" ||
    typeof quantity.atomicUnits !== "bigint" || quantity.atomicUnits <= 0n || !Number.isSafeInteger(quantity.quantityScale) ||
    typeof gross.minorUnits !== "bigint" || gross.minorUnits <= 0n || gross.currencyCode !== "NOK" ||
    typeof fee.minorUnits !== "bigint" || fee.minorUnits < 0n || fee.currencyCode !== "NOK" ||
    typeof total.minorUnits !== "bigint" || total.minorUnits !== gross.minorUnits + fee.minorUnits || total.currencyCode !== "NOK" ||
    fill.executionPolicyVersion !== "m1-market-execution/v1" || fill.spreadSlippagePolicyVersion !== "m1-spread-slippage/v1" ||
    fill.feePolicyVersion !== "m1-fee/v1" || fill.roundingPolicyVersion !== "m1-rounding/v1" || !(fill.executionTimestamp instanceof Date) ||
    !(acquisition.executedAt instanceof Date) || acquisition.executedAt.getTime() !== (fill.executionTimestamp as Date).getTime() ||
    !Number.isSafeInteger(acquisition.quantityScale) || acquisition.quantityAtoms !== quantity.atomicUnits ||
    acquisition.grossMinor !== gross.minorUnits || acquisition.feeMinor !== fee.minorUnits || typeof acquisition.ledgerTransactionId !== "string") throw new Error("PAPER_MATERIAL_INVALID");
  return { fillId: row.fill_id, orderId: row.order_id, instrumentId: acquisition.assetId as string, quantityAtoms: quantity.atomicUnits.toString(), quantityScale: quantity.quantityScale as number, grossMinor: gross.minorUnits.toString(), feeMinor: fee.minorUnits.toString(), currency: "NOK", simulatedAt: (fill.executionTimestamp as Date).toISOString(), executionPolicyVersion: fill.executionPolicyVersion as string };
}

const parsePolicy = (raw: unknown): StandingPaperPolicy => {
  const parsed = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
  const policy = decode(parsed) as StandingPaperPolicy;
  assertValidPaperPolicy(policy);
  return policy;
};
const parseState = (raw: unknown, accountId: string): DeterministicBacktestState => {
  const parsed = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
  const state = decode(parsed) as Record<string, unknown>;
  const invalid = (): never => { throw new Error("PAPER_CHECKPOINT_INVALID"); };
  if (!state || !Array.isArray(state.ledger) || !Array.isArray(state.acquisitions) || typeof state.netContributionsMinor !== "bigint" || typeof state.adjustedEquityHighWaterMinor !== "bigint" || typeof state.committedCapitalMinor !== "bigint" || !(state.lastProcessedAt === null || state.lastProcessedAt instanceof Date)) return invalid();
  if (state.netContributionsMinor < 0n || state.adjustedEquityHighWaterMinor < 0n || state.committedCapitalMinor < 0n || (state.lastProcessedAt instanceof Date && !Number.isFinite(state.lastProcessedAt.getTime()))) return invalid();
  for (const entry of state.ledger as Record<string, unknown>[]) {
    if (!entry || typeof entry.entryId !== "string" || typeof entry.transactionId !== "string" || entry.financialAccountId !== accountId || typeof entry.code !== "string" || !["MONEY", "ASSET"].includes(String(entry.commodityKind)) || !["DEBIT", "CREDIT"].includes(String(entry.direction)) || typeof entry.amountAtoms !== "bigint" || entry.amountAtoms <= 0n || !(entry.occurredAt instanceof Date) || !Number.isFinite(entry.occurredAt.getTime()) || !(entry.recordedAt instanceof Date) || !Number.isFinite(entry.recordedAt.getTime())) return invalid();
    if (entry.commodityKind === "MONEY" ? typeof entry.currency !== "string" || entry.assetId !== null : typeof entry.assetId !== "string" || entry.currency !== null) return invalid();
  }
  for (const acquisition of state.acquisitions as Record<string, unknown>[]) {
    if (!acquisition || typeof acquisition.fillId !== "string" || typeof acquisition.executionId !== "string" || typeof acquisition.ledgerTransactionId !== "string" || acquisition.financialAccountId !== accountId || typeof acquisition.assetId !== "string" || typeof acquisition.quantityAtoms !== "bigint" || acquisition.quantityAtoms <= 0n || !Number.isInteger(acquisition.quantityScale) || typeof acquisition.currency !== "string" || typeof acquisition.grossMinor !== "bigint" || acquisition.grossMinor <= 0n || typeof acquisition.feeMinor !== "bigint" || acquisition.feeMinor < 0n || !(acquisition.executedAt instanceof Date) || !Number.isFinite(acquisition.executedAt.getTime()) || !(acquisition.recordedAt instanceof Date) || !Number.isFinite(acquisition.recordedAt.getTime()) || typeof acquisition.executionPolicyVersion !== "string" || acquisition.executionMatchesFill !== true) return invalid();
  }
  if (new Set((state.ledger as { entryId: string }[]).map(item => item.entryId)).size !== state.ledger.length || new Set((state.acquisitions as { fillId: string }[]).map(item => item.fillId)).size !== state.acquisitions.length) return invalid();
  if ((state.acquisitions as { ledgerTransactionId: string }[]).some(item => !(state.ledger as { transactionId: string }[]).some(entry => entry.transactionId === item.ledgerTransactionId))) return invalid();
  return state as unknown as DeterministicBacktestState;
};
const json = (value: unknown): JsonValue => encode(value) as JsonValue;

/** PostgreSQL UoW for an existing PAPER FinancialAccount. Every round locks its policy row. */
export class StandingPaperPolicyRepository {
  private readonly client: Sql;
  constructor(connectionString: string, connectionOptions: { readonly ssl?: "require" | false } = {}) {
    if (connectionOptions.ssl === false && process.env.NODE_ENV !== "test") throw new Error("PAPER_DATABASE_SSL_REQUIRED");
    this.client = postgres(connectionString, { max: 5, prepare: true, ...(connectionOptions.ssl ? { ssl: connectionOptions.ssl } : {}) });
  }

  /** Read-only, fail-closed gate for the separate hosted entrypoint. It binds
   * the explicit account to an existing owned PAPER/NOK account and validates
   * the complete persisted policy before heartbeat or settlement writes. */
  async validateWorkerTarget(policyId: string, expectedAccountId: string, requestedCapitalMinor: bigint): Promise<{ readonly policy: StandingPaperPolicy; readonly ownerId: string }> {
    if (!policyId.trim() || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expectedAccountId) || requestedCapitalMinor <= 0n) {
      throw new Error("PAPER_WORKER_TARGET_INVALID");
    }
    return this.client.begin(async tx => {
      await tx`set transaction isolation level repeatable read, read only`;
      const rows = await tx<{
        policy_json: unknown; policy_status: string; policy_version: string; policy_account_id: string;
        state_json: unknown; last_run_id: string | null;
        account_id: string; owner_id: string; account_status: string; account_mode: string; currency_code: string;
        owner_exists: boolean;
      }[]>`
        select p.policy_json, p.status as policy_status, p.policy_version, p.financial_account_id as policy_account_id,
          p.state_json, p.last_run_id, a.id as account_id, a.owner_id, a.status as account_status, a.mode as account_mode, a.base_currency_code as currency_code,
          exists (select 1 from auth.users owner_user where owner_user.id = a.owner_id) as owner_exists
        from public.standing_paper_policies p
        join public.financial_accounts a on a.id = p.financial_account_id
        where p.policy_id = ${policyId}
      `;
      const row = rows[0];
      if (!row) throw new Error("PAPER_WORKER_TARGET_NOT_FOUND");
      const policy = parsePolicy(row.policy_json);
      if (row.policy_account_id !== expectedAccountId || row.account_id !== expectedAccountId || policy.financialAccountId !== expectedAccountId) throw new Error("PAPER_WORKER_ACCOUNT_MISMATCH");
      if (!row.owner_exists || !row.owner_id) throw new Error("PAPER_WORKER_ACCOUNT_OWNER_MISSING");
      if (row.policy_version !== "standing-paper-policy/v1" || policy.version !== row.policy_version || policy.policyId !== policyId || policy.status !== row.policy_status || policy.mode !== "PAPER_ONLY") throw new Error("PAPER_WORKER_POLICY_INVALID");
      if (row.policy_status !== "ACTIVE") throw new Error("PAPER_WORKER_POLICY_NOT_ACTIVE");
      if (row.account_status !== "ACTIVE" || row.account_mode !== "PAPER" || row.currency_code !== "NOK") throw new Error("PAPER_WORKER_ACCOUNT_NOT_RUNNABLE");
      const fixtureIds = new Set(FIXTURE_ASSETS.map(asset => asset.assetId));
      if (!policy.allowedInstrumentIds.length || policy.allowedInstrumentIds.some(id => !fixtureIds.has(id))) throw new Error("PAPER_WORKER_INSTRUMENT_SCOPE_INVALID");
      if (requestedCapitalMinor > policy.capitalBudgetMinor) throw new Error("PAPER_WORKER_INITIAL_CAPITAL_EXCEEDS_BUDGET");
      const state = parseState(row.state_json, expectedAccountId);
      await this.assertLedgerCheckpointMatches(tx, expectedAccountId, state, row.last_run_id);
      return { policy: structuredClone(policy), ownerId: row.owner_id };
    });
  }

  /** Read the policy/account gate before each worker round. `run` repeats these
   * checks under its transaction locks before writing, so this is observation,
   * not a replacement for the repository's authoritative gate. */
  async getWorkerPolicyState(policyId: string): Promise<{ policyStatus: StandingPaperPolicy["status"]; accountStatus: string | null; accountMode: string | null; accountCurrency: string | null }> {
    const rows = await this.client<{ policy_status: StandingPaperPolicy["status"]; account_status: string | null; account_mode: string | null; account_currency: string | null }[]>`
      select p.status as policy_status, a.status as account_status, a.mode as account_mode, a.base_currency_code as account_currency
      from public.standing_paper_policies p left join public.financial_accounts a on a.id = p.financial_account_id
      where p.policy_id = ${policyId}
    `;
    if (!rows[0]) throw new Error("PAPER_POLICY_NOT_FOUND");
    return { policyStatus: rows[0].policy_status, accountStatus: rows[0].account_status, accountMode: rows[0].account_mode, accountCurrency: rows[0].account_currency };
  }

  /** Heartbeat rows have their own short transaction and process-instance key.
   * They never acquire the settlement checkpoint or append ledger material. */
  async startWorkerHeartbeat(policyId: string, workerId: string, processInstanceId: string, expectedOwnerId?: string, expectedTarget?: { readonly accountId: string; readonly initialCapitalMinor: bigint }): Promise<void> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(workerId) || !isProcessInstanceUuid(processInstanceId)) throw new Error("PAPER_WORKER_HEARTBEAT_ID_INVALID");
    if (expectedTarget) {
      await this.client.begin(async tx => {
        const policies = await tx<{ policy_json: unknown; status: string; policy_version: string; financial_account_id: string; state_json: unknown; last_run_id: string | null }[]>`
          select policy_json, status, policy_version, financial_account_id, state_json, last_run_id
          from public.standing_paper_policies where policy_id=${policyId} for update
        `;
        const stored = policies[0];
        if (!stored) throw new Error("PAPER_WORKER_TARGET_NOT_FOUND");
        const policy = parsePolicy(stored.policy_json);
        if (policy.policyId !== policyId || policy.financialAccountId !== stored.financial_account_id || policy.status !== stored.status || policy.version !== stored.policy_version || policy.mode !== "PAPER_ONLY") throw new Error("PAPER_WORKER_POLICY_INVALID");
        if (stored.status !== "ACTIVE") throw new Error("PAPER_WORKER_POLICY_NOT_ACTIVE");
        if (stored.financial_account_id !== expectedTarget.accountId) throw new Error("PAPER_WORKER_ACCOUNT_MISMATCH");
        const accounts = await tx<{ owner_id: string; status: string; mode: string; base_currency_code: string }[]>`
          select owner_id, status, mode, base_currency_code from public.financial_accounts where id=${expectedTarget.accountId} for update
        `;
        const account = accounts[0];
        if (!account || account.owner_id !== expectedOwnerId) throw new Error("PAPER_WORKER_ACCOUNT_OWNER_MISMATCH");
        if (account.status !== "ACTIVE" || account.mode !== "PAPER" || account.base_currency_code !== "NOK") throw new Error("PAPER_WORKER_ACCOUNT_NOT_RUNNABLE");
        if (!policy.allowedInstrumentIds.length || policy.allowedInstrumentIds.some(id => !FIXTURE_ASSETS.some(asset => asset.assetId === id))) throw new Error("PAPER_WORKER_INSTRUMENT_SCOPE_INVALID");
        if (expectedTarget.initialCapitalMinor <= 0n) throw new Error("PAPER_WORKER_INITIAL_CAPITAL_INVALID");
        if (expectedTarget.initialCapitalMinor > policy.capitalBudgetMinor) throw new Error("PAPER_WORKER_INITIAL_CAPITAL_EXCEEDS_BUDGET");
        const state = parseState(stored.state_json, expectedTarget.accountId);
        await this.assertLedgerCheckpointMatches(tx, expectedTarget.accountId, state, stored.last_run_id);
        const inserted = await tx<{ policy_id: string }[]>`
          insert into public.standing_paper_worker_heartbeats
          (policy_id, financial_account_id, worker_id, process_instance_id, status, started_at, heartbeat_at, ended_at, exit_reason)
          values (${policyId}, ${expectedTarget.accountId}, ${workerId}, ${processInstanceId}, 'RUNNING', now(), now(), null, null)
          returning policy_id
        `;
        if (!inserted[0]) throw new Error("PAPER_WORKER_HEARTBEAT_POLICY_NOT_RUNNABLE");
      });
      return;
    }
    const rows = await this.client<{ policy_id: string }[]>`
      insert into public.standing_paper_worker_heartbeats
        (policy_id, financial_account_id, worker_id, process_instance_id, status)
      select p.policy_id, p.financial_account_id, ${workerId}, ${processInstanceId}::uuid,
        case when p.status = 'PAUSED' then 'WAITING_PAUSED' else 'RUNNING' end
      from public.standing_paper_policies p
      join public.financial_accounts a on a.id = p.financial_account_id
      where p.policy_id = ${policyId} and p.status in ('ACTIVE', 'PAUSED', 'STOPPED')
        and a.status = 'ACTIVE' and a.mode = 'PAPER' and a.base_currency_code = 'NOK'
        and (${expectedOwnerId ?? null}::uuid is null or a.owner_id = ${expectedOwnerId ?? null}::uuid)
      returning policy_id
    `;
    if (!rows[0]) throw new Error("PAPER_WORKER_HEARTBEAT_POLICY_NOT_RUNNABLE");
  }

  async refreshWorkerHeartbeat(policyId: string, workerId: string, processInstanceId: string, status: "RUNNING" | "WAITING_PAUSED" | "WAITING_INTERVAL"): Promise<void> {
    const rows = await this.client<{ policy_id: string }[]>`
      update public.standing_paper_worker_heartbeats
      set status = ${status}, heartbeat_at = clock_timestamp()
      where policy_id = ${policyId} and worker_id = ${workerId} and process_instance_id = ${processInstanceId}::uuid and ended_at is null
      returning policy_id
    `;
    if (!rows[0]) throw new Error("PAPER_WORKER_HEARTBEAT_NOT_ACTIVE");
  }

  async endWorkerHeartbeat(policyId: string, workerId: string, processInstanceId: string, reason: "COMPLETED" | "STOPPED" | "FAILED"): Promise<void> {
    const rows = await this.client<{ policy_id: string }[]>`
      update public.standing_paper_worker_heartbeats
      set status = 'ENDED', exit_reason = ${reason}, heartbeat_at = clock_timestamp(), ended_at = clock_timestamp()
      where policy_id = ${policyId} and worker_id = ${workerId} and process_instance_id = ${processInstanceId}::uuid and ended_at is null
      returning policy_id
    `;
    if (!rows[0]) throw new Error("PAPER_WORKER_HEARTBEAT_NOT_ACTIVE");
  }

  async getPolicy(policyId: string): Promise<StandingPaperPolicy | null> {
    const rows = await this.client<{ policy_json: unknown }[]>`select policy_json from public.standing_paper_policies where policy_id = ${policyId}`;
    return rows[0] ? structuredClone(parsePolicy(rows[0].policy_json)) : null;
  }

  /** Owner-scoped, repeatable-read status projection with database-timed,
   * per-process worker evidence. Missing rows remain UNKNOWN; old full rounds
   * are not treated as heartbeat evidence. */
  async loadOwnedStatus(actorId: string): Promise<StandingPaperStatusReadModel> {
    return this.client.begin(async tx => {
      await tx`set transaction isolation level repeatable read, read only`;
      await tx`set local role authenticated`;
      await tx`select set_config('request.jwt.claim.sub', ${actorId}, true)`;
      const rows = await tx<{
        policy_id: string; financial_account_id: string; policy_version: string; status: string;
        policy_json: unknown; state_json: unknown; last_run_id: string | null;
      }[]>`
        select p.policy_id, p.financial_account_id, p.policy_version, p.status,
          p.policy_json, p.state_json, p.last_run_id
        from public.financial_accounts a
        join public.standing_paper_policies p on p.financial_account_id = a.id
        where a.owner_id = ${actorId} and a.mode = 'PAPER'
        order by p.updated_at desc, p.policy_id asc limit 20
      `;
      if (!rows.length) return projectStandingPaperStatusReadModel([]);

      const runIds = rows.flatMap(row => row.last_run_id ? [row.last_run_id] : []);
      const runRows = runIds.length ? await tx<{
        id: string; policy_id: string; financial_account_id: string; result_json: unknown; created_at: Date;
      }[]>`select id, policy_id, financial_account_id, result_json, created_at from public.standing_paper_runs where id in ${tx(runIds)}` : [];
      const policyIds = rows.map(row => row.policy_id);
      // Aggregate every owned policy heartbeat in this repeatable-read snapshot;
      // the separate ranked query below is intentionally only a detail page.
      const heartbeatSummaries = await tx<{
        policy_id: string; instance_count: number; has_running: boolean; has_waiting_paused: boolean;
        has_waiting_interval: boolean; has_stale: boolean; has_account_mismatch: boolean;
      }[]>`
        select h.policy_id, count(*)::int as instance_count,
          coalesce(bool_or(h.status = 'RUNNING' and h.heartbeat_at >= transaction_timestamp() - interval '90 seconds'), false) as has_running,
          coalesce(bool_or(h.status = 'WAITING_PAUSED' and h.heartbeat_at >= transaction_timestamp() - interval '90 seconds'), false) as has_waiting_paused,
          coalesce(bool_or(h.status = 'WAITING_INTERVAL' and h.heartbeat_at >= transaction_timestamp() - interval '90 seconds'), false) as has_waiting_interval,
          coalesce(bool_or(h.status <> 'ENDED' and h.heartbeat_at < transaction_timestamp() - interval '90 seconds'), false) as has_stale,
          coalesce(bool_or(h.financial_account_id <> p.financial_account_id), false) as has_account_mismatch
        from public.standing_paper_worker_heartbeats h
        join public.standing_paper_policies p on p.policy_id = h.policy_id
        where h.policy_id in ${tx(policyIds)}
        group by h.policy_id
      `;
      const heartbeatRows = await tx<{
        policy_id: string; financial_account_id: string; worker_id: string; process_instance_id: string; status: string; heartbeat_at: Date;
        is_stale: boolean;
      }[]>`
        with ranked as (
          select policy_id, financial_account_id, worker_id, process_instance_id::text as process_instance_id, status, heartbeat_at,
            row_number() over (partition by policy_id order by heartbeat_at desc, worker_id asc, process_instance_id asc) as policy_rank
          from public.standing_paper_worker_heartbeats
          where policy_id in ${tx(policyIds)}
        )
        select policy_id, financial_account_id, worker_id, process_instance_id, status, heartbeat_at,
          (status <> 'ENDED' and heartbeat_at < transaction_timestamp() - interval '90 seconds') as is_stale
        from ranked where policy_rank <= 20
        order by policy_id asc, heartbeat_at desc, worker_id asc, process_instance_id asc
      `;
      const decisionRows = await tx<{
        policy_id: string; financial_account_id: string; order_id: string; input_hash: string;
        decision_json: unknown; run_id: string; created_at: Date;
      }[]>`
        with ranked as (
          select d.policy_id, d.financial_account_id, d.order_id, d.input_hash, d.decision_json, d.run_id, d.created_at,
            row_number() over (partition by d.policy_id order by r.created_at desc, d.order_id asc) as policy_rank
          from public.standing_paper_decisions d
          join public.standing_paper_runs r on r.id = d.run_id
          where d.policy_id in ${tx(policyIds)}
        )
        select policy_id, financial_account_id, order_id, input_hash, decision_json, run_id, created_at
        from ranked where policy_rank <= 20
        order by policy_id asc, policy_rank asc
      `;
      const fillRows = await tx<{
        policy_id: string; financial_account_id: string; fill_id: string; order_id: string;
        execution_json: unknown; acquisition_json: unknown; run_id: string; created_at: Date;
      }[]>`
        with ranked as (
          select f.policy_id, f.financial_account_id, f.fill_id, f.order_id, f.execution_json,
            f.acquisition_json, f.run_id, f.created_at,
            row_number() over (partition by f.policy_id order by r.created_at desc, f.fill_id asc) as policy_rank
          from public.standing_paper_fills f
          join public.standing_paper_runs r on r.id = f.run_id
          where f.policy_id in ${tx(policyIds)}
        )
        select policy_id, financial_account_id, fill_id, order_id, execution_json, acquisition_json, run_id, created_at
        from ranked where policy_rank <= 20
        order by policy_id asc, policy_rank asc
      `;
      const cards: StandingPaperPolicyStatusCard[] = [];
      for (const row of rows) {
        try {
          const policy = parsePolicy(row.policy_json);
          if (policy.policyId !== row.policy_id || policy.financialAccountId !== row.financial_account_id || policy.version !== row.policy_version || policy.status !== row.status) throw new Error("PAPER_POLICY_STATE_CORRUPT");
          const state = parseState(row.state_json, row.financial_account_id);
          await this.assertLedgerCheckpointMatches(tx, row.financial_account_id, state, row.last_run_id);
          const run = runRows.find(item => item.id === row.last_run_id);
          if (row.last_run_id && (!run || run.policy_id !== row.policy_id || run.financial_account_id !== row.financial_account_id)) throw new Error("PAPER_CHECKPOINT_INVALID");
          if (!row.last_run_id && (state.lastProcessedAt !== null || state.ledger.length || state.acquisitions.length)) throw new Error("PAPER_CHECKPOINT_INVALID");
          const result = run ? decode(typeof run.result_json === "string" ? JSON.parse(run.result_json) as unknown : run.result_json) : null;
          const valuation = run ? validateSavedResult(result, state, row.financial_account_id) : null;
          const decisions = decisionRows.filter(item => item.policy_id === row.policy_id).slice(0, 20).map(item => validateDecisionRow(item, policy.policyId, row.financial_account_id));
          const fills = fillRows.filter(item => item.policy_id === row.policy_id).slice(0, 20).map(item => validateFillRow(item, policy.policyId, row.financial_account_id));
          if (!run && (decisions.length || fills.length)) throw new Error("PAPER_MATERIAL_INVALID");
          const workers: StandingPaperWorkerInstanceStatusRecord[] = heartbeatRows.filter(item => item.policy_id === row.policy_id).map(item => {
            if (item.financial_account_id !== row.financial_account_id || !/^[A-Za-z0-9_-]{1,64}$/.test(item.worker_id) || !isProcessInstanceUuid(item.process_instance_id) || !["RUNNING", "WAITING_PAUSED", "WAITING_INTERVAL", "ENDED"].includes(item.status)) throw new Error("PAPER_WORKER_HEARTBEAT_INVALID");
            const status: StandingPaperWorkerInstanceStatus = item.is_stale ? "STALE" : item.status as StandingPaperWorkerInstanceStatus;
            return { workerId: item.worker_id, processInstanceId: item.process_instance_id, status, lastHeartbeatAt: validDate(item.heartbeat_at).toISOString() };
          });
          const summary = heartbeatSummaries.find(item => item.policy_id === row.policy_id);
          if (summary?.has_account_mismatch) throw new Error("PAPER_WORKER_HEARTBEAT_INVALID");
          const workerSummary = !summary ? { status: "UNKNOWN" as const, count: 0, truncated: false }
            : { status: summary.has_running ? "RUNNING" as const
              : summary.has_waiting_paused ? "WAITING_PAUSED" as const
                : summary.has_waiting_interval ? "WAITING_INTERVAL" as const
                  : summary.has_stale ? "STALE" as const : "ENDED" as const,
              count: summary.instance_count, truncated: summary.instance_count > 20 };
          cards.push(projectStandingPaperStatusCard({
            policy, state, run: run && valuation ? { id: run.id, createdAt: validDate(run.created_at).toISOString(), result: result as BacktestResult, valuation } : null,
            decisions, fills, workers, workerSummary,
          }));
        } catch {
          cards.push(invalidCard(row.policy_id));
        }
      }
      return projectStandingPaperStatusReadModel(cards);
    });
  }

  /** Select the next durable round ordinal for one worker identity. Concurrent
   * processes may observe the same ordinal; run() serializes on the policy row
   * and the stable idempotency key converges identical attempts. */
  async getNextWorkerRound(policyId: string, workerId: string): Promise<number> {
    const prefix = `standing-paper-worker/v1/${workerId}/round/`;
    const rows = await this.client<{ idempotency_key: string }[]>`
      select idempotency_key from public.standing_paper_runs
      where policy_id = ${policyId} and left(idempotency_key, ${prefix.length}) = ${prefix}
    `;
    let next = 0;
    for (const row of rows) {
      const suffix = row.idempotency_key.slice(prefix.length);
      if (!/^\d{12}$/.test(suffix)) throw new Error("PAPER_WORKER_ROUND_ID_INVALID");
      const ordinal = Number(suffix);
      if (!Number.isSafeInteger(ordinal) || ordinal >= 100_000_000) throw new Error("PAPER_WORKER_ROUND_LIMIT_REACHED");
      next = Math.max(next, ordinal + 1);
    }
    return next;
  }

  /** Hosted process instances share one logical policy timeline even if an
   * operator rotates worker IDs. The policy lock in run() serializes a shared
   * ordinal and its timestamp, while each worker ID remains in the idempotency
   * key and heartbeat identity. */
  async getNextPolicyWorkerRound(policyId: string): Promise<number> {
    const rows = await this.client<{ idempotency_key: string }[]>`
      select idempotency_key from public.standing_paper_runs
      where policy_id = ${policyId} and idempotency_key like 'standing-paper-worker/v1/%/round/%'
    `;
    let next = 0;
    for (const row of rows) {
      const match = /^standing-paper-worker\/v1\/[A-Za-z0-9_-]{1,64}\/round\/(\d{12})$/.exec(row.idempotency_key);
      if (!match) throw new Error("PAPER_WORKER_ROUND_ID_INVALID");
      const ordinal = Number(match[1]);
      if (!Number.isSafeInteger(ordinal) || ordinal >= 100_000_000) throw new Error("PAPER_WORKER_ROUND_LIMIT_REACHED");
      next = Math.max(next, ordinal + 1);
    }
    return next;
  }

  private async assertLedgerCheckpointMatches(tx: TransactionSql, accountId: string, state: DeterministicBacktestState, lastRunId: string | null): Promise<void> {
    const entries = await tx<{ id: string; ledger_transaction_id: string; financial_account_id: string; code: string; commodity_kind: "MONEY" | "ASSET"; currency: string | null; asset_id: string | null; direction: "DEBIT" | "CREDIT"; amount_atoms: string; occurred_at: Date; recorded_at: Date }[]>`
      select le.id, lt.id as ledger_transaction_id, lt.financial_account_id, la.code, la.commodity_kind, la.commodity_currency_code as currency, la.commodity_asset_id as asset_id, le.direction, le.amount_atoms::text, lt.occurred_at, le.created_at as recorded_at
      from public.ledger_entries le join public.ledger_transactions lt on lt.id=le.ledger_transaction_id join public.ledger_accounts la on la.id=le.ledger_account_id
      where lt.financial_account_id=${accountId} order by le.id`;
    const transactions = await tx<{ id: string }[]>`select id from public.ledger_transactions where financial_account_id=${accountId} order by id`;
    const actualLedger = entries.map(row => ({ entryId: row.id, transactionId: row.ledger_transaction_id, financialAccountId: row.financial_account_id, code: row.code, commodityKind: row.commodity_kind, currency: row.currency, assetId: row.asset_id, direction: row.direction, amountAtoms: BigInt(row.amount_atoms), occurredAt: row.occurred_at, recordedAt: row.recorded_at }));
    const expectedTransactionIds = [...new Set(state.ledger.map(item => item.transactionId))].sort();
    const byEntryId = <T extends { entryId: string }>(left: T, right: T) => left.entryId < right.entryId ? -1 : left.entryId > right.entryId ? 1 : 0;
    const expectedLedger = [...state.ledger].sort(byEntryId);
    if (sha256(actualLedger) !== sha256(expectedLedger) || sha256(transactions.map(row => row.id)) !== sha256(expectedTransactionIds)) {
      throw new Error("PAPER_LEDGER_CHECKPOINT_MISMATCH");
    }
    const actualAcquisitions = await tx<{ acquisition_json: unknown }[]>`select acquisition_json from public.standing_paper_fills where financial_account_id=${accountId} order by fill_id`;
    const acquisitions = actualAcquisitions.map(row => decode(typeof row.acquisition_json === "string" ? JSON.parse(row.acquisition_json) : row.acquisition_json));
    if (sha256(acquisitions) !== sha256([...state.acquisitions].sort((a,b) => a.fillId.localeCompare(b.fillId)))) throw new Error("PAPER_ACQUISITION_CHECKPOINT_MISMATCH");
    const capital = actualLedger.filter(item => item.code === "VIRTUAL_CONTRIBUTED_CAPITAL").reduce((sum, item) => sum + (item.direction === "CREDIT" ? item.amountAtoms : -item.amountAtoms), 0n);
    if (capital !== state.netContributionsMinor || state.committedCapitalMinor !== state.acquisitions.reduce((sum, item) => sum + item.grossMinor + item.feeMinor, 0n)) throw new Error("PAPER_CAPITAL_CHECKPOINT_MISMATCH");
    if (lastRunId) {
      const run = await tx<{ result_json: unknown }[]>`select result_json from public.standing_paper_runs where id=${lastRunId}`;
      const result = run[0] && decode(typeof run[0].result_json === "string" ? JSON.parse(run[0].result_json) : run[0].result_json) as BacktestResult | undefined;
      if (!result || sha256(result.persistentState) !== sha256(state)) throw new Error("PAPER_CHECKPOINT_NOT_LAST_RUN_RESULT");
    } else if (state.ledger.length || state.acquisitions.length || state.netContributionsMinor !== 0n || state.adjustedEquityHighWaterMinor !== 0n || state.committedCapitalMinor !== 0n || state.lastProcessedAt !== null) {
      throw new Error("PAPER_CHECKPOINT_WITHOUT_RUN");
    }
  }

  async create(policy: StandingPaperPolicy): Promise<void> {
    assertValidPaperPolicy(policy);
    if (policy.status !== "DRAFT") throw new Error("PAPER_POLICY_MUST_START_DRAFT");
    await this.client.begin(async tx => {
      const accounts = await tx<{ id: string }[]>`select id from public.financial_accounts where id = ${policy.financialAccountId} and mode = 'PAPER' and status = 'ACTIVE' and base_currency_code = 'NOK' for update`;
      if (!accounts[0]) throw new Error("STANDING_PAPER_REQUIRES_ACTIVE_PAPER_NOK_ACCOUNT");
      const existingLedger = await tx<{ id: string }[]>`select id from public.ledger_transactions where financial_account_id = ${policy.financialAccountId} limit 1`;
      if (existingLedger[0]) throw new Error("PAPER_ACCOUNT_NOT_EMPTY_AT_POLICY_CREATION");
      await tx`insert into public.standing_paper_policies (policy_id, financial_account_id, policy_version, status, policy_json) values (${policy.policyId}, ${policy.financialAccountId}, ${policy.version}, ${policy.status}, ${tx.json(json(policy))})`;
      await tx`insert into public.standing_paper_policy_transitions (policy_id, financial_account_id, policy_version, action, from_status, to_status, input_hash) values (${policy.policyId}, ${policy.financialAccountId}, ${policy.version}, 'INITIALIZE', null, 'DRAFT', ${sha256(policy)})`;
    });
  }

  /** Lists only the owner's currently eligible, unused, ledger-empty PAPER accounts. */
  async listOwnedEmptyPaperAccounts(actorId: string): Promise<readonly { financialAccountId: string }[]> {
    if (!actorId.trim()) throw new Error("PAPER_POLICY_NOT_FOUND");
    const rows = await this.client<{ id: string }[]>`
      select a.id::text as id
      from public.financial_accounts a
      where a.owner_id = ${actorId} and a.mode = 'PAPER' and a.status = 'ACTIVE' and a.base_currency_code = 'NOK'
        and not exists (select 1 from public.ledger_transactions lt where lt.financial_account_id = a.id)
        and not exists (select 1 from public.standing_paper_policies p where p.financial_account_id = a.id)
      order by a.id
    `;
    return rows.map(row => ({ financialAccountId: row.id }));
  }

  /** Creates a DRAFT under the shared account lock after checking ownership,
   * account eligibility, an empty ledger, and absence of an existing policy. */
  async createOwnedDraft(actorId: string, policy: StandingPaperPolicy): Promise<void> {
    if (!actorId.trim()) throw new Error("PAPER_ACCOUNT_NOT_FOUND");
    assertValidPaperPolicy(policy);
    if (policy.status !== "DRAFT") throw new Error("PAPER_POLICY_MUST_START_DRAFT");
    await this.client.begin(async tx => {
      const accounts = await tx<{ id: string; owner_id: string; status: string; mode: string; base_currency_code: string }[]>`
        select id::text as id, owner_id, status, mode, base_currency_code
        from public.financial_accounts where id = ${policy.financialAccountId} for update
      `;
      const account = accounts[0];
      if (!account || account.owner_id !== actorId) throw new Error("PAPER_ACCOUNT_NOT_FOUND");
      if (account.status !== "ACTIVE" || account.mode !== "PAPER" || account.base_currency_code !== "NOK") throw new Error("STANDING_PAPER_ACCOUNT_NOT_RUNNABLE");
      const existingLedger = await tx<{ id: string }[]>`select id from public.ledger_transactions where financial_account_id = ${policy.financialAccountId} limit 1`;
      if (existingLedger[0]) throw new Error("PAPER_ACCOUNT_NOT_EMPTY_AT_POLICY_CREATION");
      const existingPolicy = await tx<{ policy_id: string }[]>`select policy_id from public.standing_paper_policies where financial_account_id = ${policy.financialAccountId} limit 1`;
      if (existingPolicy[0]) throw new Error("PAPER_ACCOUNT_ALREADY_HAS_POLICY");
      await tx`insert into public.standing_paper_policies (policy_id, financial_account_id, policy_version, status, policy_json) values (${policy.policyId}, ${policy.financialAccountId}, ${policy.version}, 'DRAFT', ${tx.json(json(policy))})`;
      await tx`insert into public.standing_paper_policy_transitions (policy_id, financial_account_id, policy_version, action, from_status, to_status, input_hash) values (${policy.policyId}, ${policy.financialAccountId}, ${policy.version}, 'INITIALIZE', null, 'DRAFT', ${sha256(policy)})`;
    });
  }

  async transition(policyId: string, action: "ACTIVATE" | "PAUSE" | "STOP"): Promise<StandingPaperPolicy> {
    assertStandingPaperPolicyTransitionAction(action);
    return this.transitionTransaction(null, policyId, action);
  }

  /** Owner-bound dashboard transition. Policy and account are locked in the
   * same order as run(), and ownership plus expected status are checked before
   * either policy state or transition history is written. */
  async transitionOwned(
    actorId: string,
    policyId: string,
    action: "PAUSE" | "RESUME" | "STOP",
    expectedStatus: StandingPaperPolicy["status"],
  ): Promise<StandingPaperPolicy> {
    if (action !== "PAUSE" && action !== "RESUME" && action !== "STOP") throw new Error("PAPER_POLICY_ACTION_INVALID");
    if (!actorId.trim() || !policyId.trim()) throw new Error("PAPER_POLICY_NOT_FOUND");
    if (action === "PAUSE" && expectedStatus !== "ACTIVE" || action === "RESUME" && expectedStatus !== "PAUSED" ||
      action === "STOP" && !["DRAFT", "ACTIVE", "PAUSED"].includes(expectedStatus)) throw new Error("PAPER_POLICY_TRANSITION_INVALID");
    return this.transitionTransaction(actorId, policyId, action === "RESUME" ? "ACTIVATE" : action, expectedStatus);
  }

  /** Explicit first activation is bound to the exact DRAFT material reviewed by the owner. */
  async activateOwnedDraft(actorId: string, policyId: string, expectedConfirmationHash: string): Promise<StandingPaperPolicy> {
    if (!actorId.trim() || !policyId.trim()) throw new Error("PAPER_POLICY_NOT_FOUND");
    if (!/^[0-9a-f]{64}$/.test(expectedConfirmationHash)) throw new Error("PAPER_POLICY_CONFIRMATION_INVALID");
    return this.transitionTransaction(actorId, policyId, "ACTIVATE", "DRAFT", expectedConfirmationHash);
  }

  private async transitionTransaction(
    actorId: string | null,
    policyId: string,
    action: "ACTIVATE" | "PAUSE" | "STOP",
    expectedStatus?: StandingPaperPolicy["status"],
    expectedConfirmationHash?: string,
  ): Promise<StandingPaperPolicy> {
    return this.client.begin(async tx => {
      const rows = await tx<StoredPolicy[]>`select policy_json, status, financial_account_id from public.standing_paper_policies where policy_id = ${policyId} for update`;
      if (!rows[0]) throw new Error("PAPER_POLICY_NOT_FOUND");
      const current = parsePolicy(rows[0].policy_json);
      if (current.financialAccountId !== rows[0].financial_account_id || current.status !== rows[0].status) throw new Error("PAPER_POLICY_STATE_CORRUPT");
      const accounts = await tx<{ owner_id: string; status: string; mode: string; base_currency_code: string }[]>`select owner_id, status, mode, base_currency_code from public.financial_accounts where id = ${current.financialAccountId} for update`;
      const account = accounts[0];
      if (actorId !== null && (!account || account.owner_id !== actorId)) throw new Error("PAPER_POLICY_NOT_FOUND");
      if (!account || account.status !== "ACTIVE" || account.mode !== "PAPER" || account.base_currency_code !== "NOK") throw new Error("STANDING_PAPER_ACCOUNT_NOT_RUNNABLE");
      if (expectedStatus !== undefined && current.status !== expectedStatus) throw new Error("PAPER_POLICY_STALE_STATUS");
      if (actorId !== null && action === "ACTIVATE" && expectedStatus === "DRAFT" && (!expectedConfirmationHash || standingPaperActivationConfirmationHash(current) !== expectedConfirmationHash)) throw new Error("PAPER_POLICY_STALE_CONFIRMATION");
      const next = transitionPaperPolicy(current, action);
      await tx`update public.standing_paper_policies set status = ${next.status}, policy_json = ${tx.json(json(next))}, updated_at = now() where policy_id = ${policyId}`;
      await tx`insert into public.standing_paper_policy_transitions (policy_id, financial_account_id, policy_version, action, from_status, to_status, input_hash) values (${policyId}, ${current.financialAccountId}, ${current.version}, ${action}, ${current.status}, ${next.status}, ${sha256({ current, action, next })})`;
      return structuredClone(next);
    });
  }

  async run(policyId: string, config: Omit<BacktestRunConfig, "standingPaperPolicy">, prices: readonly FixturePriceObservation[], idempotencyKey: string, options: { readonly initialContribution?: ContributionEvent; readonly expectedOwnerId?: string } = {}): Promise<BacktestResult> {
    const baseSnapshot = structuredClone({ config, prices });
    if (!idempotencyKey.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const seed = options.initialContribution;
    if (seed && (seed.currency !== "NOK" || !seed.eventId.trim() || !/^\d+$/.test(seed.amountMinor) || BigInt(seed.amountMinor) <= 0n)) throw new Error("PAPER_INITIAL_CAPITAL_INVALID");
    return this.client.begin(async tx => {
      const rows = await tx<StoredPolicy[]>`select policy_json, status, financial_account_id from public.standing_paper_policies where policy_id = ${policyId} for update`;
      if (!rows[0]) throw new Error("PAPER_POLICY_NOT_FOUND");
      const policy = parsePolicy(rows[0].policy_json);
      if (policy.financialAccountId !== rows[0].financial_account_id || policy.status !== rows[0].status) throw new Error("PAPER_POLICY_STATE_CORRUPT");
      if (baseSnapshot.config.financialAccountId && baseSnapshot.config.financialAccountId !== policy.financialAccountId) throw new Error("PAPER_ACCOUNT_MISMATCH");
      if (seed && seed.amountMinor && BigInt(seed.amountMinor) > policy.capitalBudgetMinor) throw new Error("PAPER_INITIAL_CAPITAL_EXCEEDS_BUDGET");
      let seedAlreadyPosted = false;
      if (seed) {
        // The policy row lock serializes this binding check with seed creation
        // and all rounds for the policy, including replay of a later round.
        const seedRows = await tx<{ input_hash: string }[]>`
          select input_hash from public.standing_paper_contributions
          where financial_account_id = ${policy.financialAccountId} and policy_id = ${policyId} and event_id = ${seed.eventId}
        `;
        if (seedRows[0]) {
          if (seedRows[0].input_hash !== sha256(seed)) throw new Error("PAPER_INITIAL_CAPITAL_CONFLICT");
          seedAlreadyPosted = true;
        }
      }
      const existing = await tx<{ input_hash: string; result_json: unknown }[]>`select input_hash, result_json from public.standing_paper_runs where financial_account_id = ${policy.financialAccountId} and policy_id = ${policyId} and idempotency_key = ${idempotencyKey}`;
      if (existing[0]) {
        const saved = decode(typeof existing[0].result_json === "string" ? JSON.parse(existing[0].result_json) : existing[0].result_json) as BacktestResult;
        const savedSeedApplied = Boolean(seed && saved.config.contributionEvents.some(event => event.eventId === seed.eventId));
        if (seed && !seedAlreadyPosted) throw new Error("PAPER_INITIAL_CAPITAL_BINDING_MISSING");
        const replaySnapshot = savedSeedApplied && seed
          ? { ...baseSnapshot, config: { ...baseSnapshot.config, contributionEvents: [...baseSnapshot.config.contributionEvents, seed] } }
          : baseSnapshot;
        const requestHash = sha256({ policy, ...replaySnapshot });
        if (existing[0].input_hash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT");
        return saved;
      }
      if (policy.status !== "ACTIVE") throw new Error("POLICY_NOT_ACTIVE");

      // Lock order is policy row, then FinancialAccount row, matching policy
      // transitions and the account lock used by shared ledger writers. Read
      // eligibility from the locked row so a concurrent close/mode/currency
      // change cannot pass a stale join predicate and then receive writes.
      const lockedAccounts = await tx<{ owner_id: string; status: string; mode: string; base_currency_code: string }[]>`select owner_id, status, mode, base_currency_code from public.financial_accounts where id = ${policy.financialAccountId} for update`;
      const lockedAccount = lockedAccounts[0];
      if (options.expectedOwnerId && lockedAccount?.owner_id !== options.expectedOwnerId) throw new Error("PAPER_WORKER_ACCOUNT_OWNER_MISMATCH");
      if (!lockedAccount || lockedAccount.status !== "ACTIVE" || lockedAccount.mode !== "PAPER" || lockedAccount.base_currency_code !== "NOK") throw new Error("STANDING_PAPER_ACCOUNT_NOT_RUNNABLE");

      const stateRows = await tx<{ state_json: unknown; last_run_id: string | null }[]>`select state_json, last_run_id from public.standing_paper_policies where policy_id = ${policyId}`;
      const initial = parseState(stateRows[0]!.state_json, policy.financialAccountId);
      await this.assertLedgerCheckpointMatches(tx, policy.financialAccountId, initial, stateRows[0]!.last_run_id);
      if (seed) {
        if (!seedAlreadyPosted && (stateRows[0]!.last_run_id !== null || initial.lastProcessedAt !== null || initial.ledger.length !== 0 || initial.acquisitions.length !== 0 || initial.netContributionsMinor !== 0n || initial.committedCapitalMinor !== 0n)) {
          throw new Error("PAPER_INITIAL_CAPITAL_REQUIRES_EMPTY_CHECKPOINT");
        }
      }
      const snapshot = seed && !seedAlreadyPosted
        ? { ...baseSnapshot, config: { ...baseSnapshot.config, contributionEvents: [...baseSnapshot.config.contributionEvents, seed] } }
        : baseSnapshot;
      const requestHash = sha256({ policy, ...snapshot });
      const contributionIds = snapshot.config.contributionEvents.map(event => event.eventId);
      if (new Set(contributionIds).size !== contributionIds.length) throw new Error("DUPLICATE_PAPER_CONTRIBUTION_EVENT");
      if (contributionIds.length) {
        const duplicate = await tx<{ event_id: string }[]>`select event_id from public.standing_paper_contributions where financial_account_id = ${policy.financialAccountId} and policy_id = ${policyId} and event_id in ${tx(contributionIds)}`;
        if (duplicate[0]) throw new Error("PAPER_CONTRIBUTION_ALREADY_PROCESSED");
      }
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
          const evidence = result.persistentState.ledger.find(item => item.transactionId === journal.id && item.code === entry.ledgerAccount.code && item.direction === entry.direction && item.amountAtoms === entry.amountAtoms);
          if (!evidence) throw new Error("PAPER_LEDGER_EVIDENCE_MISSING");
          await tx`insert into public.ledger_entries (id, ledger_transaction_id, ledger_account_id, direction, amount_atoms, created_at) values (${evidence.entryId}, ${journal.id}, ${accountId}, ${entry.direction}, ${entry.amountAtoms.toString()}::numeric, ${evidence.recordedAt})`;
        }
        await tx`insert into public.audit_events (financial_account_id, actor_id, command_id, command_type, idempotency_key, outcome, policy_versions, ledger_transaction_id, input_hash, output_hash, occurred_at) values (${policy.financialAccountId}, ${lockedAccount.owner_id}, ${commandId}, ${commandType}, ${commandKey}, 'SUCCEEDED', ${tx.json(json({ standingPaperPolicy: policy.version, execution: "m1-market-execution/v1", fee: "m1-fee/v1", rounding: "m1-rounding/v1" }))}, ${journal.id}, ${journalHash}, ${sha256({ ledgerTransactionId: journal.id, entries: journal.entries })}, ${journal.occurredAt})`;
      }
      for (const fill of result.executions) {
        const acquisition = result.persistentState.acquisitions.find(item => item.fillId === fill.fillId);
        if (!acquisition) throw new Error("PAPER_FILL_LEDGER_LINK_MISSING");
        await tx`insert into public.standing_paper_fills (policy_id, financial_account_id, fill_id, order_id, ledger_transaction_id, execution_json, acquisition_json, run_id) values (${policyId}, ${policy.financialAccountId}, ${fill.fillId}, ${fill.proposalId}, ${acquisition.ledgerTransactionId}, ${tx.json(json(fill))}, ${tx.json(json(acquisition))}, ${runId})`;
      }
      await tx`update public.standing_paper_policies set state_json = ${tx.json(json(result.persistentState))}, last_run_id = ${runId}, updated_at = now() where policy_id = ${policyId}`;
      return result;
    });
  }

  async close(): Promise<void> { await this.client.end({ timeout: 5 }); }
}

let statusRepository: StandingPaperPolicyRepository | undefined;
export function getStandingPaperStatusRepository(): StandingPaperPolicyRepository | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  return statusRepository ??= new StandingPaperPolicyRepository(url);
}
