import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    // ZK assets are served via public/zk/ symlinks to packages/contracts/managed/OptimalAMM/
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@midswap/sdk': path.resolve(__dirname, '../../packages/sdk/src')
    }
  },
  server: {
    port: 3006,
    open: true,
    // Proxy Midnight indexer and proof server to avoid CORS/COEP issues.
    // COEP (require-corp) is required for WASM SharedArrayBuffer but blocks
    // cross-origin fetches that don't set Cross-Origin-Resource-Policy.
    // Routing them through the dev server makes them same-origin.
    proxy: {
      '/api/indexer': {
        target: 'https://indexer.preprod.midnight.network',
        changeOrigin: true,
        rewrite: () => '/api/v4/graphql',
        secure: true,
      },
      '/api/proof': {
        target: 'http://localhost:6300',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proof/, ''),
      },
    },
    // Serve ZK files with the correct MIME type
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  optimizeDeps: {
    include: [
      '@midnight-ntwrk/compact-runtime > object-inspect',
    ],
    // Exclude WASM-based packages — handled by vite-plugin-wasm + vite-plugin-top-level-await
    exclude: [
      '@midnight-ntwrk/compact-runtime',
      '@midnight-ntwrk/ledger-v8',
    ]
  },
  define: {
    // Handle BigInt serialization
    'process.env': {}
  }
});
