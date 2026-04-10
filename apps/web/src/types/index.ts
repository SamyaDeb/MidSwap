/**
 * Token types for MidSwap
 */

export interface Token {
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  address?: string;
}

export interface Pool {
  address: string;
  token0: Token;
  token1: Token;
  reserve0: bigint;
  reserve1: bigint;
  totalLiquidity: bigint;
  fee: number;
}

export interface SwapQuote {
  amountOut: string;
  priceImpact: number;
  fee: string;
  mevSavings: string;
  executionPrice: string;
  minimumReceived?: string;
}

export interface MEVEvent {
  id: string;
  type: 'frontrun' | 'sandwich' | 'backrun';
  protocol: string;
  profit: string;
  timestamp: Date;
  hash: string;
}

export interface MEVStats {
  totalMEV24h: string;
  frontrunCount: number;
  sandwichCount: number;
  backrunCount: number;
  avgProfit: string;
}
