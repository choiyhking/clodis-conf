-- CLODIS Conf: invite-link access.
-- Lab members open one secret link and are in; no accounts or passwords for them.
-- Run after schema.sql and public-view-and-accounts.sql. Safe to run again.
--
-- BEFORE running: put the admin's sign-in email in the one marked line near the bottom.
-- AFTER running, in Authentication → Sign In / Providers:
--   1. turn ON  "Allow new users to sign up"   (a browser joining by link is a new anonymous user)
--   2. turn ON  "Allow anonymous sign-ins"
-- That is safe only because of the rules below: being signed in no longer grants anything.
-- A browser reads or writes lab data only if it is in app_access, and the only ways in are
-- the invite code or the admin.

-- Who is in. One row per browser that opened the invite link, plus accounts with a password.
create table if not exists public.app_access (
  uid        uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  joined_at  timestamptz not null default now()
);
-- The current invite code (a single row).
create table if not exists public.app_invite (
  id          int primary key default 1 check (id = 1),
  code        text not null,
  created_at  timestamptz not null default now()
);
alter table public.app_access enable row level security;
alter table public.app_invite enable row level security;
-- No policies and no grants: nobody reaches these tables through the API, only the functions below do.
revoke all on public.app_access, public.app_invite from anon, authenticated;

create or replace function public.has_access() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_access where uid = auth.uid());
$$;

-- 'admin', 'member', or null for a visitor.
create or replace function public.my_access() returns text
language sql stable security definer set search_path = public as $$
  select role from app_access where uid = auth.uid();
$$;

-- Called by a browser that opened the invite link.
create or replace function public.join_lab(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_code is null or length(p_code) < 16 then return false; end if;
  if not exists (select 1 from app_invite where code = p_code) then return false; end if;
  insert into app_access (uid, role) values (auth.uid(), 'member') on conflict (uid) do nothing;
  return true;
end $$;

-- Admin: the current code (made on first use).
create or replace function public.invite_code() returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from app_access where uid = auth.uid() and role = 'admin') then
    raise exception 'Only the admin can see the invite link';
  end if;
  insert into app_invite (id, code)
    values (1, left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40))
    on conflict (id) do nothing;
  return (select code from app_invite where id = 1);
end $$;

-- Admin: replace the code. The old link stops working and every browser that joined with it is removed.
create or replace function public.rotate_invite() returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from app_access where uid = auth.uid() and role = 'admin') then
    raise exception 'Only the admin can replace the invite link';
  end if;
  delete from app_access a using auth.users u
    where u.id = a.uid and a.role = 'member' and coalesce(u.is_anonymous, false);
  insert into app_invite (id, code)
    values (1, left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 40))
    on conflict (id) do update set code = excluded.code, created_at = now();
  return (select code from app_invite where id = 1);
end $$;

revoke all on function public.has_access(), public.my_access(), public.join_lab(text),
                       public.invite_code(), public.rotate_invite() from public, anon;
grant execute on function public.has_access(), public.my_access(), public.join_lab(text),
                          public.invite_code(), public.rotate_invite() to authenticated;

-- Lab data: only for those in app_access (this replaces "any signed-in account").
drop policy if exists "lab members read"  on public.docs;
drop policy if exists "lab members write" on public.docs;
create policy "lab members read"  on public.docs for select to authenticated using (public.has_access());
create policy "lab members write" on public.docs for all    to authenticated using (public.has_access()) with check (public.has_access());

-- First run only: accounts the admin created earlier keep working.
insert into public.app_access (uid, role)
  select id, 'member' from auth.users
  where not coalesce(is_anonymous, false) and not exists (select 1 from public.app_access);

-- ▼▼▼ Put the admin's sign-in email here, then run. ▼▼▼
insert into public.app_access (uid, role)
  select id, 'admin' from auth.users where lower(email) = lower('admin@example.com')
  on conflict (uid) do update set role = 'admin';
