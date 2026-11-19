import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildRows, describeChange, todayStr, uid } from './logic'
import type { AutoData, Coll, Conf, Data, Deadline, LogEntry, Member, Row } from './types'

/**
 * Two storage back-ends behind one interface:
 *  - local    : no env vars set. Everything lives in this browser's localStorage (for trying it out alone).
 *  - supabase : VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY set. Shared by the whole lab.
 * Both store plain "collection + id + JSON document" records.
 */
const SB_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase: SupabaseClient | null = SB_URL && SB_KEY ? createClient(SB_URL, SB_KEY) : null
export const MODE = supabase ? 'supabase' : 'local'

const LS_KEY = 'labconf:data:v1'
const LS_ME = 'labconf:me'
const EMPTY: Data = { conferences: [], deadlines: [], papers: [], members: [], log: [] }
const COLLS = Object.keys(EMPTY) as Coll[]

/** Local mode has no accounts; "?guest" in the address previews what a signed-out visitor sees. */
const PREVIEW_GUEST = !supabase && new URLSearchParams(location.search).has('guest')
/**
 * A lab member's invite link ends in "#join=<code>". The code is taken out of the address bar straight away
 * (so it is not left in a screenshot or a shared screen) and spent on the first load below.
 */
const INVITE = /^#join=([\w-]{16,})$/.exec(location.hash)?.[1] ?? ''
if (INVITE) history.replaceState(null, '', location.pathname + location.search + '#deadlines')
let pendingInvite = supabase ? INVITE : ''
// An invite link pasted into a tab that already has the site open only changes the hash: start over with it.
window.addEventListener('hashchange', () => { if (/^#join=/.test(location.hash)) location.reload() })
export const inviteUrl = (code: string) => `${location.origin}${location.pathname}#join=${code}`
export type Access = 'admin' | 'member' | null

/** What the public may see of a conference / deadline: no owner, no checker, no free-text note. */
const publicConf = (c: Conf): Conf => ({ ...c, owner: '' })
const publicDeadline = (d: Deadline): Deadline => ({ ...d, checkedBy: '', note: '' })

const getJson = async <T,>(path: string): Promise<T> => (await fetch(`./data/${path}`, { cache: 'no-cache' })).json()

export async function loadSeed(): Promise<Data> {
  const [conferences, deadlines] = await Promise.all([
    getJson<Conf[]>('conferences.json'),
    getJson<Deadline[]>('deadlines.json'),
  ])
  const names = [...new Set(conferences.map((c) => c.owner).filter(Boolean))]
  // Roles are unknown at import time; the professor entry is a placeholder to rename in Lab settings.
  const members: Member[] = [
    { id: 'professor', name: '교수님', email: '', role: 'Professor' },
    ...names.map((name) => ({ id: name, name, email: '', role: '' as const })),
  ]
  return { conferences, deadlines, papers: [], members, log: [] }
}

interface Ctx {
  data: Data
  rows: Row[]
  auto: AutoData | null
  today: string
  ready: boolean
  error: string
  me: string
  setMe: (name: string) => void
  session: string | null // signed-in email (supabase mode); null for a browser that joined by invite link
  /** Shared mode: 'admin' (may issue the invite link), 'member' (joined by link or has an account), or null. */
  access: Access
  /** No access: deadlines only, read-only, and no names. */
  guest: boolean
  /** This page load used an invite link: 'ok' or 'bad' (wrong or replaced link). */
  joined: '' | 'ok' | 'bad'
  save: <K extends Coll>(coll: K, doc: Data[K][number]) => Promise<void>
  remove: (coll: Coll, id: string) => Promise<void>
  replaceAll: (data: Data) => Promise<void>
  reload: () => Promise<void>
}
const StoreCtx = createContext<Ctx>(null as unknown as Ctx)
export const useStore = () => useContext(StoreCtx)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(EMPTY)
  const [auto, setAuto] = useState<AutoData | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [localMe, setLocalMe] = useState(() => localStorage.getItem(LS_ME) ?? '')
  const [session, setSession] = useState<string | null>(null)
  const [access, setAccess] = useState<Access>(null)
  const [joined, setJoined] = useState<Ctx['joined']>('')
  const queue = useRef<Promise<void>>(Promise.resolve())
  const today = todayStr()

  const persistLocal = (d: Data) => localStorage.setItem(LS_KEY, JSON.stringify(d))

  const load = useCallback(async () => {
    try {
      setError('')
      getJson<AutoData>('auto.json').then(setAuto).catch(() => setAuto(null))
      if (!supabase) {
        const raw = localStorage.getItem(LS_KEY)
        const d: Data = raw ? { ...EMPTY, ...JSON.parse(raw) } : await loadSeed()
        if (!raw) persistLocal(d)
        setData(PREVIEW_GUEST ? { ...EMPTY, conferences: d.conferences.map(publicConf), deadlines: d.deadlines.map(publicDeadline) } : d)
      } else {
        let user = (await supabase.auth.getSession()).data.session?.user ?? null
        if (pendingInvite) {
          // Opened by invite link: this browser gets a nameless session of its own, and the database
          // lets it in if the code is the current one.
          const code = pendingInvite
          pendingInvite = ''
          if (!user) user = (await supabase.auth.signInAnonymously()).data.user
          const ok = user ? (await supabase.rpc('join_lab', { p_code: code })).data === true : false
          setJoined(ok ? 'ok' : 'bad')
        }
        let role: Access = null
        if (user) {
          const { data: r, error } = await supabase.rpc('my_access')
          // Before invite-link.sql is installed there is no such function: every account is a member, as before.
          role = error ? (user.is_anonymous ? null : 'member') : ((r as Access) ?? null)
        }
        setSession(user?.email || null)
        setAccess(role)
        if (!role) {
          // No access: only what the database hands to anyone — conferences and deadlines with the names removed.
          // (Until that function is installed, fall back to the dates shipped with the site.)
          const { data: pub, error } = await supabase.rpc('public_docs')
          if (error || !pub) {
            const seed = await loadSeed()
            return setData({ ...EMPTY, conferences: seed.conferences.map(publicConf), deadlines: seed.deadlines.map(publicDeadline) })
          }
          const d: Data = { ...EMPTY, conferences: [], deadlines: [] }
          for (const doc of pub as { coll: string; data: unknown }[]) {
            if (doc.coll === 'conferences') d.conferences.push(publicConf(doc.data as Conf))
            else if (doc.coll === 'deadlines') d.deadlines.push(publicDeadline(doc.data as Deadline))
          }
          return setData(d)
        }
        const { data: docs, error } = await supabase.from('docs').select('coll,id,data').limit(10000)
        if (error) throw error
        const d: Data = { conferences: [], deadlines: [], papers: [], members: [], log: [] }
        for (const doc of docs ?? []) (d[doc.coll as Coll] as unknown[] | undefined)?.push(doc.data)
        setData(d)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReady(true)
    }
  }, [])
  // One load at a time: signing in fires a reload of its own, which must not overtake the load that joined.
  const reload = useCallback(() => (queue.current = queue.current.then(load)), [load])

  useEffect(() => {
    reload()
    if (!supabase) return
    // Deferred: the auth client must not be called back into from inside its own event.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (event !== 'INITIAL_SESSION' && event !== 'TOKEN_REFRESHED') setTimeout(reload, 0) })
    const onFocus = () => reload() // pick up changes made by others
    window.addEventListener('focus', onFocus)
    return () => {
      sub.subscription.unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  // Who "me" is.
  //  - an account (email): whoever's member entry carries the signed-in email. It is not a free choice, so
  //    nobody ends up acting as someone else by accident; picking a name once links the account to it.
  //  - joined by invite link, or local mode: a plain choice remembered by this browser.
  const sameEmail = (a: string) => !!session && a.trim().toLowerCase() === session.toLowerCase()
  const byEmail = !!supabase && !!session
  const me = byEmail ? (data.members.find((m) => sameEmail(m.email))?.name ?? '') : data.members.some((m) => m.name === localMe) || !supabase ? localMe : ''

  const setMe = (name: string) => {
    if (!byEmail) {
      localStorage.setItem(LS_ME, name)
      return setLocalMe(name)
    }
    if (!session) return
    for (const m of data.members) {
      if (m.name === name && !sameEmail(m.email)) void save('members', { ...m, email: session })
      else if (m.name !== name && sameEmail(m.email)) void save('members', { ...m, email: '' })
    }
  }

  /** Activity-log entry for a change, or null when it isn't worth a line. */
  const logEntry = (coll: Coll, prev: unknown, next: unknown): LogEntry | null => {
    if (coll === 'log') return null
    const text = describeChange(coll, prev, next, data)
    return text ? { id: uid(), at: new Date().toISOString(), by: me || session || 'unknown', text } : null
  }

  const guest = supabase ? !access : PREVIEW_GUEST

  const save: Ctx['save'] = async (coll, doc) => {
    if (guest) return
    const entry = logEntry(coll, (data[coll] as { id: string }[]).find((x) => x.id === doc.id), doc)
    setData((prev) => {
      const list = prev[coll] as { id: string }[]
      const next = list.some((x) => x.id === doc.id) ? list.map((x) => (x.id === doc.id ? doc : x)) : [...list, doc]
      const d = { ...prev, [coll]: next, ...(entry ? { log: [...prev.log, entry] } : {}) } as Data
      if (!supabase) persistLocal(d)
      return d
    })
    if (supabase) {
      const stamp = { updated_at: new Date().toISOString(), updated_by: session ?? me }
      const { error } = await supabase
        .from('docs')
        .upsert([{ coll, id: doc.id, data: doc, ...stamp }, ...(entry ? [{ coll: 'log', id: entry.id, data: entry, ...stamp }] : [])])
      if (error) setError(error.message)
    }
  }

  const remove: Ctx['remove'] = async (coll, id) => {
    if (guest) return
    const entry = logEntry(coll, (data[coll] as { id: string }[]).find((x) => x.id === id), undefined)
    setData((prev) => {
      const d = { ...prev, [coll]: (prev[coll] as { id: string }[]).filter((x) => x.id !== id), ...(entry ? { log: [...prev.log, entry] } : {}) } as Data
      if (!supabase) persistLocal(d)
      return d
    })
    if (supabase) {
      const { error } = await supabase.from('docs').delete().eq('coll', coll).eq('id', id)
      if (error) return setError(error.message)
      if (entry) await supabase.from('docs').upsert({ coll: 'log', id: entry.id, data: entry, updated_at: entry.at, updated_by: session ?? me })
    }
  }

  const replaceAll: Ctx['replaceAll'] = async (d) => {
    if (guest) return
    const full = { ...EMPTY, ...d }
    if (!supabase) {
      persistLocal(full)
      setData(full)
      return
    }
    const now = new Date().toISOString()
    const docs = COLLS.flatMap((coll) =>
      (full[coll] as { id: string }[]).map((doc) => ({ coll, id: doc.id, data: doc, updated_at: now, updated_by: session ?? me })),
    )
    for (let i = 0; i < docs.length; i += 200) {
      const { error } = await supabase.from('docs').upsert(docs.slice(i, i + 200))
      if (error) return setError(error.message)
    }
    await reload()
  }

  // Older data may still carry the retired 'idea' / 'dropped' statuses; show those papers as researching.
  useEffect(() => {
    const retired = (s: string) => s === 'idea' || s === 'dropped'
    if (data.papers.some((p) => retired(p.status)))
      setData((d) => ({ ...d, papers: d.papers.map((p) => (retired(p.status) ? { ...p, status: 'research' as const } : p)) }))
  }, [data.papers])

  const rows = useMemo(() => buildRows(data.conferences, data.deadlines, auto, today), [data, auto, today])

  return (
    <StoreCtx.Provider value={{ data, rows, auto, today, ready, error, me, setMe, session, access, guest, joined, save, remove, replaceAll, reload }}>
      {children}
    </StoreCtx.Provider>
  )
}
