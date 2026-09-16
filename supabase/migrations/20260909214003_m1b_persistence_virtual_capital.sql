-- M1B persistence and provisioning. This is local schema source only; it
-- never creates or changes a hosted Supabase project.

alter table public.financial_accounts
  add column is_default_simulation boolean not null default false;

-- M1B provisions one default simulation account per user. The partial index
-- preserves room for future non-default accounts without weakening this rule.
create unique index financial_accounts_one_default_simulation_per_owner_idx
  on public.financial_accounts (owner_id)
  where mode = 'SIMULATION' and is_default_simulation;

comment on column public.financial_accounts.is_default_simulation is
  'True only for the user''s idempotently provisioned default simulation account.';

-- Foreign keys alone cannot express that linked financial records belong to
-- the same FinancialAccount. Keep that invariant at the database boundary as
-- well as in the domain command.
create function public.assert_financial_account_link_consistency()
returns trigger
language plpgsql
as $$
declare
  linked_financial_account_id uuid;
begin
  if tg_table_name = 'ledger_entries' then
    select lt.financial_account_id into linked_financial_account_id
    from public.ledger_transactions lt
    where lt.id = new.ledger_transaction_id;

    if linked_financial_account_id is distinct from (
      select la.financial_account_id from public.ledger_accounts la where la.id = new.ledger_account_id
    ) then
      raise exception 'Ledger entry account must belong to its ledger transaction FinancialAccount';
    end if;
  elsif tg_table_name = 'ledger_transactions' and new.idempotency_record_id is not null then
    select ir.financial_account_id into linked_financial_account_id
    from public.idempotency_records ir
    where ir.id = new.idempotency_record_id;

    if linked_financial_account_id is distinct from new.financial_account_id then
      raise exception 'Ledger transaction idempotency record must belong to the same FinancialAccount';
    end if;
  elsif tg_table_name = 'audit_events' then
    select ir.financial_account_id into linked_financial_account_id
    from public.idempotency_records ir
    where ir.id = new.command_id;

    if linked_financial_account_id is distinct from new.financial_account_id then
      raise exception 'Audit event command must belong to the same FinancialAccount';
    end if;

    if new.ledger_transaction_id is not null and new.financial_account_id is distinct from (
      select lt.financial_account_id from public.ledger_transactions lt where lt.id = new.ledger_transaction_id
    ) then
      raise exception 'Audit event ledger transaction must belong to the same FinancialAccount';
    end if;
  end if;
  return new;
end;
$$;

create trigger ledger_entries_financial_account_consistency
before insert on public.ledger_entries
for each row execute function public.assert_financial_account_link_consistency();
create trigger ledger_transactions_financial_account_consistency
before insert on public.ledger_transactions
for each row execute function public.assert_financial_account_link_consistency();
create trigger audit_events_financial_account_consistency
before insert on public.audit_events
for each row execute function public.assert_financial_account_link_consistency();

-- The command adapter uses a direct, server-only PostgreSQL transaction. RLS
-- remains enabled for browser/Data API reads, and its owner predicates remain
-- the isolation layer for those reads. There are intentionally still no
-- browser-facing financial write policies.
