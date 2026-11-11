import { addDays, rowLabel } from './logic'
import type { Deadline, Member, Paper, PaperHistory, PaperTarget, Role, Row } from './types'

export const DEMO_PREFIX = 'demo-'
export const isDemo = (x: { id: string }) => x.id.startsWith(DEMO_PREFIX)

export interface DemoData {
  members: Member[]
  papers: Paper[]
  deadlines: Deadline[]
}

/**
 * Sample data that exercises every feature: extra members in different roles, papers in every status
 * (with links, notes and rejection history), and deadlines in every trust state (freshly verified,
 * due for a re-check, and disagreeing with the collector).
 *
 * Everything is built from the real deadlines so the dates line up across pages, and every id starts
 * with "demo-" so it can all be removed again without touching real data.
 */
export function demoData(rows: Row[], members: Member[], today: string): DemoData {
  const extra: Member[] = [
    { id: `${DEMO_PREFIX}m1`, name: '김하늘', email: '', role: 'Postdoc' },
    { id: `${DEMO_PREFIX}m2`, name: '이서준', email: '', role: 'PhD' },
    { id: `${DEMO_PREFIX}m3`, name: '정다은', email: '', role: 'MS' },
    { id: `${DEMO_PREFIX}m4`, name: '한지호', email: '', role: 'Undergrad' },
  ].filter((m) => !members.some((x) => x.name === m.name)) as Member[]
  const all = [...members, ...extra]

  // ---------- papers ----------
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
  const decided = (r: Row) => !!r.noti && r.noti < today && r.noti > addDays(today, -200)
  /** A decided deadline whose result arrived comfortably before `next` was due: a believable earlier attempt. */
  const before = (next: Row | undefined, prefer: string[] = []) =>
    next ? pick((r) => !!r.noti && r.noti < today && r.noti < addDays(next.deadline, -20) && r.deadline > addDays(next.deadline, -400), prefer) : undefined
  const past = (r: Row | undefined, result: 'accepted' | 'rejected'): PaperHistory[] =>
    r ? [{ label: rowLabel(r), deadline: r.deadline, result, date: r.noti || r.deadline }] : []

  const prof = all.find((m) => m.role === 'Professor')?.name
  const people = all.filter((m) => m.role !== 'Professor').map((m) => m.name)
  const who = (...idx: number[]) => [...new Set(idx.map((i) => people[i % Math.max(1, people.length)]))].filter(Boolean)
  const withProf = (names: string[]) => (prof ? [...names, prof] : names)
  const link = (kind: string, slug: string) => `https://example.com/${kind}/${slug}`

  const soon = pick(upcoming(5, 30), ['mobisys', 'osdi', 'dsn'])
  const month = pick(upcoming(30, 75), ['ndss', 'sigmod', 'nsdi'])
  const quarter = pick(upcoming(75, 150), ['sosp', 'eurosys', 'atc'])
  const far = pick((r) => upcoming(150, 300)(r) && r.status === 'estimated', ['ccs', 'usenix-security', 'socc'])
  const rev1 = pick(inReview, ['eurosys', 'conext', 'asplos'])
  const rev2 = pick(inReview, ['fast', 'nsdi', 'www'])
  const rev3 = pick(inReview, ['sigmetrics', 'icde', 'infocom'])
  const won1 = pick(decided, ['socc', 'ccs', 'imc'])
  const won2 = pick(decided, ['icdcs', 'middleware', 'cluster'])
  const lost1 = pick(decided, ['usenix-security', 'ndss', 'sensys'])
  const lost2 = pick(decided, ['sc', 'hpdc', 'icpp'])
  const auditTry2 = before(month, ['usenix-security', 'ccs', 'ndss']) // Namespace escape audit: second rejection
  const auditTry1 = before(auditTry2, ['sosp', 'snp', 'osdi']) // …and the first
  const crawlTry = before(rev2, ['eurosys', 'atc', 'sosp'])
  const driftTry = before(won2, ['kdd', 'vldb', 'sigmod'])

  type Draft = Omit<Paper, 'id' | 'link' | 'note' | 'links'> & { note?: string; links?: string[] }
  const drafts: Draft[] = [
    // Researching: no venue yet
    { title: 'LogNER', group: 'Log analysis', members: who(2), start: addDays(today, -25), status: 'research', target: null, history: [],
      note: 'Named-entity recognition on raw system logs. Deciding between a systems venue and an NLP one.', links: [link('overleaf', 'logner')] },
    { title: 'Edge cache placement', group: 'IoT & edge', members: who(4, 6), start: addDays(today, -12), status: 'research', target: null, history: [] },
    { title: 'Cgroup accounting drift', group: 'Resource monitoring', members: withProf(who(5)), start: addDays(today, -60), status: 'research', target: null, history: [],
      note: 'Measurement study. Needs two more clusters before it is a paper.' },

    // In progress: aimed at a deadline
    { title: 'LLM-seccomp', group: 'Container security', members: withProf(who(0)), start: addDays(today, -95), status: 'writing', target: soon ? target(soon) : null, history: [],
      note: 'Evaluation still missing the Firecracker baseline.', links: [link('overleaf', 'llm-seccomp'), link('github', 'llm-seccomp'), link('slides', 'llm-seccomp-labmeeting')] },
    { title: 'Namespace escape audit', group: 'Container security', members: who(1, 3), start: addDays(today, -520), status: 'writing', target: month ? target(month) : null,
      history: [...past(auditTry1, 'rejected'), ...past(auditTry2, 'rejected')], note: 'Third attempt. Reviewers asked for a larger corpus both times.', links: [link('overleaf', 'ns-audit')] },
    { title: 'eBPF database tracing', group: 'Resource monitoring', members: who(2, 0), start: addDays(today, -40), status: 'writing', target: quarter ? target(quarter) : null, history: [] },
    { title: 'Anomaly triage with small LMs', group: 'Log analysis', members: who(4), start: addDays(today, -15), status: 'writing', target: far ? target(far) : null, history: [],
      note: 'Target date is still an estimate from last year.' },

    // Under review
    { title: 'MicroVM for IoT gateways', group: 'IoT & edge', members: withProf(who(1)), start: addDays(today, -230), status: 'submitted', target: rev1 ? target(rev1) : null, history: [], links: [link('overleaf', 'microvm')] },
    { title: 'Web crawling at the edge', group: 'IoT & edge', members: who(0, 6), start: addDays(today, -420), status: 'submitted', target: rev2 ? target(rev2) : null, history: past(crawlTry, 'rejected') },
    { title: 'Burst-aware autoscaling', group: 'Resource monitoring', members: who(3, 5), start: addDays(today, -140), status: 'submitted', target: rev3 ? target(rev3) : null, history: [] },

    // Decided
    { title: 'Sandbox policy synthesis', group: 'Container security', members: withProf(who(2)), start: addDays(today, -280), status: 'accepted', target: won1 ? target(won1) : null, history: past(won1, 'accepted'),
      links: [link('overleaf', 'sandbox-policy'), link('github', 'sandbox-policy')] },
    { title: 'Log template drift', group: 'Log analysis', members: who(3, 4), start: addDays(today, -400), status: 'accepted', target: won2 ? target(won2) : null, history: [...past(driftTry, 'rejected'), ...past(won2, 'accepted')] },
    { title: 'Sensor firmware diffing', group: 'IoT & edge', members: who(1), start: addDays(today, -250), status: 'rejected', target: lost1 ? target(lost1) : null, history: past(lost1, 'rejected'),
      note: 'Just came back. Pick the next venue.' },
    { title: 'GPU sharing fairness', group: 'Resource monitoring', members: who(5, 6), start: addDays(today, -210), status: 'rejected', target: lost2 ? target(lost2) : null, history: past(lost2, 'rejected') },
  ]
  const papers: Paper[] = drafts.map((p, i) => ({ note: '', links: [], ...p, link: '', id: `${DEMO_PREFIX}p${i + 1}` }))

  // ---------- deadlines in each trust state ----------
  // Only collected-but-unsaved rows are used, so removing the samples simply reveals the collected values again.
  const candidates = rows.filter((r) => r.virtual && r.status === 'auto' && r.deadline > addDays(today, 20))
  const owners = (r: Row) => r.conf.owner || people[0] || ''
  const asDoc = (r: Row, patch: Partial<Deadline>): Deadline => ({
    id: `${DEMO_PREFIX}d-${r.id}`, confId: r.confId, year: r.year, round: r.round, abstract: r.abstract, deadline: r.deadline, noti: r.noti,
    event: r.event, location: r.location, url: r.url, status: 'verified', checkedAt: today, checkedBy: owners(r), source: 'manual', note: '', ...patch,
  })
  const deadlines: Deadline[] = [
    ...candidates.slice(0, 3).map((r, i) => asDoc(r, { checkedAt: addDays(today, -1 - i) })), // freshly verified
    ...candidates.slice(3, 6).map((r, i) => asDoc(r, { checkedAt: addDays(today, -60 - i * 9) })), // verified long ago → Re-check
    // verified with the old date, then the collector found a later one → Changed (a deadline extension)
    ...candidates.slice(6, 8).map((r) => asDoc(r, { deadline: addDays(r.deadline, -7), abstract: r.abstract ? addDays(r.abstract, -7) : '', checkedAt: addDays(today, -12) })),
  ]

  return { members: extra, papers, deadlines }
}

/** Members whose role is unset get one, so the sample groups sensibly on the Timeline. */
export function withSampleRoles(members: Member[]): Member[] {
  const fill: Role[] = ['PhD', 'MS']
  return members.map((m, i) => (m.role ? m : { ...m, role: fill[i % 2] }))
}
