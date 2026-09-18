do $$
begin
  if (select count(*) from public.eligibility_quantitative_evidence) > 0
    or (select count(*) from public.eligibility_reference_evidence) > 0
    or (select count(*) from public.eligibility_venue_evidence) > 0
    or (select count(*) from public.eligibility_suspicious_evidence) > 0 then
    raise exception 'M5_RAW_SOURCE_LINEAGE_REQUIRES_EMPTY_RAW_EVIDENCE';
  end if;
  if (select count(*) from public.intelligence_asset_mapping_revisions) > 0 then
    raise exception 'M5_RAW_SOURCE_LINEAGE_REQUIRES_EMPTY_MAPPING_TABLE';
  end if;
end;
$$;

alter table public.eligibility_quantitative_evidence add column source_lineage_id text not null;
alter table public.eligibility_reference_evidence add column source_lineage_id text not null;
alter table public.eligibility_venue_evidence add column source_lineage_id text not null;
alter table public.eligibility_suspicious_evidence add column source_lineage_id text not null;

alter table public.eligibility_quantitative_evidence drop constraint eligibility_quantitative_mapping_revision_fk;
alter table public.eligibility_reference_evidence drop constraint eligibility_reference_mapping_revision_fk;
alter table public.eligibility_venue_evidence drop constraint eligibility_venue_mapping_revision_fk;
alter table public.eligibility_suspicious_evidence drop constraint eligibility_suspicious_mapping_revision_fk;

alter table public.intelligence_asset_mapping_revisions
  drop constraint intelligence_asset_mapping_identity_key;

alter table public.intelligence_asset_mapping_revisions
  add constraint intelligence_asset_mapping_lineage_identity_key unique
    (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class);

alter table public.eligibility_quantitative_evidence
  add constraint eligibility_quantitative_source_lineage_nonblank check (length(trim(source_lineage_id)) > 0),
  add constraint eligibility_quantitative_mapping_lineage_fk foreign key
    (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class)
    references public.intelligence_asset_mapping_revisions
      (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class) on delete restrict;
alter table public.eligibility_reference_evidence
  add constraint eligibility_reference_source_lineage_nonblank check (length(trim(source_lineage_id)) > 0),
  add constraint eligibility_reference_mapping_lineage_fk foreign key
    (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class)
    references public.intelligence_asset_mapping_revisions
      (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class) on delete restrict;
alter table public.eligibility_venue_evidence
  add constraint eligibility_venue_source_lineage_nonblank check (length(trim(source_lineage_id)) > 0),
  add constraint eligibility_venue_mapping_lineage_fk foreign key
    (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class)
    references public.intelligence_asset_mapping_revisions
      (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class) on delete restrict;
alter table public.eligibility_suspicious_evidence
  add constraint eligibility_suspicious_source_lineage_nonblank check (length(trim(source_lineage_id)) > 0),
  add constraint eligibility_suspicious_mapping_lineage_fk foreign key
    (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class)
    references public.intelligence_asset_mapping_revisions
      (mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class) on delete restrict;

drop index if exists public.eligibility_quantitative_mapping_revision_idx;
drop index if exists public.eligibility_reference_mapping_revision_idx;
drop index if exists public.eligibility_venue_mapping_revision_idx;
drop index if exists public.eligibility_suspicious_mapping_revision_idx;
create index eligibility_quantitative_mapping_lineage_idx on public.eligibility_quantitative_evidence(mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class);
create index eligibility_reference_mapping_lineage_idx on public.eligibility_reference_evidence(mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class);
create index eligibility_venue_mapping_lineage_idx on public.eligibility_venue_evidence(mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class);
create index eligibility_suspicious_mapping_lineage_idx on public.eligibility_suspicious_evidence(mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class);
