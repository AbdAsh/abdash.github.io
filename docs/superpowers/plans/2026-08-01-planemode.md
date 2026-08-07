# PlaneMode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PWA that runs a small LLM entirely in the browser via WebGPU — install it, turn on airplane mode, keep chatting. Deployed at `labs.abdash.net/planemode`.

**Architecture:** WebLLM runs in a Web Worker so the UI never blocks. Weights stream from the HuggingFace CDN into WebLLM's own cache. A service worker scoped to `/planemode/` precaches the app shell. Conversations live in IndexedDB. There is no backend of any kind.

**Tech Stack:** Vite 8 · React 19 · TypeScript 6 · `@mlc-ai/web-llm` · `vite-plugin-pwa` · `idb`.

## Global Constraints

- **PlaneMode has no Postgres schema, no storage allocation, no Edge Function, no quota, and no LLM spend.** It is a static bundle and nothing else.
- **No login, ever.** The shared session exists on this origin but PlaneMode must never read it, depend on it, or prompt for it. Do **not** wrap the root in `AuthGate`.
- **Weights load from the HuggingFace CDN, never self-hosted.** Cloudflare Pages caps files at 25 MiB, and self-serving 2 GB weights would burn 100 GB of transfer in fifty downloads.
- **The service worker must register with an explicit `scope: '/planemode/'`.** Registering at the origin root would hijack all six sibling apps. This is the sharpest edge the single-origin decision introduces.
- Zero telemetry in the app, permanently. It is the product's thesis.
- Vite `base: '/planemode/'`.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## Task 1: Scaffold with correct scoping

**Files:**
- Create: `apps/planemode/vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Create: `apps/planemode/src/sw-register.ts`, `sw-register.test.ts`

**Interfaces:**
- Produces: `export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null>`

- [ ] **Step 1: Configure Vite and the PWA plugin with a path-qualified manifest**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/planemode/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Scope and start_url must both be path-qualified, or install-to-homescreen
      // resolves to the origin root and the installed app opens the wrong page.
      scope: '/planemode/',
      manifest: {
        name: 'PlaneMode', short_name: 'PlaneMode',
        start_url: '/planemode/', scope: '/planemode/',
        display: 'standalone', background_color: '#101014', theme_color: '#101014',
        icons: [{ src: '/planemode/icon-512.png', sizes: '512x512', type: 'image/png' }],
      },
      workbox: {
        // Never precache model weights — they are gigabytes and WebLLM caches them itself.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/planemode/index.html',
        navigateFallbackDenylist: [/^\/(?!planemode\/)/],
      },
    }),
  ],
})
```

`navigateFallbackDenylist` is the second half of the scoping defence: even if the worker were somehow consulted for a sibling path, it refuses to answer for it.

- [ ] **Step 2: Write the failing registration test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { registerServiceWorker } from './sw-register'

describe('registerServiceWorker', () => {
  it('registers with the /planemode/ scope, never the origin root', async () => {
    const register = vi.fn().mockResolvedValue({ scope: 'https://x/planemode/' })
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    await registerServiceWorker()
    expect(register).toHaveBeenCalledWith(
      expect.stringContaining('/planemode/'),
      expect.objectContaining({ scope: '/planemode/' }),
    )
  })

  it('returns null when service workers are unavailable', async () => {
    vi.stubGlobal('navigator', {})
    await expect(registerServiceWorker()).resolves.toBeNull()
  })
})
```

- [ ] **Step 3: Implement, run, and confirm the scope assertion passes**

- [ ] **Step 4: Commit**

---

## Task 2: Hardware detection and honest gating

**Files:**
- Create: `apps/planemode/src/lib/hardware.ts`, `hardware.test.ts`
- Create: `apps/planemode/src/components/Unsupported.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface Capability { webgpu: boolean; approxMemoryGB: number | null; recommended: 'small' | 'mid' | null; reason?: string }
  export async function detectCapability(): Promise<Capability>
  ```

- [ ] **Step 1: Write the failing tests**

Assert: no `navigator.gpu` yields `{ webgpu: false, recommended: null }` with a human-readable `reason`; an adapter present with `deviceMemory` of 8 recommends `mid`; 4 GB recommends `small`; and unknown memory recommends `small` rather than guessing high — a failed download is a worse experience than a smaller model.

- [ ] **Step 2: Implement using `navigator.gpu.requestAdapter()` and `navigator.deviceMemory`**

- [ ] **Step 3: Build the unsupported path**

A clear explainer, the supported-browser list, and a 30-second screen recording, so a visitor on an old browser still sees the product rather than a dead page.

- [ ] **Step 4: Run and commit**

---

## Task 3: The engine worker

**Files:**
- Create: `apps/planemode/src/worker/engine.worker.ts`
- Create: `apps/planemode/src/lib/engine.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EngineEvent =
    | { type: 'download'; loaded: number; total: number; text: string }
    | { type: 'ready' } | { type: 'token'; text: string }
    | { type: 'done' } | { type: 'error'; message: string }
  export interface ModelTier { id: 'small' | 'mid'; modelId: string; label: string; approxBytes: number }
  export const TIERS: ModelTier[]
  export async function loadModel(tier: ModelTier, onEvent: (e: EngineEvent) => void): Promise<void>
  export async function generate(messages: {role:string;content:string}[], onEvent: (e: EngineEvent) => void): Promise<void>
  export function stop(): void
  ```

- [ ] **Step 1: Pin exact model builds against the current WebLLM catalog**

The spec pins *tiers*, not model names, deliberately. At implementation time, read `prebuiltAppConfig.model_list` from the installed `@mlc-ai/web-llm` and choose one q4 instruct build of roughly 1–2 GB for `small` and 2–3 GB for `mid`. Record the exact ids and the resolved package version in `TIERS` and in the README, so a future reader knows what was actually shipped.

- [ ] **Step 2: Implement the worker**

Use `CreateMLCEngine` with an `initProgressCallback` forwarding download progress. Keep the engine instance module-scoped in the worker; the UI thread only posts messages.

- [ ] **Step 3: Request persistent storage before download**

```ts
if (navigator.storage?.persist) await navigator.storage.persist()
```

Without this the browser may evict multi-gigabyte weights under pressure, which silently breaks the entire premise on the next offline launch.

- [ ] **Step 4: Implement streaming generation with a working stop button and context trimming**

When the context window is exceeded, drop the oldest turns and show a visible "earlier messages trimmed" notice rather than failing or silently forgetting.

- [ ] **Step 5: Commit**

---

## Task 4: First-run flow

**Files:**
- Create: `apps/planemode/src/components/{FirstRun,DownloadProgress,ModelPicker}.tsx`

The first run *is* the product. A visitor who does not understand the deal will not wait for a 2 GB download.

- [ ] **Step 1: Landing that explains the bargain before asking for anything**

"Download once, own it forever. After this, it works with the network off." State the exact download size **before** the download starts.

- [ ] **Step 2: Progress with real numbers and resume**

Bytes and percent, not a spinner. WebLLM's cache resumes automatically on reload; verify this by killing the tab mid-download and reopening.

- [ ] **Step 3: Warm-up generation and a ready badge**

A tiny throwaway generation after load, so the first real message is fast rather than paying compile cost.

- [ ] **Step 4: Commit**

---

## Task 5: Local history, export and wipe

**Files:**
- Create: `apps/planemode/src/lib/history.ts`, `history.test.ts`
- Create: `apps/planemode/src/components/StoragePanel.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface Conversation { id: string; title: string; messages: {role:string;content:string}[]; updatedAt: number }
  export async function saveConversation(c: Conversation): Promise<void>
  export async function listConversations(): Promise<Conversation[]>
  export async function exportAll(): Promise<Blob>
  export async function wipeAll(): Promise<void>          // conversations AND cached weights
  export async function storageUsage(): Promise<{ usageBytes: number; quotaBytes: number }>
  ```

- [ ] **Step 1: Write tests with `fake-indexeddb`**

Round-trip a conversation, assert `exportAll` produces parseable JSON containing it, and assert `wipeAll` leaves `listConversations` empty.

- [ ] **Step 2: Implement, including weight deletion in `wipeAll`**

`wipeAll` must clear the WebLLM caches too, not just IndexedDB conversations. Storage honesty is a success criterion: the reported figure has to match `navigator.storage.estimate()`, and wiping has to actually return the origin to near-zero.

- [ ] **Step 3: Build the storage panel**

Show weights on disk, conversation size, one-tap model deletion, export, and wipe.

- [ ] **Step 4: Run and commit**

---

## Task 6: The offline-verified indicator

**Files:**
- Create: `apps/planemode/src/lib/offline.ts`, `offline.test.ts`
- Create: `apps/planemode/src/components/OfflineBadge.tsx`

**Interfaces:**
- Produces: `export function useOfflineVerified(): { offline: boolean; verified: boolean }`

`verified` becomes true only once a generation has **completed while offline** — the demo's money moment turned into UI. Listening to `navigator.onLine` alone is not enough; it must be paired with an actual successful generation.

- [ ] **Step 1: Write tests**

Assert `verified` stays false when offline with no generation yet, flips true after a generation completes while offline, and stays true afterwards for the session.

- [ ] **Step 2: Implement and render the badge**

- [ ] **Step 3: Commit**

---

## Task 7: The airplane test and deploy

- [ ] **Step 1: Deploy**

- [ ] **Step 2: Verify service worker scope in production**

In DevTools → Application → Service Workers on `labs.abdash.net/planemode/`, confirm the scope reads `/planemode/`. Then load `/recto/` and confirm **no** service worker controls it. This is the check that protects the other six apps.

- [ ] **Step 3: Run the airplane test literally, and record it**

Load once on a mid-range laptop. Install the PWA. Enable airplane mode. Reload the installed app. Hold a chat. Record the screen with the Wi-Fi indicator visible — that recording is the README centrepiece and the whole pitch in three seconds.

- [ ] **Step 4: Measure performance against the criteria**

First token under 5 s after model load; sustained generation at 8 tokens/second or better on the default tier.

- [ ] **Step 5: Verify storage honesty**

Compare the reported weight size against `navigator.storage.estimate()`, then wipe and confirm the origin returns to near-zero.

- [ ] **Step 6: Commit and add the AI-tab card**

---

## Definition of done

- [ ] Lint, typecheck and tests pass.
- [ ] The service worker's scope is `/planemode/` in production, and no sibling app is controlled by it.
- [ ] The airplane test passes end to end and is recorded.
- [ ] First token under 5 s; sustained throughput at or above 8 tokens/second on the default tier.
- [ ] Reported storage matches actual usage; wipe returns the origin to near-zero.
- [ ] The app never reads the Supabase session and never prompts for sign-in.
- [ ] No network request originates from the app after the model is cached — verified in DevTools.
- [ ] Exact model build ids and the `@mlc-ai/web-llm` version are recorded in the README.
