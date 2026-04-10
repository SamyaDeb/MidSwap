import React from 'react';
import type { TokenInfo } from '@midswap/sdk';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';

interface SwapDetailsProps {
  priceImpact: number;
  mevSavings: bigint;
  tokenIn: TokenInfo | null;
  tokenOut: TokenInfo | null;
}

export const SwapDetails: React.FC<SwapDetailsProps> = ({
  priceImpact,
  mevSavings,
  tokenIn,
  tokenOut
}) => {
  // Format MEV savings using the output token's decimals
  const formatMevSavings = (amount: bigint): string => {
    const decimals = tokenOut?.decimals ?? 18;
    const value = Number(amount) / Math.pow(10, decimals);
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    if (value >= 1) return `$${value.toFixed(2)}`;
    return `$${value.toFixed(4)}`;
  };

  // Price impact color
  const getPriceImpactColor = () => {
    if (priceImpact > 500) return 'text-red-400';
    if (priceImpact > 100) return 'text-amber-400';
    return 'text-white/60';
  };

  return (
    <div className="mt-4 p-4 bg-midnight rounded-xl space-y-3">
      {/* Price Impact */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/60">Price Impact</span>
        <span className={getPriceImpactColor()}>
          {(priceImpact / 100).toFixed(2)}%
        </span>
      </div>

      {/* MEV Savings - The killer feature! */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="w-4 h-4 text-green-400" />
          <span className="text-white/60">MEV Saved</span>
        </div>
        <span className="text-green-400 font-medium">
          +{formatMevSavings(mevSavings)}
        </span>
      </div>

      {/* Route */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/60">Route</span>
        <div className="flex items-center gap-1">
          <span>{tokenIn?.symbol}</span>
          <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span>{tokenOut?.symbol}</span>
        </div>
      </div>

      {/* Privacy indicator */}
      <div className="pt-2 border-t border-white/5">
        <div className="flex items-center gap-2 text-xs text-green-400/80">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span>Transaction protected by ZK proofs</span>
        </div>
      </div>
    </div>
  );
};
