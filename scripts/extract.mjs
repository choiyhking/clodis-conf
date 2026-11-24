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

// Lines that carry a date but are not a paper deadline or a result: other tracks, logistics, and sentences
// that merely mention a date ("the site will start accepting submissions on…", "Update September 30: …").
const SKIP_BASE = 'camera|artifact|workshop|tutorial|poster|demo|doctoral|consortium|competition|student research|early.?bird|hotel|visa|rebuttal|author response|response period|revis|shepherd\\w* (deadline|due|ends?)|proposal|panel|industry|industrial|journal.first|video|supplement|desk reject|conference dates?|main conference|registration (deadline|opens)|bidding|nomination|\\bopens?\\b|start(s|ed|ing)? accepting|^update\\b|\\bnotice\\b|^\\[|track cfps?|author registration|travel|\\baward|application|reviews? (due|released)|presentation|will be held|accepted (for|to|papers)|rolled over|feedback|review deadline|notification of (paper )?registration'
const SKIP = new RegExp(SKIP_BASE + '|\\bfinal\\b', 'i')
const SKIP_BUT_FINAL = new RegExp(SKIP_BASE, 'i')
// "Final notification", "Final decisions", "Notification of final decisions": the result that counts.
const FINAL_NOTI = /final\s+(author\s+|paper\s+)?(notification|decision|acceptance|accept)|(notification|decision)s?\s+of\s+final/i
// A first answer that is not the result: early rejects, the first of two rounds of decisions.
const EARLY_NOTI = /early|initial|first[- ]round|phase (1|one)\b|preliminary|interim/i

/** 'abstract' | 'deadline' | 'noti' (the result) | 'noti1' (an earlier, partial answer) | null */
export function classify(line) {
  const l = line.toLowerCase()
  // "Submission of regular papers and SRC research abstracts" is the paper deadline, not an abstract deadline.
  const papersToo = /(regular|full|research) papers? and/.test(l)
  if (/abstract|paper registration/.test(l) && !papersToo && !/camera|workshop|poster|tutorial/.test(l)) return 'abstract'
  if (FINAL_NOTI.test(l) && !SKIP_BUT_FINAL.test(l)) return 'noti'
  if (SKIP.test(l)) return null
  if (/notif|decision|acceptance/.test(l)) return EARLY_NOTI.test(l) ? 'noti1' : 'noti'
  if (/submission|submit|deadline|\bdue\b/.test(l)) return 'deadline'
  return null
}

// A short line without a date is read as a heading. Dates under a heading for another track are not ours.
const SIDE_HEADING = /workshop|tutorial|poster|demo|doctoral|consortium|industr|panel|competition|challenge|student|journal|proposal|artifact|\btools?\b|education|visions?\b|short papers?|fast track|late.breaking|blue sky/i
const MAIN_HEADING = /call for papers|important dates|research|main|technical|\bfull\b|regular|^papers?\b|\bpapers? (and|&|\/)/i
// Pages that list every track in one table ("Fri 2 Oct 2026 | Research Papers | Full paper submission").
const MAIN_ROW = /research (track|papers?)|technical (track|papers?)|main track/i

const days = (a, b) => (Date.parse(a) - Date.parse(b)) / 86400000

/**
 * @param {string} html
 * @param {number} year conference edition year; used to throw away dates from other editions
 * @param {{ acronym?: string, url?: string }} [about] which conference this is, as we list it ("ISSTA (Demo)")
 * @returns {{ rounds: {abstract:string, deadline:string, noti:string}[], evidence: string[] }}
 */
export function extractRounds(html, year, about = {}) {
  const name = (about.acronym ?? '').split(/[ (]/)[0]
  // We list a few side tracks as conferences of their own ("CCS Poster"). For those the side track is the one to read.
  const trackWord = /poster/i.test(about.acronym ?? '') ? 'poster' : /demo/i.test(about.acronym ?? '') ? 'demo' : /short/i.test(about.acronym ?? '') ? 'short' : ''
  const track = trackWord ? new RegExp(trackWord + '[a-z]*', 'gi') : null
  const isTrack = (t) => !!track && new RegExp(trackWord, 'i').test(t)
  // A page shared by several conferences: "Submission deadline for ESOP round 1" is not ours.
  const othersRound = (line) => {
    const m = line.match(/\b([A-Z][A-Za-z]*[A-Z][A-Za-z]*)[- ]round\b/)
    return !!m && !!name && m[1].toLowerCase() !== name.toLowerCase() && !line.toLowerCase().includes(name.toLowerCase())
  }
  const lo = `${year - 2}-06-01`, hi = `${year}-12-31`
  let found = []
  let side = false
  for (const line of htmlToLines(html)) {
    const all = findDates(line)
    if (!all.length && line.length <= 60) {
      side = SIDE_HEADING.test(line) && !MAIN_HEADING.test(line) && !isTrack(line)
      continue
    }
    const dates = all.filter((d) => d >= lo && d <= hi)
    if (!dates.length || side || othersRound(line)) continue
    const kind = classify(track ? line.replace(track, ' ') : line)
    if (!kind) continue
    // "Oct 1 (extended to Oct 8)" → the later date is the real one
    found.push({ kind, line, date: /extend/i.test(line) ? dates[dates.length - 1] : dates[0] })
  }
  // When rows name their track, only the main track's rows count.
  if (track) {
    // Rows that name the track win. A page about another track altogether tells us nothing.
    if (found.some((f) => isTrack(f.line))) found = found.filter((f) => isTrack(f.line))
    else if (!isTrack(about.url ?? '')) found = []
  } else if (found.some((f) => f.kind === 'deadline' && MAIN_ROW.test(f.line))) found = found.filter((f) => MAIN_ROW.test(f.line))

  const got = { abstract: [], deadline: [], noti: [], noti1: [] }
  const evidence = []
  for (const f of found) {
    if (!got[f.kind].includes(f.date)) got[f.kind].push(f.date)
    if (evidence.length < 12 && !evidence.includes(f.line)) evidence.push(f.line)
  }
  const deadlines = [...got.deadline].sort()
  // The result is the final notification. An early one is used only when the page gives nothing else.
  const notis = (got.noti.length ? got.noti : got.noti1).slice().sort()
  // One notification per round, each after its own deadline: they pair up in order. (With rolling rounds
  // the result of round 1 can come after the deadline of round 2, so "the first one after" is not enough.)
  const inOrder = notis.length === deadlines.length && deadlines.every((d, i) => notis[i] > d && days(notis[i], d) <= 330)
  const rounds = deadlines.slice(0, 12).map((deadline, i) => {
    const abs = got.abstract.filter((a) => a <= deadline && days(deadline, a) <= 30).sort().pop() ?? ''
    const noti = inOrder ? notis[i] : notis.filter((n) => n > deadline && days(n, deadline) <= 220)[0] ?? ''
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
