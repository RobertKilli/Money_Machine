-- ROB-61 durable suppression outcomes (operational state only)
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
alter table public.notification_delivery_attempts add column if not exists category text not null default 'SYSTEM_CRITICAL';
