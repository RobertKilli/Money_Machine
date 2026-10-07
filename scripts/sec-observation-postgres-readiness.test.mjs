import assert from "node:assert/strict";
import test from "node:test";
import { waitForSecObservationDatabase } from "./sec-observation-postgres-readiness.mjs";

test("continues past pg_isready while the task database is not yet reachable over TCP", async () => {
  const database = "mm_sec_observation_synthetic";
  let clock = 0;
  let sqlAttempts = 0;
  let pollSleeps = 0;
  const run = async (_command, args) => {
    if (args.includes("pg_isready")) return { output: "/var/run/postgresql:5432 - accepting connections" };
    assert.ok(args.includes("psql"), "readiness requires an actual SQL client connection");
    assert.ok(args.includes("-h") && args[args.indexOf("-h") + 1] === "127.0.0.1", "TCP probe excludes the image's socket-only init server");
    assert.ok(args.includes("-d") && args[args.indexOf("-d") + 1] === database, "probe connects to the exact generated task database");
    assert.ok(args.includes("select current_database()"));
    sqlAttempts += 1;
    if (sqlAttempts === 1) throw new Error(`FATAL: database "${database}" does not exist`);
    return { output: `${database}\n` };
  };

  await waitForSecObservationDatabase({ run, container: "task-owned-postgres", database, ensureWorkNotInterrupted() {}, timeoutMs: 2_000, pollIntervalMs: 100, now: () => clock, sleep: async milliseconds => { pollSleeps += 1; clock += milliseconds; } });
  assert.equal(sqlAttempts, 2);
  assert.equal(pollSleeps, 1);
});

test("uses a bounded deadline and preserves interruption checks between readiness probes", async () => {
  let clock = 0;
  let interrupted = false;
  const run = async () => ({ output: "accepting connections" });
  await assert.rejects(waitForSecObservationDatabase({ run, container: "task-owned-postgres", database: "task_database", timeoutMs: 1_000, pollIntervalMs: 400, now: () => clock, sleep: async milliseconds => { clock += milliseconds; }, ensureWorkNotInterrupted() { if (interrupted) throw new Error("SEC_OBSERVATION_TEST_INTERRUPTED"); } }), /SEC_OBSERVATION_TEST_POSTGRES_NOT_READY/);
  assert.equal(clock, 1_000);

  let calls = 0;
  interrupted = false;
  await assert.rejects(waitForSecObservationDatabase({ run: async () => { calls += 1; if (calls === 1) return { output: "accepting" }; interrupted = true; throw new Error("connection refused"); }, container: "task-owned-postgres", database: "task_database", ensureWorkNotInterrupted() { if (interrupted) throw new Error("SEC_OBSERVATION_TEST_INTERRUPTED"); }, now: () => 0, sleep: async () => {} }), /SEC_OBSERVATION_TEST_INTERRUPTED/);
});
