-- M3 registry/evidence tables are server-only. RLS remains enabled as
-- defense-in-depth; this migration changes only direct table privileges.
-- PUBLIC had no explicit privileges in the pre-implementation catalog audit,
-- so no PUBLIC revoke or default-privilege change is included.
revoke all privileges on table
  public.intelligence_providers,
  public.intelligence_datasets,
  public.intelligence_record_mappings,
  public.news_event_revisions,
  public.market_observations,
  public.macro_observations
from anon, authenticated;
