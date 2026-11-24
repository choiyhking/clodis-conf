import { useState, type ReactNode } from 'react'
import { diffParts, fmt, rowLabel } from '../logic'
import { useStore } from '../store'
import type { Row } from '../types'
import { ConfDrawer, Countdown, DeadlineModal, Icon, useVerify } from '../ui'

/** What waits for a person: collected dates to confirm, and verified dates that changed. */
export default function Inbox() {
  const { rows, today, me } = useStore()
  const verify = useVerify()
  const [mine, setMine] = useState(!!me)
  const [edit, setEdit] = useState<Row | null>(null)
  const [open, setOpen] = useState<Row | null>(null)
  const ok = (owner: string) => !mine || !me || owner === me
  const future = rows.filter((r) => r.deadline >= today && ok(r.conf.owner))

  const changed = rows.filter((r) => r.autoDiff && ok(r.conf.owner))
  const autos = future.filter((r) => r.status === 'auto')

  // Each line: what it is on the left, the one or two things you can do on the right. The section it sits in
  // already says its status, and the owner is only named when the list is not narrowed to your own.
  const item = (r: Row, actions: ReactNode, extra?: ReactNode) => (
    <li key={r.id}>
      <div className="it-main">
        <div className="it-head">
          <button className="link it-title" onClick={() => setOpen(r)}>{rowLabel(r)} <small className="muted">{r.year}</small></button>
          {r.url && <a className="it-site" href={r.url} target="_blank" rel="noreferrer" title="Open conference site" aria-label="Open conference site"><Icon name="link" size={13} /></a>}
          {!(mine && me) && r.conf.owner && <small className="muted it-owner">{r.conf.owner}</small>}
        </div>
        <div className="it-dates">
          <span className="kv"><i>Deadline</i> <b className={r.status === 'estimated' ? 'est' : ''}>{fmt(r.deadline)}</b></span> <Countdown deadline={r.deadline} today={today} />
          {r.abstract && <span className="kv"><i>Abstract</i> {fmt(r.abstract)}</span>}
          <span className="kv"><i>Notification</i> {fmt(r.noti) || 'TBD'}</span>
        </div>
        {extra}
      </div>
      <div className="acts">{actions}</div>
    </li>
  )
  const Section = ({ title, hint, n, children }: { title: string; hint: string; n: number; children: ReactNode }) => (
    <div className="inbox-sec">
      <h2>{title} <span className={'count' + (n ? '' : ' zero')}>{n}</span></h2>
      <p className="muted">{hint}</p>
      {n === 0 ? <p className="card empty">Nothing here.</p> : <ul className="card ilist">{children}</ul>}
    </div>
  )

  return (
    <section className="inbox">
      <header className="page-head">
        <div>
          <h1>Inbox</h1>
        </div>
        <button className={'toggle' + (mine ? ' on' : '')} onClick={() => setMine(!mine)} disabled={!me} aria-pressed={mine}
          title={me ? '' : 'Pick who you are in the sidebar first'}>
          Only mine{me ? ` (${me})` : ''}
        </button>
      </header>

      <Section title="Changed" n={changed.length} hint="A verified abstract, deadline or notification date no longer matches what the collector reads. Often an extension.">
        {changed.map((r) => item(r, <>
          <button className="primary" onClick={() => verify(r, { deadline: r.autoDiff!.deadline, abstract: r.autoDiff!.abstract || r.abstract, noti: r.autoDiff!.noti || r.noti })}>Accept new</button>
          <button onClick={() => verify(r)}>Keep mine</button>
          <button onClick={() => setEdit(r)}>Edit</button>
        </>, <div className="diff">{r.autoDiff!.source === 'site' ? 'The conference site' : 'ccfddl'} now shows: {diffParts(r).map((p, i) => <span key={p.label}>{i > 0 && ' · '}{p.label} <b>{fmt(p.value)}</b></span>)}</div>))}
      </Section>

      <Section title="New dates to verify" n={autos.length} hint="Collected automatically and already shown on the Deadlines page as Auto.">
        {autos.map((r) => item(r, <>
          <button className="primary" onClick={() => verify(r)}><Icon name="check" size={14} /> Looks right</button>
          <button onClick={() => setEdit(r)}>Edit</button>
        </>))}
      </Section>

      {edit && <DeadlineModal row={edit} onClose={() => setEdit(null)} />}
      {open && <ConfDrawer row={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
