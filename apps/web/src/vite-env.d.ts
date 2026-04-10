/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MIDNIGHT_RPC_URL: string;
  readonly VITE_MIDNIGHT_INDEXER_URL: string;
  readonly VITE_PROOF_SERVER_URL: string;
  readonly VITE_POOL_TNIGHT_MUSDC: string;
  readonly VITE_MUSDC_ADDRESS?: string;
  readonly VITE_NETWORK: 'preprod' | 'mainnet';
  readonly VITE_ZK_BASE_URL?: string;
  readonly VITE_DEBUG?: string;
  readonly VITE_MIDSWAP_LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  readonly MIDSWAP_LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
