import { ROLES, type AutoData, type Coll, type Conf, type Data, type Deadline, type Member, type Paper, type PaperStatus, type Round, type Row } from './types'

export const APP_NAME = 'CLODIS Conf'
export const LAB_NAME = 'Cloud & Distributed Systems Lab'

// ---------- dates ----------
const DAY = 86400000
export const toMs = (d: string) => Date.parse(d + 'T00:00:00Z')
export const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY)
/** Same calendar date n years later (Feb 29 falls back to Feb 28). */
export function addYears(d: string, n: number) {
  const y = Number(d.slice(0, 4)) + n
  const rest = d.slice(4) === '-02-29' && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? '-02-28' : d.slice(4)
  return `${y}${rest}`
}
export const diffDays = (a: string, b: string) => Math.round((toMs(a) - toMs(b)) / DAY)
export function todayStr() {
  const n = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`
}
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** Every date in the UI is shown as ISO 2026-11-17; this only blanks out missing values. */
export const fmt = (d: string) => (isDate(d) ? d : '')
export const fmtShort = fmt
export const monthTitle = (ym: string) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
export function countdown(deadline: string, today: string) {
  const n = diffDays(deadline, today)
  return n === 0 ? 'Today' : n > 0 ? `${n}d` : 'Closed'
}

// ---------- timezones ----------
/** Hours from UTC for the zone names deadline sources use: "AoE", "UTC-12", "UTC+8", "UTC". null if unknown. */
const NAMED_ZONES: Record<string, string> = {
  PT: 'America/Los_Angeles', ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver',
  CET: 'Europe/Paris', CEST: 'Europe/Paris', BST: 'Europe/London', JST: 'Asia/Tokyo', KST: 'Asia/Seoul',
}
const FIXED_ZONES: Record<string, number> = { AOE: -12, PST: -8, PDT: -7, MST: -7, MDT: -6, EST: -5, EDT: -4, HST: -10 }

/**
 * Hours from UTC for the zone names deadline sources use: "AoE", "UTC-12", "UTC+8", "PT", "EST"…
 * Zones with daylight saving (PT, ET…) depend on the date, so it has to be passed. null if unknown.
 */
export function tzOffset(tz: string, date: string): number | null {
  const t = tz.trim().toUpperCase()
  if (t in FIXED_ZONES) return FIXED_ZONES[t]
  const m = t.match(/^(?:UTC|GMT)\s*([+-]\d{1,2})?$/)
  if (m) return Number(m[1] ?? 0)
  const zone = NAMED_ZONES[t]
  if (!zone || !isDate(date)) return null
  // Ask the browser what that zone's offset is on that day, e.g. "GMT-8" in winter and "GMT-7" in summer.
  const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(date + 'T12:00:00Z'))
    .find((p) => p.type === 'timeZoneName')?.value
  const off = part?.match(/GMT([+-]\d{1,2})?/)
  return off ? Number(off[1] ?? 0) : null
}
/** A deadline given as date + time in some zone, expressed in Korean time: "2026-11-18 20:59". */
export function toKST(date: string, time: string, tz: string): string {
  const off = tzOffset(tz, date)
  if (off === null || !isDate(date) || !/^\d{2}:\d{2}$/.test(time)) return ''
  const ms = Date.parse(`${date}T${time}:00Z`) - off * 3600000 + 9 * 3600000
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

const HOUR = 3600000
/**
 * The exact moment a deadline closes. With a stated time and zone that is used; otherwise the deadline is
 * taken as 23:59 Anywhere on Earth — the usual convention and the latest it can be, so a deadline is never
 * shown as closed while it might still be open.
 */
export function closesAt(date: string, time?: string, tz?: string): { at: number; exact: boolean } {
  const off = time && tz && /^\d{2}:\d{2}$/.test(time) ? tzOffset(tz, date) : null
  return off === null
    ? { at: Date.parse(`${date}T23:59:00Z`) + 12 * HOUR, exact: false }
    : { at: Date.parse(`${date}T${time}:00Z`) - off * HOUR, exact: true }
}
/** "Closed", hours once less than a day is left ("18h"), otherwise whole days ("12d"). */
export function timeLeft(at: number, now: number): { text: string; tone: 'closed' | 'urgent' | 'hot' | 'warm' | 'calm' } {
  const ms = at - now
  if (ms <= 0) return { text: 'Closed', tone: 'closed' }
  const hours = ms / HOUR
  if (hours < 24) return { text: `${Math.max(1, Math.floor(hours))}h`, tone: 'urgent' }
  const days = Math.floor(hours / 24)
  return { text: `${days}d`, tone: days <= 7 ? 'hot' : days <= 30 ? 'warm' : 'calm' }
}

/** First day of a conference from free text such as "June 13-19, 2027" or "May 31 and June 2-4, 2026". */
export function eventStart(text: string): string {
  const m = text.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})/)
  const y = text.match(/20\d\d/)
  const month = m ? MONTHS.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase()) : -1
  if (!m || !y || month < 0) return ''
  return `${y[0]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

// ---------- labels ----------
/** "2/4" → "R2/4". Anything else is a named track ("Short Paper") and is shown as written. */
export const roundTag = (round: string) => (/^\d+\/\d+$/.test(round) ? `R${round}` : round)
export const rowLabel = (r: { conf: Conf; round: string }) => r.conf.acronym + (r.round ? ` ${roundTag(r.round)}` : '')
/** Timeline entries that are a separate track rather than another round of the main one. */
const SIDE_TRACK = /short|poster|workshop|demo|industr|tutorial|doctoral|journal|tool|artifact|commitment|optional abstract/i
export const STATUS_LABEL: Record<Row['status'], string> = { verified: 'Verified', auto: 'Auto', estimated: 'Estimated' }
export const PAPER_STATUS: { key: PaperStatus; label: string }[] = [
  { key: 'research', label: 'Researching' },
  { key: 'writing', label: 'Writing' },
  { key: 'submitted', label: 'Under review' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
]
export const paperStatusLabel = (s: PaperStatus) => PAPER_STATUS.find((x) => x.key === s)!.label
/** A paper is "researching" until it has a venue, and "in progress" once it does. Later stages are set by hand. */
export function settleStatus(p: Paper): Paper {
  if (p.status === 'research' && p.target) return { ...p, status: 'writing' }
  if (p.status === 'writing' && !p.target) return { ...p, status: 'research' }
  return p
}

// ---------- activity log ----------
const changed = <T extends object>(a: T, b: T, keys: (keyof T)[]) => keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
const arrow = (a: unknown, b: unknown) => `${a || '–'} → ${b || '–'}`

/** One human-readable line for a save or delete, or '' when nothing worth recording changed. */
export function describeChange(coll: Coll, prev: unknown, next: unknown, data: Data): string {
  const acr = (confId: string) => data.conferences.find((c) => c.id === confId)?.acronym ?? confId
  if (coll === 'deadlines') {
    const a = prev as Deadline | undefined, b = next as Deadline | undefined
    const d = (b ?? a)!
    const label = `${acr(d.confId)}${d.round ? ` ${roundTag(d.round)}` : ''} ${d.year}`
    if (!b) return `Deleted ${label} deadline (${a!.deadline})`
    if (!a) return `${b.status === 'verified' ? 'Verified' : 'Added'} ${label}: deadline ${b.deadline}`
    const keys = changed(a, b, ['abstract', 'deadline', 'noti', 'event', 'location', 'url', 'round', 'year', 'note'])
    const parts = keys.map((k) => `${k === 'noti' ? 'notification' : k} ${arrow(a[k], b[k])}`)
    if (parts.length) return `Changed ${label}: ${parts.join(', ')}`
    return b.checkedAt !== a.checkedAt || b.status !== a.status ? `Verified ${label} (deadline ${b.deadline})` : ''
  }
  if (coll === 'papers') {
    const a = prev as Paper | undefined, b = next as Paper | undefined
    const title = (b ?? a)!.title
    if (!b) return `Deleted paper "${title}"`
    if (!a) return `Added paper "${title}"${b.target ? ` targeting ${b.target.label}` : ''}`
    const parts: string[] = []
    if (a.status !== b.status) parts.push(`status ${arrow(paperStatusLabel(a.status), paperStatusLabel(b.status))}`)
    if (a.target?.label !== b.target?.label || a.target?.deadline !== b.target?.deadline) parts.push(`target ${arrow(a.target?.label, b.target?.label)}`)
    const other = changed(a, b, ['title', 'group', 'members', 'start', 'note', 'links']).map((k) => (k === 'group' ? 'topic' : k === 'members' ? 'people' : k))
    if (other.length) parts.push(`edited ${other.join(', ')}`)
    return parts.length ? `"${title}": ${parts.join('; ')}` : ''
  }
  if (coll === 'conferences') {
    const a = prev as Conf | undefined, b = next as Conf | undefined
    if (!b) return `Stopped tracking ${a!.acronym}`
    if (!a) return `Started tracking ${b.acronym}`
    const keys = changed(a, b, ['acronym', 'name', 'area', 'kiise', 'bk', 'blind', 'owner', 'ccfddl'])
    return keys.length ? `Changed ${b.acronym}: ${keys.map((k) => `${k} ${arrow(a[k], b[k])}`).join(', ')}` : ''
  }
  if (coll === 'members') {
    const a = prev as Member | undefined, b = next as Member | undefined
    if (!b) return `Removed member ${a!.name}`
    if (!a) return `Added member ${b.name}${b.role ? ` (${b.role})` : ''}`
    const keys = changed(a, b, ['name', 'role', 'email'])
    return keys.length ? `Changed member ${a.name}: ${keys.map((k) => `${k} ${arrow(a[k], b[k])}`).join(', ')}` : ''
  }
  return ''
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

// ---------- people ----------
export const roleRank = (role: string) => {
  const i = ROLES.indexOf(role as (typeof ROLES)[number])
  return i < 0 ? ROLES.length : i
}
export const sortMembers = (ms: Member[]) => [...ms].sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name))
/** A paper's links, including the single link older data stored. */
export const paperLinks = (p: Paper): string[] => p.links ?? (p.link ? [p.link] : [])

/** Stable hue per name so a person keeps the same avatar colour everywhere. */
export function hue(name: string) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}
/** Korean names read better as the given name (last two syllables); Latin names as initials. */
export function initials(name: string) {
  const n = name.trim()
  if (/[가-힣]/.test(n)) return n.length > 2 ? n.slice(-2) : n
  return n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

// ---------- places ----------
const COUNTRY: Record<string, string> = {
  usa: 'US', us: 'US', 'united states': 'US', uk: 'GB', 'united kingdom': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  italy: 'IT', netherlands: 'NL', 'south korea': 'KR', korea: 'KR', france: 'FR', germany: 'DE', australia: 'AU', au: 'AU',
  singapore: 'SG', greece: 'GR', czechia: 'CZ', 'czech republic': 'CZ', belgium: 'BE', canada: 'CA', japan: 'JP', hungary: 'HU',
  china: 'CN', denmark: 'DK', ireland: 'IE', india: 'IN', poland: 'PL', morocco: 'MA', vietnam: 'VN', macau: 'MO', macao: 'MO',
  'new zealand': 'NZ', sweden: 'SE', 'hong kong': 'HK', spain: 'ES', portugal: 'PT', austria: 'AT', switzerland: 'CH',
  brazil: 'BR', mexico: 'MX', taiwan: 'TW', thailand: 'TH', uae: 'AE', 'united arab emirates': 'AE', turkey: 'TR', 'türkiye': 'TR',
  norway: 'NO', finland: 'FI', israel: 'IL', chile: 'CL', argentina: 'AR', malaysia: 'MY', indonesia: 'ID', 'south africa': 'ZA',
  egypt: 'EG', croatia: 'HR', cyprus: 'CY', malta: 'MT', luxembourg: 'LU', romania: 'RO', estonia: 'EE', slovenia: 'SI',
  'saudi arabia': 'SA', qatar: 'QA', philippines: 'PH', colombia: 'CO', peru: 'PE', iceland: 'IS', bulgaria: 'BG', serbia: 'RS',
}
const US_STATES =
  'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ')
const US_STATE_NAMES = /\b(california|texas|georgia|massachusetts|colorado|washington|florida|hawaii|utah|virginia|new york|illinois|ohio|oregon|arizona|nevada|pennsylvania|michigan|minnesota|maryland|louisiana|tennessee|north carolina)\b/i

/** Flag emoji for a free-text location, or '' when the country can't be told. */
export function flagOf(location: string): string {
  if (!location) return ''
  if (/virtual|online/i.test(location)) return '🌐'
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
  let code = ''
  for (let i = parts.length - 1; i >= 0 && !code; i--) {
    const p = parts[i]
    code = COUNTRY[p.toLowerCase().replace(/\s+sar$/, '')] ?? (US_STATES.includes(p) ? 'US' : '')
  }
  if (!code) {
    const lower = location.toLowerCase()
    code = Object.entries(COUNTRY).find(([name]) => name.length > 3 && lower.includes(name))?.[1] ?? (US_STATE_NAMES.test(location) ? 'US' : '')
  }
  return code ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : ''
}

// ---------- merging collected data into rows ----------
export const autoSig = (a: Round) => [a.abstract, a.deadline, a.noti].join('|')
const MATCH_WINDOW = 21 // days: a collected round and a stored row this close are the same round
const STALE_DAYS = 45
const MAX_SITE_ROUNDS = 2 // a page yielding more "rounds" than this was almost certainly misread

interface Collected {
  year: number
  link: string
  place: string
  date: string
  rounds: (Round & { sources: string[]; evidence: string[]; tz: string })[]
}

/**
 * One list of editions per conference from both collectors.
 * ccfddl (hand-curated, ~90% exact against our verified dates) is the primary source; the site crawler
 * fills editions ccfddl doesn't have yet and acts as a second opinion on the ones it does.
 */
export function collected(conf: Conf, auto: AutoData): Collected[] {
  const ccf = (conf.ccfddl && auto.ccfddl[conf.ccfddl]?.editions) || []
  const crawl = auto.crawl?.[conf.id] ?? []
  const years = [...new Set([...ccf.map((e) => e.year), ...crawl.map((e) => e.year)])].sort()
  const out: Collected[] = []
  for (const year of years) {
    const c = ccf.find((e) => e.year === year)
    const s = crawl.find((e) => e.year === year)
    const cRounds = (c?.rounds ?? []).filter((r) => isDate(r.deadline))
    const sRounds = (s?.rounds ?? []).filter((r) => isDate(r.deadline))
    if (cRounds.length) {
      out.push({
        year,
        link: c!.link || s?.url || '',
        place: c!.place,
        date: c!.date,
        rounds: cRounds.map((r) => {
          const same = sRounds.find((x) => x.deadline === r.deadline)
          return { ...r, noti: r.noti || same?.noti || '', sources: same ? ['ccfddl', 'site'] : ['ccfddl'], evidence: same ? s!.evidence : [], tz: c!.timezone ?? '' }
        }),
      })
    } else if (sRounds.length && sRounds.length <= MAX_SITE_ROUNDS) {
      out.push({ year, link: s!.url, place: '', date: '', rounds: sRounds.map((r) => ({ ...r, sources: ['site'], evidence: s!.evidence, tz: '' })) })
    }
  }
  return out
}

/** Round label for the i-th collected entry: side tracks keep their own name and don't count as rounds. */
function roundOf(rounds: Round[], i: number): string {
  const comment = (rounds[i].comment ?? '').trim()
  if (SIDE_TRACK.test(comment)) return comment.length > 22 ? comment.slice(0, 21).trimEnd() + '…' : comment
  const main = rounds.filter((r) => !SIDE_TRACK.test(r.comment ?? ''))
  return main.length > 1 ? `${main.indexOf(rounds[i]) + 1}/${main.length}` : ''
}

/** Stored deadlines + collected data + last-year estimates → rows for display. */
export function buildRows(confs: Conf[], deadlines: Deadline[], auto: AutoData | null, today: string): Row[] {
  const confById = new Map(confs.map((c) => [c.id, c]))
  const rows: Row[] = []
  for (const d of deadlines) {
    const conf = confById.get(d.confId)
    if (conf) rows.push({ ...d, conf, virtual: false, at: 0, exact: false })
  }

  // 1) collected values
  if (auto) {
    for (const conf of confs) {
      const mine = rows.filter((r) => r.confId === conf.id)
      for (const ed of collected(conf, auto)) {
        ed.rounds.forEach((a, i) => {
          const round = roundOf(ed.rounds, i)
          const source = a.sources[0]
          let best: Row | undefined
          for (const r of mine) {
            const gap = Math.abs(diffDays(r.deadline, a.deadline))
            if (gap <= MATCH_WINDOW && (!best || gap < Math.abs(diffDays(best.deadline, a.deadline)))) best = r
          }
          if (best && best.status === 'verified') {
            // Past deadlines aren't worth an alert. Notification dates aren't compared: sources differ on
            // whether they mean the first-round or the final decision.
            const upcoming = best.deadline >= today || a.deadline >= today
            const differs = best.deadline !== a.deadline || (!!a.abstract && best.abstract !== a.abstract)
            if (upcoming && differs && best.autoSig !== autoSig(a)) best.autoDiff = { ...a, link: ed.link, source }
            best.sources = a.sources
            best.evidence = a.evidence
            if (best.deadline === a.deadline) Object.assign(best, { time: a.time, tz: a.tz })
          } else if (best) {
            // An estimate from the sheet, and the real dates are now out: show the collected values.
            Object.assign(best, {
              abstract: a.abstract,
              deadline: a.deadline,
              noti: a.noti || best.noti,
              notiEstimated: !a.noti && !!best.noti,
              status: 'auto',
              year: ed.year,
              round: best.round || round,
              url: ed.link || best.url,
              location: ed.place || best.location,
              event: eventStart(ed.date) || best.event,
              source,
              checkedAt: auto.generatedAt.slice(0, 10),
              checkedBy: '',
              sources: a.sources,
              evidence: a.evidence,
              time: a.time,
              tz: a.tz,
            })
          } else if (diffDays(a.deadline, today) > -400) {
            const row: Row = {
              id: `${conf.id}-${a.deadline}`,
              confId: conf.id,
              conf,
              year: ed.year,
              round,
              abstract: a.abstract,
              deadline: a.deadline,
              noti: a.noti,
              event: eventStart(ed.date),
              location: ed.place,
              url: ed.link,
              status: 'auto',
              checkedAt: auto.generatedAt.slice(0, 10),
              checkedBy: '',
              source,
              note: '',
              virtual: true,
              at: 0,
              exact: false,
              sources: a.sources,
              evidence: a.evidence,
              time: a.time,
              tz: a.tz,
            }
            rows.push(row)
            mine.push(row)
          }
        })
      }
    }
  }

  // 2) no dates for the next edition yet → show last year's dates one year on (same calendar date)
  const byConf = new Map<string, Row[]>()
  for (const r of rows) byConf.set(r.confId, [...(byConf.get(r.confId) ?? []), r])
  for (const list of byConf.values()) {
    for (const r of [...list]) {
      if (r.deadline >= today || r.status === 'estimated') continue
      const hasNext = list.some((o) => {
        const gap = diffDays(o.deadline, r.deadline)
        return gap > 300 && gap < 430
      })
      if (hasNext) continue
      // Usually one year ahead; if a conference has gone more than a year with no news, keep projecting
      // (up to three years) rather than letting it drop off the list.
      let years = 1
      while (years < 3 && addYears(r.deadline, years) < today) years++
      const shift = (d: string) => (d ? addYears(d, years) : '')
      const dl = shift(r.deadline)
      if (dl < today) continue
      if (list.some((o) => Math.abs(diffDays(o.deadline, dl)) < 60)) continue // something real or projected is already there
      const est: Row = {
        ...r,
        id: `${r.confId}-${dl}`,
        year: r.year + years,
        abstract: shift(r.abstract),
        deadline: dl,
        noti: shift(r.noti),
        event: shift(r.event),
        location: '',
        status: 'estimated',
        notiEstimated: false,
        checkedAt: '',
        checkedBy: '',
        source: 'estimate',
        note: '',
        virtual: true,
        derivedFrom: r.deadline,
        autoDiff: undefined,
        autoSig: undefined,
        sources: undefined,
        evidence: undefined,
        time: undefined,
        tz: undefined,
      }
      rows.push(est)
      list.push(est)
    }
  }
  for (const r of rows) Object.assign(r, closesAt(r.deadline, r.time, r.tz))
  return rows.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.conf.acronym.localeCompare(b.conf.acronym))
}

/**
 * Stored deadlines that no longer serve a purpose: closed more than a year ago AND superseded by a newer
 * stored deadline of the same conference. The most recent closed edition is always kept, because next
 * year's estimate is projected from it.
 */
export function obsoleteDeadlines(deadlines: Deadline[], today: string): Deadline[] {
  const cutoff = addYears(today, -1)
  return deadlines.filter((d) => d.deadline < cutoff && deadlines.some((o) => o.confId === d.confId && diffDays(o.deadline, d.deadline) > 300))
}

export const isStale = (r: Row, today: string) =>
  r.status === 'verified' && r.deadline >= today && (!r.checkedAt || diffDays(today, r.checkedAt) > STALE_DAYS)

/** Next year's site exists but we have no dates for that edition yet. */
export function newSites(confs: Conf[], deadlines: Deadline[], auto: AutoData | null) {
  if (!auto?.crawl) return []
  const maxYear = new Map<string, number>()
  for (const d of deadlines) maxYear.set(d.confId, Math.max(maxYear.get(d.confId) ?? 0, d.year))
  return confs.flatMap((conf) =>
    (auto.crawl[conf.id] ?? []).filter((e) => e.firstSeen && e.year > (maxYear.get(conf.id) ?? 0)).map((site) => ({ conf, site })),
  )
}
