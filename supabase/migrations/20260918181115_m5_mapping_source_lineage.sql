do $$
begin
  if (select count(*) from public.intelligence_asset_mapping_revisions) > 0 then
    raise exception 'M5_MAPPING_SOURCE_LINEAGE_REQUIRES_EMPTY_MAPPING_TABLE';
  end if;
end;
$$;

alter table public.intelligence_asset_mapping_revisions
  add column source_lineage_id text not null;

alter table public.intelligence_asset_mapping_revisions
  add constraint intelligence_asset_mapping_source_lineage_nonblank
    check (length(trim(source_lineage_id)) > 0),
  add constraint intelligence_asset_mapping_source_lineage_fk
    foreign key (source_lineage_id, provider_id, dataset_id, dataset_version)
    references public.intelligence_source_lineages(source_lineage_id, provider_id, dataset_id, dataset_version)
    on delete restrict;

create index intelligence_asset_mapping_source_lineage_idx
  on public.intelligence_asset_mapping_revisions(source_lineage_id, provider_id, dataset_id, dataset_version, mapping_revision_id);
