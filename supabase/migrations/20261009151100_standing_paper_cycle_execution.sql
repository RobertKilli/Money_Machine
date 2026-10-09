-- Explicit opt-in paper-cycle contract for deterministic BUY / SELL / HOLD.
-- Existing v1 policy rows and the hosted worker remain on their prior path.

alter type public.ledger_transaction_type add value if not exists 'SIMULATED_SELL_SETTLEMENT';

alter table public.standing_paper_fills
  add column side text not null default 'BUY' check (side in ('BUY', 'SELL')),
  alter column acquisition_json drop not null,
  add column disposal_json jsonb,
  add constraint standing_paper_fill_material_shape check (
    (side = 'BUY' and acquisition_json is not null and disposal_json is null) or
    (side = 'SELL' and acquisition_json is null and disposal_json is not null)
  );

create table public.standing_paper_cycle_decisions (
  policy_id text not null references public.standing_paper_policies(policy_id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  decision_id text not null,
  order_id text not null,
  action text not null check (action in ('BUY', 'SELL', 'HOLD')),
  reason_code text not null check (reason_code in (
    'BUY_FILLED', 'BUY_RISK_REJECTED', 'SELL_STOP_LOSS', 'SELL_TAKE_PROFIT',
    'SELL_MAX_HOLD', 'SELL_ORDER_LIMIT_REJECTED', 'HOLD_NO_EXIT_TRIGGER'
  )),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  decision_json jsonb not null,
  run_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (financial_account_id, policy_id, decision_id),
  foreign key (run_id, policy_id, financial_account_id)
    references public.standing_paper_runs(id, policy_id, financial_account_id) on delete restrict,
  check (
    (action = 'BUY' and reason_code in ('BUY_FILLED', 'BUY_RISK_REJECTED')) or
    (action = 'SELL' and reason_code in ('SELL_STOP_LOSS', 'SELL_TAKE_PROFIT', 'SELL_MAX_HOLD', 'SELL_ORDER_LIMIT_REJECTED')) or
    (action = 'HOLD' and reason_code = 'HOLD_NO_EXIT_TRIGGER')
  )
);

alter table public.standing_paper_cycle_decisions enable row level security;
create policy "standing paper cycle decisions owner read"
  on public.standing_paper_cycle_decisions for select to authenticated
  using (exists (
    select 1 from public.financial_accounts fa
    where fa.id = financial_account_id and fa.owner_id = (select auth.uid())
  ));
revoke all on table public.standing_paper_cycle_decisions from anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.standing_paper_cycle_decisions to authenticated;

create trigger standing_paper_cycle_decisions_immutable before update or delete
  on public.standing_paper_cycle_decisions for each row execute function public.standing_paper_append_only();

create table public.standing_paper_cycle_decision_audit (
  policy_id text not null,
  financial_account_id uuid not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  decision_id text not null,
  action text not null check (action in ('BUY', 'SELL', 'HOLD')),
  reason_code text not null,
  disposition text not null check (disposition in ('EXECUTED', 'REJECTED', 'HOLD')),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  output_hash text not null check (output_hash ~ '^[0-9a-f]{64}$'),
  policy_versions jsonb not null,
  occurred_at timestamptz not null,
  primary key (financial_account_id, policy_id, decision_id),
  foreign key (financial_account_id, policy_id, decision_id)
    references public.standing_paper_cycle_decisions(financial_account_id, policy_id, decision_id) on delete restrict
);
alter table public.standing_paper_cycle_decision_audit enable row level security;
create policy "standing paper cycle decision audit owner read"
  on public.standing_paper_cycle_decision_audit for select to authenticated
  using (exists (
    select 1 from public.financial_accounts fa
    where fa.id = financial_account_id and fa.owner_id = (select auth.uid())
  ));
revoke all on table public.standing_paper_cycle_decision_audit from anon, authenticated;
grant select on table public.standing_paper_cycle_decision_audit to authenticated;
create trigger standing_paper_cycle_decision_audit_immutable before update or delete
  on public.standing_paper_cycle_decision_audit for each row execute function public.standing_paper_append_only();

comment on column public.standing_paper_fills.disposal_json is
  'FIFO lot consumption and realized result for explicit standing-paper-cycle/v2 SELL fills; null for BUY fills.';
comment on table public.standing_paper_cycle_decisions is
  'Append-only BUY/SELL/HOLD input-hashed decisions for the explicitly selected paper-cycle/v2 contract.';
comment on table public.standing_paper_cycle_decision_audit is
  'Append-only versioned audit companion for every explicit standing-paper-cycle/v2 decision.';
