create table public.eligibility_quantitative_evidence (
  evidence_id text primary key, candidate_id text not null, asset_id text not null, canonical_identifier text not null, asset_class text not null,
  provider_id text not null, dataset_id text not null, dataset_version text not null, observed_at timestamptz not null, available_at timestamptz not null,
  provenance jsonb not null, fingerprint text not null, metric_kind text not null, value_atoms numeric not null, scale integer not null, unit text not null,
  semantics_version text not null, currency_code text, window_start_at timestamptz, window_end_at timestamptz, qualification_basis text,
  check (observed_at <= available_at), check (jsonb_typeof(provenance) = 'object'), check (asset_class <> 'UNKNOWN'), check (scale >= 0), check (value_atoms >= 0), check (value_atoms = trunc(value_atoms)),
  check ((window_start_at is null and window_end_at is null) or (window_start_at is not null and window_end_at is not null and window_start_at <= window_end_at)),
  check (metric_kind in ('LIQUIDITY','VOLUME','MARKET_CAP','TOP10_CONCENTRATION','SINGLE_CONCENTRATION','VOLATILITY','HISTORY_SPAN')),
  check ((metric_kind not in ('LIQUIDITY','VOLUME','MARKET_CAP')) or length(trim(coalesce(currency_code,''))) > 0),
  check ((metric_kind not in ('LIQUIDITY','VOLUME')) or (window_start_at is not null and window_end_at is not null and window_start_at <= window_end_at)),
  check ((metric_kind not in ('TOP10_CONCENTRATION','SINGLE_CONCENTRATION')) or (unit = 'BPS' and scale = 0 and value_atoms <= 10000)),
  check ((metric_kind <> 'VOLATILITY') or (unit = 'BPS' and scale = 0 and window_start_at is not null and window_end_at is not null and window_start_at <= window_end_at)),
  check ((metric_kind <> 'HISTORY_SPAN') or (unit = 'DAYS' and scale = 0 and window_start_at is not null and window_end_at is not null and window_start_at <= window_end_at and length(trim(coalesce(qualification_basis,''))) > 0)),
  check (length(trim(evidence_id)) > 0), check (length(trim(candidate_id)) > 0), check (length(trim(asset_id)) > 0), check (length(trim(canonical_identifier)) > 0), check (length(trim(asset_class)) > 0), check (length(trim(provider_id)) > 0), check (length(trim(dataset_id)) > 0), check (length(trim(dataset_version)) > 0), check (length(trim(unit)) > 0), check (length(trim(semantics_version)) > 0), check (length(trim(fingerprint)) > 0)
);

create table public.eligibility_reference_evidence (
  evidence_id text primary key, candidate_id text not null, asset_id text not null, canonical_identifier text not null, asset_class text not null,
  provider_id text not null, dataset_id text not null, dataset_version text not null, observed_at timestamptz not null, available_at timestamptz not null,
  provenance jsonb not null, fingerprint text not null, reference_kind text not null, reference_at timestamptz, age_basis text, verification_state text,
  check (observed_at <= available_at), check (jsonb_typeof(provenance) = 'object'), check (asset_class <> 'UNKNOWN'), check (reference_kind in ('ASSET_INCEPTION','LISTING','CONTRACT_DEPLOYMENT','CONTRACT_VERIFICATION')),
  check ((reference_kind = 'CONTRACT_VERIFICATION' and verification_state in ('VERIFIED','UNVERIFIED','UNKNOWN') and reference_at is null and age_basis is null) or (reference_kind in ('ASSET_INCEPTION','LISTING','CONTRACT_DEPLOYMENT') and reference_at is not null and age_basis = reference_kind and verification_state is null)),
  check (length(trim(evidence_id)) > 0), check (length(trim(candidate_id)) > 0), check (length(trim(asset_id)) > 0), check (length(trim(canonical_identifier)) > 0), check (length(trim(asset_class)) > 0), check (length(trim(provider_id)) > 0), check (length(trim(dataset_id)) > 0), check (length(trim(dataset_version)) > 0), check (length(trim(fingerprint)) > 0)
);

create table public.eligibility_venue_evidence (
  evidence_id text primary key, candidate_id text not null, asset_id text not null, canonical_identifier text not null, asset_class text not null,
  provider_id text not null, dataset_id text not null, dataset_version text not null, observed_at timestamptz not null, available_at timestamptz not null,
  provenance jsonb not null, fingerprint text not null, venue_id text not null, eligibility_state text not null,
  check (observed_at <= available_at), check (jsonb_typeof(provenance) = 'object'), check (asset_class <> 'UNKNOWN'), check (eligibility_state in ('ELIGIBLE','INELIGIBLE','UNKNOWN')),
  check (length(trim(evidence_id)) > 0), check (length(trim(candidate_id)) > 0), check (length(trim(asset_id)) > 0), check (length(trim(canonical_identifier)) > 0), check (length(trim(asset_class)) > 0), check (length(trim(provider_id)) > 0), check (length(trim(dataset_id)) > 0), check (length(trim(dataset_version)) > 0), check (length(trim(venue_id)) > 0), check (length(trim(fingerprint)) > 0)
);

create table public.eligibility_suspicious_evidence (
  evidence_id text primary key, candidate_id text not null, asset_id text not null, canonical_identifier text not null, asset_class text not null,
  provider_id text not null, dataset_id text not null, dataset_version text not null, observed_at timestamptz not null, available_at timestamptz not null,
  provenance jsonb not null, fingerprint text not null, flag_code text not null, severity text not null, source_signal_id text not null,
  check (observed_at <= available_at), check (jsonb_typeof(provenance) = 'object'), check (asset_class <> 'UNKNOWN'), check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  check (length(trim(evidence_id)) > 0), check (length(trim(candidate_id)) > 0), check (length(trim(asset_id)) > 0), check (length(trim(canonical_identifier)) > 0), check (length(trim(asset_class)) > 0), check (length(trim(provider_id)) > 0), check (length(trim(dataset_id)) > 0), check (length(trim(dataset_version)) > 0), check (length(trim(flag_code)) > 0), check (length(trim(source_signal_id)) > 0), check (length(trim(fingerprint)) > 0)
);

create index eligibility_quantitative_visible_idx on public.eligibility_quantitative_evidence(candidate_id, asset_id, canonical_identifier, asset_class, provider_id, dataset_id, dataset_version, available_at, observed_at);
create index eligibility_reference_visible_idx on public.eligibility_reference_evidence(candidate_id, asset_id, canonical_identifier, asset_class, provider_id, dataset_id, dataset_version, available_at, observed_at);
create index eligibility_venue_visible_idx on public.eligibility_venue_evidence(candidate_id, asset_id, canonical_identifier, asset_class, provider_id, dataset_id, dataset_version, available_at, observed_at);
create index eligibility_suspicious_visible_idx on public.eligibility_suspicious_evidence(candidate_id, asset_id, canonical_identifier, asset_class, provider_id, dataset_id, dataset_version, available_at, observed_at);

alter table public.eligibility_quantitative_evidence enable row level security;
alter table public.eligibility_reference_evidence enable row level security;
alter table public.eligibility_venue_evidence enable row level security;
alter table public.eligibility_suspicious_evidence enable row level security;
revoke all on public.eligibility_quantitative_evidence from anon, authenticated;
revoke all on public.eligibility_reference_evidence from anon, authenticated;
revoke all on public.eligibility_venue_evidence from anon, authenticated;
revoke all on public.eligibility_suspicious_evidence from anon, authenticated;

create trigger eligibility_quantitative_immutable before update or delete on public.eligibility_quantitative_evidence for each row execute function public.reject_intelligence_mutation();
create trigger eligibility_reference_immutable before update or delete on public.eligibility_reference_evidence for each row execute function public.reject_intelligence_mutation();
create trigger eligibility_venue_immutable before update or delete on public.eligibility_venue_evidence for each row execute function public.reject_intelligence_mutation();
create trigger eligibility_suspicious_immutable before update or delete on public.eligibility_suspicious_evidence for each row execute function public.reject_intelligence_mutation();
