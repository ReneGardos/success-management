create table public.shift_handovers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  employee_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  status text not null default 'open' check (status in ('open', 'taken', 'withdrawn', 'cancelled')),
  taken_by uuid references auth.users (id) on delete set null,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index shift_handovers_open_uq on public.shift_handovers (job_id, employee_id) where status = 'open';
create index shift_handovers_org_idx on public.shift_handovers (org_id, status, created_at desc);
alter table public.shift_handovers enable row level security;
create policy shift_handovers_admin on public.shift_handovers for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy shift_handovers_staff_read on public.shift_handovers for select using (public.is_org_staff(org_id));
