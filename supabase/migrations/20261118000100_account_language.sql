create table public.account_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text check (language in ('zh', 'en')),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);

alter table public.account_preferences enable row level security;

revoke all on table public.account_preferences from public, anon, authenticated;
grant select on table public.account_preferences to authenticated;

create policy own_account_preferences
  on public.account_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create function public.write_account_language(
  p_account uuid,
  p_language text,
  p_expected_version integer
)
returns table (language text, version integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or p_account is distinct from current_user_id then
    raise exception 'Account context changed' using errcode = '42501';
  end if;

  if p_language not in ('zh', 'en') or p_expected_version < 1 then
    raise exception 'Invalid language or version' using errcode = '22023';
  end if;

  if p_expected_version is null and p_language is not null then
    return query
      insert into public.account_preferences as preference (user_id, language)
      values (current_user_id, p_language)
      on conflict (user_id) do nothing
      returning preference.language, preference.version, preference.updated_at;
  elsif p_expected_version is not null then
    return query
      update public.account_preferences as preference
      set language = p_language, version = preference.version + 1, updated_at = statement_timestamp()
      where preference.user_id = current_user_id
        and preference.version = p_expected_version
        and preference.language is distinct from p_language
      returning preference.language, preference.version, preference.updated_at;
  end if;

  if found then
    return;
  end if;

  -- A retry that already reached the desired value succeeds without bumping the version.
  return query
    select preference.language, preference.version, preference.updated_at
    from public.account_preferences as preference
    where preference.user_id = current_user_id
      and preference.language is not distinct from p_language;
end;
$$;

revoke all on function public.write_account_language(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.write_account_language(uuid, text, integer) to authenticated;
