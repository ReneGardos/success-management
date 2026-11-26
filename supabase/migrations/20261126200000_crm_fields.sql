-- CRM: richer leads (pipeline value, follow-up, notes), customers linked to leads and locations.
alter table public.leads add column if not exists company text;
alter table public.leads add column if not exists value numeric;
alter table public.leads add column if not exists next_action_at date;
alter table public.leads add column if not exists notes text;
alter table public.leads add column if not exists source text not null default 'website';
alter table public.leads add column if not exists customer_id uuid references public.customers (id) on delete set null;
alter table public.leads add column if not exists position integer not null default 0;
create index if not exists leads_org_status_idx on public.leads (org_id, status, position);

alter table public.customers add column if not exists status text not null default 'active' check (status in ('active', 'paused', 'former'));
alter table public.customers add column if not exists monthly_value numeric;
alter table public.customers add column if not exists contact_name text;

alter table public.locations add column if not exists customer_id uuid references public.customers (id) on delete set null;
create index if not exists locations_customer_idx on public.locations (customer_id);
create index if not exists quotes_customer_idx on public.quotes (customer_id);

-- Leads/locations/quotes may only point at a customer in the same organization.
create or replace function public.check_customer_org()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.customer_id is not null and not exists (select 1 from public.customers where id = new.customer_id and org_id = new.org_id) then
    raise exception 'Cross-organization customer reference on %', tg_table_name;
  end if;
  return new;
end;
$$;
revoke execute on function public.check_customer_org() from public, anon, authenticated;
drop trigger if exists leads_customer_org on public.leads;
create trigger leads_customer_org before insert or update of customer_id on public.leads for each row execute function public.check_customer_org();
drop trigger if exists locations_customer_org on public.locations;
create trigger locations_customer_org before insert or update of customer_id on public.locations for each row execute function public.check_customer_org();
drop trigger if exists quotes_customer_org on public.quotes;
create trigger quotes_customer_org before insert or update of customer_id on public.quotes for each row execute function public.check_customer_org();

-- Backfill company on migrated leads ("Name (Company)").
update public.leads set company = substring(name from '\(([^)]+)\)$') where company is null and name ~ '\([^)]+\)$';
