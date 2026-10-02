create table public.sec_event_source_profiles (
  profile_id text primary key, fingerprint char(64) not null, contract_version text not null,
  provider_id text not null, dataset_id text not null, dataset_version text not null,
  endpoint_profile text not null, hostname_allowlist jsonb not null, path_template text not null, method text not null,
  supported_forms jsonb not null, authentication_kind text not null, accepted_content_encoding jsonb not null,
  request_identity_policy text not null, max_timeout_ms integer not null, max_response_bytes integer not null,
  max_package_documents integer not null,
  material jsonb not null, unique(profile_id,fingerprint), unique(provider_id,dataset_id,dataset_version),
  constraint sec_event_source_profiles_profile_id_canonical check(profile_id ~ '^[a-z][a-z0-9-]*/v[1-9][0-9]*$'),
  constraint sec_event_source_profiles_contract_version_canonical check(contract_version ~ '^[a-z][a-z0-9-]*/v[1-9][0-9]*$'),
  constraint sec_event_source_profiles_provider_id_canonical check(provider_id ~ '^[A-Z][A-Z0-9_]*$'),
  constraint sec_event_source_profiles_dataset_id_canonical check(dataset_id ~ '^[a-z][a-z0-9-]*$'),
  constraint sec_event_source_profiles_dataset_version_canonical check(dataset_version ~ '^[a-z][a-z0-9-]*/v[1-9][0-9]*$'),
  constraint sec_event_source_profiles_endpoint_profile_canonical check(endpoint_profile ~ '^[A-Z][A-Z0-9_]*$'),
  constraint sec_event_source_profiles_path_template_canonical check(path_template= btrim(path_template) and left(path_template,1)='/' and position('..' in path_template)=0),
  constraint sec_event_source_profiles_method_canonical check(method ~ '^[A-Z][A-Z0-9_-]*$'),
  constraint sec_event_source_profiles_request_identity_policy_canonical check(request_identity_policy ~ '^[a-z][a-z0-9-]*/v[1-9][0-9]*$')
);
create table public.sec_event_filing_identities (
  filing_identity_id text primary key, profile_id text not null, profile_fingerprint char(64) not null,
  cik text not null, accession_number text not null, form text not null check(form in ('8-K','8-K/A')),
  amendment_parent_filing_identity_id text, material jsonb not null,
  unique(profile_id,cik,accession_number,form), unique(filing_identity_id,profile_id,cik), unique(amendment_parent_filing_identity_id),
  unique(filing_identity_id,profile_id,profile_fingerprint),
  constraint sec_event_filing_identity_material_scope_key unique(filing_identity_id,profile_id,profile_fingerprint,cik,accession_number,form),
  check(amendment_parent_filing_identity_id is null or amendment_parent_filing_identity_id<>filing_identity_id),
  foreign key(profile_id,profile_fingerprint) references public.sec_event_source_profiles(profile_id,fingerprint),
  foreign key(amendment_parent_filing_identity_id,profile_id,cik) references public.sec_event_filing_identities(filing_identity_id,profile_id,cik)
);
create table public.sec_event_acquisition_requests (
  request_id text primary key, fingerprint char(64) not null, idempotency_key text not null,
  profile_id text not null, profile_fingerprint char(64) not null, filing_identity_id text not null,
  requested_at timestamptz not null, material jsonb not null, unique(request_id,fingerprint), unique(request_id,filing_identity_id), unique(profile_id,idempotency_key),
  foreign key(filing_identity_id,profile_id,profile_fingerprint) references public.sec_event_filing_identities(filing_identity_id,profile_id,profile_fingerprint)
);
create table public.sec_event_acquisition_attempts (
  attempt_id text primary key, fingerprint char(64) not null, request_id text not null,
  attempt_ordinal integer not null check(attempt_ordinal>=0), started_at timestamptz not null, material jsonb not null,
  unique(attempt_id,request_id), unique(request_id,attempt_ordinal),
  constraint sec_event_attempt_identity_fingerprint_key unique(attempt_id,fingerprint),
  foreign key(request_id) references public.sec_event_acquisition_requests(request_id)
);
create table public.sec_event_content_blobs (
  blob_id text primary key, sha256 char(64) not null constraint sec_event_content_blobs_sha256_canonical check(sha256 ~ '^[0-9a-f]{64}$'), byte_length integer not null constraint sec_event_content_blobs_byte_length_limit check(byte_length between 1 and 8388608),
  storage_contract_version text not null check(storage_contract_version='sec-event-document-byte-storage-decision/v1'),
  entity_body bytea not null, stored_at timestamptz not null default now(), readback_verified boolean not null,
  retention_classification text not null check(retention_classification='NOT_APPROVED'),
  deletion_legal_hold_status text not null check(deletion_legal_hold_status='NOT_APPROVED'), material jsonb not null,
  unique(sha256), unique(blob_id,sha256,byte_length), constraint sec_event_content_blobs_address_check check(blob_id='sha256:'||sha256||':'||byte_length), constraint sec_event_content_blobs_octet_length_check check(octet_length(entity_body)=byte_length)
);
create table public.sec_event_document_artifacts (
  artifact_id text primary key, fingerprint char(64) not null, filing_identity_id text not null,
  blob_id text not null, content_sha256 char(64) not null, byte_length integer not null,
  document_role text not null check(document_role in ('FILING_INDEX','PRIMARY_DOCUMENT','EXHIBIT')),
  document_type text not null, sequence_ordinal integer not null check(sequence_ordinal>=0), canonical_locator text not null,
  content_type text not null, canonicalization_version text not null, material jsonb not null, unique(artifact_id,fingerprint),
  unique(artifact_id,fingerprint,filing_identity_id,document_role,sequence_ordinal,canonical_locator),
  constraint sec_event_artifact_role_sequence_key unique(artifact_id,fingerprint,document_role,sequence_ordinal),
  unique(filing_identity_id,canonical_locator),
  foreign key(blob_id,content_sha256,byte_length) references public.sec_event_content_blobs(blob_id,sha256,byte_length),
  foreign key(filing_identity_id) references public.sec_event_filing_identities(filing_identity_id)
);
create table public.sec_event_filing_packages (
  package_id text primary key, fingerprint char(64) not null, filing_identity_id text not null,
  filing_date date not null, acceptance_at timestamptz, report_period date,
  filing_index_artifact_id text not null, filing_index_artifact_fingerprint char(64) not null,
  member_count integer not null check(member_count between 2 and 33), declared_document_count integer not null check(declared_document_count between 1 and 32), material jsonb not null,
  unique(package_id,fingerprint), unique(package_id,fingerprint,filing_identity_id),
  foreign key(filing_identity_id) references public.sec_event_filing_identities(filing_identity_id),
  foreign key(filing_index_artifact_id,filing_index_artifact_fingerprint) references public.sec_event_document_artifacts(artifact_id,fingerprint)
);
create table public.sec_event_package_document_members (
  package_id text not null, package_fingerprint char(64) not null, filing_identity_id text not null,
  member_ordinal integer not null check(member_ordinal>=0), artifact_id text not null, artifact_fingerprint char(64) not null,
  document_role text not null, document_type text not null, sequence_ordinal integer not null, canonical_locator text not null,
  is_primary boolean not null, material jsonb not null, primary key(package_id,package_fingerprint,member_ordinal),
  unique(package_id,package_fingerprint,artifact_id), unique(package_id,package_fingerprint,canonical_locator),
  unique(package_id,package_fingerprint,member_ordinal,artifact_id,artifact_fingerprint),
  foreign key(package_id,package_fingerprint,filing_identity_id) references public.sec_event_filing_packages(package_id,fingerprint,filing_identity_id),
  foreign key(artifact_id,artifact_fingerprint,filing_identity_id,document_role,sequence_ordinal,canonical_locator) references public.sec_event_document_artifacts(artifact_id,fingerprint,filing_identity_id,document_role,sequence_ordinal,canonical_locator)
);
create table public.sec_event_acquisition_receipts (
  receipt_id text primary key, fingerprint char(64) not null, request_id text not null, attempt_id text not null,
  filing_identity_id text not null, package_id text not null, package_fingerprint char(64) not null,
  retrieved_at timestamptz not null, effective_available_at timestamptz not null, response_status integer not null,
  content_encoding text not null check(content_encoding='identity'), response_material_fingerprint char(64) not null, material jsonb not null, unique(receipt_id,fingerprint),
  unique(receipt_id,package_id,package_fingerprint),
  foreign key(attempt_id,request_id) references public.sec_event_acquisition_attempts(attempt_id,request_id),
  foreign key(request_id,filing_identity_id) references public.sec_event_acquisition_requests(request_id,filing_identity_id),
  foreign key(package_id,package_fingerprint,filing_identity_id) references public.sec_event_filing_packages(package_id,fingerprint,filing_identity_id)
);
create table public.sec_event_source_lineages (
  lineage_id text primary key, fingerprint char(64) not null, profile_id text not null, profile_fingerprint char(64) not null,
  member_count integer not null check(member_count between 1 and 33), member_set_fingerprint char(64) not null,
  material jsonb not null, unique(lineage_id,fingerprint), unique(lineage_id,profile_id,profile_fingerprint),
  foreign key(profile_id,profile_fingerprint) references public.sec_event_source_profiles(profile_id,fingerprint)
);
create table public.sec_event_source_lineage_members (
  lineage_id text not null, member_ordinal integer not null check(member_ordinal>=0), package_id text not null,
  package_fingerprint char(64) not null, package_member_ordinal integer not null, artifact_id text not null,
  artifact_fingerprint char(64) not null, material jsonb not null, primary key(lineage_id,member_ordinal),
  unique(lineage_id,package_id,package_fingerprint,package_member_ordinal),
  foreign key(lineage_id) references public.sec_event_source_lineages(lineage_id),
  foreign key(package_id,package_fingerprint,package_member_ordinal,artifact_id,artifact_fingerprint)
    references public.sec_event_package_document_members(package_id,package_fingerprint,member_ordinal,artifact_id,artifact_fingerprint)
);

create index sec_event_filing_identities_profile_idx on public.sec_event_filing_identities(profile_id,profile_fingerprint);
create index sec_event_filing_identities_amendment_idx on public.sec_event_filing_identities(amendment_parent_filing_identity_id,profile_id,cik);
create index sec_event_acquisition_requests_filing_idx on public.sec_event_acquisition_requests(filing_identity_id,profile_id,profile_fingerprint);
create index sec_event_document_artifacts_filing_idx on public.sec_event_document_artifacts(filing_identity_id,document_role,sequence_ordinal);
create index sec_event_document_artifacts_blob_idx on public.sec_event_document_artifacts(blob_id,content_sha256,byte_length);
create index sec_event_filing_packages_filing_idx on public.sec_event_filing_packages(filing_identity_id);
create index sec_event_filing_packages_index_idx on public.sec_event_filing_packages(filing_index_artifact_id,filing_index_artifact_fingerprint);
create index sec_event_package_members_parent_idx on public.sec_event_package_document_members(package_id,package_fingerprint,filing_identity_id);
create index sec_event_package_members_artifact_idx on public.sec_event_package_document_members(artifact_id,artifact_fingerprint,filing_identity_id,document_role,sequence_ordinal,canonical_locator);
create index sec_event_receipts_attempt_idx on public.sec_event_acquisition_receipts(attempt_id,request_id);
create index sec_event_receipts_request_idx on public.sec_event_acquisition_receipts(request_id,filing_identity_id);
create index sec_event_receipts_package_idx on public.sec_event_acquisition_receipts(package_id,package_fingerprint,filing_identity_id);
create index sec_event_lineages_profile_idx on public.sec_event_source_lineages(profile_id,profile_fingerprint);
create index sec_event_lineage_members_package_idx on public.sec_event_source_lineage_members(package_id,package_fingerprint,package_member_ordinal,artifact_id,artifact_fingerprint);

create function public.sec_event_reject_mutation() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$ begin raise exception 'SEC_EVENT_IMMUTABLE_AUTHORITY' using errcode='55000'; end $$;
create function public.sec_event_assert_package_seal() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare pid text; fp char(64); expected integer; actual integer; bad boolean;
begin pid:=coalesce(to_jsonb(new)->>'package_id',to_jsonb(old)->>'package_id'); fp:=coalesce(to_jsonb(new)->>'fingerprint',to_jsonb(new)->>'package_fingerprint',to_jsonb(old)->>'fingerprint',to_jsonb(old)->>'package_fingerprint'); select member_count into expected from public.sec_event_filing_packages where package_id=pid and fingerprint=fp; if not found then return null; end if;
select count(*),coalesce(bool_or(member_ordinal<>ord),false) into actual,bad from (select member_ordinal,row_number() over(order by member_ordinal)-1 ord from public.sec_event_package_document_members where package_id=pid and package_fingerprint=fp) x;
if actual<>expected or bad or exists(select 1 from public.sec_event_package_document_members pm join public.sec_event_document_artifacts a using(artifact_id) where pm.package_id=pid and pm.package_fingerprint=fp and pm.document_type<>a.document_type) or (select count(*) from public.sec_event_package_document_members where package_id=pid and package_fingerprint=fp and document_role='FILING_INDEX')<>1 or (select count(*) from public.sec_event_package_document_members where package_id=pid and package_fingerprint=fp and document_role='PRIMARY_DOCUMENT')<>1 or (select count(*) from public.sec_event_package_document_members where package_id=pid and package_fingerprint=fp and is_primary<>(document_role='PRIMARY_DOCUMENT'))<>0 or (select count(*) from public.sec_event_package_document_members pm join public.sec_event_filing_packages p using(package_id) join public.sec_event_document_artifacts a on a.artifact_id=pm.artifact_id where p.package_id=pid and p.fingerprint=fp and pm.document_role='FILING_INDEX' and pm.artifact_id=p.filing_index_artifact_id and pm.artifact_fingerprint=p.filing_index_artifact_fingerprint and a.filing_identity_id=p.filing_identity_id)<>1 or (select count(*) from public.sec_event_package_document_members where package_id=pid and package_fingerprint=fp and document_role<>'FILING_INDEX')<>(select declared_document_count from public.sec_event_filing_packages where package_id=pid and fingerprint=fp) or (select coalesce(sum(b.byte_length),0) from public.sec_event_package_document_members pm join public.sec_event_document_artifacts a using(artifact_id) join public.sec_event_content_blobs b using(blob_id) where pm.package_id=pid and pm.package_fingerprint=fp)>67108864 or (select count(*) from public.sec_event_package_document_members where package_id=pid and package_fingerprint=fp and document_role<>'FILING_INDEX')>32 then raise exception 'SEC_EVENT_PACKAGE_UNSEALED' using errcode='23514'; end if; return null; end $$;
create function public.sec_event_assert_lineage_seal() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare lid text; expected integer; actual integer; bad boolean; expected_profile_id text; expected_profile_fingerprint char(64); context jsonb; chain jsonb; root_id text;
begin lid:=coalesce(new.lineage_id,old.lineage_id); select member_count,sec_event_source_lineages.profile_id,sec_event_source_lineages.profile_fingerprint,material into expected,expected_profile_id,expected_profile_fingerprint,context from public.sec_event_source_lineages where lineage_id=lid; if not found then return null; end if;
select count(*),coalesce(bool_or(member_ordinal<>ord),false) into actual,bad from (select member_ordinal,row_number() over(order by member_ordinal)-1 ord from public.sec_event_source_lineage_members where lineage_id=lid) x;
if actual<>expected or bad or exists(select 1 from public.sec_event_source_lineage_members lm join public.sec_event_filing_packages p on p.package_id=lm.package_id and p.fingerprint=lm.package_fingerprint join public.sec_event_filing_identities fi on fi.filing_identity_id=p.filing_identity_id where lm.lineage_id=lid and (fi.profile_id<>expected_profile_id or fi.profile_fingerprint<>expected_profile_fingerprint)) then raise exception 'SEC_EVENT_LINEAGE_UNSEALED' using errcode='23514'; end if;
chain:=context->'amendmentParentChain'; root_id:=context->>'rootFilingIdentityId';
if jsonb_typeof(chain) is distinct from 'array' then raise exception 'SEC_EVENT_LINEAGE_CONTEXT_INVALID' using errcode='23514'; end if;
if jsonb_array_length(chain)=0 or root_id is null or chain->>0<>root_id
  or exists(select 1 from jsonb_array_elements(chain) x where jsonb_typeof(x)<>'string')
  or (select count(distinct x) from jsonb_array_elements_text(chain) x)<>jsonb_array_length(chain)
  or exists(select 1 from jsonb_array_elements_text(chain) with ordinality x(id,ord)
    left join public.sec_event_filing_identities f on f.filing_identity_id=x.id
    left join public.sec_event_filing_identities root on root.filing_identity_id=root_id
    where f.filing_identity_id is null or root.filing_identity_id is null
      or f.profile_id<>expected_profile_id or f.profile_fingerprint<>expected_profile_fingerprint or f.cik<>root.cik
      or (x.ord=1 and (f.form<>'8-K' or f.amendment_parent_filing_identity_id is not null))
      or (x.ord>1 and (f.form<>'8-K/A' or f.amendment_parent_filing_identity_id is distinct from chain->>(x.ord::integer-2))))
  or exists(select 1 from public.sec_event_source_lineage_members lm join public.sec_event_filing_packages p on p.package_id=lm.package_id where lm.lineage_id=lid and not(chain ? p.filing_identity_id))
then raise exception 'SEC_EVENT_LINEAGE_CONTEXT_INVALID' using errcode='23514'; end if;
return null; end $$;
create function public.sec_event_assert_amendment_parent() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare cyclic boolean; chronology_invalid boolean; filing public.sec_event_filing_identities%rowtype; root_id text;
begin
  select * into strict filing from public.sec_event_filing_identities where filing_identity_id=new.filing_identity_id;
  if filing.form='8-K' and filing.amendment_parent_filing_identity_id is not null then raise exception 'SEC_EVENT_AMENDMENT_PARENT_INVALID' using errcode='23514'; end if;
  if filing.form='8-K/A' and filing.amendment_parent_filing_identity_id is null then raise exception 'SEC_EVENT_AMENDMENT_PARENT_INVALID' using errcode='23514'; end if;
  if filing.amendment_parent_filing_identity_id is not null then
    with recursive ancestry(filing_identity_id,parent_id,path,cycle_found) as (
      select f.filing_identity_id,f.amendment_parent_filing_identity_id,array[f.filing_identity_id],false from public.sec_event_filing_identities f where f.filing_identity_id=filing.amendment_parent_filing_identity_id
      union all
      select f.filing_identity_id,f.amendment_parent_filing_identity_id,a.path||f.filing_identity_id,f.filing_identity_id=any(a.path) from public.sec_event_filing_identities f join ancestry a on f.filing_identity_id=a.parent_id where not a.cycle_found
    ) select coalesce(bool_or(filing_identity_id=filing.filing_identity_id or cycle_found),false) into cyclic from ancestry;
    if cyclic then raise exception 'SEC_EVENT_AMENDMENT_CYCLE' using errcode='23514'; end if;

  end if;
  -- Serialize package chronology across the same amendment tree. The root
  -- authority is immutable, but its row lock orders concurrent validations.
  with recursive ancestry as (
    select filing_identity_id,amendment_parent_filing_identity_id from public.sec_event_filing_identities where filing_identity_id=filing.filing_identity_id
    union all
    select f.filing_identity_id,f.amendment_parent_filing_identity_id from public.sec_event_filing_identities f join ancestry a on f.filing_identity_id=a.amendment_parent_filing_identity_id
  ) select filing_identity_id into root_id from ancestry where amendment_parent_filing_identity_id is null;
  perform 1 from public.sec_event_filing_identities where filing_identity_id=root_id for no key update;
  select exists(select 1 from public.sec_event_filing_identities child
    join public.sec_event_filing_packages parent_package on parent_package.filing_identity_id=child.amendment_parent_filing_identity_id
    join public.sec_event_filing_packages child_package on child_package.filing_identity_id=child.filing_identity_id
    where (child.filing_identity_id=filing.filing_identity_id or child.amendment_parent_filing_identity_id=filing.filing_identity_id)
      and (parent_package.filing_date>child_package.filing_date or (parent_package.acceptance_at is not null and child_package.acceptance_at is not null and parent_package.acceptance_at>=child_package.acceptance_at))) into chronology_invalid;
  if chronology_invalid then raise exception 'SEC_EVENT_AMENDMENT_CHRONOLOGY_INVALID' using errcode='23514'; end if;
  return null;
end $$;

create function public.sec_event_assert_acquisition_chronology() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare rid text;
begin
  rid:=coalesce(to_jsonb(new)->>'request_id',to_jsonb(old)->>'request_id');
  if exists(select 1 from public.sec_event_acquisition_requests r join public.sec_event_acquisition_attempts a using(request_id) where r.request_id=rid and a.started_at<r.requested_at) then
    raise exception 'SEC_EVENT_ACQUISITION_CHRONOLOGY_INVALID' using errcode='23514';
  end if;
  if exists(select 1 from public.sec_event_acquisition_receipts receipt join public.sec_event_acquisition_attempts attempt using(attempt_id,request_id) join public.sec_event_acquisition_requests request using(request_id) where receipt.request_id=rid and (receipt.retrieved_at<attempt.started_at or receipt.retrieved_at<request.requested_at)) then
    raise exception 'SEC_EVENT_ACQUISITION_CHRONOLOGY_INVALID' using errcode='23514';
  end if;
  return null;
end $$;

create constraint trigger sec_event_filing_identity_amendment_deferred after insert or update on public.sec_event_filing_identities deferrable initially deferred for each row execute function public.sec_event_assert_amendment_parent();
create constraint trigger sec_event_package_amendment_deferred after insert on public.sec_event_filing_packages deferrable initially deferred for each row execute function public.sec_event_assert_amendment_parent();
create constraint trigger sec_event_filing_package_seal_deferred after insert or update on public.sec_event_filing_packages deferrable initially deferred for each row execute function public.sec_event_assert_package_seal();
create constraint trigger sec_event_package_document_member_seal_deferred after insert or update or delete on public.sec_event_package_document_members deferrable initially deferred for each row execute function public.sec_event_assert_package_seal();
create constraint trigger sec_event_source_lineage_seal_deferred after insert or update on public.sec_event_source_lineages deferrable initially deferred for each row execute function public.sec_event_assert_lineage_seal();
create constraint trigger sec_event_source_lineage_member_seal_deferred after insert or update or delete on public.sec_event_source_lineage_members deferrable initially deferred for each row execute function public.sec_event_assert_lineage_seal();
create constraint trigger sec_event_request_chronology_deferred after insert on public.sec_event_acquisition_requests deferrable initially deferred for each row execute function public.sec_event_assert_acquisition_chronology();
create constraint trigger sec_event_attempt_chronology_deferred after insert on public.sec_event_acquisition_attempts deferrable initially deferred for each row execute function public.sec_event_assert_acquisition_chronology();
create constraint trigger sec_event_receipt_chronology_deferred after insert on public.sec_event_acquisition_receipts deferrable initially deferred for each row execute function public.sec_event_assert_acquisition_chronology();

do $$ declare t text; begin foreach t in array array['sec_event_source_profiles','sec_event_filing_identities','sec_event_acquisition_requests','sec_event_acquisition_attempts','sec_event_content_blobs','sec_event_document_artifacts','sec_event_filing_packages','sec_event_package_document_members','sec_event_acquisition_receipts','sec_event_source_lineages','sec_event_source_lineage_members'] loop
execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public, anon, authenticated, service_role',t); execute format('create trigger %I before update or delete on public.%I for each row execute function public.sec_event_reject_mutation()',t||'_immutable',t);
end loop; end $$;
revoke execute on function public.sec_event_reject_mutation() from public,anon,authenticated,service_role;
revoke execute on function public.sec_event_assert_package_seal() from public,anon,authenticated,service_role;
revoke execute on function public.sec_event_assert_lineage_seal() from public,anon,authenticated,service_role;
revoke execute on function public.sec_event_assert_amendment_parent() from public,anon,authenticated,service_role;
revoke execute on function public.sec_event_assert_acquisition_chronology() from public,anon,authenticated,service_role;
