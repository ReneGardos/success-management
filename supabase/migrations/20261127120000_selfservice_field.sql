-- Customer ratings of visits
alter table public.cleaning_reports add column if not exists customer_rating smallint check (customer_rating between 1 and 5);
alter table public.cleaning_reports add column if not exists customer_comment text;
alter table public.cleaning_reports add column if not exists rated_at timestamptz;
-- Customer signature on site
alter table public.cleaning_reports add column if not exists signature_path text;
alter table public.cleaning_reports add column if not exists signed_name text;
alter table public.cleaning_reports add column if not exists signed_at timestamptz;
-- Before/after photos per checklist item
alter table public.photos add column if not exists item_id uuid references public.cleaning_report_items (id) on delete set null;
-- QR check-in on site
alter table public.locations add column if not exists qr_token text unique default encode(gen_random_bytes(12), 'hex');
update public.locations set qr_token = encode(gen_random_bytes(12), 'hex') where qr_token is null;
alter table public.time_entries add column if not exists method text not null default 'gps' check (method in ('gps', 'qr', 'manual'));

-- Customer asks to move or skip a visit
create table public.visit_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  requested_by uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('move', 'skip')),
  wish_date date,
  wish_time text,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index visit_requests_org_idx on public.visit_requests (org_id, status, created_at desc);
alter table public.visit_requests enable row level security;
create policy visit_requests_admin on public.visit_requests for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- Private calendar feeds (.ics) per person
create table public.calendar_feeds (
  token text primary key default encode(gen_random_bytes(18), 'hex'),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('employee', 'customer')),
  ref_id uuid,
  created_at timestamptz not null default now(),
  unique (org_id, user_id, kind)
);
alter table public.calendar_feeds enable row level security;
create policy calendar_feeds_own on public.calendar_feeds for select using (user_id = auth.uid());

-- Online card payment (Stripe) per company. Secrets are only readable by the service role.
create table public.org_payment_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  stripe_secret_key text,
  stripe_webhook_secret text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.org_payment_settings enable row level security;
alter table public.invoices add column if not exists paid_via text;
alter table public.invoices add column if not exists stripe_session_id text;
