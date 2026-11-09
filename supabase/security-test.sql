begin;

insert into auth.users (id, email, raw_user_meta_data) values
('00000000-0000-4000-8000-000000000001', 'gather-test-member-a@example.com', '{"full_name":"Test Member A","role":"admin","membership_status":"approved"}'),
('00000000-0000-4000-8000-000000000002', 'gather-test-member-b@example.com', '{"full_name":"Test Member B"}'),
('00000000-0000-4000-8000-000000000003', 'gather-test-admin@example.com', '{"full_name":"Test Admin"}');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000003';
insert into public.services (id, title, location, opens_at, closes_at, enabled) values
('10000000-0000-4000-8000-000000000001', 'Test Open', 'Hall', now() - interval '1 hour', now() + interval '1 hour', true),
('10000000-0000-4000-8000-000000000002', 'Test Closed', 'Hall', now() - interval '2 hours', now() - interval '1 hour', true),
('10000000-0000-4000-8000-000000000003', 'Test Paused', 'Hall', now() - interval '1 hour', now() + interval '1 hour', false),
('10000000-0000-4000-8000-000000000004', 'Test Future', 'Hall', now() + interval '1 hour', now() + interval '2 hours', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

do $$
begin
  if public.has_member_access() then raise exception 'FAIL: signup metadata bypassed approval'; end if;
  if (select membership_status from public.profiles where id = auth.uid()) is distinct from 'pending' then raise exception 'FAIL: new member not pending or cannot read own profile'; end if;
  if (select count(*) from public.services) <> 0 then raise exception 'FAIL: pending member can read services'; end if;
  begin
    update public.profiles set membership_status = 'approved' where id = auth.uid();
    raise exception 'FAIL: member can directly approve themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.review_membership(auth.uid(), 'approved');
    raise exception 'FAIL: member can call approval function';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.attendance(member_id, service_id) values (auth.uid(), '10000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: pending member can check in';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$
begin
  perform public.review_membership('00000000-0000-4000-8000-000000000001', 'approved');
  perform public.review_membership('00000000-0000-4000-8000-000000000002', 'approved');
  begin
    perform public.review_membership('00000000-0000-4000-8000-000000000001', 'invalid');
    raise exception 'FAIL: invalid approval decision accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.review_membership(auth.uid(), 'rejected');
    raise exception 'FAIL: review function can change administrator membership';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

do $$
begin
  if public.is_admin() then raise exception 'FAIL: signup metadata granted admin'; end if;
  if not public.has_member_access() then raise exception 'FAIL: approved member cannot access church'; end if;
  if (select approved_at from public.profiles where id = auth.uid()) is null then raise exception 'FAIL: approval timestamp not recorded'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL: member can read other profiles'; end if;
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'FAIL: member can promote themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.services(title, location, opens_at, closes_at) values ('Unauthorized', 'Hall', now(), now() + interval '1 hour');
    raise exception 'FAIL: member can create services';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.attendance(member_id, service_id) values ('00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: member can check in someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.attendance(member_id, service_id, checked_in_at) values (auth.uid(), '10000000-0000-4000-8000-000000000001', now() - interval '1 day');
    raise exception 'FAIL: member can forge timestamps';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.attendance(member_id, service_id) values (auth.uid(), '10000000-0000-4000-8000-000000000002');
    raise exception 'FAIL: closed-service check-in allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.attendance(member_id, service_id) values (auth.uid(), '10000000-0000-4000-8000-000000000003');
    raise exception 'FAIL: paused-service check-in allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.attendance(member_id, service_id) values (auth.uid(), '10000000-0000-4000-8000-000000000004');
    raise exception 'FAIL: early check-in allowed';
  exception when insufficient_privilege then null;
  end;
  insert into public.attendance(member_id, service_id) values (auth.uid(), '10000000-0000-4000-8000-000000000001');
  begin
    insert into public.attendance(member_id, service_id) values (auth.uid(), '10000000-0000-4000-8000-000000000001');
    raise exception 'FAIL: duplicate check-in allowed';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.attendance) <> 1 then raise exception 'FAIL: member cannot read own attendance'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (select count(*) from public.attendance) <> 0 then raise exception 'FAIL: member B can read member A attendance'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$
begin
  if not public.is_admin() then raise exception 'FAIL: admin not recognized'; end if;
  if (select count(*) from public.profiles where id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002')) <> 2 then raise exception 'FAIL: admin cannot read members'; end if;
  if (select count(*) from public.attendance where service_id = '10000000-0000-4000-8000-000000000001') <> 1 then raise exception 'FAIL: admin cannot read attendance'; end if;
  update public.services set enabled = false where id = '10000000-0000-4000-8000-000000000001';
  if not found then raise exception 'FAIL: admin cannot pause services'; end if;
  insert into public.services(title, location, opens_at, closes_at) values ('Admin Service', 'Hall', now(), now() + interval '1 hour');
end;
$$;

select public.review_membership('00000000-0000-4000-8000-000000000001', 'rejected');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
begin
  if public.has_member_access() then raise exception 'FAIL: rejected member retains access'; end if;
  if (select count(*) from public.attendance) <> 0 then raise exception 'FAIL: rejected member can read attendance'; end if;
  if (select count(*) from public.services) <> 0 then raise exception 'FAIL: rejected member can read services'; end if;
end;
$$;

reset role;
select 'PASS: approval enforcement, member isolation, admin access, timestamps, windows, and duplicates' as result;
rollback;