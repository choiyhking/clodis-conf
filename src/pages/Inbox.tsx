import { useState, type ReactNode } from 'react'
import { fmt, isStale, newSites, rowLabel } from '../logic'
import { useStore } from '../store'
import type { Row } from '../types'
import { Avatar, ConfDrawer, Countdown, DeadlineModal, Icon, StatusBadge, useVerify } from '../ui'

/** Everything a person should look at: collected dates, changes, new sites, and checks that have gone stale. */
export default function Inbox() {
  const { rows, auto, data, today, me } = useStore()
  const verify = useVerify()
  const [mine, setMine] = useState(!!me)
  const [edit, setEdit] = useState<Row | null>(null)
  const [open, setOpen] = useState<Row | null>(null)
  const ok = (owner: string) => !mine || !me || owner === me
  const future = rows.filter((r) => r.deadline >= today && ok(r.conf.owner))

  const changed = rows.filter((r) => r.autoDiff && ok(r.conf.owner))
  const autos = future.filter((r) => r.status === 'auto')
  const stale = future.filter((r) => isStale(r, today) && !r.autoDiff)
  const estimated = future.filter((r) => r.status === 'estimated')
  const sites = newSites(data.conferences, data.deadlines, auto).filter((s) => ok(s.conf.owner))

  const item = (r: Row, actions: ReactNode, extra?: ReactNode) => (
    <li key={r.id}>
      <div className="it-main">
        <button className="link it-title" onClick={() => setOpen(r)}>{rowLabel(r)} <small className="muted">{r.year}</small></button>
        <div className="it-dates">
          <span className="kv"><i>Deadline</i> <b className={r.status === 'estimated' ? 'est' : ''}>{fmt(r.deadline)}</b></span> <Countdown deadline={r.deadline} today={today} />
          {r.abstract && <span className="kv"><i>Abstract</i> {fmt(r.abstract)}</span>}
          <span className="kv"><i>Notification</i> {fmt(r.noti) || 'TBD'}</span>
        </div>
        {extra}
      </div>
      <StatusBadge row={r} />
      <Avatar name={r.conf.owner} />
      <div className="acts">
        {r.url && <a className="btn" href={r.url} target="_blank" rel="noreferrer" title="Open conference site"><Icon name="link" size={14} /></a>}
        {actions}
      </div>
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
          <p className="muted">
            Dates the collector found or couldn't find — a person confirms them here.
            {auto ? ` Last collected ${auto.generatedAt.replace('T', ' ').slice(0, 16)} UTC.` : ' The collector has not run yet.'}
          </p>
        </div>
        <button className={'toggle' + (mine ? ' on' : '')} onClick={() => setMine(!mine)} disabled={!me} aria-pressed={mine}
          title={me ? '' : 'Pick who you are in the sidebar first'}>
          Only mine{me ? ` (${me})` : ''}
        </button>
      </header>

      <Section title="Changed" n={changed.length} hint="A date you verified no longer matches what the collector reads. Often a deadline extension.">
        {changed.map((r) => item(r, <>
          <button className="primary" onClick={() => verify(r, { deadline: r.autoDiff!.deadline, abstract: r.autoDiff!.abstract || r.abstract, noti: r.autoDiff!.noti || r.noti })}>Accept new</button>
          <button onClick={() => verify(r)}>Keep mine</button>
          <button onClick={() => setEdit(r)}>Edit</button>
        </>, <div className="diff">{r.autoDiff!.source === 'site' ? 'Conference site' : 'ccfddl'} says <b>{fmt(r.autoDiff!.deadline)}</b>{r.autoDiff!.abstract && <> · Abstract {fmt(r.autoDiff!.abstract)}</>}</div>))}
      </Section>

      <Section title="New dates to verify" n={autos.length} hint="Collected automatically and already shown on the Deadlines page as Auto. ×2 means the conference site and ccfddl agree.">
        {autos.map((r) => item(r, <>
          <button className="primary" onClick={() => verify(r)}><Icon name="check" size={14} /> Looks right</button>
          <button onClick={() => setEdit(r)}>Edit</button>
        </>))}
      </Section>

      <Section title="Next year's site is up" n={sites.length} hint="Found by trying last year's URL with the year bumped. Dates may not be posted yet.">
        {sites.map(({ conf, site }) => (
          <li key={conf.id}>
            <div className="it-main">
              <a className="it-title" href={site.url} target="_blank" rel="noreferrer">{conf.acronym} {site.year} <Icon name="link" size={13} /></a>
              <div className="it-dates"><span className="kv"><i>First seen</i> {fmt(site.firstSeen ?? '')}</span></div>
              {site.evidence.length > 0 && <ul className="evidence">{site.evidence.slice(0, 6).map((h, i) => <li key={i}>{h}</li>)}</ul>}
            </div>
            <Avatar name={conf.owner} />
          </li>
        ))}
      </Section>

      <Section title="Due for a re-check" n={stale.length} hint="Verified more than 45 days ago and the deadline is still ahead.">
        {stale.map((r) => item(r, <>
          <button className="primary" onClick={() => verify(r)}>Still correct</button>
          <button onClick={() => setEdit(r)}>Edit</button>
        </>, <small className="muted">Last checked {fmt(r.checkedAt) || 'never'} by {r.checkedBy || '—'}</small>))}
      </Section>

      <Section title="Still estimated" n={estimated.length} hint="Not announced yet, so last year's dates are shown. They update on their own; enter real dates if you learn them first.">
        {estimated.slice(0, 40).map((r) => item(r, <button onClick={() => setEdit(r)}>Enter dates</button>))}
      </Section>

      {edit && <DeadlineModal row={edit} onClose={() => setEdit(null)} />}
      {open && <ConfDrawer row={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
