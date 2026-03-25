import { defineConfig } from 'bun'

export default defineConfig({
  entrypoints: ['src/cli/index.ts'],
  outdir: 'dist',
  target: 'bun',
  minify: true,
  sourcemap: 'external'
})
