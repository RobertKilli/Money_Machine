# Local SEC observation PostgreSQL integration test

Run the existing SEC observation PostgreSQL integration case against a fresh, task-owned Docker database:

```powershell
npm run test:sec-observation:postgres
```

The command requires Node.js/npm, installed repository dependencies (`npm ci`), Docker CLI, and a running Docker Desktop daemon. It does not read `.env` files, use Supabase CLI, access hosted databases, or make SEC/provider requests. It applies every SQL file under `supabase/migrations` in lexical filename order.

The runner creates a random container and named volume, labels both with a task identity, chooses a free port in the integration test's permitted range (`55439`–`56999`), and publishes PostgreSQL only on `127.0.0.1`. The database name and credentials satisfy the test's disposable-database guard. A minimal local `auth` schema, `auth.users` table, `auth.uid()` function, and Supabase role names provide migration prerequisites; no hosted auth service is involved. `MM_SEC_OBSERVATION_TEST_DATABASE_URL` is added only to the Vitest child process environment.

Vitest emits a temporary JSON report. The runner requires the named PostgreSQL integration case to have status `passed`, so an omitted or skipped case fails the command. The report is stored in a unique OS temporary directory and removed during teardown.

The runner stops the readiness loop and checks the interruption flag before starting each next phase. Teardown has its own execution state: completed Docker cleanup commands are accepted even after an interrupt, while an active work command is stopped. Teardown independently attempts container removal, volume removal, and temporary-file removal, then verifies Docker resource absence and checks that both the report and its directory are gone. An inspection failure is reported but does not skip remaining removals or temporary-file cleanup.

To exercise cleanup after a real integration-test failure, run:

```powershell
node scripts/run-sec-observation-postgres-test.mjs --test-failure-probe
```

That probe removes a required table with `CASCADE` only inside its newly created disposable database, runs the existing test (which must fail), and still requires verified cleanup. Do not run it against any other database; the runner does not accept a caller-supplied database URL.

The interruption probe starts a task container and a long-running Docker child command, then waits for console `Ctrl+C`. It must stop the active child, skip readiness/migrations/tests, exit nonzero, and verify its container, volume, report file, and temporary directory are removed. In PowerShell/Windows Terminal, the host may report its own cancellation exit code instead of Node's configured `130`:

```powershell
node scripts/run-sec-observation-postgres-test.mjs --interrupt-after-container-probe
# Press Ctrl+C after the "Interrupt probe ready" message.
```

The cleanup-inspection probe forces Docker inspection to fail during teardown. It must still attempt removal of both named Docker resources, remove and verify the temporary report directory, and exit nonzero because Docker absence could not be verified:

```powershell
node scripts/run-sec-observation-postgres-test.mjs --cleanup-inspect-failure-probe
```

These paths were exercised on Windows with Docker Desktop: the normal command applied all 37 migrations and passed the existing PostgreSQL case; the failure probe made that case fail; the inspection probe failed verification after independently deleting its resources; and console `Ctrl+C` was sent after the container started while `docker exec ... sleep` was active. After interruption, checks found no task-labeled container or volume, no matching Docker child or runner process, and no `mm-sec-observation-test-*` temporary directory.

If Docker is missing or stopped, the command exits with an instruction to install/start Docker Desktop. Windows console `Ctrl+C` and delivered `SIGTERM` are handled. Forced process termination (for example, Task Manager/`Stop-Process`), machine shutdown, or Docker daemon failure can prevent complete verification and may leave uniquely labeled resources. Inspect resources using the `money-machine.sec-observation-test` Docker label and remove only resources carrying that label. A Docker-daemon failure is surfaced as cleanup failure; it is not reported as successful cleanup.
