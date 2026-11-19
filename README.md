# CLODIS Conf

Conference deadlines and paper planning for the CLODIS lab (Cloud & Distributed Systems Lab, KNU).

**Site:** https://choiyhking.github.io/clodis-conf/

## What you see

- **Without signing in** — the Deadlines table, read-only: rank, abstract / submission / notification dates, days left, location, and how far each date can be trusted.
- **Lab members** — also who is targeting what, plus Timeline, Papers, Inbox and Lab. They open the invite link once per browser; there is no sign-in. The admin copies or replaces the link in the Lab tab, and signs in at `#admin` (or from the bottom of the Lab page).

## Date status

- **Verified** — a person checked the conference site.
- **Auto** — collected automatically every morning, waiting to be confirmed.
- **Estimated** — not announced yet; last year's dates moved one year forward.

Verified wins over Auto, Auto over Estimated.

## Running locally

```bash
npm install
npm run dev
```

With no environment variables, data stays in that browser only. To connect to Supabase, copy `.env.example` to `.env.local` and fill it in.

## Setup

- **Supabase** — run `supabase/schema.sql`, turn off "Allow new users to sign up", run `supabase/public-view-and-accounts.sql`, and create the admin account under Authentication → Users. Then put the admin email into `supabase/invite-link.sql`, run it, and turn on "Allow new users to sign up" and "Allow anonymous sign-ins".
- **GitHub Pages** — Settings → Pages → Source: GitHub Actions, and add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository variables.
- **Daily collection** — GitHub Actions runs `scripts/update.mjs` every morning and commits `public/data/auto.json`.
