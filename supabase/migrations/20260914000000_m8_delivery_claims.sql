-- ROB-61 durable Web Push delivery claims (operational state only)
create table if not exists public.notification_delivery_claims (
  alert_event_id text not null,
  subscription_id text not null references public.push_subscriptions(subscription_id) on delete restrict,
  claim_status text not null check (claim_status in ('CLAIMED','SENT','FAILED')),
  attempt integer not null default 1 check (attempt > 0),
  claimed_at timestamptz not null default now(),
  claim_expires_at timestamptz not null,
  completed_at timestamptz,
  failure_code text,
  primary key (alert_event_id, subscription_id)
);
create index if not exists notification_delivery_claims_status_expiry_idx on public.notification_delivery_claims (claim_status, claim_expires_at);
alter table public.notification_delivery_claims enable row level security;
revoke all on table public.notification_delivery_claims from anon, authenticated;

create table if not exists public.notification_suppression_events (
  suppression_id text primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  alert_event_id text not null,
  category text not null,
  status text not null check (status in ('DEFERRED','SUPPRESSED')),
  reason_code text not null,
  occurred_at timestamptz not null,
  deferred_until timestamptz,
  cooldown_key text,
  unique (user_id, alert_event_id, reason_code)
);
create index if not exists notification_suppression_events_user_time_idx on public.notification_suppression_events (user_id, occurred_at desc);
alter table public.notification_suppression_events enable row level security;
revoke all on table public.notification_suppression_events from anon, authenticated;
