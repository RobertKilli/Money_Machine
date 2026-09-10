# MVP Roadmap

## Milestone 0 — Financial foundations (policy locked)

The precision registry, explicit rounding, FIFO, synthetic asset universe, fixture-market availability model, MARKET execution, 10 bps fee, spread/slippage, risk rules, audit fields, versions, and mandatory tests are locked in [Financial Policies](FINANCIAL_POLICIES.md). Jurisdiction, legal entity, and future real-money regulation remain intentionally unresolved and out of M1 scope.

## Milestone 1 — Deterministic simulator vertical slice

Implement exactly:

- Authentication and `User → FinancialAccount → Portfolio/Ledger/Strategy/Risk` authorization.
- FinancialAccount with explicit base currency and simulation mode.
- Virtual deposit command, multi-commodity double-entry ledger, and ledger-derived virtual cash.
- Small curated asset universe and fixed fixture market prices with availability timestamps.
- One deterministic contribution-rebalancing strategy that emits intent only.
- Hard deterministic risk rules and durable risk assessments.
- MARKET-only full-or-no-fill simulated order/fill state machine, FIFO cost basis, deterministic versioned fee/spread/slippage policy, and balanced settlement journal.
- Position projection, portfolio snapshot, DecisionLog/AuditEvent, and read-only dashboard.
- Automated invariant, idempotency, ownership, risk-veto, state-machine, look-ahead, journal-balance, and deterministic-replay tests.

M1 expressly excludes AI, ML, LLM decisions, live market APIs, paper trading, broker/bank/payment integration, real money, crypto wallets, social features, advanced charting, microservices, and a general backtesting platform.

## Milestone 2 — Historical data and backtesting

Add approved versioned historical dataset imports, data validation/quarantine, full backtest jobs, time-series snapshots, validated metrics, disclosures, benchmark comparison, and adversarial tests for look-ahead and survivorship bias. Pin data, strategy, risk, cost, corporate-action, calendar, engine, and random-seed inputs in every run.

## Milestone 3 — Paper trading

Add an isolated paper FinancialAccount, licensed delayed/live data adapter, explicit fill policy, market-calendar/freshness handling, partial-fill lifecycle, reconciliation, and clear dashboard labelling. Complete an operational and legal review before widening strategy scope.

## Milestone 4 — Product hardening

Add export/delete flows, accessibility review, load testing, threat modeling, RLS/authorization tests, restore drills, operational alerting, market-data licence review, and independent methodology review.

## Later, gated exploration

Only after milestones 1–4 are demonstrated: more transparent strategies, analytical research tooling, AI-assisted analysis without execution authority, and broker-integration discovery. Real-money capability requires a new approved proposal covering licensing, custody, KYC/AML, suitability, consent, reconciliation, incident response, capital requirements, and jurisdiction-specific counsel.

## Definition of ready

- Inputs, outputs, limits, disclosures, and non-goals are written and reviewed.
- Financial values have fixed representations/scales and golden expected results.
- Commands are authorized, idempotent, transactional, auditable, and visible to the user.
- Ledger/projection reconciliation and all domain invariants are automated tests.
- Simulation and future paper/real modes are unambiguous in code and UI.
