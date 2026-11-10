-- Camera Ready: Supabase setup. Paste into the SQL editor and run once.

-- All data (conferences, deadlines, papers, members) is stored as "collection + id + JSON document".
create table if not exists public.docs (
  coll        text not null,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (coll, id)
);

-- Emails of lab members allowed in. Anyone else can sign in but sees nothing.
create table if not exists public.allowed_emails (
  email text primary key
);

alter table public.docs enable row level security;
alter table public.allowed_emails enable row level security;

create or replace function public.is_lab_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from allowed_emails where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

drop policy if exists "lab members read"  on public.docs;
drop policy if exists "lab members write" on public.docs;
create policy "lab members read"  on public.docs for select to authenticated using (public.is_lab_member());
create policy "lab members write" on public.docs for all    to authenticated using (public.is_lab_member()) with check (public.is_lab_member());

-- Explicit grants, so this works whether or not the project "automatically exposes new tables".
-- Signed-in users may touch docs (row level security above still decides which rows);
-- nobody reaches allowed_emails through the API — only is_lab_member() reads it.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.docs to authenticated;
grant execute on function public.is_lab_member() to authenticated;
revoke all on public.docs from anon;
revoke all on public.allowed_emails from anon, authenticated;

-- Register members (replace with real addresses, then run)
-- insert into public.allowed_emails (email) values ('professor@example.ac.kr'), ('student1@example.ac.kr');
