create table public.org_automation (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  auto_invoice boolean not null default false,
  invoice_day smallint not null default 1 check (invoice_day between 1 and 28),
  invoice_send boolean not null default false,
  auto_reminders boolean not null default false,
  reminder_after_days smallint not null default 3,
  reminder_repeat_days smallint not null default 10,
  reminder_max smallint not null default 2,
  quote_followup boolean not null default false,
  followup_after_days smallint not null default 4,
  weekly_digest boolean not null default true,
  digest_weekday smallint not null default 1 check (digest_weekday between 1 and 7),
  employee_morning boolean not null default true,
  customer_visit_reminder boolean not null default true,
  report_reminder boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.org_automation enable row level security;
create policy org_automation_admin on public.org_automation for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null,
  summary text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index automation_runs_org_idx on public.automation_runs (org_id, created_at desc);
alter table public.automation_runs enable row level security;
create policy automation_runs_admin on public.automation_runs for select using (public.is_org_admin(org_id));

create table public.recurring_invoice_runs (
  org_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  period text not null,
  invoice_id uuid references public.invoices (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (quote_id, period)
);
alter table public.recurring_invoice_runs enable row level security;
create policy recurring_invoice_runs_admin on public.recurring_invoice_runs for select using (public.is_org_admin(org_id));

alter table public.quotes add column if not exists followup_sent_at timestamptz;
alter table public.invoices add column if not exists reminder_count smallint not null default 0;
alter table public.quotes add column if not exists auto_invoice boolean not null default true;
