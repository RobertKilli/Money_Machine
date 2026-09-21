create table public.intelligence_m5_market_metric_authorities (
  authority_id text primary key,
  contract_version text not null,
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  source_lineage_id text not null,
  as_of timestamptz not null,
  quote_currency text not null,
  currency_minor_unit_policy text not null,
  market_cap_basis text not null,
  volume_window_basis text not null,
  liquidity_coverage_basis text not null,
  material_ids jsonb not null,
  derivation_ids jsonb not null,
  derivation_fingerprints jsonb not null,
  observed_at timestamptz not null,
  effective_available_at timestamptz not null,
  fingerprint text not null,
  recorded_at timestamptz not null,
  unique(authority_id, fingerprint),
  unique(authority_id, source_lineage_id, provider_id, dataset_id, dataset_version, fingerprint),
  check (btrim(authority_id) <> '' and btrim(source_lineage_id) <> '' and btrim(quote_currency) <> ''),
  check (fingerprint ~ '^[a-f0-9]{64}$'),
  check (observed_at <= effective_available_at and effective_available_at <= as_of),
  foreign key (source_lineage_id) references public.intelligence_source_lineages(source_lineage_id)
);

create table public.intelligence_m5_market_metric_materials (
  authority_id text not null,
  material_ordinal integer not null,
  metric_kind text not null,
  source_artifact_id text not null,
  source_envelope_id text not null,
  source_observation_id text not null,
  provider_external_record_id text not null,
  payload_fingerprint text not null,
  value_atoms numeric(78,0) not null,
  source_scale integer not null,
  quote_currency text not null,
  observed_at timestamptz not null,
  available_at timestamptz not null,
  basis text not null,
  window_start_at timestamptz,
  window_end_at timestamptz,
  coverage_version text,
  coverage_complete boolean,
  expected_component_count integer,
  component_ids jsonb,
  components jsonb,
  primary key (authority_id, material_ordinal),
  unique (authority_id, metric_kind),
  unique (authority_id, source_observation_id),
  check (metric_kind in ('MARKET_CAP','VOLUME','LIQUIDITY')),
  check (value_atoms >= 0 and value_atoms <= 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  check (source_scale between 0 and 36),
  check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  check (observed_at <= available_at),
  check (((metric_kind = 'LIQUIDITY' and coverage_version is not null and coverage_complete is true and expected_component_count between 2 and 100000 and jsonb_typeof(component_ids) = 'array' and jsonb_typeof(components) = 'array' and (case when jsonb_typeof(component_ids) = 'array' then jsonb_array_length(component_ids) = expected_component_count else false end) and (case when jsonb_typeof(components) = 'array' then jsonb_array_length(components) = expected_component_count else false end)) or (metric_kind in ('MARKET_CAP','VOLUME') and coverage_version is null and coverage_complete is null and expected_component_count is null and component_ids is null and components is null)) is true),
  foreign key (authority_id) references public.intelligence_m5_market_metric_authorities(authority_id),
  foreign key (source_artifact_id) references public.intelligence_source_artifacts(source_artifact_id),
  foreign key (source_envelope_id) references public.intelligence_source_envelopes(source_envelope_id),
  foreign key (source_observation_id) references public.intelligence_ingestion_source_observations(source_observation_id)
);

create table public.intelligence_m5_market_metric_derivations (
  authority_id text not null,
  metric_kind text not null,
  derivation_version text not null,
  value_atoms numeric(78,0) not null,
  unit text not null,
  scale integer not null,
  quote_currency text not null,
  basis text not null,
  window_start_at timestamptz,
  window_end_at timestamptz,
  coverage_version text,
  material_ids jsonb not null,
  material_fingerprints jsonb not null,
  observed_at timestamptz not null,
  available_at timestamptz not null,
  as_of timestamptz not null,
  fingerprint text not null,
  primary key (authority_id, metric_kind),
  unique (authority_id, metric_kind, fingerprint),
  check (metric_kind in ('MARKET_CAP','VOLUME','LIQUIDITY')),
  check (derivation_version = 'm5-market-metrics-authority/v1'),
  check (unit = 'MINOR' and scale = 0),
  check (value_atoms >= 0 and value_atoms <= 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  check (fingerprint ~ '^[a-f0-9]{64}$'),
  check (observed_at <= available_at and available_at <= as_of),
  foreign key (authority_id) references public.intelligence_m5_market_metric_authorities(authority_id)
);

create index intelligence_m5_market_metric_authorities_lineage_idx on public.intelligence_m5_market_metric_authorities(source_lineage_id);
create index intelligence_m5_market_metric_materials_authority_idx on public.intelligence_m5_market_metric_materials(authority_id, metric_kind, material_ordinal);
create index intelligence_m5_market_metric_materials_artifact_idx on public.intelligence_m5_market_metric_materials(source_artifact_id);
create index intelligence_m5_market_metric_materials_envelope_idx on public.intelligence_m5_market_metric_materials(source_envelope_id);
create index intelligence_m5_market_metric_materials_observation_idx on public.intelligence_m5_market_metric_materials(source_observation_id);
create index intelligence_m5_market_metric_derivations_authority_idx on public.intelligence_m5_market_metric_derivations(authority_id, metric_kind);

alter table public.eligibility_quantitative_evidence
  add column market_metrics_authority_id text,
  add column market_metrics_authority_fingerprint text,
  add column market_metrics_derivation_fingerprint text;

do $$
begin
  if exists (select 1 from public.eligibility_quantitative_evidence) then
    raise exception 'M5_MARKET_METRICS_EVIDENCE_PRECONDITION';
  end if;
end $$;

alter table public.eligibility_quantitative_evidence
  drop constraint eligibility_quantitative_holder_authority_fields_check,
  drop constraint eligibility_quantitative_daily_authority_fields_check;

alter table public.eligibility_quantitative_evidence
  add constraint eligibility_quantitative_holder_authority_fields_check check ((
    (metric_kind in ('HISTORY_SPAN','VOLATILITY') and as_of is not null and daily_series_authority_id is not null and btrim(daily_series_authority_id) <> '' and daily_series_authority_fingerprint is not null and daily_series_authority_fingerprint ~ '^[a-f0-9]{64}$' and daily_series_derivation_fingerprint is not null and daily_series_derivation_fingerprint ~ '^[a-f0-9]{64}$' and holder_snapshot_id is null and holder_snapshot_fingerprint is null and holder_derivation_fingerprint is null and market_metrics_authority_id is null and market_metrics_authority_fingerprint is null and market_metrics_derivation_fingerprint is null)
    or (metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION') and as_of is not null and holder_snapshot_id is not null and btrim(holder_snapshot_id) <> '' and holder_snapshot_fingerprint is not null and holder_snapshot_fingerprint ~ '^[a-f0-9]{64}$' and holder_derivation_fingerprint is not null and holder_derivation_fingerprint ~ '^[a-f0-9]{64}$' and daily_series_authority_id is null and daily_series_authority_fingerprint is null and daily_series_derivation_fingerprint is null and market_metrics_authority_id is null and market_metrics_authority_fingerprint is null and market_metrics_derivation_fingerprint is null)
    or (metric_kind in ('MARKET_CAP','VOLUME','LIQUIDITY') and as_of is not null and market_metrics_authority_id is not null and btrim(market_metrics_authority_id) <> '' and market_metrics_authority_fingerprint is not null and market_metrics_authority_fingerprint ~ '^[a-f0-9]{64}$' and market_metrics_derivation_fingerprint is not null and market_metrics_derivation_fingerprint ~ '^[a-f0-9]{64}$' and daily_series_authority_id is null and daily_series_authority_fingerprint is null and daily_series_derivation_fingerprint is null and holder_snapshot_id is null and holder_snapshot_fingerprint is null and holder_derivation_fingerprint is null)
    or (metric_kind not in ('HISTORY_SPAN','VOLATILITY','SINGLE_CONCENTRATION','TOP10_CONCENTRATION','MARKET_CAP','VOLUME','LIQUIDITY') and as_of is null and daily_series_authority_id is null and daily_series_authority_fingerprint is null and daily_series_derivation_fingerprint is null and holder_snapshot_id is null and holder_snapshot_fingerprint is null and holder_derivation_fingerprint is null and market_metrics_authority_id is null and market_metrics_authority_fingerprint is null and market_metrics_derivation_fingerprint is null)
  ) is true),
  add constraint eligibility_quantitative_daily_authority_fields_check check ((
    (metric_kind in ('HISTORY_SPAN','VOLATILITY') and as_of is not null and daily_series_authority_id is not null and btrim(daily_series_authority_id) <> '' and daily_series_authority_fingerprint is not null and daily_series_authority_fingerprint ~ '^[a-f0-9]{64}$' and daily_series_derivation_fingerprint is not null and daily_series_derivation_fingerprint ~ '^[a-f0-9]{64}$' and holder_snapshot_id is null and holder_snapshot_fingerprint is null and holder_derivation_fingerprint is null and market_metrics_authority_id is null and market_metrics_authority_fingerprint is null and market_metrics_derivation_fingerprint is null)
    or (metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION') and as_of is not null and holder_snapshot_id is not null and btrim(holder_snapshot_id) <> '' and holder_snapshot_fingerprint is not null and holder_snapshot_fingerprint ~ '^[a-f0-9]{64}$' and holder_derivation_fingerprint is not null and holder_derivation_fingerprint ~ '^[a-f0-9]{64}$' and daily_series_authority_id is null and daily_series_authority_fingerprint is null and daily_series_derivation_fingerprint is null and market_metrics_authority_id is null and market_metrics_authority_fingerprint is null and market_metrics_derivation_fingerprint is null)
    or (metric_kind in ('MARKET_CAP','VOLUME','LIQUIDITY') and as_of is not null and market_metrics_authority_id is not null and btrim(market_metrics_authority_id) <> '' and market_metrics_authority_fingerprint is not null and market_metrics_authority_fingerprint ~ '^[a-f0-9]{64}$' and market_metrics_derivation_fingerprint is not null and market_metrics_derivation_fingerprint ~ '^[a-f0-9]{64}$' and daily_series_authority_id is null and daily_series_authority_fingerprint is null and daily_series_derivation_fingerprint is null and holder_snapshot_id is null and holder_snapshot_fingerprint is null and holder_derivation_fingerprint is null)
    or (metric_kind not in ('HISTORY_SPAN','VOLATILITY','SINGLE_CONCENTRATION','TOP10_CONCENTRATION','MARKET_CAP','VOLUME','LIQUIDITY') and as_of is null and daily_series_authority_id is null and daily_series_authority_fingerprint is null and daily_series_derivation_fingerprint is null and market_metrics_authority_id is null and market_metrics_authority_fingerprint is null and market_metrics_derivation_fingerprint is null and holder_snapshot_id is null and holder_snapshot_fingerprint is null and holder_derivation_fingerprint is null)
  ) is true),
  add constraint eligibility_quantitative_market_authority_fk foreign key (market_metrics_authority_id, market_metrics_authority_fingerprint) references public.intelligence_m5_market_metric_authorities(authority_id, fingerprint),
  add constraint eligibility_quantitative_market_derivation_fk foreign key (market_metrics_authority_id, metric_kind, market_metrics_derivation_fingerprint) references public.intelligence_m5_market_metric_derivations(authority_id, metric_kind, fingerprint);

create index eligibility_quantitative_market_authority_fk_idx on public.eligibility_quantitative_evidence(market_metrics_authority_id, market_metrics_authority_fingerprint);
create index eligibility_quantitative_market_derivation_fk_idx on public.eligibility_quantitative_evidence(market_metrics_authority_id, metric_kind, market_metrics_derivation_fingerprint);

alter table public.intelligence_m5_market_metric_authorities enable row level security;
alter table public.intelligence_m5_market_metric_materials enable row level security;
alter table public.intelligence_m5_market_metric_derivations enable row level security;
revoke all privileges on table public.intelligence_m5_market_metric_authorities, public.intelligence_m5_market_metric_materials, public.intelligence_m5_market_metric_derivations from anon, authenticated;
create trigger intelligence_m5_market_metric_authorities_immutable before update or delete on public.intelligence_m5_market_metric_authorities for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_m5_market_metric_materials_immutable before update or delete on public.intelligence_m5_market_metric_materials for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_m5_market_metric_derivations_immutable before update or delete on public.intelligence_m5_market_metric_derivations for each row execute function public.reject_intelligence_mutation();
