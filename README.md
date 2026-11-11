# CLODIS Conf

The CLODIS (Cloud & Distributed Systems Lab, KNU) tool for conference deadlines and paper planning: which conferences we care about, when they're due,
who is aiming at which one, and how past submissions went.

## Pages

| Page | What it's for |
|---|---|
| **Deadlines** | Every tracked deadline grouped by month: rank, abstract/submission/notification dates, days left, location, status, owner, and who is targeting it. Click a row for the full detail panel. |
| **Timeline** | Twelve months at a glance. Key deadlines on top; below, one bar per paper running to its target deadline, the review period, and the result. Group by person or by topic. |
| **Papers** | Board by status (Idea → Writing → Under review → Accepted / Rejected), a per-person summary, and the submission log. |
| **Inbox** | What needs a human: newly collected dates, changed dates, next year's site appearing, and dates nobody has re-checked in 45 days. |
| **Lab** | Members and roles (Professor, Postdoc, PhD, MS, Undergrad, Alumni), backup and restore. |

## How dates get their status

- **Verified** — a person checked the conference site. Who and when is recorded.
- **Auto** — collected automatically, shown immediately, waiting for the owner to confirm. `×2` means both collectors agree.
- **Estimated** — this edition hasn't been announced, so last year's dates moved one year forward are shown.
  They disappear by themselves once real dates arrive.

Verified wins over Auto, Auto over Estimated. A collected value never overwrites a verified one; if they differ for an
upcoming deadline (typically an extension) the row is flagged **Changed** in the Inbox.

## The collector (`scripts/update.mjs`)

GitHub Actions runs it every morning (06:00 KST) and commits `public/data/auto.json`.

1. **ccfddl** — reads [ccfddl/ccf-deadlines](https://github.com/ccfddl/ccf-deadlines), a hand-curated dataset of ~380 conferences.
2. **Site crawler** — opens each conference's own CFP page, plus the same URL with the year bumped (`fast27` → `fast28`,
   `2027.eurosys.org` → `2028.…`) to notice next year's site as soon as it exists, and reads dates from the text
   (`scripts/extract.mjs`).

ccfddl is the primary source and the crawler is the second opinion. Measured against the 79 conferences whose dates we had
already verified by hand (`node scripts/evaluate.mjs`):

| | has dates | all rounds exactly right |
|---|---|---|
| ccfddl | 69 / 79 | 62 |
| site crawler (regex) | 40 / 79 | 20 |

Conference pages are too irregular for pattern matching to be trusted alone, so the crawler is used for what ccfddl can't do:
editions and conferences ccfddl doesn't have, early detection of new sites, agreement checks, and keeping the lines of
text a date was read from as evidence in the detail panel.

Run it locally with `npm run update-data`.

## Running

```bash
npm install
npm run dev
```

With no environment variables it runs in **local mode**: data lives in that browser only.

## Sharing with the lab (Supabase, free tier)

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/schema.sql` in the SQL editor.
3. Authentication → Sign In / Providers: turn **off** "Allow new users to sign up". Then run `supabase/public-view-and-accounts.sql`.
4. Authentication → Users → **Add user** for each lab member (email + a first password, auto-confirmed). They can change the password from the sidebar.
5. Put the project URL and anon key in `.env.local` (see `.env.example`).
6. Sign in on the site, then Lab → **Import spreadsheet data** once.

**Who sees what.** Without signing in, anyone with the address sees the Deadlines table, read-only, with no names
(the database only hands out conferences and deadlines stripped of owner / checker / notes). Signed-in accounts — which
only the admin can create — see and edit everything: targets, papers, timeline, members, activity.

The free tier pauses a project after 7 days without requests; normal use keeps it awake.

## Deploying (GitHub Pages, free)

1. Push this folder to a GitHub repository.
2. Settings → Pages → Source: **GitHub Actions**.
3. Settings → Secrets and variables → Actions → **Variables**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. In Supabase → Authentication → URL Configuration, add the deployed URL (needed for sign-in links).

Free GitHub Pages requires a public repository, so `public/data/` (the conference list and collected dates) is readable by
anyone; it carries no names. Papers, targets, results and members live in Supabase and are visible to signed-in members only.

## Data files

- `public/data/conferences.json`, `deadlines.json` — the initial data imported from the lab spreadsheet (92 conferences, 129 deadlines)
- `public/data/grades.json` — KIISE 2024 and BK21 2018 ranks, used only to pre-fill ranks when adding a conference. Extracted mechanically from the PDFs, so double-check.
- `public/data/auto.json` — collector output, refreshed by Actions

The app name is one constant: `APP_NAME` in `src/logic.ts`.
