import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import postgres, { type Sql, type TransactionSql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BacktestRunConfig } from "@/application/backtest/run-deterministic-backtest";
import { price } from "@/domain/financial/price";
import type { StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";
import { FIXTURE_ASSETS, FIXTURE_DATASET_VERSION, type FixturePriceObservation } from "@/domain/strategy/fixture-assets";
import { StandingPaperPolicyRepository } from "@/infrastructure/postgres/standing-paper-policy-repository";
import { StandingPaperWorker } from "@/application/paper-trading/run-standing-paper-worker";

const enabled = process.env.MONEY_MACHINE_INTEGRATION_TEST === "1";
const testUrl = process.env.MM_STANDING_PAPER_TEST_DATABASE_URL;
function assertTaskOwnedLocalDatabase(url: string | undefined): asserts url is string {
  if (!url) throw new Error("STANDING_PAPER_TEST_DATABASE_URL_REQUIRED");
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" || !/^\/mm_paper_[0-9a-f]{32}$/.test(parsed.pathname)) throw new Error("STANDING_PAPER_TEST_REFUSES_NON_TASK_OWNED_DATABASE");
}
const stamp = (hour: number) => `2026-03-01T${String(hour).padStart(2, "0")}:10:00.000Z`;
const pricesAt = (availableAt: string, priceAtoms = 10_000n): FixturePriceObservation[] => FIXTURE_ASSETS.map((asset, index) => ({
  recordId: `synthetic-${availableAt}-${index}-${priceAtoms}`, assetId: asset.assetId, price: price("NOK", priceAtoms * BigInt(index + 1), 4),
  observedAt: new Date(availableAt), availableAt: new Date(availableAt), ingestedAt: new Date(availableAt), datasetVersion: FIXTURE_DATASET_VERSION,
}));
const config = (eventId: string, availableAt: string, amountMinor = "100000"): Omit<BacktestRunConfig, "standingPaperPolicy"> => ({
  startAt: availableAt, endAt: availableAt, baseCurrency: "NOK",
  contributionEvents: [{ eventId, availableAt, amountMinor, currency: "NOK" }], valuationTimestamps: [],
  strategyVersion: "contribution-rebalancing/v1", riskPolicyVersion: "m1-risk-policy/v1", executionPolicyVersion: "m1-market-execution/v1",
  portfolioValuationVersion: "portfolio-valuation/v1", fifoCostBasisVersion: "fifo-cost-basis/v1", assetRegistryVersion: "fixture-asset-registry/v1", marketDatasetVersion: FIXTURE_DATASET_VERSION,
});

describe.skipIf(!enabled)("standing PAPER_ONLY policy PostgreSQL integration", () => {
  let sql: Sql;
  const repositories: StandingPaperPolicyRepository[] = [];
  beforeAll(async () => {
    assertTaskOwnedLocalDatabase(testUrl);
    sql = postgres(testUrl, { max: 8, prepare: true });
  });
  afterAll(async () => { await Promise.all(repositories.map(repository => repository.close())); await sql?.end({ timeout: 5 }); });
  async function account() {
    const owner = randomUUID(); const financialAccountId = randomUUID();
    await sql`insert into auth.users (id) values (${owner})`;
    await sql`insert into public.financial_accounts (id, owner_id, mode, status, base_currency_code) values (${financialAccountId}, ${owner}, 'PAPER', 'ACTIVE', 'NOK')`;
    return financialAccountId;
  }
  async function setup(label: string, capitalBudgetMinor = 1_000_000n, maxLossMinor = 1_000_000n) {
    const financialAccountId = await account();
    const policy: StandingPaperPolicy = {
      policyId: `persistent-${label}-${randomUUID()}`, version: "standing-paper-policy/v1", identity: `synthetic-${label}`,
      mode: "PAPER_ONLY", status: "DRAFT", financialAccountId, allowedInstrumentIds: FIXTURE_ASSETS.map(asset => asset.assetId),
      capitalBudgetMinor, maxOrderMinor: capitalBudgetMinor, maxPositionMinor: capitalBudgetMinor,
      maxGrossExposureMinor: capitalBudgetMinor, maxLossMinor, maxPriceAgeMs: 7 * 24 * 60 * 60 * 1000,
    };
    const repository = new StandingPaperPolicyRepository(testUrl!); repositories.push(repository);
    await repository.create(policy);
    await repository.transition(policy.policyId, "ACTIVATE");
    return { repository, policy };
  }
  async function addExternalPosting(accountId: string) {
    // Simulate an out-of-band writer that bypasses the shared ledger triggers;
    // reconciliation must still detect the resulting transaction-set drift.
    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`insert into public.ledger_transactions (financial_account_id, transaction_type, occurred_at, narrative) values (${accountId}, 'SIMULATED_BUY_SETTLEMENT', ${new Date(stamp(9))}, 'out-of-band test posting')`;
    });
  }
  async function counts(accountId: string) {
    const rows = await sql`select
      (select count(*)::text from public.standing_paper_runs where financial_account_id=${accountId}) runs,
      (select count(*)::text from public.standing_paper_contributions where financial_account_id=${accountId}) contributions,
      (select count(*)::text from public.standing_paper_decisions where financial_account_id=${accountId}) decisions,
      (select count(*)::text from public.standing_paper_fills where financial_account_id=${accountId}) fills,
      (select count(*)::text from public.ledger_transactions where financial_account_id=${accountId}) journals,
      (select count(*)::text from public.audit_events where financial_account_id=${accountId}) audits`;
    return rows[0]!;
  }

  it("continues one account across runner instances; replay and concurrent budget use stay idempotent", async () => {
    const f = await setup("continue", 110_000n);
    const at1 = stamp(10); const at2 = stamp(11); const p = pricesAt(stamp(9));
    const first = await f.repository.run(f.policy.policyId, config("deposit-a", at1), p, "round-a");
    const secondRunner = new StandingPaperPolicyRepository(testUrl!); repositories.push(secondRunner);
    const second = await secondRunner.run(f.policy.policyId, config("deposit-b", at2), p, "round-b");
    expect(second.persistentState.netContributionsMinor).toBe(200_000n);
    expect(second.persistentState.ledger.length).toBeGreaterThan(first.persistentState.ledger.length);
    expect(await secondRunner.run(f.policy.policyId, config("deposit-b", at2), p, "round-b")).toEqual(second);
    await expect(secondRunner.run(f.policy.policyId, config("deposit-c", at2), p, "round-b")).rejects.toThrow("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT");
    const duplicateAttempts = await Promise.all([
      f.repository.run(f.policy.policyId, config("deposit-c", stamp(12)), p, "round-c"),
      secondRunner.run(f.policy.policyId, config("deposit-c", stamp(12)), p, "round-c"),
    ]);
    expect(duplicateAttempts[0]).toEqual(duplicateAttempts[1]);
    await expect(Promise.all([
      f.repository.run(f.policy.policyId, config("deposit-d", stamp(13)), p, "round-d"),
      secondRunner.run(f.policy.policyId, config("deposit-e", stamp(13)), p, "round-e"),
    ])).resolves.toHaveLength(2);
    const persisted = await sql<{ state: string }[]>`select state_json::text as state from public.standing_paper_policies where policy_id=${f.policy.policyId}`;
    const checkpoint = JSON.parse(persisted[0]!.state) as { committedCapitalMinor?: { value?: string } };
    if (!checkpoint.committedCapitalMinor) throw new Error(`PAPER_CHECKPOINT_SHAPE_INVALID: ${persisted[0]!.state}`);
    expect(BigInt(checkpoint.committedCapitalMinor?.value ?? "-1")).toBeGreaterThanOrEqual(0n);
    expect(BigInt(checkpoint.committedCapitalMinor!.value!)).toBeLessThanOrEqual(110_000n);
    const evidence = await counts(f.policy.financialAccountId);
    expect(Number(evidence.contributions)).toBe(5);
    expect(Number(evidence.fills)).toBeLessThanOrEqual(Number(evidence.decisions));
    expect(Number(evidence.journals)).toBe(Number(evidence.contributions) + Number(evidence.fills));
    expect(Number(evidence.journals)).toBe(Number(evidence.audits));
    const duplicates = await sql`select count(*)::text n from public.standing_paper_decisions where financial_account_id=${f.policy.financialAccountId} group by order_id having count(*) > 1`;
    expect(duplicates).toHaveLength(0);
  });

  it("rejects a pre-existing account ledger and an external ledger change between rounds", async () => {
    const financialAccountId = await account();
    await addExternalPosting(financialAccountId);
    const policy: StandingPaperPolicy = { policyId: `preexisting-${randomUUID()}`, version: "standing-paper-policy/v1", identity: "synthetic-preexisting", mode: "PAPER_ONLY", status: "DRAFT", financialAccountId, allowedInstrumentIds: FIXTURE_ASSETS.map(asset => asset.assetId), capitalBudgetMinor: 1_000_000n, maxOrderMinor: 1_000_000n, maxPositionMinor: 1_000_000n, maxGrossExposureMinor: 1_000_000n, maxLossMinor: 1_000_000n, maxPriceAgeMs: 604_800_000 };
    const repository = new StandingPaperPolicyRepository(testUrl!); repositories.push(repository);
    await expect(repository.create(policy)).rejects.toThrow("PAPER_ACCOUNT_NOT_EMPTY_AT_POLICY_CREATION");

    const f = await setup("external-change");
    await f.repository.run(f.policy.policyId, config("seed", stamp(10)), pricesAt(stamp(9)), "external-first");
    await addExternalPosting(f.policy.financialAccountId);
    const before = await counts(f.policy.financialAccountId);
    await expect(f.repository.run(f.policy.policyId, config("next", stamp(11)), pricesAt(stamp(9)), "external-second")).rejects.toThrow("PAPER_LEDGER_CHECKPOINT_MISMATCH");
    expect(await counts(f.policy.financialAccountId)).toEqual(before);
  });

  it("rechecks account eligibility after waiting for the locked account row", async () => {
    const f = await setup("account-status-race");
    await f.repository.run(f.policy.policyId, config("status-seed", stamp(10)), pricesAt(stamp(9)), "status-seed");
    const baselineCounts = await counts(f.policy.financialAccountId);
    const baselineCheckpoint = await sql<{ state_json: unknown; last_run_id: string | null }[]>`select state_json, last_run_id from public.standing_paper_policies where policy_id=${f.policy.policyId}`;

    let runnerOutcome: Promise<
      | { status: "resolved"; result: unknown }
      | { status: "rejected"; error: unknown }
    >;
    await sql.begin(async tx => {
      const accountRows = await tx<{ id: string }[]>`select id from public.financial_accounts where id=${f.policy.financialAccountId} for update`;
      expect(accountRows).toHaveLength(1);
      await tx`update public.financial_accounts set status='CLOSED' where id=${f.policy.financialAccountId}`;

      // This uses the repository's independent PostgreSQL connection. Do not
      // commit the account change until pg_stat_activity proves that run()
      // has reached and is waiting on the locked FinancialAccount row.
      runnerOutcome = f.repository.run(f.policy.policyId, config("status-after-close", stamp(11)), pricesAt(stamp(9)), "status-after-close").then(
        result => ({ status: "resolved" as const, result }),
        error => ({ status: "rejected" as const, error }),
      );
      const deadline = Date.now() + 10_000;
      let waitingOnAccount = false;
      while (Date.now() < deadline) {
        const waiters = await tx<{ pid: number; query: string }[]>`
          select waiter.pid, waiter.query
          from pg_stat_activity waiter
          where waiter.datname=current_database()
            and waiter.wait_event_type='Lock'
            and pg_blocking_pids(waiter.pid) @> array[pg_backend_pid()]
        `;
        if (waiters.length > 0) { waitingOnAccount = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(waitingOnAccount).toBe(true);
    });

    const outcome = await runnerOutcome!;
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") expect(String(outcome.error)).toContain("STANDING_PAPER_ACCOUNT_NOT_RUNNABLE");
    expect(await counts(f.policy.financialAccountId)).toEqual(baselineCounts);
    const checkpointAfter = await sql<{ state_json: unknown; last_run_id: string | null }[]>`select state_json, last_run_id from public.standing_paper_policies where policy_id=${f.policy.policyId}`;
    expect(checkpointAfter).toEqual(baselineCheckpoint);
    await expect(f.repository.transition(f.policy.policyId, "PAUSE")).rejects.toThrow("STANDING_PAPER_ACCOUNT_NOT_RUNNABLE");
    expect(await counts(f.policy.financialAccountId)).toEqual(baselineCounts);
  }, 20_000);

  it("rejects malformed checkpoints without writing or resetting loss margin", async () => {
    const f = await setup("strict-checkpoint");
    await f.repository.run(f.policy.policyId, config("seed", stamp(10)), pricesAt(stamp(9)), "strict-seed");
    const original = await sql<{ state_json: unknown }[]>`select state_json from public.standing_paper_policies where policy_id=${f.policy.policyId}`;
    const state = original[0]!.state_json;
    const baseline = await counts(f.policy.financialAccountId);
    const cases: unknown[] = [{}, { ...(state as object), ledger: null }, { ...(state as object), acquisitions: null }, { ...(state as object), committedCapitalMinor: null }, { ...(state as object), adjustedEquityHighWaterMinor: null }, { ...(state as object), lastProcessedAt: "not-a-date" }];
    for (const corrupted of cases) {
      await sql`update public.standing_paper_policies set state_json=${JSON.stringify(corrupted)}::jsonb where policy_id=${f.policy.policyId}`;
      await expect(f.repository.run(f.policy.policyId, config(`invalid-${randomUUID()}`, stamp(11)), pricesAt(stamp(9)), `invalid-${randomUUID()}`)).rejects.toThrow("PAPER_CHECKPOINT_INVALID");
      expect(await counts(f.policy.financialAccountId)).toEqual(baseline);
      const unchanged = await sql<{ state_json: unknown }[]>`select state_json from public.standing_paper_policies where policy_id=${f.policy.policyId}`;
      const unchangedState = typeof unchanged[0]!.state_json === "string" ? JSON.parse(unchanged[0]!.state_json) as unknown : unchanged[0]!.state_json;
      expect(unchangedState).toEqual(corrupted);
    }
    await sql`update public.standing_paper_policies set state_json=${JSON.stringify(state)}::jsonb where policy_id=${f.policy.policyId}`;
    await f.repository.run(f.policy.policyId, config("after-restore", stamp(11)), pricesAt(stamp(9)), "strict-after-restore");
  });

  it("rollback after persistence writes leaves no partial settlement", async () => {
    const f = await setup("rollback");
    const repo = f.repository as unknown as { client: Sql };
    const client = repo.client;
    let injected = false;
    repo.client = new Proxy(client, { get(target, property, receiver) {
      if (property !== "begin") return Reflect.get(target, property, receiver);
      return (work: (tx: TransactionSql) => Promise<unknown>) => client.begin(async tx => { await work(tx); injected = true; throw new Error("CONTROLLED_PAPER_ROLLBACK"); });
    } });
    try { await expect(f.repository.run(f.policy.policyId, config("rollback-event", stamp(10)), pricesAt(stamp(9)), "rollback-key")).rejects.toThrow("CONTROLLED_PAPER_ROLLBACK"); }
    finally { repo.client = client; }
    expect(injected).toBe(true);
    expect(await counts(f.policy.financialAccountId)).toEqual({ runs: "0", contributions: "0", decisions: "0", fills: "0", journals: "0", audits: "0" });
    expect((await f.repository.run(f.policy.policyId, config("rollback-event", stamp(10)), pricesAt(stamp(9)), "rollback-key")).integrityStatus).toBe("CONSISTENT");
  });

  it("deposit and process restart preserve contribution-adjusted loss margin", async () => {
    const f = await setup("drawdown", 1_000_000n, 0n);
    const first = await f.repository.run(f.policy.policyId, config("seed", stamp(10)), pricesAt(stamp(9), 10_000n), "loss-first");
    const restart = new StandingPaperPolicyRepository(testUrl!); repositories.push(restart);
    const currentPrices = [...pricesAt(stamp(9), 5_000n), ...pricesAt(stamp(11), 5_000n)];
    const second = await restart.run(f.policy.policyId, config("new-deposit", stamp(12)), currentPrices, "loss-after-deposit");
    expect(second.persistentState.netContributionsMinor).toBe(200_000n);
    expect(second.persistentState.adjustedEquityHighWaterMinor).toBe(first.persistentState.adjustedEquityHighWaterMinor);
    expect(second.paperPolicyDecisions.length).toBeGreaterThan(0);
    expect(BigInt(second.paperPolicyDecisions[0]!.evidence.currentLossMinor)).toBeGreaterThan(0n);
    expect(second.paperPolicyDecisions.every(decision => decision.evidence.reasonCode === "LOSS_LIMIT_EXCEEDED")).toBe(true);
  });

  it("pause and stop block new rounds before orders are written", async () => {
    for (const status of ["PAUSED", "STOPPED"] as const) {
      const f = await setup(status.toLowerCase());
      if (status === "PAUSED") await f.repository.transition(f.policy.policyId, "PAUSE");
      else { await f.repository.transition(f.policy.policyId, "STOP"); }
      await expect(f.repository.run(f.policy.policyId, config(`${status}-event`, stamp(10)), pricesAt(stamp(9)), `${status}-key`)).rejects.toThrow("POLICY_NOT_ACTIVE");
      expect(await counts(f.policy.financialAccountId)).toEqual({ runs: "0", contributions: "0", decisions: "0", fills: "0", journals: "0", audits: "0" });
      const transitions = await sql<{ action: string; to_status: string }[]>`select action, to_status from public.standing_paper_policy_transitions where policy_id=${f.policy.policyId} order by occurred_at, id`;
      expect(transitions.map(row => [row.action, row.to_status])).toEqual([["INITIALIZE", "DRAFT"], ["ACTIVATE", "ACTIVE"], [status === "PAUSED" ? "PAUSE" : "STOP", status]]);
    }
  });

  it("resumes at the next durable round after process restart without replaying settlements", async () => {
    const f = await setup("worker-restart");
    const firstWorker = new StandingPaperWorker(f.repository, { policyId: f.policy.policyId, workerId: "restart-sequence", maxRounds: 2 });
    const first = await firstWorker.run();
    expect(first).toMatchObject({ status: "COMPLETED", roundsCompleted: 2 });
    expect(first.lastRoundIdentity, JSON.stringify(first)).toBe("standing-paper-worker/v1/restart-sequence/round/000000000001");
    expect(await f.repository.getNextWorkerRound(f.policy.policyId, "restart-sequence")).toBe(2);
    const restartRepository = new StandingPaperPolicyRepository(testUrl!); repositories.push(restartRepository);
    const resumed = await new StandingPaperWorker(restartRepository, { policyId: f.policy.policyId, workerId: "restart-sequence", maxRounds: 1 }).run();
    expect(resumed).toMatchObject({ status: "COMPLETED", roundsCompleted: 1 });
    expect(resumed.lastRoundIdentity).toBe("standing-paper-worker/v1/restart-sequence/round/000000000002");
    expect(await counts(f.policy.financialAccountId)).toMatchObject({ runs: "3", contributions: "3" });
  });

  it("converges two workers starting the same round to one durable settlement", async () => {
    const f = await setup("worker-concurrent");
    const secondRepository = new StandingPaperPolicyRepository(testUrl!); repositories.push(secondRepository);
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const beforeRound = async () => { arrivals += 1; if (arrivals === 2) release(); await barrier; };
    const outcomes = await Promise.all([
      new StandingPaperWorker(f.repository, { policyId: f.policy.policyId, workerId: "shared-worker", maxRounds: 1, beforeRound }).run(),
      new StandingPaperWorker(secondRepository, { policyId: f.policy.policyId, workerId: "shared-worker", maxRounds: 1, beforeRound }).run(),
    ]);
    expect(outcomes.map(item => item.lastRoundIdentity)).toEqual([outcomes[0]!.lastRoundIdentity, outcomes[0]!.lastRoundIdentity]);
    expect(await counts(f.policy.financialAccountId)).toMatchObject({ runs: "1", contributions: "1" });
  });

  it("waits without writes while paused and resumes after deterministic policy transition", async () => {
    const f = await setup("worker-pause-resume");
    await f.repository.transition(f.policy.policyId, "PAUSE");
    let waited = false;
    const statuses: string[] = [];
    const result = await new StandingPaperWorker(f.repository, {
      policyId: f.policy.policyId, workerId: "pause-resume", maxRounds: 1,
      onStatus: status => statuses.push(status),
      waitForPolicyChange: async () => {
        expect(waited).toBe(false);
        expect(await counts(f.policy.financialAccountId)).toMatchObject({ runs: "0", contributions: "0", decisions: "0", fills: "0", journals: "0", audits: "0" });
        waited = true;
        await f.repository.transition(f.policy.policyId, "ACTIVATE");
      },
    }).run();
    expect(waited).toBe(true);
    expect(statuses).toContain("WAITING_PAUSED");
    expect(result.roundsCompleted).toBe(1);
    expect(await counts(f.policy.financialAccountId)).toMatchObject({ runs: "1", contributions: "1" });
  });

  it("observes STOPPED as a worker exit state without writing a round", async () => {
    const f = await setup("worker-stop");
    await f.repository.transition(f.policy.policyId, "STOP");
    const statuses: string[] = [];
    const result = await new StandingPaperWorker(f.repository, { policyId: f.policy.policyId, workerId: "stopped-worker", maxRounds: 1, onStatus: status => statuses.push(status) }).run();
    expect(result).toMatchObject({ status: "STOPPED", roundsCompleted: 0 });
    expect(statuses).toContain("STOPPED");
    expect(await counts(f.policy.financialAccountId)).toMatchObject({ runs: "0", contributions: "0", decisions: "0", fills: "0", journals: "0", audits: "0" });
  });

  it("stops with a checkpoint failure code and leaves the transaction untouched", async () => {
    const f = await setup("worker-failure");
    await sql`update public.standing_paper_policies set state_json='{}'::jsonb where policy_id=${f.policy.policyId}`;
    const before = await counts(f.policy.financialAccountId);
    const statuses: Array<{ status: string; code?: string }> = [];
    await expect(new StandingPaperWorker(f.repository, { policyId: f.policy.policyId, workerId: "failure-worker", maxRounds: 1, onStatus: (status, code) => statuses.push({ status, code }) }).run()).rejects.toThrow("PAPER_WORKER_FAILED:PAPER_CHECKPOINT_INVALID");
    expect(statuses.at(-1)).toEqual({ status: "FAILED", code: "PAPER_CHECKPOINT_INVALID" });
    expect(await counts(f.policy.financialAccountId)).toEqual(before);
  });

  it("stops on ledger divergence without committing a worker round", async () => {
    const f = await setup("worker-ledger-failure");
    await f.repository.run(f.policy.policyId, config("ledger-seed", stamp(10)), pricesAt(stamp(9)), "ledger-seed");
    await addExternalPosting(f.policy.financialAccountId);
    const before = await counts(f.policy.financialAccountId);
    await expect(new StandingPaperWorker(f.repository, { policyId: f.policy.policyId, workerId: "ledger-failure", maxRounds: 1 }).run()).rejects.toThrow("PAPER_WORKER_FAILED:PAPER_LEDGER_CHECKPOINT_MISMATCH");
    expect(await counts(f.policy.financialAccountId)).toEqual(before);
  });

  it("finishes an in-flight transaction after stop signal and enters no next round", async () => {
    const f = await setup("worker-signal");
    const control = f.repository as unknown as { client: Sql };
    const original = control.client;
    let signalTransactionReady!: () => void;
    let releaseTransaction!: () => void;
    const ready = new Promise<void>(resolve => { signalTransactionReady = resolve; });
    const release = new Promise<void>(resolve => { releaseTransaction = resolve; });
    control.client = new Proxy(original, { get(target, property, receiver) {
      if (property !== "begin") return Reflect.get(target, property, receiver);
      return (work: (tx: TransactionSql) => Promise<unknown>) => original.begin(async tx => {
        const result = await work(tx);
        signalTransactionReady();
        await release;
        return result;
      });
    } });
    const controller = new AbortController();
    let running: Promise<{ status: string; roundsCompleted: number }>;
    try {
      running = new StandingPaperWorker(f.repository, { policyId: f.policy.policyId, workerId: "signal-worker", maxRounds: 3, signal: controller.signal }).run();
      await ready;
      controller.abort();
      releaseTransaction();
      await expect(running!).resolves.toMatchObject({ status: "STOPPED", roundsCompleted: 1 });
    } finally { control.client = original; }
    expect(await counts(f.policy.financialAccountId)).toMatchObject({ runs: "1", contributions: "1" });
  });

  it("requires a continuous interval and interrupts interval waiting immediately", async () => {
    const f = await setup("worker-interval");
    expect(() => new StandingPaperWorker(f.repository, { policyId: f.policy.policyId, workerId: "interval-missing" })).toThrow("PAPER_WORKER_ROUND_INTERVAL_REQUIRED");
    const controller = new AbortController();
    let intervalStarted!: () => void;
    const waiting = new Promise<void>(resolve => { intervalStarted = resolve; });
    const statuses: string[] = [];
    const run = new StandingPaperWorker(f.repository, {
      policyId: f.policy.policyId, workerId: "interval-test", roundIntervalMs: 60_000, signal: controller.signal,
      onStatus: status => statuses.push(status), waitForRoundInterval: async signal => {
        expect(signal).toBe(controller.signal);
        intervalStarted();
        await new Promise<void>((resolve, reject) => {
          signal?.addEventListener("abort", () => reject(Object.assign(new Error("stop"), { code: "PAPER_WORKER_STOP_REQUESTED" })), { once: true });
        });
      },
    }).run();
    await waiting;
    expect(await counts(f.policy.financialAccountId)).toMatchObject({ runs: "1", contributions: "1" });
    expect(statuses).toContain("WAITING_INTERVAL");
    controller.abort();
    await expect(run).resolves.toMatchObject({ status: "STOPPED", roundsCompleted: 1 });
    expect(await counts(f.policy.financialAccountId)).toMatchObject({ runs: "1", contributions: "1" });
  });

  it("stops the actual CLI process through its control channel during a locked settlement", async () => {
    const f = await setup("worker-cli-stop");
    const processUrl = new URL(testUrl!);
    processUrl.searchParams.set("application_name", "standing-paper-cli-stop-test");
    // Keep the lock in an explicit transaction until after the wrapper receives
    // wrapper receives a stop command and sends it over loopback.
    const lockClient = postgres(testUrl!, { max: 1, prepare: true });
    let unlock!: () => void;
    const locked = new Promise<void>(resolve => { unlock = resolve; });
    let lockReady!: () => void;
    const ready = new Promise<void>(resolve => { lockReady = resolve; });
    const lockTransaction = lockClient.begin(async tx => {
      await tx`select id from public.financial_accounts where id=${f.policy.financialAccountId} for update`;
      lockReady();
      await locked;
    });
    await ready;
    const cli = resolve(process.cwd(), "scripts", "run-standing-paper-worker.mjs");
    const child = spawn(process.execPath, [cli, "--database-url", processUrl.toString(), "--policy-id", f.policy.policyId, "--worker-id", "cli-stop", "--max-rounds", "3", "--round-interval-ms", "60000"], { cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk.toString(); });
    child.stderr.on("data", chunk => { output += chunk.toString(); });
    const exit = new Promise<number>((resolveExit, reject) => {
      const timeout = setTimeout(() => reject(new Error("PAPER_WORKER_CLI_STOP_TIMEOUT")), 20_000);
      child.once("error", reject);
      child.once("close", (code, signal) => { clearTimeout(timeout); resolveExit(code ?? (signal ? 1 : 0)); });
    });
    try {
      // Observe the worker blocked on the account row before requesting stop.
      const deadline = Date.now() + 15_000;
      let blocked = false;
      while (Date.now() < deadline) {
        const activity = await sql<{ waiting: boolean }[]>`select exists(select 1 from pg_stat_activity where application_name='standing-paper-cli-stop-test' and wait_event_type='Lock') as waiting`;
        if (activity[0]?.waiting) { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(blocked, output).toBe(true);
      const stopReceived = new Promise<void>((resolveStop, rejectStop) => {
        if (output.includes('"status":"STOP_RECEIVED"')) return resolveStop();
        const onData = () => {
          if (output.includes('"status":"STOP_RECEIVED"')) { clearTimeout(timeout); resolveStop(); }
        };
        child.stdout.on("data", onData);
        const timeout = setTimeout(() => rejectStop(new Error("PAPER_WORKER_CONTROL_STOP_NOT_ACKNOWLEDGED")), 5_000);
      });
      child.stdin.write(":stop\n"); // Exercise the real wrapper-to-worker control channel, including on Windows.
      await stopReceived;
      unlock();
      await lockTransaction;
      const exitCode = await exit;
      expect(exitCode, output).toBe(0);
      expect(output).toContain('"status":"STOPPED"');
      expect(await counts(f.policy.financialAccountId)).toMatchObject({ runs: "1", contributions: "1" });
      const remaining = await sql<{ count: string }[]>`select count(*)::text as count from pg_stat_activity where application_name='standing-paper-cli-stop-test'`;
      expect(remaining[0]?.count).toBe("0");
    } finally {
      unlock();
      await lockTransaction.catch(() => undefined);
      await lockClient.end({ timeout: 5 });
      if (child.exitCode === null && child.signalCode === null) {
        child.stdin.write(":stop\n");
        await exit.catch(() => undefined);
      }
    }
  });

  it("reads a consistent owned paper status snapshot and never exposes another owner's policy", async () => {
    const first = await setup("read-status-owner-one");
    const ownerRows = await sql<{ owner_id: string }[]>`select owner_id from public.financial_accounts where id=${first.policy.financialAccountId}`;
    const ownerOne = ownerRows[0]!.owner_id;
    await first.repository.run(first.policy.policyId, config("status-deposit", stamp(10)), pricesAt(stamp(9)), "status-round");

    const ownerTwo = randomUUID(); const accountTwo = randomUUID();
    await sql`insert into auth.users (id) values (${ownerTwo})`;
    await sql`insert into public.financial_accounts (id, owner_id, mode, status, base_currency_code) values (${accountTwo}, ${ownerTwo}, 'PAPER', 'ACTIVE', 'NOK')`;
    const policyTwo: StandingPaperPolicy = {
      policyId: `status-owner-two-${randomUUID()}`, version: "standing-paper-policy/v1", identity: "synthetic-owner-two",
      mode: "PAPER_ONLY", status: "DRAFT", financialAccountId: accountTwo, allowedInstrumentIds: FIXTURE_ASSETS.map(asset => asset.assetId),
      capitalBudgetMinor: 500_000n, maxOrderMinor: 100_000n, maxPositionMinor: 300_000n,
      maxGrossExposureMinor: 500_000n, maxLossMinor: 25_000n, maxPriceAgeMs: 86_400_000,
    };
    const secondRepository = new StandingPaperPolicyRepository(testUrl!); repositories.push(secondRepository);
    await secondRepository.create(policyTwo);
    await secondRepository.transition(policyTwo.policyId, "ACTIVATE");

    const one = await first.repository.loadOwnedStatus(ownerOne);
    expect(one.status).toBe("AVAILABLE");
    expect(one.workerStatus).toBe("UNKNOWN");
    expect(one.policies).toHaveLength(1);
    expect(one.policies[0]).toMatchObject({ policyId: first.policy.policyId, status: "AVAILABLE", policyStatus: "ACTIVE", mode: "PAPER_ONLY", workerStatus: "UNKNOWN" });
    expect(one.policies[0]!.lastRound).toMatchObject({ asOf: stamp(10) });
    expect(one.policies[0]!.netContributionsMinor).toBe("100000");
    expect(one.policies[0]!.portfolioValueMinor).not.toBeNull();
    expect(one.policies[0]!.decisions.length).toBeGreaterThan(0);

    const two = await secondRepository.loadOwnedStatus(ownerTwo);
    expect(two.status).toBe("NO_ROUNDS");
    expect(two.policies.map(policy => policy.policyId)).toEqual([policyTwo.policyId]);
    const ownerOneViaSecondConnection = await secondRepository.loadOwnedStatus(ownerOne);
    expect(ownerOneViaSecondConnection).toMatchObject({ status: "AVAILABLE", policies: [{ policyId: first.policy.policyId }] });
    expect(ownerOneViaSecondConnection.policies.some(policy => policy.policyId === policyTwo.policyId)).toBe(false);
  });

  it("bounds history independently for each policy and accepts distinct runner timestamps", async () => {
    const first = await setup("status-history-heavy");
    const owner = (await sql<{ owner_id: string }[]>`select owner_id from public.financial_accounts where id=${first.policy.financialAccountId}`)[0]!.owner_id;
    await first.repository.run(first.policy.policyId, configWithEndAt("history-heavy-round", stamp(10), stamp(13)), pricesAt(stamp(9)), "history-heavy-round");
    const accountId = randomUUID();
    await sql`insert into public.financial_accounts (id, owner_id, mode, status, base_currency_code) values (${accountId}, ${owner}, 'PAPER', 'ACTIVE', 'NOK')`;
    const secondPolicy: StandingPaperPolicy = { ...first.policy, policyId: `status-history-light-${randomUUID()}`, identity: "synthetic-history-light", financialAccountId: accountId, status: "DRAFT" };
    const secondRepository = new StandingPaperPolicyRepository(testUrl!); repositories.push(secondRepository);
    await secondRepository.create(secondPolicy);
    await secondRepository.transition(secondPolicy.policyId, "ACTIVATE");
    await secondRepository.run(secondPolicy.policyId, config("history-light-round", stamp(10)), pricesAt(stamp(9)), "history-light-round");
    await first.repository.run(first.policy.policyId, configWithEndAt("history-heavy-later-round", stamp(11), stamp(13)), pricesAt(stamp(9)), "history-heavy-later-round");

    const latest = await sql<{ last_run_id: string }[]>`select last_run_id from public.standing_paper_policies where policy_id=${first.policy.policyId}`;
    await sql`
      insert into public.standing_paper_decisions (policy_id, financial_account_id, order_id, input_hash, decision_json, run_id, created_at)
      select ${first.policy.policyId}, ${first.policy.financialAccountId}, 'overflow-' || n::text, repeat('a', 64),
        jsonb_build_object('decisionId', 'overflow-decision-' || n::text, 'orderId', 'overflow-' || n::text, 'outcome', 'REJECTED', 'riskCodes', jsonb_build_array(),
          'evidence', jsonb_build_object('policyId', ${first.policy.policyId}::text, 'policyVersion', 'standing-paper-policy/v1', 'inputHash', repeat('a', 64), 'reasonCode', 'PRICE_STALE', 'disposition', 'REJECT')),
        ${latest[0]!.last_run_id}::uuid, now() + n * interval '1 millisecond'
      from generate_series(1, 405) n
    `;
    const status = await first.repository.loadOwnedStatus(owner);
    const heavy = status.policies.find(policy => policy.policyId === first.policy.policyId)!;
    const light = status.policies.find(policy => policy.policyId === secondPolicy.policyId)!;
    expect(heavy.decisions).toHaveLength(20);
    expect(light.decisions.length).toBeGreaterThan(0);
    expect(heavy.lastRound).toMatchObject({ asOf: stamp(11) });

    await sql.begin(async tx => {
      await tx`set local session_replication_role = replica`;
      await tx`update public.standing_paper_runs set result_json=jsonb_set(result_json, '{endingState,asOf}', '"2026-03-01T10:11:00.000Z"'::jsonb) where id=${latest[0]!.last_run_id}::uuid`;
    });
    const invalidBinding = await first.repository.loadOwnedStatus(owner);
    expect(invalidBinding.policies.find(policy => policy.policyId === first.policy.policyId)?.status).toBe("INVALID");
  });

  it("grants authenticated status reads through migrations while preserving owner RLS", async () => {
    const privileges = await sql<{ table_name: string; can_select: boolean; rls_enabled: boolean }[]>`
      select tables.table_name, has_table_privilege('authenticated', format('public.%I', tables.table_name), 'select') as can_select,
        cls.relrowsecurity as rls_enabled
      from (values ('financial_accounts'), ('ledger_accounts'), ('ledger_transactions'), ('ledger_entries'),
        ('standing_paper_policies'), ('standing_paper_runs'), ('standing_paper_decisions'), ('standing_paper_fills')) as tables(table_name)
      join pg_class cls on cls.relname=tables.table_name join pg_namespace ns on ns.oid=cls.relnamespace and ns.nspname='public'
      order by tables.table_name
    `;
    expect(privileges).toHaveLength(8);
    expect(privileges.every(row => row.can_select && row.rls_enabled)).toBe(true);
  });
});
const configWithEndAt = (eventId: string, availableAt: string, endAt: string): Omit<BacktestRunConfig, "standingPaperPolicy"> => ({ ...config(eventId, availableAt), endAt });
