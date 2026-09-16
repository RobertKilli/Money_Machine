-- M1B.5: trigger functions execute against financial records. Pin their
-- resolution path so untrusted schemas cannot influence object lookup.
alter function public.create_default_ledger_accounts() set search_path = public, pg_temp;
alter function public.assert_ledger_transaction_balanced(uuid) set search_path = public, pg_temp;
alter function public.ledger_transaction_balance_constraint_trigger() set search_path = public, pg_temp;
alter function public.ledger_entry_balance_constraint_trigger() set search_path = public, pg_temp;
alter function public.prevent_financial_history_mutation() set search_path = public, pg_temp;
alter function public.assert_financial_account_link_consistency() set search_path = public, pg_temp;
