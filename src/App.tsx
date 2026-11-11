import { useEffect, useState } from 'react'
import { APP_NAME, LAB_NAME, isStale, newSites, sortMembers } from './logic'
import Inbox from './pages/Inbox'
import Lab from './pages/Lab'
import Papers from './pages/Papers'
import Schedule from './pages/Schedule'
import Timeline from './pages/Timeline'
import { MODE, supabase, useStore } from './store'
import { Avatar, Icon } from './ui'

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

function Login() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const send = async () => {
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } })
    setMsg(error ? 'Could not send the link: ' + error.message : 'Check your inbox for a sign-in link.')
  }
  return (
    <div className="login">
      <div className="brand"><Logo /> <b>{APP_NAME}</b></div>
      <p className="muted">Sign in with the email your lab registered for you.</p>
      <input type="email" placeholder="you@university.ac.kr" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
      <button className="primary" onClick={send}>Email me a sign-in link</button>
      {msg && <p>{msg}</p>}
    </div>
  )
}

export default function App() {
  const { ready, error, rows, data, today, me, setMe, session, auto } = useStore()
  const [tab, setTab] = useState<Tab>(() => (isTab(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'deadlines'))
  useEffect(() => {
    location.hash = tab
    document.title = `${TABS.find((t) => t.key === tab)!.label} · ${APP_NAME}`
  }, [tab])
  useEffect(() => {
    // Follow the back button and hand-edited #tab URLs.
    const onHash = () => isTab(location.hash.slice(1)) && setTab(location.hash.slice(1) as Tab)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (!ready) return <p className="loading">Loading…</p>
  if (MODE === 'supabase' && !session) return <Login />

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
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)} aria-current={tab === t.key ? 'page' : undefined}>
              <Icon name={t.icon} size={17} /> <span>{t.label}</span>
              {t.key === 'inbox' && todo > 0 && <span className="count">{todo}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <label className="me">
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
          </label>
          <p className="sync muted">
            <i className={'dot' + (auto ? ' ok' : '')} /> {auto ? `Dates collected ${auto.generatedAt.slice(0, 10)}` : 'Collector has not run'}
            {MODE === 'local' && <><br /><i className="dot warn" /> Local mode — not shared</>}
          </p>
        </div>
      </aside>
      <main>
        {error && <p className="error">Something went wrong: {error}</p>}
        {tab === 'deadlines' && <Schedule />}
        {tab === 'timeline' && <Timeline />}
        {tab === 'papers' && <Papers />}
        {tab === 'inbox' && <Inbox />}
        {tab === 'lab' && <Lab />}
      </main>
    </div>
  )
}
