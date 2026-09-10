-- M1A financial foundation. This migration is the canonical schema source only;
-- it does not create or modify a hosted Supabase project.

create extension if not exists pgcrypto;

create type public.financial_account_mode as enum ('SIMULATION', 'PAPER');
create type public.financial_account_status as enum ('ACTIVE', 'CLOSED');
create type public.ledger_account_class as enum ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'CLEARING');
create type public.ledger_direction as enum ('DEBIT', 'CREDIT');
create type public.ledger_commodity_kind as enum ('MONEY', 'ASSET');
create type public.ledger_transaction_type as enum ('VIRTUAL_DEPOSIT', 'REVERSAL');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  base_currency_code text not null default 'NOK' check (base_currency_code in ('NOK', 'USD', 'EUR')),
  mode public.financial_account_mode not null default 'SIMULATION',
  status public.financial_account_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index financial_accounts_owner_id_idx on public.financial_accounts (owner_id);

create table public.ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts (id) on delete restrict,
  code text not null,
  account_class public.ledger_account_class not null,
  normal_balance public.ledger_direction not null,
  commodity_kind public.ledger_commodity_kind not null,
  commodity_currency_code text,
  commodity_asset_id text,
  created_at timestamptz not null default now(),
  check (
    (commodity_kind = 'MONEY' and commodity_currency_code is not null and commodity_asset_id is null)
    or
    (commodity_kind = 'ASSET' and commodity_currency_code is null and commodity_asset_id is not null)
  ),
  unique (financial_account_id, code),
  unique (financial_account_id, commodity_kind, commodity_currency_code, commodity_asset_id, code)
);

create table public.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts (id) on delete restrict,
  command_type text not null,
  idempotency_key text not null check (length(trim(idempotency_key)) > 0),
  request_hash text not null check (length(request_hash) = 64),
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (financial_account_id, command_type, idempotency_key)
);

create table public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts (id) on delete restrict,
  idempotency_record_id uuid unique references public.idempotency_records (id) on delete restrict,
  transaction_type public.ledger_transaction_type not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  narrative text not null check (length(trim(narrative)) > 0),
  reversal_of_transaction_id uuid unique references public.ledger_transactions (id) on delete restrict,
  check ((transaction_type = 'REVERSAL') = (reversal_of_transaction_id is not null)),
  check ((transaction_type = 'VIRTUAL_DEPOSIT') = (idempotency_record_id is not null))
);

create index ledger_transactions_financial_account_id_idx on public.ledger_transactions (financial_account_id, occurred_at);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  ledger_transaction_id uuid not null references public.ledger_transactions (id) on delete restrict,
  ledger_account_id uuid not null references public.ledger_accounts (id) on delete restrict,
  direction public.ledger_direction not null,
  amount_atoms numeric(38, 0) not null check (amount_atoms > 0),
  created_at timestamptz not null default now()
);

create index ledger_entries_transaction_id_idx on public.ledger_entries (ledger_transaction_id);
create index ledger_entries_account_id_idx on public.ledger_entries (ledger_account_id);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts (id) on delete restrict,
  actor_id uuid not null references auth.users (id) on delete restrict,
  command_id uuid not null references public.idempotency_records (id) on delete restrict,
  command_type text not null,
  idempotency_key text not null,
  outcome text not null check (outcome in ('SUCCEEDED', 'REJECTED', 'FAILED')),
  policy_versions jsonb not null,
  ledger_transaction_id uuid references public.ledger_transactions (id) on delete restrict,
  input_hash text,
  output_hash text,
  previous_audit_hash text,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  check ((outcome = 'SUCCEEDED') = (ledger_transaction_id is not null))
);

create index audit_events_financial_account_id_idx on public.audit_events (financial_account_id, occurred_at);

-- Default account taxonomy is created by the trusted server-side account-creation
-- path. It creates no monetary value and contains no service-role credential.
create function public.create_default_ledger_accounts()
returns trigger
language plpgsql
as $$
begin
  insert into public.ledger_accounts (
    financial_account_id, code, account_class, normal_balance, commodity_kind, commodity_currency_code
  ) values
    (new.id, 'CASH', 'ASSET', 'DEBIT', 'MONEY', new.base_currency_code),
    (new.id, 'VIRTUAL_CONTRIBUTED_CAPITAL', 'EQUITY', 'CREDIT', 'MONEY', new.base_currency_code);
  return new;
end;
$$;

create trigger financial_accounts_create_default_ledger_accounts
after insert on public.financial_accounts
for each row execute function public.create_default_ledger_accounts();

-- A row-spanning journal invariant requires a deferred trigger; a CHECK
-- constraint cannot safely inspect sibling ledger_entries.
create function public.assert_ledger_transaction_balanced(p_ledger_transaction_id uuid)
returns void
language plpgsql
as $$
declare
  entry_count integer;
begin
  select count(*) into entry_count
  from public.ledger_entries
  where ledger_transaction_id = p_ledger_transaction_id;

  if entry_count < 2 then
    raise exception 'Ledger transaction % requires at least two entries', p_ledger_transaction_id;
  end if;

  if exists (
    select 1
    from (
      select
        la.commodity_kind,
        la.commodity_currency_code,
        la.commodity_asset_id,
        sum(case when le.direction = 'DEBIT' then le.amount_atoms else -le.amount_atoms end) as balance
      from public.ledger_entries le
      join public.ledger_accounts la on la.id = le.ledger_account_id
      where le.ledger_transaction_id = p_ledger_transaction_id
      group by la.commodity_kind, la.commodity_currency_code, la.commodity_asset_id
    ) commodity_balances
    where balance <> 0
  ) then
    raise exception 'Ledger transaction % is not balanced per commodity', p_ledger_transaction_id;
  end if;
end;
$$;

create function public.ledger_transaction_balance_constraint_trigger()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_ledger_transaction_balanced(new.id);
  return null;
end;
$$;

create function public.ledger_entry_balance_constraint_trigger()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_ledger_transaction_balanced(new.ledger_transaction_id);
  return null;
end;
$$;

create constraint trigger ledger_transactions_must_balance
after insert on public.ledger_transactions
deferrable initially deferred
for each row execute function public.ledger_transaction_balance_constraint_trigger();

create constraint trigger ledger_entries_must_balance
after insert on public.ledger_entries
deferrable initially deferred
for each row execute function public.ledger_entry_balance_constraint_trigger();

create function public.prevent_financial_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '% records are append-only; create a reversal/correction instead', tg_table_name;
end;
$$;

create trigger ledger_transactions_immutable before update or delete on public.ledger_transactions
for each row execute function public.prevent_financial_history_mutation();
create trigger ledger_entries_immutable before update or delete on public.ledger_entries
for each row execute function public.prevent_financial_history_mutation();
create trigger audit_events_immutable before update or delete on public.audit_events
for each row execute function public.prevent_financial_history_mutation();
create trigger idempotency_records_immutable before update or delete on public.idempotency_records
for each row execute function public.prevent_financial_history_mutation();

alter table public.profiles enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.idempotency_records enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles are readable by their owner" on public.profiles
for select to authenticated using ((select auth.uid()) = id);
create policy "profiles are updateable by their owner" on public.profiles
for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "financial accounts are readable by their owner" on public.financial_accounts
for select to authenticated using ((select auth.uid()) = owner_id);
create policy "ledger accounts are readable by financial account owner" on public.ledger_accounts
for select to authenticated using (exists (
  select 1 from public.financial_accounts fa
  where fa.id = financial_account_id and fa.owner_id = (select auth.uid())
));
create policy "ledger transactions are readable by financial account owner" on public.ledger_transactions
for select to authenticated using (exists (
  select 1 from public.financial_accounts fa
  where fa.id = financial_account_id and fa.owner_id = (select auth.uid())
));
create policy "ledger entries are readable by financial account owner" on public.ledger_entries
for select to authenticated using (exists (
  select 1
  from public.ledger_transactions lt
  join public.financial_accounts fa on fa.id = lt.financial_account_id
  where lt.id = ledger_transaction_id and fa.owner_id = (select auth.uid())
));
create policy "idempotency records are readable by financial account owner" on public.idempotency_records
for select to authenticated using (exists (
  select 1 from public.financial_accounts fa
  where fa.id = financial_account_id and fa.owner_id = (select auth.uid())
));
create policy "audit events are readable by financial account owner" on public.audit_events
for select to authenticated using (exists (
  select 1 from public.financial_accounts fa
  where fa.id = financial_account_id and fa.owner_id = (select auth.uid())
));

-- There are intentionally no browser-facing INSERT/UPDATE/DELETE policies for
-- financial state. Authoritative commands run only in the server transaction
-- boundary, while RLS provides owner isolation for reads.
