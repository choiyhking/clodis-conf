import { Fragment, useMemo, useState } from 'react'
import { diffDays, fmt, rowTags, sortMembers, venueOf } from '../logic'
import { useStore } from '../store'
import type { Paper, Row } from '../types'
import { AreaTag, Avatar, Avatars, Clock, ConfDrawer, ConfModal, Countdown, Icon, MultiFilter, PaperModal, Place, Rank, StatusBadge, TargetModal, type FilterOption } from '../ui'
import { isStale } from '../logic'

const COLS = 10
const RANK_OPTIONS: FilterOption[] = [
  { group: 'KIISE', value: 'k:S', label: 'KIISE S' },
  { group: 'KIISE', value: 'k:A', label: 'KIISE A' },
  { group: 'KIISE', value: 'k:', label: 'Not on KIISE list' },
  ...[4, 3, 2, 1].map((n) => ({ group: 'BK21', value: `b:${n}`, label: `BK21 IF ${n}` })),
  { group: 'BK21', value: 'b:', label: 'Not on BK21 list' },
]
const STATUS_OPTIONS: FilterOption[] = [
  { value: 'verified', label: 'Verified' },
  { value: 'auto', label: 'Auto' },
  { value: 'estimated', label: 'Estimated' },
]
const PAST_DAYS = 365 // "Show past" goes back one year; older rows stay in the data but off the table

export default function Schedule() {
  const { rows, data, today } = useStore()
  const [q, setQ] = useState('')
  // Each filter holds any number of values; an empty list means that filter is off.
  const [area, setArea] = useState<string[]>([])
  const [rank, setRank] = useState<string[]>([])
  const [owner, setOwner] = useState<string[]>([])
  const [status, setStatus] = useState<string[]>([])
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

  const kiise = rank.filter((v) => v.startsWith('k:')), bk = rank.filter((v) => v.startsWith('b:'))
  const now = Date.now()
  const shown = rows.filter((r) => {
    const c = r.conf
    const tg = targets.get(`${r.confId}|${r.deadline}`)
    // A closed deadline stays visible while one of our papers is still under review there.
    const reviewing = tg?.some((p) => p.status === 'submitted')
    // Closed is judged by the real closing moment, not the date: 17:00 PT on the 11th is still open on the morning of the 12th in Korea.
    const closedFor = (now - r.at) / 86400000
    if (closedFor > 0 && !reviewing && (!past || closedFor > PAST_DAYS)) return false
    if (area.length && !area.includes(c.area)) return false
    // Ticks within KIISE (or within BK21) widen the match; the two lists narrow each other.
    if (kiise.length && !kiise.includes(`k:${c.kiise}`)) return false
    if (bk.length && !bk.includes(`b:${c.bk ?? ''}`)) return false
    if (owner.length && !owner.includes(c.owner)) return false
    if (status.length && !status.includes(r.status)) return false
    if (onlyTarget && !tg) return false
    if (q && !`${c.acronym} ${c.name}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  // Everything currently narrowing the table, as removable chips.
  const without = (list: string[], v: string) => list.filter((x) => x !== v)
  const active: { key: string; label: string; clear: () => void }[] = [
    ...(q ? [{ key: 'q', label: `Search: ${q}`, clear: () => setQ('') }] : []),
    ...area.map((v) => ({ key: `a${v}`, label: v, clear: () => setArea(without(area, v)) })),
    ...rank.map((v) => ({ key: `r${v}`, label: RANK_OPTIONS.find((o) => o.value === v)!.label, clear: () => setRank(without(rank, v)) })),
    ...owner.map((v) => ({ key: `o${v}`, label: v ? `Owner: ${v}` : 'No owner', clear: () => setOwner(without(owner, v)) })),
    ...status.map((v) => ({ key: `s${v}`, label: STATUS_OPTIONS.find((o) => o.value === v)!.label, clear: () => setStatus(without(status, v)) })),
    ...(onlyTarget ? [{ key: 'ours', label: 'Our targets only', clear: () => setOnlyTarget(false) }] : []),
    ...(past ? [{ key: 'past', label: 'Past year shown', clear: () => setPast(false) }] : []),
  ]
  const clearAll = () => { setQ(''); setArea([]); setRank([]); setOwner([]); setStatus([]); setOnlyTarget(false); setPast(false) }

  const firstFuture = shown.findIndex((r) => r.at > now)
  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Deadlines</h1>
          <p className="muted">{data.conferences.length} conferences tracked · dates refresh every morning from ccfddl and conference sites</p>
        </div>
      </header>

      <Clock />

      <div className="filters">
        <input type="search" placeholder="Search conferences" value={q} onChange={(e) => setQ(e.target.value)} />
        <MultiFilter label="All areas" value={area} onChange={setArea} options={areas.map((a) => ({ value: a, label: a }))} />
        <MultiFilter label="Any rank" value={rank} onChange={setRank} options={RANK_OPTIONS} />
        <MultiFilter label="Any owner" value={owner} onChange={setOwner} options={[...sortMembers(data.members).map((m) => ({ value: m.name, label: m.name })), { value: '', label: 'Unassigned' }]} />
        <MultiFilter label="Any status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <button className={'toggle' + (past ? ' on' : '')} onClick={() => setPast(!past)} aria-pressed={past} title="Also show deadlines that closed in the last 12 months">Show past year</button>
        <span className="grow" />
        <button className={'only-ours' + (onlyTarget ? ' on' : '')} onClick={() => setOnlyTarget(!onlyTarget)} aria-pressed={onlyTarget} title="Show only the deadlines our papers are aimed at or under review for">
          <i className="switch" /> Our targets only
        </button>
        <button className="primary" onClick={() => setAddConf(true)}><Icon name="plus" size={14} /> Track a conference</button>
      </div>

      {/* what the row colours mean, right above the rows they describe */}
      <div className="table-note">
        <span className="muted">{shown.length} deadlines</span>
        {active.length > 0 && (
          <span className="active-filters">
            <b>{active.length} {active.length === 1 ? 'filter' : 'filters'}</b>
            {active.map((f) => (
              <button key={f.key} className="fchip" onClick={f.clear} title="Remove this filter">{f.label} <Icon name="close" size={11} /></button>
            ))}
            <button className="link clear-all" onClick={clearAll}>Clear all</button>
          </span>
        )}
        <span className="grow" />
        <span className="key-item"><i className="sw reviewing" /> Under review</span>
        <span className="key-item"><i className="sw targeted" /> Targeted</span>
      </div>

      <div className="card tablewrap">
        <table className="sched">
          {/* Fixed column widths: the layout must not shift when a filter changes which rows are shown. */}
          <colgroup>
            <col className="c-rank" /><col className="c-conf" /><col className="c-date" /><col className="c-date" /><col className="c-left" />
            <col className="c-date" /><col className="c-review" /><col className="c-loc" /><col className="c-target" /><col className="c-status" />
          </colgroup>
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
              <th>Targeting</th>
              <th title="Who keeps this conference's dates correct, and how far the dates can be trusted">Owner · Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const tg = targets.get(`${r.confId}|${r.deadline}`) ?? []
              const est = r.status === 'estimated' ? ' est' : ''
              const tone = tg.some((p) => p.status === 'submitted') ? 'reviewing' : tg.length ? 'targeted' : ''
              return (
                <Fragment key={r.id}>
                  {i === firstFuture && (
                    <tr className={'todayrow' + (i === 0 ? ' first' : '')} aria-label={`Today, ${today}`}>
                      <td colSpan={4} />
                      <td><span title={today}>Today</span></td>
                      <td colSpan={COLS - 5} />
                    </tr>
                  )}
                  <tr className={[tone, r.at <= now ? 'past' : ''].join(' ')} onClick={() => setOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(r)}>
                    <td><Rank conf={r.conf} /></td>
                    <td className="conf">
                      <div className="conf-top">
                        <b>{venueOf(r.conf.acronym).name}</b>
                        {rowTags(r).map((t) => <span key={t} className="round">{t}</span>)}
                        <AreaTag area={r.conf.area} />
                      </div>
                      <div className="conf-name" title={r.conf.name}>{r.conf.name}</div>
                    </td>
                    <td className={'date c' + est}>{fmt(r.abstract) || <span className="faint">–</span>}</td>
                    <td className={'date strong c' + est}>{fmt(r.deadline)}</td>
                    <td className="c"><Countdown deadline={r.deadline} today={today} at={r.at} assumed={!r.exact && r.status !== 'estimated'} /></td>
                    <td className={'date c emph' + (est || r.notiEstimated ? ' est' : '')}
                      title={r.noti && (est || r.notiEstimated) ? 'Estimated: the notification date has not been announced, so this is projected from the previous edition' : undefined}>{fmt(r.noti) || <span className="faint">TBD</span>}</td>
                    <td className="date c emph days">{r.noti ? `${diffDays(r.noti, r.deadline)}d` : <span className="faint">–</span>}</td>
                    <td className="two-line">
                      <Place location={r.location} />
                      <small>Starts {fmt(r.event) || 'TBD'}</small>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className={'targeting' + (tg.length ? '' : ' none')}>
                        {/* One line only: the first paper, then how many more. The drawer lists them all. */}
                        {tg.slice(0, 1).map((p) => (
                          <button key={p.id} className="paper-chip" onClick={() => setPaper(p)} title={`${p.title} — ${p.members.join(', ')}`}>
                            <Avatars names={p.members.slice(0, 2)} /> <span>{p.title}</span>
                          </button>
                        ))}
                        {tg.length > 1 && (
                          <button className="more-chip" onClick={() => setOpen(r)} title={tg.slice(1).map((p) => `${p.title} — ${p.members.join(', ')}`).join(' / ')}>
                            +{tg.length - 1}
                          </button>
                        )}
                        {r.at > now && (
                          <button className="ghost add" title="Target this deadline with one of our papers" onClick={() => setPick(r)}><Icon name="plus" size={14} /></button>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="owner-status">
                        {r.conf.owner ? <Avatar name={r.conf.owner} size={20} /> : <span className="avatar none" title="No owner assigned" style={{ width: 20, height: 20 }} />}
                        <StatusBadge row={r} compact />
                      </span>
                      {r.autoDiff && <span className="tag warn" title={`Collected value: ${fmt(r.autoDiff.deadline)}`}>Changed</span>}
                      {isStale(r, today) && <span className="tag" title={`Last checked ${fmt(r.checkedAt) || 'never'}`}>Re-check</span>}
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
