-- Close the NULL/UNKNOWN hole in the two authority CHECK constraints from
-- 20260921105605.  The explicit IS TRUE wrapper makes every branch
-- fail-closed: PostgreSQL CHECK constraints accept UNKNOWN otherwise.

alter table public.eligibility_quantitative_evidence
  drop constraint eligibility_quantitative_holder_authority_fields_check,
  drop constraint eligibility_quantitative_daily_authority_fields_check,
  add constraint eligibility_quantitative_holder_authority_fields_check check ((
    (
      metric_kind in ('HISTORY_SPAN','VOLATILITY')
      and daily_series_authority_id is not null
      and btrim(daily_series_authority_id) <> ''
      and daily_series_authority_fingerprint is not null
      and daily_series_authority_fingerprint ~ '^[a-f0-9]{64}$'
      and daily_series_derivation_fingerprint is not null
      and daily_series_derivation_fingerprint ~ '^[a-f0-9]{64}$'
      and as_of is not null
      and holder_snapshot_id is null
      and holder_snapshot_fingerprint is null
      and holder_derivation_fingerprint is null
    )
    or (
      metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')
      and holder_snapshot_id is not null
      and btrim(holder_snapshot_id) <> ''
      and holder_snapshot_fingerprint is not null
      and holder_snapshot_fingerprint ~ '^[a-f0-9]{64}$'
      and holder_derivation_fingerprint is not null
      and holder_derivation_fingerprint ~ '^[a-f0-9]{64}$'
      and as_of is not null
      and daily_series_authority_id is null
      and daily_series_authority_fingerprint is null
      and daily_series_derivation_fingerprint is null
    )
    or (
      metric_kind not in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION','HISTORY_SPAN','VOLATILITY')
      and holder_snapshot_id is null
      and holder_snapshot_fingerprint is null
      and holder_derivation_fingerprint is null
      and daily_series_authority_id is null
      and daily_series_authority_fingerprint is null
      and daily_series_derivation_fingerprint is null
      and as_of is null
    )
  ) is true),
  add constraint eligibility_quantitative_daily_authority_fields_check check ((
    (
      metric_kind in ('HISTORY_SPAN','VOLATILITY')
      and daily_series_authority_id is not null
      and btrim(daily_series_authority_id) <> ''
      and daily_series_authority_fingerprint is not null
      and daily_series_authority_fingerprint ~ '^[a-f0-9]{64}$'
      and daily_series_derivation_fingerprint is not null
      and daily_series_derivation_fingerprint ~ '^[a-f0-9]{64}$'
      and as_of is not null
      and holder_snapshot_id is null
      and holder_snapshot_fingerprint is null
      and holder_derivation_fingerprint is null
    )
    or (
      metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')
      and daily_series_authority_id is null
      and daily_series_authority_fingerprint is null
      and daily_series_derivation_fingerprint is null
    )
    or (
      metric_kind not in ('HISTORY_SPAN','VOLATILITY','SINGLE_CONCENTRATION','TOP10_CONCENTRATION')
      and daily_series_authority_id is null
      and daily_series_authority_fingerprint is null
      and daily_series_derivation_fingerprint is null
      and as_of is null
    )
  ) is true);
