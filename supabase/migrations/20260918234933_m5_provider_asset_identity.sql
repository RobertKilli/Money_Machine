alter table public.intelligence_source_artifacts add constraint intelligence_source_artifacts_identity_parent_key unique (source_artifact_id,provider_id,dataset_id,dataset_version);
alter table public.intelligence_source_envelopes add constraint intelligence_source_envelopes_identity_parent_key unique (source_envelope_id,source_artifact_id);

create table public.intelligence_provider_asset_identity_assertions (
  provider_asset_identity_assertion_id text primary key,
  contract_version text not null check (contract_version = 'm5-provider-asset-identity-assertion/v1'),
  provider_id text not null, dataset_id text not null, dataset_version text not null,
  provider_source_namespace text not null, provider_asset_id text not null,
  identity_type text not null check (identity_type = 'EVM_CONTRACT_ADDRESS'),
  identity_namespace text not null check (identity_namespace ~ '^eip155:[1-9][0-9]*$'),
  identity_value text not null check (identity_value ~ '^0x[0-9a-f]{40}$'),
  source_artifact_id text not null, source_envelope_id text not null,
  parser_version text not null, envelope_schema_version text not null,
  source_payload_fingerprint text not null check (source_payload_fingerprint ~ '^[a-f0-9]{64}$'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'), recorded_at timestamptz not null,
  check (recorded_at = date_trunc('milliseconds', recorded_at)),
  check (length(trim(provider_asset_identity_assertion_id)) > 0),
  check (length(trim(provider_id)) > 0), check (length(trim(dataset_id)) > 0), check (length(trim(dataset_version)) > 0),
  check (length(trim(provider_source_namespace)) > 0), check (length(trim(provider_asset_id)) > 0),
  check (length(trim(source_artifact_id)) > 0), check (length(trim(source_envelope_id)) > 0),
  check (length(trim(parser_version)) > 0), check (length(trim(envelope_schema_version)) > 0),
  unique (provider_asset_identity_assertion_id,provider_id,dataset_id,dataset_version,provider_source_namespace,provider_asset_id),
  unique (source_envelope_id,source_artifact_id,identity_type,identity_namespace,identity_value),
  foreign key (dataset_id,provider_id,dataset_version) references public.intelligence_datasets(dataset_id,provider_id,dataset_version) on delete restrict,
  foreign key (source_artifact_id,provider_id,dataset_id,dataset_version) references public.intelligence_source_artifacts(source_artifact_id,provider_id,dataset_id,dataset_version) on delete restrict,
  foreign key (source_envelope_id,source_artifact_id) references public.intelligence_source_envelopes(source_envelope_id,source_artifact_id) on delete restrict
);
create index intelligence_provider_asset_identity_assertions_scope_idx on public.intelligence_provider_asset_identity_assertions(provider_id,dataset_id,dataset_version,provider_source_namespace,provider_asset_id);
create index intelligence_provider_asset_identity_assertions_artifact_fk_idx on public.intelligence_provider_asset_identity_assertions(source_artifact_id,provider_id,dataset_id,dataset_version);
create index intelligence_provider_asset_identity_assertions_envelope_fk_idx on public.intelligence_provider_asset_identity_assertions(source_envelope_id,source_artifact_id);
alter table public.intelligence_provider_asset_identity_assertions enable row level security;
revoke all privileges on table public.intelligence_provider_asset_identity_assertions from anon, authenticated;
create trigger intelligence_provider_asset_identity_assertions_immutable before update or delete on public.intelligence_provider_asset_identity_assertions for each row execute function public.reject_intelligence_mutation();

do $$ begin
  if (select count(*) from public.intelligence_asset_mapping_revisions) > 0 then raise exception 'M5_PROVIDER_ASSET_IDENTITY_REQUIRES_EMPTY_MAPPING_TABLE'; end if;
end $$;
alter table public.intelligence_asset_mapping_revisions add column provider_asset_identity_assertion_id text not null;
alter table public.intelligence_asset_mapping_revisions add constraint intelligence_asset_mapping_identity_assertion_nonblank check (length(trim(provider_asset_identity_assertion_id)) > 0);
alter table public.intelligence_asset_mapping_revisions add constraint intelligence_asset_mapping_identity_assertion_fk foreign key (provider_asset_identity_assertion_id,provider_id,dataset_id,dataset_version,provider_asset_namespace,provider_asset_id) references public.intelligence_provider_asset_identity_assertions(provider_asset_identity_assertion_id,provider_id,dataset_id,dataset_version,provider_source_namespace,provider_asset_id) on delete restrict;
create index intelligence_asset_mapping_identity_assertion_idx on public.intelligence_asset_mapping_revisions(provider_asset_identity_assertion_id,provider_id,dataset_id,dataset_version);
