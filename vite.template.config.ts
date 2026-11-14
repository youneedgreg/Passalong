import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The single-file player that the builder fills in and hands to the teacher.
export default defineConfig({
  publicDir: false,
  plugins: [viteSingleFile()],
  build: {
    target: 'es2019',
    outDir: 'dist-template',
    modulePreload: { polyfill: false },
    rollupOptions: { input: resolve(import.meta.dirname, 'pack-template.html') },
  },
});
