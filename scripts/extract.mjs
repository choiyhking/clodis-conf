// Turn a conference web page into submission rounds (abstract / deadline / notification).
// Pure functions, no network: used by update.mjs and easy to test on saved HTML.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?'
const DATE_PATTERNS = [
  // November 27, 2026 · Nov 27th 2026 · November 27-28, 2026
  { re: new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–]\\s*\\d{1,2})?\\s*,?\\s+(20\\d\\d)`, 'gi'), pick: (m) => [m[3], MONTHS[m[1].toLowerCase()], m[2]] },
  // 27 November 2026
  { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\s*,?\\s+(20\\d\\d)`, 'gi'), pick: (m) => [m[3], MONTHS[m[2].toLowerCase()], m[1]] },
  // 2026-11-27 · 2026/11/27
  { re: /\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b/g, pick: (m) => [m[1], m[2], m[3]] },
]

const iso = (y, m, d) => {
  const mm = Number(m), dd = Number(d)
  if (!(mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) return ''
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

/** All dates in a line, in reading order. */
export function findDates(line) {
  const found = []
  for (const { re, pick } of DATE_PATTERNS) {
    for (const m of line.matchAll(re)) {
      const d = iso(...pick(m))
      if (d) found.push({ at: m.index, date: d })
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.date)
}

/** HTML → text lines. Table rows stay on one line so "label | date" pairs survive; struck-out (superseded) dates are dropped. */
export function htmlToLines(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(s|del|strike)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*text-decoration:\s*line-through[^>]*>[\s\S]*?<\/[a-z0-9]+>/gi, ' ')
    .replace(/<\/(p|li|tr|div|h\d|dd|section|ul|ol|table)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/~~[^~]{1,60}~~/g, ' ')
    .replace(/&nbsp;|&#160;|&ensp;|&emsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ndash;|&mdash;|&#8211;|&#8212;/g, '-')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 8 && l.length <= 260)
}

const SKIP = /camera|artifact|workshop|tutorial|poster|demo\b|doctoral|student research|early.?bird|hotel|visa|rebuttal|author response|response period|revis|\bfinal\b|shepherd|proposal|panel|industry|journal.first|video|supplement|early reject|desk reject|conference dates?|main conference|registration (deadline|opens)|bidding|nomination|\bopens?\b|reviews? (due|released)|presentation|will be held|accepted (for|to|papers)|rolled over|feedback|review deadline|notification of (paper )?registration/i

/** 'abstract' | 'deadline' | 'noti' | null */
export function classify(line) {
  const l = line.toLowerCase()
  if (/abstract|paper registration/.test(l) && !/camera|workshop|poster|tutorial/.test(l)) return 'abstract'
  if (SKIP.test(l)) return null
  if (/notif|decision|acceptance/.test(l)) return 'noti'
  if (/submission|submit|deadline|\bdue\b/.test(l)) return 'deadline'
  return null
}

const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000

/**
 * @param {string} html
 * @param {number} year conference edition year; used to throw away dates from other editions
 * @returns {{ rounds: {abstract:string, deadline:string, noti:string}[], evidence: string[] }}
 */
export function extractRounds(html, year) {
  const lo = `${year - 2}-06-01`, hi = `${year}-12-31`
  const got = { abstract: [], deadline: [], noti: [] }
  const evidence = []
  for (const line of htmlToLines(html)) {
    const dates = findDates(line).filter((d) => d >= lo && d <= hi)
    if (!dates.length) continue
    const kind = classify(line)
    if (!kind) continue
    // "Oct 1 (extended to Oct 8)" → the later date is the real one
    const date = /extend/i.test(line) ? dates[dates.length - 1] : dates[0]
    if (!got[kind].includes(date)) got[kind].push(date)
    if (evidence.length < 12 && !evidence.includes(line)) evidence.push(line)
  }
  const deadlines = [...got.deadline].sort()
  const rounds = deadlines.slice(0, 12).map((deadline) => {
    const abs = got.abstract.filter((a) => a <= deadline && days(deadline, a) <= 30).sort().pop() ?? ''
    const noti = got.noti.filter((n) => n > deadline && days(n, deadline) <= 220).sort()[0] ?? ''
    return { abstract: abs === deadline ? '' : abs, deadline, noti }
  })
  // A lone abstract date with no paper deadline is still worth showing as evidence, but not as a round.
  return { rounds, evidence }
}

/** Links on a page that probably lead to the dates (one extra hop when the landing page has none). */
export function findCfpLinks(html, baseUrl) {
  const out = []
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = m[2].replace(/<[^>]+>/g, ' ').toLowerCase()
    if (!/call for (research )?papers|important dates|\bcfp\b|research (track|papers)|submission/.test(text + ' ' + m[1].toLowerCase())) continue
    try {
      const u = new URL(m[1], baseUrl)
      if (u.host === new URL(baseUrl).host && !out.includes(u.href) && !/\.pdf$/i.test(u.pathname)) out.push(u.href)
    } catch {
      /* ignore malformed href */
    }
  }
  return out.slice(0, 3)
}
