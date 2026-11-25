create table public.account_coach_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_bucket bigint not null,
  minute_requests integer not null,
  day_bucket bigint not null,
  day_requests integer not null
);

alter table public.account_coach_quota enable row level security;
revoke all on public.account_coach_quota from public, anon, authenticated;

create function public.reserve_coach_request(p_account uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  minute_now bigint := floor(extract(epoch from statement_timestamp()) / 60);
  day_now bigint := floor(extract(epoch from statement_timestamp()) / 86400);
begin
  if owner_id is null or p_account is distinct from owner_id or not exists (
    select 1 from auth.sessions as s
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = owner_id
  ) then
    raise exception 'Account context changed' using errcode = '42501';
  end if;

  insert into public.account_coach_quota as q (user_id, minute_bucket, minute_requests, day_bucket, day_requests)
    values (owner_id, minute_now, 1, day_now, 1)
    on conflict (user_id) do update set
      minute_bucket = minute_now,
      minute_requests = case when q.minute_bucket = minute_now then q.minute_requests + 1 else 1 end,
      day_bucket = day_now,
      day_requests = case when q.day_bucket = day_now then q.day_requests + 1 else 1 end
    where (q.minute_bucket <> minute_now or q.minute_requests < 5)
      and (q.day_bucket <> day_now or q.day_requests < 30);

  return found;
end;
$$;

revoke all on function public.reserve_coach_request(uuid) from public, anon, authenticated;
grant execute on function public.reserve_coach_request(uuid) to authenticated;
