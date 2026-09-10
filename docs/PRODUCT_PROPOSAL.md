# Product Proposal: Money Machine

## 1. Product vision

Money Machine is a simulation-first web application for disciplined, explainable financial workflows. A user creates a virtual FinancialAccount, records virtual capital, applies transparent rules, and learns how those rules allocate and perform under disclosed assumptions. It is not investment advice, does not guarantee returns, and does not accept or execute real money.

The long-term vision may become a personal financial operating system. The intentionally narrower MVP is a safe educational portfolio simulator whose financial core is fit to support multiple users later without a rewrite.

## 2. Core user problem and target user

The target user is a self-directed, financially curious individual who wants a repeatable alternative to spreadsheets without risking capital. They need to understand what a ruleset proposed, what risk controls permitted or blocked, what virtual state changed, and which historical/fixture evidence was used.

The MVP user does not need autonomous real-money management, opaque opportunity scores, or personal investment advice.

## 3. MVP scope

The exact precision, rounding, FIFO, fixture universe, execution, fee, risk, versioning, audit, and test policies are locked in [Financial Policies](FINANCIAL_POLICIES.md).

M1 provides:

- Authentication and `User → FinancialAccount → Portfolio/Ledger/Strategy/Risk` ownership.
- FinancialAccounts with an explicit base currency; NOK is the default, not a hard-coded engine constraint.
- Virtual deposits through idempotent server commands and an authoritative multi-commodity double-entry ledger.
- Ledger-derived virtual cash, virtual portfolios, positions, cost basis, and immutable snapshots.
- A small curated asset universe with fixture prices and explicit availability timestamps; no external market-data connection.
- One versioned deterministic contribution-rebalancing strategy that only proposes purchase intent.
- Versioned hard risk rules with veto/resize power over all strategy proposals.
- MARKET-only, full-or-no-fill simulated order lifecycle, deterministic versioned fee/spread/slippage assumptions, and ledger settlement.
- Append-only DecisionLog/AuditEvent evidence for commands, proposals, risk outcomes, fills, and journals.
- A read-only dashboard for virtual cash, positions, allocation, order/activity state, risk outcomes, snapshot, and explanations.

The M1 fixture replay proves a deterministic decision clock and fill behavior based only on already-available prices. Full historical backtesting, paper trading, and live data are later milestones.

## 4. Explicit non-goals

- Receiving, holding, moving, investing, or withdrawing real user money.
- Broker, bank, payment, custody, wallet, tax-filing, KYC/AML, or real execution integrations.
- Live market APIs, paper trading, crypto-wallet support, social/copy trading, or shared/team accounts.
- Personalised investment advice, suitability determinations, guaranteed-return claims, or performance forecasts.
- AI/LLM financial decisions, AI-written strategies, machine learning, or autonomous optimisation.
- FX conversion, cross-currency portfolios, leverage, shorting, derivatives, or margin.
- Advanced charting, microservices, Python compute services, or unnecessary dependencies.

## 5. Functional requirements

| Area | M1 requirement |
| --- | --- |
| Identity | Authenticate and authorise FinancialAccount ownership; display simulation disclosures. |
| Financial state | Accept idempotent virtual deposits; post immutable balanced journals; derive cash and positions. |
| Portfolio | Create account-owned portfolio configuration and show projections/snapshots. |
| Strategy | Evaluate one deterministic published version against a specified fixture cutoff; produce explanation-backed intent only. |
| Risk | Evaluate every proposal in priority order; persist each result; approve, resize, reject, or halt. |
| Execution | Accept only validated, risk-approved orders; create deterministic virtual fill and one settlement journal. |
| Data | Use curated fixture assets/prices with market observed, available, and ingested timestamps. |
| Audit | Show immutable chronological events linking command, strategy/risk versions, data, order/fill, and ledger effect. |
| Dashboard | Read server projections; never calculate or mutate authoritative financial state in the browser. |

## 6. Product safety and legal posture

All M1 balances, orders, fills, and performance are virtual simulations. The product must explain that historical/simulated outputs are not predictions and that risk controls do not eliminate loss. If a future product crosses into personal recommendations, order routing, custody, payments, or real execution, regulatory analysis is a blocking workstream requiring jurisdiction-specific counsel, market-data licensing review, consumer-protection review, and an approved new architecture proposal.

Avoid a single “opportunity score,” expected-return claim, or generic “risk score” in M1. Present the measurable input, rule, threshold, data freshness, uncertainty, and decision outcome instead.

## 7. M1 dashboard/pages

- `/` — simulation disclosure, virtual NAV/cash, deposits, allocation, risk banner, and recent audit events.
- `/portfolios/[id]` — positions, actual/target allocation, latest snapshot, decisions, and reconciled ledger summaries.
- `/deposits` — virtual-deposit command and immutable history.
- `/strategies` — enabled strategy version, inputs, constraints, and proposal history.
- `/risk` — profile/rule versions, active limits, rejections, and kill-switch state.
- `/activity` — order/fill lifecycle, rejected proposals, ledger effect, and DecisionLog detail.
- `/settings` — account base-currency display, profile/disclosures, account deletion/export requests.

## 8. Assumptions and open questions

Assumptions: one operating jurisdiction and one owner per FinancialAccount; NOK is the default base currency; M1 assets share the account currency; fixture/end-of-day data is adequate; and the initial universe is small and curated.

Open questions: operating jurisdiction/legal entity; future historical benchmark methodology and licensed market-data scope; audit retention; and when/if organisations or shared accounts should be separately designed. These are not M1 monetary-behavior blockers.
