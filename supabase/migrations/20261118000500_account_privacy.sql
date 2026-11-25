create function public.export_fitness_account(p_account uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  archive jsonb;
begin
  if owner_id is null or p_account is distinct from owner_id or not exists (
    select 1 from auth.sessions as s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = owner_id
  ) then
    raise exception 'Account context changed' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'account', jsonb_build_object('id', u.id, 'email', u.email, 'created_at', u.created_at),
    'preferences', (select to_jsonb(p) - 'user_id'
      from public.account_preferences as p where p.user_id = u.id),
    'measurements', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by m.day)
      from public.account_body_measurements as m where m.user_id = u.id), '[]'::jsonb),
    'workouts', coalesce((select jsonb_agg(to_jsonb(w) - 'user_id' order by w.record_id)
      from public.account_workout_history as w where w.user_id = u.id), '[]'::jsonb),
    'nutrition', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id' order by n.record_key)
      from public.account_nutrition as n where n.user_id = u.id), '[]'::jsonb)
  ) into archive
  from auth.users as u
  where u.id = owner_id;

  if archive is null then
    raise exception 'Account context changed' using errcode = '42501';
  end if;
  return archive;
end;
$$;

create function public.delete_fitness_account(p_account uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  claims jsonb := auth.jwt();
  unix_now numeric := extract(epoch from statement_timestamp());
begin
  if owner_id is null or p_account is distinct from owner_id then
    raise exception 'Account context changed' using errcode = '42501';
  end if;

  -- A retry with the same token succeeds after an already-committed deletion.
  if not exists (select 1 from auth.users as u where u.id = owner_id) then
    return true;
  end if;

  if not exists (
    select 1 from auth.sessions as s
    where s.id = nullif(claims ->> 'session_id', '')::uuid and s.user_id = owner_id
  ) or not exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(claims -> 'amr') = 'array'
      then claims -> 'amr' else '[]'::jsonb end) as method(value)
    where method.value ->> 'method' = 'otp' and
      (case when jsonb_typeof(method.value -> 'timestamp') = 'number'
        then (method.value ->> 'timestamp')::numeric end) between unix_now - 300 and unix_now + 30
  ) then
    raise exception 'Recent verification required' using errcode = '42501';
  end if;

  -- Foreign keys remove the user's fitness records and authentication sessions.
  delete from auth.users as u where u.id = owner_id;
  return true;
end;
$$;

revoke all on function public.export_fitness_account(uuid) from public, anon, authenticated;
revoke all on function public.delete_fitness_account(uuid) from public, anon, authenticated;
grant execute on function public.export_fitness_account(uuid) to authenticated;
grant execute on function public.delete_fitness_account(uuid) to authenticated;
