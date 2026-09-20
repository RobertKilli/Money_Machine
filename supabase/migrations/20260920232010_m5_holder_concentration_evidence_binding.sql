-- Bind concentration raw evidence to the persisted holder authority pair.
-- This migration is intentionally fail-closed for any pre-existing concentration rows.
do $$
begin
  if exists (
    select 1 from public.eligibility_quantitative_evidence
    where metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')
  ) then
    raise exception 'M5_CONCENTRATION_EVIDENCE_MIGRATION_REQUIRES_EMPTY_CONCENTRATION_ROWS';
  end if;
end $$;

alter table public.intelligence_m5_holder_snapshots
  add constraint intelligence_m5_holder_snapshots_authority_key
  unique (snapshot_id, fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version);

alter table public.eligibility_quantitative_evidence
  add column holder_snapshot_id text,
  add column holder_snapshot_fingerprint text,
  add column holder_derivation_fingerprint text,
  add column as_of timestamptz,
  add constraint eligibility_quantitative_holder_authority_fields_check check (
    (metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')
      and btrim(holder_snapshot_id) <> ''
      and holder_snapshot_fingerprint ~ '^[a-f0-9]{64}$'
      and holder_derivation_fingerprint ~ '^[a-f0-9]{64}$'
      and as_of is not null)
    or
    (metric_kind not in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')
      and holder_snapshot_id is null
      and holder_snapshot_fingerprint is null
      and holder_derivation_fingerprint is null
      and as_of is null)
  ),
  add constraint eligibility_quantitative_holder_temporal_check check (
    metric_kind not in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')
    or (observed_at <= available_at and available_at <= as_of)
  ),
  add constraint eligibility_quantitative_holder_snapshot_fk
    foreign key (holder_snapshot_id, holder_snapshot_fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version)
    references public.intelligence_m5_holder_snapshots(snapshot_id, fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version),
  add constraint eligibility_quantitative_holder_derivation_fk
    foreign key (holder_snapshot_id, metric_kind, holder_derivation_fingerprint)
    references public.intelligence_m5_holder_concentration_derivations(snapshot_id, metric_kind, fingerprint);

create index eligibility_quantitative_holder_snapshot_fk_idx
  on public.eligibility_quantitative_evidence(holder_snapshot_id, holder_snapshot_fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version);
create index eligibility_quantitative_holder_derivation_fk_idx
  on public.eligibility_quantitative_evidence(holder_snapshot_id, metric_kind, holder_derivation_fingerprint);
