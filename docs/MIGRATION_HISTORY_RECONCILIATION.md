# Migration History Reconciliation

Audit date: 2026-09-16. Project ref: `flsfallpputejojncyue`.

This document reconciles repository filenames with retained hosted migration
history. It does not record credentials, connection strings, or row data.

## Applied migration filename alignment

| Repository filename before | Hosted version / name | Repository filename after | Classification |
| --- | --- | --- | --- |
| `20260909000000_m1a_financial_foundation.sql` | `20260909213938 m1a_financial_foundation` | `20260909213938_m1a_financial_foundation.sql` | SEMANTICALLY_EQUIVALENT |
| `20260909010000_m1b_persistence_virtual_capital.sql` | `20260909214003 m1b_persistence_virtual_capital` | `20260909214003_m1b_persistence_virtual_capital.sql` | SEMANTICALLY_EQUIVALENT |
| `20260909214106_m1b5_harden_function_search_path.sql` | `20260909214128 m1b5_harden_function_search_path` | `20260909214128_m1b5_harden_function_search_path.sql` | SEMANTICALLY_EQUIVALENT |
| `20260909214651_m1b5_fix_financial_link_triggers.sql` | `20260909214733 m1b5_fix_financial_link_triggers` | `20260909214733_m1b5_fix_financial_link_triggers.sql` | SEMANTICALLY_EQUIVALENT |
| `20260910000000_m1c_strategy_risk_decisions.sql` | `20260909235514 m1c_strategy_risk_decisions` | `20260909235514_m1c_strategy_risk_decisions.sql` | SEMANTICALLY_EQUIVALENT |
| `20260910000100_m1c_decision_audit.sql` | `20260909235605 m1c_decision_audit` | `20260909235605_m1c_decision_audit.sql` | SEMANTICALLY_EQUIVALENT |
| `20260912000000_m8_notification_transport.sql` | `20260910200831 m8_notification_transport` | `20260910200831_m8_notification_transport.sql` | SEMANTICALLY_EQUIVALENT |
| `20260913000000_m8_test_notification_invocations.sql` | `20260910210425 m8_test_notification_invocations` | `20260910210425_m8_test_notification_invocations.sql` | SEMANTICALLY_EQUIVALENT |
| `20260915000000_m8_suppression_events.sql` | `20260910213619 m8_suppression_events_v2` | `20260910213619_m8_suppression_events_v2.sql` | SEMANTICALLY_EQUIVALENT |
| `20260913153948_m4_m5_canonical_evidence.sql` | `20260913153948 m4_m5_canonical_evidence` | unchanged | EXACT_EQUIVALENT |

The hosted SQL retained in `supabase_migrations.schema_migrations.statements`
was compared for tables, columns, constraints, indexes, RLS, privileges,
functions, and triggers before assigning these classifications.

## M8 split

The old `20260914000000_m8_delivery_claims.sql` combined two separately
recorded hosted statements. It is replaced by the exact semantic boundaries:

- `20260910213111_m8_delivery_claims.sql`
- `20260910213331_m8_suppression_events.sql`

The split prevents one repository file from claiming two distinct hosted
ledger versions. The v2 suppression migration is separately represented by
`20260910213619_m8_suppression_events_v2.sql`.

## Schema-present, history-missing migrations

`20260910010000_m1d_simulation_execution.sql` and
`20260911000000_m3_intelligence_foundation.sql` remain unchanged. Their
schemas are present hosted, but their versions are absent from hosted
migration history.

Catalog evidence checked for M1D: tables, columns, primary/unique/foreign-key
and check constraints, indexes, RLS, authenticated read policies, immutable
triggers, and the hardened `m1d_immutable` function.

Catalog evidence checked for M3: provider/dataset/news/market/macro/mapping
tables, columns, unique and temporal constraints, RLS, immutable triggers,
and `reject_intelligence_mutation`.

Future hosted history repair, **NOT EXECUTED**:

```powershell
npx.cmd supabase migration repair `
  --project-ref flsfallpputejojncyue `
  --status applied `
  20260910010000 `
  20260911000000
```

## Pending feature migrations

These are not part of this reconciliation branch and are **NOT APPLIED**:

- `20260913224000_canonical_context_compatibility.sql`
- `20260913231740_m5_raw_evidence.sql`
- `20260914000100_canonical_material_availability.sql`

## Rollback

Before any hosted history repair, roll back repository reconciliation with a
normal Git revert. Do not use migration repair, reset, or schema changes as a
substitute for a reviewed rollback.
