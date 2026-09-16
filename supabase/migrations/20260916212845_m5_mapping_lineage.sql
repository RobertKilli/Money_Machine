do $$
begin
  if (select count(*) from public.eligibility_quantitative_evidence) > 0
    or (select count(*) from public.eligibility_reference_evidence) > 0
    or (select count(*) from public.eligibility_venue_evidence) > 0
    or (select count(*) from public.eligibility_suspicious_evidence) > 0 then
    raise exception 'M5_MAPPING_LINEAGE_REQUIRES_EMPTY_RAW_EVIDENCE';
  end if;
end;
$$;

create table public.intelligence_asset_mapping_revisions (
  mapping_revision_id text primary key,
  mapping_revision_version text not null,
  provider_id text not null references public.intelligence_providers(provider_id) on delete restrict,
  dataset_id text not null,
  dataset_version text not null,
  provider_asset_namespace text not null,
  provider_asset_id text not null,
  canonical_asset_id text not null,
  canonical_identifier text not null,
  asset_class text not null,
  valid_from timestamptz not null,
  valid_to timestamptz,
  observed_at timestamptz not null,
  available_at timestamptz not null,
  source_record_ids jsonb not null,
  payload_fingerprint text not null,
  fingerprint text not null,
  recorded_at timestamptz not null default now(),
  check (length(trim(mapping_revision_id)) > 0),
  check (length(trim(mapping_revision_version)) > 0),
  check (length(trim(provider_id)) > 0),
  check (length(trim(dataset_id)) > 0),
  check (length(trim(dataset_version)) > 0),
  check (length(trim(provider_asset_namespace)) > 0),
  check (upper(trim(provider_asset_namespace)) not in ('TICKER','SYMBOL')),
  check (length(trim(provider_asset_id)) > 0),
  check (length(trim(canonical_asset_id)) > 0),
  check (length(trim(canonical_identifier)) > 0),
  check (length(trim(asset_class)) > 0 and upper(trim(asset_class)) <> 'UNKNOWN'),
  check (valid_to is null or valid_to > valid_from),
  check (observed_at <= available_at),
  check (jsonb_typeof(source_record_ids) = 'array' and jsonb_array_length(source_record_ids) > 0),
  check (length(trim(payload_fingerprint)) > 0),
  check (length(trim(fingerprint)) > 0)
);

alter table public.intelligence_datasets
  add constraint intelligence_datasets_mapping_owner_key unique (dataset_id, provider_id, dataset_version);

alter table public.intelligence_asset_mapping_revisions
  add constraint intelligence_asset_mapping_dataset_owner_fk
  foreign key (dataset_id, provider_id, dataset_version)
  references public.intelligence_datasets(dataset_id, provider_id, dataset_version)
  on delete restrict;

alter table public.intelligence_asset_mapping_revisions
  add constraint intelligence_asset_mapping_identity_key unique
  (mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class);

create index intelligence_asset_mapping_lookup_idx
  on public.intelligence_asset_mapping_revisions
  (provider_id, dataset_id, dataset_version, provider_asset_namespace, provider_asset_id, valid_from, valid_to, mapping_revision_id);

alter table public.eligibility_quantitative_evidence add column mapping_revision_id text not null;
alter table public.eligibility_reference_evidence add column mapping_revision_id text not null;
alter table public.eligibility_venue_evidence add column mapping_revision_id text not null;
alter table public.eligibility_suspicious_evidence add column mapping_revision_id text not null;

alter table public.eligibility_quantitative_evidence
  add constraint eligibility_quantitative_mapping_revision_nonblank check (length(trim(mapping_revision_id)) > 0),
  add constraint eligibility_quantitative_mapping_revision_fk foreign key (mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class)
    references public.intelligence_asset_mapping_revisions(mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class) on delete restrict;
alter table public.eligibility_reference_evidence
  add constraint eligibility_reference_mapping_revision_nonblank check (length(trim(mapping_revision_id)) > 0),
  add constraint eligibility_reference_mapping_revision_fk foreign key (mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class)
    references public.intelligence_asset_mapping_revisions(mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class) on delete restrict;
alter table public.eligibility_venue_evidence
  add constraint eligibility_venue_mapping_revision_nonblank check (length(trim(mapping_revision_id)) > 0),
  add constraint eligibility_venue_mapping_revision_fk foreign key (mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class)
    references public.intelligence_asset_mapping_revisions(mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class) on delete restrict;
alter table public.eligibility_suspicious_evidence
  add constraint eligibility_suspicious_mapping_revision_nonblank check (length(trim(mapping_revision_id)) > 0),
  add constraint eligibility_suspicious_mapping_revision_fk foreign key (mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class)
    references public.intelligence_asset_mapping_revisions(mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class) on delete restrict;

create index eligibility_quantitative_mapping_revision_idx on public.eligibility_quantitative_evidence(mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class);
create index eligibility_reference_mapping_revision_idx on public.eligibility_reference_evidence(mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class);
create index eligibility_venue_mapping_revision_idx on public.eligibility_venue_evidence(mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class);
create index eligibility_suspicious_mapping_revision_idx on public.eligibility_suspicious_evidence(mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class);

alter table public.intelligence_asset_mapping_revisions enable row level security;
revoke all on public.intelligence_asset_mapping_revisions from anon, authenticated;
create trigger intelligence_asset_mapping_revision_immutable
  before update or delete on public.intelligence_asset_mapping_revisions
  for each row execute function public.reject_intelligence_mutation();
