// Daily deadline collector. GitHub Actions runs this and commits public/data/auto.json.
//
// For every conference we track:
//   1. CRAWL  – open the conference's own site (the last known CFP URL, plus the same URL with the
//               year bumped to find next year's site as soon as it appears) and read the dates off it.
//   2. CCFDDL – fall back to the community-maintained ccfddl/ccf-deadlines repo when the site can't
//               be read (JavaScript-only pages, PDFs, unusual wording), and use it as a cross-check.
//
// Nothing here is trusted blindly: the site shows these values as "Auto" until the conference's
// owner confirms them, and keeps the lines of text each date was read from as evidence.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import yaml from 'js-yaml'
import { extractRounds, findCfpLinks } from './extract.mjs'

const DATA = new URL('../public/data/', import.meta.url)
const read = (f, fallback) => {
  try {
    return JSON.parse(readFileSync(new URL(f, DATA), 'utf8'))
  } catch {
    return fallback
  }
}
const today = new Date().toISOString().slice(0, 10)
const thisYear = Number(today.slice(0, 4))
const dateOnly = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '')
const timeOnly = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v) ? v.slice(11, 16) : '')

// ---------- 1) crawl conference sites ----------

/** Candidate URLs for next year's site: the same URL with 2027→2028 / fast27→fast28. */
export function nextYearCandidates(url, year) {
  const y4 = String(year), n4 = String(year + 1)
  const y2 = y4.slice(2), n2 = n4.slice(2)
  let u
  try {
    u = new URL(url)
  } catch {
    return []
  }
  const swap = (s) => (s.includes(y4) ? s.replaceAll(y4, n4) : s.replace(new RegExp(`(?<=[a-zA-Z_-])${y2}(?![0-9])`, 'g'), n2))
  const host = swap(u.host)
  const segs = u.pathname.split('/')
  const idx = segs.findIndex((s) => swap(s) !== s)
  if (host === u.host && idx < 0) return []
  // Deep CFP paths often don't exist yet, so also try the path cut right after the year segment.
  const basePath = idx >= 0 ? segs.slice(0, idx).concat(swap(segs[idx])).join('/') + '/' : '/'
  return [...new Set([`${u.protocol}//${host}${swap(u.pathname)}`, `${u.protocol}//${host}${basePath}`])]
}

async function get(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; conference-deadline-checker)', accept: 'text/html,*/*' },
    })
    if (!res.ok) return null
    return { url: res.url, html: await res.text() }
  } catch {
    return null
  }
}

/** Read one edition's dates from its site; follows one "Call for Papers / Important Dates" link if needed. */
async function crawlEdition(url, year, { mustMentionYear }) {
  const page = await get(url)
  if (!page) return null
  // Bounced to a login / access-denied page, or redirected to another host: the site isn't really there.
  if (new URL(page.url).host !== new URL(url).host || /accessdenied|signin|login/i.test(page.url)) return null
  if (page.html.length < 500 || /page not found|404 not found|access denied/i.test(page.html.slice(0, 3000))) return null
  const y = String(year)
  if (mustMentionYear && !(page.html.includes(y) && (page.url.includes(y) || page.url.includes(y.slice(2))))) return null

  let best = { url: page.url, ...extractRounds(page.html, year) }
  if (!best.rounds.length) {
    for (const link of findCfpLinks(page.html, page.url)) {
      const sub = await get(link)
      if (!sub) continue
      const r = extractRounds(sub.html, year)
      if (r.rounds.length) {
        best = { url: sub.url, ...r }
        break
      }
      if (r.evidence.length > best.evidence.length) best = { ...best, evidence: r.evidence }
    }
  }
  return { year, url: best.url, rounds: best.rounds, evidence: best.evidence, fetchedAt: today }
}

async function crawlAll(prev) {
  const confs = read('conferences.json', [])
  const deadlines = read('deadlines.json', [])
  const out = {}
  const jobs = confs.map((c) => async () => {
    const mine = deadlines.filter((d) => d.confId === c.id && d.url)
    if (!mine.length) return
    const latest = mine.reduce((a, b) => (b.year > a.year ? b : a))
    const editions = []
    const cur = await crawlEdition(latest.url, latest.year, { mustMentionYear: false })
    if (cur) editions.push(cur)
    for (const cand of nextYearCandidates(latest.url, latest.year)) {
      const next = await crawlEdition(cand, latest.year + 1, { mustMentionYear: true })
      if (next) {
        const seen = prev[c.id]?.find((e) => e.year === next.year)
        editions.push({ ...next, firstSeen: seen?.firstSeen ?? today })
        break
      }
    }
    if (editions.length) out[c.id] = editions
  })
  let i = 0
  await Promise.all(Array.from({ length: 6 }, async () => { while (i < jobs.length) await jobs[i++]() }))
  return out
}

// ---------- 2) ccfddl fallback ----------
function collectCcfddl() {
  const dir = mkdtempSync(join(tmpdir(), 'ccfddl-'))
  try {
    execFileSync('git', ['clone', '--depth', '1', '--quiet', 'https://github.com/ccfddl/ccf-deadlines.git', dir], { stdio: 'inherit' })
    const out = {}
    const root = join(dir, 'conference')
    for (const cat of readdirSync(root, { withFileTypes: true })) {
      if (!cat.isDirectory()) continue
      for (const file of readdirSync(join(root, cat.name))) {
        if (!file.endsWith('.yml')) continue
        let doc
        try {
          doc = yaml.load(readFileSync(join(root, cat.name, file), 'utf8'))
        } catch (e) {
          console.warn('skipped (bad YAML):', cat.name, file, e.message)
          continue
        }
        const item = Array.isArray(doc) ? doc[0] : doc
        if (!item?.confs) continue
        const editions = item.confs
          .filter((c) => Number(c.year) >= thisYear - 1)
          .map((c) => ({
            year: Number(c.year),
            link: c.link ?? '',
            place: c.place ?? '',
            date: c.date ?? '',
            timezone: c.timezone ?? '',
            rounds: (c.timeline ?? []).map((t) => ({
              abstract: dateOnly(t.abstract_deadline),
              deadline: dateOnly(t.deadline),
              time: timeOnly(t.deadline),
              noti: dateOnly(t.decision_deadline ?? t.notification ?? t.notification_date),
              comment: t.comment ?? '',
            })),
          }))
          .sort((a, b) => a.year - b.year)
        if (editions.length) out[`${cat.name}/${file.slice(0, -4)}`] = { title: item.title ?? file, editions }
      }
    }
    return out
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---------- run ----------
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const prev = read('auto.json', { ccfddl: {}, crawl: {} })
  let ccfddl = prev.ccfddl ?? {}
  if (!process.argv.includes('--no-ccfddl')) {
    try {
      ccfddl = collectCcfddl()
      console.log('ccfddl conferences:', Object.keys(ccfddl).length)
    } catch (e) {
      console.error('ccfddl failed, keeping previous data:', e.message)
    }
  }
  const crawl = await crawlAll(prev.crawl ?? {})
  const eds = Object.values(crawl).flat()
  console.log(`crawled ${Object.keys(crawl).length} conferences: ${eds.length} editions reachable, ${eds.filter((e) => e.rounds.length).length} with dates`)
  writeFileSync(new URL('auto.json', DATA), JSON.stringify({ generatedAt: new Date().toISOString(), crawl, ccfddl }, null, 1))
}
