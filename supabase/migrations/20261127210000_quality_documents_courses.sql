-- Quality inspections, documents with e-signature, courses (applied via MCP; see PR #12)
create table public.quality_inspections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid references public.locations (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  inspector_id uuid references auth.users (id) on delete set null,
  employee_id uuid references auth.users (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'done')),
  score numeric,
  note text,
  share_with_customer boolean not null default false,
  public_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index quality_inspections_org_idx on public.quality_inspections (org_id, created_at desc);
create table public.quality_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  inspection_id uuid not null references public.quality_inspections (id) on delete cascade,
  area text,
  label text not null,
  score smallint check (score between 1 and 5),
  note text,
  position integer not null default 0
);
create index quality_items_insp_idx on public.quality_items (inspection_id, position);
alter table public.photos add column if not exists inspection_id uuid references public.quality_inspections (id) on delete cascade;
alter table public.photos drop constraint if exists photos_kind_check;
alter table public.photos add constraint photos_kind_check check (kind in ('issue', 'unusual', 'before', 'after', 'customer', 'chat', 'signature', 'quality'));

create table public.org_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('contract', 'employee', 'policy')),
  title text not null,
  body text,
  file_path text,
  file_name text,
  customer_id uuid references public.customers (id) on delete cascade,
  employee_id uuid references auth.users (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete set null,
  needs_signature boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'declined', 'archived')),
  public_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_name text,
  signed_at timestamptz,
  signed_ip text,
  signature_path text,
  expires_on date,
  uploaded_by_employee boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index org_documents_org_idx on public.org_documents (org_id, kind, created_at desc);

create table public.org_courses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  summary text,
  content text,
  video_url text,
  required boolean not null default true,
  minutes smallint,
  active boolean not null default true,
  position integer not null default 100,
  created_at timestamptz not null default now()
);
create table public.course_completions (
  course_id uuid not null references public.org_courses (id) on delete cascade,
  employee_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (course_id, employee_id)
);

alter table public.quality_inspections enable row level security;
alter table public.quality_items enable row level security;
alter table public.org_documents enable row level security;
alter table public.org_courses enable row level security;
alter table public.course_completions enable row level security;
create policy quality_inspections_admin on public.quality_inspections for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy quality_items_admin on public.quality_items for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy org_documents_admin on public.org_documents for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy org_documents_employee on public.org_documents for select using (employee_id = auth.uid());
create policy org_courses_admin on public.org_courses for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy org_courses_staff on public.org_courses for select using (public.is_org_staff(org_id));
create policy course_completions_admin on public.course_completions for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy course_completions_self on public.course_completions for select using (employee_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-docs', 'org-docs', false, 15728640, array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'])
on conflict (id) do nothing;
-- (Starter courses were seeded per organization when applied.)
