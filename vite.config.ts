import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/wenwu-docs/',
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/markdown-it/') || id.includes('/node_modules/dompurify/')) return 'markdown';
          if (id.includes('/node_modules/minisearch/')) return 'search';
        },
      },
    },
  },
});
