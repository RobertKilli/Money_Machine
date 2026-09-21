-- M5 venue-universe authority.  Server-only append-only provenance; no seed or backfill.
do $$
begin
  if (select count(*) from public.eligibility_venue_evidence) > 0 then
    raise exception 'M5_VENUE_AUTHORITY_REQUIRES_EMPTY_VENUE_EVIDENCE';
  end if;
end $$;

create table public.intelligence_m5_venue_authorities (
  authority_id text primary key,
  contract_version text not null,
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  source_lineage_id text not null,
  as_of timestamptz not null,
  coverage_kind text not null,
  coverage_version text not null,
  universe_namespace text not null,
  universe_id text not null,
  expected_page_count integer not null,
  expected_record_count integer not null,
  final_page_ordinal integer not null,
  source_materials jsonb not null,
  member_ids jsonb not null,
  member_fingerprints jsonb not null,
  observed_at timestamptz not null,
  effective_available_at timestamptz not null,
  fingerprint text not null,
  recorded_at timestamptz not null,
  unique (authority_id, fingerprint),
  unique (authority_id, source_lineage_id, provider_id, dataset_id, dataset_version, fingerprint),
  unique (authority_id, fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version),
  check (authority_id like 'm5-venue-authority:%'),
  check (contract_version = 'm5-venue-universe-authority/v1'),
  check (length(trim(provider_id)) > 0 and length(trim(dataset_id)) > 0 and length(trim(dataset_version)) > 0 and length(trim(source_lineage_id)) > 0),
  check (length(trim(coverage_kind)) > 0 and length(trim(coverage_version)) > 0 and length(trim(universe_namespace)) > 0 and length(trim(universe_id)) > 0),
  check (expected_page_count > 0 and expected_record_count > 0 and final_page_ordinal = expected_page_count - 1),
  check (jsonb_typeof(source_materials) = 'array' and jsonb_array_length(source_materials) = expected_record_count),
  check (jsonb_typeof(member_ids) = 'array' and jsonb_typeof(member_fingerprints) = 'array'),
  check (observed_at <= effective_available_at and effective_available_at <= as_of and effective_available_at <= recorded_at),
  check (fingerprint ~ '^[a-f0-9]{64}$')
);

alter table public.intelligence_m5_venue_authorities
  add constraint intelligence_m5_venue_authorities_lineage_fk
  foreign key (source_lineage_id, provider_id, dataset_id, dataset_version)
  references public.intelligence_source_lineages(source_lineage_id, provider_id, dataset_id, dataset_version)
  on delete restrict;

create table public.intelligence_m5_venue_authority_members (
  authority_id text not null,
  member_ordinal integer not null,
  member_id text not null,
  venue_namespace text not null,
  venue_id text not null,
  venue_type text,
  chain_id text,
  source_artifact_id text not null,
  source_envelope_id text not null,
  source_observation_id text not null,
  source_record_ids jsonb not null,
  source_artifact_ids jsonb not null,
  source_envelope_ids jsonb not null,
  source_observation_ids jsonb not null,
  payload_fingerprints jsonb not null,
  observed_at timestamptz not null,
  available_at timestamptz not null,
  fingerprint text not null,
  primary key (authority_id, member_ordinal),
  unique (authority_id, member_id),
  unique (authority_id, member_id, fingerprint),
  check (member_ordinal >= 0),
  check (length(trim(member_id)) > 0 and length(trim(venue_namespace)) > 0 and length(trim(venue_id)) > 0),
  check (jsonb_typeof(source_record_ids) = 'array' and jsonb_array_length(source_record_ids) > 0),
  check (jsonb_typeof(source_artifact_ids) = 'array' and jsonb_typeof(source_envelope_ids) = 'array' and jsonb_typeof(source_observation_ids) = 'array'),
  check (jsonb_typeof(payload_fingerprints) = 'array'),
  check (observed_at <= available_at),
  check (fingerprint ~ '^[a-f0-9]{64}$')
);

alter table public.intelligence_m5_venue_authority_members
  add constraint intelligence_m5_venue_authority_members_parent_fk
  foreign key (authority_id) references public.intelligence_m5_venue_authorities(authority_id) on delete restrict,
  add constraint intelligence_m5_venue_authority_members_artifact_fk
  foreign key (source_artifact_id) references public.intelligence_source_artifacts(source_artifact_id) on delete restrict,
  add constraint intelligence_m5_venue_authority_members_envelope_fk
  foreign key (source_envelope_id) references public.intelligence_source_envelopes(source_envelope_id) on delete restrict,
  add constraint intelligence_m5_venue_authority_members_observation_fk
  foreign key (source_observation_id) references public.intelligence_ingestion_source_observations(source_observation_id) on delete restrict;

create index intelligence_m5_venue_authorities_lineage_idx on public.intelligence_m5_venue_authorities(source_lineage_id);
create index intelligence_m5_venue_authority_members_authority_idx on public.intelligence_m5_venue_authority_members(authority_id, member_ordinal, member_id);
create index intelligence_m5_venue_authority_members_artifact_idx on public.intelligence_m5_venue_authority_members(source_artifact_id, authority_id);
create index intelligence_m5_venue_authority_members_envelope_idx on public.intelligence_m5_venue_authority_members(source_envelope_id, authority_id);
create index intelligence_m5_venue_authority_members_observation_idx on public.intelligence_m5_venue_authority_members(source_observation_id, authority_id);

alter table public.eligibility_venue_evidence
  add column venue_authority_id text not null,
  add column venue_authority_fingerprint text not null,
  add column venue_member_id text not null,
  add column venue_member_fingerprint text not null,
  add column venue_authority_member_count integer not null,
  add column as_of timestamptz not null,
  add constraint eligibility_venue_authority_fields_check check (
    length(trim(venue_authority_id)) > 0 and venue_authority_fingerprint ~ '^[a-f0-9]{64}$' and
    length(trim(venue_member_id)) > 0 and venue_member_fingerprint ~ '^[a-f0-9]{64}$' and
    venue_authority_member_count > 0 and available_at <= as_of
  ),
  add constraint eligibility_venue_authority_fk foreign key
    (venue_authority_id, venue_authority_fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version)
    references public.intelligence_m5_venue_authorities(authority_id, fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version),
  add constraint eligibility_venue_member_fk foreign key
    (venue_authority_id, venue_member_id, venue_member_fingerprint)
    references public.intelligence_m5_venue_authority_members(authority_id, member_id, fingerprint);

create index eligibility_venue_authority_fk_idx on public.eligibility_venue_evidence(venue_authority_id, venue_authority_fingerprint, source_lineage_id, provider_id, dataset_id, dataset_version);
create index eligibility_venue_member_fk_idx on public.eligibility_venue_evidence(venue_authority_id, venue_member_id, venue_member_fingerprint);

alter table public.intelligence_m5_venue_authorities enable row level security;
alter table public.intelligence_m5_venue_authority_members enable row level security;
revoke all privileges on table public.intelligence_m5_venue_authorities, public.intelligence_m5_venue_authority_members from anon, authenticated;
create trigger intelligence_m5_venue_authorities_immutable before update or delete on public.intelligence_m5_venue_authorities for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_m5_venue_authority_members_immutable before update or delete on public.intelligence_m5_venue_authority_members for each row execute function public.reject_intelligence_mutation();
