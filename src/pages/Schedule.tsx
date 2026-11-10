import { Fragment, useMemo, useState } from 'react'
import { addDays, countdown, diffDays, fmt, roundTag, sortMembers } from '../logic'
import { useStore } from '../store'
import type { Paper, Row } from '../types'
import { AreaTag, Avatar, Avatars, Clock, ConfDrawer, ConfModal, Countdown, Icon, PaperModal, Place, Rank, StatusBadge, TargetModal } from '../ui'
import { isStale } from '../logic'

const COLS = 10
const PAST_DAYS = 365 // "Show past" goes back one year; older rows stay in the data but off the table

export default function Schedule() {
  const { rows, data, today } = useStore()
  const [q, setQ] = useState('')
  const [area, setArea] = useState('')
  const [rank, setRank] = useState('')
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState('')
  const [past, setPast] = useState(false)
  const [onlyTarget, setOnlyTarget] = useState(false)
  const [open, setOpen] = useState<Row | null>(null)
  const [addConf, setAddConf] = useState(false)
  const [paper, setPaper] = useState<Paper | null>(null)
  const [pick, setPick] = useState<Row | null>(null)

  // Papers being written for, or under review at, each deadline.
  const targets = useMemo(() => {
    const m = new Map<string, Paper[]>()
    for (const p of data.papers) {
      if (!p.target || (p.status !== 'writing' && p.status !== 'submitted')) continue
      const k = `${p.target.confId}|${p.target.deadline}`
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return m
  }, [data.papers])
  const areas = useMemo(() => [...new Set(data.conferences.map((c) => c.area).filter(Boolean))].sort(), [data.conferences])

  const shown = rows.filter((r) => {
    const c = r.conf
    const tg = targets.get(`${r.confId}|${r.deadline}`)
    // A closed deadline stays visible while one of our papers is still under review there.
    const reviewing = tg?.some((p) => p.status === 'submitted')
    if (r.deadline < today && !reviewing && (!past || r.deadline < addDays(today, -PAST_DAYS))) return false
    if (area && c.area !== area) return false
    if (rank === 'S' && c.kiise !== 'S') return false
    if (rank === 'SA' && !c.kiise) return false
    if (rank === 'BK3' && (c.bk ?? 0) < 3) return false
    if (owner && c.owner !== owner) return false
    if (status && r.status !== status) return false
    if (onlyTarget && !tg) return false
    if (q && !`${c.acronym} ${c.name} ${r.location}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  // What's coming up for our own papers: the next submissions due and the next results expected.
  const upNext = data.papers
    .flatMap((p) => {
      if (!p.target) return []
      if (p.status === 'writing' && p.target.deadline >= today) return [{ p, kind: 'Due', date: p.target.deadline }]
      if (p.status === 'submitted' && p.target.noti && p.target.noti >= today) return [{ p, kind: 'Result', date: p.target.noti }]
      return []
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  const firstFuture = shown.findIndex((r) => r.deadline >= today)
  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Deadlines</h1>
          <p className="muted">{data.conferences.length} conferences tracked · dates refresh every morning from ccfddl and conference sites</p>
        </div>
        <button className="primary" onClick={() => setAddConf(true)}><Icon name="plus" size={14} /> Track a conference</button>
      </header>

      <div className="upnext">
        <Clock />
        {upNext.length > 0 && (
          <div className="up-cards">
            {upNext.map(({ p, kind, date }) => {
              const left = diffDays(date, today)
              return (
                <button key={p.id + kind} className={'up ' + (kind === 'Result' ? 'is-result' : left <= 14 ? 'hot' : '')} onClick={() => setPaper(p)}>
                  <span className="up-kind">{kind === 'Due' ? 'Submission due' : 'Result expected'}</span>
                  <span className="up-main"><b>{countdown(date, today)}</b> {p.target!.label}</span>
                  <span className="up-sub"><Avatars names={p.members} /> <span>{p.title}</span> <small className="muted">{date}</small></span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="filters">
        <input type="search" placeholder="Search conference or city" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area">
          <option value="">All areas</option>{areas.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select value={rank} onChange={(e) => setRank(e.target.value)} aria-label="Rank">
          <option value="">Any rank</option>
          <option value="S">KIISE S</option>
          <option value="SA">KIISE S or A</option>
          <option value="BK3">BK21 IF 3+</option>
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
          <option value="">Any owner</option>{sortMembers(data.members).map((m) => <option key={m.id}>{m.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          <option value="verified">Verified</option>
          <option value="auto">Auto</option>
          <option value="estimated">Estimated</option>
        </select>
        <button className={'toggle' + (onlyTarget ? ' on' : '')} onClick={() => setOnlyTarget(!onlyTarget)} aria-pressed={onlyTarget}>Our targets</button>
        <button className={'toggle' + (past ? ' on' : '')} onClick={() => setPast(!past)} aria-pressed={past} title="Also show deadlines from the last 12 months">Show past year</button>
        <span className="grow" />
        <span className="legend"><i className="sw targeted" /> Targeted <i className="sw reviewing" /> Under review</span>
        <span className="muted">{shown.length} deadlines</span>
      </div>

      <div className="card tablewrap">
        <table className="sched">
          <thead>
            <tr>
              <th title="KIISE rank (S, A) and BK21 IF (1–4, 4 is highest)">Rank</th>
              <th>Conference</th>
              <th className="c">Abstract</th>
              <th className="c">Deadline</th>
              <th className="c">Left</th>
              <th className="c">Notification</th>
              <th className="c" title="Days from submission to notification">Review</th>
              <th>Location</th>
              <th title="Who keeps this conference's dates correct, and how far the dates can be trusted">Owner · Status</th>
              <th>Targeting</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const tg = targets.get(`${r.confId}|${r.deadline}`) ?? []
              const est = r.status === 'estimated' ? ' est' : ''
              const tone = tg.some((p) => p.status === 'submitted') ? 'reviewing' : tg.length ? 'targeted' : ''
              return (
                <Fragment key={r.id}>
                  {i === firstFuture && i > 0 && (
                    <tr className="todayrow">
                      <td colSpan={COLS}><span>Today · {today}</span></td>
                    </tr>
                  )}
                  <tr className={[tone, r.deadline < today ? 'past' : ''].join(' ')} onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r)}>
                    <td><Rank conf={r.conf} /></td>
                    <td className="conf">
                      <div className="conf-top">
                        <b>{r.conf.acronym}</b>
                        {r.round && <span className="round">{roundTag(r.round)}</span>}
                        <AreaTag area={r.conf.area} />
                      </div>
                      <div className="conf-name" title={r.conf.name}>{r.conf.name}</div>
                    </td>
                    <td className={'date c' + est}>{fmt(r.abstract) || <span className="faint">–</span>}</td>
                    <td className={'date strong c' + est}>{fmt(r.deadline)}</td>
                    <td className="c"><Countdown deadline={r.deadline} today={today} /></td>
                    <td className={'date c emph' + (est || r.notiEstimated ? ' est' : '')}
                      title={r.noti && (est || r.notiEstimated) ? 'Estimated: the notification date has not been announced, so this is projected from the previous edition' : undefined}>{fmt(r.noti) || <span className="faint">TBD</span>}</td>
                    <td className="date c emph days">{r.noti ? `${diffDays(r.noti, r.deadline)}d` : <span className="faint">–</span>}</td>
                    <td className="two-line">
                      <Place location={r.location} />
                      <small>Starts {fmt(r.event) || 'TBD'}</small>
                    </td>
                    <td>
                      <span className="owner-status"><Avatar name={r.conf.owner} size={20} /> <StatusBadge row={r} /></span>
                      {r.autoDiff && <span className="tag warn" title={`Collected value: ${fmt(r.autoDiff.deadline)}`}>Changed</span>}
                      {isStale(r, today) && <span className="tag" title={`Last checked ${fmt(r.checkedAt) || 'never'}`}>Re-check</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className="targeting">
                        {tg.map((p) => (
                          <button key={p.id} className="paper-chip" onClick={() => setPaper(p)} title={`${p.title} — ${p.members.join(', ')}`}>
                            <Avatars names={p.members} /> {p.title}
                          </button>
                        ))}
                        {r.deadline >= today && (
                          <button className="ghost add" title="Target this deadline with one of our papers" onClick={() => setPick(r)}><Icon name="plus" size={14} /></button>
                        )}
                      </span>
                    </td>
                  </tr>
                </Fragment>
              )
            })}
            {shown.length === 0 && <tr><td colSpan={COLS} className="empty">No deadlines match these filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <ConfDrawer row={open} onClose={() => setOpen(null)} />}
      {addConf && <ConfModal conf={null} onClose={() => setAddConf(false)} />}
      {pick && <TargetModal row={pick} onClose={() => setPick(null)} />}
      {paper && <PaperModal paper={paper} isNew={!data.papers.some((p) => p.id === paper.id)} onClose={() => setPaper(null)} />}
    </section>
  )
}
