/**
 * Compiles the concierge's knowledge base into a single markdown dossier.
 *
 * Run:  node --experimental-strip-types scripts/build-dossier.ts
 *
 * The dossier is generated rather than pasted, and committed rather than built
 * at deploy time, for two reasons:
 *
 *   - Regenerating after a site edit is one command, so the agent's facts and
 *     the site's facts cannot quietly drift apart.
 *   - Because the output is in git, any change to what the agent will say about
 *     a real person shows up in a diff and gets reviewed, instead of appearing
 *     silently in production.
 *
 * Every extractor below fails loudly. A regex that stops matching because a
 * component was reformatted must break the build, never emit an empty section:
 * a dossier with a missing Experience block would not look broken, it would
 * look like someone with no job history.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/dossier.md')

/**
 * The Edge Function cannot read the site repo at deploy time, so the dossier is
 * also emitted as a TypeScript module into the labs repo. Both copies are
 * written by this one command, because a concierge answering from a stale
 * dossier is the exact failure this script exists to prevent.
 *
 * Override with `--edge <path>`, or skip with `--no-edge`.
 */
const EDGE_DEFAULT = join(
  ROOT,
  '../abdash-labs/supabase/functions/concierge-turn/dossier.ts',
)

const SOURCES = {
  index: 'src/pages/index.astro',
  experience: 'src/components/islands/ExperienceTimeline.tsx',
  projects: 'src/components/islands/ProjectsShowcase.svelte',
  skills: 'src/components/islands/SkillsGrid.vue',
  specs: 'docs/superpowers/specs',
} as const

/** The seven AI-tab projects, in lineup order, with their spec slugs. */
const AI_PROJECTS = [
  'recto',
  'concierge',
  'asksheet',
  'critiq',
  'raglab',
  'graphread',
  'planemode',
] as const

/* ── failure ────────────────────────────────────────────────────────────── */

class ExtractionError extends Error {
  constructor(what: string, file: string) {
    super(
      `build-dossier: could not extract ${what} from ${file}.\n` +
        `The component changed shape. Fix the extractor in scripts/build-dossier.ts — ` +
        `do not hand-edit src/data/dossier.md, it is overwritten on every run.`,
    )
    this.name = 'ExtractionError'
  }
}

function must<T>(value: T | null | undefined, what: string, file: string): T {
  if (value === null || value === undefined) throw new ExtractionError(what, file)
  return value
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

/* ── html/text helpers ──────────────────────────────────────────────────── */

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}

function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** The markup of one tab panel in index.astro, bounded by the next panel. */
function panel(source: string, id: string): string {
  const start = source.indexOf(`id="panel-${id}"`)
  if (start === -1) throw new ExtractionError(`the "${id}" panel`, SOURCES.index)
  const next = source.indexOf('id="panel-', start + 1)
  return source.slice(start, next === -1 ? undefined : next)
}

/* ── literal extraction ─────────────────────────────────────────────────── */

/**
 * Finds the `]` closing the `[` at `open`, ignoring brackets inside string
 * literals. The skills array embeds inline SVG full of brackets and quotes, so
 * naive counting is not enough.
 */
function matchBracket(source: string, open: number, file: string): number {
  let depth = 0
  let quote: string | null = null

  for (let i = open; i < source.length; i++) {
    const ch = source[i]
    if (quote !== null) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if (ch === '[') depth++
    else if (ch === ']' && --depth === 0) return i
  }
  throw new ExtractionError('a balanced array literal', file)
}

/**
 * Pulls a declared array of plain data out of a source file and evaluates it.
 *
 * These arrays are literal data in our own repo — no imports, no calls — so
 * evaluating them in an empty context is exact where a regex would be a
 * guess, and it handles the embedded SVG and apostrophes correctly.
 */
function arrayLiteral<T>(file: string, declaration: string): T[] {
  const source = read(file)
  const at = source.indexOf(declaration)
  if (at === -1) throw new ExtractionError(`\`${declaration}\``, file)

  const open = source.indexOf('[', at + declaration.length - 1)
  if (open === -1) throw new ExtractionError(`the array after \`${declaration}\``, file)

  const literal = source.slice(open, matchBracket(source, open, file) + 1)
  const value = runInNewContext(`(${literal})`, Object.create(null)) as T[]

  if (!Array.isArray(value) || value.length === 0) {
    throw new ExtractionError(`a non-empty array for \`${declaration}\``, file)
  }
  return value
}

/* ── the extracted shapes ───────────────────────────────────────────────── */

interface Job {
  role: string
  company: string
  location: string
  period: string
  highlights: string[]
  promoted?: boolean
}

interface Project {
  title: string
  description: string
  tech: string[]
  category: string
}

interface Skill {
  name: string
  category: string
}

/* ── identity ───────────────────────────────────────────────────────────── */

function identity(index: string) {
  const name = text(
    must(index.match(/<h1 class="profile-name">([\s\S]*?)<\/h1>/)?.[1], 'the name', SOURCES.index),
  )
  const title = text(
    must(
      index.match(/<p class="profile-title">([\s\S]*?)<\/p>/)?.[1],
      'the job title',
      SOURCES.index,
    ),
  )
  const email = must(index.match(/mailto:([^"]+)/)?.[1], 'the email address', SOURCES.index)
  const github = must(
    index.match(/github\.com\/([A-Za-z0-9_-]+)/)?.[1],
    'the GitHub handle',
    SOURCES.index,
  )
  const linkedin = must(
    index.match(/linkedin\.com\/in\/([A-Za-z0-9_-]+)/)?.[1],
    'the LinkedIn handle',
    SOURCES.index,
  )
  const availability = text(
    must(
      index.match(/<div class="available-badge">([\s\S]*?)<\/div>/)?.[1],
      'the availability badge',
      SOURCES.index,
    ),
  )
  return { name, title, email, github, linkedin, availability }
}

function aboutParagraphs(index: string): string[] {
  const about = panel(index, 'about')
  const block = must(
    about.match(/<div class="about-text">([\s\S]*?)<\/div>/)?.[1],
    'the About copy',
    SOURCES.index,
  )
  const paragraphs = [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]))
  if (paragraphs.length === 0) throw new ExtractionError('About paragraphs', SOURCES.index)
  return paragraphs
}

function highlights(index: string): Array<{ label: string; value: string }> {
  // Split into individual cards first. Running the label/value pattern over the
  // whole panel lets it backtrack past the `<strong>` tags inside the About
  // prose and swallow a whole paragraph as a "label".
  const cards = panel(index, 'about').split('<div class="highlight-card').slice(1)
  if (cards.length === 0) throw new ExtractionError('the About highlight cards', SOURCES.index)

  return cards.map((card) => {
    const m = must(
      card.match(/<strong>([\s\S]*?)<\/strong>\s*<span[^>]*>([\s\S]*?)<\/span/),
      'a highlight card label and value',
      SOURCES.index,
    )
    return { label: text(m[1]), value: text(m[2]) }
  })
}

function headlineStats(index: string): Array<{ value: string; label: string }> {
  const found = [
    ...index.matchAll(
      /<span class="stat-value">([\s\S]*?)<\/span>\s*<span class="stat-label"[^>]*>([\s\S]*?)<\/span/g,
    ),
  ]
  if (found.length === 0) throw new ExtractionError('the headline stats', SOURCES.index)
  return found.map((m) => ({ value: text(m[1]), label: text(m[2]) }))
}

/* ── derived facts ──────────────────────────────────────────────────────── */

/**
 * Career start, taken from the earliest job on the timeline.
 *
 * Derived rather than copied, because the site's "4+ years" badge is a hand
 * written string that ages badly, while the timeline's dates do not.
 */
function careerStart(jobs: Job[]): { month: number; year: number } {
  const starts = jobs.map((j) => {
    const m = must(j.period.match(/^(\d{2})\/(\d{4})/), `a start date in "${j.period}"`, SOURCES.experience)
    return { month: Number(m[1]), year: Number(m[2]) }
  })
  starts.sort((a, b) => a.year - b.year || a.month - b.month)
  return starts[0]
}

function yearsSince(start: { month: number; year: number }, now: Date): number {
  const months = (now.getFullYear() - start.year) * 12 + (now.getMonth() + 1 - start.month)
  return Math.floor(months / 12)
}

/* ── specs ──────────────────────────────────────────────────────────────── */

function spec(slug: string): { name: string; subtitle: string; oneLiner: string; file: string } {
  const rel = `${SOURCES.specs}/2026-08-01-${slug}-design.md`
  const md = read(rel)

  const heading = must(md.match(/^#\s+(.+?)\s*$/m)?.[1], 'the spec title', rel)
    .replace(/\s*—\s*Design\s*$/, '')
  const [name, ...rest] = heading.split(/\s*—\s*/)

  const oneLiner = must(md.match(/\*\*One-liner:\*\*\s*([\s\S]*?)\n\s*\n/)?.[1], 'the one-liner', rel)

  return {
    name: name.trim(),
    subtitle: rest.join(' — ').trim(),
    oneLiner: oneLiner.replace(/\s+/g, ' ').trim(),
    file: rel,
  }
}

/* ── document ───────────────────────────────────────────────────────────── */

function build(): string {
  const index = read(SOURCES.index)
  const now = new Date()

  const who = identity(index)
  const about = aboutParagraphs(index)
  const cards = highlights(index)
  const stats = headlineStats(index)
  const jobs = arrayLiteral<Job>(SOURCES.experience, 'const jobs: Job[] =')
  const projects = arrayLiteral<Project>(SOURCES.projects, 'const projects: Project[] =')
  const skills = arrayLiteral<Skill>(SOURCES.skills, 'const skills: Skill[] =')

  const start = careerStart(jobs)
  const years = yearsSince(start, now)
  // By the dated entry, not by array position.
  const current = must(
    jobs.find((j) => /present/i.test(j.period)),
    'a current role (no entry has an open-ended period)',
    SOURCES.experience,
  )
  const companies = [...new Set(jobs.map((j) => j.company))]

  const specs = AI_PROJECTS.map(spec)
  const platform = spec('platform')

  const byCategory = new Map<string, string[]>()
  for (const s of skills) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, [])
    byCategory.get(s.category)!.push(s.name)
  }

  const sourceList = [
    SOURCES.index,
    SOURCES.experience,
    SOURCES.projects,
    SOURCES.skills,
    ...specs.map((s) => s.file),
    platform.file,
  ]

  const out: string[] = []
  const w = (line = '') => out.push(line)

  /* header */
  w('<!-- generated by build-dossier -->')
  w('<!-- Do not edit by hand. Regenerate: node --experimental-strip-types scripts/build-dossier.ts -->')
  w(`<!-- Generated: ${now.toISOString().slice(0, 10)} -->`)
  w('<!-- Sources:')
  for (const s of sourceList) w(`     ${s}`)
  w('-->')
  w()

  w(`# Dossier — ${who.name}`)
  w()
  w(
    'This is the complete knowledge base for the site concierge. The assistant answers only from ' +
      'this document. Anything not written here is something it does not know.',
  )
  w()

  /* identity */
  w('## Who he is')
  w()
  w(`- **Name:** ${who.name}`)
  w(`- **Title:** ${who.title}`)
  w(`- **Based in:** ${current.location}`)
  w(`- **Currently:** ${current.role} at ${current.company} (${current.period})`)
  w(`- **Availability:** ${who.availability}`)
  for (const c of cards) w(`- **${c.label}:** ${c.value}`)
  w(`- **Email:** ${who.email}`)
  w(`- **GitHub:** github.com/${who.github}`)
  w(`- **LinkedIn:** linkedin.com/in/${who.linkedin}`)
  w('- **Website:** abdash.net')
  w()

  /* about */
  w('## About')
  w()
  w(
    '*The two paragraphs below are his own site copy, written in the first person. Relay them ' +
      'in the third person — the assistant speaks about him, never as him.*',
  )
  w()
  for (const p of about) {
    w(p)
    w()
  }

  /* experience */
  w('## Experience')
  w()
  w(
    `His first professional role began ${String(start.month).padStart(2, '0')}/${start.year}. ` +
      `The site describes this as "${stats[0]?.value ?? '4+'} years"; measured from that date it ` +
      `is roughly ${years} years as of ${now.toISOString().slice(0, 7)}. ` +
      `${jobs.length} roles are listed below.`,
  )
  w()
  for (const job of jobs) {
    w(`### ${job.role} — ${job.company}`)
    w()
    w(`*${job.location} · ${job.period}${job.promoted ? ' · promoted into this role' : ''}*`)
    w()
    for (const h of job.highlights) w(`- ${h}`)
    w()
  }

  /* projects */
  w('## Projects')
  w()
  w('Work and personal projects, as listed on the site.')
  w()
  for (const p of projects) {
    w(`### ${p.title}`)
    w()
    w(p.description)
    w()
    w(`*Category: ${p.category} · Tech: ${p.tech.join(', ')}*`)
    w()
  }

  /* skills */
  w('## Skills')
  w()
  for (const [category, names] of byCategory) {
    w(`- **${category}:** ${names.join(', ')}`)
  }
  w()

  /* ai tab */
  w('## The AI tab projects')
  w()
  w(
    '**Status: these seven are in active development, not shipped products.** They are being ' +
      'built through 2026 as a single program sharing one platform layer — one monorepo, one ' +
      'Cloudflare Pages origin, one Supabase project, one login across all of them. Describe ' +
      'them as in progress or in build. Do not describe any of them as live, launched, ' +
      'released, or in production, and do not offer links to them.',
  )
  w()
  for (const s of specs) {
    w(`### ${s.name}${s.subtitle ? ` — ${s.subtitle}` : ''}`)
    w()
    w(s.oneLiner)
    w()
  }

  w('### The shared platform behind them')
  w()
  w(platform.oneLiner)
  w()
  w(
    'The concierge you are speaking to now is one of the seven. Its voice loop — turn-taking, ' +
      'barge-in, silence detection and interrupt handling — is implemented directly against the ' +
      "browser's Web Speech API rather than bought from a hosted voice platform.",
  )
  w()

  /* accuracy */
  w('## Accuracy rules')
  w()
  w('- Everything the assistant says about him must come from this document.')
  w('- Speak about him in the third person. Never answer as him.')
  w(
    '- Prefer the dated Experience entries over the headline figures. The entries are generated ' +
      'from the timeline; the figures are hand-written site copy and can be stale.',
  )
  w(`  Site headline figures: ${stats.map((s) => `${s.value} ${s.label}`).join(' · ')}.`)
  // Derived from the timeline, never hardcoded: the earlier version pinned a
  // literal "4 companies" against the site headline, which went stale the moment
  // that headline was corrected to "4 Roles".
  w(
    `- Employment counts: ${companies.length} distinct employers ` +
      `(${companies.join(', ')}) across ${jobs.length} roles. There are more roles than ` +
      'employers because more than one role was held at the same company. State it that ' +
      'way when asked; never conflate a role count with an employer count.',
  )
  w('- Never invent an employer, a date, a job title, a technology, or a project.')
  w(
    '- If a question is about something not covered here, say so plainly and suggest emailing ' +
      `${who.email}.`,
  )
  w('- Compensation is not covered here and is a conversation for a human.')
  w()

  return out.join('\n')
}

/* ── main ───────────────────────────────────────────────────────────────── */

/** Escapes the dossier for a TypeScript template literal. */
function edgeModule(markdown: string): string {
  const escaped = markdown
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
  return [
    '// Generated by scripts/build-dossier.ts in the abdash.github.io repo.',
    '// Do not edit here. Regenerate with:',
    '//   node --experimental-strip-types scripts/build-dossier.ts',
    '//',
    '// Inlined rather than fetched because an Edge Function has no access to the',
    '// site repo, and because the agent should never be able to start answering',
    '// from a knowledge base that failed to load.',
    '',
    `export const DOSSIER = \`${escaped}\``,
    '',
  ].join('\n')
}

const markdown = build()
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, markdown, 'utf8')

const args = process.argv.slice(2)
const edgeFlag = args.indexOf('--edge')
const edgePath = args.includes('--no-edge')
  ? null
  : edgeFlag !== -1
    ? args[edgeFlag + 1]
    : EDGE_DEFAULT

let edgeNote = 'skipped (--no-edge)'
if (edgePath) {
  if (existsSync(dirname(edgePath))) {
    writeFileSync(edgePath, edgeModule(markdown), 'utf8')
    edgeNote = edgePath
  } else {
    // Loud, not silent: a missing labs checkout must not look like success.
    edgeNote = `NOT WRITTEN — no such directory: ${dirname(edgePath)}`
  }
}

console.log(
  `build-dossier: wrote ${relative(ROOT, OUT)} — ` +
    `${markdown.length.toLocaleString()} chars, ${markdown.split('\n').length} lines\n` +
    `build-dossier: edge copy ${edgeNote}`,
)
