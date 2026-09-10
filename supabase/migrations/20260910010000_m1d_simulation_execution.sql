-- M1D deterministic simulation execution. All writes remain server-side.
alter type public.ledger_transaction_type add value if not exists 'SIMULATED_BUY_SETTLEMENT';

create table public.simulation_executions (
  id uuid primary key,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  strategy_decision_id uuid not null references public.strategy_decisions(id) on delete restrict,
  proposed_order_id uuid not null references public.proposed_orders(id) on delete restrict,
  idempotency_record_id uuid not null unique references public.idempotency_records(id) on delete restrict,
  ledger_transaction_id uuid not null unique references public.ledger_transactions(id) on delete restrict,
  state text not null check (state in ('CREATED','VALIDATED','RISK_APPROVED','FILLED','REJECTED')),
  execution_timestamp timestamptz not null,
  quantity_atoms numeric(38,0) not null check (quantity_atoms > 0),
  quantity_scale integer not null check (quantity_scale between 0 and 8),
  reference_price_atoms numeric(38,0) not null check (reference_price_atoms > 0),
  reference_price_scale integer not null check (reference_price_scale between 0 and 8),
  execution_price_atoms numeric(38,0) not null check (execution_price_atoms > 0),
  execution_price_scale integer not null check (execution_price_scale between 0 and 8),
  currency_code text not null check (currency_code in ('NOK','USD','EUR')),
  gross_notional_atoms numeric(38,0) not null check (gross_notional_atoms >= 0),
  fee_atoms numeric(38,0) not null check (fee_atoms >= 0),
  total_cash_debit_atoms numeric(38,0) not null check (total_cash_debit_atoms >= 0),
  execution_policy_version text not null,
  spread_slippage_policy_version text not null,
  fee_policy_version text not null,
  rounding_policy_version text not null,
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (proposed_order_id)
);

create table public.simulation_fills (
  id uuid primary key,
  simulation_execution_id uuid not null unique references public.simulation_executions(id) on delete restrict,
  proposed_order_id uuid not null unique references public.proposed_orders(id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  ledger_transaction_id uuid not null unique references public.ledger_transactions(id) on delete restrict,
  quantity_atoms numeric(38,0) not null check (quantity_atoms > 0),
  quantity_scale integer not null check (quantity_scale between 0 and 8),
  reference_price_atoms numeric(38,0) not null check (reference_price_atoms > 0),
  execution_price_atoms numeric(38,0) not null check (execution_price_atoms > 0),
  price_scale integer not null check (price_scale between 0 and 8),
  currency_code text not null check (currency_code in ('NOK','USD','EUR')),
  gross_notional_atoms numeric(38,0) not null check (gross_notional_atoms >= 0),
  fee_atoms numeric(38,0) not null check (fee_atoms >= 0),
  total_cash_debit_atoms numeric(38,0) not null check (total_cash_debit_atoms >= 0),
  execution_policy_version text not null,
  spread_slippage_policy_version text not null,
  fee_policy_version text not null,
  rounding_policy_version text not null,
  execution_timestamp timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.execution_audit_events (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  execution_id uuid not null unique references public.simulation_executions(id) on delete restrict,
  command_id uuid not null unique references public.idempotency_records(id) on delete restrict,
  command_type text not null,
  idempotency_key text not null,
  outcome text not null check (outcome in ('FILLED','REJECTED','FAILED')),
  evidence jsonb not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create index simulation_executions_account_idx on public.simulation_executions(financial_account_id, created_at desc);
create index simulation_fills_account_idx on public.simulation_fills(financial_account_id, created_at desc);
create index execution_audit_events_account_idx on public.execution_audit_events(financial_account_id, occurred_at desc);

create function public.m1d_immutable() returns trigger language plpgsql as $$
begin raise exception '% records are append-only', tg_table_name; end; $$;
create trigger simulation_executions_immutable before update or delete on public.simulation_executions for each row execute function public.m1d_immutable();
create trigger simulation_fills_immutable before update or delete on public.simulation_fills for each row execute function public.m1d_immutable();
create trigger execution_audit_events_immutable before update or delete on public.execution_audit_events for each row execute function public.m1d_immutable();

alter table public.simulation_executions enable row level security;
alter table public.simulation_fills enable row level security;
alter table public.execution_audit_events enable row level security;
create policy "execution owner read" on public.simulation_executions for select to authenticated using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "fill owner read" on public.simulation_fills for select to authenticated using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "execution audit owner read" on public.execution_audit_events for select to authenticated using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
