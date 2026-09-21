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
  check ((coverage_status = 'COMPLETE' and required_rule_ids = evaluated_rule_ids and jsonb_array_length(source_materials) > 0) or coverage_status in ('INCOMPLETE','INVALID')),
  unique (coverage_authority_id, coverage_fingerprint),
  unique (coverage_authority_id, rule_set_authority_id, rule_set_fingerprint, source_lineage_id, mapping_revision_id)
);

alter table public.m5_suspicious_coverage_authorities
  add constraint m5_suspicious_coverage_rule_set_fk foreign key (rule_set_authority_id, rule_set_fingerprint, provider_id, dataset_id, dataset_version)
    references public.m5_suspicious_rule_set_authorities(rule_set_authority_id, rule_set_fingerprint, provider_id, dataset_id, dataset_version) on delete restrict;

create table public.m5_suspicious_coverage_rule_inputs (
  coverage_authority_id text not null references public.m5_suspicious_coverage_authorities(coverage_authority_id) on delete restrict,
  rule_ordinal integer not null check (rule_ordinal >= 0),
  rule_id text not null,
  rule_fingerprint text not null check (rule_fingerprint ~ '^[a-f0-9]{64}$'),
  input_material jsonb not null check (jsonb_typeof(input_material) = 'object'),
  primary key (coverage_authority_id, rule_ordinal),
  unique (coverage_authority_id, rule_id)
);

alter table public.eligibility_suspicious_assessments
  add column rule_set_authority_id text,
  add column coverage_authority_id text,
  add column coverage_fingerprint text,
  add column evaluated_rule_count integer,
  add constraint eligibility_suspicious_assessments_coverage_pair_check check ((coverage_authority_id is null and coverage_fingerprint is null and evaluated_rule_count is null and rule_set_authority_id is null) or (coverage_authority_id is not null and coverage_fingerprint is not null and evaluated_rule_count is not null and evaluated_rule_count > 0 and rule_set_authority_id is not null));

alter table public.eligibility_suspicious_assessments
  add constraint eligibility_suspicious_assessments_rule_set_authority_fk
    foreign key (rule_set_authority_id, rule_set_fingerprint)
    references public.m5_suspicious_rule_set_authorities(rule_set_authority_id, rule_set_fingerprint) on delete restrict,
  add constraint eligibility_suspicious_assessments_coverage_authority_fk
    foreign key (coverage_authority_id, coverage_fingerprint)
    references public.m5_suspicious_coverage_authorities(coverage_authority_id, coverage_fingerprint) on delete restrict;

create index eligibility_suspicious_assessments_rule_set_authority_idx on public.eligibility_suspicious_assessments(rule_set_authority_id, rule_set_fingerprint, suspicious_assessment_id);

create index m5_suspicious_rule_set_rules_authority_idx on public.m5_suspicious_rule_set_rules(rule_set_authority_id, rule_ordinal);
create index m5_suspicious_coverage_authorities_scope_idx on public.m5_suspicious_coverage_authorities(provider_id, dataset_id, dataset_version, candidate_id, asset_id, as_of, coverage_authority_id);
create index m5_suspicious_coverage_rule_inputs_authority_idx on public.m5_suspicious_coverage_rule_inputs(coverage_authority_id, rule_ordinal);
create index eligibility_suspicious_assessments_coverage_idx on public.eligibility_suspicious_assessments(coverage_authority_id, coverage_fingerprint, suspicious_assessment_id);

alter table public.m5_suspicious_rule_set_authorities enable row level security;
alter table public.m5_suspicious_rule_set_rules enable row level security;
alter table public.m5_suspicious_coverage_authorities enable row level security;
alter table public.m5_suspicious_coverage_rule_inputs enable row level security;
revoke all privileges on table public.m5_suspicious_rule_set_authorities, public.m5_suspicious_rule_set_rules, public.m5_suspicious_coverage_authorities, public.m5_suspicious_coverage_rule_inputs from anon, authenticated;
create trigger m5_suspicious_rule_set_authorities_immutable before update or delete on public.m5_suspicious_rule_set_authorities for each row execute function public.reject_intelligence_mutation();
create trigger m5_suspicious_rule_set_rules_immutable before update or delete on public.m5_suspicious_rule_set_rules for each row execute function public.reject_intelligence_mutation();
create trigger m5_suspicious_coverage_authorities_immutable before update or delete on public.m5_suspicious_coverage_authorities for each row execute function public.reject_intelligence_mutation();
create trigger m5_suspicious_coverage_rule_inputs_immutable before update or delete on public.m5_suspicious_coverage_rule_inputs for each row execute function public.reject_intelligence_mutation();
