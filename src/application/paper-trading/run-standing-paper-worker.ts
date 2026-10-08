import type { BacktestResult, BacktestRunConfig } from "@/application/backtest/run-deterministic-backtest";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION, type FixturePriceObservation } from "@/domain/strategy/fixture-assets";
import type { StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
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
  readonly onStatus?: (status: StandingPaperWorkerStatus, code?: string) => void;
  readonly onRound?: (identity: string, result: BacktestResult) => void;
  /** Deterministic orchestration seams used by PostgreSQL integration tests. */
  readonly waitForPolicyChange?: (signal?: AbortSignal) => Promise<void>;
  readonly waitForRoundInterval?: (signal?: AbortSignal) => Promise<void>;
  readonly beforeRound?: (round: number, identity: string) => Promise<void>;
};

const roundKey = (workerId: string, round: number) => `standing-paper-worker/v1/${workerId}/round/${String(round).padStart(12, "0")}`;
const roundAt = (round: number) => new Date(Date.UTC(2026, 0, 1, 9, 0, 0) + round * 60_000);
const pricesForRound = (round: number): FixturePriceObservation[] => {
  const at = roundAt(round);
  const availableAt = new Date(at.getTime() - 60 * 60 * 1000);
  return FIXTURE_ASSETS.map((asset, index) => ({
    recordId: `standing-paper-worker-synthetic-${String(round).padStart(12, "0")}-${index + 1}`,
    assetId: asset.assetId,
    price: { currencyCode: "NOK", priceAtoms: BigInt((index + 1) * 10_000), priceScale: 4 },
    observedAt: availableAt,
    availableAt,
    ingestedAt: new Date(availableAt.getTime() + 1_000),
    datasetVersion: FIXTURE_DATASET_VERSION,
  }));
};
const configForRound = (policy: StandingPaperPolicy, workerId: string, round: number): Omit<BacktestRunConfig, "standingPaperPolicy"> => {
  const at = roundAt(round).toISOString();
  return {
    startAt: at,
    endAt: at,
    baseCurrency: "NOK",
    financialAccountId: policy.financialAccountId,
    contributionEvents: [{ eventId: `standing-paper-worker-${workerId}-contribution-${String(round).padStart(12, "0")}`, availableAt: at, amountMinor: "100000", currency: "NOK" }],
    valuationTimestamps: [],
    strategyVersion: "contribution-rebalancing/v1",
    riskPolicyVersion: "m1-risk-policy/v1",
    executionPolicyVersion: "m1-market-execution/v1",
    portfolioValuationVersion: "portfolio-valuation/v1",
    fifoCostBasisVersion: "fifo-cost-basis/v1",
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
  constructor(private readonly repository: StandingPaperPolicyRepository, private readonly options: StandingPaperWorkerOptions) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(options.workerId)) throw new Error("PAPER_WORKER_ID_INVALID");
    if (!options.policyId.trim()) throw new Error("PAPER_WORKER_POLICY_ID_REQUIRED");
    if (options.maxRounds !== undefined && (!Number.isSafeInteger(options.maxRounds) || options.maxRounds < 1)) throw new Error("PAPER_WORKER_MAX_ROUNDS_INVALID");
    if (options.pollIntervalMs !== undefined && (!Number.isSafeInteger(options.pollIntervalMs) || options.pollIntervalMs < 10)) throw new Error("PAPER_WORKER_POLL_INTERVAL_INVALID");
    if (options.maxRounds === undefined && options.roundIntervalMs === undefined) throw new Error("PAPER_WORKER_ROUND_INTERVAL_REQUIRED");
    if (options.roundIntervalMs !== undefined && (!Number.isSafeInteger(options.roundIntervalMs) || options.roundIntervalMs < 1_000 || options.roundIntervalMs > 86_400_000)) throw new Error("PAPER_WORKER_ROUND_INTERVAL_INVALID");
  }

  private status(value: StandingPaperWorkerStatus, code?: string) { this.options.onStatus?.(value, code); }

  async run(): Promise<StandingPaperWorkerResult> {
    if (this.active) throw new Error("PAPER_WORKER_ALREADY_RUNNING");
    this.active = true;
    try { return await this.runLoop(); }
    finally { this.active = false; }
  }

  private async runLoop(): Promise<StandingPaperWorkerResult> {
    let roundsCompleted = 0;
    let lastRoundIdentity: string | null = null;
    this.status("RUNNING");
    try {
      while (this.options.maxRounds === undefined || roundsCompleted < this.options.maxRounds) {
        if (this.options.signal?.aborted) throw abortError();
        const state = await this.repository.getWorkerPolicyState(this.options.policyId);
        if (state.policyStatus === "STOPPED") {
          this.status("STOPPED", "PAPER_POLICY_STOPPED");
          return { status: "STOPPED", roundsCompleted, lastRoundIdentity };
        }
        if (state.policyStatus === "PAUSED") {
          this.status("WAITING_PAUSED", "PAPER_POLICY_PAUSED");
          if (this.options.waitForPolicyChange) await this.options.waitForPolicyChange(this.options.signal);
          else await wait(this.options.pollIntervalMs ?? 2_000, this.options.signal);
          this.status("RUNNING");
          continue;
        }
        if (state.policyStatus !== "ACTIVE") throw new Error("PAPER_WORKER_POLICY_NOT_ACTIVE");
        if (state.accountStatus !== "ACTIVE" || state.accountMode !== "PAPER" || state.accountCurrency !== "NOK") throw new Error("STANDING_PAPER_ACCOUNT_NOT_RUNNABLE");

        const round = await this.repository.getNextWorkerRound(this.options.policyId, this.options.workerId);
        const identity = roundKey(this.options.workerId, round);
        await this.options.beforeRound?.(round, identity);
        if (this.options.signal?.aborted) throw abortError();
        const policy = await this.repository.getPolicy(this.options.policyId);
        if (!policy) throw new Error("PAPER_POLICY_NOT_FOUND");
        const config = configForRound(policy, this.options.workerId, round);
        try {
          if (this.options.signal?.aborted) throw abortError();
          const result = await this.repository.run(this.options.policyId, config, pricesForRound(round), identity);
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
          this.status("WAITING_INTERVAL");
          if (this.options.waitForRoundInterval) await this.options.waitForRoundInterval(this.options.signal);
          else await wait(this.options.roundIntervalMs, this.options.signal);
          this.status("RUNNING");
        }
      }
      this.status("COMPLETED");
      return { status: "COMPLETED", roundsCompleted, lastRoundIdentity };
    } catch (error) {
      if ((error as { code?: string }).code === "PAPER_WORKER_STOP_REQUESTED") {
        this.status("STOPPED", "PAPER_WORKER_STOP_REQUESTED");
        return { status: "STOPPED", roundsCompleted, lastRoundIdentity };
      }
      const code = error instanceof Error ? error.message.split(/[\s:]/, 1)[0] : "PAPER_WORKER_UNKNOWN_FAILURE";
      this.status("FAILED", code);
      throw new Error(`PAPER_WORKER_FAILED:${code}`, { cause: error });
    }
  }
}
