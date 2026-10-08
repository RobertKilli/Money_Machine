import { createHash } from "node:crypto";
import { runDeterministicBacktest, type BacktestRunConfig, type BacktestResult } from "@/application/backtest/run-deterministic-backtest";
import type { FixturePriceObservation } from "@/domain/strategy/fixture-assets";
import { assertValidPaperPolicy, type StandingPaperPolicy } from "@/domain/risk/standing-paper-policy";

const canonical = (value: unknown) => JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item instanceof Date ? item.toISOString() : item);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Process-local idempotency boundary for the disposable local paper runner. */
export class StandingPaperPolicyRunner {
  private readonly outcomes = new Map<string, { requestHash: string; result: BacktestResult }>();
  private readonly inFlight = new Map<string, { requestHash: string; result: Promise<BacktestResult> }>();

  async run(policy: StandingPaperPolicy, config: Omit<BacktestRunConfig, "standingPaperPolicy">, prices: readonly FixturePriceObservation[], idempotencyKey: string): Promise<BacktestResult> {
    // Copy before hashing and before the deferred calculation. These are plain
    // domain records, so structuredClone also copies nested arrays and Dates.
    const snapshot = structuredClone({ policy, config, prices });
    assertValidPaperPolicy(snapshot.policy);
    if (!idempotencyKey.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    const requestHash = hash(canonical(snapshot));
    const previous = this.outcomes.get(idempotencyKey);
    if (previous) {
      if (previous.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT");
      return structuredClone(previous.result);
    }
    const pending = this.inFlight.get(idempotencyKey);
    if (pending) {
      if (pending.requestHash !== requestHash) throw new Error("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_INPUT");
      return pending.result.then((result) => structuredClone(result));
    }
    const result = Promise.resolve().then(() => runDeterministicBacktest({ ...snapshot.config, standingPaperPolicy: snapshot.policy }, snapshot.prices));
    this.inFlight.set(idempotencyKey, { requestHash, result });
    return result.then((outcome) => {
      this.outcomes.set(idempotencyKey, { requestHash, result: outcome });
      this.inFlight.delete(idempotencyKey);
      return structuredClone(outcome);
    }, (error: unknown) => {
      this.inFlight.delete(idempotencyKey);
      throw error;
    });
  }
}
