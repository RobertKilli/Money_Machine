-- M1B.5: a PL/pgSQL trigger function receives the NEW record type of the
-- invoking table. Cross-table field references therefore require typed trigger
-- functions; one generic function cannot safely serve all three tables.
drop trigger ledger_entries_financial_account_consistency on public.ledger_entries;
drop trigger ledger_transactions_financial_account_consistency on public.ledger_transactions;
drop trigger audit_events_financial_account_consistency on public.audit_events;
drop function public.assert_financial_account_link_consistency();

create function public.assert_ledger_entry_financial_account_consistency()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  transaction_financial_account_id uuid;
  ledger_account_financial_account_id uuid;
begin
  select financial_account_id into transaction_financial_account_id
  from public.ledger_transactions
  where id = new.ledger_transaction_id;

  select financial_account_id into ledger_account_financial_account_id
  from public.ledger_accounts
  where id = new.ledger_account_id;

  if transaction_financial_account_id is distinct from ledger_account_financial_account_id then
    raise exception 'Ledger entry account must belong to its ledger transaction FinancialAccount';
  end if;
  return new;
end;
$$;

create function public.assert_ledger_transaction_financial_account_consistency()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  idempotency_financial_account_id uuid;
begin
  if new.idempotency_record_id is not null then
    select financial_account_id into idempotency_financial_account_id
    from public.idempotency_records
    where id = new.idempotency_record_id;

    if idempotency_financial_account_id is distinct from new.financial_account_id then
      raise exception 'Ledger transaction idempotency record must belong to the same FinancialAccount';
    end if;
  end if;
  return new;
end;
$$;

create function public.assert_audit_event_financial_account_consistency()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  command_financial_account_id uuid;
  transaction_financial_account_id uuid;
begin
  select financial_account_id into command_financial_account_id
  from public.idempotency_records
  where id = new.command_id;

  if command_financial_account_id is distinct from new.financial_account_id then
    raise exception 'Audit event command must belong to the same FinancialAccount';
  end if;

  if new.ledger_transaction_id is not null then
    select financial_account_id into transaction_financial_account_id
    from public.ledger_transactions
    where id = new.ledger_transaction_id;

    if transaction_financial_account_id is distinct from new.financial_account_id then
      raise exception 'Audit event ledger transaction must belong to the same FinancialAccount';
    end if;
  end if;
  return new;
end;
$$;

create trigger ledger_entries_financial_account_consistency
before insert on public.ledger_entries
for each row execute function public.assert_ledger_entry_financial_account_consistency();
create trigger ledger_transactions_financial_account_consistency
before insert on public.ledger_transactions
for each row execute function public.assert_ledger_transaction_financial_account_consistency();
create trigger audit_events_financial_account_consistency
before insert on public.audit_events
for each row execute function public.assert_audit_event_financial_account_consistency();
