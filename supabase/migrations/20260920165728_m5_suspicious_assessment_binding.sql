-- Slice 2: bind manifest v2 and canonical M5 to immutable suspicious assessments.
-- No seed, backfill, application DML, hosted writes or fabricated assessments.
do $$
begin
  if (select count(*) from public.m5_manifest_authorities) > 0
     or (select count(*) from public.canonical_m5_eligibility_evaluations) > 0 then
    raise exception 'M5_SUSPICIOUS_ASSESSMENT_BINDING_REQUIRES_EMPTY_AUTHORITY_TABLES';
  end if;
end;
$$;

alter table public.m5_manifest_authorities
  drop constraint if exists m5_manifest_authorities_manifest_schema_version_check,
  drop constraint if exists m5_manifest_authorities_manifest_schema_version_check1,
  drop constraint if exists m5_manifest_authorities_manifest_check;

alter table public.m5_manifest_authorities
  add constraint m5_manifest_authorities_manifest_schema_version_v2_check
    check (manifest_schema_version = 'm5-evidence-manifest/v2'),
  add constraint m5_manifest_authorities_manifest_version_v2_check
    check (manifest->>'version' = manifest_schema_version),
  add constraint m5_manifest_authorities_manifest_v2_shape_check
    check (
      jsonb_typeof(manifest) = 'object'
      and manifest ? 'suspiciousAssessment'
      and jsonb_typeof(manifest->'suspiciousAssessment') = 'object'
      and manifest->'suspiciousAssessment' <> 'null'::jsonb
      and (manifest->'suspiciousAssessment') ? 'assessmentId'
      and (manifest->'suspiciousAssessment') ? 'fingerprint'
      and jsonb_typeof((manifest->'suspiciousAssessment')->'assessmentId') = 'string'
      and jsonb_typeof((manifest->'suspiciousAssessment')->'fingerprint') = 'string'
      and length(trim(manifest->'suspiciousAssessment'->>'assessmentId')) > 0
      and (manifest->'suspiciousAssessment'->>'fingerprint') ~ '^[a-f0-9]{64}$'
      and not (manifest ? 'suspicious')
    );

alter table public.eligibility_suspicious_assessments
  add constraint eligibility_suspicious_assessments_id_fingerprint_key
  unique (suspicious_assessment_id, fingerprint);

alter table public.canonical_m5_eligibility_evaluations
  add column suspicious_assessment_id text not null,
  add column suspicious_assessment_fingerprint text not null,
  add column suspicious_assessment_result text not null,
  add constraint canonical_m5_suspicious_assessment_id_check
    check (length(trim(suspicious_assessment_id)) > 0),
  add constraint canonical_m5_suspicious_assessment_fingerprint_check
    check (suspicious_assessment_fingerprint ~ '^[a-f0-9]{64}$'),
  add constraint canonical_m5_suspicious_assessment_result_check
    check (suspicious_assessment_result in ('NO_FINDINGS','FINDINGS_PRESENT')),
  add constraint canonical_m5_suspicious_status_binding_check
    check (
      (suspicious_assessment_result = 'NO_FINDINGS' and suspicious_evidence_status = 'CLEAN')
      or (suspicious_assessment_result = 'FINDINGS_PRESENT' and suspicious_evidence_status = 'SUSPICIOUS')
    ),
  add constraint canonical_m5_suspicious_assessment_fk
    foreign key (suspicious_assessment_id, suspicious_assessment_fingerprint)
    references public.eligibility_suspicious_assessments(suspicious_assessment_id, fingerprint)
    on delete restrict;

create index canonical_m5_suspicious_assessment_idx
  on public.canonical_m5_eligibility_evaluations(suspicious_assessment_id, suspicious_assessment_fingerprint);

alter table public.m5_manifest_authorities enable row level security;
alter table public.canonical_m5_eligibility_evaluations enable row level security;
revoke all privileges on table public.m5_manifest_authorities from anon, authenticated;
revoke all privileges on table public.canonical_m5_eligibility_evaluations from anon, authenticated;
