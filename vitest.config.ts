import { defineConfig } from 'vitest/config'

// The concierge island is the only tested code in this repo. Its suites are pure
// TypeScript — the voice loop uses constructor-injected fakes rather than a real
// SpeechRecognition, and the dossier guards read the generated markdown from disk —
// so they need no DOM and no Astro toolchain.
//
// Scoped narrowly on purpose: Astro components are not unit-tested here, and a
// broad glob would try to collect .astro files and fail for the wrong reason.
export default defineConfig({
  test: {
    include: ['src/components/concierge/**/*.test.ts'],
    environment: 'node',
  },
})
