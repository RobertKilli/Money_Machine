-- M1C deterministic strategy/risk decision persistence. Simulation only.
create table public.assets (
  asset_id text primary key,
  symbol text not null unique,
  display_name text not null,
  quote_currency_code text not null check (quote_currency_code in ('NOK','USD','EUR')),
  quantity_scale smallint not null check (quantity_scale between 0 and 8),
  minimum_quantity_increment_atoms numeric(38,0) not null check (minimum_quantity_increment_atoms > 0),
  registry_version text not null,
  classification text not null check (classification = 'SYNTHETIC_FIXTURE'),
  active boolean not null default true,
  target_weight_bps numeric(5,0) not null check (target_weight_bps between 0 and 10000),
  created_at timestamptz not null default now()
);

create table public.market_prices (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null references public.assets(asset_id) on delete restrict,
  price_atoms numeric(38,0) not null check (price_atoms > 0),
  price_scale smallint not null check (price_scale between 0 and 8),
  currency_code text not null check (currency_code in ('NOK','USD','EUR')),
  observed_at timestamptz not null,
  available_at timestamptz not null,
  ingested_at timestamptz not null,
  dataset_version text not null,
  created_at timestamptz not null default now(),
  unique (asset_id, observed_at, available_at, dataset_version)
);

create table public.strategy_assignments (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  strategy_version text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (financial_account_id, strategy_version)
);

create table public.strategy_decisions (
  id uuid primary key default gen_random_uuid(),
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  idempotency_record_id uuid not null unique references public.idempotency_records(id) on delete restrict,
  decision_timestamp timestamptz not null,
  strategy_version text not null,
  risk_policy_version text not null,
  asset_registry_version text not null,
  dataset_version text not null,
  input_cash_atoms numeric(38,0) not null,
  reserve_atoms numeric(38,0) not null check (reserve_atoms >= 0),
  status text not null check (status in ('RISK_ASSESSED','APPROVED','REJECTED')),
  result_json jsonb not null,
  created_at timestamptz not null default now()
);

create table public.proposed_orders (
  id uuid primary key default gen_random_uuid(),
  strategy_decision_id uuid not null references public.strategy_decisions(id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  asset_id text not null references public.assets(asset_id) on delete restrict,
  side text not null check (side = 'BUY'),
  order_type text not null check (order_type = 'MARKET'),
  quantity_atoms numeric(38,0) not null check (quantity_atoms > 0),
  quantity_scale smallint not null check (quantity_scale between 0 and 8),
  price_atoms numeric(38,0) not null check (price_atoms > 0),
  price_scale smallint not null check (price_scale between 0 and 8),
  currency_code text not null,
  reference_price_id uuid not null references public.market_prices(id) on delete restrict,
  reference_notional_atoms numeric(38,0) not null check (reference_notional_atoms > 0),
  decision_timestamp timestamptz not null,
  strategy_version text not null,
  registry_version text not null,
  dataset_version text not null,
  created_at timestamptz not null default now()
);

create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  strategy_decision_id uuid not null references public.strategy_decisions(id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  policy_version text not null,
  disposition text not null check (disposition in ('APPROVE','REJECT')),
  explanation text not null,
  created_at timestamptz not null default now(),
  unique (strategy_decision_id)
);

create table public.risk_violations (
  id uuid primary key default gen_random_uuid(),
  risk_assessment_id uuid not null references public.risk_assessments(id) on delete restrict,
  code text not null,
  message text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function public.m1c_immutable() returns trigger language plpgsql set search_path = public, pg_temp as $$ begin raise exception '% records are append-only', tg_table_name; end; $$;
do $$ declare t text; begin foreach t in array array['assets','market_prices','strategy_assignments','strategy_decisions','proposed_orders','risk_assessments','risk_violations'] loop execute format('create trigger %I before update or delete on public.%I for each row execute function public.m1c_immutable()', t || '_immutable', t); end loop; end $$;

create index market_prices_temporal_lookup_idx on public.market_prices(asset_id, available_at desc, observed_at desc, id desc);
create index proposed_orders_account_idx on public.proposed_orders(financial_account_id);
create index strategy_decisions_account_idx on public.strategy_decisions(financial_account_id, decision_timestamp desc);

alter table public.assets enable row level security;
alter table public.market_prices enable row level security;
alter table public.strategy_assignments enable row level security;
alter table public.strategy_decisions enable row level security;
alter table public.proposed_orders enable row level security;
alter table public.risk_assessments enable row level security;
alter table public.risk_violations enable row level security;

create policy "fixture assets are readable by authenticated users" on public.assets for select to authenticated using (true);
create policy "fixture prices are readable by authenticated users" on public.market_prices for select to authenticated using (true);
create policy "strategy assignments are readable by account owner" on public.strategy_assignments for select to authenticated using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "decisions are readable by account owner" on public.strategy_decisions for select to authenticated using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "proposals are readable by account owner" on public.proposed_orders for select to authenticated using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "risk assessments are readable by account owner" on public.risk_assessments for select to authenticated using (exists (select 1 from public.financial_accounts fa where fa.id = financial_account_id and fa.owner_id = (select auth.uid())));
create policy "risk violations are readable by account owner" on public.risk_violations for select to authenticated using (exists (select 1 from public.risk_assessments ra join public.financial_accounts fa on fa.id = ra.financial_account_id where ra.id = risk_assessment_id and fa.owner_id = (select auth.uid())));

insert into public.assets (asset_id, symbol, display_name, quote_currency_code, quantity_scale, minimum_quantity_increment_atoms, registry_version, classification, target_weight_bps)
values
  ('mm.fixture.global.v1', 'MM_GLOBAL', 'Money Machine Global Fixture', 'NOK', 4, 1, 'fixture-asset-registry/v1', 'SYNTHETIC_FIXTURE', 6000),
  ('mm.fixture.growth.v1', 'MM_GROWTH', 'Money Machine Growth Fixture', 'NOK', 4, 1, 'fixture-asset-registry/v1', 'SYNTHETIC_FIXTURE', 2500),
  ('mm.fixture.defensive.v1', 'MM_DEFENSIVE', 'Money Machine Defensive Fixture', 'NOK', 4, 1, 'fixture-asset-registry/v1', 'SYNTHETIC_FIXTURE', 1500)
on conflict (asset_id) do nothing;

insert into public.market_prices (id, asset_id, price_atoms, price_scale, currency_code, observed_at, available_at, ingested_at, dataset_version)
values
  ('1c000000-0000-4000-8000-000000000001', 'mm.fixture.global.v1', 10000, 4, 'NOK', '2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z', '2026-01-01T10:02:00Z', 'mm-fixture-market-data/v1'),
  ('1c000000-0000-4000-8000-000000000002', 'mm.fixture.growth.v1', 20000, 4, 'NOK', '2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z', '2026-01-01T10:02:00Z', 'mm-fixture-market-data/v1'),
  ('1c000000-0000-4000-8000-000000000003', 'mm.fixture.defensive.v1', 5000, 4, 'NOK', '2026-01-01T10:00:00Z', '2026-01-01T10:01:00Z', '2026-01-01T10:02:00Z', 'mm-fixture-market-data/v1'),
  ('1c000000-0000-4000-8000-000000000011', 'mm.fixture.global.v1', 11000, 4, 'NOK', '2026-01-01T10:05:00Z', '2026-01-01T10:10:00Z', '2026-01-01T10:11:00Z', 'mm-fixture-market-data/v1'),
  ('1c000000-0000-4000-8000-000000000012', 'mm.fixture.growth.v1', 21000, 4, 'NOK', '2026-01-01T10:05:00Z', '2026-01-01T10:10:00Z', '2026-01-01T10:11:00Z', 'mm-fixture-market-data/v1'),
  ('1c000000-0000-4000-8000-000000000013', 'mm.fixture.defensive.v1', 5500, 4, 'NOK', '2026-01-01T10:05:00Z', '2026-01-01T10:10:00Z', '2026-01-01T10:11:00Z', 'mm-fixture-market-data/v1')
on conflict (id) do nothing;
