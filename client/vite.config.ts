import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const serverPort = process.env.SERVER_PORT ?? '3000';

export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
  server: {
    port: 5173,
    host: true, // reachable from other devices on your LAN
    proxy: {
      '/socket.io': { target: `http://localhost:${serverPort}`, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000, // Phaser is big
  },
});
