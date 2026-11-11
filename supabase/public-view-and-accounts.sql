-- CLODIS Conf: public deadlines + admin-created accounts.
-- Run the two parts in the Supabase SQL editor, in order. Both are safe to run again.

-- ───────── Part 1: what anyone may read ─────────
-- Signed-out visitors get conferences and deadlines only, with every name removed:
-- no owner, no "checked by", no free-text note. They never touch the docs table itself.
create or replace function public.public_docs()
returns table (coll text, id text, data jsonb)
language sql stable security definer set search_path = public as $$
  select d.coll, d.id,
         case d.coll when 'conferences' then d.data - 'owner'
                     else d.data - 'checkedBy' - 'note' end
  from docs d
  where d.coll in ('conferences', 'deadlines');
$$;

revoke all on function public.public_docs() from public;
grant usage on schema public to anon;
grant execute on function public.public_docs() to anon, authenticated;

-- ───────── Part 2: every account is a lab member ─────────
-- ONLY run this after turning OFF "Allow new users to sign up"
-- (Authentication → Sign In / Providers). With sign-ups off, accounts exist only because the
-- admin created them (Authentication → Users → Add user), so "signed in" means "lab member"
-- and the separate allowed_emails list is no longer needed.
-- If sign-ups are still on, anyone could create an account and read everything — do not run it then.
drop policy if exists "lab members read"  on public.docs;
drop policy if exists "lab members write" on public.docs;
create policy "lab members read"  on public.docs for select to authenticated using (true);
create policy "lab members write" on public.docs for all    to authenticated using (true) with check (true);
