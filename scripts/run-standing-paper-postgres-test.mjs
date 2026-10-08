import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForSecObservationDatabase } from "./sec-observation-postgres-readiness.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const token = randomUUID().replaceAll("-", "");
const label = `money-machine.standing-paper-test=${token}`;
const container = `mm-standing-paper-test-${token}`;
const volume = `mm-standing-paper-test-${token}`;
const database = `mm_paper_${token}`;
const probeMode = process.argv.find(value => value.startsWith("--probe="))?.slice("--probe=".length);
const password = "postgres";
const temporary = await mkdtemp(join(tmpdir(), "mm-standing-paper-test-"));
const report = join(temporary, "vitest-report.json");
let child;
let interrupted = false;
let primaryError;
function ensureWorkNotInterrupted() { if (interrupted) throw new Error("STANDING_PAPER_TEST_INTERRUPTED"); }

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const stdio = options.capture ? [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"] : options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"];
    const processChild = spawn(command, args, { cwd: root, env: options.env ?? process.env, windowsHide: true, stdio });
    child = processChild;
    let output = "";
    if (options.capture) {
      processChild.stdout?.on("data", chunk => { output += chunk.toString(); });
      processChild.stderr?.on("data", chunk => { output += chunk.toString(); });
    }
    if (options.input !== undefined) processChild.stdin.end(options.input);
    processChild.once("error", rejectPromise);
    let timer;
    if (options.timeoutMs) timer = setTimeout(() => processChild.kill("SIGTERM"), options.timeoutMs);
    processChild.once("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      if (child === processChild) child = undefined;
      if (code === 0) resolvePromise({ output });
      else rejectPromise(new Error(`${command} exited ${code ?? signal}${output ? `: ${output.trim().slice(-1200)}` : ""}`));
    });
  });
}

function onSignal(signal) {
  interrupted = true;
  if (child && !child.killed) child.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
}
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);

async function exists(kind, name) {
  try { await run("docker", [kind, "inspect", name], { capture: true }); return true; }
  catch (error) {
    if (/no such (object|container|volume)/i.test(error.message)) return false;
    throw new Error(`Cannot verify task-owned ${kind} cleanup: ${error.message}`, { cause: error });
  }
}

async function cleanup() {
  const errors = [];
  for (const [args, kind, name] of [
    [["rm", "--force", "--volumes", container], "container", container],
    [["volume", "rm", volume], "volume", volume],
  ]) {
    try { await run("docker", args, { capture: true }); }
    catch (error) { if (!/no such (object|container|volume)/i.test(error.message)) errors.push(error); }
    try { if (await exists(kind, name)) errors.push(new Error(`Task-owned ${kind} still exists: ${name}`)); }
    catch (error) { errors.push(error); }
  }
  try { await rm(temporary, { recursive: true, force: true }); }
  catch (error) { errors.push(error); }
  for (const path of [report, temporary]) {
    try { await lstat(path); errors.push(new Error(`Temporary test resource remains: ${path}`)); }
    catch (error) { if (error.code !== "ENOENT") errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, "STANDING_PAPER_TEST_CLEANUP_FAILED");
  console.log("Standing paper PostgreSQL cleanup verified: task container, volume, report, and temporary directory removed.");
}

try {
  await writeFile(report, "");
  ensureWorkNotInterrupted();
  await run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true });
  const port = await new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return rejectPort(new Error("Could not allocate local PostgreSQL port"));
      const selected = address.port;
      server.close(error => error ? rejectPort(error) : resolvePort(selected));
    });
  });
  await run("docker", ["volume", "create", "--label", label, volume], { capture: true });
  await run("docker", ["run", "--detach", "--name", container, "--label", label, "--publish", `127.0.0.1:${port}:5432`, "--volume", `${volume}:/var/lib/postgresql/data`, "--env", "POSTGRES_USER=postgres", "--env", `POSTGRES_PASSWORD=${password}`, "--env", `POSTGRES_DB=${database}`, "postgres:17-alpine"], { capture: true });
  await waitForSecObservationDatabase({ run, container, database, ensureWorkNotInterrupted });
  ensureWorkNotInterrupted();
  const bootstrap = `create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users (id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;`;
  await run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: bootstrap, capture: true });
  const migrations = (await readdir(join(root, "supabase", "migrations"))).filter(name => name.endsWith(".sql")).sort();
  for (const migration of migrations) {
    ensureWorkNotInterrupted();
    if (probeMode === "interrupt-migration") setTimeout(() => onSignal("SIGINT"), 250).unref();
    const input = probeMode === "interrupt-migration" ? "select pg_sleep(30);" : await readFile(join(root, "supabase", "migrations", migration), "utf8");
    await run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input, capture: true });
    ensureWorkNotInterrupted();
  }
  if (probeMode === "failure") await run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: "drop table public.standing_paper_policies cascade;", capture: true });
  console.log(`Applied ${migrations.length} migrations to the task-owned local PostgreSQL database.`);
  const env = { ...process.env, MONEY_MACHINE_INTEGRATION_TEST: "1", MM_STANDING_PAPER_TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/${database}` };
  let suiteError;
  ensureWorkNotInterrupted();
  if (probeMode === "interrupt-tests") setTimeout(() => onSignal("SIGINT"), 250).unref();
  try { await run(process.execPath, [resolve(root, "node_modules", "vitest", "vitest.mjs"), "run", "--config", "vitest.integration.config.ts", "tests/integration/standing-paper-policy.test.ts", "--reporter=json", `--outputFile=${report}`], { env }); }
  catch (error) { suiteError = error; }
  if (probeMode === "interrupt-tests") throw new Error(interrupted ? "STANDING_PAPER_TEST_INTERRUPTED_AS_EXPECTED" : "STANDING_PAPER_TEST_INTERRUPT_PROBE_FAILED");
  if (probeMode === "interrupt-migration") throw new Error(interrupted ? "STANDING_PAPER_TEST_INTERRUPTED_AS_EXPECTED" : "STANDING_PAPER_MIGRATION_INTERRUPT_PROBE_FAILED");
  const output = JSON.parse(await readFile(report, "utf8"));
  const assertions = output.testResults?.flatMap(file => file.assertionResults ?? []) ?? [];
  console.log(assertions.map(item => `${item.status}: ${item.title}${item.failureMessages?.length ? `\n${item.failureMessages.join("\n")}` : ""}`).join("\n"));
  const cases = ["continues one account across runner instances; replay and concurrent budget use stay idempotent", "rollback after persistence writes leaves no partial settlement", "deposit and process restart preserve contribution-adjusted loss margin", "pause and stop block new rounds before orders are written"];
  if (probeMode === "failure") {
    if (!suiteError || !assertions.some(item => item.status === "failed")) throw new Error("STANDING_PAPER_FAILURE_PROBE_DID_NOT_FAIL");
    console.log("Confirmed deliberate PostgreSQL suite failure; later work stopped and cleanup completed.");
    suiteError = undefined;
  }
  for (const title of probeMode === "failure" ? [] : cases) {
    const test = assertions.find(item => item.title === title);
    if (test?.status !== "passed") throw new Error(`STANDING_PAPER_TEST_CASE_NOT_CONFIRMED ${title}: ${test?.status ?? "missing"}${test?.failureMessages?.length ? `: ${test.failureMessages.join(" | ")}` : ""}`);
  }
  ensureWorkNotInterrupted();
  if (suiteError) throw suiteError;
  if (probeMode !== "failure") console.log("Confirmed all standing paper PostgreSQL cases passed (not skipped).");
} catch (error) { primaryError = interrupted && probeMode?.startsWith("interrupt-") ? new Error("STANDING_PAPER_TEST_INTERRUPTED_AS_EXPECTED", { cause: error }) : error; }
finally {
  try { await cleanup(); }
  catch (error) { if (!primaryError) primaryError = error; else console.error(error.message); }
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);
}
if (primaryError) { console.error(primaryError.message); process.exitCode = interrupted && /INTERRUPTED_AS_EXPECTED/.test(primaryError.message) ? 0 : interrupted ? 130 : 1; }
