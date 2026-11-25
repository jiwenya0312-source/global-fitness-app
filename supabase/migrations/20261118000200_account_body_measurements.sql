create table public.account_body_measurements (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  weight_kg numeric(9, 6),
  waist_cm numeric(9, 6),
  deleted boolean not null,
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  check (weight_kg between 1 and 700),
  check (waist_cm between 10 and 350),
  check (
    (deleted and weight_kg is null and waist_cm is null)
    or (not deleted and (weight_kg is not null or waist_cm is not null))
  )
);

alter table public.account_body_measurements enable row level security;
revoke all on table public.account_body_measurements from public, anon, authenticated;
grant select on table public.account_body_measurements to authenticated;

create policy own_account_body_measurements
  on public.account_body_measurements for select to authenticated
  using ((select auth.uid()) = user_id);

create function public.write_account_body_measurement(
  p_account uuid,
  p_day date,
  p_expected_version integer,
  p_weight_kg numeric,
  p_waist_cm numeric,
  p_deleted boolean
)
returns table (day date, weight_kg numeric, waist_cm numeric, deleted boolean, version integer, updated_at timestamptz)
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

  if p_day is null or p_day < date '0001-01-01' or p_day > date '9999-12-31' or p_deleted is null
     or p_expected_version < 1
     or (p_deleted and (p_weight_kg is not null or p_waist_cm is not null))
     or (not p_deleted and p_weight_kg is null and p_waist_cm is null)
     or (p_weight_kg is not null and (p_weight_kg not between 1 and 700 or p_weight_kg <> round(p_weight_kg, 6)))
     or (p_waist_cm is not null and (p_waist_cm not between 10 and 350 or p_waist_cm <> round(p_waist_cm, 6))) then
    raise exception 'Invalid body measurement' using errcode = '22023';
  end if;

  if p_expected_version is null then
    insert into public.account_body_measurements (user_id, day, weight_kg, waist_cm, deleted)
      values (owner_id, p_day, p_weight_kg, p_waist_cm, p_deleted)
      on conflict on constraint account_body_measurements_pkey do nothing;
  else
    update public.account_body_measurements as m
      set weight_kg = p_weight_kg, waist_cm = p_waist_cm, deleted = p_deleted,
          version = m.version + 1, updated_at = statement_timestamp()
      where m.user_id = owner_id and m.day = p_day and m.version = p_expected_version
        and (m.weight_kg, m.waist_cm, m.deleted) is distinct from (p_weight_kg, p_waist_cm, p_deleted);
  end if;

  -- Return the matching row for a successful write or a retry that already took effect.
  return query select m.day, m.weight_kg, m.waist_cm, m.deleted, m.version, m.updated_at
    from public.account_body_measurements as m
    where m.user_id = owner_id and m.day = p_day
      and (m.weight_kg, m.waist_cm, m.deleted) is not distinct from (p_weight_kg, p_waist_cm, p_deleted);
end;
$$;

revoke all on function public.write_account_body_measurement(uuid, date, integer, numeric, numeric, boolean)
  from public, anon, authenticated;
grant execute on function public.write_account_body_measurement(uuid, date, integer, numeric, numeric, boolean)
  to authenticated;
