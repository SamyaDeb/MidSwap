/**
 * PriceOracle - Fetches real token prices from multiple sources
 * 
 * Sources (in priority order):
 * 1. Pool reserves (for tokens in our pools)
 * 2. CoinGecko API (for major tokens)
 * 3. Fallback to configured defaults
 */

import { useWalletStore } from '@/store/walletStore';

// Price cache with TTL
interface PriceCache {
  price: number;
  timestamp: number;
}

const priceCache: Map<string, PriceCache> = new Map();
const CACHE_TTL = 60000; // 1 minute

// CoinGecko token IDs mapping
const COINGECKO_IDS: Record<string, string> = {
  'tNight': 'midnight', // Hypothetical - update with real ID when available
  'mUSDC': 'usd-coin',
  'ETH': 'ethereum',
  'BTC': 'bitcoin'
};

// Fallback prices (only used when all sources fail)
const FALLBACK_PRICES: Record<string, number> = {
  'tNight': 1.0,
  'mUSDC': 1.0,
  'ETH': 3000,
  'BTC': 60000
};

/**
 * Get cached price if still valid
 */
function getCachedPrice(symbol: string): number | null {
  const cached = priceCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }
  return null;
}

/**
 * Cache a price
 */
function cachePrice(symbol: string, price: number): void {
  priceCache.set(symbol, { price, timestamp: Date.now() });
}

/**
 * Calculate token price from pool reserves
 * Assumes one of the tokens is a stablecoin (mUSDC = $1)
 */
export async function getPriceFromPool(symbol: string): Promise<number | null> {
  try {
    const sdk = useWalletStore.getState().sdk;
    if (!sdk) return null;

    const poolAddress = import.meta.env.VITE_POOL_TNIGHT_MUSDC;
    if (!poolAddress) return null;

    const pool = await sdk.getPool(poolAddress);
    if (!pool || !pool.initialized) return null;

    // Normalize reserves to account for decimals
    const reserve0Normalized = Number(pool.reserve0) / Math.pow(10, pool.token0.decimals);
    const reserve1Normalized = Number(pool.reserve1) / Math.pow(10, pool.token1.decimals);

    if (reserve0Normalized === 0 || reserve1Normalized === 0) return null;

    // Calculate price based on which token we're looking up
    if (symbol === pool.token0.symbol) {
      // token0 price in terms of token1
      // If token1 is mUSDC ($1), this gives USD price
      const price = reserve1Normalized / reserve0Normalized;
      return pool.token1.symbol === 'mUSDC' ? price : price; // Adjust if token1 isn't stablecoin
    } else if (symbol === pool.token1.symbol) {
      // token1 price in terms of token0
      const price = reserve0Normalized / reserve1Normalized;
      return pool.token0.symbol === 'mUSDC' ? price : 1.0; // mUSDC is always $1
    }

    return null;
  } catch (error) {
    console.debug('Failed to get price from pool:', error);
    return null;
  }
}

/**
 * Fetch price from CoinGecko API
 */
export async function getPriceFromCoinGecko(symbol: string): Promise<number | null> {
  const coinId = COINGECKO_IDS[symbol];
  if (!coinId) return null;

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      {
        headers: { 'Accept': 'application/json' }
      }
    );

    if (!response.ok) return null;

    const data = await response.json() as Record<string, { usd?: number }>;
    return data[coinId]?.usd ?? null;
  } catch (error) {
    console.debug('CoinGecko API error:', error);
    return null;
  }
}

/**
 * Get token price in USD
 * Tries multiple sources in order of preference
 */
export async function getTokenPrice(symbol: string): Promise<number> {
  // Check cache first
  const cached = getCachedPrice(symbol);
  if (cached !== null) {
    return cached;
  }

  // Source 1: Pool reserves (most accurate for our tokens)
  const poolPrice = await getPriceFromPool(symbol);
  if (poolPrice !== null && poolPrice > 0) {
    cachePrice(symbol, poolPrice);
    return poolPrice;
  }

  // Source 2: CoinGecko (for external reference)
  const geckoPrice = await getPriceFromCoinGecko(symbol);
  if (geckoPrice !== null && geckoPrice > 0) {
    cachePrice(symbol, geckoPrice);
    return geckoPrice;
  }

  // Source 3: Fallback (configured defaults)
  const fallback = FALLBACK_PRICES[symbol] ?? 0;
  if (fallback > 0) {
    cachePrice(symbol, fallback);
  }
  return fallback;
}

/**
 * Get prices for multiple tokens at once
 */
export async function getTokenPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  // Fetch all prices in parallel
  await Promise.all(
    symbols.map(async (symbol) => {
      prices[symbol] = await getTokenPrice(symbol);
    })
  );

  return prices;
}

/**
 * Calculate USD value of a token amount
 */
export async function calculateUSDValue(
  symbol: string,
  amount: bigint,
  decimals: number
): Promise<number> {
  const price = await getTokenPrice(symbol);
  const normalizedAmount = Number(amount) / Math.pow(10, decimals);
  return normalizedAmount * price;
}

/**
 * Format USD value with appropriate precision
 */
export function formatUSD(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return '<$0.01';
  if (value < 1) return `$${value.toFixed(4)}`;
  if (value < 1000) return `$${value.toFixed(2)}`;
  if (value < 1000000) return `$${(value / 1000).toFixed(2)}K`;
  if (value < 1000000000) return `$${(value / 1000000).toFixed(2)}M`;
  return `$${(value / 1000000000).toFixed(2)}B`;
}

/**
 * Clear price cache (useful for testing or forcing refresh)
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

/**
 * Hook for getting token price with auto-refresh
 */
export function usePriceOracle() {
  return {
    getTokenPrice,
    getTokenPrices,
    calculateUSDValue,
    formatUSD,
    clearPriceCache
  };
}
