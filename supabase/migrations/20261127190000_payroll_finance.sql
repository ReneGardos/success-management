create table public.org_payroll_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  default_wage numeric not null default 165,
  evening_start smallint not null default 18 check (evening_start between 12 and 23),
  evening_end smallint not null default 6 check (evening_end between 0 and 12),
  evening_supplement numeric not null default 25,
  weekend_supplement numeric not null default 45,
  overtime_after_hours numeric not null default 37,
  overtime_pct numeric not null default 50,
  km_rate numeric not null default 3.79,
  labor_overhead_pct numeric not null default 25,
  updated_at timestamptz not null default now()
);
alter table public.org_payroll_settings enable row level security;
create policy org_payroll_settings_admin on public.org_payroll_settings for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create table public.employee_pay (
  org_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references auth.users (id) on delete cascade,
  hourly_wage numeric,
  weekly_hours numeric,
  payroll_no text,
  updated_at timestamptz not null default now(),
  primary key (org_id, employee_id)
);
alter table public.employee_pay enable row level security;
create policy employee_pay_admin on public.employee_pay for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy employee_pay_self on public.employee_pay for select using (employee_id = auth.uid());

alter table public.time_entries add column if not exists approved_at timestamptz;
alter table public.time_entries add column if not exists approved_by uuid references auth.users (id) on delete set null;
alter table public.time_entries add column if not exists km numeric not null default 0;
alter table public.time_entries add column if not exists break_min smallint not null default 0;

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'locked' check (status in ('locked')),
  totals jsonb not null default '{}'::jsonb,
  locked_by uuid references auth.users (id) on delete set null,
  locked_at timestamptz not null default now(),
  unique (org_id, starts_on, ends_on)
);
alter table public.payroll_periods enable row level security;
create policy payroll_periods_admin on public.payroll_periods for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
