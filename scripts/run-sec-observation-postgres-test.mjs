import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const integrationTest = "tests/financial/sec-edgar-8k-node-transport.test.ts";
const firstPort = 55439;
const lastPort = 56999;
const identity = randomUUID().replaceAll("-", "");
const label = `money-machine.sec-observation-test=${identity}`;
const container = `mm-sec-observation-test-${identity}`;
const volume = `mm-sec-observation-test-${identity}`;
const database = `mm_sec_observation_${identity}`;
const password = "postgres";
const tempRoot = await mkdtemp(join(tmpdir(), "mm-sec-observation-test-"));
const reportPath = join(tempRoot, "vitest-report.json");
const failureProbe = process.argv.includes("--test-failure-probe");
let selectedPort;
let activeChild;
let interrupted = false;
let primaryError;

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: options.input !== undefined
        ? ["pipe", options.capture ? "pipe" : "inherit", options.capture ? "pipe" : "inherit"]
        : options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      env: options.env ?? process.env,
      windowsHide: true,
    });
    activeChild = child;
    let stderr = "";
    if (options.capture) {
      child.stdout?.on("data", chunk => { stderr += chunk.toString(); });
      child.stderr?.on("data", chunk => { stderr += chunk.toString(); });
    }
    if (options.input !== undefined) child.stdin.end(options.input);
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      if (activeChild === child) activeChild = undefined;
      if (interrupted) return rejectPromise(new Error("SEC_OBSERVATION_TEST_INTERRUPTED"));
      if (code === 0) return resolvePromise({ output: stderr, code });
      const details = options.capture ? `: ${stderr.trim().slice(-1200)}` : "";
      rejectPromise(new Error(`${command} exited ${code ?? signal}${details}`));
    });
  });
}

function signalHandler(signal) {
  interrupted = true;
  if (activeChild && !activeChild.killed) activeChild.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
}
process.on("SIGINT", signalHandler);
process.on("SIGTERM", signalHandler);

async function isPortAvailable(port) {
  return new Promise(resolvePromise => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolvePromise(true)));
  });
}

async function selectPort() {
  const count = lastPort - firstPort + 1;
  const start = Math.floor(Math.random() * count);
  for (let offset = 0; offset < count; offset++) {
    const candidate = firstPort + ((start + offset) % count);
    if (await isPortAvailable(candidate)) return candidate;
  }
  throw new Error(`SEC_OBSERVATION_TEST_NO_PORT_AVAILABLE (${firstPort}-${lastPort})`);
}

async function dockerExists(kind, name) {
  try {
    await run("docker", [kind, "inspect", name], { capture: true });
    return true;
  } catch (error) {
    if (/no such object|no such container|no such volume/i.test(error.message)) return false;
    throw new Error(`SEC_OBSERVATION_TEST_CLEANUP_CHECK_UNAVAILABLE for ${kind} ${name}: ${error.message}`, { cause: error });
  }
}

async function cleanup() {
  let cleanupFailure;
  if (await dockerExists("container", container)) {
    await run("docker", ["rm", "--force", "--volumes", container], { capture: true }).catch(error => { cleanupFailure ??= error; });
  }
  if (await dockerExists("volume", volume)) {
    await run("docker", ["volume", "rm", volume], { capture: true }).catch(error => { cleanupFailure ??= error; });
  }
  const containerRemains = await dockerExists("container", container);
  const volumeRemains = await dockerExists("volume", volume);
  await rm(tempRoot, { recursive: true, force: true }).catch(error => { cleanupFailure ??= error; });
  if (containerRemains || volumeRemains) cleanupFailure ??= new Error(`SEC_OBSERVATION_TEST_CLEANUP_FAILED container=${containerRemains} volume=${volumeRemains}`);
  if (cleanupFailure) throw cleanupFailure;
  console.log("SEC observation PostgreSQL cleanup verified: task container, volume, and temporary report removed.");
}

async function psql(sql, labelText) {
  await run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-c", sql], { capture: true });
  console.log(labelText);
}

try {
  await run("docker", ["info", "--format", "{{.ServerVersion}}"], { capture: true }).catch(error => {
    throw new Error("Docker Desktop is required and must be running. Install/start Docker Desktop, then rerun npm run test:sec-observation:postgres.", { cause: error });
  });

  selectedPort = await selectPort();
  await run("docker", ["volume", "create", "--label", label, volume], { capture: true });
  await run("docker", [
    "run", "--detach", "--name", container,
    "--label", label,
    "--publish", `127.0.0.1:${selectedPort}:5432`,
    "--volume", `${volume}:/var/lib/postgresql/data`,
    "--env", "POSTGRES_USER=postgres",
    "--env", `POSTGRES_PASSWORD=${password}`,
    "--env", `POSTGRES_DB=${database}`,
    "postgres:17-alpine",
  ], { capture: true });

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const check = await run("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", database], { capture: true }).catch(() => null);
    if (check) { ready = true; break; }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1000));
  }
  if (!ready) throw new Error("SEC_OBSERVATION_TEST_POSTGRES_NOT_READY: the task-owned container did not become ready within 60 seconds.");

  const bootstrap = `
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `;
  await run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: bootstrap, capture: true });

  const migrationsDir = join(root, "supabase", "migrations");
  const migrations = (await readdir(migrationsDir)).filter(name => name.endsWith(".sql")).sort();
  if (migrations.length === 0) throw new Error("SEC_OBSERVATION_TEST_NO_MIGRATIONS_FOUND");
  for (const migration of migrations) {
    const sql = await readFile(join(migrationsDir, migration), "utf8");
    await run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: sql, capture: true });
  }
  console.log(`Applied ${migrations.length} repository SQL migrations to the task-owned database.`);

  if (failureProbe) {
    await psql("drop table public.intelligence_ingestion_requests cascade", "Armed isolated test-failure cleanup probe.");
  }

  const testUrl = `postgresql://postgres:postgres@127.0.0.1:${selectedPort}/${database}`;
  const env = { ...process.env, MM_SEC_OBSERVATION_TEST_DATABASE_URL: testUrl };
  const vitest = resolve(root, "node_modules", "vitest", "vitest.mjs");
  await run(process.execPath, [vitest, "run", "--config", "vitest.config.ts", integrationTest, "--reporter=json", "--outputFile", reportPath], { env, capture: false });

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const target = report.testResults?.flatMap(file => file.assertionResults ?? []).find(result =>
    result.fullName?.includes("SEC EDGAR observation PostgreSQL Unit of Work integration")
    && result.title === "commits the complete metadata-only transition, replays idempotently, and serializes concurrent replays");
  if (!target || target.status !== "passed") {
    throw new Error(`SEC_OBSERVATION_TEST_CASE_NOT_CONFIRMED status=${target?.status ?? "missing"}`);
  }
  if (failureProbe) throw new Error("SEC_OBSERVATION_TEST_FAILURE_PROBE_EXPECTED_TEST_FAILURE_BUT_TEST_PASSED");
  console.log("Confirmed the SEC observation PostgreSQL integration case passed (not skipped).");
} catch (error) {
  primaryError = error;
} finally {
  process.off("SIGINT", signalHandler);
  process.off("SIGTERM", signalHandler);
  try {
    await cleanup();
  } catch (error) {
    if (!primaryError) primaryError = error;
    else console.error(`Cleanup also failed: ${error.message}`);
  }
}

if (primaryError) {
  console.error(primaryError.message);
  process.exitCode = interrupted ? 130 : 1;
} else {
  console.log("SEC observation PostgreSQL integration setup completed successfully.");
}
