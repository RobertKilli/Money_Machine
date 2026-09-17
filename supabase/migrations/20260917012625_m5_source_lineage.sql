-- M5 ingestion provenance Slice 2B.1. Server-only immutable source-material authority.
-- No data is seeded or backfilled. Supporting keys are safe only while provenance tables are empty.

do $$
begin
  if exists (select 1 from public.intelligence_source_availability_claims limit 1)
    or exists (select 1 from public.intelligence_source_artifacts limit 1)
    or exists (select 1 from public.intelligence_source_envelopes limit 1)
  then
    raise exception 'M5_SOURCE_LINEAGE_REQUIRES_EMPTY_PROVENANCE_TABLES';
  end if;
end $$;

alter table public.intelligence_source_availability_claims
  add constraint intelligence_availability_claims_lineage_key
  unique (availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, effective_available_at);

alter table public.intelligence_source_artifacts
  add constraint intelligence_source_artifacts_lineage_scope_key
  unique (source_artifact_id, provider_id, dataset_id, dataset_version);

alter table public.intelligence_source_envelopes
  add constraint intelligence_source_envelopes_lineage_key
  unique (source_envelope_id, source_artifact_id);

create table public.intelligence_source_lineages (
  source_lineage_id text primary key,
  contract_version text not null,
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  availability_claim_ids jsonb not null,
  source_artifact_ids jsonb not null,
  ingestion_attempt_ids jsonb not null,
  member_count integer not null,
  observed_at timestamptz not null,
  effective_available_at timestamptz not null,
  fingerprint text not null,
  recorded_at timestamptz not null,
  unique (source_lineage_id, provider_id, dataset_id, dataset_version),
  check (length(trim(source_lineage_id)) > 0),
  check (length(trim(contract_version)) > 0),
  check (length(trim(provider_id)) > 0),
  check (length(trim(dataset_id)) > 0),
  check (length(trim(dataset_version)) > 0),
  check (jsonb_typeof(availability_claim_ids) = 'array' and jsonb_array_length(availability_claim_ids) > 0),
  check (jsonb_typeof(source_artifact_ids) = 'array'),
  check (jsonb_typeof(ingestion_attempt_ids) = 'array'),
  check (member_count > 0),
  check (member_count = jsonb_array_length(availability_claim_ids)),
  check (observed_at <= effective_available_at),
  check (effective_available_at <= recorded_at),
  check (fingerprint ~ '^[a-f0-9]{64}$')
);

alter table public.intelligence_source_lineages
  add constraint intelligence_source_lineages_dataset_fk
  foreign key (dataset_id, provider_id, dataset_version)
  references public.intelligence_datasets(dataset_id, provider_id, dataset_version)
  on delete restrict;

create index intelligence_source_lineages_scope_idx
  on public.intelligence_source_lineages(provider_id, dataset_id, dataset_version, observed_at, source_lineage_id);

create table public.intelligence_source_lineage_members (
  source_lineage_id text not null,
  member_ordinal integer not null,
  availability_claim_id text not null,
  source_artifact_id text not null,
  source_envelope_id text not null,
  source_observation_id text not null,
  ingestion_attempt_id text not null,
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  observed_at timestamptz not null,
  effective_available_at timestamptz not null,
  member_fingerprint text not null,
  primary key (source_lineage_id, member_ordinal),
  unique (source_lineage_id, availability_claim_id),
  check (member_ordinal >= 0),
  check (length(trim(source_lineage_id)) > 0),
  check (length(trim(availability_claim_id)) > 0),
  check (length(trim(source_artifact_id)) > 0),
  check (length(trim(source_envelope_id)) > 0),
  check (length(trim(source_observation_id)) > 0),
  check (length(trim(ingestion_attempt_id)) > 0),
  check (length(trim(provider_id)) > 0),
  check (length(trim(dataset_id)) > 0),
  check (length(trim(dataset_version)) > 0),
  check (observed_at <= effective_available_at),
  check (member_fingerprint ~ '^[a-f0-9]{64}$')
);

alter table public.intelligence_source_lineage_members
  add constraint intelligence_source_lineage_members_parent_fk
  foreign key (source_lineage_id, provider_id, dataset_id, dataset_version)
  references public.intelligence_source_lineages(source_lineage_id, provider_id, dataset_id, dataset_version)
  on delete restrict;

alter table public.intelligence_source_lineage_members
  add constraint intelligence_source_lineage_members_claim_fk
  foreign key (availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, effective_available_at)
  references public.intelligence_source_availability_claims(availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, effective_available_at)
  on delete restrict;

alter table public.intelligence_source_lineage_members
  add constraint intelligence_source_lineage_members_artifact_fk
  foreign key (source_artifact_id, provider_id, dataset_id, dataset_version)
  references public.intelligence_source_artifacts(source_artifact_id, provider_id, dataset_id, dataset_version)
  on delete restrict;

alter table public.intelligence_source_lineage_members
  add constraint intelligence_source_lineage_members_envelope_fk
  foreign key (source_envelope_id, source_artifact_id)
  references public.intelligence_source_envelopes(source_envelope_id, source_artifact_id)
  on delete restrict;

alter table public.intelligence_source_lineage_members
  add constraint intelligence_source_lineage_members_observation_fk
  foreign key (source_observation_id, source_artifact_id, effective_available_at)
  references public.intelligence_ingestion_source_observations(source_observation_id, source_artifact_id, retrieved_at)
  on delete restrict;

alter table public.intelligence_source_lineage_members
  add constraint intelligence_source_lineage_members_attempt_fk
  foreign key (ingestion_attempt_id)
  references public.intelligence_ingestion_attempts(ingestion_attempt_id)
  on delete restrict;

create index intelligence_source_lineage_members_claim_idx
  on public.intelligence_source_lineage_members(availability_claim_id, source_lineage_id, member_ordinal);
create index intelligence_source_lineage_members_artifact_idx
  on public.intelligence_source_lineage_members(source_artifact_id, provider_id, dataset_id, dataset_version, source_lineage_id);
create index intelligence_source_lineage_members_envelope_idx
  on public.intelligence_source_lineage_members(source_envelope_id, source_artifact_id, source_lineage_id);
create index intelligence_source_lineage_members_observation_idx
  on public.intelligence_source_lineage_members(source_observation_id, source_artifact_id, effective_available_at, source_lineage_id);
create index intelligence_source_lineage_members_attempt_idx
  on public.intelligence_source_lineage_members(ingestion_attempt_id, source_lineage_id, member_ordinal);

alter table public.intelligence_source_lineages enable row level security;
alter table public.intelligence_source_lineage_members enable row level security;
revoke all on public.intelligence_source_lineages from anon, authenticated;
revoke all on public.intelligence_source_lineage_members from anon, authenticated;
create trigger intelligence_source_lineages_immutable before update or delete on public.intelligence_source_lineages for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_source_lineage_members_immutable before update or delete on public.intelligence_source_lineage_members for each row execute function public.reject_intelligence_mutation();
