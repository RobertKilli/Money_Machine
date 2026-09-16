create table public.m5_manifest_authorities (
  manifest_authority_id text primary key,
  authority_type text not null,
  authority_version text not null,
  candidate_id text not null,
  asset_id text not null,
  canonical_identifier text not null,
  asset_class text not null,
  canonical_context_id text not null,
  as_of timestamptz not null,
  manifest_schema_version text not null,
  manifest jsonb not null,
  compatibility jsonb not null,
  allowed_dataset_pins jsonb not null,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  check (authority_type = 'CONFIGURED'),
  check (length(trim(manifest_authority_id)) > 0),
  check (length(trim(authority_version)) > 0),
  check (length(trim(candidate_id)) > 0),
  check (length(trim(asset_id)) > 0),
  check (length(trim(canonical_identifier)) > 0),
  check (length(trim(asset_class)) > 0),
  check (asset_class <> 'UNKNOWN'),
  check (length(trim(canonical_context_id)) > 0),
  check (length(trim(manifest_schema_version)) > 0),
  check (manifest_schema_version = 'm5-evidence-manifest/v1'),
  check (jsonb_typeof(manifest) = 'object'),
  check (manifest->>'version' = manifest_schema_version),
  check (jsonb_typeof(compatibility) = 'object'),
  check (jsonb_typeof(allowed_dataset_pins) = 'array'),
  check (jsonb_array_length(allowed_dataset_pins) > 0),
  check (length(trim(fingerprint)) > 0)
);

create index m5_manifest_authorities_context_idx
  on public.m5_manifest_authorities(candidate_id, canonical_identifier, asset_class, canonical_context_id, as_of, authority_version);

alter table public.m5_manifest_authorities enable row level security;
revoke all on public.m5_manifest_authorities from anon, authenticated;

create trigger m5_manifest_authorities_immutable
  before update or delete on public.m5_manifest_authorities
  for each row execute function public.reject_intelligence_mutation();
