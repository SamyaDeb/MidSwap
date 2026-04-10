import { create } from 'zustand';
import type { MEVStats, EthereumMEVData } from '@midswap/sdk';

interface MEVStore {
  // User's MEV savings
  userStats: MEVStats | null;
  
  // Ethereum MEV data for comparison
  ethereumData: EthereumMEVData | null;
  
  // Loading state
  isLoading: boolean;
  
  // Trade history for calculations
  tradeHistory: Array<{
    amountIn: bigint;
    amountOut: bigint;
    timestamp: number;
    mevSaved: bigint;
  }>;
  
  // Actions
  setUserStats: (stats: MEVStats) => void;
  setEthereumData: (data: EthereumMEVData) => void;
  setLoading: (loading: boolean) => void;
  addTrade: (trade: {
    amountIn: bigint;
    amountOut: bigint;
    mevSaved: bigint;
  }) => void;
  clearHistory: () => void;
}

export const useMEVStore = create<MEVStore>((set) => ({
  userStats: null,
  ethereumData: null,
  isLoading: false,
  tradeHistory: [],

  setUserStats: (stats) => set({ userStats: stats }),
  setEthereumData: (data) => set({ ethereumData: data }),
  setLoading: (loading) => set({ isLoading: loading }),
  
  addTrade: (trade) => {
    const newTrade = {
      ...trade,
      timestamp: Date.now()
    };
    
    set(state => ({
      tradeHistory: [newTrade, ...state.tradeHistory].slice(0, 100) // Keep last 100 trades
    }));
  },
  
  clearHistory: () => set({ tradeHistory: [] })
}));
