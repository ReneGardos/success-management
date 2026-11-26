-- Success Management: multi-tenant core schema.
-- Every business table carries org_id. The app talks to the database server-side with the
-- service role and always filters on org_id; RLS below is defence in depth for any direct
-- client access. All helpers are SECURITY DEFINER with an empty search_path, so policies never
-- query a table that is itself protected by the same policy (no recursion).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- enums
create type public.org_role as enum ('owner', 'admin', 'employee', 'customer');
create type public.job_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');
create type public.lead_status as enum ('new', 'contacted', 'qualified', 'quoted', 'won', 'lost');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired');

-- ---------------------------------------------------------------- organizations (tenants)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null,
  legal_name text,
  cvr text,
  address text,
  phone text,
  office_email text,              -- where notifications go (new lead, customer reply)
  website text,                   -- public website, e.g. successcleaningaps.dk
  domain text,                    -- custom domain for the portal later
  logo_url text,
  email_logo_url text,
  color_primary text not null default '#102D46',
  color_accent text not null default '#C6A467',
  color_background text not null default '#F7F5F0',
  color_muted text not null default '#718879',
  font_family text not null default 'Manrope',
  -- mail
  mail_from_name text,            -- "Success Cleaning"
  mail_from_local text not null default 'kontakt',
  mail_domain text,               -- verified sending domain in Resend
  mail_domain_verified boolean not null default false,
  resend_domain_id text,
  inbound_alias text unique,      -- replies: <alias>+<thread>@RESEND_INBOUND_DOMAIN
  -- quotes
  next_quote_number integer not null default 1001,
  quote_default_intro text,
  quote_default_terms text,
  -- billing (prepared for selling the platform)
  plan text not null default 'internal' check (plan in ('internal', 'trial', 'starter', 'pro', 'enterprise')),
  subscription_status text not null default 'active' check (subscription_status in ('active', 'trialing', 'past_due', 'canceled', 'paused')),
  trial_ends_at timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  seats_limit integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- people
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Personal details shared across all organizations the person belongs to.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  job_title text,
  last_org_id uuid references public.organizations (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'customer',
  job_title text,                 -- title used in this organization's signature
  work_email text,                -- address shown in this organization's signature
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------- website sources
create table public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  domain text not null,
  public_id text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  allowed_origins text[] not null default '{}',
  platform text not null default 'custom' check (platform in ('custom', 'nextjs', 'wix', 'wordpress', 'other')),
  created_at timestamptz not null default now()
);
create index sites_org_idx on public.sites (org_id);

create table public.org_api_keys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid references public.sites (id) on delete set null,
  name text not null,
  key_prefix text not null,
  key_hash text not null unique,  -- sha256 hex of the full key; the key itself is never stored
  created_by uuid references auth.users (id) on delete set null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index org_api_keys_org_idx on public.org_api_keys (org_id);

-- ---------------------------------------------------------------- CRM
create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid references public.sites (id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  company text,
  service text,
  message text not null,
  source text not null default 'website',
  status text not null default 'new',
  created_at timestamptz not null default now()
);
create index contact_requests_org_idx on public.contact_requests (org_id, created_at desc);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  price_from numeric,
  featured boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  postal_codes text[],
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.site_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  slug text not null,
  title text not null,
  excerpt text,
  content jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  name text,
  company text,
  email text,
  phone text,
  address text,
  cvr text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_org_idx on public.customers (org_id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_request_id uuid references public.contact_requests (id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  message text,
  service_id uuid references public.services (id) on delete set null,
  status public.lead_status not null default 'new',
  owner_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_org_idx on public.leads (org_id, created_at desc);

-- ---------------------------------------------------------------- operations
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  address text not null,
  lat double precision,
  lng double precision,
  radius_m integer not null default 200,
  contact_name text,
  contact_phone text,
  access_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index locations_org_idx on public.locations (org_id);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  quote_number integer,
  customer_id uuid references public.customers (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  contact_request_id uuid references public.contact_requests (id) on delete set null,
  status public.quote_status not null default 'draft',
  title text,
  recipient_name text,
  recipient_company text,
  recipient_email text,
  recipient_phone text,
  recipient_address text,
  recipient_cvr text,
  intro text,
  terms text,
  notes text,
  billing text not null default 'monthly' check (billing in ('monthly', 'one_time')),
  vat_rate numeric not null default 25,
  total numeric,
  valid_until date,
  public_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  accepted_name text,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, quote_number)
);
create index quotes_org_idx on public.quotes (org_id, created_at desc);

create table public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit text not null default 'stk',
  unit_price numeric not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index quote_line_items_quote_idx on public.quote_line_items (quote_id, position);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  quote_id uuid references public.quotes (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  title text,
  customer_name text,
  address text,
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  notes text,
  employee_note text,
  status public.job_status not null default 'scheduled',
  is_open boolean not null default false,
  max_staff integer not null default 1,
  series_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_org_start_idx on public.jobs (org_id, scheduled_start);
create index jobs_open_idx on public.jobs (org_id, is_open) where is_open;

create table public.job_assignments (
  job_id uuid not null references public.jobs (id) on delete cascade,
  employee_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, employee_id)
);
create index job_assignments_employee_idx on public.job_assignments (employee_id);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  employee_id uuid not null references public.profiles (id) on delete cascade,
  check_in_at timestamptz not null default now(),
  check_in_lat double precision,
  check_in_lng double precision,
  check_in_accuracy_m double precision,
  check_in_distance_m double precision,
  check_out_at timestamptz,
  check_out_lat double precision,
  check_out_lng double precision,
  check_out_distance_m double precision,
  note text,
  created_at timestamptz not null default now()
);
create index time_entries_org_idx on public.time_entries (org_id, check_in_at desc);
create index time_entries_employee_idx on public.time_entries (employee_id, check_in_at desc);
create index time_entries_job_idx on public.time_entries (job_id);
-- One open check-in per person per organization.
create unique index time_entries_one_open on public.time_entries (org_id, employee_id) where check_out_at is null;

-- ---------------------------------------------------------------- mail
create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_request_id uuid references public.contact_requests (id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_email text not null,
  to_email text not null,
  subject text,
  body_text text,
  body_html text,
  provider_id text unique,
  sent_by uuid references auth.users (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index email_messages_org_idx on public.email_messages (org_id, created_at desc);
create index email_messages_request_idx on public.email_messages (contact_request_id, created_at);

create table public.email_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  show_logo boolean not null default true,
  tagline text,
  company_phone text,
  company_email text,
  website text,
  address text,
  cvr text,
  facebook_url text,
  instagram_url text,
  linkedin_url text,
  closing text default 'Med venlig hilsen',
  disclaimer text,
  default_banner_id text default 'none',
  banner_position text not null default 'bottom' check (banner_position in ('top', 'bottom')),
  updated_at timestamptz not null default now()
);

create table public.email_banners (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  image_url text not null,
  link_url text,
  alt_text text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index email_banners_org_idx on public.email_banners (org_id);

-- ---------------------------------------------------------------- statistics
create table public.page_views (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid references public.sites (id) on delete set null,
  path text not null,
  referrer_host text,
  utm_source text,
  device text,
  country text,
  city text,
  visitor_hash text,
  created_at timestamptz not null default now()
);
create index page_views_org_idx on public.page_views (org_id, created_at desc);

-- ---------------------------------------------------------------- helpers (no recursion)
create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create or replace function public.org_role_of(org uuid)
returns public.org_role language sql stable security definer set search_path to '' as $$
  select role from public.memberships where org_id = org and user_id = (select auth.uid());
$$;

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.is_superadmin() or exists (select 1 from public.memberships where org_id = org and user_id = (select auth.uid()));
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select public.is_superadmin() or exists (
    select 1 from public.memberships where org_id = org and user_id = (select auth.uid()) and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_org_staff(org uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.memberships where org_id = org and user_id = (select auth.uid()) and role in ('owner', 'admin', 'employee')
  );
$$;

create or replace function public.is_assigned_to_job(job uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.job_assignments where job_id = job and employee_id = (select auth.uid()));
$$;

revoke execute on function public.is_superadmin(), public.org_role_of(uuid), public.is_org_member(uuid),
  public.is_org_admin(uuid), public.is_org_staff(uuid), public.is_assigned_to_job(uuid) from public, anon;
grant execute on function public.is_superadmin(), public.org_role_of(uuid), public.is_org_member(uuid),
  public.is_org_admin(uuid), public.is_org_staff(uuid), public.is_assigned_to_job(uuid) to authenticated;

-- ---------------------------------------------------------------- triggers
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Quote numbers count per organization.
create or replace function public.assign_quote_number()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.quote_number is null then
    update public.organizations set next_quote_number = next_quote_number + 1
      where id = new.org_id returning next_quote_number - 1 into new.quote_number;
  end if;
  return new;
end;
$$;
revoke execute on function public.assign_quote_number() from public, anon, authenticated;
create trigger quotes_assign_number before insert on public.quotes
  for each row execute function public.assign_quote_number();

-- Child rows must belong to the same organization as their parent.
create or replace function public.check_same_org()
returns trigger language plpgsql security definer set search_path to '' as $$
declare parent_org uuid;
begin
  if tg_table_name = 'quote_line_items' then
    select org_id into parent_org from public.quotes where id = new.quote_id;
  elsif tg_table_name = 'job_assignments' then
    select org_id into parent_org from public.jobs where id = new.job_id;
    if not exists (select 1 from public.memberships where org_id = new.org_id and user_id = new.employee_id) then
      raise exception 'Employee is not a member of this organization';
    end if;
  elsif tg_table_name = 'jobs' and new.location_id is not null then
    select org_id into parent_org from public.locations where id = new.location_id;
  elsif tg_table_name = 'time_entries' and new.job_id is not null then
    select org_id into parent_org from public.jobs where id = new.job_id;
  elsif tg_table_name = 'email_messages' and new.contact_request_id is not null then
    select org_id into parent_org from public.contact_requests where id = new.contact_request_id;
  else
    return new;
  end if;
  if parent_org is distinct from new.org_id then
    raise exception 'Cross-organization reference on %', tg_table_name;
  end if;
  return new;
end;
$$;
revoke execute on function public.check_same_org() from public, anon, authenticated;
create trigger quote_line_items_same_org before insert or update on public.quote_line_items for each row execute function public.check_same_org();
create trigger job_assignments_same_org before insert or update on public.job_assignments for each row execute function public.check_same_org();
create trigger jobs_same_org before insert or update on public.jobs for each row execute function public.check_same_org();
create trigger time_entries_same_org before insert or update on public.time_entries for each row execute function public.check_same_org();
create trigger email_messages_same_org before insert or update on public.email_messages for each row execute function public.check_same_org();

-- ---------------------------------------------------------------- RLS
alter table public.organizations enable row level security;
alter table public.platform_admins enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.sites enable row level security;
alter table public.org_api_keys enable row level security;
alter table public.contact_requests enable row level security;
alter table public.services enable row level security;
alter table public.service_areas enable row level security;
alter table public.site_pages enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.locations enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;
alter table public.time_entries enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_settings enable row level security;
alter table public.email_banners enable row level security;
alter table public.page_views enable row level security;

create policy org_select on public.organizations for select to authenticated using ((select public.is_org_member(id)));
create policy org_update on public.organizations for update to authenticated using ((select public.is_org_admin(id))) with check ((select public.is_org_admin(id)));
create policy org_insert on public.organizations for insert to authenticated with check ((select public.is_superadmin()));
create policy org_delete on public.organizations for delete to authenticated using ((select public.is_superadmin()));

create policy platform_admins_self on public.platform_admins for select to authenticated using (user_id = (select auth.uid()) or (select public.is_superadmin()));

create policy profiles_self on public.profiles for select to authenticated using (id = (select auth.uid()) or (select public.is_superadmin()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_org_admin(org_id)));
create policy memberships_admin on public.memberships for all to authenticated
  using ((select public.is_org_admin(org_id))) with check ((select public.is_org_admin(org_id)));

-- Admin-only tables: full access for owners/admins of the row's organization.
do $$
declare t text;
begin
  foreach t in array array['sites', 'org_api_keys', 'contact_requests', 'services', 'service_areas', 'site_pages',
    'customers', 'leads', 'locations', 'quotes', 'quote_line_items', 'jobs', 'job_assignments', 'time_entries',
    'email_messages', 'email_settings', 'email_banners', 'page_views']
  loop
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_org_admin(org_id))) with check ((select public.is_org_admin(org_id)))', t || '_org_admin', t);
  end loop;
end $$;

-- Employees: their own shifts, open shifts in their organization, their own time entries.
create policy jobs_employee on public.jobs for select to authenticated
  using ((select public.is_org_staff(org_id)) and (is_open or (select public.is_assigned_to_job(id))));
create policy job_assignments_employee on public.job_assignments for select to authenticated
  using (employee_id = (select auth.uid()));
create policy locations_employee on public.locations for select to authenticated
  using ((select public.is_org_staff(org_id)));
create policy time_entries_employee on public.time_entries for select to authenticated
  using (employee_id = (select auth.uid()));

-- ---------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-assets', 'org-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;
