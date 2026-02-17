// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import vue from '@astrojs/vue';
import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  site: 'https://abdash.net',
  output: 'static',
  integrations: [
    react(),
    vue(),
    svelte(),
  ],
});