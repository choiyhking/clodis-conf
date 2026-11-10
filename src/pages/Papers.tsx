import { useMemo, useState } from 'react'
import { PAPER_STATUS, countdown, fmt, fmtShort, sortMembers } from '../logic'
import { useStore } from '../store'
import type { Paper } from '../types'
import { Avatar, Avatars, Icon, PaperModal, RESULT_LABEL, newPaper } from '../ui'

export default function Papers() {
  const { data, today, me } = useStore()
  const [paper, setPaper] = useState<Paper | null>(null)
  const [who, setWho] = useState('')
  const papers = data.papers.filter((p) => !who || p.members.includes(who))
  const cols = PAPER_STATUS

  const people = useMemo(
    () =>
      sortMembers(data.members).map((m) => {
        const mine = data.papers.filter((p) => p.members.includes(m.name))
        const hist = mine.flatMap((p) => p.history)
        return {
          m,
          writing: mine.filter((p) => p.status === 'writing').length,
          review: mine.filter((p) => p.status === 'submitted').length,
          acc: hist.filter((h) => h.result === 'accepted').length,
          rej: hist.filter((h) => h.result === 'rejected').length,
          next: mine.filter((p) => p.target && p.status === 'writing' && p.target.deadline >= today).map((p) => p.target!).sort((a, b) => a.deadline.localeCompare(b.deadline))[0],
        }
      }),
    [data, today],
  )
  const log = data.papers
    .flatMap((p) => p.history.map((h) => ({ ...h, title: p.title, members: p.members })))
    .sort((a, b) => b.deadline.localeCompare(a.deadline))

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Papers</h1>
          <p className="muted">Who is writing what, where it's going, and how past submissions went</p>
        </div>
        <button className="primary" onClick={() => setPaper(newPaper(me, today))}><Icon name="plus" size={14} /> New paper</button>
      </header>

      <div className="filters">
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person">
          <option value="">Everyone</option>{sortMembers(data.members).map((m) => <option key={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div className="board" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(190px, 1fr))` }}>
        {cols.map((s) => {
          const list = papers.filter((p) => p.status === s.key)
          return (
            <div className="col" key={s.key}>
              <h3><i className={`sdot ps-${s.key}`} /> {s.label} <span className="muted">{list.length}</span></h3>
              {list.map((p) => (
                <button className="pcard" key={p.id} onClick={() => setPaper(p)}>
                  <b>{p.title}</b>
                  {p.group && <span className="tag">{p.group}</span>}
                  {p.target && (
                    <span className="pc-target">
                      {p.target.label}
                      <small>
                        {s.key === 'submitted' ? ` · result ${p.target.noti ? `${fmtShort(p.target.noti)} (${countdown(p.target.noti, today)})` : 'TBD'}`
                          : s.key === 'writing' ? ` · ${fmtShort(p.target.deadline)} (${countdown(p.target.deadline, today)})` : ''}
                      </small>
                    </span>
                  )}
                  <span className="pc-foot">
                    <Avatars names={p.members} />
                    {p.history.length > 0 && <small className="muted">{p.history.length} earlier {p.history.length === 1 ? 'attempt' : 'attempts'}</small>}
                  </span>
                </button>
              ))}
              {list.length === 0 && <p className="col-empty muted">—</p>}
            </div>
          )
        })}
      </div>

      <div className="two">
        <div>
          <h2>People</h2>
          <div className="card">
            <table className="plain">
              <thead><tr><th>Member</th><th>In progress</th><th>In review</th><th>Accepted</th><th>Rejected</th><th>Next deadline</th></tr></thead>
              <tbody>
                {people.map(({ m, writing, review, acc, rej, next }) => (
                  <tr key={m.id}>
                    <td><span className="person"><Avatar name={m.name} /> {m.name} {m.role && <span className="tag">{m.role}</span>}</span></td>
                    <td>{writing || <span className="muted">–</span>}</td>
                    <td>{review || <span className="muted">–</span>}</td>
                    <td>{acc || <span className="muted">–</span>}</td>
                    <td>{rej || <span className="muted">–</span>}</td>
                    <td>{next ? <>{next.label} <small className="muted">{fmtShort(next.deadline)}</small></> : <span className="muted">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2>Submission log</h2>
          <div className="card">
            {log.length === 0 ? (
              <p className="empty">Results appear here when a paper is marked Accepted or Rejected.</p>
            ) : (
              <table className="plain">
                <thead><tr><th>Submitted</th><th>Venue</th><th>Paper</th><th>People</th><th>Result</th></tr></thead>
                <tbody>
                  {log.map((h, i) => (
                    <tr key={i}>
                      <td>{fmt(h.deadline)}</td><td>{h.label}</td><td>{h.title}</td><td><Avatars names={h.members} /></td>
                      <td><span className={`tag res-${h.result}`}>{RESULT_LABEL[h.result]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {paper && <PaperModal paper={paper} isNew={!data.papers.some((p) => p.id === paper.id)} onClose={() => setPaper(null)} />}
    </section>
  )
}
