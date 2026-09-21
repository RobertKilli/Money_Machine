-- M5 daily series authority. Fixture/provider-neutral, append-only, server-only material.
create table public.intelligence_m5_daily_series_authorities (
  authority_id text primary key check (authority_id ~ '^[a-f0-9]{64}$'),
  contract_version text not null check (contract_version = 'm5-daily-series-authority/v1'),
  provider_id text not null check (btrim(provider_id) <> ''),
  dataset_id text not null check (btrim(dataset_id) <> ''),
  dataset_version text not null check (btrim(dataset_version) <> ''),
  provider_source_namespace text not null check (btrim(provider_source_namespace) <> ''),
  source_lineage_id text not null check (btrim(source_lineage_id) <> ''),
  chain_id text not null check (chain_id = 'eip155:1'),
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  provider_asset_identity text not null check (btrim(provider_asset_identity) <> ''),
  quote_unit text not null check (btrim(quote_unit) <> ''),
  price_scale integer not null check (price_scale between 0 and 32767),
  as_of timestamptz not null,
  source_artifact_ids jsonb not null check (jsonb_typeof(source_artifact_ids) = 'array'),
  source_envelope_ids jsonb not null check (jsonb_typeof(source_envelope_ids) = 'array'),
  source_observation_ids jsonb not null check (jsonb_typeof(source_observation_ids) = 'array'),
  payload_fingerprints jsonb not null check (jsonb_typeof(payload_fingerprints) = 'array'),
  observation_count integer not null check (observation_count >= 15 and observation_count <= 4294967295),
  earliest_observed_at timestamptz not null,
  latest_observed_at timestamptz not null,
  available_at timestamptz not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null,
  check (earliest_observed_at <= latest_observed_at and latest_observed_at <= available_at and available_at <= as_of),
  check (jsonb_array_length(source_artifact_ids) = observation_count and jsonb_array_length(source_envelope_ids) = observation_count and jsonb_array_length(source_observation_ids) = observation_count and jsonb_array_length(payload_fingerprints) = observation_count),
  unique (authority_id, fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version),
  foreign key (source_lineage_id, provider_id, dataset_id, dataset_version) references public.intelligence_source_lineages(source_lineage_id, provider_id, dataset_id, dataset_version)
);

create table public.intelligence_m5_daily_series_observations (
  authority_id text not null references public.intelligence_m5_daily_series_authorities(authority_id),
  observation_ordinal integer not null check (observation_ordinal >= 0 and observation_ordinal <= 4294967295),
  observation_id text not null check (btrim(observation_id) <> ''),
  source_artifact_id text not null check (btrim(source_artifact_id) <> ''),
  source_envelope_id text not null check (btrim(source_envelope_id) <> ''),
  source_observation_id text not null check (btrim(source_observation_id) <> ''),
  provider_external_record_id text not null check (btrim(provider_external_record_id) <> ''),
  provider_id text not null check (btrim(provider_id) <> ''),
  dataset_id text not null check (btrim(dataset_id) <> ''),
  dataset_version text not null check (btrim(dataset_version) <> ''),
  observed_at timestamptz not null,
  available_at timestamptz not null,
  close_atoms numeric(78,0) not null check (close_atoms > 0 and close_atoms <= 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  price_scale integer not null check (price_scale between 0 and 32767),
  quote_unit text not null check (btrim(quote_unit) <> ''),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  observation_fingerprint text not null check (observation_fingerprint ~ '^[a-f0-9]{64}$'),
  primary key (authority_id, observation_ordinal),
  unique (authority_id, observation_id),
  unique (authority_id, observed_at),
  foreign key (source_artifact_id, provider_id, dataset_id, dataset_version) references public.intelligence_source_artifacts(source_artifact_id, provider_id, dataset_id, dataset_version),
  foreign key (source_envelope_id, source_artifact_id) references public.intelligence_source_envelopes(source_envelope_id, source_artifact_id),
  foreign key (source_observation_id) references public.intelligence_ingestion_source_observations(source_observation_id),
  check (observed_at <= available_at)
);

create table public.intelligence_m5_daily_series_derivations (
  authority_id text not null references public.intelligence_m5_daily_series_authorities(authority_id),
  metric_kind text not null check (metric_kind in ('HISTORY_SPAN','VOLATILITY')),
  derivation_version text not null check (derivation_version in ('history-span/crypto-daily/v1','volatility/crypto-daily/v1')),
  cadence_policy_version text not null check (cadence_policy_version = 'crypto-daily/v1'),
  rounding_version text not null check (rounding_version = 'm5-integer-floor/v1'),
  value numeric(78,0) not null check (value >= 0 and value <= 9223372036854775807),
  unit text not null check (unit in ('DAYS','BPS')),
  scale integer not null check (scale = 0),
  observed_at timestamptz not null,
  available_at timestamptz not null,
  as_of timestamptz not null,
  ordered_observation_ids jsonb not null check (jsonb_typeof(ordered_observation_ids) = 'array'),
  observation_count integer not null check (observation_count >= 15),
  return_count integer not null check (return_count = observation_count - 1),
  earliest_observed_at timestamptz not null,
  latest_observed_at timestamptz not null,
  maximum_observed_gap bigint not null check (maximum_observed_gap >= 0),
  price_scale integer not null check (price_scale between 0 and 32767),
  quote_unit text not null check (btrim(quote_unit) <> ''),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null,
  primary key (authority_id, metric_kind),
  unique (authority_id, metric_kind, fingerprint),
  check (observed_at <= available_at and available_at <= as_of),
  check ((metric_kind = 'HISTORY_SPAN' and derivation_version = 'history-span/crypto-daily/v1' and unit = 'DAYS') or (metric_kind = 'VOLATILITY' and derivation_version = 'volatility/crypto-daily/v1' and unit = 'BPS'))
);

create index intelligence_m5_daily_series_authorities_lineage_fk_idx on public.intelligence_m5_daily_series_authorities(source_lineage_id, provider_id, dataset_id, dataset_version);
create index intelligence_m5_daily_series_observations_artifact_fk_idx on public.intelligence_m5_daily_series_observations(source_artifact_id, provider_id, dataset_id, dataset_version);
create index intelligence_m5_daily_series_observations_envelope_fk_idx on public.intelligence_m5_daily_series_observations(source_envelope_id, source_artifact_id);
create index intelligence_m5_daily_series_observations_source_observation_fk_idx on public.intelligence_m5_daily_series_observations(source_observation_id);
create index intelligence_m5_daily_series_observations_authority_idx on public.intelligence_m5_daily_series_observations(authority_id);
create index intelligence_m5_daily_series_derivations_authority_idx on public.intelligence_m5_daily_series_derivations(authority_id);

alter table public.intelligence_m5_daily_series_authorities enable row level security;
alter table public.intelligence_m5_daily_series_observations enable row level security;
alter table public.intelligence_m5_daily_series_derivations enable row level security;
revoke all privileges on table public.intelligence_m5_daily_series_authorities, public.intelligence_m5_daily_series_observations, public.intelligence_m5_daily_series_derivations from anon, authenticated;
create trigger intelligence_m5_daily_series_authorities_immutable before update or delete on public.intelligence_m5_daily_series_authorities for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_m5_daily_series_observations_immutable before update or delete on public.intelligence_m5_daily_series_observations for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_m5_daily_series_derivations_immutable before update or delete on public.intelligence_m5_daily_series_derivations for each row execute function public.reject_intelligence_mutation();
