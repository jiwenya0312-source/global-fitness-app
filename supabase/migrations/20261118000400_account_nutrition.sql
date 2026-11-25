create table public.account_nutrition (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_key text collate "C" not null,
  version integer not null default 1 check (version > 0),
  payload jsonb,
  primary key (user_id, record_key)
);

alter table public.account_nutrition enable row level security;
revoke all on table public.account_nutrition from public, anon, authenticated;
grant select on table public.account_nutrition to authenticated;

create policy own_account_nutrition on public.account_nutrition
  for select to authenticated using ((select auth.uid()) = user_id);

create function public.write_account_nutrition(p_account uuid, p_key text, p_version integer, p_payload jsonb)
returns table (record_key text, version integer, payload jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  food jsonb;
  nutrient_values jsonb;
  nutrient text;
  amount numeric;
begin
  if owner_id is null or p_account is distinct from owner_id then
    raise exception 'Account context changed' using errcode = '42501';
  end if;
  if p_key is null or (p_key <> 'goals' and p_key !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
    or p_version < 1 then
    raise exception 'Invalid nutrition record' using errcode = '22023';
  end if;

  if p_key = 'goals' then
    if (p_payload ->> 'kind') is distinct from 'goals' then
      raise exception 'Invalid goals' using errcode = '22023';
    end if;
    nutrient_values := p_payload -> 'values';
  elsif p_payload is not null then
    food := p_payload -> 'food';
    if (p_payload ->> 'kind') is distinct from 'food'
      or jsonb_typeof(p_payload -> 'day') is distinct from 'string'
      or (p_payload ->> 'day') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or jsonb_typeof(food -> 'name') is distinct from 'string'
      or (food ->> 'name') !~ '[^[:space:]]'
      or coalesce(food ->> 'meal', '') not in ('breakfast', 'lunch', 'dinner', 'snack')
      or coalesce(food ->> 'basis', '') not in ('portion', 'per100g', 'per100ml')
      or jsonb_typeof(food -> 'amount') is distinct from 'number' then
      raise exception 'Invalid food entry' using errcode = '22023';
    end if;
    perform (p_payload ->> 'day')::date;
    amount := (food ->> 'amount')::numeric;
    if amount <= 0 or amount > 100000 or amount <> round(amount, 3) then
      raise exception 'Invalid quantity' using errcode = '22023';
    end if;
    nutrient_values := food -> 'values';
  end if;

  if p_payload is not null then
    foreach nutrient in array array['kcal', 'protein', 'carbs', 'fat'] loop
      if jsonb_typeof(nutrient_values -> nutrient) is distinct from 'number' then
        raise exception 'Invalid nutrient' using errcode = '22023';
      end if;
      amount := (nutrient_values ->> nutrient)::numeric;
      if amount < 0 or amount > 100000 or amount <> round(amount, 3) or (p_key = 'goals' and amount = 0) then
        raise exception 'Invalid nutrient amount' using errcode = '22023';
      end if;
    end loop;
  end if;

  if p_version is null then
    insert into public.account_nutrition (user_id, record_key, payload)
      values (owner_id, p_key, p_payload)
      on conflict on constraint account_nutrition_pkey do nothing;
  else
    update public.account_nutrition as n
      set payload = p_payload, version = n.version + 1
      where n.user_id = owner_id and n.record_key = p_key and n.version = p_version
        and n.payload is distinct from p_payload;
  end if;

  -- A lost response can be retried with the same payload. Changes with stale versions get no row.
  return query select n.record_key, n.version, n.payload from public.account_nutrition as n
    where n.user_id = owner_id and n.record_key = p_key and n.payload is not distinct from p_payload;
end;
$$;

revoke all on function public.write_account_nutrition(uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.write_account_nutrition(uuid, text, integer, jsonb) to authenticated;
