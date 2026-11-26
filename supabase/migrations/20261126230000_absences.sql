-- Employee absence / holiday requests.
create table public.employee_absences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  employee_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'vacation' check (kind in ('vacation', 'sick', 'child_sick', 'other')),
  starts_on date not null,
  ends_on date not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index employee_absences_org_idx on public.employee_absences (org_id, starts_on);
create index employee_absences_employee_idx on public.employee_absences (employee_id, starts_on);
alter table public.employee_absences enable row level security;
create policy employee_absences_org_admin on public.employee_absences for all to authenticated using ((select public.is_org_admin(org_id))) with check ((select public.is_org_admin(org_id)));
create policy employee_absences_self on public.employee_absences for select to authenticated using (employee_id = (select auth.uid()));
