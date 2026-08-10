// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig(({ command }) => ({
  site: command === 'build' ? 'https://tomasposse.github.io/website' : 'http://localhost:4321',
  base: command === 'build' ? '/website' : '/',
}));
