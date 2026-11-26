-- PL/pgSQL resolves NEW.<field> even when an earlier AND-term is false, so each table
-- needs its own branch before any column is referenced.
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
  elsif tg_table_name = 'jobs' then
    if new.location_id is null then return new; end if;
    select org_id into parent_org from public.locations where id = new.location_id;
  elsif tg_table_name = 'time_entries' then
    if new.job_id is null then return new; end if;
    select org_id into parent_org from public.jobs where id = new.job_id;
  elsif tg_table_name = 'email_messages' then
    if new.contact_request_id is null then return new; end if;
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
