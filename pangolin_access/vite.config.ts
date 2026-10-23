import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

export default defineConfig({
  root: 'web',
  base: './',
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  build: { outDir: '../dist/web', emptyOutDir: true, sourcemap: false },
});
