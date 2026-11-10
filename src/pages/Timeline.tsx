import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MONTHS, countdown, fmt, fmtShort, fromMs, paperStatusLabel, rowLabel, sortMembers, toMs } from '../logic'
import { useStore } from '../store'
import type { Paper, Row } from '../types'
import { Avatar, Avatars, ConfDrawer, Icon, PaperModal, newPaper } from '../ui'

const LANE_H = 22
const MAX_LANES = 6

/** Twelve months on one screen: key deadlines on top, one bar per paper running to its target deadline. */
export default function Timeline() {
  const { data, rows, today, me } = useStore()
  const [offset, setOffset] = useState(0)
  const [by, setBy] = useState<'person' | 'topic'>('person')
  const [paper, setPaper] = useState<Paper | null>(null)
  const [open, setOpen] = useState<Row | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // window: 2 months back, 10 ahead
  const months = useMemo(() => {
    const t = new Date(today + 'T00:00:00Z')
    const base = t.getUTCFullYear() * 12 + t.getUTCMonth() - 2 + offset
    return Array.from({ length: 12 }, (_, i) => {
      const y = Math.floor((base + i) / 12), m = (base + i) % 12
      return { y, m, start: fromMs(Date.UTC(y, m, 1)), end: fromMs(Date.UTC(y, m + 1, 1)) }
    })
  }, [today, offset])
  const start = months[0].start, end = months[11].end
  const span = toMs(end) - toMs(start)
  const x = (d: string) => Math.max(0, Math.min(100, ((toMs(d) - toMs(start)) / span) * 100))
  const inWin = (d: string) => d >= start && d < end

  const papers = data.papers
  const targeted = new Set(papers.filter((p) => p.target).map((p) => `${p.target!.confId}|${p.target!.deadline}`))

  // Deadline markers, packed into as few lanes as fit without overlapping labels.
  const keys = useMemo(() => {
    const list = rows.filter((r) => inWin(r.deadline) && targeted.has(`${r.confId}|${r.deadline}`))
    const laneEnd: number[] = []
    return list.map((r) => {
      const left = (x(r.deadline) / 100) * width
      const w = rowLabel(r).length * 6.4 + 54
      let lane = laneEnd.findIndex((e) => e < left - 6)
      if (lane < 0) lane = laneEnd.length < MAX_LANES ? laneEnd.length : laneEnd.indexOf(Math.min(...laneEnd))
      laneEnd[lane] = left + w
      return { r, lane, isTarget: targeted.has(`${r.confId}|${r.deadline}`) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, start, end, width, data.papers])
  const lanes = Math.max(1, ...keys.map((k) => k.lane + 1))

  const visible = (p: Paper) => {
    const last = p.target?.noti || p.target?.deadline || today
    return p.status === 'writing' || p.status === 'submitted' || last >= start
  }
  const groups: { key: string; head: ReactNode; papers: Paper[] }[] =
    by === 'person'
      ? sortMembers(data.members).map((m) => ({
          key: m.id,
          head: <><Avatar name={m.name} size={24} /> <b>{m.name}</b> {m.role && <span className="tag">{m.role}</span>}</>,
          papers: papers.filter((p) => p.members.includes(m.name) && visible(p)),
        }))
      : [...new Set(papers.map((p) => p.group || 'No topic'))].map((g) => ({
          key: g,
          head: <b>{g}</b>,
          papers: papers.filter((p) => (p.group || 'No topic') === g && visible(p)),
        }))

  const Grid = () => <>{months.slice(1).map((m) => <i key={m.start} className="gl" style={{ left: `${x(m.start)}%` }} />)}</>

  const sub = (p: Paper) => {
    const t = p.target
    if (!t) return 'No target yet'
    if (p.status === 'submitted') return `${t.label} · result ${t.noti ? fmtShort(t.noti) : 'TBD'}`
    if (p.status === 'accepted') return `Accepted at ${t.label}`
    if (p.status === 'rejected') return `Rejected at ${t.label}`
    return `${t.label} · ${fmtShort(t.deadline)} · ${countdown(t.deadline, today)}`
  }

  const bar = (p: Paper) => {
    const t = p.target
    const working = p.status === 'writing'
    const from = p.start && p.start > start ? p.start : start
    const to = t?.deadline ?? today
    const show = to > start && from < end && from < to
    const w = x(to) - x(from)
    const reviewing = t && !working && t.noti && t.noti > t.deadline && t.noti > start && t.deadline < end
    return (
      <>
        {show && (
          <div className={`bar ps-${p.status}` + (t ? '' : ' open')} style={{ left: `${x(from)}%`, width: `${w}%` }}>
            {t && (w / 100) * width > t.label.length * 6.5 + 20 && <span>{t.label}</span>}
          </div>
        )}
        {t && show && working && (w / 100) * width <= t.label.length * 6.5 + 20 && <span className="bar-out" style={{ left: `calc(${x(to)}% + 8px)` }}>{t.label}</span>}
        {reviewing && (
          <div className="rev" style={{ left: `${x(t.deadline)}%`, width: `${x(t.noti) - x(t.deadline)}%` }} title={`Under review until ${fmt(t.noti)}`} />
        )}
        {t && !working && t.noti && inWin(t.noti) && (
          <i className={`result ps-${p.status}`} style={{ left: `${x(t.noti)}%` }} title={`${paperStatusLabel(p.status)} · ${t.label} · ${fmt(t.noti)}`}>
            {p.status === 'accepted' ? '✓' : p.status === 'rejected' ? '✕' : ''}
          </i>
        )}
        {p.history.filter((h) => inWin(h.deadline) && h.deadline !== t?.deadline).map((h, i) => (
          <i key={i} className={`attempt res-${h.result}`} style={{ left: `${x(h.deadline)}%` }} title={`${h.label}: ${h.result} (submitted ${fmt(h.deadline)})`}>
            {h.result === 'accepted' ? '✓' : '✕'}
          </i>
        ))}
      </>
    )
  }

  const review = papers.filter((p) => p.status === 'submitted' && p.target)
  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Timeline</h1>
          <p className="muted">
            {review.length ? <>Under review: {review.map((p) => `${p.title} (${p.target!.label})`).join(', ')}</> : 'Nothing under review right now'}
          </p>
        </div>
        <button className="primary" onClick={() => setPaper(newPaper(me, today))}><Icon name="plus" size={14} /> New paper</button>
      </header>

      <div className="filters">
        <div className="seg">
          <button onClick={() => setOffset(offset - 3)} aria-label="Earlier"><Icon name="left" size={14} /></button>
          <button onClick={() => setOffset(0)}>Today</button>
          <button onClick={() => setOffset(offset + 3)} aria-label="Later"><Icon name="right" size={14} /></button>
        </div>
        <b className="range">{MONTHS[months[0].m]} {months[0].y} – {MONTHS[months[11].m]} {months[11].y}</b>
        <div className="seg">
          <button className={by === 'person' ? 'on' : ''} onClick={() => setBy('person')}>By person</button>
          <button className={by === 'topic' ? 'on' : ''} onClick={() => setBy('topic')}>By topic</button>
        </div>
        <span className="grow" />
        <span className="legend">
          <i className="lg ps-writing" /> Writing <i className="lg rev" /> Under review <i className="lg ps-accepted" /> Accepted <i className="lg ps-rejected" /> Rejected
        </span>
      </div>

      <div className="card tl">
        <div className="tl-inner">
          <div className="tl-row tl-head">
            <div className="tl-left" />
            <div className="tl-track" ref={trackRef}>
              {months.map((m, i) => (
                <div key={m.start} className={'mon' + (today >= m.start && today < m.end ? ' now' : '')} style={{ left: `${x(m.start)}%`, width: `${(i === 11 ? 100 : x(months[i + 1].start)) - x(m.start)}%` }}>
                  {MONTHS[m.m]}{(i === 0 || m.m === 0) && <small> {m.y}</small>}
                </div>
              ))}
            </div>
          </div>

          <div className="tl-row tl-keys">
            <div className="tl-left"><b>Deadlines</b><small className="muted">Conferences we are targeting</small></div>
            <div className="tl-track" style={{ height: lanes * LANE_H + 14 }}>
              <Grid />
              {keys.map(({ r, lane, isTarget }) => (
                <button key={r.id} className={`key st-${r.status}` + (isTarget ? ' target' : '')} style={{ left: `${x(r.deadline)}%`, top: 7 + lane * LANE_H }}
                  onClick={() => setOpen(r)} title={`${rowLabel(r)} · ${fmt(r.deadline)}${r.status === 'estimated' ? ' (estimated)' : ''}`}>
                  <i /><span>{rowLabel(r)}</span><small>{Number(r.deadline.slice(8))}</small>
                </button>
              ))}
              {keys.length === 0 && <span className="tl-empty muted">Target a deadline from a paper to see it here.</span>}
            </div>
          </div>

          {groups.map((g) => (
            <div className="tl-group" key={g.key}>
              <div className="tl-row tl-ghead">
                <div className="tl-left">{g.head}</div>
                <div className="tl-track"><Grid /></div>
              </div>
              {g.papers.map((p) => (
                <div className="tl-row tl-paper" key={p.id} onClick={() => setPaper(p)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPaper(p)}>
                  <div className="tl-left">
                    <span className="p-title">{p.title}</span>
                    <small className="muted">{sub(p)}</small>
                    {by === 'topic' && <Avatars names={p.members} />}
                  </div>
                  <div className="tl-track"><Grid />{bar(p)}</div>
                </div>
              ))}
              {g.papers.length === 0 && (
                <div className="tl-row tl-paper idle">
                  <div className="tl-left"><small className="muted">No active paper</small></div>
                  <div className="tl-track"><Grid /></div>
                </div>
              )}
            </div>
          ))}

          {inWin(today) && (
            <div className="tl-today" aria-hidden>
              <div style={{ left: `${x(today)}%` }}><span>Today</span></div>
            </div>
          )}
        </div>
      </div>

      {paper && <PaperModal paper={paper} isNew={!data.papers.some((p) => p.id === paper.id)} onClose={() => setPaper(null)} />}
      {open && <ConfDrawer row={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
