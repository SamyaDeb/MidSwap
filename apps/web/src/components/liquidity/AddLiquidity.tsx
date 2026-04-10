import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { PlusIcon, InformationCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { useWalletStore } from '@/store/walletStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import type { PoolInfo } from '@midswap/sdk';

interface Token {
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  address: string;
}

// Default tokens for the tNight/mUSDC pool
// mUSDC address must match the deployed MidnightUSDC contract address (used for balance lookup)
const MUSDC_CONTRACT_ADDRESS =
  import.meta.env.VITE_MUSDC_ADDRESS ||
  'c85172925beae8334c01135cfbd364cf2f6858e173be8c13bb82197890f645f4';

const defaultTokens: [Token, Token] = [
  { symbol: 'tNight', name: 'Test Night', decimals: 6, icon: '/tokens/tnight.svg', address: 'native' },
  { symbol: 'mUSDC', name: 'Midnight USDC', decimals: 6, icon: '/tokens/musdc.svg', address: MUSDC_CONTRACT_ADDRESS }
];

interface AddLiquidityProps {
  poolAddress?: string;
  tokens?: [Token, Token];
  onSuccess?: () => void;
}

export const AddLiquidity: React.FC<AddLiquidityProps> = ({ 
  poolAddress = import.meta.env.VITE_POOL_TNIGHT_MUSDC || '57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b',
  tokens = defaultTokens,
  onSuccess 
}) => {
  const { sdk, isConnected, balance } = useWalletStore();
  const [amount0, setAmount0] = useState('');
  const [amount1, setAmount1] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingPool, setIsFetchingPool] = useState(false);
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slippage, setSlippage] = useState(0.5);
  const [customSlippage, setCustomSlippage] = useState('');
  // mUSDC balance read from contract state (not from Lace shielded tokens)
  const [musdcContractBalance, setMusdcContractBalance] = useState<bigint>(0n);

  // Get real token balances from wallet
  const token0Balance = useMemo(() => {
    if (!balance) return '0.00';
    const rawBalance = tokens[0].address === 'native' 
      ? balance.native 
      : balance.shieldedTokens.get(tokens[0].address) ?? 0n;
    return (Number(rawBalance) / Math.pow(10, tokens[0].decimals)).toFixed(tokens[0].decimals > 6 ? 6 : tokens[0].decimals);
  }, [balance, tokens]);

  // mUSDC balance lives in MidnightUSDC contract state (slot 1), not in Lace shielded balances.
  // Fetch it asynchronously from contract state whenever the SDK/wallet is ready.
  useEffect(() => {
    if (!sdk || !isConnected) return;
    sdk.getContractTokenBalance(MUSDC_CONTRACT_ADDRESS)
      .then(setMusdcContractBalance)
      .catch(() => {});
  }, [sdk, isConnected]);

  const token1Balance = useMemo(() => {
    return (Number(musdcContractBalance) / Math.pow(10, tokens[1].decimals)).toFixed(6);
  }, [musdcContractBalance, tokens]);

  // Fetch pool data on mount
  useEffect(() => {
    const fetchPool = async () => {
      if (!poolAddress) return;

      // Show loading while SDK is initializing
      setIsFetchingPool(true);
      setError(null);

      // Wait up to 5 s for sdk to become available
      let attempts = 0;
      while (!sdk && attempts < 10) {
        await new Promise((r) => setTimeout(r, 500));
        attempts++;
      }

      if (!sdk) {
        setIsFetchingPool(false);
        setError('SDK not initialized — please refresh the page');
        return;
      }
      
      try {
        const poolData = await sdk.getPool(poolAddress);
        if (!poolData) {
          setError(`Pool not found at address ${poolAddress.slice(0, 8)}…`);
        } else {
          setPool(poolData);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch pool';
        setError(message);
      } finally {
        setIsFetchingPool(false);
      }
    };

    fetchPool();
  }, [sdk, poolAddress]);

  // Calculate price ratio from pool reserves
  const priceRatio = useMemo(() => {
    if (!pool || pool.reserve0 === 0n) return null;
    // token1 per token0
    const adjustedReserve0 = Number(pool.reserve0) / Math.pow(10, tokens[0].decimals);
    const adjustedReserve1 = Number(pool.reserve1) / Math.pow(10, tokens[1].decimals);
    return adjustedReserve1 / adjustedReserve0;
  }, [pool, tokens]);

  // Calculate the other amount based on pool ratio
  const handleAmount0Change = useCallback((value: string) => {
    setAmount0(value);
    if (value && parseFloat(value) > 0 && priceRatio) {
      setAmount1((parseFloat(value) * priceRatio).toFixed(tokens[1].decimals > 6 ? 6 : tokens[1].decimals));
    } else {
      setAmount1('');
    }
  }, [priceRatio, tokens]);

  const handleAmount1Change = useCallback((value: string) => {
    setAmount1(value);
    if (value && parseFloat(value) > 0 && priceRatio) {
      setAmount0((parseFloat(value) / priceRatio).toFixed(tokens[0].decimals > 6 ? 6 : tokens[0].decimals));
    } else {
      setAmount0('');
    }
  }, [priceRatio, tokens]);

  // Calculate pool share and LP tokens
  const { poolShare, lpTokensEstimate } = useMemo(() => {
    if (!pool || !amount0 || !amount1 || parseFloat(amount0) <= 0) {
      return { poolShare: 0, lpTokensEstimate: '0' };
    }

    const amount0BigInt = BigInt(Math.floor(parseFloat(amount0) * Math.pow(10, tokens[0].decimals)));
    const amount1BigInt = BigInt(Math.floor(parseFloat(amount1) * Math.pow(10, tokens[1].decimals)));

    // Calculate LP tokens using SDK formula
    let lpTokens: bigint;
    if (pool.totalSupply === 0n) {
      // Initial liquidity - geometric mean
      lpTokens = BigInt(Math.floor(Math.sqrt(Number(amount0BigInt) * Number(amount1BigInt))));
    } else {
      const lp0 = (amount0BigInt * pool.totalSupply) / pool.reserve0;
      const lp1 = (amount1BigInt * pool.totalSupply) / pool.reserve1;
      lpTokens = lp0 < lp1 ? lp0 : lp1;
    }

    const newTotalSupply = pool.totalSupply + lpTokens;
    const share = newTotalSupply > 0n ? (Number(lpTokens) / Number(newTotalSupply)) * 100 : 0;

    return {
      poolShare: share,
      lpTokensEstimate: (Number(lpTokens) / Math.pow(10, 18)).toFixed(6)
    };
  }, [pool, amount0, amount1, tokens]);

  // Validation
  // NOTE: Balance checks are intentionally omitted — OptimalAMM is a demo AMM with NO real
  // token transfers. The contract only tracks reserve numbers; nothing leaves the user's wallet.
  const validationError = useMemo(() => {
    if (!amount0 || !amount1) return null;
    const amt0 = parseFloat(amount0);
    const amt1 = parseFloat(amount1);
    if (amt0 <= 0 || amt1 <= 0) return 'Enter a valid amount';
    return null;
  }, [amount0, amount1]);

  const handleAddLiquidity = async () => {
    if (!sdk || !isConnected || !amount0 || !amount1 || !pool) {
      toast.error('Please connect wallet and enter amounts');
      return;
    }

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Convert amounts to bigint with proper decimals
      const amount0Desired = BigInt(Math.floor(parseFloat(amount0) * Math.pow(10, tokens[0].decimals)));
      const amount1Desired = BigInt(Math.floor(parseFloat(amount1) * Math.pow(10, tokens[1].decimals)));

      // Calculate minimums with slippage
      const slippageMultiplier = BigInt(Math.floor((100 - slippage) * 100)); // e.g., 99.5% = 9950
      const amount0Min = (amount0Desired * slippageMultiplier) / 10000n;
      const amount1Min = (amount1Desired * slippageMultiplier) / 10000n;

      // Deadline: 20 minutes from now
      const deadline = Math.floor(Date.now() / 1000) + 20 * 60;

      // Execute real SDK call
      const result = await sdk.addLiquidity({
        poolAddress,
        amount0Desired,
        amount1Desired,
        amount0Min,
        amount1Min,
        deadline
      });
      
      toast.success(
        <div>
          <div className="font-semibold">Liquidity Added!</div>
          <div className="text-sm opacity-80">
            Added {amount0} {tokens[0].symbol} + {amount1} {tokens[1].symbol}
          </div>
          <div className="text-xs opacity-60 mt-1">
            Received {(Number(result.lpTokens) / 1e18).toFixed(4)} LP tokens
          </div>
        </div>
      );
      
      setAmount0('');
      setAmount1('');
      
      // Refresh pool data
      if (sdk) {
        const updatedPool = await sdk.refreshPool(poolAddress);
        setPool(updatedPool);
      }
      
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast.error(`Failed to add liquidity: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit = isConnected && amount0 && amount1 && parseFloat(amount0) > 0 && parseFloat(amount1) > 0 && !validationError && pool;

  // Loading state while fetching pool
  if (isFetchingPool) {
    return (
      <div className="bg-surface rounded-2xl p-6 border border-white/5">
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin h-8 w-8 text-accent-primary" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="ml-3 text-white/60">Loading pool data...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !pool) {
    return (
      <div className="bg-surface rounded-2xl p-6 border border-red-500/20">
        <div className="flex items-center gap-3 text-red-400">
          <ExclamationCircleIcon className="w-6 h-6" />
          <div>
            <div className="font-semibold">Failed to load pool</div>
            <div className="text-sm opacity-80">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-2xl p-6 border border-white/5">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Add Liquidity</h3>
        <div className="flex items-center gap-2 text-sm text-white/60">
          <InformationCircleIcon className="w-4 h-4" />
          <span>Earn fees on swaps</span>
        </div>
      </div>

      {/* Pool Price Display */}
      {priceRatio && (
        <div className="mb-4 p-3 bg-surface-light rounded-xl text-sm">
          <div className="text-white/60">Current Pool Price</div>
          <div className="font-medium">1 {tokens[0].symbol} = {priceRatio.toFixed(6)} {tokens[1].symbol}</div>
        </div>
      )}

      {/* Token 0 Input */}
      <div className="bg-surface-light rounded-xl p-4 mb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/60">Amount</span>
          <button 
            className="text-sm text-accent-primary hover:text-accent-primary/80"
            onClick={() => handleAmount0Change(token0Balance)}
          >
            Balance: {token0Balance}
          </button>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={amount0}
            onChange={(e) => handleAmount0Change(e.target.value)}
            placeholder="0.0"
            className="flex-1 bg-transparent text-2xl font-semibold outline-none"
          />
          <div className="flex items-center gap-2 bg-surface px-3 py-2 rounded-xl">
            <img src={tokens[0].icon} alt={tokens[0].symbol} className="w-6 h-6" />
            <span className="font-medium">{tokens[0].symbol}</span>
          </div>
        </div>
      </div>

      {/* Plus Icon */}
      <div className="flex justify-center -my-1 relative z-10">
        <div className="bg-surface-light p-2 rounded-lg border-4 border-surface">
          <PlusIcon className="w-5 h-5 text-white/60" />
        </div>
      </div>

      {/* Token 1 Input */}
      <div className="bg-surface-light rounded-xl p-4 mt-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/60">Amount</span>
          <button 
            className="text-sm text-accent-primary hover:text-accent-primary/80"
            onClick={() => musdcContractBalance > 0n && handleAmount1Change(token1Balance)}
            title={musdcContractBalance === 0n ? 'mUSDC balance tracked in contract state' : undefined}
          >
            Balance: {token1Balance}
          </button>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={amount1}
            onChange={(e) => handleAmount1Change(e.target.value)}
            placeholder="0.0"
            className="flex-1 bg-transparent text-2xl font-semibold outline-none"
          />
          <div className="flex items-center gap-2 bg-surface px-3 py-2 rounded-xl">
            <img src={tokens[1].icon} alt={tokens[1].symbol} className="w-6 h-6" />
            <span className="font-medium">{tokens[1].symbol}</span>
          </div>
        </div>
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="mt-4 p-3 bg-red-500/10 rounded-xl border border-red-500/20">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <ExclamationCircleIcon className="w-4 h-4" />
            {validationError}
          </div>
        </div>
      )}

      {/* Pool Info */}
      {amount0 && amount1 && !validationError && (
        <div className="mt-4 p-4 bg-surface-light rounded-xl space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-white/60">Pool Share</span>
            <span>~{poolShare.toFixed(4)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/60">LP Tokens</span>
            <span>~{lpTokensEstimate}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-white/60">Slippage Tolerance</span>
            <span>{slippage}%</span>
          </div>
        </div>
      )}

      {/* Slippage Tolerance Control */}
      <div className="mt-4 p-4 bg-surface-light rounded-xl">
        <div className="text-sm text-white/60 mb-2">Slippage Tolerance</div>
        <div className="flex items-center gap-2">
          {[0.1, 0.5, 1.0].map((val) => (
            <button
              key={val}
              onClick={() => { setSlippage(val); setCustomSlippage(''); }}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                slippage === val && !customSlippage
                  ? 'bg-accent-primary text-white'
                  : 'bg-surface text-white/60 hover:text-white'
              )}
            >
              {val}%
            </button>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              min="0.01"
              max="50"
              value={customSlippage}
              onChange={(e) => {
                const v = e.target.value;
                setCustomSlippage(v);
                const num = parseFloat(v);
                if (!isNaN(num) && num > 0 && num <= 50) setSlippage(num);
              }}
              placeholder="Custom"
              className="w-20 px-2 py-1.5 bg-surface rounded-lg text-sm outline-none text-center"
            />
            <span className="text-sm text-white/40">%</span>
          </div>
        </div>
        {slippage > 5 && (
          <div className="mt-2 flex items-center gap-1 text-xs text-amber-400">
            <ExclamationCircleIcon className="w-3.5 h-3.5" />
            High slippage — your transaction may be frontrun
          </div>
        )}
      </div>

      {/* Testnet Demo Notice */}
      <div className="mt-4 p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
        <div className="flex items-center gap-2 text-blue-400 text-sm">
          <InformationCircleIcon className="w-4 h-4 flex-shrink-0" />
          <span>Testnet demo: this AMM tracks reserves on-chain — no real tokens are transferred from your wallet.</span>
        </div>
      </div>

      {/* Privacy Badge */}
      <div className="mt-4 p-3 bg-green-500/10 rounded-xl border border-green-500/20">
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          Your LP position will be private (ZK protected)
        </div>
      </div>

      {/* Submit Button */}
      {!isConnected ? (
        <button
          onClick={() => useWalletStore.getState().connect().catch(console.error)}
          className="w-full mt-4 py-4 rounded-xl font-semibold bg-gradient-to-r from-accent-primary to-accent-secondary hover:opacity-90 transition-opacity"
        >
          Connect Wallet to Add Liquidity
        </button>
      ) : (
        <button
          onClick={handleAddLiquidity}
          disabled={!canSubmit || isLoading}
          className={clsx(
            'w-full mt-4 py-4 rounded-xl font-semibold transition-all duration-200',
            canSubmit && !isLoading
              ? 'bg-gradient-to-r from-accent-primary to-accent-secondary hover:opacity-90'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          )}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Adding Liquidity...
            </span>
          ) : !pool ? (
            'Pool Not Found'
          ) : !amount0 || !amount1 ? (
            'Enter Amounts'
          ) : validationError ? (
            validationError
          ) : (
            'Add Liquidity'
          )}
        </button>
      )}
    </div>
  );
};
