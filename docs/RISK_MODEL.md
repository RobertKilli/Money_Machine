# Risk Model and Financial Safety Controls

The complete M1 rule set and its versioned thresholds are canonical in [Financial Policies](FINANCIAL_POLICIES.md) as `m1-risk-policy/v1`.

## 1. Authority and separation

The control path is non-negotiable: **Strategy Engine → Risk Engine → Execution Engine → Ledger**. A strategy returns a deterministic `StrategyProposal` only. It cannot change cash, positions, orders, trades, snapshots, or ledger entries. Risk evaluates the proposal against a frozen account/portfolio/data context and may approve, resize, reject, or halt. Execution rejects anything that is not validated and risk-approved, then applies its recorded simulated fill policy and posts a balanced settlement transaction.

Platform halt → FinancialAccount/portfolio kill switch → data validity → eligibility → hard risk rules → strategy proposal → execution policy is the precedence order. Failures in any higher gate fail closed.

## 2. M1 deterministic rules

| Rule | Required evidence | Action |
| --- | --- | --- |
| Simulation-only account | account mode | reject non-simulation action |
| Ownership/status | authenticated owner, account/portfolio active | reject |
| Data eligibility | fixture price exists and `availableAt <= decisionTimestamp` | halt/reject |
| Curated universe | active, base-currency-eligible asset | reject |
| Virtual cash availability | ledger-derived cash after fees/order | resize or reject |
| Cash reserve | frozen 1000-bps decision-NAV reserve after trade | resize or reject |
| Per-asset concentration | deterministic post-trade valuation | resize or reject |
| Strategy allocation cap | assignment/profile cap | resize or reject |
| No leverage/shorting | post-trade cash and quantity | reject |
| Minimum order/dust | one asset-registry quantity increment plus explicit fee/reserve affordability | reject |
| Kill switch | platform/account/portfolio state | reject |

Each published rule has a stable ID/version, priority, explicit inputs, comparison, scale/rounding, outcome, and human explanation. `m1-risk-policy/v1` additionally locks strategy-version/asset-registry validation, idempotency, non-negative cash/quantity, exact fixture allocation limits, and the no-side-effect veto behavior. Defaults are product examples, not personal suitability advice. Composite opportunity/risk scores, volatility targeting, drawdown throttles, correlation models, VaR/expected shortfall, and optimisation are not M1 controls; they need validated data/methodology before being considered.

## 3. Execution and monetary safety

Risk approval is tied to one proposal, FinancialAccount, portfolio, versions, input hash, approved amount/quantity, and short expiry. Changes to any of those invalidate approval. Execution verifies this binding, locks the account/order, rechecks terminal conditions and available cash, and atomically records the simulated fill, cost basis, balanced ledger transaction, audit event, and idempotent outcome. It never trusts an amount, price, strategy version, or risk result supplied by the browser.

Only the authoritative server can create approvals or settle a fill. A new command/correlation record is required for a correction; it posts a linked reversing journal and never mutates history. A fill uses a declared fixture price and fee/spread/slippage model. If that price is unavailable, invalid, or stale under policy, execution does not occur.

## 4. Safety communications and future limits

M1 labels all balances, orders, fills, and returns as virtual simulation. Backtests/paper results are historical/simulated observations, not predictions. Risk controls constrain a model; they do not guarantee outcomes. Avoid language such as “autopilot,” “safe income,” or “optimised return.”

Paper trading and real execution are separate future product phases. They require an approved market-data licence, market calendar and price freshness behavior, stronger partial-fill/reconciliation rules, legal analysis, operational controls, and a new product/security review. Broker, banking, custody, payment, wallet, AI/LLM decision-making, and real money are expressly excluded from M1.
