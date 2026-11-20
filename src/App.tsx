import { useEffect, useState } from 'react'
import { APP_NAME, LAB_NAME, sortMembers } from './logic'
import Inbox from './pages/Inbox'
import Lab from './pages/Lab'
import Papers from './pages/Papers'
import Schedule from './pages/Schedule'
import Timeline from './pages/Timeline'
import { MODE, supabase, useStore } from './store'
import { Avatar, Icon, Modal } from './ui'

const TABS = [
  { key: 'deadlines', label: 'Deadlines', icon: 'calendar' },
  { key: 'timeline', label: 'Timeline', icon: 'timeline' },
  { key: 'papers', label: 'Research', icon: 'papers' },
  { key: 'inbox', label: 'Inbox', icon: 'inbox' },
  { key: 'lab', label: 'Lab', icon: 'lab' },
] as const
type Tab = (typeof TABS)[number]['key']
const isTab = (h: string): h is Tab => TABS.some((t) => t.key === h)

/** Lab members come in by invite link; this form is for the admin (and anyone the admin made an account for). */
function Login({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const signIn = async () => {
    if (!email || !password) return setMsg('Enter your email and password.')
    setBusy(true)
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setMsg(/invalid/i.test(error.message) ? 'Wrong email or password.' : error.message)
  }
  // For an account that has no password yet (or forgot it): a one-time link, then set a password from the sidebar.
  const sendLink = async () => {
    if (!email) return setMsg('Enter your email first.')
    setBusy(true)
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.href.split('#')[0] } })
    setBusy(false)
    setMsg(error ? 'Could not send the link. Only accounts the admin created can sign in.' : 'Check your inbox for a sign-in link.')
  }
  return (
    <form className="login" onSubmit={(e) => { e.preventDefault(); void signIn() }}>
      <div className="brand"><b>{APP_NAME}</b></div>
      <p className="muted">For the lab admin. Lab members do not sign in: open the invite link you were given.</p>
      <input type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      <input type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="primary" disabled={busy}>Sign in</button>
      <button type="button" className="link" onClick={sendLink} disabled={busy}>Email me a one-time sign-in link instead</button>
      {msg && <p role="status">{msg}</p>}
      <button type="button" className="link back" onClick={onBack}>← Back to deadlines</button>
    </form>
  )
}

/** Picks who this browser acts as. Shown once when nobody is picked yet, and from the sidebar to switch. */
function NameModal({ onClose }: { onClose: () => void }) {
  const { data, me, setMe } = useStore()
  return (
    <Modal title="Who are you?" onClose={onClose}>
      <p className="muted">Pick your name so your changes show up under it. This browser remembers it.</p>
      <div className="name-pick">
        {sortMembers(data.members).map((m) => (
          <button key={m.id} className={m.name === me ? 'on' : ''} aria-pressed={m.name === me} onClick={() => { setMe(m.name); onClose() }}>{m.name}</button>
        ))}
      </div>
      <footer><span className="grow" /><button onClick={onClose}>{me ? 'Cancel' : 'Not now'}</button></footer>
    </Modal>
  )
}

export default function App() {
  const { ready, error, rows, data, today, me, session, guest, joined } = useStore()
  const [askedName, setAskedName] = useState(false)
  const [pickName, setPickName] = useState(false)
  // The admin's sign-in is out of the way: the "#admin" address, or the button at the bottom of the Lab page.
  const [signingIn, setSigningIn] = useState(() => MODE === 'supabase' && location.hash === '#admin')
  useEffect(() => { if (session) setSigningIn(false) }, [session])
  const [tab, setTab] = useState<Tab>(() => (isTab(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'deadlines'))
  useEffect(() => {
    if (!signingIn) location.hash = tab
    document.title = `${guest ? 'Deadlines' : TABS.find((t) => t.key === tab)!.label} · ${APP_NAME}`
  }, [tab, guest, signingIn])
  useEffect(() => {
    // Follow the back button and hand-edited #tab URLs.
    const onHash = () => {
      if (location.hash === '#admin') setSigningIn(MODE === 'supabase')
      else if (isTab(location.hash.slice(1))) setTab(location.hash.slice(1) as Tab)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (!ready) return <p className="loading">Loading…</p>
  if (MODE === 'supabase' && !session && signingIn) return <Login onBack={() => setSigningIn(false)} />
  // A guest sees the deadlines and nothing else, whatever the address bar says.
  const tabs = guest ? TABS.filter((t) => t.key === 'deadlines') : TABS
  const shownTab: Tab = guest ? 'deadlines' : tab

  const mineOnly = (owner: string) => !me || owner === me
  // The badge counts what waits for a decision: collected dates to confirm, and verified dates that changed.
  const todo = rows.filter((r) => mineOnly(r.conf.owner) && (r.autoDiff || (r.deadline >= today && r.status === 'auto'))).length
  const meRole = data.members.find((m) => m.name === me)?.role

  return (
    <div className="app">
      <aside className="side">
        <div className="brand" title={LAB_NAME}><b>{APP_NAME}</b></div>
        <nav>
          {tabs.map((t) => (
            <button key={t.key} className={shownTab === t.key ? 'on' : ''} onClick={() => setTab(t.key)} aria-current={shownTab === t.key ? 'page' : undefined}>
              <Icon name={t.icon} size={17} /> <span>{t.label}</span>
              {t.key === 'inbox' && todo > 0 && <span className="count">{todo}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          {guest && (
            <div className="guest-box">
              <p className="muted">Public view — conference deadlines only.</p>
              {MODE === 'supabase' && <p className="muted">Lab members: open your invite link.</p>}
            </div>
          )}
          {!guest && (
            <button className="me" onClick={() => setPickName(true)} title={me ? 'Switch to another name' : 'Pick your name'}>
              <Avatar name={me || '?'} dot />
              <span className="me-text">
                <b>{me || 'Pick your name'}</b>
                <small className="muted">{me ? meRole || 'Role not set' : 'Not picked yet'}</small>
              </span>
              <Icon name="down" size={14} />
            </button>
          )}
          {MODE === 'local' && <p className="sync muted"><i className="dot warn" /> Local mode — not shared</p>}
        </div>
      </aside>
      <main>
        {error && <p className="error">Something went wrong: {error}</p>}
        {joined === 'bad' && guest && <p className="error">That invite link does not work any more. Ask the lab admin for the current one.</p>}
        {shownTab === 'deadlines' && <Schedule />}
        {shownTab === 'timeline' && <Timeline />}
        {shownTab === 'papers' && <Papers />}
        {shownTab === 'inbox' && <Inbox />}
        {shownTab === 'lab' && <Lab />}
      </main>
      {/* Nobody picked yet (first visit by invite link, or the admin on a new browser): ask once per page load. */}
      {!guest && data.members.length > 0 && (pickName || (MODE === 'supabase' && !me && !askedName)) && <NameModal onClose={() => { setPickName(false); setAskedName(true) }} />}
    </div>
  )
}
