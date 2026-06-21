import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: 'src/background.ts',
        popup: 'popup.html',
        reader: 'reader.html',
      },
      output: {
        entryFileNames: chunk => (chunk.name === 'background' ? 'background.js' : 'assets/[name].js'),
      },
    },
  },
});
