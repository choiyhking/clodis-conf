import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  session: string | null // signed-in email (supabase mode)
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
  const today = todayStr()

  const persistLocal = (d: Data) => localStorage.setItem(LS_KEY, JSON.stringify(d))

  const reload = useCallback(async () => {
    try {
      setError('')
      getJson<AutoData>('auto.json').then(setAuto).catch(() => setAuto(null))
      if (!supabase) {
        const raw = localStorage.getItem(LS_KEY)
        const d: Data = raw ? { ...EMPTY, ...JSON.parse(raw) } : await loadSeed()
        if (!raw) persistLocal(d)
        setData(d)
      } else {
        const { data: s } = await supabase.auth.getSession()
        setSession(s.session?.user.email ?? null)
        if (!s.session) return setData(EMPTY)
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

  useEffect(() => {
    reload()
    if (!supabase) return
    const { data: sub } = supabase.auth.onAuthStateChange(() => reload())
    const onFocus = () => reload() // pick up changes made by others
    window.addEventListener('focus', onFocus)
    return () => {
      sub.subscription.unsubscribe()
      window.removeEventListener('focus', onFocus)
    }
  }, [reload])

  // Who "me" is.
  //  - shared mode: whoever's member entry carries the signed-in email. It is not a free choice, so
  //    nobody ends up acting as someone else by accident; picking a name once links the account to it.
  //  - local mode: a plain per-browser choice.
  const sameEmail = (a: string) => !!session && a.trim().toLowerCase() === session.toLowerCase()
  const me = supabase ? (data.members.find((m) => sameEmail(m.email))?.name ?? '') : localMe

  const setMe = (name: string) => {
    if (!supabase) {
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

  const save: Ctx['save'] = async (coll, doc) => {
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
    <StoreCtx.Provider value={{ data, rows, auto, today, ready, error, me, setMe, session, save, remove, replaceAll, reload }}>
      {children}
    </StoreCtx.Provider>
  )
}
