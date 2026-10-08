-- Durable PAPER_ONLY policy state and serialized paper-runner transactions.
-- The account is an existing FinancialAccount in PAPER mode; no live account
-- or execution adapter is introduced by this schema.
create table public.standing_paper_policies (
  policy_id text primary key,
  financial_account_id uuid not null unique references public.financial_accounts(id) on delete restrict,
  policy_version text not null,
  status text not null check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'STOPPED')),
  policy_json jsonb not null,
  state_json jsonb not null default '{"ledger":[],"acquisitions":[],"netContributionsMinor":{"$type":"bigint","value":"0"},"adjustedEquityHighWaterMinor":{"$type":"bigint","value":"0"},"committedCapitalMinor":{"$type":"bigint","value":"0"},"lastProcessedAt":null}'::jsonb,
  last_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (policy_version = 'standing-paper-policy/v1')
);

create function public.require_paper_financial_account() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.financial_accounts fa where fa.id = new.financial_account_id and fa.mode = 'PAPER' and fa.status = 'ACTIVE' and fa.base_currency_code = 'NOK') then
    raise exception 'STANDING_PAPER_REQUIRES_ACTIVE_PAPER_NOK_ACCOUNT';
  end if;
  return new;
end; $$;
create trigger standing_paper_policy_account_guard before insert or update of financial_account_id on public.standing_paper_policies
for each row execute function public.require_paper_financial_account();

create table public.standing_paper_policy_transitions (
  id uuid primary key default gen_random_uuid(),
  policy_id text not null references public.standing_paper_policies(policy_id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  policy_version text not null,
  action text not null check (action in ('INITIALIZE', 'ACTIVATE', 'PAUSE', 'STOP')),
  from_status text check (from_status in ('DRAFT', 'ACTIVE', 'PAUSED', 'STOPPED')),
  to_status text not null check (to_status in ('DRAFT', 'ACTIVE', 'PAUSED', 'STOPPED')),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default now(),
  check ((action = 'INITIALIZE' and from_status is null and to_status = 'DRAFT') or action <> 'INITIALIZE')
);

create table public.standing_paper_runs (
  id uuid primary key default gen_random_uuid(),
  policy_id text not null references public.standing_paper_policies(policy_id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  idempotency_key text not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (financial_account_id, policy_id, idempotency_key),
  unique (id, policy_id, financial_account_id)
);
alter table public.standing_paper_policies add constraint standing_paper_last_run_fk
  foreign key (last_run_id) references public.standing_paper_runs(id) on delete restrict;

create table public.standing_paper_contributions (
  policy_id text not null references public.standing_paper_policies(policy_id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  event_id text not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  run_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (financial_account_id, policy_id, event_id),
  foreign key (run_id, policy_id, financial_account_id) references public.standing_paper_runs(id, policy_id, financial_account_id) on delete restrict
);

create table public.standing_paper_decisions (
  policy_id text not null references public.standing_paper_policies(policy_id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  order_id text not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  decision_json jsonb not null,
  run_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (financial_account_id, policy_id, order_id),
  foreign key (run_id, policy_id, financial_account_id) references public.standing_paper_runs(id, policy_id, financial_account_id) on delete restrict
);

-- A paper fill is separate from exchange execution records because no
-- strategy-decision/proposed-order exchange adapter exists in this flow.
create table public.standing_paper_fills (
  policy_id text not null references public.standing_paper_policies(policy_id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  fill_id text not null,
  order_id text not null,
  ledger_transaction_id uuid not null references public.ledger_transactions(id) on delete restrict,
  execution_json jsonb not null,
  acquisition_json jsonb not null,
  run_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (financial_account_id, policy_id, fill_id),
  unique (financial_account_id, policy_id, order_id),
  unique (ledger_transaction_id),
  foreign key (run_id, policy_id, financial_account_id) references public.standing_paper_runs(id, policy_id, financial_account_id) on delete restrict
);

-- Every account ledger writer takes the same account-row lock. This serializes
-- external ledger mutations with paper reconciliation/runs.
create function public.lock_financial_account_for_ledger_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare account_id uuid;
begin
  if tg_table_name = 'ledger_transactions' then
    account_id := case when tg_op = 'DELETE' then old.financial_account_id else new.financial_account_id end;
  else
    select lt.financial_account_id into account_id from public.ledger_transactions lt where lt.id = case when tg_op = 'DELETE' then old.ledger_transaction_id else new.ledger_transaction_id end;
  end if;
  perform 1 from public.financial_accounts fa where fa.id = account_id for update;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;
create trigger lock_account_before_ledger_transaction before insert or update or delete on public.ledger_transactions
for each row execute function public.lock_financial_account_for_ledger_write();
create trigger lock_account_before_ledger_entry before insert or update or delete on public.ledger_entries
for each row execute function public.lock_financial_account_for_ledger_write();

create function public.standing_paper_append_only() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception '% records are append-only', tg_table_name; end; $$;
create trigger standing_paper_runs_immutable before update or delete on public.standing_paper_runs for each row execute function public.standing_paper_append_only();
create trigger standing_paper_transitions_immutable before update or delete on public.standing_paper_policy_transitions for each row execute function public.standing_paper_append_only();
create trigger standing_paper_contributions_immutable before update or delete on public.standing_paper_contributions for each row execute function public.standing_paper_append_only();
create trigger standing_paper_decisions_immutable before update or delete on public.standing_paper_decisions for each row execute function public.standing_paper_append_only();
create trigger standing_paper_fills_immutable before update or delete on public.standing_paper_fills for each row execute function public.standing_paper_append_only();

alter table public.standing_paper_policies enable row level security;
alter table public.standing_paper_policy_transitions enable row level security;
alter table public.standing_paper_runs enable row level security;
alter table public.standing_paper_contributions enable row level security;
alter table public.standing_paper_decisions enable row level security;
alter table public.standing_paper_fills enable row level security;

create policy "standing paper policy owner read" on public.standing_paper_policies for select to authenticated
  using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "standing paper transitions owner read" on public.standing_paper_policy_transitions for select to authenticated
  using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "standing paper runs owner read" on public.standing_paper_runs for select to authenticated
  using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "standing paper contributions owner read" on public.standing_paper_contributions for select to authenticated
  using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "standing paper decisions owner read" on public.standing_paper_decisions for select to authenticated
  using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "standing paper fills owner read" on public.standing_paper_fills for select to authenticated
  using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));

comment on table public.standing_paper_policies is 'Durable local PAPER_ONLY policy checkpoints. Uses an existing active PAPER FinancialAccount; not a live mandate.';
comment on table public.standing_paper_fills is 'Append-only simulated full fills linked to the account ledger; not exchange execution evidence.';
