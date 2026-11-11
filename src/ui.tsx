import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  PAPER_STATUS, STATUS_LABEL, autoSig, countdown, diffDays, flagOf, fmt, fmtShort, hue, initials, isDate, isStale, paperLinks, rowLabel,
  settleStatus, sortMembers, timeLeft, toKST, uid,
} from './logic'
import { useStore } from './store'
import type { Conf, Deadline, Paper, PaperStatus, PaperTarget, Row } from './types'

// ---------- small pieces ----------
const ICONS: Record<string, string> = {
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  timeline: 'M3 6h10M7 12h12M3 18h8M3 3v18',
  papers: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  lab: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  link: 'M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  plus: 'M12 5v14M5 12h14',
  close: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  left: 'M15 18l-6-6 6-6',
  down: 'M6 9l6 6 6-6',
  right: 'M9 18l6-6-6-6',
}
export function Icon({ name, size = 16 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  )
}

/** A person shown as their name (given name for Korean names, initials otherwise) on their own colour. */
export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const { data } = useStore()
  if (!name) return null
  const unknown = name === '?'
  const role = data.members.find((x) => x.name === name)?.role
  return (
    <span className="avatar" title={unknown ? 'Not selected' : role ? `${name} · ${role}` : name}
      style={{ width: size, height: size, fontSize: size * 0.42, background: unknown ? 'var(--faint)' : `hsl(${hue(name)} 55% 42%)` }}>
      {unknown ? '?' : initials(name)}
    </span>
  )
}
export const Avatars = ({ names }: { names: string[] }) => (
  <span className="avatars">{names.map((n) => <Avatar key={n} name={n} />)}</span>
)

export function Rank({ conf }: { conf: Conf }) {
  return (
    <span className="rank">
      {/* Both slots are always rendered so the KIISE and BK columns line up down the table. */}
      {conf.kiise ? <span className={`pill kiise-${conf.kiise}`} title={`KIISE rank ${conf.kiise}${conf.kiise === 'S' ? ' (top)' : ''}`}>{conf.kiise}</span> : <span className="pill none" title="Not on the KIISE list" />}
      {conf.bk ? <span className={`pill bk bk-${conf.bk}`} title={`BK21 IF ${conf.bk} of 4`}>{conf.bk}</span> : <span className="pill none" title="Not on the BK21 list" />}
    </span>
  )
}

export function AreaTag({ area }: { area: string }) {
  return area ? <span className="area">{area}</span> : null
}

const ZONES = [
  { label: 'KST', zone: 'Asia/Seoul', hint: 'Korea' },
  { label: 'AoE', zone: 'Etc/GMT+12', hint: 'Anywhere on Earth (UTC-12) — the usual deadline timezone' },
  { label: 'UTC', zone: 'UTC', hint: 'Coordinated Universal Time' },
  { label: 'PT', zone: 'America/Los_Angeles', hint: 'US Pacific' },
  { label: 'ET', zone: 'America/New_York', hint: 'US Eastern' },
]
/** Live clock in the timezones deadlines are usually stated in. */
export function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(t)
  }, [])
  const at = (zone: string) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)
  return (
    <div className="clock">
      {ZONES.map((z) => (
        <span key={z.label} title={z.hint}><i>{z.label}</i> {at(z.zone)}</span>
      ))}
    </div>
  )
}

export function Place({ location }: { location: string }) {
  if (!location) return <span className="muted">TBD</span>
  const flag = flagOf(location)
  return (
    <span className="place">
      {flag && <span className="flag">{flag}</span>}
      {location}
    </span>
  )
}

/**
 * Time left. Pass `at` (a row's exact closing moment) when there is one; plain dates fall back to whole days.
 * `assumed` adds a small ? when the closing time wasn't stated and 23:59 AoE was assumed.
 */
export function Countdown({ deadline, today, at, assumed }: { deadline: string; today: string; at?: number; assumed?: boolean }) {
  if (at) {
    const t = timeLeft(at, Date.now())
    const local = new Date(at).toLocaleString('sv-SE').slice(0, 16)
    const open = t.tone !== 'closed'
    return (
      <span className={'cd-wrap' + (assumed && open ? ' assumed' : '')}
        title={assumed ? `No closing time was given, so 23:59 AoE is assumed (${local} your time). Check the conference site.` : `Closes ${local} your time`}>
        <span className={`cd ${t.tone}`}>{t.text}</span>
      </span>
    )
  }
  const n = diffDays(deadline, today)
  const tone = n < 0 ? 'closed' : n <= 7 ? 'hot' : n <= 30 ? 'warm' : 'calm'
  return <span className={`cd ${tone}`}>{countdown(deadline, today)}</span>
}

/** `compact` leaves out the ×2 agreement mark; the full badge (drawer, inbox) keeps it. */
export function StatusBadge({ row, compact }: { row: Row; compact?: boolean }) {
  const title =
    row.status === 'verified'
      ? `Verified by ${row.checkedBy || 'owner'} on ${fmt(row.checkedAt) || 'unknown date'}`
      : row.status === 'auto'
        ? `Collected automatically from ${(row.sources ?? [row.source]).join(' + ')} — not yet verified by the owner`
        : row.derivedFrom
          ? `Not announced yet. Projected from last year's deadline (${fmt(row.derivedFrom)})`
          : 'Not announced yet. Expected date'
  return (
    <span className={`status st-${row.status}`} title={title}>
      <i />
      {STATUS_LABEL[row.status]}
      {!compact && row.status === 'auto' && row.sources?.length === 2 && <b title="The conference site and ccfddl agree">×2</b>}
    </span>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children, span }: { label: string; children: ReactNode; span?: boolean }) {
  return (
    <label className={'field' + (span ? ' span' : '')}>
      <span>{label}</span>
      {children}
    </label>
  )
}

export function toDeadline(r: Row): Deadline {
  const { conf: _c, virtual: _v, derivedFrom: _d, autoDiff: _a, sources: _s, evidence: _e, time: _t, tz: _z, at: _at, exact: _x, ...d } = r
  return d
}

/** Mark a row as checked by a person, keeping its current values. */
export function useVerify() {
  const { save, me, today } = useStore()
  return (r: Row, patch: Partial<Deadline> = {}) =>
    save('deadlines', {
      ...toDeadline(r),
      ...patch,
      status: 'verified',
      notiEstimated: false,
      checkedAt: today,
      checkedBy: me || r.checkedBy,
      autoSig: r.autoDiff ? autoSig(r.autoDiff) : r.autoSig,
    })
}

// ---------- deadline editor ----------
export function DeadlineModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { save, remove, me, today } = useStore()
  const [d, setD] = useState<Deadline>(() => toDeadline(row))
  const set = (k: keyof Deadline, v: string | number) => setD((p) => ({ ...p, [k]: v }))
  const date = (k: 'abstract' | 'deadline' | 'noti' | 'event', label: string) => (
    <Field label={label}>
      <input type="date" value={d[k]} onChange={(e) => set(k, e.target.value)} />
    </Field>
  )
  const applyAuto = () =>
    row.autoDiff &&
    setD((p) => ({ ...p, abstract: row.autoDiff!.abstract || p.abstract, deadline: row.autoDiff!.deadline, noti: row.autoDiff!.noti || p.noti }))
  const submit = async () => {
    if (!isDate(d.deadline)) return alert('A submission deadline is required.')
    await save('deadlines', {
      ...d,
      status: 'verified',
      notiEstimated: false,
      checkedAt: today,
      checkedBy: me || d.checkedBy,
      source: row.status === 'verified' ? d.source : 'manual',
      autoSig: row.autoDiff ? autoSig(row.autoDiff) : d.autoSig,
    })
    onClose()
  }
  return (
    <Modal title={`${rowLabel(row)} — dates`} onClose={onClose}>
      <p className="muted">
        Saving marks these dates as <b>Verified</b>{me ? ` by ${me}` : ''}. Check them against the conference site first.
      </p>
      {row.autoDiff && (
        <div className="notice">
          Collected value differs: deadline <b>{fmt(row.autoDiff.deadline)}</b>
          {row.autoDiff.abstract && <> · abstract {fmt(row.autoDiff.abstract)}</>}
          <button onClick={applyAuto}>Use these</button>
        </div>
      )}
      {d.url && <p><a href={d.url} target="_blank" rel="noreferrer">Open conference site <Icon name="link" size={13} /></a></p>}
      <div className="grid">
        {date('abstract', 'Abstract')}
        {date('deadline', 'Submission *')}
        {date('noti', 'Notification')}
        {date('event', 'Conference starts')}
        <Field label="Edition (year)"><input type="number" value={d.year} onChange={(e) => set('year', Number(e.target.value))} /></Field>
        <Field label="Round (e.g. 1/2)"><input value={d.round} onChange={(e) => set('round', e.target.value)} /></Field>
        <Field label="Location"><input value={d.location} onChange={(e) => set('location', e.target.value)} placeholder="City, Country" /></Field>
        <Field label="URL"><input value={d.url} onChange={(e) => set('url', e.target.value)} /></Field>
        <Field label="Note" span><input value={d.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </div>
      <footer>
        {!row.virtual && (
          <button className="danger" onClick={async () => { if (confirm('Delete this deadline?')) { await remove('deadlines', row.id); onClose() } }}>Delete</button>
        )}
        <span className="grow" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={submit}>Save as verified</button>
      </footer>
    </Modal>
  )
}

// ---------- conference editor ----------
/** A row of mutually exclusive buttons, for the handful of fields with three or four possible values. */
function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg choice" role="radiogroup">
      {options.map((o) => (
        <button type="button" key={String(o.value)} role="radio" aria-checked={o.value === value} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ConfModal({ conf, onClose }: { conf: Conf | null; onClose: () => void }) {
  const { save, remove, data, auto } = useStore()
  const [c, setC] = useState<Conf>(() => conf ?? { id: '', acronym: '', name: '', area: '', kiise: '', bk: null, blind: 'Double', owner: '', ccfddl: '' })
  const [grades, setGrades] = useState<Record<string, { kiise?: string; bk?: number }>>({})
  useEffect(() => {
    fetch('./data/grades.json').then((r) => r.json()).then(setGrades).catch(() => {})
  }, [])
  const set = <K extends keyof Conf>(k: K, v: Conf[K]) => setC((p) => ({ ...p, [k]: v }))
  const slug = (s: string) => s.toLowerCase().replace(/&/g, 'n').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const areas = useMemo(() => [...new Set(data.conferences.map((x) => x.area).filter(Boolean))].sort(), [data.conferences])
  const [newArea, setNewArea] = useState(false)

  // Conferences the collector already knows. Picking one links it, so its dates arrive on their own.
  const catalog = useMemo(() => Object.entries(auto?.ccfddl ?? {}).map(([key, v]) => ({ key, title: v.title })), [auto])
  const q = c.acronym.trim().toLowerCase()
  const linked = catalog.find((x) => x.key === c.ccfddl)
  const matches = !conf && q.length >= 2 && !linked ? catalog.filter((x) => x.title.toLowerCase().includes(q)).slice(0, 6) : []
  const link = (x: { key: string; title: string }) => {
    const g = grades[slug(x.title)]
    setC((p) => ({ ...p, acronym: x.title, ccfddl: x.key, kiise: g?.kiise ?? p.kiise, bk: g?.bk ?? p.bk }))
  }

  const submit = async () => {
    if (!c.acronym.trim()) return alert('An acronym is required.')
    const id = conf?.id ?? slug(c.acronym)
    if (!conf && data.conferences.some((x) => x.id === id)) return alert('This conference is already tracked.')
    await save('conferences', { ...c, acronym: c.acronym.trim(), id })
    onClose()
  }

  return (
    <Modal title={conf ? `Edit ${conf.acronym}` : 'Track a conference'} onClose={onClose}>
      <div className="grid conf-form">
        <div className="field span">
          <span>Acronym *</span>
          <input value={c.acronym} onChange={(e) => setC((p) => ({ ...p, acronym: e.target.value, ccfddl: conf ? p.ccfddl : '' }))} autoFocus={!conf} placeholder="e.g. SIGMOD" />
          {matches.length > 0 && (
            <ul className="suggest">
              {matches.map((x) => (
                <li key={x.key}>
                  <button type="button" onClick={() => link(x)}><b>{x.title}</b> <span className="muted">{x.key.split('/')[0]}</span> <small className="muted">dates collected automatically</small></button>
                </li>
              ))}
            </ul>
          )}
          <small className={'collect ' + (linked ? 'on' : '')}>
            {linked
              ? <><i className="dot ok" /> Dates are collected automatically ({linked.key}). <button type="button" className="link" onClick={() => set('ccfddl', '')}>Unlink</button></>
              : <><i className="dot" /> Not linked to the collector — dates for this one are entered by hand.</>}
          </small>
        </div>
        <Field label="Full name" span><input value={c.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. ACM SIGMOD International Conference on Management of Data" /></Field>

        <Field label="Area">
          {newArea || areas.length === 0 ? (
            <span className="combo">
              <input value={c.area} onChange={(e) => set('area', e.target.value)} placeholder="Name the new area" autoFocus={newArea} />
              {areas.length > 0 && <button type="button" onClick={() => { setNewArea(false); set('area', '') }}>Cancel</button>}
            </span>
          ) : (
            <span className="combo">
              <select value={c.area} onChange={(e) => set('area', e.target.value)}>
                <option value="">Not set</option>
                {areas.map((a) => <option key={a}>{a}</option>)}
              </select>
              <button type="button" onClick={() => { setNewArea(true); set('area', '') }}><Icon name="plus" size={14} /> New</button>
            </span>
          )}
        </Field>
        <Field label="Owner">
          <select value={c.owner} onChange={(e) => set('owner', e.target.value)}>
            <option value="">Unassigned</option>
            {sortMembers(data.members).map((m) => <option key={m.id}>{m.name}</option>)}
          </select>
        </Field>

        <div className="field">
          <span>KIISE rank</span>
          <Choice value={c.kiise} onChange={(v) => set('kiise', v)} options={[{ value: '', label: 'None' }, { value: 'A', label: 'A' }, { value: 'S', label: 'S', title: 'Top tier' }]} />
        </div>
        <div className="field">
          <span>BK21 IF</span>
          <Choice value={c.bk ?? 0} onChange={(v) => set('bk', v || null)} options={[{ value: 0, label: 'None' }, ...[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))]} />
        </div>
        <div className="field span">
          <span>Review</span>
          <Choice value={c.blind} onChange={(v) => set('blind', v)} options={[{ value: '', label: 'Unknown' }, { value: 'Single', label: 'Single-blind' }, { value: 'Double', label: 'Double-blind' }, { value: 'Triple', label: 'Triple-blind' }]} />
        </div>
      </div>
      <footer>
        {conf && (
          <button className="danger" onClick={async () => {
            if (!confirm(`Delete ${conf.acronym} and all of its deadlines?`)) return
            for (const d of data.deadlines.filter((x) => x.confId === conf.id)) await remove('deadlines', d.id)
            await remove('conferences', conf.id)
            onClose()
          }}>Delete conference</button>
        )}
        <span className="grow" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={submit}>{conf ? 'Save' : 'Track'}</button>
      </footer>
    </Modal>
  )
}

// ---------- multi-select filter ----------
export interface FilterOption { value: string; label: string; group?: string }
/**
 * A filter dropdown where several values can be ticked. Nothing ticked means "no filter".
 * Options may be grouped (e.g. KIISE / BK21); the caller decides how groups combine.
 */
export function MultiFilter({ label, options, value, onChange }: { label: string; options: FilterOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const chosen = options.filter((o) => value.includes(o.value))
  const summary = chosen.length === 0 ? label : chosen.length <= 2 ? chosen.map((o) => o.label).join(', ') : `${chosen.length} selected`
  const groups = [...new Set(options.map((o) => o.group ?? ''))]
  return (
    <div className="mf" ref={ref} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) } }}>
      <button type="button" className={'mf-btn' + (chosen.length ? ' on' : '')} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} aria-label={label}>
        <span>{summary}</span> <Icon name="down" size={14} />
      </button>
      {open && (
        <div className="mf-pop" role="listbox" aria-multiselectable>
          {groups.map((g) => (
            <div key={g || 'all'}>
              {g && <h3>{g}</h3>}
              {options.filter((o) => (o.group ?? '') === g).map((o) => (
                <label key={o.value} className="mf-item">
                  <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} /> {o.label}
                </label>
              ))}
            </div>
          ))}
          <button type="button" className="ghost mf-clear" onClick={() => onChange([])} disabled={!chosen.length}>Clear</button>
        </div>
      )}
    </div>
  )
}

// ---------- target picker ----------
/** Dropdown for a paper's target: venue, deadline and time left side by side, with a search box. */
function TargetPicker({ value, rows, today, onPick }: { value: PaperTarget | null; rows: Row[]; today: string; onPick: (r: Row | null) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  const same = (r: Row) => !!value && r.confId === value.confId && r.deadline === value.deadline
  const current = rows.find(same)
  const list = rows.filter((r) => !q || `${rowLabel(r)} ${r.conf.name}`.toLowerCase().includes(q.toLowerCase()))
  const choose = (r: Row | null) => { onPick(r); setOpen(false); setQ('') }
  return (
    <div className="tp" ref={ref} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) } }}>
      <button type="button" className="tp-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        {value ? (
          <>
            <b>{value.label}</b>
            <span className={'tp-date' + (current?.status === 'estimated' ? ' est' : '')}>{value.deadline}</span>
            {current ? <Countdown deadline={current.deadline} today={today} at={current.at} /> : <span className="cd closed">Closed</span>}
          </>
        ) : <span className="muted">Not decided</span>}
        <Icon name="down" size={14} />
      </button>
      {open && (
        <div className="tp-pop">
          <input autoFocus type="search" placeholder="Search conferences" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul role="listbox">
            <li><button type="button" className="tp-item" onClick={() => choose(null)}><span className="muted">Not decided</span></button></li>
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" className={'tp-item' + (same(r) ? ' on' : '')} role="option" aria-selected={same(r)} onClick={() => choose(r)}>
                  <b>{rowLabel(r)}</b>
                  <span className={'tp-date' + (r.status === 'estimated' ? ' est' : '')}>{r.deadline}</span>
                  <Countdown deadline={r.deadline} today={today} at={r.at} />
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="tp-none muted">No upcoming deadline matches.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------- paper editor ----------
export const newPaper = (me: string, today: string, row?: Row): Paper => ({
  id: uid(),
  title: '',
  group: '',
  members: me ? [me] : [],
  start: today,
  status: row ? 'writing' : 'research',
  target: row ? { confId: row.confId, label: rowLabel(row), deadline: row.deadline, noti: row.noti } : null,
  history: [],
  note: '',
  link: '',
})
const RESULT_LABEL = { accepted: 'Accepted', rejected: 'Rejected', withdrawn: 'Withdrawn' } as const

export function PaperModal({ paper, isNew, onClose }: { paper: Paper; isNew?: boolean; onClose: () => void }) {
  const { save, remove, data, rows, today } = useStore()
  const [p, setP] = useState<Paper>(paper)
  // Choosing or clearing a target moves the paper between Researching and In progress by itself.
  const set = <K extends keyof Paper>(k: K, v: Paper[K]) => setP((x) => (k === 'target' ? settleStatus({ ...x, [k]: v }) : { ...x, [k]: v }))
  const topics = useMemo(() => [...new Set(data.papers.map((x) => x.group).filter(Boolean))].sort(), [data.papers])
  const [newTopic, setNewTopic] = useState(() => !!paper.group && !data.papers.some((x) => x.id !== paper.id && x.group === paper.group) && !data.papers.some((x) => x.group === paper.group))
  const upcoming = useMemo(() => rows.filter((r) => r.deadline >= today), [rows, today])
  const keyOf = (r: { confId: string; deadline: string }) => `${r.confId}|${r.deadline}`
  const targetKey = p.target ? keyOf(p.target) : ''
  const toTarget = (r: Row) => ({ confId: r.confId, label: rowLabel(r), deadline: r.deadline, noti: r.noti })
  const sameAttempt = (x: Paper) => x.history.some((h) => h.label === x.target!.label && h.deadline === x.target!.deadline)
  const links = paperLinks(p)
  const setLinks = (v: string[]) => setP((x) => ({ ...x, links: v, link: '' }))
  // Where could this go next? After the decision if we're still waiting for it, from today if it's already rejected.
  const after = p.status === 'rejected' ? today : p.target?.noti || p.target?.deadline || today
  const nextOptions = useMemo(
    () => upcoming.filter((r) => r.deadline > after && r.confId !== p.target?.confId).slice(0, 5),
    [upcoming, after, p.target],
  )
  const submit = async () => {
    if (!p.title.trim()) return alert('Give the paper a working title.')
    let history = p.history
    if ((p.status === 'accepted' || p.status === 'rejected') && p.target && !sameAttempt(p)) {
      history = [...history, { label: p.target.label, deadline: p.target.deadline, result: p.status, date: today }]
    }
    await save('papers', { ...p, history, links: links.map((l) => l.trim()).filter(Boolean), link: '' })
    onClose()
  }
  const retarget = (r: Row) =>
    setP((x) => ({
      ...x,
      history: x.target && x.status === 'rejected' && !sameAttempt(x)
        ? [...x.history, { label: x.target.label, deadline: x.target.deadline, result: 'rejected' as const, date: today }]
        : x.history,
      status: 'writing',
      target: toTarget(r),
    }))
  return (
    <Modal title={isNew ? 'New paper' : 'Edit paper'} onClose={onClose} wide>
      <div className="grid">
        <Field label="Working title *" span>
          <input value={p.title} onChange={(e) => set('title', e.target.value)} autoFocus={isNew} placeholder="e.g. LLM-seccomp" />
        </Field>
        <Field label="Research topic">
          {newTopic || topics.length === 0 ? (
            <span className="combo">
              <input value={p.group} onChange={(e) => set('group', e.target.value)} placeholder="Name the new topic" autoFocus={newTopic} />
              {topics.length > 0 && <button onClick={() => { setNewTopic(false); set('group', '') }} title="Back to the list of existing topics">Cancel</button>}
            </span>
          ) : (
            <span className="combo">
              <select value={p.group} onChange={(e) => set('group', e.target.value)}>
                <option value="">No topic</option>
                {topics.map((g) => <option key={g}>{g}</option>)}
              </select>
              <button onClick={() => { setNewTopic(true); set('group', '') }} title="Create a new topic"><Icon name="plus" size={14} /> New</button>
            </span>
          )}
        </Field>
        <Field label="Status">
          <select value={p.status} onChange={(e) => set('status', e.target.value as PaperStatus)}>
            {PAPER_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="People" span>
          <div className="chips">
            {sortMembers(data.members).map((m) => (
              <label key={m.id} className={'chip pick' + (p.members.includes(m.name) ? ' on' : '')}>
                <input type="checkbox" checked={p.members.includes(m.name)}
                  onChange={(e) => set('members', e.target.checked ? [...p.members, m.name] : p.members.filter((x) => x !== m.name))} />
                <Avatar name={m.name} size={18} /> {m.name}
              </label>
            ))}
          </div>
        </Field>
        {/* Not a <label>: a label would forward stray clicks inside the open list to the toggle button and close it. */}
        <div className="field span">
          <span>Target</span>
          <TargetPicker value={p.target} rows={upcoming} today={today} onPick={(r) => set('target', r ? toTarget(r) : null)} />
        </div>
        <Field label="Started"><input type="date" value={p.start} onChange={(e) => set('start', e.target.value)} /></Field>
        <Field label="Notes"><textarea rows={1} value={p.note} onChange={(e) => set('note', e.target.value)} /></Field>
        <Field label="Links (Overleaf, repo, slides…)" span>
          <div className="links">
            {links.map((l, i) => (
              <span className="combo" key={i}>
                <input value={l} placeholder="https://…" onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))} />
                {/^https?:\/\//.test(l) && <a className="btn" href={l} target="_blank" rel="noreferrer" title="Open"><Icon name="link" size={14} /></a>}
                <button className="ghost" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Remove link"><Icon name="close" size={14} /></button>
              </span>
            ))}
            <button className="ghost add-link" onClick={() => setLinks([...links, ''])}><Icon name="plus" size={14} /> Add link</button>
          </div>
        </Field>
      </div>
      {p.target && p.status !== 'accepted' && nextOptions.length > 0 && (
        <div className="next fallback">
          <span className="fb-title">{p.status === 'rejected' ? <>Rejected at <b>{p.target.label}</b> — where next?</> : <>Backup plan if <b>{p.target.label}</b> rejects it</>}</span>
          <span>
            {p.status === 'rejected'
              ? 'The nearest deadlines still open:'
              : p.target.noti
                ? <>Decision on <b className="when-date">{fmt(p.target.noti)}</b>. The first deadlines after that:</>
                : 'No decision date yet, so these are simply the next deadlines after this one:'}
          </span>
          <ul>
            {nextOptions.map((r) => (
              <li key={r.id}>
                <b className="venue">{rowLabel(r)}</b>
                <span className="tp-date">{fmt(r.deadline)}</span>
                <span className="muted">{diffDays(r.deadline, after)} days {p.status === 'rejected' ? 'from now' : p.target?.noti ? 'after the decision' : 'after this deadline'}</span>
                <button onClick={() => retarget(r)}>Make this the target</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.history.length > 0 && (
        <div className="next">
          <span className="muted">Submission history</span>
          <ul className="history">
            {p.history.map((h, i) => (
              <li key={i}>
                <span className={`tag res-${h.result}`}>{RESULT_LABEL[h.result]}</span> {h.label} · submitted {fmt(h.deadline)}
                <button className="ghost" onClick={() => set('history', p.history.filter((_, j) => j !== i))} aria-label="Remove entry"><Icon name="close" size={13} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <footer>
        {!isNew && <button className="danger" onClick={async () => { if (confirm('Delete this paper and its history?')) { await remove('papers', p.id); onClose() } }}>Delete</button>}
        <span className="grow" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={submit}>Save</button>
      </footer>
    </Modal>
  )
}
export { RESULT_LABEL }

// ---------- pick which paper targets a deadline ----------
/** From a deadline: choose one of our papers to aim at it, or start a new one. */
export function TargetModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const { data, save, me, today } = useStore()
  const [fresh, setFresh] = useState<Paper | null>(null)
  const target = { confId: row.confId, label: rowLabel(row), deadline: row.deadline, noti: row.noti }
  // Anything not currently under review or accepted can be pointed at this deadline.
  const candidates = data.papers.filter((p) => p.status === 'research' || p.status === 'writing' || p.status === 'rejected')
  const assign = async (p: Paper) => {
    const failed = p.status === 'rejected' && p.target && !p.history.some((h) => h.label === p.target!.label && h.deadline === p.target!.deadline)
    await save('papers', {
      ...p,
      history: failed ? [...p.history, { label: p.target!.label, deadline: p.target!.deadline, result: 'rejected', date: today }] : p.history,
      status: 'writing',
      target,
    })
    onClose()
  }
  if (fresh) return <PaperModal paper={fresh} isNew onClose={onClose} />
  const here = (p: Paper) => p.target?.confId === row.confId && p.target.deadline === row.deadline
  const groups = [
    { title: 'No target yet', hint: 'Free to take this deadline', tone: 'free', papers: candidates.filter((p) => !p.target && p.status !== 'rejected') },
    { title: 'Rejected — needs a new venue', hint: '', tone: 'free', papers: candidates.filter((p) => p.status === 'rejected') },
    { title: 'Aimed at another deadline', hint: 'Choosing one moves it here', tone: 'busy', papers: candidates.filter((p) => !!p.target && p.status !== 'rejected') },
  ].filter((g) => g.papers.length)
  return (
    <Modal title={`Target ${target.label}`} onClose={onClose}>
      <div className="tm-when">
        <span>Deadline</span>
        <b className={row.status === 'estimated' ? 'est' : ''}>{fmt(row.deadline)}</b>
        <Countdown deadline={row.deadline} today={today} at={row.at} />
        {row.noti && <span className="muted">result {fmt(row.noti)}</span>}
      </div>
      <p className="muted">Which paper is going here?</p>
      {groups.map((g) => (
        <div key={g.title} className={`tm-group ${g.tone}`}>
          <h3>{g.title} <span>{g.papers.length}</span>{g.hint && <small>{g.hint}</small>}</h3>
          {g.papers.map((p) => (
            <button key={p.id} className="mini" onClick={() => assign(p)} disabled={here(p)}>
              <b>{p.title}</b> <Avatars names={p.members} />
              {p.target && <span className="muted">{here(p) ? 'already here' : p.status === 'rejected' ? `was ${p.target.label}` : <>now <b>{p.target.label}</b> · {fmt(p.target.deadline)}</>}</span>}
            </button>
          ))}
        </div>
      ))}
      {candidates.length === 0 && <p className="muted">No papers yet. Add ongoing work on the Papers page, or start one here.</p>}
      <footer>
        <button onClick={() => setFresh(newPaper(me, today, row))}><Icon name="plus" size={14} /> New paper</button>
        <span className="grow" />
        <button onClick={onClose}>Cancel</button>
      </footer>
    </Modal>
  )
}

// ---------- conference detail drawer ----------
export function ConfDrawer({ row, onClose }: { row: Row; onClose: () => void }) {
  const { rows, data, today } = useStore()
  const verify = useVerify()
  const [edit, setEdit] = useState(false)
  const [editConf, setEditConf] = useState(false)
  const [paper, setPaper] = useState<Paper | null>(null)
  const [pick, setPick] = useState(false)
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !edit && !editConf && !paper && !pick && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, edit, editConf, paper, pick])

  // Re-read the row from the store so the drawer reflects edits made from inside it.
  const live = rows.find((r) => r.confId === row.confId && r.deadline === row.deadline) ?? rows.find((r) => r.id === row.id) ?? row
  const conf = data.conferences.find((c) => c.id === live.confId) ?? live.conf
  const others = rows.filter((r) => r.confId === conf.id && r.id !== live.id && diffDays(r.deadline, today) > -200)
  const papers = data.papers.filter((p) => p.target?.confId === conf.id || p.history.some((h) => h.label.startsWith(conf.acronym)))
  const steps: { label: string; date: string; main?: boolean; soft?: boolean }[] = [
    { label: 'Abstract', date: live.abstract },
    { label: 'Submission', date: live.deadline, main: true },
    { label: 'Notification', date: live.noti, soft: live.notiEstimated },
    { label: 'Conference', date: live.event },
  ]
  // Filled dot = already passed, blue dot = the next date coming up, hollow = later or unknown.
  const nextStep = steps.find((s) => s.date && s.date >= today)
  return (
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label={`${conf.acronym} details`}>
        <header>
          <div>
            <h2>{rowLabel(live)} <small>{live.year}</small></h2>
            <p className="fullname">{conf.name}</p>
          </div>
          <button className="ghost" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>

        <div className="tags">
          <Rank conf={conf} />
          {conf.area && <span className="tag">{conf.area}</span>}
          {conf.blind && <span className="tag">{conf.blind}-blind</span>}
          <span className="tag"><Place location={live.location} /></span>
        </div>

        <ol className="steps">
          {steps.map((s) => (
            <li key={s.label} className={s === nextStep ? 'upnext' : s.date && s.date < today ? 'done' : ''} title={s === nextStep ? 'Next date coming up' : s.date && s.date < today ? 'Passed' : ''}>
              <span>{s.label}</span>
              <b className={live.status === 'estimated' || s.soft ? 'est' : ''}>{fmt(s.date) || 'TBD'}</b>
              {s.main && <Countdown deadline={live.deadline} today={today} at={live.at} assumed={!live.exact} />}
              {s.main && !live.exact && live.at > Date.now() && <small className="muted when">Closing time not stated — assuming 23:59 AoE. Check the site.</small>}
              {s.main && live.time && live.tz && (
                <small className="muted when">{live.time} {/^UTC-12$/i.test(live.tz) ? 'AoE' : live.tz}{toKST(live.deadline, live.time, live.tz) && <> = <b>{toKST(live.deadline, live.time, live.tz)} KST</b></>}</small>
              )}
              {s.label === 'Notification' && live.noti && <small className="muted">{diffDays(live.noti, live.deadline)} days of review</small>}
            </li>
          ))}
        </ol>

        <section className="trust">
          <div className="trust-head">
            <StatusBadge row={live} />
            {isStale(live, today) && <span className="tag warn">Re-check</span>}
            {live.autoDiff && <span className="tag warn">Changed</span>}
          </div>
          <p className="muted">
            {live.status === 'verified' && <>Verified by {live.checkedBy || 'owner'} on {fmt(live.checkedAt) || 'an unknown date'}.</>}
            {live.status === 'auto' && <>Collected on {fmt(live.checkedAt)} from {(live.sources ?? [live.source]).map((s) => (s === 'site' ? 'the conference site' : s)).join(' and ')}. Not verified by a person yet.</>}
            {live.status === 'estimated' && <>This edition's dates aren't out yet. Showing last year's{live.derivedFrom ? ` (${fmt(live.derivedFrom)})` : ''} shifted by a year; they'll be replaced automatically once announced.</>}
          </p>
          {live.autoDiff && (
            <p className="diff">
              {live.autoDiff.source === 'site' ? 'The conference site' : 'ccfddl'} now says deadline <b>{fmt(live.autoDiff.deadline)}</b>
              {live.autoDiff.abstract && <> (abstract {fmt(live.autoDiff.abstract)})</>}.
            </p>
          )}
          {!!live.evidence?.length && (
            <details>
              <summary>Text read from the conference site</summary>
              <ul className="evidence">{live.evidence.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </details>
          )}
          <div className="acts">
            {live.url && <a className="btn" href={live.url} target="_blank" rel="noreferrer">Open site <Icon name="link" size={13} /></a>}
            {live.status !== 'verified' && live.status !== 'estimated' && <button className="primary" onClick={() => verify(live)}><Icon name="check" size={14} /> Looks right</button>}
            <button onClick={() => setEdit(true)}><Icon name="edit" size={14} /> {live.status === 'estimated' ? 'Enter real dates' : 'Edit dates'}</button>
          </div>
        </section>

        <section>
          <h3>Owner</h3>
          <p className="owner">{conf.owner ? <><Avatar name={conf.owner} /> {conf.owner}</> : <span className="muted">Unassigned</span>}
            <button className="ghost" onClick={() => setEditConf(true)}>Edit conference</button></p>
        </section>

        <section>
          <h3>Papers</h3>
          {papers.length === 0 && <p className="nobody">Nobody is targeting <b>{rowLabel(live)}</b> yet.</p>}
          {papers.map((p) => (
            <button key={p.id} className="mini" onClick={() => setPaper(p)}>
              <i className={`sdot ps-${p.status}`} /> <b>{p.title}</b> <Avatars names={p.members} />
              <span className="muted">{p.target?.confId === conf.id ? p.target.label : 'Earlier attempt'}</span>
            </button>
          ))}
          {live.deadline >= today && <button onClick={() => setPick(true)}><Icon name="plus" size={14} /> Target</button>}
        </section>

        {others.length > 0 && (
          <section>
            <h3>Other rounds &amp; editions</h3>
            <ul className="others">
              {others.map((r) => (
                <li key={r.id}>
                  <span>{rowLabel(r)} <small className="muted">{r.year}</small></span>
                  <span className={r.status === 'estimated' ? 'est' : ''}>{fmt(r.deadline)}</span>
                  <Countdown deadline={r.deadline} today={today} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {live.note && <section><h3>Note</h3><p>{live.note}</p></section>}
      </aside>
      {edit && <DeadlineModal row={live} onClose={() => setEdit(false)} />}
      {editConf && <ConfModal conf={conf} onClose={() => setEditConf(false)} />}
      {paper && <PaperModal paper={paper} isNew={!data.papers.some((p) => p.id === paper.id)} onClose={() => setPaper(null)} />}
      {pick && <TargetModal row={live} onClose={() => setPick(false)} />}
    </div>
  )
}
