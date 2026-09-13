create table if not exists public.canonical_m4_analysis_snapshots (
  analysis_id text primary key,
  candidate_id text not null,
  canonical_identifier text not null,
  asset_class text not null,
  as_of timestamptz not null,
  available_at timestamptz not null,
  engine_version text not null,
  feature_set_version text not null,
  trend_policy_version text not null,
  acceleration_version text not null,
  dataset_pins jsonb not null,
  input_evidence_ids jsonb not null,
  trend jsonb not null,
  corroboration_provider_ids jsonb not null,
  corroboration_evidence_ids jsonb not null,
  distinct_provider_count integer not null check (distinct_provider_count >= 0),
  suspicious_flags jsonb not null default '[]'::jsonb,
  integrity_status text not null,
  config_hash text not null,
  fingerprint text not null,
  check (jsonb_typeof(dataset_pins) = 'array'),
  check (jsonb_typeof(input_evidence_ids) = 'array'),
  check (jsonb_typeof(corroboration_provider_ids) = 'array'),
  check (jsonb_typeof(corroboration_evidence_ids) = 'array'),
  check (jsonb_typeof(suspicious_flags) = 'array'),
  check (jsonb_typeof(trend) = 'object'),
  check (available_at >= as_of),
  unique (analysis_id, fingerprint),
  check (length(trim(analysis_id)) > 0),
  check (length(trim(candidate_id)) > 0),
  check (length(trim(canonical_identifier)) > 0),
  check (length(trim(asset_class)) > 0),
  check (length(trim(engine_version)) > 0),
  check (length(trim(feature_set_version)) > 0),
  check (length(trim(trend_policy_version)) > 0),
  check (length(trim(acceleration_version)) > 0),
  check (length(trim(config_hash)) > 0),
  check (length(trim(fingerprint)) > 0)
);
create index if not exists canonical_m4_candidate_time_idx on public.canonical_m4_analysis_snapshots(candidate_id, canonical_identifier, as_of desc, available_at desc);
create index if not exists canonical_m4_dataset_time_idx on public.canonical_m4_analysis_snapshots using gin(dataset_pins);

create table if not exists public.canonical_m5_eligibility_evaluations (
  evaluation_id text primary key,
  candidate_id text not null,
  canonical_identifier text not null,
  asset_class text not null,
  as_of timestamptz not null,
  available_at timestamptz not null,
  policy_version text not null,
  profile_version text not null,
  status text not null check (status in ('ELIGIBLE', 'INELIGIBLE', 'INCOMPLETE')),
  checks jsonb not null,
  reason_codes jsonb not null,
  evidence_ids jsonb not null,
  suspicious_flags jsonb not null default '[]'::jsonb,
  suspicious_evidence_status text not null check (suspicious_evidence_status in ('CLEAN', 'SUSPICIOUS', 'INCOMPLETE')),
  dataset_pins jsonb not null,
  fingerprint text not null,
  check (jsonb_typeof(checks) = 'array'),
  check (jsonb_typeof(reason_codes) = 'array'),
  check (jsonb_typeof(evidence_ids) = 'array'),
  check (jsonb_typeof(suspicious_flags) = 'array'),
  check (jsonb_typeof(dataset_pins) = 'array'),
  check (available_at >= as_of),
  unique (evaluation_id, fingerprint),
  check (length(trim(evaluation_id)) > 0),
  check (length(trim(candidate_id)) > 0),
  check (length(trim(canonical_identifier)) > 0),
  check (length(trim(asset_class)) > 0),
  check (length(trim(policy_version)) > 0),
  check (length(trim(profile_version)) > 0),
  check (length(trim(fingerprint)) > 0)
);
create index if not exists canonical_m5_candidate_time_idx on public.canonical_m5_eligibility_evaluations(candidate_id, canonical_identifier, as_of desc, available_at desc);
create index if not exists canonical_m5_dataset_time_idx on public.canonical_m5_eligibility_evaluations using gin(dataset_pins);
create index if not exists canonical_m4_visible_idx on public.canonical_m4_analysis_snapshots(candidate_id, canonical_identifier, as_of, available_at);
create index if not exists canonical_m5_visible_idx on public.canonical_m5_eligibility_evaluations(candidate_id, canonical_identifier, status, as_of, available_at);

alter table public.canonical_m4_analysis_snapshots enable row level security;
alter table public.canonical_m5_eligibility_evaluations enable row level security;
revoke all on public.canonical_m4_analysis_snapshots from anon, authenticated;
revoke all on public.canonical_m5_eligibility_evaluations from anon, authenticated;

drop trigger if exists canonical_m4_immutable on public.canonical_m4_analysis_snapshots;
create trigger canonical_m4_immutable before update or delete on public.canonical_m4_analysis_snapshots for each row execute function public.reject_intelligence_mutation();
drop trigger if exists canonical_m5_immutable on public.canonical_m5_eligibility_evaluations;
create trigger canonical_m5_immutable before update or delete on public.canonical_m5_eligibility_evaluations for each row execute function public.reject_intelligence_mutation();
