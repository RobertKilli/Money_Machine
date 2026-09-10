# Money Machine Engineering Rules

These rules apply to every future change in this repository.

## Safety and scope

- Never commit or push unless the user explicitly instructs it.
- Never connect, hold, move, or use real money without explicit instruction and an approved, separately scoped product phase.
- Never introduce broker, bank, payment, custody, wallet, or execution integrations during simulation milestones.
- Never represent simulated, backtested, or paper-trading performance as real investment performance, a forecast, or a guarantee.
- Do not read, print, commit, or expose secrets, credentials, or `.env` contents.
- Do not make external changes—including account, cloud, database, vendor, or API changes—without explicit authorization.

## Financial domain rules

- Scope every financial record through an owned `FinancialAccount`; do not make the core single-user by assumption.
- Treat the double-entry ledger as the authoritative financial record. Use reversal/correction transactions, never silent historical mutation or deletion.
- Never use JavaScript `number` or binary floating point for authoritative money, asset quantity, price, ledger, or risk-calculation values.
- Separate `Money` (currency minor units) from `AssetQuantity` (asset atomic units and declared scale).
- Every monetary command must be idempotent and every monetary mutation must be auditable.
- Strategy Engine may only propose intent. It cannot directly mutate financial state.
- Risk Engine has veto power. Execution accepts only validated, risk-approved orders.
- Prefer deterministic calculations, explicit rounding, versioned inputs, and fail-closed handling of invalid/missing financial data.
- All financial domain logic requires focused automated tests, including invariants and idempotency.
- Treat `docs/FINANCIAL_POLICIES.md` as the canonical Milestone 1 source for precision, rounding, FIFO, synthetic assets, execution, fees, risk thresholds, versions, and test requirements. Do not duplicate or silently change those policies.

## Engineering approach

- Keep the MVP a modular monolith; avoid premature microservices and unnecessary dependencies.
- Keep privileged credentials and every authoritative financial state transition server-side. The browser only requests commands and displays projections.
- Preserve clear simulation boundaries and use fixture data until a later, explicitly approved market-data phase.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
