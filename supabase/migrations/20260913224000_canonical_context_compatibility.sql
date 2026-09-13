alter table public.canonical_m4_analysis_snapshots
  add column canonical_context_id text;

alter table public.canonical_m5_eligibility_evaluations
  add column canonical_context_id text;

alter table public.canonical_m4_analysis_snapshots
  alter column canonical_context_id set not null,
  add constraint canonical_m4_context_id_nonempty
    check (length(trim(canonical_context_id)) > 0);

alter table public.canonical_m5_eligibility_evaluations
  alter column canonical_context_id set not null,
  add constraint canonical_m5_context_id_nonempty
    check (length(trim(canonical_context_id)) > 0);

create index canonical_m4_context_visible_idx
  on public.canonical_m4_analysis_snapshots
  (candidate_id, canonical_identifier, canonical_context_id, as_of, available_at);

create index canonical_m5_context_visible_idx
  on public.canonical_m5_eligibility_evaluations
  (candidate_id, canonical_identifier, canonical_context_id, as_of, available_at);
