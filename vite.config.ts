import { defineConfig } from 'vite';

// GitHub Pages project site: https://blhcode.github.io/flight-sim-global/
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/flight-sim-global/',
}));
