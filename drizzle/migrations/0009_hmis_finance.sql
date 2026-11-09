-- General ledger: legal entities, periods, chart of accounts, posting map,
-- journals and bank reconciliation, plus the vendor register.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  entity_name text not null,
  registration_number text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, registration_number)
);
create index legal_entities_tenant_id_idx on public.legal_entities (tenant_id);

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.legal_entities(id) on delete cascade not null,
  period_name text not null,
  start_date date not null,
  end_date date,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legal_entity_id, period_name),
  check (end_date is null or end_date >= start_date)
);
create index accounting_periods_legal_entity_id_idx on public.accounting_periods (legal_entity_id);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  legal_entity_id uuid references public.legal_entities(id) on delete cascade not null,
  account_code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id uuid references public.accounts(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legal_entity_id, account_code),
  check (parent_id is null or parent_id <> id)
);
create index accounts_tenant_id_idx on public.accounts (tenant_id);
create index accounts_legal_entity_id_idx on public.accounts (legal_entity_id);
create index accounts_parent_id_idx on public.accounts (parent_id);

-- One active account binding per posting role per legal entity.
create table public.posting_role_accounts (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.legal_entities(id) on delete cascade not null,
  posting_role text not null,
  account_id uuid references public.accounts(id) on delete restrict not null,
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legal_entity_id, posting_role, effective_from),
  check (effective_to is null or effective_to > effective_from)
);
create index posting_role_accounts_legal_entity_id_idx on public.posting_role_accounts (legal_entity_id);
create index posting_role_accounts_account_id_idx on public.posting_role_accounts (account_id);

-- Exactly-once posting: unique (posting_event, source_type, source_id).
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  legal_entity_id uuid references public.legal_entities(id) on delete restrict not null,
  accounting_period_id uuid references public.accounting_periods(id) on delete restrict not null,
  journal_number text not null,
  posting_date date not null,
  posting_event text not null,
  idempotency_key text not null unique,
  source_type text not null,
  source_id uuid,
  reversal_of_id uuid references public.journal_entries(id) on delete restrict,
  posted_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (posting_event, source_type, source_id),
  check (reversal_of_id is null or reversal_of_id <> id)
);
create index journal_entries_tenant_id_idx on public.journal_entries (tenant_id);
create index journal_entries_legal_entity_id_idx on public.journal_entries (legal_entity_id);
create index journal_entries_accounting_period_id_idx on public.journal_entries (accounting_period_id);
create index journal_entries_reversal_of_id_idx on public.journal_entries (reversal_of_id);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid references public.journal_entries(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete restrict not null,
  debit_amount numeric(19,4) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(19,4) not null default 0 check (credit_amount >= 0),
  cost_center_id uuid references public.cost_centers(id) on delete restrict not null,
  created_at timestamptz not null default now(),
  check (not (debit_amount > 0 and credit_amount > 0))
);
create index journal_lines_journal_entry_id_idx on public.journal_lines (journal_entry_id);
create index journal_lines_account_id_idx on public.journal_lines (account_id);
create index journal_lines_cost_center_id_idx on public.journal_lines (cost_center_id);

create table public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  bank_account_id uuid references public.bank_accounts(id) on delete restrict not null,
  statement_date date not null,
  opening_balance numeric(19,4) not null,
  closing_balance numeric(19,4) not null,
  status text not null default 'draft' check (status in ('draft', 'reconciled')),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_account_id, statement_date)
);
create index bank_reconciliations_tenant_id_idx on public.bank_reconciliations (tenant_id);
create index bank_reconciliations_bank_account_id_idx on public.bank_reconciliations (bank_account_id);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  vendor_code text not null,
  name text not null,
  tax_identifier text,
  payment_terms text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, vendor_code)
);
create index vendors_tenant_id_idx on public.vendors (tenant_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'legal_entities',
  'accounting_periods',
  'accounts',
  'posting_role_accounts',
  'journal_entries',
  'journal_lines',
  'bank_reconciliations',
  'vendors'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read legal_entities"
  on public.legal_entities for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage legal_entities"
  on public.legal_entities for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read accounting_periods"
  on public.accounting_periods for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)));

create policy "Tenant admins manage accounting_periods"
  on public.accounting_periods for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)));

create policy "Tenant members can read accounts"
  on public.accounts for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage accounts"
  on public.accounts for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read posting_role_accounts"
  on public.posting_role_accounts for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)));

create policy "Tenant admins manage posting_role_accounts"
  on public.posting_role_accounts for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)));

create policy "Tenant members can read journal_entries"
  on public.journal_entries for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage journal_entries"
  on public.journal_entries for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read journal_lines"
  on public.journal_lines for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select j.tenant_id from public.journal_entries j where j.id = journal_entry_id)));

create policy "Tenant admins manage journal_lines"
  on public.journal_lines for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select j.tenant_id from public.journal_entries j where j.id = journal_entry_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select j.tenant_id from public.journal_entries j where j.id = journal_entry_id)));

create policy "Tenant members can read bank_reconciliations"
  on public.bank_reconciliations for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage bank_reconciliations"
  on public.bank_reconciliations for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read vendors"
  on public.vendors for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage vendors"
  on public.vendors for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

do $$
declare
  t text;
begin
  foreach t in array array[
    'legal_entities',
    'accounting_periods',
    'accounts',
    'posting_role_accounts',
    'journal_entries',
    'bank_reconciliations',
    'vendors'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;
