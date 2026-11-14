import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// The website: builder, link player, collect and about pages.
export default defineConfig({
  build: {
    target: 'es2019',
    rollupOptions: {
      input: {
        builder: resolve(import.meta.dirname, 'index.html'),
        player: resolve(import.meta.dirname, 'p/index.html'),
        collect: resolve(import.meta.dirname, 'collect/index.html'),
        about: resolve(import.meta.dirname, 'about/index.html'),
      },
    },
  },
});
