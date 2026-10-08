-- Permit authenticated users to run the owner-scoped, read-only paper status
-- projection. These grants do not bypass or change the existing owner RLS
-- policies on financial_accounts, ledger, or standing-paper tables.
grant usage on schema public to authenticated;
grant select on table
  public.financial_accounts,
  public.ledger_accounts,
  public.ledger_transactions,
  public.ledger_entries,
  public.standing_paper_policies,
  public.standing_paper_runs,
  public.standing_paper_decisions,
  public.standing_paper_fills
to authenticated;
