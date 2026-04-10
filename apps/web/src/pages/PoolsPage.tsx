import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PlusIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { AddLiquidity } from '@/components/liquidity/AddLiquidity';
import { RemoveLiquidity } from '@/components/liquidity/RemoveLiquidity';
import { useWalletStore } from '@/store/walletStore';
import { getTokenPrices, formatUSD } from '@/services/PriceOracle';
import type { PoolInfo } from '@midswap/sdk';

interface Pool extends PoolInfo {
  id: number;
  userPosition?: {
    lpBalance: bigint;
    poolShare: number;
    token0Value: bigint;
    token1Value: bigint;
  } | null;
}

// Token prices state
interface TokenPrices {
  [symbol: string]: number;
}

export const PoolsPage: React.FC = () => {
  const { sdk, isConnected } = useWalletStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenPrices, setTokenPrices] = useState<TokenPrices>({});

  // Pool addresses to fetch (in production, this would come from a registry)
  const POOL_ADDRESSES = useMemo(() => [
    import.meta.env.VITE_POOL_TNIGHT_MUSDC || '57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b'
  ], []);

  // Fetch token prices
  const fetchTokenPrices = useCallback(async (poolsData: Pool[]) => {
    const symbols = new Set<string>();
    poolsData.forEach(pool => {
      symbols.add(pool.token0.symbol);
      symbols.add(pool.token1.symbol);
    });
    
    if (symbols.size > 0) {
      try {
        const prices = await getTokenPrices(Array.from(symbols));
        setTokenPrices(prices);
      } catch (err) {
        console.warn('Failed to fetch token prices:', err);
        // Use fallback prices
        setTokenPrices({
          'tNight': 1.0,
          'mUSDC': 1.0
        });
      }
    }
  }, []);

  // Fetch pools and user positions
  const fetchPools = useCallback(async () => {
    if (!sdk) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const poolsData: Pool[] = [];

      for (let i = 0; i < POOL_ADDRESSES.length; i++) {
        const address = POOL_ADDRESSES[i];
        
        // Fetch pool data
        const poolInfo = await sdk.getPool(address);
        
        if (poolInfo) {
          // Fetch user position if connected
          let userPosition = null;
          if (isConnected) {
            userPosition = await sdk.getUserPosition(address);
          }

          poolsData.push({
            ...poolInfo,
            id: i + 1,
            userPosition
          });
        }
      }

      setPools(poolsData);
      
      // Fetch token prices after pools are loaded
      await fetchTokenPrices(poolsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch pools';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [sdk, isConnected, POOL_ADDRESSES, fetchTokenPrices]);

  // Fetch on mount and when connection changes
  useEffect(() => {
    fetchPools();
  }, [fetchPools]);

  // Get token price from state
  const getPrice = useCallback((symbol: string): number => {
    return tokenPrices[symbol] ?? (symbol === 'mUSDC' ? 1.0 : 0);
  }, [tokenPrices]);

  // Calculate TVL for a pool
  const calculateTVL = useCallback((pool: Pool): string => {
    // Use TVL from pool if available (from indexer)
    if (pool.tvl && pool.tvl > 0) {
      return formatUSD(pool.tvl);
    }

    const token0Decimals = pool.token0.decimals;
    const token1Decimals = pool.token1.decimals;
    
    const token0Amount = Number(pool.reserve0) / Math.pow(10, token0Decimals);
    const token1Amount = Number(pool.reserve1) / Math.pow(10, token1Decimals);
    
    const token0Price = getPrice(pool.token0.symbol);
    const token1Price = getPrice(pool.token1.symbol);
    
    const tvl = (token0Amount * token0Price) + (token1Amount * token1Price);
    
    return formatUSD(tvl);
  }, [getPrice]);

  // Get TVL as number for calculations
  const getTVLNumber = useCallback((pool: Pool): number => {
    if (pool.tvl && pool.tvl > 0) {
      return pool.tvl;
    }

    const token0Decimals = pool.token0.decimals;
    const token1Decimals = pool.token1.decimals;
    
    const token0Amount = Number(pool.reserve0) / Math.pow(10, token0Decimals);
    const token1Amount = Number(pool.reserve1) / Math.pow(10, token1Decimals);
    
    const token0Price = getPrice(pool.token0.symbol);
    const token1Price = getPrice(pool.token1.symbol);
    
    return (token0Amount * token0Price) + (token1Amount * token1Price);
  }, [getPrice]);

  // Calculate 24h volume
  const calculateVolume24h = useCallback((pool: Pool): string => {
    // Use real volume from indexer if available
    if (pool.volume24h && pool.volume24h > 0) {
      return formatUSD(pool.volume24h);
    }

    // Fallback: Estimate based on TVL (typical DEX ratio)
    // New pools typically have lower volume/TVL ratio
    const tvl = getTVLNumber(pool);
    const volumeRatio = pool.initialized ? 0.15 : 0; // Conservative 15% daily turnover estimate
    const volume = tvl * volumeRatio;
    
    return formatUSD(volume);
  }, [getTVLNumber]);

  // Get volume as number
  const getVolume24hNumber = useCallback((pool: Pool): number => {
    if (pool.volume24h && pool.volume24h > 0) {
      return pool.volume24h;
    }
    const tvl = getTVLNumber(pool);
    return tvl * 0.15;
  }, [getTVLNumber]);

  // Calculate APR based on volume and fee
  const calculateAPR = useCallback((pool: Pool): string => {
    const tvl = getTVLNumber(pool);
    
    if (tvl === 0) return '0%';
    
    const volume = getVolume24hNumber(pool);
    const dailyFees = volume * (pool.feeBps / 10000);
    const yearlyFees = dailyFees * 365;
    const apr = (yearlyFees / tvl) * 100;
    
    return `${apr.toFixed(1)}%`;
  }, [getTVLNumber, getVolume24hNumber]);

  // Format user LP position
  const formatUserPosition = useCallback((pool: Pool): string | null => {
    if (!pool.userPosition || pool.userPosition.lpBalance === 0n) return null;
    return `${(Number(pool.userPosition.lpBalance) / 1e18).toFixed(4)} LP`;
  }, []);

  // Calculate user position USD value
  const calculateUserPositionValue = useCallback((pool: Pool): string => {
    if (!pool.userPosition || pool.userPosition.lpBalance === 0n) return '$0.00';
    
    const token0Amount = Number(pool.userPosition.token0Value) / Math.pow(10, pool.token0.decimals);
    const token1Amount = Number(pool.userPosition.token1Value) / Math.pow(10, pool.token1.decimals);
    
    const token0Price = getPrice(pool.token0.symbol);
    const token1Price = getPrice(pool.token1.symbol);
    
    const value = (token0Amount * token0Price) + (token1Amount * token1Price);
    return formatUSD(value);
  }, [getPrice]);

  // Calculate total stats
  const totalStats = useMemo(() => {
    let totalTVL = 0;
    let totalVolume = 0;
    let totalUserValue = 0;

    pools.forEach(pool => {
      totalTVL += getTVLNumber(pool);
      totalVolume += getVolume24hNumber(pool);

      if (pool.userPosition && pool.userPosition.lpBalance > 0n) {
        const token0Amount = Number(pool.userPosition.token0Value) / Math.pow(10, pool.token0.decimals);
        const token1Amount = Number(pool.userPosition.token1Value) / Math.pow(10, pool.token1.decimals);
        const token0Price = getPrice(pool.token0.symbol);
        const token1Price = getPrice(pool.token1.symbol);
        totalUserValue += (token0Amount * token0Price) + (token1Amount * token1Price);
      }
    });

    return {
      tvl: formatUSD(totalTVL),
      volume: formatUSD(totalVolume),
      userValue: formatUSD(totalUserValue)
    };
  }, [pools, getTVLNumber, getVolume24hNumber, getPrice]);

  const handleAddLiquidity = (pool: Pool) => {
    setSelectedPool(pool);
    setShowAddModal(true);
  };

  const handleRemoveLiquidity = (pool: Pool) => {
    setSelectedPool(pool);
    setShowRemoveModal(true);
  };

  const handleModalClose = () => {
    setShowAddModal(false);
    setShowRemoveModal(false);
    // Refresh pools after modal close
    fetchPools();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Liquidity Pools</h1>
          <p className="text-white/60">Provide liquidity and earn fees on every swap</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchPools}
            disabled={isLoading}
            className="p-2.5 rounded-xl bg-surface border border-white/10 hover:bg-surface-light transition-colors disabled:opacity-50"
          >
            <ArrowPathIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-gradient-to-r from-accent-primary to-accent-secondary px-4 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <PlusIcon className="w-5 h-5" />
            New Position
          </button>
        </div>
      </div>

      {/* Pool Stats Overview */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-surface rounded-xl p-4 border border-white/5">
          <div className="text-sm text-white/40 mb-1">Total Value Locked</div>
          <div className="text-2xl font-bold">{isLoading ? '...' : totalStats.tvl}</div>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-white/5">
          <div className="text-sm text-white/40 mb-1">24h Trading Volume</div>
          <div className="text-2xl font-bold">{isLoading ? '...' : totalStats.volume}</div>
        </div>
        <div className="bg-surface rounded-xl p-4 border border-white/5">
          <div className="text-sm text-white/40 mb-1">Your Total LP Value</div>
          <div className="text-2xl font-bold text-accent-primary">
            {isLoading ? '...' : totalStats.userValue}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 rounded-xl border border-red-500/20 text-red-400">
          {error}
        </div>
      )}

      {/* Loading State */}
      {isLoading && pools.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-accent-primary" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-3 text-white/60">Loading pools...</span>
        </div>
      )}

      {/* Pool Cards */}
      <div className="space-y-4">
        {pools.map((pool) => (
          <div key={pool.id} className="bg-surface rounded-2xl p-6 border border-white/5">
            <div className="flex items-center justify-between">
              {/* Pool Info */}
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                  <img 
                    src={pool.token0.logoURI || '/tokens/tnight.svg'} 
                    alt={pool.token0.symbol}
                    className="w-10 h-10 rounded-full border-2 border-surface"
                  />
                  <img 
                    src={pool.token1.logoURI || '/tokens/musdc.svg'} 
                    alt={pool.token1.symbol}
                    className="w-10 h-10 rounded-full border-2 border-surface"
                  />
                </div>
                <div>
                  <div className="font-semibold text-lg">
                    {pool.token0.symbol} / {pool.token1.symbol}
                  </div>
                  <div className="text-sm text-white/40">
                    {(pool.feeBps / 100).toFixed(2)}% fee tier
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <div className="text-sm text-white/40">TVL</div>
                  <div className="font-semibold">{calculateTVL(pool)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-white/40">24h Volume</div>
                  <div className="font-semibold">{calculateVolume24h(pool)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-white/40">APR</div>
                  <div className="font-semibold text-green-400">{calculateAPR(pool)}</div>
                </div>
              </div>
            </div>

            {/* My Position (if any) */}
            {formatUserPosition(pool) && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white/40 mb-1">My Position</div>
                    <div className="font-semibold">{formatUserPosition(pool)}</div>
                    <div className="text-sm text-white/40">{calculateUserPositionValue(pool)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleAddLiquidity(pool)}
                      className="px-4 py-2 bg-accent-primary/10 text-accent-primary rounded-xl font-medium hover:bg-accent-primary/20 transition-colors"
                    >
                      Add
                    </button>
                    <button 
                      onClick={() => handleRemoveLiquidity(pool)}
                      className="px-4 py-2 bg-red-500/10 text-red-400 rounded-xl font-medium hover:bg-red-500/20 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Add Liquidity Button (if no position) */}
            {!formatUserPosition(pool) && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <button 
                  onClick={() => handleAddLiquidity(pool)}
                  className="w-full py-3 bg-gradient-to-r from-accent-primary to-accent-secondary rounded-xl font-semibold hover:opacity-90 transition-opacity"
                >
                  Add Liquidity
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {!isLoading && pools.length === 0 && !error && (
        <div className="text-center py-12">
          <div className="text-white/40 mb-4">No pools available yet</div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-gradient-to-r from-accent-primary to-accent-secondary px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Create First Pool
          </button>
        </div>
      )}

      {/* Privacy Notice */}
      <div className="mt-8 p-4 bg-green-500/10 rounded-xl border border-green-500/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-green-400">Your LP positions are private</div>
            <div className="text-sm text-white/60">
              LP balances are stored in sealed ledger state, protected by zero-knowledge proofs.
              No one can see your liquidity positions except you.
            </div>
          </div>
        </div>
      </div>

      {/* Add Liquidity Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="relative max-w-md w-full">
            <button
              onClick={handleModalClose}
              className="absolute -top-12 right-0 p-2 text-white/60 hover:text-white"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            <AddLiquidity 
              poolAddress={selectedPool?.address}
              onSuccess={handleModalClose}
            />
          </div>
        </div>
      )}

      {/* Remove Liquidity Modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="relative max-w-md w-full">
            <button
              onClick={handleModalClose}
              className="absolute -top-12 right-0 p-2 text-white/60 hover:text-white"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
            <RemoveLiquidity 
              poolAddress={selectedPool?.address}
              onSuccess={handleModalClose}
            />
          </div>
        </div>
      )}
    </div>
  );
};
