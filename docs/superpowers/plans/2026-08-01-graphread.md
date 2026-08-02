# GraphRead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a document into an interactive entity/relation graph where every node and edge traces back to the passage that asserted it. Deployed at `labs.abdash.net/graphread`.

**Architecture:** Coarse chunks go to `graphread-extract`, which returns strict JSON entities and relations, each relation carrying a verbatim supporting quote. The client validates every quote against its source chunk and **drops relations that fail** — the anti-hallucination gate. Entity resolution runs in two browser passes, lexical then embedding-based. Rendering is WebGL 2D force-directed.

**Tech Stack:** Vite 8 · React 19 · TypeScript 6 · `@labs/doc-core` · `react-force-graph-2d` · `@labs/platform`.

## Global Constraints

- **Prerequisites: the platform plan, Recto Task 1 (`@labs/doc-core`), and RAG Lab Task 4 (`raglab-embed`) are complete.** GraphRead reuses the embedding proxy rather than adding a second one.
- Chunking uses `chunkPages` with `maxChars: 2500` — a parameter, never a fork.
- Extraction via OpenRouter `MODEL_CHEAP` with structured output.
- **Every relation must carry a quote that is a verbatim substring of its chunk.** Relations failing validation are dropped, always, with the drop count surfaced.
- Budget: 50 MB Postgres, 50 MB Storage. Page cap 60.
- Vite `base: '/graphread/'`.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## Task 1: Extraction contract and the quote gate

**Files:**
- Create: `supabase/functions/graphread-extract/index.ts`
- Create: `apps/graphread/src/lib/validate.ts`, `validate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const ENTITY_TYPES = ['person','organization','place','concept','event','artifact','date'] as const
  export type EntityType = typeof ENTITY_TYPES[number]
  export interface RawEntity { name: string; type: EntityType; description: string }
  export interface RawRelation { source: string; relation: string; target: string; quote: string }
  export interface ChunkExtraction { chunkId: string; entities: RawEntity[]; relations: RawRelation[] }
  export function validateExtraction(x: ChunkExtraction, chunkText: string):
    { kept: RawRelation[]; dropped: RawRelation[] }
  ```

- [ ] **Step 1: Write the failing quote-gate tests**

```ts
import { describe, it, expect } from 'vitest'
import { validateExtraction } from './validate'

const text = 'Dr. Sarah Chen founded Helix Labs in 2019. The company later merged with Orbit.'

const rel = (quote: string) => ({ source: 'a', relation: 'founded', target: 'b', quote })

describe('validateExtraction', () => {
  it('keeps a relation whose quote is a verbatim substring', () => {
    const r = validateExtraction({ chunkId: 'c1', entities: [], relations: [rel('Dr. Sarah Chen founded Helix Labs')] }, text)
    expect(r.kept).toHaveLength(1)
  })

  it('drops a fabricated quote', () => {
    const r = validateExtraction({ chunkId: 'c1', entities: [], relations: [rel('Sarah Chen sold Helix Labs to Orbit')] }, text)
    expect(r.kept).toHaveLength(0)
    expect(r.dropped).toHaveLength(1)
  })

  it('tolerates whitespace normalisation but not word changes', () => {
    const spaced = validateExtraction({ chunkId: 'c1', entities: [], relations: [rel('Dr.  Sarah   Chen founded\nHelix Labs')] }, text)
    expect(spaced.kept).toHaveLength(1)
    const altered = validateExtraction({ chunkId: 'c1', entities: [], relations: [rel('Dr. Sara Chen founded Helix Labs')] }, text)
    expect(altered.kept).toHaveLength(0)
  })

  it('drops an empty or single-word quote as unsupportive', () => {
    expect(validateExtraction({ chunkId: 'c1', entities: [], relations: [rel('')] }, text).kept).toHaveLength(0)
    expect(validateExtraction({ chunkId: 'c1', entities: [], relations: [rel('founded')] }, text).kept).toHaveLength(0)
  })
})
```

Whitespace tolerance matters because PDF extraction introduces line breaks the model will not reproduce exactly; word-level tolerance does not, because that is where hallucination hides.

- [ ] **Step 2: Run, confirm failure, implement**

Normalize both sides with `.replace(/\s+/g, ' ').trim()` before the substring test. Require a minimum of three words in the quote.

- [ ] **Step 3: Write the Edge Function**

Strict JSON schema over `{ entities, relations }`, system prompt fixing the seven entity types and instructing lowercase verb-phrase relations plus a verbatim quote for each. Consume `graphread:extractions` quota once per document, on the first chunk only.

- [ ] **Step 4: Run tests, deploy, commit**

---

## Task 2: Entity resolution

**Files:**
- Create: `apps/graphread/src/lib/resolve.ts`, `resolve.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ResolvedNode { id: string; name: string; type: EntityType; aliases: string[]; description: string; mentions: number; chunkIds: string[] }
  export function normalizeName(n: string): string
  export function lexicalPass(entities: { entity: RawEntity; chunkId: string }[]): ResolvedNode[]
  export async function embeddingPass(nodes: ResolvedNode[], threshold?: number): Promise<ResolvedNode[]>
  ```

- [ ] **Step 1: Write the failing tests — the type gate is the important one**

```ts
describe('lexicalPass', () => {
  it('merges case and honorific variants', () => {
    const nodes = lexicalPass([
      e('Dr. Sarah Chen', 'person'), e('sarah chen', 'person'), e('Sarah Chen', 'person'),
    ])
    expect(nodes).toHaveLength(1)
    expect(nodes[0]!.aliases.sort()).toContain('Dr. Sarah Chen')
    expect(nodes[0]!.mentions).toBe(3)
  })

  it('refuses to merge the same name with different types', () => {
    const nodes = lexicalPass([e('Orbit', 'organization'), e('Orbit', 'artifact')])
    expect(nodes).toHaveLength(2)
  })

  it('does not merge a surname into a full name lexically', () => {
    // "Chen" alone is ambiguous; that merge is the embedding pass's job, gated by type
    expect(lexicalPass([e('Sarah Chen', 'person'), e('Chen', 'person')])).toHaveLength(2)
  })
})

describe('embeddingPass', () => {
  it('merges type-compatible near-duplicates above threshold', async () => { ... })
  it('never merges across incompatible types even at high similarity', async () => {
    // 'Helix Labs' (organization) vs 'Helix' (artifact) — similar text, different type
    const out = await embeddingPass([org('Helix Labs'), artifact('Helix')], 0.8)
    expect(out).toHaveLength(2)
  })
})
```

The type gate prevents the most common and most embarrassing failure: a company and a product with the same name collapsing into one node.

- [ ] **Step 2: Implement**

`normalizeName` lowercases, strips honorifics (`dr|mr|mrs|ms|prof`), punctuation and extra whitespace. `lexicalPass` groups on `(normalizedName, type)`. `embeddingPass` embeds `name + ': ' + description` via `raglab-embed`, compares cosine within type groups only, and merges above the threshold with union-find so alias chains resolve transitively.

- [ ] **Step 3: Run and commit**

---

## Task 3: Graph assembly with provenance

**Files:**
- Create: `apps/graphread/src/lib/graph.ts`, `graph.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface GraphEdge { id: string; source: string; target: string; relation: string; weight: number; evidence: { chunkId: string; quote: string }[] }
  export interface Graph { nodes: ResolvedNode[]; edges: GraphEdge[]; stats: { chunks: number; droppedRelations: number } }
  export function assemble(extractions: ChunkExtraction[], nodes: ResolvedNode[], chunkTexts: Map<string, string>): Graph
  ```

- [ ] **Step 1: Write tests**

Assert: relation endpoints resolve to merged node ids via alias lookup; a relation whose endpoint resolves to nothing is dropped; repeated relations collapse into one edge with `weight` incremented and both quotes retained; and `droppedRelations` counts quote-gate failures.

- [ ] **Step 2: Implement, run, commit**

---

## Task 4: Schema and permalinks

**Files:**
- Create: `supabase/migrations/0005_graphread.sql`
- Create: `tests/rls/graphread.test.ts`

- [ ] **Step 1: Write the migration**

```sql
create schema if not exists graphread;
grant usage on schema graphread to anon, authenticated, service_role;

create table graphread.graphs (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  owner_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  doc_name    text not null,
  doc_path    text,
  nodes       jsonb not null,
  edges       jsonb not null,
  corrections jsonb not null default '[]'::jsonb,
  stats       jsonb,
  created_at  timestamptz not null default now()
);

alter table graphread.graphs enable row level security;

create policy graphs_own on graphread.graphs for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy graphs_public on graphread.graphs for select to anon, authenticated
  using (true);

grant select, insert, update, delete on graphread.graphs to authenticated;
grant select on graphread.graphs to anon;
```

Nodes and edges are stored as JSONB in one row rather than normalized tables: a graph is always read whole, never queried by node, and one row keeps a permalink to a single fetch.

- [ ] **Step 2: RLS tests — public read by slug, owner-only write**

- [ ] **Step 3: Commit**

---

## Task 5: Visualization and provenance panel

**Files:**
- Create: `apps/graphread/src/components/{GraphView,NodePanel,EdgePanel,Filters}.tsx`

- [ ] **Step 1: Render with `react-force-graph-2d`**

Size by degree, color by entity type, hover highlights the neighbourhood. 2D, not 3D — prettier is not more legible.

- [ ] **Step 2: Node panel showing provenance**

Description, aliases, relations grouped by type, and the source quotes. Clicking an edge shows its quotes. This is the same citation ethic as Recto and is the reason to trust the graph.

- [ ] **Step 3: Search, type filter chips, and neighbourhood isolation on double-click**

- [ ] **Step 4: Live growth during extraction**

Nodes appear as chunks complete. Thirty to ninety seconds of a graph assembling itself is good theatre and doubles as honest progress.

- [ ] **Step 5: Verify 60fps while dragging the demo graph on a mid-range laptop**

---

## Task 6: Merge and split corrections

**Files:**
- Create: `apps/graphread/src/lib/corrections.ts`, `corrections.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Correction = { kind: 'merge'; ids: string[] } | { kind: 'split'; id: string; alias: string }
  export function applyCorrections(g: Graph, cs: Correction[]): Graph
  ```

Automatic resolution will make mistakes. Converting the hardest failure mode into a user-facing feature is better than pretending it does not happen.

- [ ] **Step 1: Write tests**

Assert merge combines aliases, mentions and edges without duplicating evidence; split extracts one alias into its own node and moves only the edges whose quote mentions that alias; and corrections are order-independent and idempotent.

- [ ] **Step 2: Implement, wire drag-to-merge and a split control into the node panel, persist to `corrections`**

- [ ] **Step 3: Verify a shared permalink reopens with corrections applied**

- [ ] **Step 4: Commit**

---

## Task 7: Demo graph, cost estimate, deploy

- [ ] **Step 1: Build the demo graph at build time from a public-domain text**

Committed as static JSON so the card demo is instant and costs nothing.

- [ ] **Step 2: Pre-run cost estimate with the 60-page cap**

- [ ] **Step 3: Run the quality audits from the spec**

Sample 30 edges and confirm at least 90% have quotes that genuinely support the relation. Run a 40-page report and confirm the ten most-connected entities are recognizably its protagonists, with a duplicate rate under 10% before correction. Record both results in the README.

- [ ] **Step 4: Deploy and verify at 360 px and desktop**

---

## Definition of done

- [ ] Lint, typecheck and tests pass.
- [ ] Every relation in a rendered graph has a quote that is a verbatim substring of its chunk; dropped count is surfaced in the UI.
- [ ] Resolution tests cover alias chains, same-name-different-type, and embedding-similar-but-type-incompatible — all passing.
- [ ] Demo graph renders in under 3 s and stays smooth while dragging.
- [ ] 30-edge manual audit at ≥90% supported; 40-page duplicate rate under 10%.
- [ ] A shared permalink opens the identical graph including corrections.
- [ ] GraphRead imports `@labs/doc-core` and `raglab-embed`; no duplicated chunking or embedding code exists.
