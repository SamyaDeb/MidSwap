/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MIDNIGHT_RPC_URL: string;
  readonly VITE_MIDNIGHT_INDEXER_URL: string;
  readonly VITE_PROOF_SERVER_URL: string;
  readonly VITE_POOL_TNIGHT_MUSDC: string;
  readonly VITE_NETWORK: 'preprod' | 'mainnet';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
