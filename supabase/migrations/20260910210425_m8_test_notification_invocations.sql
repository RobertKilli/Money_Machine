create sequence if not exists public.notification_test_invocation_seq;
create table if not exists public.notification_test_invocations (
  invocation_number bigint primary key default nextval('public.notification_test_invocation_seq'),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.notification_test_invocations enable row level security;
revoke all on public.notification_test_invocations from anon, authenticated;
