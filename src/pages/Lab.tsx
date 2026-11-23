import { useRef, useState, type ReactNode } from 'react'
import { demoData, isDemo, withSampleRoles } from '../demo'
import { fmt, obsoleteDeadlines, roleRank, sortMembers, uid } from '../logic'
import { MODE, inviteUrl, loadSeed, supabase, useStore } from '../store'
import { ROLES, type Data, type Member, type Role } from '../types'
import { Avatar, Field, Icon, Modal } from '../ui'

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [msg, setMsg] = useState('')
  const submit = async () => {
    if (a.length < 8) return setMsg('Use at least 8 characters.')
    if (a !== b) return setMsg('The two passwords do not match.')
    const { error } = await supabase!.auth.updateUser({ password: a })
    if (error) return setMsg(error.message)
    alert('Password changed.')
    onClose()
  }
  return (
    <Modal title="Change password" onClose={onClose}>
      <form className="grid" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <Field label="New password" span><input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} autoFocus /></Field>
        <Field label="Again" span><input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} /></Field>
        {msg && <p className="span" role="status">{msg}</p>}
        <footer className="span">
          <span className="grow" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary">Save</button>
        </footer>
      </form>
    </Modal>
  )
}

/** One line of a settings card: what it is on the left, what you can do on the right. */
const Row = ({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) => (
  <div className="set-row">
    <div className="set-text"><b>{title}</b><p className="muted">{children}</p></div>
    {actions && <div className="set-acts">{actions}</div>}
  </div>
)

export default function Lab() {
  const { data, rows, today, save, remove, replaceAll, session, access, me, setMe } = useStore()
  const [invite, setInvite] = useState('')
  const [inviteMsg, setInviteMsg] = useState('')
  /** Fetch the current link (or replace it) and put it on the clipboard. */
  const getInvite = async (replace: boolean) => {
    if (replace && !confirm('Replace the invite link? The old link stops working, and everyone who joined with it must open the new one.')) return
    const { data: code, error } = await supabase!.rpc(replace ? 'rotate_invite' : 'invite_code')
    if (error || !code) return setInviteMsg(error?.message ?? 'Could not get the link.')
    const url = inviteUrl(code as string)
    setInvite(url)
    try {
      await navigator.clipboard.writeText(url)
      setInviteMsg(replace ? 'New link copied. The old one no longer works.' : 'Copied.')
    } catch {
      setInviteMsg('Copy the link below.')
    }
  }
  const [name, setName] = useState('')
  const [changePw, setChangePw] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const [role, setRole] = useState<Role>('')
  const file = useRef<HTMLInputElement>(null)

  const add = async () => {
    if (!name.trim()) return
    if (data.members.some((m) => m.name === name.trim())) return alert('Someone with that name already exists.')
    await save('members', { id: uid(), name: name.trim(), role })
    setName('')
  }
  /** Names are how conferences and papers refer to people, so a rename has to follow them everywhere. */
  const rename = async (m: Member, next: string) => {
    next = next.trim()
    if (!next || next === m.name) return
    if (data.members.some((x) => x.name === next)) return alert('Someone with that name already exists.')
    await save('members', { ...m, name: next })
    for (const c of data.conferences.filter((c) => c.owner === m.name)) await save('conferences', { ...c, owner: next })
    for (const d of data.deadlines.filter((d) => d.checkedBy === m.name)) await save('deadlines', { ...d, checkedBy: next })
    for (const p of data.papers.filter((p) => p.members.includes(m.name))) await save('papers', { ...p, members: p.members.map((x) => (x === m.name ? next : x)) })
    if (me === m.name) setMe(next)
  }
  const exportJson = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }))
    a.download = `clodis-conf-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importJson = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as Data
      if (!Array.isArray(d.conferences) || !Array.isArray(d.deadlines)) throw new Error('not a backup file')
      if (confirm(`Import ${d.conferences.length} conferences, ${d.deadlines.length} deadlines and ${d.papers?.length ?? 0} papers? Items with the same id are overwritten.`)) await replaceAll(d)
    } catch (e) {
      alert('Import failed: ' + (e instanceof Error ? e.message : e))
    }
  }
  const seed = async () => {
    const msg = MODE === 'local'
      ? 'This erases everything stored in this browser and reloads the original spreadsheet data. Continue?'
      : 'This writes the original spreadsheet conferences and deadlines into the shared database, overwriting items with the same id. Continue?'
    if (!confirm(msg)) return
    const s = await loadSeed()
    await replaceAll(MODE === 'local' ? s : { ...s, papers: data.papers, members: data.members.length ? data.members : s.members })
  }

  // Old deadlines are never deleted behind anyone's back; this lists the ones that are safe to drop.
  const obsolete = obsoleteDeadlines(data.deadlines, today)
  const cleanUp = async () => {
    if (!confirm(`Delete ${obsolete.length} deadlines that closed over a year ago and have a newer edition on record? This cannot be undone.`)) return
    for (const d of obsolete) await remove('deadlines', d.id)
  }

  const hasDemo = [...data.papers, ...data.members, ...data.deadlines].some(isDemo)
  /** Fill the site with removable examples of every feature (see demo.ts). */
  const loadDemo = async () => {
    const roled = withSampleRoles(data.members)
    for (const m of roled) if (m.role !== data.members.find((x) => x.id === m.id)!.role) await save('members', m)
    const demo = demoData(rows, roled, today)
    for (const m of demo.members) await save('members', m)
    for (const d of demo.deadlines) await save('deadlines', d)
    for (const p of demo.papers) await save('papers', p)
  }
  const clearDemo = async () => {
    if (!confirm('Remove all sample members, papers and deadlines? Real data is not touched.')) return
    for (const p of data.papers.filter(isDemo)) await remove('papers', p.id)
    for (const d of data.deadlines.filter(isDemo)) await remove('deadlines', d.id)
    for (const m of data.members.filter(isDemo)) await remove('members', m.id)
  }

  const members = sortMembers(data.members)
  const groups = [...new Set(members.map((m) => m.role))].sort((a, b) => roleRank(a) - roleRank(b))

  return (
    <section className="lab">
      <header className="page-head">
        <div>
          <h1>Lab</h1>
          <p className="muted">Members, activity and data</p>
        </div>
      </header>

      <div className="lab-cols">
        <div>
          <h2>Members <span className="muted">{members.length}</span></h2>
          <div className="card mlist">
            {groups.map((g) => (
              <div key={g || 'none'} className="mgroup">
                <h3>{g || 'Role not set'} <span>{members.filter((m) => m.role === g).length}</span></h3>
                {members.filter((m) => m.role === g).map((m) => (
                  <div key={m.id} className="mrow">
                    <Avatar name={m.name} dot />
                    <input className="m-name" defaultValue={m.name} key={m.name} aria-label="Name" onBlur={(e) => rename(m, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                    <select value={m.role} onChange={(e) => save('members', { ...m, role: e.target.value as Role })} aria-label="Role">
                      <option value="">Role not set</option>{ROLES.map((r) => <option key={r}>{r}</option>)}
                    </select>
                    <button className="ghost" aria-label={`Remove ${m.name}`} title="Remove" onClick={() => confirm(`Remove ${m.name}? Their conferences and papers keep the name.`) && remove('members', m.id)}><Icon name="close" size={14} /></button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mrow new card">
            <Icon name="plus" size={14} />
            <input className="m-name" placeholder="Add a member: name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="New member name" />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role"><option value="">Role</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
            <button className="primary" onClick={add} disabled={!name.trim()}>Add</button>
          </div>
        </div>

        <div>
          <h2>Activity</h2>
          <div className="card activity">
            {data.log.length === 0 ? (
              <p className="empty">Changes to dates, papers, conferences and members are recorded here.</p>
            ) : (
              <ul>
                {[...data.log].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 200).map((e) => (
                  <li key={e.id}>
                    <time title={e.at}>{new Date(e.at).toLocaleString('sv-SE').slice(0, 16)}</time>
                    <span className="who">{data.members.some((m) => m.name === e.by) ? <Avatar name={e.by} size={20} whole /> : e.by}</span>
                    <span>{e.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <h2>Data</h2>
      <div className="card settings">
        <Row title={MODE === 'local' ? 'Local mode' : 'Shared database'}>
          {MODE === 'local'
            ? 'Everything is stored in this browser only. Connect Supabase (see README) to share it with the lab.'
            : session ? `You are signed in as ${session}.` : 'This browser joined with the invite link.'}
        </Row>
        <Row title="Backup" actions={<>
          <button onClick={exportJson}>Download</button>
          <button onClick={() => file.current?.click()}>Restore</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </>}>
          Save everything as one file, or load such a file back in. Restoring overwrites items with the same id.
        </Row>
        <Row title="Old deadlines" actions={<>
          {obsolete.length > 0 && <button onClick={() => setShowOld(!showOld)} aria-expanded={showOld}>{showOld ? 'Hide list' : 'Show list'}</button>}
          <button onClick={cleanUp} disabled={obsolete.length === 0}>Clean up ({obsolete.length})</button>
        </>}>
          Deadlines that closed over a year ago and have a newer edition on record. The latest closed edition of each conference is always kept.
        </Row>
        {showOld && obsolete.length > 0 && (
          <ul className="set-list">
            {[...obsolete].sort((x, y) => x.deadline.localeCompare(y.deadline)).map((d) => (
              <li key={d.id}>
                <b>{data.conferences.find((c) => c.id === d.confId)?.acronym ?? d.confId}{d.round ? ` R${d.round}` : ''}</b>
                <span className="muted">{d.year}</span>
                <span>closed {fmt(d.deadline)}</span>
              </li>
            ))}
          </ul>
        )}
        {MODE === 'local' && (
          <Row title="Spreadsheet data" actions={<button onClick={seed}>Reset</button>}>
            Erase what this browser holds and start again from the original spreadsheet.
          </Row>
        )}
        <Row title="Sample data" actions={hasDemo ? <button onClick={clearDemo}>Remove</button> : <button onClick={loadDemo}>Load</button>}>
          Example members, papers and deadlines for trying the site out. Removing them leaves real data alone.
        </Row>
      </div>

      {access === 'admin' && (
        <>
          <h2>Admin</h2>
          <div className="card settings admin">
            <Row title="Invite link" actions={<button className="primary" onClick={() => getInvite(false)}>Copy link</button>}>
              Anyone who opens this link sees and edits everything, with no sign-in. Share it with lab members only.
              {inviteMsg && <span className="set-msg" role="status"> {inviteMsg}</span>}
            </Row>
            {invite && <div className="set-row"><input className="invite-url" readOnly value={invite} onFocus={(e) => e.target.select()} aria-label="Invite link" /></div>}
            <Row title="Replace the invite link" actions={<button className="danger-btn" onClick={() => getInvite(true)}>Replace</button>}>
              The current link stops working and everyone who joined with it is signed out. Do this if the link got out.
            </Row>
            {session && (
              <Row title="Admin account" actions={<>
                <button onClick={() => setChangePw(true)}>Change password</button>
                <button onClick={() => confirm('Sign out?') && supabase!.auth.signOut()}>Sign out</button>
              </>}>
                Signed in as {session}.
              </Row>
            )}
          </div>
        </>
      )}
      {supabase && !session && <p className="lab-foot"><button className="link" onClick={() => (location.hash = 'admin')}>Admin sign in</button></p>}
      {changePw && <PasswordModal onClose={() => setChangePw(false)} />}
    </section>
  )
}
