-- M5 holder snapshot authority. Append-only, server-only authority material.
create table public.intelligence_m5_holder_snapshots (
  snapshot_id text primary key,
  contract_version text not null check (contract_version = 'm5-holder-snapshot/v1'),
  provider_id text not null check (btrim(provider_id) <> ''),
  dataset_id text not null check (btrim(dataset_id) <> ''),
  dataset_version text not null check (btrim(dataset_version) <> ''),
  source_lineage_id text not null check (btrim(source_lineage_id) <> ''),
  source_lineage_binding text not null check (source_lineage_binding = 'BOUND'),
  chain_id text not null check (chain_id = 'eip155:1'),
  contract_address text not null check (contract_address ~ '^0x[0-9a-f]{40}$'),
  block_number numeric(20,0) not null check (block_number > 0 and block_number <= 18446744073709551615),
  block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
  block_timestamp timestamptz not null,
  finality_status text not null check (finality_status in ('CONFIRMED','FINALIZED')),
  finality_depth integer not null check (finality_depth >= 12),
  finality_reference_block_number numeric(20,0) not null check (finality_reference_block_number >= block_number and finality_reference_block_number <= 18446744073709551615),
  finality_reference_block_hash text not null check (finality_reference_block_hash ~ '^0x[0-9a-f]{64}$'),
  finality_observed_at timestamptz not null,
  finality_received_at timestamptz not null,
  token_decimals integer not null check (token_decimals between 0 and 36),
  supply_basis text not null check (supply_basis = 'TOTAL_SUPPLY'),
  address_policy text not null check (address_policy = 'INCLUDE_ALL'),
  denominator_atoms numeric(78,0) not null check (denominator_atoms > 0 and denominator_atoms <= 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  declared_holder_count integer not null check (declared_holder_count > 0 and declared_holder_count <= 4294967295),
  declared_page_count integer not null check (declared_page_count > 0 and declared_page_count <= 4294967295),
  final_page_ordinal integer not null check (final_page_ordinal >= 0 and final_page_ordinal < declared_page_count),
  material_source_record_ids jsonb not null check (case when jsonb_typeof(material_source_record_ids) = 'array' then jsonb_array_length(material_source_record_ids) = declared_page_count else false end),
  payload_fingerprints jsonb not null check (case when jsonb_typeof(payload_fingerprints) = 'array' then jsonb_array_length(payload_fingerprints) = declared_page_count else false end),
  observed_at timestamptz not null,
  available_at timestamptz not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null,
  check (finality_reference_block_number - block_number = finality_depth),
  check (block_timestamp <= finality_observed_at and finality_observed_at <= finality_received_at and finality_received_at <= available_at),
  check (block_timestamp <= observed_at and observed_at <= available_at and available_at <= recorded_at),
  unique (snapshot_id, source_lineage_id, provider_id, dataset_id, dataset_version),
  foreign key (source_lineage_id, provider_id, dataset_id, dataset_version)
    references public.intelligence_source_lineages (source_lineage_id, provider_id, dataset_id, dataset_version)
);

create table public.intelligence_m5_holder_snapshot_pages (
  snapshot_id text not null references public.intelligence_m5_holder_snapshots(snapshot_id),
  page_ordinal integer not null check (page_ordinal >= 0 and page_ordinal <= 4294967295),
  item_count integer not null check (item_count >= 0 and item_count <= 4294967295),
  is_final boolean not null,
  block_number numeric(20,0) not null check (block_number > 0 and block_number <= 18446744073709551615),
  block_hash text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
  token_decimals integer not null check (token_decimals between 0 and 36),
  source_artifact_id text not null check (btrim(source_artifact_id) <> ''),
  provider_id text not null check (btrim(provider_id) <> ''),
  dataset_id text not null check (btrim(dataset_id) <> ''),
  dataset_version text not null check (btrim(dataset_version) <> ''),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  primary key (snapshot_id, page_ordinal),
  unique (snapshot_id, source_artifact_id),
  foreign key (source_artifact_id, provider_id, dataset_id, dataset_version)
    references public.intelligence_source_artifacts (source_artifact_id, provider_id, dataset_id, dataset_version)
);

create table public.intelligence_m5_holder_snapshot_holders (
  snapshot_id text not null,
  holder_ordinal integer not null check (holder_ordinal >= 0 and holder_ordinal <= 4294967295),
  source_page_ordinal integer not null check (source_page_ordinal >= 0 and source_page_ordinal <= 4294967295),
  source_item_ordinal integer not null check (source_item_ordinal >= 0 and source_item_ordinal <= 4294967295),
  source_artifact_id text not null check (btrim(source_artifact_id) <> ''),
  holder_address text not null check (holder_address ~ '^0x[0-9a-f]{40}$'),
  balance_atoms numeric(78,0) not null check (balance_atoms >= 0 and balance_atoms <= 115792089237316195423570985008687907853269984665640564039457584007913129639935),
  inclusion_state text not null check (inclusion_state = 'INCLUDED'),
  primary key (snapshot_id, holder_ordinal),
  unique (snapshot_id, holder_address),
  foreign key (snapshot_id, source_page_ordinal) references public.intelligence_m5_holder_snapshot_pages(snapshot_id, page_ordinal)
);

create table public.intelligence_m5_holder_concentration_derivations (
  snapshot_id text not null references public.intelligence_m5_holder_snapshots(snapshot_id),
  metric_kind text not null check (metric_kind in ('SINGLE_CONCENTRATION','TOP10_CONCENTRATION')),
  value_bps integer not null check (value_bps between 0 and 10000),
  unit text not null check (unit = 'BPS'),
  scale integer not null check (scale = 0),
  policy_version text not null check (policy_version = 'm5-concentration-policy/v1'),
  ordered_material_source_record_ids jsonb not null check (jsonb_typeof(ordered_material_source_record_ids) = 'array'),
  observed_at timestamptz not null,
  available_at timestamptz not null,
  as_of timestamptz not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null,
  primary key (snapshot_id, metric_kind),
  unique (snapshot_id, metric_kind, fingerprint),
  check (observed_at <= available_at and available_at <= as_of)
);

create index intelligence_m5_holder_snapshots_lineage_fk_idx on public.intelligence_m5_holder_snapshots(source_lineage_id, provider_id, dataset_id, dataset_version);
create index intelligence_m5_holder_snapshot_pages_source_artifact_fk_idx on public.intelligence_m5_holder_snapshot_pages(source_artifact_id, provider_id, dataset_id, dataset_version);
create index intelligence_m5_holder_snapshot_holders_page_idx on public.intelligence_m5_holder_snapshot_holders(snapshot_id, source_page_ordinal);
create index intelligence_m5_holder_snapshot_holders_artifact_idx on public.intelligence_m5_holder_snapshot_holders(source_artifact_id);
create index intelligence_m5_holder_concentration_derivations_snapshot_idx on public.intelligence_m5_holder_concentration_derivations(snapshot_id);

alter table public.intelligence_m5_holder_snapshots enable row level security;
alter table public.intelligence_m5_holder_snapshot_pages enable row level security;
alter table public.intelligence_m5_holder_snapshot_holders enable row level security;
alter table public.intelligence_m5_holder_concentration_derivations enable row level security;
revoke all privileges on table public.intelligence_m5_holder_snapshots, public.intelligence_m5_holder_snapshot_pages, public.intelligence_m5_holder_snapshot_holders, public.intelligence_m5_holder_concentration_derivations from anon, authenticated;

create trigger intelligence_m5_holder_snapshots_immutable before update or delete on public.intelligence_m5_holder_snapshots for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_m5_holder_snapshot_pages_immutable before update or delete on public.intelligence_m5_holder_snapshot_pages for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_m5_holder_snapshot_holders_immutable before update or delete on public.intelligence_m5_holder_snapshot_holders for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_m5_holder_concentration_derivations_immutable before update or delete on public.intelligence_m5_holder_concentration_derivations for each row execute function public.reject_intelligence_mutation();
