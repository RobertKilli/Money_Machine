create table if not exists public.intelligence_providers (
  provider_id text primary key, name text not null, provider_type text not null,
  canonical_source text not null, provenance_policy_version text not null,
  content_storage_mode text not null, foundation_version text not null default 'intelligence-foundation/v1',
  created_at timestamptz not null default now()
);
create table if not exists public.intelligence_datasets (
  dataset_id text primary key,
  provider_id text not null references public.intelligence_providers(provider_id) on delete restrict,
  dataset_version text not null, created_at timestamptz not null default now(),
  source_description text not null, content_storage_mode text not null,
  foundation_version text not null default 'intelligence-foundation/v1', unique(provider_id,dataset_version)
);
create table if not exists public.news_event_revisions (
  id text primary key, provider_id text not null, dataset_version text not null,
  external_record_id text not null, revision integer not null check (revision > 0),
  published_at timestamptz not null, available_at timestamptz not null, ingested_at timestamptz not null,
  title text not null, source_url text, source_type text not null, provenance jsonb not null,
  payload_fingerprint text not null, foundation_version text not null default 'intelligence-foundation/v1',
  unique(provider_id,dataset_version,external_record_id,revision), check (available_at <= ingested_at)
);
create table if not exists public.market_observations (
  id text primary key, provider_id text not null, dataset_version text not null,
  external_record_id text not null, asset_id text not null, observed_at timestamptz not null,
  available_at timestamptz not null, ingested_at timestamptz not null, observation_type text not null,
  value_atoms numeric not null check (value_atoms >= 0), scale integer not null check (scale >= 0), unit text not null,
  provenance jsonb not null, payload_fingerprint text not null, foundation_version text not null default 'intelligence-foundation/v1',
  unique(provider_id,dataset_version,external_record_id), check (available_at <= ingested_at)
);
create table if not exists public.macro_observations (
  id text primary key, provider_id text not null, dataset_version text not null,
  external_record_id text not null, revision integer not null check (revision > 0), indicator_code text not null,
  geography text not null, reference_period_start date not null, reference_period_end date not null,
  observed_at timestamptz, published_at timestamptz, available_at timestamptz not null, ingested_at timestamptz not null,
  value_atoms numeric not null, scale integer not null check (scale >= 0), unit text not null, provenance jsonb not null,
  payload_fingerprint text not null, foundation_version text not null default 'intelligence-foundation/v1',
  unique(provider_id,dataset_version,external_record_id,revision), check (reference_period_start <= reference_period_end), check (available_at <= ingested_at)
);
create table if not exists public.intelligence_record_mappings (
  id text primary key, record_id text not null, mapping_kind text not null, target_id text not null,
  mapping_source text not null, evidence text not null, foundation_version text not null default 'intelligence-foundation/v1'
);
alter table public.intelligence_providers enable row level security;
alter table public.intelligence_datasets enable row level security;
alter table public.news_event_revisions enable row level security;
alter table public.market_observations enable row level security;
alter table public.macro_observations enable row level security;
alter table public.intelligence_record_mappings enable row level security;
create or replace function public.reject_intelligence_mutation() returns trigger language plpgsql set search_path = public as $$ begin raise exception 'IMMUTABLE_INTELLIGENCE_EVIDENCE'; end; $$;
drop trigger if exists intelligence_news_immutable on public.news_event_revisions; create trigger intelligence_news_immutable before update or delete on public.news_event_revisions for each row execute function public.reject_intelligence_mutation();
drop trigger if exists intelligence_market_immutable on public.market_observations; create trigger intelligence_market_immutable before update or delete on public.market_observations for each row execute function public.reject_intelligence_mutation();
drop trigger if exists intelligence_macro_immutable on public.macro_observations; create trigger intelligence_macro_immutable before update or delete on public.macro_observations for each row execute function public.reject_intelligence_mutation();
