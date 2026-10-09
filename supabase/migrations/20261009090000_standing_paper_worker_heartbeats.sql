-- Durable process liveness for local PAPER_ONLY workers. A separate row per
-- process instance preserves concurrent workers and never participates in a
-- settlement, ledger, risk checkpoint, or decision-idempotency transaction.
create table public.standing_paper_worker_heartbeats (
  policy_id text not null references public.standing_paper_policies(policy_id) on delete cascade,
  -- Kept as an owner-scope snapshot; policy_id is the authoritative FK. Avoid
  -- an account FK key-share lock when a worker starts beside a ledger writer.
  financial_account_id uuid not null,
  worker_id text not null check (worker_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  process_instance_id uuid not null,
  status text not null check (status in ('RUNNING', 'WAITING_PAUSED', 'WAITING_INTERVAL', 'ENDED')),
  exit_reason text check (exit_reason in ('COMPLETED', 'STOPPED', 'FAILED')),
  started_at timestamptz not null default clock_timestamp(),
  heartbeat_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  primary key (policy_id, worker_id, process_instance_id),
  check ((status = 'ENDED' and ended_at is not null and exit_reason is not null) or
         (status <> 'ENDED' and ended_at is null and exit_reason is null))
);

create index standing_paper_worker_heartbeats_recent_idx
  on public.standing_paper_worker_heartbeats (policy_id, heartbeat_at desc, worker_id, process_instance_id);

alter table public.standing_paper_worker_heartbeats enable row level security;
create policy "standing paper worker heartbeat owner read"
  on public.standing_paper_worker_heartbeats for select to authenticated
  using (exists (
    select 1 from public.financial_accounts fa
    where fa.id = financial_account_id and fa.owner_id = (select auth.uid())
  ));

grant usage on schema public to authenticated;
grant select on table public.standing_paper_worker_heartbeats to authenticated;

comment on table public.standing_paper_worker_heartbeats is
  'Per-process PAPER_ONLY worker liveness. Active rows older than 90 seconds are projected as stale; ended rows remain ended.';
