// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
const isDev = import.meta.env.DEV;

export default defineConfig({
  site: isDev ? 'http://localhost:4321' : 'https://tomasposse.github.io/website',
  base: isDev ? '/' : '/website',
});
