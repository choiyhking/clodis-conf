export interface Conf {
  id: string
  acronym: string
  name: string
  area: string
  kiise: string // KIISE (Korean Institute of Information Scientists and Engineers) rank: 'S' | 'A' | ''
  bk: number | null // BK21 recognised IF: 1–4
  blind: string
  owner: string // member who keeps this conference's dates correct
  ccfddl?: string // key in the ccfddl dataset, e.g. "DB/sigmod"
}

export type DeadlineStatus = 'verified' | 'auto' | 'estimated'

export interface Deadline {
  id: string
  confId: string
  year: number // conference edition
  round: string // "1/2", or "" for single-round conferences
  abstract: string
  deadline: string
  noti: string
  event: string
  location: string
  url: string
  status: DeadlineStatus
  notiEstimated?: boolean
  checkedAt: string
  checkedBy: string
  source: string
  note: string
  autoSig?: string // the collected value at the time a person confirmed; a later change raises "Changed"
}

export interface Round {
  abstract: string
  deadline: string
  noti: string
  comment?: string
  time?: string // "23:59" — time of day of the deadline, when the source states it
}

/** What the UI renders: stored deadlines merged with collected data and last-year estimates. */
export interface Row extends Deadline {
  conf: Conf
  virtual: boolean // not stored yet (collected or estimated)
  derivedFrom?: string // for estimates: last year's deadline this was projected from
  autoDiff?: Round & { link?: string; source: string } // collected value disagrees with the confirmed one
  sources?: string[] // which collectors reported this deadline: 'ccfddl' | 'site'
  evidence?: string[] // lines of the conference page the dates were read from
  time?: string // deadline time of day, e.g. "23:59"
  tz?: string // timezone that time is in, e.g. "AoE" or "UTC-8"
  at: number // the exact moment submissions close, as a UTC timestamp (see closesAt)
}

export interface CcfEdition {
  year: number
  link: string
  place: string
  date: string
  timezone?: string
  rounds: Round[]
}
export interface CrawlEdition {
  year: number
  url: string
  rounds: Round[]
  evidence: string[]
  fetchedAt: string
  firstSeen?: string
}
export interface AutoData {
  generatedAt: string
  ccfddl: Record<string, { title: string; editions: CcfEdition[] }>
  crawl: Record<string, CrawlEdition[]>
}

// research: being worked on, no venue chosen yet → writing: aimed at a deadline → submitted → accepted / rejected
export type PaperStatus = 'research' | 'writing' | 'submitted' | 'accepted' | 'rejected'

export interface PaperTarget {
  confId: string
  label: string // "SIGMOD R2/4"
  deadline: string
  noti: string
}
export interface PaperHistory {
  label: string
  deadline: string
  result: 'accepted' | 'rejected' | 'withdrawn'
  date: string
}
export interface Paper {
  id: string
  title: string
  group: string // research topic
  members: string[]
  start: string
  status: PaperStatus
  target: PaperTarget | null
  history: PaperHistory[]
  note: string
  link: string // legacy single link; new data uses `links`
  links?: string[]
}

export const ROLES = ['Professor', 'Postdoc', 'PhD', 'MS', 'Undergrad', 'Alumni'] as const
export type Role = (typeof ROLES)[number] | ''

export interface Member {
  id: string
  name: string
  email: string
  role: Role
}

/** One line of the activity log: who changed what, and when. */
export interface LogEntry {
  id: string
  at: string // ISO timestamp
  by: string
  text: string
}

export interface Data {
  conferences: Conf[]
  deadlines: Deadline[]
  papers: Paper[]
  members: Member[]
  log: LogEntry[]
}
export type Coll = keyof Data
