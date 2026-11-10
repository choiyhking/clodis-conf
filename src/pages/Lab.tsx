import { useRef, useState } from 'react'
import { DEMO_PREFIX, demoPapers } from '../demo'
import { roleRank, sortMembers, uid } from '../logic'
import { MODE, loadSeed, supabase, useStore } from '../store'
import { ROLES, type Data, type Member, type Role } from '../types'
import { Avatar, Icon } from '../ui'

export default function Lab() {
  const { data, rows, today, save, remove, replaceAll, session, me, setMe } = useStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('MS')
  const file = useRef<HTMLInputElement>(null)

  const add = async () => {
    if (!name.trim()) return
    if (data.members.some((m) => m.name === name.trim())) return alert('Someone with that name already exists.')
    await save('members', { id: uid(), name: name.trim(), email: email.trim(), role })
    setName('')
    setEmail('')
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
    a.download = `camera-ready-backup-${new Date().toISOString().slice(0, 10)}.json`
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

  const hasDemo = data.papers.some((p) => p.id.startsWith(DEMO_PREFIX))
  const loadDemo = async () => {
    // Roles drive the grouping on the Timeline, so give unset members one to make the sample readable.
    const withRoles = data.members.map((m, i) => (m.role ? m : { ...m, role: (i % 2 ? 'PhD' : 'MS') as Role }))
    for (const m of withRoles) if (m.role !== data.members.find((x) => x.id === m.id)!.role) await save('members', m)
    for (const p of demoPapers(rows, withRoles, today)) await save('papers', p)
  }
  const clearDemo = async () => {
    for (const p of data.papers.filter((p) => p.id.startsWith(DEMO_PREFIX))) await remove('papers', p.id)
  }

  const members = sortMembers(data.members)
  const groups = [...new Set(members.map((m) => m.role))].sort((a, b) => roleRank(a) - roleRank(b))

  return (
    <section className="lab">
      <header className="page-head">
        <div>
          <h1>Lab</h1>
          <p className="muted">Members, roles and data</p>
        </div>
      </header>

      <h2>Members</h2>
      {groups.map((g) => (
        <div key={g || 'none'} className="role-group">
          <h3>{g || 'Role not set'} <span className="muted">{members.filter((m) => m.role === g).length}</span></h3>
          <div className="card">
            <table className="plain members">
              <tbody>
                {members.filter((m) => m.role === g).map((m) => (
                  <tr key={m.id}>
                    <td className="m-name">
                      <Avatar name={m.name} size={26} />
                      <input defaultValue={m.name} key={m.name} aria-label="Name" onBlur={(e) => rename(m, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                    </td>
                    <td>
                      <select value={m.role} onChange={(e) => save('members', { ...m, role: e.target.value as Role })} aria-label="Role">
                        <option value="">Role not set</option>{ROLES.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </td>
                    <td><input defaultValue={m.email} placeholder="email (links their login)" aria-label="Email" onBlur={(e) => e.target.value.trim() !== m.email && save('members', { ...m, email: e.target.value.trim() })} /></td>
                    <td className="muted">owns {data.conferences.filter((c) => c.owner === m.name).length} conferences · on {data.papers.filter((p) => p.members.includes(m.name)).length} papers</td>
                    <td>
                      <button className="ghost" aria-label={`Remove ${m.name}`} onClick={() => confirm(`Remove ${m.name}? Their conferences and papers keep the name.`) && remove('members', m.id)}><Icon name="close" size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div className="filters add-member">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role">{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
        <input placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="primary" onClick={add}><Icon name="plus" size={14} /> Add member</button>
      </div>

      <h2>Data</h2>
      <div className="card pad">
        <p>
          <b>{MODE === 'local' ? 'Local mode' : 'Shared database (Supabase)'}</b>{' '}
          <span className="muted">
            {MODE === 'local'
              ? '— everything is stored in this browser only. Connect Supabase (see README) to share it with the lab.'
              : `— signed in as ${session ?? 'nobody'}`}
          </span>
        </p>
        <div className="filters">
          <button onClick={exportJson}>Download backup</button>
          <button onClick={() => file.current?.click()}>Restore backup</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <button onClick={seed}>{MODE === 'local' ? 'Reset to spreadsheet data' : 'Import spreadsheet data'}</button>
          {hasDemo ? <button onClick={clearDemo}>Remove sample papers</button> : <button onClick={loadDemo}>Load sample papers</button>}
          {supabase && session && <button onClick={() => supabase!.auth.signOut()}>Sign out</button>}
        </div>
      </div>
    </section>
  )
}
