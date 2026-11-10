import { addDays, rowLabel } from './logic'
import type { Member, Paper, PaperHistory, PaperTarget, Row } from './types'

export const DEMO_PREFIX = 'demo-'

/**
 * Sample papers covering every status, built from the real deadlines so dates line up with the other pages.
 * Ids start with "demo-" so they can be removed again without touching real data.
 */
export function demoPapers(rows: Row[], members: Member[], today: string): Paper[] {
  const target = (r: Row): PaperTarget => ({ confId: r.confId, label: rowLabel(r), deadline: r.deadline, noti: r.noti })
  const used = new Set<string>()
  const pick = (ok: (r: Row) => boolean, prefer: string[] = []) => {
    const pool = rows.filter((r) => ok(r) && !used.has(r.confId))
    const r = prefer.map((id) => pool.find((x) => x.confId === id)).find(Boolean) ?? pool[0]
    if (r) used.add(r.confId)
    return r
  }
  const upcoming = (min: number, max: number) => (r: Row) => r.deadline >= addDays(today, min) && r.deadline <= addDays(today, max)
  const inReview = (r: Row) => r.deadline < today && !!r.noti && r.noti > today
  const decided = (r: Row) => !!r.noti && r.noti < today && r.noti > addDays(today, -150)
  const past = (r: Row, h: 'accepted' | 'rejected'): PaperHistory => ({ label: rowLabel(r), deadline: r.deadline, result: h, date: r.noti || r.deadline })

  const students = members.filter((m) => m.role !== 'Professor').map((m) => m.name)
  const prof = members.find((m) => m.role === 'Professor')?.name
  const who = (i: number, withProf = false) => [students[i % Math.max(1, students.length)], ...(withProf && prof ? [prof] : [])].filter(Boolean) as string[]

  const soon = pick(upcoming(10, 60), ['mobisys', 'osdi', 'dsn'])
  const later = pick(upcoming(60, 150), ['ndss', 'sigmod', 'nsdi'])
  const far = pick(upcoming(150, 260), ['sosp', 'ccs', 'eurosys'])
  const review1 = pick(inReview, ['conext', 'eurosys', 'asplos'])
  const review2 = pick(inReview, ['fast', 'nsdi', 'www'])
  const won = pick(decided, ['socc', 'sigmetrics', 'ccs'])
  const lost = pick(decided, ['usenix-security', 'ndss', 'imc'])
  const lostEarlier = pick((r) => !!r.noti && r.noti < addDays(today, -60) && r.deadline > addDays(today, -330), ['snp', 'sosp', 'sigmod'])

  const papers: (Omit<Paper, 'id' | 'note' | 'link'> & { note?: string })[] = [
    { title: 'LLM-seccomp', group: 'Container security', members: who(0, true), start: addDays(today, -95), status: 'writing', target: soon ? target(soon) : null, history: [], note: 'Evaluation section still missing the Firecracker baseline.' },
    {
      title: 'Namespace escape audit', group: 'Container security', members: who(1), start: addDays(today, -300), status: 'writing', target: later ? target(later) : null,
      history: [lostEarlier && past(lostEarlier, 'rejected'), lost && past(lost, 'rejected')].filter(Boolean) as PaperHistory[],
      note: 'Third attempt. Reviewers asked for a larger corpus both times.',
    },
    { title: 'eBPF database tracing', group: 'Systems performance', members: [...who(2), ...who(0)].filter((v, i, a) => a.indexOf(v) === i), start: addDays(today, -30), status: 'writing', target: far ? target(far) : null, history: [] },
    { title: 'LogNER', group: 'Systems performance', members: who(2), start: addDays(today, -20), status: 'research', target: null, history: [], note: 'Need to decide between a systems venue and an NLP one.' },
    { title: 'MicroVM for IoT gateways', group: 'IoT', members: who(1, true), start: addDays(today, -210), status: 'submitted', target: review1 ? target(review1) : null, history: [] },
    { title: 'Web crawling at the edge', group: 'IoT', members: who(0), start: addDays(today, -160), status: 'submitted', target: review2 ? target(review2) : null, history: [] },
    { title: 'Sandbox policy synthesis', group: 'Container security', members: who(2, true), start: addDays(today, -260), status: 'accepted', target: won ? target(won) : null, history: won ? [past(won, 'accepted')] : [] },
    { title: 'Sensor firmware diffing', group: 'IoT', members: who(1), start: addDays(today, -240), status: 'rejected', target: lost ? target(lost) : null, history: lost ? [past(lost, 'rejected')] : [], note: 'Just came back. Pick the next venue.' },
  ]
  return papers.map((p, i) => ({ note: '', link: '', ...p, id: `${DEMO_PREFIX}${i + 1}` }))
}
