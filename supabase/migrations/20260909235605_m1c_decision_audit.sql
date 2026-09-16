create table public.decision_audit_events (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  decision_id uuid not null unique references public.strategy_decisions(id) on delete restrict,
  command_id uuid not null unique references public.idempotency_records(id) on delete restrict,
  command_type text not null,
  idempotency_key text not null,
  outcome text not null check (outcome in ('APPROVED','REJECTED')),
  evidence jsonb not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index decision_audit_events_account_idx on public.decision_audit_events(financial_account_id, occurred_at desc);
create function public.m1c_decision_audit_immutable() returns trigger language plpgsql set search_path = public, pg_temp as $$ begin raise exception 'decision audit events are append-only'; end; $$;
create trigger decision_audit_events_immutable before update or delete on public.decision_audit_events for each row execute function public.m1c_decision_audit_immutable();
alter table public.decision_audit_events enable row level security;
create policy "decision audit is readable by account owner" on public.decision_audit_events for select to authenticated using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
