begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists membership_status text not null default 'pending'
check (membership_status in ('pending', 'approved', 'rejected'));
alter table public.profiles add column if not exists approved_at timestamptz;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  location text not null check (char_length(location) between 1 and 160),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  enabled boolean not null default true,
  check (closes_at > opens_at)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  checked_in_at timestamptz not null default now(),
  unique (member_id, service_id)
);

create index if not exists attendance_service_idx on public.attendance(service_id);
create index if not exists services_opens_idx on public.services(opens_at);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.has_member_access()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (role = 'admin' or membership_status = 'approved')
  );
$$;
revoke all on function public.has_member_access() from public, anon;
grant execute on function public.has_member_access() to authenticated;

create or replace function public.review_membership(target_member uuid, decision text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator approval required' using errcode = '42501';
  end if;
  if decision is null or decision not in ('approved', 'rejected') then
    raise exception 'Invalid membership decision' using errcode = '22023';
  end if;
  update public.profiles
  set membership_status = decision,
      approved_at = case when decision = 'approved' then coalesce(approved_at, now()) else approved_at end
  where id = target_member and role = 'member';
  if not found then
    raise exception 'Member profile not found' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.review_membership(uuid, text) from public, anon;
grant execute on function public.review_membership(uuid, text) to authenticated;

create or replace function public.handle_new_member()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role, membership_status)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), 'Church member'), 120), coalesce(new.email, ''), 'member', 'pending');
  return new;
end;
$$;
revoke all on function public.handle_new_member() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_member();

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.attendance enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists services_read on public.services;
create policy services_read on public.services for select to authenticated using (public.has_member_access());
drop policy if exists services_create on public.services;
create policy services_create on public.services for insert to authenticated
with check (public.is_admin());
drop policy if exists services_update on public.services;
create policy services_update on public.services for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated
using (public.has_member_access() and (member_id = auth.uid() or public.is_admin()));
drop policy if exists attendance_check_in on public.attendance;
create policy attendance_check_in on public.attendance for insert to authenticated
with check (
  member_id = auth.uid()
  and public.has_member_access()
  and exists (
    select 1 from public.services
    where id = service_id and enabled and opens_at <= now() and now() < closes_at
  )
);

revoke all on public.profiles, public.services, public.attendance from anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles, public.services, public.attendance to authenticated;
grant insert, update on public.services to authenticated;
grant insert (member_id, service_id) on public.attendance to authenticated;

commit;