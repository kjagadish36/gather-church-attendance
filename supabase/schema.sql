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

-- Mobile number is the required registration identifier; email stays optional going forward.
alter table public.profiles alter column email drop not null;
alter table public.profiles add column if not exists phone text;
create unique index if not exists profiles_phone_unique on public.profiles(phone) where phone is not null;

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
  insert into public.profiles (id, full_name, email, phone, role, membership_status)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), 'Church member'), 120),
    nullif(btrim(new.raw_user_meta_data->>'email'), ''),
    nullif(btrim(new.raw_user_meta_data->>'phone'), ''),
    'member',
    'pending'
  );
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

-- Single-row church geofence config, used to gate self check-in to on-site members.
create table if not exists public.church_settings (
  id text primary key default 'singleton' check (id = 'singleton'),
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null check (radius_meters > 0)
);

alter table public.church_settings enable row level security;
drop policy if exists church_settings_read on public.church_settings;
create policy church_settings_read on public.church_settings for select to authenticated
using (public.has_member_access());
drop policy if exists church_settings_write on public.church_settings;
create policy church_settings_write on public.church_settings for all to authenticated
using (public.is_admin()) with check (public.is_admin());

revoke all on public.church_settings from anon, authenticated;
grant select on public.church_settings to authenticated;
grant insert, update on public.church_settings to authenticated;

-- Default admin accounts, so there's always a way in before anyone self-registers.
-- Sign in with these emails and the password below, then change the password immediately.
create extension if not exists pgcrypto;

do $$
declare
  admin record;
  new_id uuid;
begin
  for admin in
    select * from (values
      ('admin1@bbschurch.org', 'Admin One',   '90000 00001'),
      ('admin2@bbschurch.org', 'Admin Two',   '90000 00002'),
      ('admin3@bbschurch.org', 'Admin Three', '90000 00003')
    ) as t(email, full_name, phone)
  loop
    select id into new_id from auth.users where email = admin.email;

    if new_id is null then
      new_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new
      ) values (
        '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
        admin.email, crypt('ChangeMe123!', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', admin.full_name, 'phone', admin.phone),
        now(), now(), '', '', '', ''
      );

      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), new_id,
        jsonb_build_object('sub', new_id::text, 'email', admin.email),
        'email', new_id::text, now(), now(), now()
      );
    end if;

    -- handle_new_member() trigger just inserted this as a pending member; promote to approved admin.
    insert into public.profiles (id, full_name, email, phone, role, membership_status, approved_at)
    values (new_id, admin.full_name, admin.email, admin.phone, 'admin', 'approved', now())
    on conflict (id) do update
      set role = 'admin', membership_status = 'approved', approved_at = coalesce(public.profiles.approved_at, now());
  end loop;
end $$;

commit;