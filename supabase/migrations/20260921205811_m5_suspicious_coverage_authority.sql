-- M5 suspicious rule-set and coverage authority.  Server-only, append-only.
-- This forward migration contains no seed, backfill or application DML.
do $$
declare n bigint;
begin
  if to_regclass('public.eligibility_suspicious_assessments') is not null then
    execute 'select count(*) from public.eligibility_suspicious_assessments' into n;
    if n <> 0 then raise exception 'M5_SUSPICIOUS_COVERAGE_REQUIRES_EMPTY_ASSESSMENTS'; end if;
  end if;
end $$;

create table public.m5_suspicious_rule_set_authorities (
  rule_set_authority_id text primary key,
  contract_version text not null check (contract_version = 'm5-suspicious-rule-set-authority/v1'),
  rule_set_version text not null,
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  detector_version text not null,
  rule_count integer not null check (rule_count > 0),
  rule_set_fingerprint text not null check (rule_set_fingerprint ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null,
  check (length(trim(rule_set_authority_id)) > 0),
  check (length(trim(rule_set_version)) > 0),
  check (length(trim(provider_id)) > 0 and length(trim(dataset_id)) > 0 and length(trim(dataset_version)) > 0),
  check (recorded_at = date_trunc('milliseconds', recorded_at)),
  unique (rule_set_authority_id, rule_set_fingerprint),
  unique (rule_set_authority_id, rule_set_fingerprint, provider_id, dataset_id, dataset_version),
  unique (rule_set_authority_id, provider_id, dataset_id, dataset_version, rule_set_version, detector_version)
);

create table public.m5_suspicious_rule_set_rules (
  rule_set_authority_id text not null references public.m5_suspicious_rule_set_authorities(rule_set_authority_id) on delete restrict,
  rule_ordinal integer not null check (rule_ordinal >= 0),
  rule_id text not null,
  rule_contract_version text not null,
  enabled boolean not null,
  required boolean not null,
  rule_material jsonb not null check (jsonb_typeof(rule_material) = 'object'),
  rule_fingerprint text not null check (rule_fingerprint ~ '^[a-f0-9]{64}$'),
  primary key (rule_set_authority_id, rule_ordinal),
  unique (rule_set_authority_id, rule_id),
  unique (rule_set_authority_id, rule_id, rule_fingerprint),
  check (length(trim(rule_id)) > 0 and length(trim(rule_contract_version)) > 0)
);

create table public.m5_suspicious_coverage_authorities (
  coverage_authority_id text primary key,
  contract_version text not null check (contract_version = 'm5-suspicious-coverage-authority/v1'),
  rule_set_authority_id text not null,
  rule_set_fingerprint text not null,
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  mapping_revision_id text not null,
  provider_asset_identity_assertion_id text not null,
  source_lineage_id text not null,
  source_lineage_fingerprint text not null check (source_lineage_fingerprint ~ '^[a-f0-9]{64}$'),
  candidate_id text not null,
  asset_id text not null,
  canonical_identifier text not null,
  asset_class text not null,
  as_of timestamptz not null,
  required_rule_ids jsonb not null check (jsonb_typeof(required_rule_ids) = 'array' and jsonb_array_length(required_rule_ids) > 0),
  evaluated_rule_ids jsonb not null check (jsonb_typeof(evaluated_rule_ids) = 'array'),
  required_rule_count integer not null check (required_rule_count > 0),
  evaluated_rule_count integer not null check (evaluated_rule_count > 0),
  source_materials jsonb not null check (jsonb_typeof(source_materials) = 'array'),
  coverage_status text not null check (coverage_status in ('COMPLETE','INCOMPLETE','INVALID')),
  observed_at timestamptz not null,
  available_at timestamptz not null,
  coverage_fingerprint text not null check (coverage_fingerprint ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null,
  check (length(trim(coverage_authority_id)) > 0 and length(trim(rule_set_authority_id)) > 0),
  check (length(trim(provider_id)) > 0 and length(trim(dataset_id)) > 0 and length(trim(dataset_version)) > 0),
  check (observed_at <= available_at and available_at <= as_of),
  check (recorded_at = date_trunc('milliseconds', recorded_at)),
  check ((coverage_status = 'COMPLETE' and required_rule_ids = evaluated_rule_ids and required_rule_count = evaluated_rule_count and jsonb_array_length(source_materials) = evaluated_rule_count) or coverage_status in ('INCOMPLETE','INVALID')),
  unique (coverage_authority_id, coverage_fingerprint),
  unique (coverage_authority_id, rule_set_authority_id, rule_set_fingerprint, source_lineage_id, mapping_revision_id),
  unique (coverage_authority_id, coverage_fingerprint, rule_set_authority_id, rule_set_fingerprint, coverage_status, mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version),
  unique (coverage_authority_id, rule_set_authority_id)
);

alter table public.m5_suspicious_coverage_authorities
  add constraint m5_suspicious_coverage_rule_set_fk foreign key (rule_set_authority_id, rule_set_fingerprint, provider_id, dataset_id, dataset_version)
    references public.m5_suspicious_rule_set_authorities(rule_set_authority_id, rule_set_fingerprint, provider_id, dataset_id, dataset_version) on delete restrict;

create table public.m5_suspicious_coverage_rule_inputs (
  coverage_authority_id text not null,
  rule_set_authority_id text not null,
  rule_ordinal integer not null check (rule_ordinal >= 0),
  rule_id text not null,
  rule_fingerprint text not null check (rule_fingerprint ~ '^[a-f0-9]{64}$'),
  material_fingerprint text not null check (material_fingerprint ~ '^[a-f0-9]{64}$'),
  source_lineage_id text not null,
  source_lineage_member_ordinal integer not null check (source_lineage_member_ordinal >= 0),
  source_lineage_member_fingerprint text not null check (source_lineage_member_fingerprint ~ '^[a-f0-9]{64}$'),
  availability_claim_id text not null,
  availability_claim_fingerprint text not null check (availability_claim_fingerprint ~ '^[a-f0-9]{64}$'),
  source_artifact_id text not null,
  source_artifact_fingerprint text not null check (source_artifact_fingerprint ~ '^[a-f0-9]{64}$'),
  source_envelope_id text not null,
  source_envelope_fingerprint text not null check (source_envelope_fingerprint ~ '^[a-f0-9]{64}$'),
  source_observation_id text not null,
  source_observation_fingerprint text not null check (source_observation_fingerprint ~ '^[a-f0-9]{64}$'),
  ingestion_attempt_id text not null,
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  observed_at timestamptz not null,
  effective_available_at timestamptz not null,
  primary key (coverage_authority_id, rule_ordinal),
  unique (coverage_authority_id, rule_id),
  check (length(trim(rule_id)) > 0 and length(trim(availability_claim_id)) > 0 and length(trim(source_artifact_id)) > 0 and length(trim(source_envelope_id)) > 0 and length(trim(source_observation_id)) > 0 and length(trim(ingestion_attempt_id)) > 0),
  check (observed_at <= effective_available_at)
);

alter table public.intelligence_source_lineage_members
  add constraint intelligence_source_lineage_members_coverage_authority_key
  unique (source_lineage_id, member_ordinal, member_fingerprint, availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, ingestion_attempt_id, provider_id, dataset_id, dataset_version, observed_at, effective_available_at);

alter table public.intelligence_source_artifacts
  add constraint intelligence_source_artifacts_coverage_authority_key
  unique (source_artifact_id, provider_id, dataset_id, dataset_version, payload_fingerprint, source_artifact_fingerprint);
alter table public.intelligence_source_envelopes
  add constraint intelligence_source_envelopes_coverage_authority_key
  unique (source_envelope_id, source_artifact_id, payload_fingerprint, source_envelope_fingerprint);
alter table public.intelligence_source_envelopes
  add constraint intelligence_source_envelopes_coverage_fingerprint_key
  unique (source_envelope_id, source_artifact_id, source_envelope_fingerprint);
alter table public.intelligence_ingestion_source_observations
  add constraint intelligence_source_observations_coverage_authority_key
  unique (source_observation_id, source_artifact_id, retrieved_at, observation_fingerprint);
alter table public.intelligence_source_availability_claims
  add constraint intelligence_source_availability_claims_coverage_authority_key
  unique (availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, effective_available_at, claim_fingerprint);

alter table public.m5_suspicious_coverage_rule_inputs
  add constraint m5_suspicious_coverage_inputs_parent_fk
    foreign key (coverage_authority_id, rule_set_authority_id)
    references public.m5_suspicious_coverage_authorities(coverage_authority_id, rule_set_authority_id) on delete restrict,
  add constraint m5_suspicious_coverage_inputs_rule_fk
    foreign key (rule_set_authority_id, rule_id, rule_fingerprint)
    references public.m5_suspicious_rule_set_rules(rule_set_authority_id, rule_id, rule_fingerprint) on delete restrict,
  add constraint m5_suspicious_coverage_inputs_lineage_member_fk
    foreign key (source_lineage_id, source_lineage_member_ordinal, source_lineage_member_fingerprint, availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, ingestion_attempt_id, provider_id, dataset_id, dataset_version, observed_at, effective_available_at)
    references public.intelligence_source_lineage_members(source_lineage_id, member_ordinal, member_fingerprint, availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, ingestion_attempt_id, provider_id, dataset_id, dataset_version, observed_at, effective_available_at) on delete restrict,
  add constraint m5_suspicious_coverage_inputs_claim_fk
    foreign key (availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, effective_available_at, availability_claim_fingerprint)
    references public.intelligence_source_availability_claims(availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, effective_available_at, claim_fingerprint) on delete restrict,
  add constraint m5_suspicious_coverage_inputs_artifact_fk
    foreign key (source_artifact_id, provider_id, dataset_id, dataset_version, payload_fingerprint, source_artifact_fingerprint)
    references public.intelligence_source_artifacts(source_artifact_id, provider_id, dataset_id, dataset_version, payload_fingerprint, source_artifact_fingerprint) on delete restrict,
  add constraint m5_suspicious_coverage_inputs_envelope_fk
    foreign key (source_envelope_id, source_artifact_id, source_envelope_fingerprint)
    references public.intelligence_source_envelopes(source_envelope_id, source_artifact_id, source_envelope_fingerprint) on delete restrict,
  add constraint m5_suspicious_coverage_inputs_observation_fk
    foreign key (source_observation_id, source_artifact_id, effective_available_at, source_observation_fingerprint)
    references public.intelligence_ingestion_source_observations(source_observation_id, source_artifact_id, retrieved_at, observation_fingerprint) on delete restrict,
  add constraint m5_suspicious_coverage_inputs_attempt_fk
    foreign key (ingestion_attempt_id)
    references public.intelligence_ingestion_attempts(ingestion_attempt_id) on delete restrict;

alter table public.eligibility_suspicious_assessments
  add column rule_set_authority_id text,
  add column coverage_authority_id text,
  add column coverage_fingerprint text,
  add column evaluated_rule_count integer,
  add column coverage_status text,
  add constraint eligibility_suspicious_assessments_coverage_pair_check check ((coverage_authority_id is null and coverage_fingerprint is null and evaluated_rule_count is null and rule_set_authority_id is null and coverage_status is null) or (coverage_authority_id is not null and coverage_fingerprint is not null and evaluated_rule_count is not null and evaluated_rule_count > 0 and rule_set_authority_id is not null and coverage_status = 'COMPLETE'));

alter table public.eligibility_suspicious_assessments
  add constraint eligibility_suspicious_assessments_rule_set_authority_fk
    foreign key (rule_set_authority_id, rule_set_fingerprint)
    references public.m5_suspicious_rule_set_authorities(rule_set_authority_id, rule_set_fingerprint) on delete restrict,
  add constraint eligibility_suspicious_assessments_coverage_authority_fk
    foreign key (coverage_authority_id, coverage_fingerprint, rule_set_authority_id, rule_set_fingerprint, coverage_status, mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version)
    references public.m5_suspicious_coverage_authorities(coverage_authority_id, coverage_fingerprint, rule_set_authority_id, rule_set_fingerprint, coverage_status, mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version) on delete restrict;

-- v1 authoritative assessments cannot have a legacy nullable authority pair.
-- The empty-table guard above makes this a forward-only, fail-closed change;
-- existing application rows are never backfilled or fabricated.
do $$
declare n bigint;
begin
  execute 'select count(*) from public.eligibility_suspicious_assessments' into n;
  if n <> 0 then raise exception 'M5_SUSPICIOUS_COVERAGE_REQUIRES_EMPTY_ASSESSMENTS_FOR_NOT_NULL'; end if;
end $$;

alter table public.eligibility_suspicious_assessments
  alter column rule_set_authority_id set not null,
  alter column coverage_authority_id set not null,
  alter column coverage_fingerprint set not null,
  alter column evaluated_rule_count set not null,
  alter column coverage_status set not null;

create index eligibility_suspicious_assessments_rule_set_authority_idx on public.eligibility_suspicious_assessments(rule_set_authority_id, rule_set_fingerprint, suspicious_assessment_id);

create index m5_suspicious_rule_set_rules_authority_idx on public.m5_suspicious_rule_set_rules(rule_set_authority_id, rule_ordinal);
create index m5_suspicious_coverage_authorities_rule_set_fk_idx on public.m5_suspicious_coverage_authorities(rule_set_authority_id, rule_set_fingerprint, provider_id, dataset_id, dataset_version, coverage_authority_id);
create index m5_suspicious_coverage_authorities_scope_idx on public.m5_suspicious_coverage_authorities(provider_id, dataset_id, dataset_version, candidate_id, asset_id, as_of, coverage_authority_id);
create index m5_suspicious_coverage_rule_inputs_authority_idx on public.m5_suspicious_coverage_rule_inputs(coverage_authority_id, rule_ordinal);
create index m5_suspicious_coverage_rule_inputs_parent_fk_idx on public.m5_suspicious_coverage_rule_inputs(coverage_authority_id, rule_set_authority_id, rule_ordinal);
create index m5_suspicious_coverage_rule_inputs_rule_fk_idx on public.m5_suspicious_coverage_rule_inputs(rule_set_authority_id, rule_id, rule_fingerprint, coverage_authority_id);
create index m5_suspicious_coverage_rule_inputs_lineage_member_fk_idx on public.m5_suspicious_coverage_rule_inputs(source_lineage_id, source_lineage_member_ordinal, source_lineage_member_fingerprint, availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, ingestion_attempt_id, provider_id, dataset_id, dataset_version, observed_at, effective_available_at, coverage_authority_id);
create index m5_suspicious_coverage_rule_inputs_claim_fk_idx on public.m5_suspicious_coverage_rule_inputs(availability_claim_id, source_artifact_id, source_envelope_id, source_observation_id, effective_available_at, availability_claim_fingerprint, coverage_authority_id);
create index m5_suspicious_coverage_rule_inputs_artifact_fk_idx on public.m5_suspicious_coverage_rule_inputs(source_artifact_id, provider_id, dataset_id, dataset_version, payload_fingerprint, source_artifact_fingerprint, coverage_authority_id);
create index m5_suspicious_coverage_rule_inputs_envelope_fk_idx on public.m5_suspicious_coverage_rule_inputs(source_envelope_id, source_artifact_id, source_envelope_fingerprint, coverage_authority_id);
create index m5_suspicious_coverage_rule_inputs_observation_fk_idx on public.m5_suspicious_coverage_rule_inputs(source_observation_id, source_artifact_id, effective_available_at, source_observation_fingerprint, coverage_authority_id);
create index m5_suspicious_coverage_rule_inputs_attempt_fk_idx on public.m5_suspicious_coverage_rule_inputs(ingestion_attempt_id, coverage_authority_id);
create index eligibility_suspicious_assessments_coverage_idx on public.eligibility_suspicious_assessments(coverage_authority_id, coverage_fingerprint, suspicious_assessment_id);
create index eligibility_suspicious_assessments_complete_coverage_fk_idx on public.eligibility_suspicious_assessments(coverage_authority_id, coverage_fingerprint, rule_set_authority_id, rule_set_fingerprint, coverage_status, mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, suspicious_assessment_id);
create index eligibility_suspicious_assessments_dataset_fk_idx on public.eligibility_suspicious_assessments(dataset_id, provider_id, dataset_version);
create index eligibility_suspicious_assessments_lineage_fk_idx on public.eligibility_suspicious_assessments(source_lineage_id, provider_id, dataset_id, dataset_version);
create index eligibility_suspicious_assessments_mapping_fk_idx on public.eligibility_suspicious_assessments(mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class);
create index eligibility_suspicious_assessment_findings_parent_fk_idx on public.eligibility_suspicious_assessment_findings(suspicious_assessment_id, provider_id, dataset_id, dataset_version, mapping_revision_id, source_lineage_id);

create function public.m5_suspicious_assert_rule_set_count()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare expected_count integer; actual_count integer; authority_id text;
begin
  authority_id := new.rule_set_authority_id;
  select rule_count into expected_count from public.m5_suspicious_rule_set_authorities where rule_set_authority_id = authority_id;
  select count(*)::integer into actual_count from public.m5_suspicious_rule_set_rules where rule_set_authority_id = authority_id;
  if expected_count is null or actual_count <> expected_count or actual_count = 0 then
    raise exception using errcode = '23514', message = 'M5_SUSPICIOUS_RULE_SET_MEMBER_COUNT_INVALID';
  end if;
  return null;
end;
$$;

create function public.m5_suspicious_assert_complete_coverage()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare coverage record; required_ids text[]; evaluated_ids text[]; persisted_rules text[]; input_ids text[]; input_count integer;
begin
  select * into coverage from public.m5_suspicious_coverage_authorities where coverage_authority_id = new.coverage_authority_id;
  if coverage.coverage_status <> 'COMPLETE' then return null; end if;
  select coalesce(array_agg(value order by value), '{}'::text[]) into required_ids from jsonb_array_elements_text(coverage.required_rule_ids) value;
  select coalesce(array_agg(value order by value), '{}'::text[]) into evaluated_ids from jsonb_array_elements_text(coverage.evaluated_rule_ids) value;
  select coalesce(array_agg(rule_id order by rule_id), '{}'::text[]) into persisted_rules from public.m5_suspicious_rule_set_rules where rule_set_authority_id = coverage.rule_set_authority_id and enabled and required;
  select coalesce(array_agg(rule_id order by rule_id), '{}'::text[]), count(*)::integer into input_ids, input_count from public.m5_suspicious_coverage_rule_inputs where coverage_authority_id = coverage.coverage_authority_id;
  if required_ids <> persisted_rules or evaluated_ids <> persisted_rules or input_ids <> persisted_rules or coverage.required_rule_count <> cardinality(persisted_rules) or coverage.evaluated_rule_count <> cardinality(persisted_rules) or input_count <> cardinality(persisted_rules) then
    raise exception using errcode = '23514', message = 'M5_SUSPICIOUS_COMPLETE_COVERAGE_MEMBER_SET_INVALID';
  end if;
  return null;
end;
$$;

create constraint trigger m5_suspicious_rule_set_authorities_count_deferred
after insert on public.m5_suspicious_rule_set_authorities deferrable initially deferred
for each row execute function public.m5_suspicious_assert_rule_set_count();
create constraint trigger m5_suspicious_rule_set_rules_count_deferred
after insert on public.m5_suspicious_rule_set_rules deferrable initially deferred
for each row execute function public.m5_suspicious_assert_rule_set_count();
create constraint trigger m5_suspicious_coverage_authorities_complete_deferred
after insert on public.m5_suspicious_coverage_authorities deferrable initially deferred
for each row execute function public.m5_suspicious_assert_complete_coverage();
create constraint trigger m5_suspicious_coverage_rule_inputs_complete_deferred
after insert on public.m5_suspicious_coverage_rule_inputs deferrable initially deferred
for each row execute function public.m5_suspicious_assert_complete_coverage();

revoke all on function public.m5_suspicious_assert_rule_set_count() from public, anon, authenticated;
revoke all on function public.m5_suspicious_assert_complete_coverage() from public, anon, authenticated;

alter table public.m5_suspicious_rule_set_authorities enable row level security;
alter table public.m5_suspicious_rule_set_rules enable row level security;
alter table public.m5_suspicious_coverage_authorities enable row level security;
alter table public.m5_suspicious_coverage_rule_inputs enable row level security;
revoke all privileges on table public.m5_suspicious_rule_set_authorities, public.m5_suspicious_rule_set_rules, public.m5_suspicious_coverage_authorities, public.m5_suspicious_coverage_rule_inputs from anon, authenticated;
revoke all privileges on table public.m5_suspicious_rule_set_authorities, public.m5_suspicious_rule_set_rules, public.m5_suspicious_coverage_authorities, public.m5_suspicious_coverage_rule_inputs from public;
create trigger m5_suspicious_rule_set_authorities_immutable before update or delete on public.m5_suspicious_rule_set_authorities for each row execute function public.reject_intelligence_mutation();
create trigger m5_suspicious_rule_set_rules_immutable before update or delete on public.m5_suspicious_rule_set_rules for each row execute function public.reject_intelligence_mutation();
create trigger m5_suspicious_coverage_authorities_immutable before update or delete on public.m5_suspicious_coverage_authorities for each row execute function public.reject_intelligence_mutation();
create trigger m5_suspicious_coverage_rule_inputs_immutable before update or delete on public.m5_suspicious_coverage_rule_inputs for each row execute function public.reject_intelligence_mutation();
