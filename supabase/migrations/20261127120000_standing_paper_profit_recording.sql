-- Opt-in, record-only profit entitlements. No cash/reserve ledger transfer.
alter table public.standing_paper_policies add constraint standing_paper_policy_account_key
  unique (policy_id, financial_account_id);

create table public.standing_paper_profit_terms (
  policy_id text primary key,
  financial_account_id uuid not null unique references public.financial_accounts(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  recording_mode text not null check (recording_mode = 'RECORD_ONLY'),
  terms_hash text not null check (terms_hash ~ '^[a-f0-9]{64}$'),
  policy_confirmation_hash text not null check (policy_confirmation_hash ~ '^[a-f0-9]{64}$'),
  terms_json jsonb not null check (jsonb_typeof(terms_json) = 'object'),
  approved_at timestamptz not null default now(),
  foreign key (policy_id, financial_account_id) references public.standing_paper_policies(policy_id, financial_account_id) on delete restrict,
  unique (policy_id, financial_account_id, terms_hash)
);

create table public.standing_paper_profit_allocations (
  policy_id text not null,
  financial_account_id uuid not null,
  terms_hash text not null,
  settlement_id uuid not null references public.ledger_transactions(id) on delete restrict,
  fill_id text not null,
  run_id uuid not null,
  sequence numeric(38,0) not null check (sequence > 0),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  allocation_hash text not null check (allocation_hash ~ '^[a-f0-9]{64}$'),
  allocation_json jsonb not null check (jsonb_typeof(allocation_json) = 'object'),
  realized_pnl_minor numeric(38,0) not null,
  profit_high_water_minor numeric(38,0) not null check (profit_high_water_minor >= 0),
  protected_reserve_minor numeric(38,0) not null check (protected_reserve_minor >= 0),
  check (protected_reserve_minor <= profit_high_water_minor and realized_pnl_minor <= profit_high_water_minor),
  created_at timestamptz not null default now(),
  primary key (financial_account_id, policy_id, settlement_id),
  unique (financial_account_id, policy_id, sequence),
  unique (financial_account_id, policy_id, fill_id),
  foreign key (policy_id, financial_account_id, terms_hash) references public.standing_paper_profit_terms(policy_id, financial_account_id, terms_hash) on delete restrict,
  foreign key (financial_account_id, policy_id, fill_id) references public.standing_paper_fills(financial_account_id, policy_id, fill_id) on delete restrict,
  foreign key (run_id, policy_id, financial_account_id) references public.standing_paper_runs(id, policy_id, financial_account_id) on delete restrict
);

create function public.guard_paper_profit_terms() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.standing_paper_policies p join public.financial_accounts a on a.id=p.financial_account_id
    where p.policy_id=new.policy_id and p.financial_account_id=new.financial_account_id
      and p.status='DRAFT' and p.policy_json ? 'profitAllocationConfiguration'
      and a.owner_id=new.owner_id and a.mode='PAPER' and a.status='ACTIVE' and a.base_currency_code='NOK'
  ) then raise exception 'PAPER_PROFIT_TERMS_SCOPE_INVALID'; end if;
  if exists (select 1 from public.ledger_transactions where financial_account_id=new.financial_account_id)
    or exists (select 1 from public.standing_paper_runs where financial_account_id=new.financial_account_id)
  then raise exception 'PAPER_PROFIT_REQUIRES_NEW_HISTORY'; end if;
  return new;
end; $$;
create trigger standing_paper_profit_terms_guard before insert on public.standing_paper_profit_terms
for each row execute function public.guard_paper_profit_terms();

create function public.guard_paper_profit_policy() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and (old.status <> 'DRAFT' or exists (select 1 from public.standing_paper_profit_terms where policy_id=old.policy_id))
    and (new.policy_json->'profitAllocationConfiguration') is distinct from (old.policy_json->'profitAllocationConfiguration')
  then raise exception 'PAPER_PROFIT_TERMS_IMMUTABLE'; end if;
  if new.policy_json ? 'profitAllocationConfiguration' then
    if new.policy_json->'profitAllocationConfiguration'->>'recordingMode' is distinct from 'RECORD_ONLY'
      then raise exception 'PAPER_PROFIT_RECORD_ONLY_REQUIRED'; end if;
    if new.status <> 'DRAFT' and not exists (select 1 from public.standing_paper_profit_terms where policy_id=new.policy_id)
      and new.status <> 'STOPPED'
    then raise exception 'PAPER_PROFIT_TERMS_CONFIRMATION_REQUIRED'; end if;
  end if;
  return new;
end; $$;
create trigger standing_paper_profit_policy_guard before insert or update on public.standing_paper_policies
for each row execute function public.guard_paper_profit_policy();

create function public.guard_paper_profit_settlement() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  -- The side column is referenced only at execution, preserving pre-cycle v1 installs.
  if not exists (
    select 1 from public.standing_paper_fills f join public.ledger_transactions l on l.id=f.ledger_transaction_id
    where f.financial_account_id=new.financial_account_id and f.policy_id=new.policy_id and f.fill_id=new.fill_id
      and f.side='SELL' and f.ledger_transaction_id=new.settlement_id and f.run_id=new.run_id
      and l.financial_account_id=new.financial_account_id and l.transaction_type='SIMULATED_SELL_SETTLEMENT'
  ) then raise exception 'PAPER_PROFIT_SETTLEMENT_BINDING_INVALID'; end if;
  return new;
end; $$;
create trigger standing_paper_profit_settlement_guard before insert on public.standing_paper_profit_allocations
for each row execute function public.guard_paper_profit_settlement();

create trigger standing_paper_profit_terms_immutable before update or delete on public.standing_paper_profit_terms
for each row execute function public.standing_paper_append_only();
create trigger standing_paper_profit_allocations_immutable before update or delete on public.standing_paper_profit_allocations
for each row execute function public.standing_paper_append_only();

alter table public.standing_paper_profit_terms enable row level security;
alter table public.standing_paper_profit_allocations enable row level security;
create policy "paper profit terms owner read" on public.standing_paper_profit_terms for select to authenticated
using (exists (select 1 from public.financial_accounts a where a.id=financial_account_id and a.owner_id=(select auth.uid())));
create policy "paper profit allocations owner read" on public.standing_paper_profit_allocations for select to authenticated
using (exists (select 1 from public.financial_accounts a where a.id=financial_account_id and a.owner_id=(select auth.uid())));
revoke all on public.standing_paper_profit_terms, public.standing_paper_profit_allocations from anon, authenticated;
grant select on public.standing_paper_profit_terms, public.standing_paper_profit_allocations to authenticated;

comment on table public.standing_paper_profit_allocations is 'Append-only RECORD_ONLY profit entitlements. No cash transfer or reserve spending enforcement.';
