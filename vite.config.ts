import { defineConfig } from 'vite';

export default defineConfig({
  root: 'apps/web',
  envDir: '../..',
  build: { outDir: '../../dist', emptyOutDir: true, target: 'es2020',
    rolldownOptions: { output: { manualChunks: (id) => id.includes('node_modules/phaser') ? 'phaser' : undefined } } },
  server: { port: 5173, strictPort: true },
});
