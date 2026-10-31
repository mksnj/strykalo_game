import { defineConfig } from 'vite';

const buildId = new Date().toISOString();
const cacheHeaders = { 'Cache-Control': 'no-cache' };

export default defineConfig({
  root: 'apps/web',
  envDir: '../..',
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId) },
  plugins: [{ name: 'build-version', transformIndexHtml: () => [
    { tag: 'meta', attrs: { name: 'game-build', content: buildId }, injectTo: 'head' },
  ] }],
  build: { outDir: '../../dist', emptyOutDir: true, target: 'es2020',
    rolldownOptions: { output: { manualChunks: (id) => id.includes('node_modules/phaser') ? 'phaser' : undefined } } },
  server: { port: 5173, strictPort: true, headers: cacheHeaders },
  preview: { headers: cacheHeaders },
});
