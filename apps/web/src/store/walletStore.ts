import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MidSwapSDK, type WalletState, type WalletBalance } from '@midswap/sdk';

interface WalletStore extends WalletState {
  sdk: MidSwapSDK | null;
  isConnecting: boolean;
  error: string | null;
  
  // Actions
  initSDK: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  clearError: () => void;
}

const createDefaultBalance = (): WalletBalance => ({
  native: 0n,
  shieldedTokens: new Map(),
});

export const useWalletStore = create<WalletStore>()(
  persist(
    (set, get) => ({
      // Initial state
      sdk: null,
      isConnected: false,
      isConnecting: false,
      address: null,
      network: 'preprod',
      balance: createDefaultBalance(),
      error: null,

      // Initialize SDK
      initSDK: () => {
        if (get().sdk) return;
        
        try {
          const proofServer = typeof window !== 'undefined' 
            ? (import.meta.env.VITE_PROOF_SERVER_URL || '/api/proof')
            : 'http://localhost:6300';
          
          const indexerGraphQL = typeof window !== 'undefined'
            ? (import.meta.env.VITE_MIDNIGHT_INDEXER_URL || '/api/indexer')
            : 'https://indexer.preprod.midnight.network/api/v4/graphql';

          const sdk = new MidSwapSDK({
            network: 'preprod',
            proofServer,
            indexerGraphQL,
                zkBaseUrl: import.meta.env.VITE_ZK_BASE_URL || '/zk/OptimalAMM'
          });
          
          // Subscribe to wallet changes
          sdk.onWalletChange((state: WalletState) => {
            set({
              isConnected: state.isConnected,
              address: state.address,
              balance: state.balance,
              network: state.network
            });
          });
          
          set({ sdk });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to initialize SDK';
          console.error('[walletStore] initSDK failed:', err);
          set({ error: message });
        }
      },

      // Connect wallet
      connect: async () => {
        let sdk = get().sdk;
        if (!sdk) {
          get().initSDK();
          sdk = get().sdk;
        }
        
        if (!sdk) {
          set({ error: 'Failed to initialize SDK' });
          return;
        }
        
        set({ isConnecting: true, error: null });
        
        try {
          const state = await sdk.connect();
          set({
            isConnected: true,
            address: state.address,
            balance: state.balance,
            network: state.network,
            isConnecting: false
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to connect wallet';
          set({
            error: message,
            isConnecting: false
          });
          throw error;
        }
      },

      // Disconnect
      disconnect: () => {
        const sdk = get().sdk;
        if (sdk) {
          sdk.disconnect();
        }
        set({
          isConnected: false,
          address: null,
          balance: createDefaultBalance()
        });
      },

      // Refresh balance
      refreshBalance: async () => {
        const sdk = get().sdk;
        if (!sdk || !get().isConnected) return;
        
        try {
          const balance = await sdk.wallet.refreshBalance();
          set({ balance });
        } catch (error) {
          console.error('Failed to refresh balance:', error);
        }
      },

      // Clear error
      clearError: () => set({ error: null })
    }),
    {
      name: 'midswap-wallet',
      partialize: (state) => ({
        network: state.network
      })
    }
  )
);
