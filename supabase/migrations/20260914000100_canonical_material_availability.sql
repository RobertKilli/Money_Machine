-- Canonical availability is the latest material evidence availability, never
-- a processing timestamp. Keep the original migration immutable and correct
-- its temporal direction forward-only.
alter table public.canonical_m4_analysis_snapshots
  drop constraint if exists canonical_m4_analysis_snapshots_check;
alter table public.canonical_m4_analysis_snapshots
  drop constraint if exists canonical_m4_analysis_snapshots_available_at_as_of_check;
alter table public.canonical_m5_eligibility_evaluations
  drop constraint if exists canonical_m5_eligibility_evaluations_check;
alter table public.canonical_m5_eligibility_evaluations
  drop constraint if exists canonical_m5_eligibility_evaluations_available_at_as_of_check;

alter table public.canonical_m4_analysis_snapshots
  add constraint canonical_m4_available_at_not_after_as_of
  check (available_at <= as_of) not valid;
alter table public.canonical_m5_eligibility_evaluations
  add constraint canonical_m5_available_at_not_after_as_of
  check (available_at <= as_of) not valid;

-- Existing immutable rows are not rewritten or assigned fabricated assembly
-- lineage. NOT VALID still enforces the constraint for every future write.
alter table public.canonical_m5_eligibility_evaluations
  add column if not exists assembly_fingerprint text;
alter table public.canonical_m5_eligibility_evaluations
  add constraint canonical_m5_assembly_fingerprint_required
  check (assembly_fingerprint is not null and length(trim(assembly_fingerprint)) > 0) not valid;
