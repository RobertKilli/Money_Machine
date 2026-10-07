# Local SEC observation PostgreSQL integration test

Run the existing SEC observation PostgreSQL integration case against a fresh, task-owned Docker database:

```powershell
npm run test:sec-observation:postgres
```

The command requires Node.js/npm, installed repository dependencies (`npm ci`), Docker CLI, and a running Docker Desktop daemon. It does not read `.env` files, use Supabase CLI, access hosted databases, or make SEC/provider requests. It applies every SQL file under `supabase/migrations` in lexical filename order.

The runner creates a random container and named volume, labels both with a task identity, chooses a free port in the integration test's permitted range (`55439`–`56999`), and publishes PostgreSQL only on `127.0.0.1`. The database name and credentials satisfy the test's disposable-database guard. A minimal local `auth` schema, `auth.users` table, `auth.uid()` function, and Supabase role names provide migration prerequisites; no hosted auth service is involved. `MM_SEC_OBSERVATION_TEST_DATABASE_URL` is added only to the Vitest child process environment.

Vitest emits a temporary JSON report. The runner requires the named PostgreSQL integration case to have status `passed`, so an omitted or skipped case fails the command. The report is stored in a unique OS temporary directory and removed during teardown.

The `finally` teardown force-removes only the uniquely named task container and volume, removes the temporary report directory, and verifies that those resources no longer exist. Cleanup runs after success, test failure, and handled `Ctrl+C`/`SIGTERM`. To exercise cleanup after a real integration-test failure, run:

```powershell
node scripts/run-sec-observation-postgres-test.mjs --test-failure-probe
```

That probe removes a required table with `CASCADE` only inside its newly created disposable database, runs the existing test (which must fail), and still requires verified cleanup. Do not run it against any other database; the runner does not accept a caller-supplied database URL.

If Docker is missing or stopped, the command exits with an instruction to install/start Docker Desktop. A forced process termination, machine shutdown, or Docker daemon failure can prevent Node.js from running `finally`; in that case uniquely labeled resources may remain. Inspect resources using the `money-machine.sec-observation-test` Docker label and remove only resources carrying that label. Normal `Ctrl+C` is handled and cleanup is verified before exit.
