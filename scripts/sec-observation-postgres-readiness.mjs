export async function waitForSecObservationDatabase({ run, container, database, ensureWorkNotInterrupted, timeoutMs = 60_000, pollIntervalMs = 500, now = () => performance.now(), sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const deadline = now() + timeoutMs;
  while (true) {
    ensureWorkNotInterrupted();
    try {
      const remainingForServerProbe = deadline - now();
      if (remainingForServerProbe <= 0) throw new Error("SEC_OBSERVATION_TEST_POSTGRES_NOT_READY");
      // pg_isready can succeed against postgres:17-alpine's socket-only init
      // server, before POSTGRES_DB has been created and before the final server
      // starts. It is only a preliminary check; the TCP SQL query below is the
      // readiness condition and cannot reach that temporary server.
      await run("docker", ["exec", container, "pg_isready", "-U", "postgres", "-d", "postgres"], { capture: true, timeoutMs: remainingForServerProbe });
      const remainingForSqlProbe = deadline - now();
      if (remainingForSqlProbe <= 0) throw new Error("SEC_OBSERVATION_TEST_POSTGRES_NOT_READY");
      const probe = await run("docker", ["exec", "--env", "PGPASSWORD=postgres", "-i", container, "psql", "-w", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-h", "127.0.0.1", "-p", "5432", "-d", database, "-Atqc", "select current_database()"], { capture: true, timeoutMs: remainingForSqlProbe });
      ensureWorkNotInterrupted();
      if (probe.output.trim() === database) return;
    } catch {
      // Startup failures, including database does not exist and connection
      // refused while the init server is being replaced, are retried only as
      // readiness probes. The integration test itself is never rerun here.
      ensureWorkNotInterrupted();
    }

    const remaining = deadline - now();
    if (remaining <= 0) throw new Error(`SEC_OBSERVATION_TEST_POSTGRES_NOT_READY: no successful SQL connection to task database within ${timeoutMs}ms.`);
    await sleep(Math.min(pollIntervalMs, remaining));
  }
}
