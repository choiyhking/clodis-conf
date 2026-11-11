import { useEffect, useState } from 'react'
import { APP_NAME, LAB_NAME, isStale, newSites, sortMembers } from './logic'
import Inbox from './pages/Inbox'
import Lab from './pages/Lab'
import Papers from './pages/Papers'
import Schedule from './pages/Schedule'
import Timeline from './pages/Timeline'
import { MODE, supabase, useStore } from './store'
import { Avatar, Field, Icon, Modal } from './ui'

const TABS = [
  { key: 'deadlines', label: 'Deadlines', icon: 'calendar' },
  { key: 'timeline', label: 'Timeline', icon: 'timeline' },
  { key: 'papers', label: 'Papers', icon: 'papers' },
  { key: 'inbox', label: 'Inbox', icon: 'inbox' },
  { key: 'lab', label: 'Lab', icon: 'lab' },
] as const
type Tab = (typeof TABS)[number]['key']
const isTab = (h: string): h is Tab => TABS.some((t) => t.key === h)

const Logo = () => (
  <svg className="logo" viewBox="0 0 32 32" aria-hidden>
    <rect width="32" height="32" rx="8" />
    <path d="M10.5 22h11.8a4.2 4.2 0 0 0 .6-8.36A6.3 6.3 0 0 0 10.9 14.6 3.75 3.75 0 0 0 10.5 22Z" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M12.6 18.2h6.8M16 18.2v-3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="12.6" cy="18.2" r="1.35" fill="#fff" /><circle cx="19.4" cy="18.2" r="1.35" fill="#fff" /><circle cx="16" cy="15" r="1.35" fill="#fff" />
  </svg>
)

/** Accounts are created by the lab's admin; there is no sign-up. */
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
    setMsg(error ? 'Could not send the link. Ask the lab admin whether your account exists.' : 'Check your inbox for a sign-in link.')
  }
  return (
    <form className="login" onSubmit={(e) => { e.preventDefault(); void signIn() }}>
      <div className="brand"><Logo /> <b>{APP_NAME}</b></div>
      <p className="muted">Lab members sign in with the account the lab admin created for them.</p>
      <input type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      <input type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="primary" disabled={busy}>Sign in</button>
      <button type="button" className="link" onClick={sendLink} disabled={busy}>Email me a one-time sign-in link instead</button>
      {msg && <p role="status">{msg}</p>}
      <button type="button" className="link back" onClick={onBack}>← Back to deadlines</button>
    </form>
  )
}

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

export default function App() {
  const { ready, error, rows, data, today, me, setMe, session, guest, auto } = useStore()
  const [signingIn, setSigningIn] = useState(false)
  const [changePw, setChangePw] = useState(false)
  useEffect(() => { if (session) setSigningIn(false) }, [session])
  const [tab, setTab] = useState<Tab>(() => (isTab(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'deadlines'))
  useEffect(() => {
    location.hash = tab
    document.title = `${guest ? 'Deadlines' : TABS.find((t) => t.key === tab)!.label} · ${APP_NAME}`
  }, [tab, guest])
  useEffect(() => {
    // Follow the back button and hand-edited #tab URLs.
    const onHash = () => isTab(location.hash.slice(1)) && setTab(location.hash.slice(1) as Tab)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (!ready) return <p className="loading">Loading…</p>
  if (MODE === 'supabase' && guest && signingIn) return <Login onBack={() => setSigningIn(false)} />
  // A guest sees the deadlines and nothing else, whatever the address bar says.
  const tabs = guest ? TABS.filter((t) => t.key === 'deadlines') : TABS
  const shownTab: Tab = guest ? 'deadlines' : tab

  const mineOnly = (owner: string) => !me || owner === me
  const todo =
    rows.filter((r) => mineOnly(r.conf.owner) && (r.autoDiff || (r.deadline >= today && (r.status === 'auto' || isStale(r, today))))).length +
    newSites(data.conferences, data.deadlines, auto).filter((s) => mineOnly(s.conf.owner)).length
  const meRole = data.members.find((m) => m.name === me)?.role

  return (
    <div className="app">
      <aside className="side">
        <div className="brand" title={LAB_NAME}><Logo /> <b>{APP_NAME}</b></div>
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
              {MODE === 'supabase' && <button onClick={() => setSigningIn(true)}>Lab member sign in</button>}
            </div>
          )}
          {!guest && <label className="me">
            <Avatar name={me || '?'} dot />
            <span title={session ? `Signed in as ${session}` : undefined}>
              {MODE === 'supabase' && me ? (
                // Shared mode: identity follows the login. To change it, move the email in Lab → Members.
                <b className="me-name">
                  {me}
                  <button className="link" onClick={() => confirm(`Unlink ${session} from ${me}?`) && setMe('')}>Not you?</button>
                </b>
              ) : (
                <select
                  value={me}
                  aria-label="Who are you?"
                  onChange={(e) => {
                    const name = e.target.value
                    if (MODE === 'supabase' && name && !confirm(`Link ${session} to ${name}? You will act as ${name} from now on.`)) return
                    setMe(name)
                  }}
                >
                  <option value="">Who are you?</option>
                  {sortMembers(data.members).map((m) => <option key={m.id}>{m.name}</option>)}
                </select>
              )}
              <small className="muted">{meRole || (me ? 'Role not set' : MODE === 'supabase' ? 'Pick your name once' : 'Pick your name')}</small>
            </span>
          </label>}
          {!guest && MODE === 'supabase' && (
            <p className="account">
              <button className="link" onClick={() => setChangePw(true)}>Change password</button>
              <button className="link" onClick={() => confirm('Sign out?') && supabase!.auth.signOut()}>Sign out</button>
            </p>
          )}
          <p className="sync muted">
            <i className={'dot' + (auto ? ' ok' : '')} /> {auto ? `Dates collected ${auto.generatedAt.slice(0, 10)}` : 'Collector has not run'}
            {MODE === 'local' && <><br /><i className="dot warn" /> Local mode — not shared</>}
          </p>
        </div>
      </aside>
      <main>
        {error && <p className="error">Something went wrong: {error}</p>}
        {shownTab === 'deadlines' && <Schedule />}
        {shownTab === 'timeline' && <Timeline />}
        {shownTab === 'papers' && <Papers />}
        {shownTab === 'inbox' && <Inbox />}
        {shownTab === 'lab' && <Lab />}
      </main>
      {changePw && <PasswordModal onClose={() => setChangePw(false)} />}
    </div>
  )
}
