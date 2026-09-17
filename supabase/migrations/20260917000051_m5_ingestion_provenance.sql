-- M5 ingestion provenance Slice 2A. Server-only, append-only records.

create table public.intelligence_ingestion_requests (
  ingestion_request_id text primary key,
  contract_version text not null,
  idempotency_key text not null,
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  provider_source_namespace text not null,
  envelope_schema_version text not null,
  request_scope jsonb not null,
  adapter_contract_version text not null,
  parser_contract_version text not null,
  request_fingerprint text not null,
  requested_at timestamptz not null,
  provenance jsonb not null,
  created_at timestamptz not null default now(),
  check (length(trim(ingestion_request_id)) > 0),
  check (length(trim(contract_version)) > 0),
  check (length(trim(idempotency_key)) > 0),
  check (length(trim(provider_id)) > 0),
  check (length(trim(dataset_id)) > 0),
  check (length(trim(dataset_version)) > 0),
  check (length(trim(provider_source_namespace)) > 0),
  check (length(trim(envelope_schema_version)) > 0),
  check (jsonb_typeof(request_scope) = 'object'),
  check (length(trim(adapter_contract_version)) > 0),
  check (length(trim(parser_contract_version)) > 0),
  check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  check (jsonb_typeof(provenance) = 'object')
);

alter table public.intelligence_ingestion_requests
  add constraint intelligence_ingestion_requests_dataset_fk
  foreign key (dataset_id, provider_id, dataset_version)
  references public.intelligence_datasets(dataset_id, provider_id, dataset_version)
  on delete restrict;

alter table public.intelligence_ingestion_requests
  add constraint intelligence_ingestion_requests_contract_key
  unique (ingestion_request_id, adapter_contract_version, parser_contract_version);

create index intelligence_ingestion_requests_dataset_idx
  on public.intelligence_ingestion_requests(provider_id, dataset_id, dataset_version, requested_at desc);

create table public.intelligence_ingestion_attempts (
  ingestion_attempt_id text primary key,
  ingestion_request_id text not null,
  contract_version text not null,
  attempt_number integer not null,
  adapter_version text not null,
  parser_version text not null,
  execution_input jsonb not null,
  attempt_fingerprint text not null,
  started_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (ingestion_request_id, attempt_number),
  check (length(trim(ingestion_attempt_id)) > 0),
  check (length(trim(contract_version)) > 0),
  check (attempt_number > 0),
  check (length(trim(adapter_version)) > 0),
  check (length(trim(parser_version)) > 0),
  check (jsonb_typeof(execution_input) = 'object'),
  check (attempt_fingerprint ~ '^[a-f0-9]{64}$')
);

alter table public.intelligence_ingestion_attempts
  add constraint intelligence_ingestion_attempts_request_fk
  foreign key (ingestion_request_id)
  references public.intelligence_ingestion_requests(ingestion_request_id)
  on delete restrict;

alter table public.intelligence_ingestion_attempts
  add constraint intelligence_ingestion_attempts_contract_fk
  foreign key (ingestion_request_id, adapter_version, parser_version)
  references public.intelligence_ingestion_requests(ingestion_request_id, adapter_contract_version, parser_contract_version)
  on delete restrict;

create index intelligence_ingestion_attempts_request_idx
  on public.intelligence_ingestion_attempts(ingestion_request_id, attempt_number desc);

create table public.intelligence_source_artifacts (
  source_artifact_id text primary key,
  contract_version text not null,
  provider_id text not null,
  dataset_id text not null,
  dataset_version text not null,
  provider_source_namespace text not null,
  provider_external_record_id text not null,
  provider_revision text,
  payload_fingerprint text not null,
  source_artifact_fingerprint text not null,
  recorded_at timestamptz not null,
  unique (source_artifact_id, payload_fingerprint),
  check (length(trim(source_artifact_id)) > 0),
  check (length(trim(contract_version)) > 0),
  check (length(trim(provider_id)) > 0),
  check (length(trim(dataset_id)) > 0),
  check (length(trim(dataset_version)) > 0),
  check (length(trim(provider_source_namespace)) > 0),
  check (upper(trim(provider_source_namespace)) not in ('TICKER','SYMBOL')),
  check (length(trim(provider_external_record_id)) > 0),
  check (provider_revision is null or length(trim(provider_revision)) > 0),
  check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  check (source_artifact_fingerprint ~ '^[a-f0-9]{64}$')
);

alter table public.intelligence_source_artifacts
  add constraint intelligence_source_artifacts_dataset_fk
  foreign key (dataset_id, provider_id, dataset_version)
  references public.intelligence_datasets(dataset_id, provider_id, dataset_version)
  on delete restrict;

create index intelligence_source_artifacts_lookup_idx
  on public.intelligence_source_artifacts(provider_id, dataset_id, dataset_version, provider_source_namespace, provider_external_record_id, provider_revision, source_artifact_id);

create table public.intelligence_source_envelopes (
  source_envelope_id text primary key,
  contract_version text not null,
  source_artifact_id text not null,
  parser_contract_version text not null,
  envelope_schema_version text not null,
  normalized_envelope jsonb not null,
  selected_auditable_fields jsonb not null,
  payload_fingerprint text not null,
  source_envelope_fingerprint text not null,
  provider_published_at timestamptz,
  observed_at timestamptz not null,
  temporal_quality_status text not null,
  temporal_diagnostic_codes jsonb not null,
  recorded_at timestamptz not null,
  unique (source_envelope_id, source_artifact_id, temporal_quality_status),
  check (length(trim(source_envelope_id)) > 0),
  check (length(trim(contract_version)) > 0),
  check (length(trim(parser_contract_version)) > 0),
  check (length(trim(envelope_schema_version)) > 0),
  check (jsonb_typeof(normalized_envelope) = 'object'),
  check (jsonb_typeof(selected_auditable_fields) = 'object'),
  check (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  check (source_envelope_fingerprint ~ '^[a-f0-9]{64}$'),
  check (temporal_quality_status in ('RESOLVED','QUARANTINED')),
  check (jsonb_typeof(temporal_diagnostic_codes) = 'array'),
  check ((temporal_quality_status = 'RESOLVED' and jsonb_array_length(temporal_diagnostic_codes) = 0) or (temporal_quality_status = 'QUARANTINED' and jsonb_array_length(temporal_diagnostic_codes) > 0)),
  check (observed_at <= recorded_at)
);

alter table public.intelligence_source_envelopes
  add constraint intelligence_source_envelopes_artifact_fk
  foreign key (source_artifact_id, payload_fingerprint)
  references public.intelligence_source_artifacts(source_artifact_id, payload_fingerprint)
  on delete restrict;

create index intelligence_source_envelopes_artifact_idx
  on public.intelligence_source_envelopes(source_artifact_id, parser_contract_version, envelope_schema_version, observed_at, source_envelope_id);

create table public.intelligence_ingestion_source_observations (
  source_observation_id text primary key,
  contract_version text not null,
  ingestion_attempt_id text not null,
  source_artifact_id text not null,
  response_page_ordinal integer not null,
  item_ordinal integer not null,
  retrieved_at timestamptz not null,
  metadata jsonb not null,
  observation_fingerprint text not null,
  recorded_at timestamptz not null,
  unique (source_observation_id, source_artifact_id, retrieved_at),
  unique (ingestion_attempt_id, source_observation_id),
  check (length(trim(source_observation_id)) > 0),
  check (length(trim(contract_version)) > 0),
  check (response_page_ordinal >= 0),
  check (item_ordinal >= 0),
  check (jsonb_typeof(metadata) = 'object'),
  check (observation_fingerprint ~ '^[a-f0-9]{64}$'),
  check (retrieved_at <= recorded_at)
);

alter table public.intelligence_ingestion_source_observations
  add constraint intelligence_ingestion_observations_attempt_fk
  foreign key (ingestion_attempt_id)
  references public.intelligence_ingestion_attempts(ingestion_attempt_id)
  on delete restrict;

alter table public.intelligence_ingestion_source_observations
  add constraint intelligence_ingestion_observations_artifact_fk
  foreign key (source_artifact_id)
  references public.intelligence_source_artifacts(source_artifact_id)
  on delete restrict;

create index intelligence_ingestion_observations_attempt_idx
  on public.intelligence_ingestion_source_observations(ingestion_attempt_id, response_page_ordinal, item_ordinal, source_observation_id);
create index intelligence_ingestion_observations_artifact_idx
  on public.intelligence_ingestion_source_observations(source_artifact_id, retrieved_at, source_observation_id);

create table public.intelligence_source_availability_claims (
  availability_claim_id text primary key,
  source_envelope_id text not null,
  source_observation_id text not null,
  contract_version text not null,
  basis text not null,
  effective_available_at timestamptz not null,
  claim_fingerprint text not null,
  recorded_at timestamptz not null,
  source_artifact_id text not null,
  temporal_quality_status text not null,
  check (length(trim(availability_claim_id)) > 0),
  check (length(trim(contract_version)) > 0),
  check (basis = 'RETRIEVAL_OBSERVED'),
  check (claim_fingerprint ~ '^[a-f0-9]{64}$'),
  check (temporal_quality_status = 'RESOLVED'),
  check (effective_available_at <= recorded_at)
);

alter table public.intelligence_source_availability_claims
  add constraint intelligence_availability_envelope_fk
  foreign key (source_envelope_id, source_artifact_id, temporal_quality_status)
  references public.intelligence_source_envelopes(source_envelope_id, source_artifact_id, temporal_quality_status)
  on delete restrict;

alter table public.intelligence_source_availability_claims
  add constraint intelligence_availability_observation_fk
  foreign key (source_observation_id, source_artifact_id, effective_available_at)
  references public.intelligence_ingestion_source_observations(source_observation_id, source_artifact_id, retrieved_at)
  on delete restrict;

create index intelligence_availability_claims_time_idx
  on public.intelligence_source_availability_claims(effective_available_at, availability_claim_id);
create index intelligence_availability_claims_envelope_fk_idx
  on public.intelligence_source_availability_claims(source_envelope_id, source_artifact_id, temporal_quality_status);
create index intelligence_availability_claims_observation_fk_idx
  on public.intelligence_source_availability_claims(source_observation_id, source_artifact_id, effective_available_at);

create table public.intelligence_ingestion_events (
  lifecycle_event_id text primary key,
  ingestion_attempt_id text not null,
  contract_version text not null,
  sequence integer not null,
  event_type text not null,
  payload jsonb not null,
  event_fingerprint text not null,
  recorded_at timestamptz not null,
  source_observation_id text,
  unique (ingestion_attempt_id, sequence),
  check (length(trim(lifecycle_event_id)) > 0),
  check (length(trim(contract_version)) > 0),
  check (sequence > 0),
  check (event_type in ('STARTED','SOURCE_OBSERVED','COMPLETED','PARTIAL','FAILED','CANCELLED')),
  check (jsonb_typeof(payload) = 'object'),
  check (event_fingerprint ~ '^[a-f0-9]{64}$'),
  check ((event_type = 'STARTED' and payload = '{}'::jsonb and source_observation_id is null)
    or (event_type = 'SOURCE_OBSERVED' and source_observation_id is not null and payload = jsonb_build_object('sourceObservationId', source_observation_id))
    or (event_type in ('COMPLETED','PARTIAL','FAILED','CANCELLED') and source_observation_id is null))
);

alter table public.intelligence_ingestion_events
  add constraint intelligence_ingestion_events_attempt_fk
  foreign key (ingestion_attempt_id)
  references public.intelligence_ingestion_attempts(ingestion_attempt_id)
  on delete restrict;

alter table public.intelligence_ingestion_events
  add constraint intelligence_ingestion_events_observation_fk
  foreign key (ingestion_attempt_id, source_observation_id)
  references public.intelligence_ingestion_source_observations(ingestion_attempt_id, source_observation_id)
  on delete restrict;

create unique index intelligence_ingestion_events_terminal_idx
  on public.intelligence_ingestion_events(ingestion_attempt_id)
  where event_type in ('COMPLETED','PARTIAL','FAILED','CANCELLED');
create index intelligence_ingestion_events_attempt_sequence_idx
  on public.intelligence_ingestion_events(ingestion_attempt_id, sequence);
create index intelligence_ingestion_events_observation_fk_idx
  on public.intelligence_ingestion_events(ingestion_attempt_id, source_observation_id);

alter table public.intelligence_ingestion_requests enable row level security;
alter table public.intelligence_ingestion_attempts enable row level security;
alter table public.intelligence_source_artifacts enable row level security;
alter table public.intelligence_source_envelopes enable row level security;
alter table public.intelligence_ingestion_source_observations enable row level security;
alter table public.intelligence_source_availability_claims enable row level security;
alter table public.intelligence_ingestion_events enable row level security;

revoke all on public.intelligence_ingestion_requests from anon, authenticated;
revoke all on public.intelligence_ingestion_attempts from anon, authenticated;
revoke all on public.intelligence_source_artifacts from anon, authenticated;
revoke all on public.intelligence_source_envelopes from anon, authenticated;
revoke all on public.intelligence_ingestion_source_observations from anon, authenticated;
revoke all on public.intelligence_source_availability_claims from anon, authenticated;
revoke all on public.intelligence_ingestion_events from anon, authenticated;

create trigger intelligence_ingestion_requests_immutable before update or delete on public.intelligence_ingestion_requests for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_ingestion_attempts_immutable before update or delete on public.intelligence_ingestion_attempts for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_source_artifacts_immutable before update or delete on public.intelligence_source_artifacts for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_source_envelopes_immutable before update or delete on public.intelligence_source_envelopes for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_ingestion_observations_immutable before update or delete on public.intelligence_ingestion_source_observations for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_availability_claims_immutable before update or delete on public.intelligence_source_availability_claims for each row execute function public.reject_intelligence_mutation();
create trigger intelligence_ingestion_events_immutable before update or delete on public.intelligence_ingestion_events for each row execute function public.reject_intelligence_mutation();
