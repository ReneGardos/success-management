-- In-app notifications + web push subscriptions
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'info',
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, org_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id, org_id) where read_at is null;
alter table public.notifications enable row level security;
create policy notifications_own on public.notifications for select using (user_id = auth.uid());

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own on public.push_subscriptions for select using (user_id = auth.uid());

-- Chat: one thread per customer and one per employee, with the office
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('customer', 'employee')),
  customer_id uuid references public.customers (id) on delete cascade,
  employee_id uuid references auth.users (id) on delete cascade,
  last_message_at timestamptz,
  last_preview text,
  office_read_at timestamptz,
  member_read_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'customer' and customer_id is not null) or (kind = 'employee' and employee_id is not null))
);
create unique index chat_threads_customer_uq on public.chat_threads (org_id, customer_id) where kind = 'customer';
create unique index chat_threads_employee_uq on public.chat_threads (org_id, employee_id) where kind = 'employee';
create index chat_threads_org_idx on public.chat_threads (org_id, last_message_at desc nulls last);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  author_user_id uuid references auth.users (id) on delete set null,
  author_name text,
  from_office boolean not null default false,
  body text,
  job_id uuid references public.jobs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

alter table public.photos add column if not exists message_id uuid references public.chat_messages (id) on delete cascade;
alter table public.photos drop constraint if exists photos_kind_check;
alter table public.photos add constraint photos_kind_check check (kind in ('issue', 'unusual', 'before', 'after', 'customer', 'chat', 'signature'));

alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
create policy chat_threads_admin on public.chat_threads for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy chat_threads_employee on public.chat_threads for select using (employee_id = auth.uid());
create policy chat_messages_admin on public.chat_messages for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));
create policy chat_messages_employee on public.chat_messages for select using (exists (select 1 from public.chat_threads t where t.id = thread_id and t.employee_id = auth.uid()));

-- Users that belong to a customer record (linked profile or same email), for notifications.
create or replace function public.customer_user_ids(p_org uuid, p_customer uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select m.user_id from public.memberships m
  join auth.users u on u.id = m.user_id
  join public.customers c on c.id = p_customer and c.org_id = p_org
  where m.org_id = p_org and m.role = 'customer'
    and (c.profile_id = m.user_id or (c.email is not null and lower(u.email) = lower(c.email)))
$$;
revoke execute on function public.customer_user_ids(uuid, uuid) from public, anon, authenticated;
grant execute on function public.customer_user_ids(uuid, uuid) to service_role;
alter table public.chat_threads add column if not exists last_from_office boolean not null default false;
