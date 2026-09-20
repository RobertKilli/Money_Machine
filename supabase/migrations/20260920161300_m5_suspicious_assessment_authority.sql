-- M5 suspicious assessment authority Slice 1.
-- This migration is intentionally not connected to manifest, assembly, evaluator or producer.
-- No seed, backfill, application DML or fabricated NO_FINDINGS rows are allowed.
do $$
begin
  if to_regclass('public.eligibility_suspicious_assessments') is not null
    and (select count(*) from public.eligibility_suspicious_assessments) > 0 then
    raise exception 'M5_SUSPICIOUS_ASSESSMENT_REQUIRES_EMPTY_TABLES';
  end if;
  if to_regclass('public.eligibility_suspicious_assessment_findings') is not null
    and (select count(*) from public.eligibility_suspicious_assessment_findings) > 0 then
    raise exception 'M5_SUSPICIOUS_ASSESSMENT_REQUIRES_EMPTY_TABLES';
  end if;
end;
$$;

alter table public.eligibility_suspicious_evidence
  add constraint eligibility_suspicious_evidence_identity_key unique (evidence_id, fingerprint);

create table public.eligibility_suspicious_assessments (
  suspicious_assessment_id text primary key,
  contract_version text not null check (contract_version = 'm5-suspicious-assessment/v1'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  candidate_id text not null,
  asset_id text not null,
  canonical_identifier text not null,
  asset_class text not null,
  mapping_revision_id text not null,
  source_lineage_id text not null,
  rule_set_version text not null,
  rule_set_fingerprint text not null check (rule_set_fingerprint ~ '^[a-f0-9]{64}$'),
  detector_version text not null,
  covered_rule_ids jsonb not null,
  result text not null check (result in ('NO_FINDINGS','FINDINGS_PRESENT')),
  finding_references jsonb not null,
  as_of timestamptz not null,
  observed_at timestamptz not null,
  available_at timestamptz not null,
  source_record_ids jsonb not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  dataset_pins jsonb not null,
  recorded_at timestamptz not null,
  check (length(trim(suspicious_assessment_id)) > 0),
  check (length(trim(provider_id)) > 0),
  check (length(trim(dataset_id)) > 0),
  check (length(trim(dataset_version)) > 0),
  check (length(trim(candidate_id)) > 0),
  check (length(trim(asset_id)) > 0),
  check (length(trim(canonical_identifier)) > 0),
  check (length(trim(asset_class)) > 0 and upper(trim(asset_class)) <> 'UNKNOWN'),
  check (length(trim(mapping_revision_id)) > 0),
  check (length(trim(source_lineage_id)) > 0),
  check (length(trim(rule_set_version)) > 0),
  check (length(trim(detector_version)) > 0),
  check (jsonb_typeof(covered_rule_ids) = 'array' and jsonb_array_length(covered_rule_ids) > 0),
  check (jsonb_typeof(finding_references) = 'array'),
  check ((result = 'NO_FINDINGS' and jsonb_array_length(finding_references) = 0) or (result = 'FINDINGS_PRESENT' and jsonb_array_length(finding_references) > 0)),
  check (observed_at <= available_at and available_at <= as_of),
  check (jsonb_typeof(source_record_ids) = 'array' and jsonb_array_length(source_record_ids) > 0),
  check (jsonb_typeof(dataset_pins) = 'array' and jsonb_array_length(dataset_pins) > 0),
  check (recorded_at = date_trunc('milliseconds', recorded_at)),
  unique (suspicious_assessment_id, provider_id, dataset_id, dataset_version, mapping_revision_id, source_lineage_id, rule_set_version, detector_version)
);

alter table public.eligibility_suspicious_assessments
  add constraint eligibility_suspicious_assessments_membership_scope_key
  unique (suspicious_assessment_id, provider_id, dataset_id, dataset_version, mapping_revision_id, source_lineage_id);

alter table public.eligibility_suspicious_assessments
  add constraint eligibility_suspicious_assessments_dataset_fk
    foreign key (dataset_id, provider_id, dataset_version)
    references public.intelligence_datasets(dataset_id, provider_id, dataset_version) on delete restrict,
  add constraint eligibility_suspicious_assessments_mapping_fk
    foreign key (mapping_revision_id, provider_id, dataset_id, dataset_version, asset_id, canonical_identifier, asset_class)
    references public.intelligence_asset_mapping_revisions(mapping_revision_id, provider_id, dataset_id, dataset_version, canonical_asset_id, canonical_identifier, asset_class) on delete restrict,
  add constraint eligibility_suspicious_assessments_lineage_fk
    foreign key (source_lineage_id, provider_id, dataset_id, dataset_version)
    references public.intelligence_source_lineages(source_lineage_id, provider_id, dataset_id, dataset_version) on delete restrict;

create table public.eligibility_suspicious_assessment_findings (
  suspicious_assessment_id text not null,
  member_ordinal integer not null,
  evidence_id text not null,
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  candidate_id text not null,
  asset_id text not null,
  canonical_identifier text not null,
  asset_class text not null,
  mapping_revision_id text not null,
  source_lineage_id text not null,
  primary key (suspicious_assessment_id, member_ordinal),
  unique (suspicious_assessment_id, evidence_id),
  check (member_ordinal >= 0),
  check (length(trim(suspicious_assessment_id)) > 0),
  check (length(trim(evidence_id)) > 0),
  check (length(trim(provider_id)) > 0),
  check (length(trim(dataset_id)) > 0),
  check (length(trim(dataset_version)) > 0),
  check (length(trim(candidate_id)) > 0),
  check (length(trim(asset_id)) > 0),
  check (length(trim(canonical_identifier)) > 0),
  check (length(trim(asset_class)) > 0 and upper(trim(asset_class)) <> 'UNKNOWN'),
  check (length(trim(mapping_revision_id)) > 0),
  check (length(trim(source_lineage_id)) > 0),
  foreign key (suspicious_assessment_id, provider_id, dataset_id, dataset_version, mapping_revision_id, source_lineage_id)
    references public.eligibility_suspicious_assessments(suspicious_assessment_id, provider_id, dataset_id, dataset_version, mapping_revision_id, source_lineage_id) on delete restrict,
  foreign key (evidence_id, evidence_fingerprint)
    references public.eligibility_suspicious_evidence(evidence_id, fingerprint) on delete restrict
);

create index eligibility_suspicious_assessments_scope_idx
  on public.eligibility_suspicious_assessments(provider_id, dataset_id, dataset_version, candidate_id, asset_id, canonical_identifier, asset_class, as_of, suspicious_assessment_id);
create index eligibility_suspicious_assessments_mapping_idx
  on public.eligibility_suspicious_assessments(mapping_revision_id, source_lineage_id, provider_id, dataset_id, dataset_version, suspicious_assessment_id);
create index eligibility_suspicious_assessment_findings_assessment_idx
  on public.eligibility_suspicious_assessment_findings(suspicious_assessment_id, member_ordinal);
create index eligibility_suspicious_assessment_findings_evidence_idx
  on public.eligibility_suspicious_assessment_findings(evidence_id, evidence_fingerprint, suspicious_assessment_id);

alter table public.eligibility_suspicious_assessments enable row level security;
alter table public.eligibility_suspicious_assessment_findings enable row level security;
revoke all privileges on table public.eligibility_suspicious_assessments from anon, authenticated;
revoke all privileges on table public.eligibility_suspicious_assessment_findings from anon, authenticated;
create trigger eligibility_suspicious_assessments_immutable before update or delete on public.eligibility_suspicious_assessments for each row execute function public.reject_intelligence_mutation();
create trigger eligibility_suspicious_assessment_findings_immutable before update or delete on public.eligibility_suspicious_assessment_findings for each row execute function public.reject_intelligence_mutation();
