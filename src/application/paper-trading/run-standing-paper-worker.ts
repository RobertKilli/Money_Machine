import { randomUUID } from "node:crypto";
import type { BacktestResult, BacktestRunConfig } from "@/application/backtest/run-deterministic-backtest";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION, type FixturePriceObservation } from "@/domain/strategy/fixture-assets";
import type { StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
import type { StandingPaperExitPolicy } from "@/domain/risk/standing-paper-exit-policy";
import { PAPER_CYCLE_CONTRACT_VERSION } from "@/domain/risk/standing-paper-exit-policy";
import { StandingPaperPolicyRepository } from "@/infrastructure/postgres/standing-paper-policy-repository";

export type StandingPaperWorkerStatus = "RUNNING" | "WAITING_PAUSED" | "WAITING_INTERVAL" | "COMPLETED" | "STOPPED" | "FAILED";
export type StandingPaperWorkerResult = { status: "COMPLETED" | "STOPPED"; roundsCompleted: number; lastRoundIdentity: string | null };
export type StandingPaperWorkerOptions = {
  readonly policyId: string;
  readonly workerId: string;
  readonly maxRounds?: number;
  readonly signal?: AbortSignal;
  readonly pollIntervalMs?: number;
  readonly roundIntervalMs?: number;
  readonly expectedAccountId?: string;
  readonly expectedOwnerId?: string;
  readonly policyScopedRoundOrdinal?: boolean;
  /** Make one policy-scoped contribution once, then evaluate later rounds
   * against existing cash and holdings. Required for explicit cycle v2. */
  readonly initialCapitalMinor?: bigint;
  /** Explicit opt-in for the new local cycle contract. Hosted entrypoints do not set this. */
  readonly exitPolicy?: StandingPaperExitPolicy;
  readonly onStatus?: (status: StandingPaperWorkerStatus, code?: string) => void;
  readonly onRound?: (identity: string, result: BacktestResult) => void;
  /** Deterministic orchestration seams used by PostgreSQL integration tests. */
  readonly waitForPolicyChange?: (signal?: AbortSignal) => Promise<void>;
  readonly waitForRoundInterval?: (signal?: AbortSignal) => Promise<void>;
  readonly beforeRound?: (round: number, identity: string) => Promise<void>;
};

const roundKey = (workerId: string, round: number) => `standing-paper-worker/v1/${workerId}/round/${String(round).padStart(12, "0")}`;
const roundAt = (round: number) => new Date(Date.UTC(2026, 0, 1, 9, 0, 0) + round * 60_000);
const pricesForRound = (round: number, cycleMode = false): FixturePriceObservation[] => {
  const at = roundAt(round);
  const availableAt = new Date(at.getTime() - 60 * 60 * 1000);
  const cyclePriceBase = cycleMode ? 1_000_000n : 10_000n;
  const cycleMultiplierBps = cycleMode ? ([10_000n, 5_000n, 10_000n, 5_000n] as const)[round % 4]! : 10_000n;
  return FIXTURE_ASSETS.map((asset, index) => ({
    recordId: `standing-paper-worker-synthetic-${String(round).padStart(12, "0")}-${index + 1}`,
    assetId: asset.assetId,
    price: { currencyCode: "NOK", priceAtoms: BigInt(index + 1) * cyclePriceBase * cycleMultiplierBps / 10_000n, priceScale: 4 },
    observedAt: availableAt,
    availableAt,
    ingestedAt: new Date(availableAt.getTime() + 1_000),
    datasetVersion: FIXTURE_DATASET_VERSION,
  }));
};
const configForRound = (policy: StandingPaperPolicy, workerId: string, round: number, hostedSeeded: boolean, exitPolicy?: StandingPaperExitPolicy): Omit<BacktestRunConfig, "standingPaperPolicy"> => {
  const at = roundAt(round).toISOString();
  return {
    startAt: at,
    endAt: at,
    baseCurrency: "NOK",
    financialAccountId: policy.financialAccountId,
    contributionEvents: hostedSeeded ? [] : [{ eventId: `standing-paper-worker-${workerId}-contribution-${String(round).padStart(12, "0")}`, availableAt: at, amountMinor: "100000", currency: "NOK" }],
    ...(hostedSeeded || exitPolicy ? { strategyEvaluationTimestamps: [at] } : {}),
    valuationTimestamps: [],
    strategyVersion: "contribution-rebalancing/v1",
    riskPolicyVersion: "m1-risk-policy/v1",
    executionPolicyVersion: "m1-market-execution/v1",
    portfolioValuationVersion: "portfolio-valuation/v1",
    fifoCostBasisVersion: exitPolicy ? "fifo-cost-basis/v2" : "fifo-cost-basis/v1",
    ...(exitPolicy ? { paperCycleContractVersion: PAPER_CYCLE_CONTRACT_VERSION, standingPaperExitPolicy: exitPolicy } : {}),
    assetRegistryVersion: "fixture-asset-registry/v1",
    marketDatasetVersion: FIXTURE_DATASET_VERSION,
  };
};
const abortError = () => Object.assign(new Error("PAPER_WORKER_STOP_REQUESTED"), { code: "PAPER_WORKER_STOP_REQUESTED" });
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(abortError());
  const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
  function onAbort() { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); reject(abortError()); }
  signal?.addEventListener("abort", onAbort, { once: true });
});

/** One local worker instance. Durable round identity and all settlement remain
 * inside StandingPaperPolicyRepository's policy/account locks and transaction. */
export class StandingPaperWorker {
  private active = false;
  private started = false;
  private readonly processInstanceId = randomUUID();
  private readonly heartbeatStop = new AbortController();
  private heartbeatStatus: "RUNNING" | "WAITING_PAUSED" | "WAITING_INTERVAL" = "RUNNING";
  private heartbeatFailure: Error | null = null;
  private heartbeatTask: Promise<void> | null = null;
  constructor(private readonly repository: StandingPaperPolicyRepository, private readonly options: StandingPaperWorkerOptions) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(options.workerId)) throw new Error("PAPER_WORKER_ID_INVALID");
    if (!options.policyId.trim()) throw new Error("PAPER_WORKER_POLICY_ID_REQUIRED");
    if (options.expectedAccountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.expectedAccountId)) throw new Error("PAPER_WORKER_ACCOUNT_ID_INVALID");
    if (options.expectedOwnerId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.expectedOwnerId)) throw new Error("PAPER_WORKER_OWNER_ID_INVALID");
    if (options.maxRounds !== undefined && (!Number.isSafeInteger(options.maxRounds) || options.maxRounds < 1)) throw new Error("PAPER_WORKER_MAX_ROUNDS_INVALID");
    if (options.initialCapitalMinor !== undefined && options.initialCapitalMinor <= 0n) throw new Error("PAPER_WORKER_INITIAL_CAPITAL_INVALID");
    if (options.exitPolicy && options.initialCapitalMinor === undefined) throw new Error("PAPER_CYCLE_INITIAL_CAPITAL_REQUIRED");
    if (options.pollIntervalMs !== undefined && (!Number.isSafeInteger(options.pollIntervalMs) || options.pollIntervalMs < 10)) throw new Error("PAPER_WORKER_POLL_INTERVAL_INVALID");
    if (options.maxRounds === undefined && options.roundIntervalMs === undefined) throw new Error("PAPER_WORKER_ROUND_INTERVAL_REQUIRED");
    if (options.roundIntervalMs !== undefined && (!Number.isSafeInteger(options.roundIntervalMs) || options.roundIntervalMs < 1_000 || options.roundIntervalMs > 86_400_000)) throw new Error("PAPER_WORKER_ROUND_INTERVAL_INVALID");
  }

  private async status(value: StandingPaperWorkerStatus, code?: string) {
    if (value === "RUNNING" || value === "WAITING_PAUSED" || value === "WAITING_INTERVAL") {
      this.heartbeatStatus = value;
      await this.repository.refreshWorkerHeartbeat(this.options.policyId, this.options.workerId, this.processInstanceId, value);
    }
    this.options.onStatus?.(value, code);
  }

  async run(): Promise<StandingPaperWorkerResult> {
    if (this.active || this.started) throw new Error("PAPER_WORKER_ALREADY_RUNNING");
    this.active = true;
    this.started = true;
    let heartbeatStarted = false;
    let exitReason: "COMPLETED" | "STOPPED" | "FAILED" = "FAILED";
    try {
      await this.repository.startWorkerHeartbeat(
        this.options.policyId,
        this.options.workerId,
        this.processInstanceId,
        this.options.expectedOwnerId,
        this.options.initialCapitalMinor !== undefined && this.options.expectedAccountId
          ? { accountId: this.options.expectedAccountId, initialCapitalMinor: this.options.initialCapitalMinor }
          : undefined,
      );
      heartbeatStarted = true;
      this.heartbeatTask = this.renewHeartbeat();
      const result = await this.runLoop();
      exitReason = result.status;
      return result;
    } finally {
      this.heartbeatStop.abort();
      try { await this.heartbeatTask; } catch { /* The terminal update below is authoritative. */ }
      if (heartbeatStarted) await this.repository.endWorkerHeartbeat(this.options.policyId, this.options.workerId, this.processInstanceId, exitReason);
      this.active = false;
    }
  }

  private async renewHeartbeat(): Promise<void> {
    try {
      while (!this.heartbeatStop.signal.aborted) {
        await wait(30_000, this.heartbeatStop.signal);
        if (!this.heartbeatStop.signal.aborted) await this.repository.refreshWorkerHeartbeat(this.options.policyId, this.options.workerId, this.processInstanceId, this.heartbeatStatus);
      }
    } catch (error) {
      if ((error as { code?: string }).code !== "PAPER_WORKER_STOP_REQUESTED") this.heartbeatFailure = error instanceof Error ? error : new Error("PAPER_WORKER_HEARTBEAT_FAILED");
    }
  }

  private async runLoop(): Promise<StandingPaperWorkerResult> {
    let roundsCompleted = 0;
    let lastRoundIdentity: string | null = null;
    await this.status("RUNNING");
    try {
      while (this.options.maxRounds === undefined || roundsCompleted < this.options.maxRounds) {
        if (this.heartbeatFailure) throw new Error("PAPER_WORKER_HEARTBEAT_FAILED", { cause: this.heartbeatFailure });
        if (this.options.signal?.aborted) throw abortError();
        const state = await this.repository.getWorkerPolicyState(this.options.policyId);
        if (state.policyStatus === "STOPPED") {
          await this.status("STOPPED", "PAPER_POLICY_STOPPED");
          return { status: "STOPPED", roundsCompleted, lastRoundIdentity };
        }
        if (state.policyStatus === "PAUSED") {
          await this.status("WAITING_PAUSED", "PAPER_POLICY_PAUSED");
          if (this.options.waitForPolicyChange) await this.options.waitForPolicyChange(this.options.signal);
          else await wait(this.options.pollIntervalMs ?? 2_000, this.options.signal);
          await this.status("RUNNING");
          continue;
        }
        if (state.policyStatus !== "ACTIVE") throw new Error("PAPER_WORKER_POLICY_NOT_ACTIVE");
        if (state.accountStatus !== "ACTIVE" || state.accountMode !== "PAPER" || state.accountCurrency !== "NOK") throw new Error("STANDING_PAPER_ACCOUNT_NOT_RUNNABLE");

        const round = this.options.policyScopedRoundOrdinal
          ? await this.repository.getNextPolicyWorkerRound(this.options.policyId)
          : await this.repository.getNextWorkerRound(this.options.policyId, this.options.workerId);
        // Hosted workers must converge on one idempotency key for a shared
        // policy ordinal. The heartbeat still carries the actual worker ID.
        const identity = roundKey(this.options.policyScopedRoundOrdinal ? "hosted-policy" : this.options.workerId, round);
        await this.options.beforeRound?.(round, identity);
        if (this.options.signal?.aborted) throw abortError();
        const policy = await this.repository.getPolicy(this.options.policyId);
        if (!policy) throw new Error("PAPER_POLICY_NOT_FOUND");
        if (this.options.expectedAccountId && policy.financialAccountId !== this.options.expectedAccountId) throw new Error("PAPER_WORKER_ACCOUNT_MISMATCH");
        const hostedSeeded = this.options.initialCapitalMinor !== undefined;
        const config = configForRound(policy, this.options.workerId, round, hostedSeeded, this.options.exitPolicy);
        const initialContribution = hostedSeeded ? {
          eventId: `standing-paper-hosted-capital/v1/${policy.policyId}`,
          availableAt: roundAt(0).toISOString(),
          amountMinor: this.options.initialCapitalMinor!.toString(),
          currency: "NOK" as const,
        } : undefined;
        try {
          if (this.options.signal?.aborted) throw abortError();
          const result = await this.repository.run(this.options.policyId, config, pricesForRound(round, this.options.exitPolicy !== undefined), identity, {
            ...(initialContribution ? { initialContribution } : {}),
            ...(this.options.expectedOwnerId ? { expectedOwnerId: this.options.expectedOwnerId } : {}),
          });
          this.options.onRound?.(identity, result);
        } catch (error) {
          if (error instanceof Error && error.message === "POLICY_NOT_ACTIVE") {
            const refreshed = await this.repository.getWorkerPolicyState(this.options.policyId);
            if (refreshed.policyStatus === "PAUSED" || refreshed.policyStatus === "STOPPED") continue;
          }
          throw error;
        }
        roundsCompleted += 1;
        lastRoundIdentity = identity;
        if ((this.options.maxRounds === undefined || roundsCompleted < this.options.maxRounds) && this.options.roundIntervalMs !== undefined) {
          await this.status("WAITING_INTERVAL");
          if (this.options.waitForRoundInterval) await this.options.waitForRoundInterval(this.options.signal);
          else await wait(this.options.roundIntervalMs, this.options.signal);
          await this.status("RUNNING");
        }
      }
      await this.status("COMPLETED");
      return { status: "COMPLETED", roundsCompleted, lastRoundIdentity };
    } catch (error) {
      if ((error as { code?: string }).code === "PAPER_WORKER_STOP_REQUESTED") {
        await this.status("STOPPED", "PAPER_WORKER_STOP_REQUESTED");
        return { status: "STOPPED", roundsCompleted, lastRoundIdentity };
      }
      const code = error instanceof Error ? error.message.split(/[\s:]/, 1)[0] : "PAPER_WORKER_UNKNOWN_FAILURE";
      await this.status("FAILED", code);
      throw new Error(`PAPER_WORKER_FAILED:${code}`, { cause: error });
    }
  }
}
