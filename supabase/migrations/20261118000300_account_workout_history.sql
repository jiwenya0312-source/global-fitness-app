create table public.account_workout_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null,
  workout jsonb,
  primary key (user_id, record_id)
);

alter table public.account_workout_history enable row level security;
revoke all on table public.account_workout_history from public, anon, authenticated;
grant select on table public.account_workout_history to authenticated;

create policy own_account_workout_history
  on public.account_workout_history for select to authenticated
  using ((select auth.uid()) = user_id);

create function public.write_account_workout(p_account uuid, p_record uuid, p_workout jsonb)
returns table (record_id uuid, workout jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null or p_account is distinct from owner_id then
    raise exception 'Account context changed' using errcode = '42501';
  end if;

  if p_record is null or (p_workout is not null and (
    octet_length(p_workout::text) > 262144
    or jsonb_typeof(p_workout) is distinct from 'object'
    or jsonb_typeof(p_workout -> 'startedAt') is distinct from 'string'
    or jsonb_typeof(p_workout -> 'endedAt') is distinct from 'string'
    or jsonb_typeof(p_workout -> 'schedule') is distinct from 'object'
    or jsonb_typeof(p_workout -> 'sets') is distinct from 'array'
    or coalesce(p_workout ->> 'units', '') not in ('metric', 'imperial')
  )) then
    raise exception 'Invalid workout snapshot' using errcode = '22023';
  end if;

  if p_workout is null then
    insert into public.account_workout_history (user_id, record_id, workout)
      values (owner_id, p_record, null)
      on conflict on constraint account_workout_history_pkey do update set workout = null;
  else
    insert into public.account_workout_history (user_id, record_id, workout)
      values (owner_id, p_record, p_workout)
      on conflict on constraint account_workout_history_pkey do nothing;
  end if;

  -- Repeated uploads return the existing row. A tombstone takes precedence over stale uploads.
  return query select h.record_id, h.workout
    from public.account_workout_history as h
    where h.user_id = owner_id and h.record_id = p_record
      and (h.workout is null or h.workout = p_workout);
end;
$$;

revoke all on function public.write_account_workout(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.write_account_workout(uuid, uuid, jsonb) to authenticated;
