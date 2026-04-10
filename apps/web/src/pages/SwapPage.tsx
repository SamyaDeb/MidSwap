import React from 'react';
import { SwapCard } from '@/components/swap/SwapCard';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';

export const SwapPage: React.FC = () => {
  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col items-center justify-center py-12 px-4">
      {/* Hero Text */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-full text-green-400 mb-4">
          <ShieldCheckIcon className="w-5 h-5" />
          <span className="text-sm font-medium">100% Private Swaps</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          Swap with <span className="text-gradient">Zero MEV</span>
        </h1>
        <p className="text-white/60 max-w-md mx-auto">
          Your trades are protected by zero-knowledge proofs. Bots can't see what they can't front-run.
        </p>
      </div>

      {/* Swap Card */}
      <SwapCard />

      {/* Stats */}
      <div className="mt-12 grid grid-cols-3 gap-8 max-w-lg mx-auto text-center">
        <div>
          <div className="text-2xl font-bold text-gradient">$0</div>
          <div className="text-sm text-white/40">MEV Lost</div>
        </div>
        <div>
          <div className="text-2xl font-bold">100%</div>
          <div className="text-sm text-white/40">Private</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-400">0.3%</div>
          <div className="text-sm text-white/40">Swap Fee</div>
        </div>
      </div>
    </div>
  );
};
