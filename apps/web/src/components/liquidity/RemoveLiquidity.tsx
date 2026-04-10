import React, { useState, useEffect, useMemo } from 'react';
import { ArrowDownIcon, InformationCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { useWalletStore } from '@/store/walletStore';
import { formatTokenAmount } from '@/utils';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import type { PoolInfo } from '@midswap/sdk';

interface Token {
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
}

interface UserPosition {
  lpBalance: bigint;
  poolShare: number;
  token0Value: bigint;
  token1Value: bigint;
}

interface RemoveLiquidityProps {
  poolAddress?: string;
  tokens?: [Token, Token];
  onSuccess?: () => void;
}

const defaultTokens: [Token, Token] = [
  { symbol: 'tNight', name: 'Test Night', decimals: 6, icon: '/tokens/tnight.svg' },
  { symbol: 'mUSDC', name: 'Midnight USDC', decimals: 6, icon: '/tokens/musdc.svg' }
];

function getLPDisplayDecimals(pool: PoolInfo | null, tokens: [Token, Token]): number {
  if (pool) {
    return Math.min(pool.token0.decimals, pool.token1.decimals);
  }
  return Math.min(tokens[0].decimals, tokens[1].decimals);
}

export const RemoveLiquidity: React.FC<RemoveLiquidityProps> = ({ 
  poolAddress = import.meta.env.VITE_POOL_TNIGHT_MUSDC || '57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b',
  tokens = defaultTokens,
  onSuccess 
}) => {
  const { sdk, isConnected } = useWalletStore();
  const [percentage, setPercentage] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPosition, setIsFetchingPosition] = useState(false);
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slippage] = useState(0.5);
  const lpDisplayDecimals = useMemo(() => getLPDisplayDecimals(pool, tokens), [pool, tokens]);

  // Fetch pool and user position
  useEffect(() => {
    const fetchData = async () => {
      if (!sdk || !isConnected || !poolAddress) return;
      
      setIsFetchingPosition(true);
      setError(null);
      
      try {
        // Fetch pool data
        const poolData = await sdk.getPool(poolAddress);
        setPool(poolData);

        // Fetch user's LP position
        const userPosition = await sdk.getUserPosition(poolAddress);
        setPosition(userPosition);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch position';
        setError(message);
      } finally {
        setIsFetchingPosition(false);
      }
    };

    fetchData();
  }, [sdk, isConnected, poolAddress]);

  // Format LP balance for display
  const formattedPosition = useMemo(() => {
    if (!position || !pool) {
      return {
        lpTokens: '0.0000',
        token0Amount: '0.000000',
        token1Amount: '0.000000',
        sharePercent: '0.00'
      };
    }

    return {
      lpTokens: formatTokenAmount(position.lpBalance, lpDisplayDecimals, 4),
      token0Amount: (Number(position.token0Value) / Math.pow(10, tokens[0].decimals)).toFixed(6),
      token1Amount: (Number(position.token1Value) / Math.pow(10, tokens[1].decimals)).toFixed(6),
      sharePercent: position.poolShare.toFixed(4)
    };
  }, [position, pool, tokens, lpDisplayDecimals]);

  // Calculate amounts based on percentage
  const { lpToRemove, token0ToReceive, token1ToReceive, lpToRemoveBigInt, token0Min, token1Min } = useMemo(() => {
    if (!position || position.lpBalance === 0n) {
      return {
        lpToRemove: '0.0000',
        token0ToReceive: '0.000000',
        token1ToReceive: '0.000000',
        lpToRemoveBigInt: 0n,
        token0Min: 0n,
        token1Min: 0n
      };
    }

    const lpAmount = (position.lpBalance * BigInt(percentage)) / 100n;
    const token0Amount = (position.token0Value * BigInt(percentage)) / 100n;
    const token1Amount = (position.token1Value * BigInt(percentage)) / 100n;

    // Calculate minimums with slippage
    const slippageMultiplier = BigInt(Math.floor((100 - slippage) * 100));
    const t0Min = (token0Amount * slippageMultiplier) / 10000n;
    const t1Min = (token1Amount * slippageMultiplier) / 10000n;

    return {
      lpToRemove: formatTokenAmount(lpAmount, lpDisplayDecimals, 4),
      token0ToReceive: (Number(token0Amount) / Math.pow(10, tokens[0].decimals)).toFixed(6),
      token1ToReceive: (Number(token1Amount) / Math.pow(10, tokens[1].decimals)).toFixed(6),
      lpToRemoveBigInt: lpAmount,
      token0Min: t0Min,
      token1Min: t1Min
    };
  }, [position, percentage, tokens, slippage, lpDisplayDecimals]);

  const handleRemoveLiquidity = async () => {
    if (!sdk || !isConnected || percentage <= 0 || !position || lpToRemoveBigInt === 0n) {
      toast.error('Please connect wallet and select amount');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Execute real SDK call
      const result = await sdk.removeLiquidity(
        poolAddress,
        lpToRemoveBigInt,
        token0Min,
        token1Min,
        20 // 20 minute deadline
      );
      
      toast.success(
        <div>
          <div className="font-semibold">Liquidity Removed!</div>
          <div className="text-sm opacity-80">
            Received {token0ToReceive} {tokens[0].symbol} + {token1ToReceive} {tokens[1].symbol}
          </div>
          <div className="text-xs opacity-60 mt-1">
            TX: {result.txHash.slice(0, 10)}...{result.txHash.slice(-8)}
          </div>
        </div>
      );
      
      setPercentage(0);
      
      // Refresh position
      const updatedPosition = await sdk.getUserPosition(poolAddress);
      setPosition(updatedPosition);
      
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error(`Failed to remove liquidity: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const percentagePresets = [25, 50, 75, 100];
  const hasPosition = position && position.lpBalance > 0n;

  // Loading state
  if (isFetchingPosition) {
    return (
      <div className="bg-surface rounded-2xl p-6 border border-white/5">
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-accent-primary" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-3 text-white/60">Loading your position...</span>
        </div>
      </div>
    );
  }

  // No position state
  if (!hasPosition && !isFetchingPosition) {
    return (
      <div className="bg-surface rounded-2xl p-6 border border-white/5">
        <div className="text-center py-8">
          <div className="text-white/40 mb-2">No LP Position Found</div>
          <p className="text-sm text-white/30">
            You don't have any liquidity in this pool yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl p-6 border border-white/5">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Remove Liquidity</h3>
        <div className="flex items-center gap-2 text-sm text-white/60">
          <InformationCircleIcon className="w-4 h-4" />
          <span>Withdraw your position</span>
        </div>
      </div>

      {/* LP Balance */}
      <div className="bg-surface-light rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/60">Your LP Position</span>
          <span className="text-sm text-white/60">Share: {formattedPosition.sharePercent}%</span>
        </div>
        <div className="text-2xl font-bold">{formattedPosition.lpTokens} LP</div>
        <div className="text-sm text-white/60 mt-1">
          = {formattedPosition.token0Amount} {tokens[0].symbol} + {formattedPosition.token1Amount} {tokens[1].symbol}
        </div>
      </div>

      {/* Percentage Slider */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-white/60">Amount to Remove</span>
          <span className="text-2xl font-bold text-accent-primary">{percentage}%</span>
        </div>
        
        <input
          type="range"
          min="0"
          max="100"
          value={percentage}
          onChange={(e) => setPercentage(parseInt(e.target.value))}
          className="w-full h-2 bg-surface-light rounded-lg appearance-none cursor-pointer accent-accent-primary"
        />
        
        <div className="flex gap-2 mt-3">
          {percentagePresets.map((preset) => (
            <button
              key={preset}
              onClick={() => setPercentage(preset)}
              className={clsx(
                'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                percentage === preset
                  ? 'bg-accent-primary text-white'
                  : 'bg-surface-light text-white/60 hover:text-white'
              )}
            >
              {preset}%
            </button>
          ))}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center mb-4">
        <div className="bg-surface-light p-2 rounded-lg">
          <ArrowDownIcon className="w-5 h-5 text-white/60" />
        </div>
      </div>

      {/* Output Preview */}
      <div className="bg-surface-light rounded-xl p-4 space-y-3">
        <div className="text-sm text-white/60 mb-2">You will receive</div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={tokens[0].icon} alt={tokens[0].symbol} className="w-6 h-6" />
            <span>{tokens[0].symbol}</span>
          </div>
          <span className="font-semibold">{token0ToReceive}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={tokens[1].icon} alt={tokens[1].symbol} className="w-6 h-6" />
            <span>{tokens[1].symbol}</span>
          </div>
          <span className="font-semibold">{token1ToReceive}</span>
        </div>
        
        <div className="pt-3 border-t border-white/5 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">LP Tokens Burned</span>
            <span>{lpToRemove}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Slippage Tolerance</span>
            <span>{slippage}%</span>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-3 bg-red-500/10 rounded-xl border border-red-500/20">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <ExclamationCircleIcon className="w-4 h-4" />
            {error}
          </div>
        </div>
      )}

      {/* Privacy Badge */}
      <div className="mt-4 p-3 bg-green-500/10 rounded-xl border border-green-500/20">
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          Withdrawal amounts are private (ZK protected)
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleRemoveLiquidity}
        disabled={!isConnected || percentage <= 0 || isLoading || !hasPosition}
        className={clsx(
          'w-full mt-4 py-4 rounded-xl font-semibold transition-all duration-200',
          isConnected && percentage > 0 && !isLoading && hasPosition
            ? 'bg-gradient-to-r from-red-500 to-orange-500 hover:opacity-90'
            : 'bg-white/10 text-white/40 cursor-not-allowed'
        )}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Removing Liquidity...
          </span>
        ) : !isConnected ? (
          'Connect Wallet'
        ) : !hasPosition ? (
          'No Position'
        ) : percentage <= 0 ? (
          'Select Amount'
        ) : (
          `Remove ${percentage}% Liquidity`
        )}
      </button>
    </div>
  );
};
