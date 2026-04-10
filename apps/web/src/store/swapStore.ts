import { create } from 'zustand';
import type { TokenInfo, PendingSwapStatus } from '@midswap/sdk';

// Pending swap state for optimistic execution
export interface PendingSwapInfo {
  pendingId: string;
  tokenIn: TokenInfo;
  tokenOut: TokenInfo;
  amountIn: string;
  expectedAmountOut: string;
  status: PendingSwapStatus;
  statusDetail?: string;
  startTime: number;
  txHash?: string;
}

// Default tokens
const TNIGHT: TokenInfo = {
  address: 'native',
  symbol: 'tNight',
  name: 'Test Night Token',
  decimals: 6,
  logoURI: '/tokens/tnight.svg',
  isShielded: true
};

const MUSDC: TokenInfo = {
  address: import.meta.env.VITE_MUSDC_ADDRESS || 'c85172925beae8334c01135cfbd364cf2f6858e173be8c13bb82197890f645f4',
  symbol: 'mUSDC',
  name: 'Midnight USDC',
  decimals: 6,
  logoURI: '/tokens/musdc.svg',
  isShielded: true
};

interface SwapStore {
  // Token selection
  tokenIn: TokenInfo | null;
  tokenOut: TokenInfo | null;
  
  // Amounts
  amountIn: string;
  amountOut: string;
  
  // Which field the user is actively typing into
  // 'in' = user typed amountIn, compute amountOut
  // 'out' = user typed amountOut, compute amountIn
  quoteDirection: 'in' | 'out';
  
  // Quote data
  priceImpact: number;
  mevSavings: bigint;
  fee: bigint;
  executionPrice: number;
  
  // Settings
  slippageBps: number; // 50 = 0.5%
  deadlineMinutes: number;
  
  // State
  isLoading: boolean;
  isSwapping: boolean;
  error: string | null;
  
  // Pending swap (optimistic execution)
  pendingSwap: PendingSwapInfo | null;
  
  // Actions
  setTokenIn: (token: TokenInfo | null) => void;
  setTokenOut: (token: TokenInfo | null) => void;
  setAmountIn: (amount: string) => void;
  setAmountOut: (amount: string) => void;
  setSlippage: (bps: number) => void;
  setDeadline: (minutes: number) => void;
  switchTokens: () => void;
  setQuote: (quote: { 
    amountOut?: string;
    amountIn?: string;
    priceImpact: number; 
    fee: bigint; 
    mevSavings: bigint;
    executionPrice: number;
  }) => void;
  setLoading: (loading: boolean) => void;
  setSwapping: (swapping: boolean) => void;
  setError: (error: string | null) => void;
  setPendingSwap: (pending: PendingSwapInfo | null) => void;
  updatePendingStatus: (status: PendingSwapStatus, detail?: string) => void;
  reset: () => void;
}

export const useSwapStore = create<SwapStore>((set, get) => ({
  // Initial state - default to tNight -> mUSDC
  tokenIn: TNIGHT,
  tokenOut: MUSDC,
  amountIn: '',
  amountOut: '',
  quoteDirection: 'in',
  priceImpact: 0,
  mevSavings: 0n,
  fee: 0n,
  executionPrice: 0,
  slippageBps: 50,
  deadlineMinutes: 20,
  isLoading: false,
  isSwapping: false,
  error: null,
  pendingSwap: null,

  // Actions
  setTokenIn: (token) => set({ 
    tokenIn: token, 
    amountOut: '', 
    priceImpact: 0,
    executionPrice: 0 
  }),
  
  setTokenOut: (token) => set({ 
    tokenOut: token, 
    amountOut: '', 
    priceImpact: 0,
    executionPrice: 0 
  }),
  
  setAmountIn: (amount) => set({ amountIn: amount, quoteDirection: 'in', amountOut: '' }),
  setAmountOut: (amount) => set({ amountOut: amount, quoteDirection: 'out', amountIn: '' }),
  setSlippage: (bps) => set({ slippageBps: bps }),
  setDeadline: (minutes) => set({ deadlineMinutes: minutes }),
  
  switchTokens: () => {
    const { tokenIn, tokenOut, amountIn, amountOut, quoteDirection } = get();
    set({
      tokenIn: tokenOut,
      tokenOut: tokenIn,
      amountIn: quoteDirection === 'in' ? amountIn : amountOut,
      amountOut: '',
      quoteDirection: 'in',
      priceImpact: 0,
      executionPrice: 0
    });
  },
  
  setQuote: (quote) => set({
    ...(quote.amountOut !== undefined ? { amountOut: quote.amountOut } : {}),
    ...(quote.amountIn !== undefined ? { amountIn: quote.amountIn } : {}),
    priceImpact: quote.priceImpact,
    fee: quote.fee,
    mevSavings: quote.mevSavings,
    executionPrice: quote.executionPrice
  }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  setSwapping: (swapping) => set({ isSwapping: swapping }),
  setError: (error) => set({ error }),
  setPendingSwap: (pending) => set({ pendingSwap: pending }),
  updatePendingStatus: (status, detail) => {
    const current = get().pendingSwap;
    if (!current) return;
    set({
      pendingSwap: {
        ...current,
        status,
        statusDetail: detail,
        ...(status === 'confirming' && detail ? { txHash: detail } : {}),
      },
    });
  },
  
  reset: () => set({
    tokenIn: TNIGHT,
    tokenOut: MUSDC,
    amountIn: '',
    amountOut: '',
    quoteDirection: 'in',
    priceImpact: 0,
    mevSavings: 0n,
    fee: 0n,
    executionPrice: 0,
    error: null,
    pendingSwap: null,
  })
}));
