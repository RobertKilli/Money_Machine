create table if not exists public.admin_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled_categories text[] not null default '{}',
  pnl_milestone_threshold_minor numeric not null check (pnl_milestone_threshold_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '07:00',
  timezone text not null default 'UTC',
  max_non_critical_per_hour integer not null default 10 check (max_non_critical_per_hour between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.push_subscriptions (
  subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_active_idx on public.push_subscriptions(user_id, active);
create table if not exists public.notification_delivery_attempts (
  delivery_id text primary key,
  alert_event_id text not null,
  subscription_id text not null references public.push_subscriptions(subscription_id) on delete restrict,
  status text not null check (status in ('DEFERRED','SENT','FAILED','SUPPRESSED')),
  attempt integer not null check (attempt > 0),
  attempted_at timestamptz not null,
  delivered_at timestamptz,
  failure_code text,
  deferred_until timestamptz,
  unique(alert_event_id, subscription_id)
);
create index if not exists notification_delivery_alert_idx on public.notification_delivery_attempts(alert_event_id, status);
alter table public.admin_notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_delivery_attempts enable row level security;
-- All M8 writes and reads are server mediated. No browser role receives access.
revoke all on public.admin_notification_preferences from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.notification_delivery_attempts from anon, authenticated;
