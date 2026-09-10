# Money Machine

Money Machine is a **simulation-first personal financial operating system**. It helps a user model virtual deposits, test rule-based allocation strategies, evaluate risk, and observe paper-trading performance using auditable, reproducible financial calculations.

It does not accept, custody, transfer, invest, or guarantee returns on real money. It is not investment advice.

## Current status

Milestone 1B provides the first complete simulation-only capital loop: an authenticated user is provisioned one default NOK simulation FinancialAccount, submits a virtual deposit through a server action, and sees ledger-derived cash/activity. The production adapter uses one server-only direct PostgreSQL transaction for idempotency, balanced journal persistence, and audit evidence. No Supabase project, external market-data connection, broker integration, or real-money capability has been created.

## Product principles

- Capital preservation and explicit loss limits take priority over return maximization.
- All financial state is simulated until a later, separately authorized product phase.
- Risk controls override every strategy recommendation.
- AI, if introduced, may analyze and explain; it cannot authorise or execute transactions.
- Every decision and monetary state transition must be reproducible and auditable.
- FinancialAccount is the ownership boundary: it has an explicit base currency (NOK by default) and owns portfolios, ledger, strategy assignments, and risk configuration.
- The authoritative record is a multi-commodity double-entry ledger; projections are reconciled and rebuildable.
- Money and fractional asset quantities use separate integer atomic-value types with explicit, immutable scales—never binary floating point.

## Documentation

- [Product proposal](docs/PRODUCT_PROPOSAL.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Domain model](docs/DOMAIN_MODEL.md)
- [Milestone 0 financial policies](docs/FINANCIAL_POLICIES.md)
- [Risk model](docs/RISK_MODEL.md)
- [MVP roadmap](docs/MVP_ROADMAP.md)

## Local development

Use Node.js and npm, then copy `.env.example` to `.env.local`. Authentication needs the Supabase publishable URL/key. The M1B ledger transaction additionally needs a server-only `DATABASE_URL` to a PostgreSQL database with the checked-in migrations applied. Do not put service-role, database, or other secret credentials in browser-exposed variables.

```bash
npm run dev
npm run test
npm run typecheck
npm run lint
npm run build
```

## Development database integration tests

`npm run test:integration` is deliberately separate from the pure financial
unit suite. It loads only local environment configuration and refuses to run
unless both `MONEY_MACHINE_INTEGRATION_TEST=1` and the explicitly approved
`MONEY_MACHINE_INTEGRATION_PROJECT_REF` are set. This prevents accidental
execution against an unrelated or production database. It requires the
server-only `DATABASE_URL`; never put that value in a `NEXT_PUBLIC_*` variable.

Financial entry points are `src/domain/financial`, `src/domain/ledger`, `src/application/deposits`, and the server-only `src/infrastructure/postgres` adapter. The SQL schema source is `supabase/migrations`; M1B.5 applied it only to the authorized Money Machine development project, never to production or another project.

## Proposed first implementation milestone

Build a vertical slice of the deterministic simulator: authentication; an owned FinancialAccount; virtual deposit; double-entry ledger and cash balance; small curated asset universe and fixture prices; one deterministic strategy; hard risk rules; simulated order/fill; positions and snapshot; append-only decision/audit log; and a read-only dashboard. No live market data, brokers, banks, AI, or paper trading.
