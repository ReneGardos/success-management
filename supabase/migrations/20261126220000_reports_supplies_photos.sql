-- Cleaning reports (checklists from the agreement), products on site, supply requests, photos and customer feedback.

create table public.location_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  label text not null,
  area text,
  position integer not null default 0,
  active boolean not null default true,
  quote_line_id uuid references public.quote_line_items (id) on delete set null,
  created_at timestamptz not null default now()
);
create index location_tasks_loc_idx on public.location_tasks (location_id, position);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  unit text not null default 'stk',
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index products_org_idx on public.products (org_id, position);

create table public.location_products (
  org_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  status text not null default 'ok' check (status in ('ok', 'low', 'missing')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (location_id, product_id)
);
create index location_products_org_idx on public.location_products (org_id, status);

create table public.cleaning_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  location_id uuid references public.locations (id) on delete set null,
  employee_id uuid references auth.users (id) on delete set null,
  time_entry_id uuid references public.time_entries (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  note text,
  customer_visible boolean not null default true,
  public_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, employee_id)
);
create index cleaning_reports_org_idx on public.cleaning_reports (org_id, created_at desc);
create index cleaning_reports_loc_idx on public.cleaning_reports (location_id, created_at desc);

create table public.cleaning_report_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  report_id uuid not null references public.cleaning_reports (id) on delete cascade,
  task_id uuid references public.location_tasks (id) on delete set null,
  label text not null,
  area text,
  done boolean not null default false,
  note text,
  position integer not null default 0
);
create index cleaning_report_items_report_idx on public.cleaning_report_items (report_id, position);

create table public.report_products (
  org_id uuid not null references public.organizations (id) on delete cascade,
  report_id uuid not null references public.cleaning_reports (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  status text not null default 'ok' check (status in ('ok', 'low', 'missing')),
  qty_taken numeric not null default 0,
  primary key (report_id, product_id)
);

create table public.supply_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  report_id uuid references public.cleaning_reports (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  employee_id uuid references auth.users (id) on delete set null,
  message text not null,
  urgent boolean not null default false,
  status text not null default 'open' check (status in ('open', 'ordered', 'done')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index supply_requests_org_idx on public.supply_requests (org_id, status, created_at desc);

create table public.customer_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  report_id uuid references public.cleaning_reports (id) on delete set null,
  author_user_id uuid references auth.users (id) on delete set null,
  author_name text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'handled')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index customer_feedback_org_idx on public.customer_feedback (org_id, status, created_at desc);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  report_id uuid references public.cleaning_reports (id) on delete cascade,
  feedback_id uuid references public.customer_feedback (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,
  kind text not null default 'issue' check (kind in ('issue', 'unusual', 'before', 'after', 'customer')),
  path text not null,
  caption text,
  created_at timestamptz not null default now()
);
create index photos_report_idx on public.photos (report_id);
create index photos_feedback_idx on public.photos (feedback_id);
create index photos_org_idx on public.photos (org_id, created_at desc);

-- Same-organization guard for the new references.
create or replace function public.check_ops_refs()
returns trigger language plpgsql security definer set search_path to '' as $$
declare j jsonb := to_jsonb(new);
begin
  if (j ->> 'location_id') is not null and not exists (select 1 from public.locations where id = (j ->> 'location_id')::uuid and org_id = new.org_id) then
    raise exception 'Cross-organization location on %', tg_table_name;
  end if;
  if (j ->> 'report_id') is not null and not exists (select 1 from public.cleaning_reports where id = (j ->> 'report_id')::uuid and org_id = new.org_id) then
    raise exception 'Cross-organization report on %', tg_table_name;
  end if;
  if (j ->> 'product_id') is not null and not exists (select 1 from public.products where id = (j ->> 'product_id')::uuid and org_id = new.org_id) then
    raise exception 'Cross-organization product on %', tg_table_name;
  end if;
  if (j ->> 'job_id') is not null and not exists (select 1 from public.jobs where id = (j ->> 'job_id')::uuid and org_id = new.org_id) then
    raise exception 'Cross-organization job on %', tg_table_name;
  end if;
  if (j ->> 'feedback_id') is not null and not exists (select 1 from public.customer_feedback where id = (j ->> 'feedback_id')::uuid and org_id = new.org_id) then
    raise exception 'Cross-organization feedback on %', tg_table_name;
  end if;
  return new;
end;
$$;
revoke execute on function public.check_ops_refs() from public, anon, authenticated;
create trigger location_tasks_refs before insert or update on public.location_tasks for each row execute function public.check_ops_refs();
create trigger location_products_refs before insert or update on public.location_products for each row execute function public.check_ops_refs();
create trigger cleaning_reports_refs before insert or update on public.cleaning_reports for each row execute function public.check_ops_refs();
create trigger cleaning_report_items_refs before insert or update on public.cleaning_report_items for each row execute function public.check_ops_refs();
create trigger report_products_refs before insert or update on public.report_products for each row execute function public.check_ops_refs();
create trigger supply_requests_refs before insert or update on public.supply_requests for each row execute function public.check_ops_refs();
create trigger customer_feedback_refs before insert or update on public.customer_feedback for each row execute function public.check_ops_refs();
create trigger photos_refs before insert or update on public.photos for each row execute function public.check_ops_refs();

-- RLS (the app uses the service role; this guards any direct access).
do $$
declare t text;
begin
  foreach t in array array['location_tasks', 'products', 'location_products', 'cleaning_reports', 'cleaning_report_items', 'report_products', 'supply_requests', 'customer_feedback', 'photos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_org_admin(org_id))) with check ((select public.is_org_admin(org_id)))', t || '_org_admin', t);
  end loop;
end $$;
create policy cleaning_reports_employee on public.cleaning_reports for select to authenticated using (employee_id = (select auth.uid()));
create policy supply_requests_employee on public.supply_requests for select to authenticated using (employee_id = (select auth.uid()));

-- Private bucket for photos (served through short-lived signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-photos', 'org-photos', false, 8388608, array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- Starter product list for Success Cleaning.
insert into public.products (org_id, name, unit, position)
select o.id, p.name, p.unit, p.pos from public.organizations o,
(values ('Toiletpapir', 'rl.', 10), ('Håndklædeark', 'pk.', 20), ('Håndsæbe', 'fl.', 30), ('Affaldsposer', 'rl.', 40), ('Universalrengøring', 'fl.', 50), ('Toiletrens', 'fl.', 60), ('Glasrens', 'fl.', 70), ('Gulvsæbe', 'fl.', 80), ('Mikrofiberklude', 'stk', 90), ('Opvasketabs', 'pk.', 100)) as p(name, unit, pos)
where o.slug = 'success-cleaning';
