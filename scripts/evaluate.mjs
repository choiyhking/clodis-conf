// How often does the crawler agree with dates a human already verified?   node scripts/evaluate.mjs
import { readFileSync } from 'node:fs'

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'))
const auto = load('auto.json'), deadlines = load('deadlines.json'), confs = load('conferences.json')

let total = 0, reached = 0, hadDates = 0, exact = 0, partial = 0
const wrong = [], unread = []
for (const c of confs) {
  const mine = deadlines.filter((d) => d.confId === c.id && d.status === 'verified' && d.url)
  if (!mine.length) continue
  const year = Math.max(...mine.map((d) => d.year))
  const truth = mine.filter((d) => d.year === year).map((d) => d.deadline).sort()
  total++
  const ed = auto.crawl[c.id]?.find((e) => e.year === year)
  if (!ed) {
    unread.push(c.acronym + ' (unreachable)')
    continue
  }
  reached++
  if (!ed.rounds.length) {
    unread.push(c.acronym)
    continue
  }
  hadDates++
  const got = ed.rounds.map((r) => r.deadline)
  const hit = truth.filter((t) => got.includes(t)).length
  if (hit === truth.length && got.length === truth.length) exact++
  else {
    if (hit > 0) partial++
    wrong.push(`${c.acronym}: verified ${truth.join(', ')} | crawler ${got.join(', ')}`)
  }
}
console.log({ total, reached, hadDates, exact, partial })
console.log('\nNo dates read:', unread.join(', '))
console.log('\nDisagreements:\n' + wrong.join('\n'))
