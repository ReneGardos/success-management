-- Invoicing: per-organization sequential numbers, lines, payment details, public link.
alter table public.organizations add column if not exists next_invoice_number integer not null default 1;
alter table public.organizations add column if not exists invoice_prefix text;
alter table public.organizations add column if not exists payment_terms_days integer not null default 8;
alter table public.organizations add column if not exists bank_reg text;
alter table public.organizations add column if not exists bank_account text;
alter table public.organizations add column if not exists iban text;
alter table public.organizations add column if not exists mobilepay text;
alter table public.organizations add column if not exists invoice_footer text;

create type public.invoice_status as enum ('draft', 'sent', 'paid', 'credited', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_number integer,
  customer_id uuid references public.customers (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  credit_of uuid references public.invoices (id) on delete set null,
  status public.invoice_status not null default 'draft',
  title text,
  recipient_name text,
  recipient_company text,
  recipient_email text,
  recipient_address text,
  recipient_cvr text,
  recipient_ean text,
  reference text,
  issue_date date not null default current_date,
  delivery_date date,
  due_date date,
  vat_rate numeric not null default 25,
  subtotal numeric not null default 0,
  vat_amount numeric not null default 0,
  total numeric not null default 0,
  notes text,
  public_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  sent_at timestamptz,
  viewed_at timestamptz,
  paid_at timestamptz,
  paid_amount numeric,
  reminder_sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, invoice_number)
);
create index invoices_org_idx on public.invoices (org_id, issue_date desc);
create index invoices_org_status_idx on public.invoices (org_id, status, due_date);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit text not null default 'stk',
  unit_price numeric not null default 0,
  position integer not null default 0
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);

-- Number is given when the invoice is first sent (drafts have none), so numbers have no gaps.
create or replace function public.assign_invoice_number(p_invoice uuid)
returns integer language plpgsql security definer set search_path to '' as $$
declare v_org uuid; v_num integer;
begin
  select org_id, invoice_number into v_org, v_num from public.invoices where id = p_invoice for update;
  if v_num is not null then return v_num; end if;
  update public.organizations set next_invoice_number = next_invoice_number + 1 where id = v_org returning next_invoice_number - 1 into v_num;
  update public.invoices set invoice_number = v_num where id = p_invoice;
  return v_num;
end;
$$;
revoke execute on function public.assign_invoice_number(uuid) from public, anon, authenticated;

create or replace function public.check_invoice_refs()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_table_name = 'invoice_lines' then
    if not exists (select 1 from public.invoices where id = new.invoice_id and org_id = new.org_id) then
      raise exception 'Cross-organization invoice line';
    end if;
    return new;
  end if;
  if new.customer_id is not null and not exists (select 1 from public.customers where id = new.customer_id and org_id = new.org_id) then
    raise exception 'Cross-organization customer on invoice';
  end if;
  if new.quote_id is not null and not exists (select 1 from public.quotes where id = new.quote_id and org_id = new.org_id) then
    raise exception 'Cross-organization quote on invoice';
  end if;
  if new.credit_of is not null and not exists (select 1 from public.invoices where id = new.credit_of and org_id = new.org_id) then
    raise exception 'Cross-organization credit note';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_invoice_refs() from public, anon, authenticated;
create trigger invoices_refs before insert or update on public.invoices for each row execute function public.check_invoice_refs();
create trigger invoice_lines_refs before insert or update on public.invoice_lines for each row execute function public.check_invoice_refs();

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
create policy invoices_org_admin on public.invoices for all to authenticated using ((select public.is_org_admin(org_id))) with check ((select public.is_org_admin(org_id)));
create policy invoice_lines_org_admin on public.invoice_lines for all to authenticated using ((select public.is_org_admin(org_id))) with check ((select public.is_org_admin(org_id)));

