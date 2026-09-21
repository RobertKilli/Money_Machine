-- Bind daily derivation evidence to the persisted daily-series authority pair.
-- Existing daily evidence must be empty because authority cannot be fabricated by backfill.
do $$
begin
  if exists (
    select 1 from public.eligibility_quantitative_evidence
    where metric_kind in ('HISTORY_SPAN','VOLATILITY')
  ) then
    raise exception 'M5_DAILY_SERIES_EVIDENCE_MIGRATION_REQUIRES_EMPTY_DAILY_ROWS';
  end if;
end $$;

alter table public.eligibility_quantitative_evidence
  add column daily_series_authority_id text,
  add column daily_series_authority_fingerprint text,
  add column daily_series_derivation_fingerprint text;

alter table public.eligibility_quantitative_evidence
  drop constraint eligibility_quantitative_holder_authority_fields_check,
  add constraint eligibility_quantitative_holder_authority_fields_check check (
    (metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')
      and btrim(holder_snapshot_id) <> ''
      and holder_snapshot_fingerprint is not null
      and holder_snapshot_fingerprint ~ '^[a-f0-9]{64}$'
      and holder_derivation_fingerprint is not null
      and holder_derivation_fingerprint ~ '^[a-f0-9]{64}$'
      and as_of is not null
      and daily_series_authority_id is null
      and daily_series_authority_fingerprint is null
      and daily_series_derivation_fingerprint is null)
    or (metric_kind in ('HISTORY_SPAN','VOLATILITY')
      and holder_snapshot_id is null
      and holder_snapshot_fingerprint is null
      and holder_derivation_fingerprint is null
      and as_of is not null
      and daily_series_authority_id is not null
      and daily_series_authority_fingerprint is not null
      and daily_series_derivation_fingerprint is not null)
    or (metric_kind not in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION','HISTORY_SPAN','VOLATILITY')
      and holder_snapshot_id is null
      and holder_snapshot_fingerprint is null
      and holder_derivation_fingerprint is null
      and daily_series_authority_id is null
      and daily_series_authority_fingerprint is null
      and daily_series_derivation_fingerprint is null
      and as_of is null)
  );

alter table public.eligibility_quantitative_evidence
  add constraint eligibility_quantitative_daily_authority_fields_check check (
    (metric_kind in ('HISTORY_SPAN','VOLATILITY')
      and btrim(daily_series_authority_id) <> ''
      and daily_series_authority_fingerprint is not null
      and daily_series_authority_fingerprint ~ '^[a-f0-9]{64}$'
      and daily_series_derivation_fingerprint is not null
      and daily_series_derivation_fingerprint ~ '^[a-f0-9]{64}$'
      and as_of is not null
      and holder_snapshot_id is null
      and holder_snapshot_fingerprint is null
      and holder_derivation_fingerprint is null)
    or
    (metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')
      and daily_series_authority_id is null
      and daily_series_authority_fingerprint is null
      and daily_series_derivation_fingerprint is null)
    or
    (metric_kind not in ('HISTORY_SPAN','VOLATILITY','SINGLE_CONCENTRATION','TOP10_CONCENTRATION')
      and daily_series_authority_id is null
      and daily_series_authority_fingerprint is null
      and daily_series_derivation_fingerprint is null
      and holder_snapshot_id is null
      and holder_snapshot_fingerprint is null
      and holder_derivation_fingerprint is null
      and as_of is null)
  ),
  add constraint eligibility_quantitative_daily_temporal_check check (
    metric_kind not in ('HISTORY_SPAN','VOLATILITY')
    or (observed_at <= available_at and available_at <= as_of)
  ),
  add constraint eligibility_quantitative_daily_authority_fk
    foreign key (daily_series_authority_id, daily_series_authority_fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version)
    references public.intelligence_m5_daily_series_authorities(authority_id, fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version),
  add constraint eligibility_quantitative_daily_derivation_fk
    foreign key (daily_series_authority_id, metric_kind, daily_series_derivation_fingerprint)
    references public.intelligence_m5_daily_series_derivations(authority_id, metric_kind, fingerprint);

create index eligibility_quantitative_daily_authority_fk_idx
  on public.eligibility_quantitative_evidence(daily_series_authority_id, daily_series_authority_fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version);
create index eligibility_quantitative_daily_derivation_fk_idx
  on public.eligibility_quantitative_evidence(daily_series_authority_id, metric_kind, daily_series_derivation_fingerprint);
