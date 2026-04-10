import { useCallback, useEffect, useState } from 'react';
import { useWalletStore } from '@/store/walletStore';
import { useSwapStore } from '@/store/swapStore';
import type { PendingSwapInfo } from '@/store/swapStore';
import toast from 'react-hot-toast';

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// Parse token amount string to bigint (e.g. "1.5" with 18 decimals → 1_500_000_000_000_000_000n)
function parseTokenAmount(amount: string, decimals: number): bigint {
  if (!amount || amount === '0' || amount === '') return 0n;
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt((whole || '0') + paddedFraction);
}

// Format bigint to human-readable string
function formatTokenAmount(amount: bigint, decimals: number): string {
  if (amount === 0n) return '';
  const str = amount.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, -decimals) || '0';
  const fraction = str.slice(-decimals).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}

export function useSwap() {
  const { sdk, isConnected } = useWalletStore();
  const {
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    quoteDirection,
    slippageBps,
    deadlineMinutes,
    setQuote,
    setLoading,
    setSwapping,
    setError,
    setPendingSwap,
    updatePendingStatus,
  } = useSwapStore();

  // Debounce both inputs
  const debouncedAmountIn = useDebounce(amountIn, 500);
  const debouncedAmountOut = useDebounce(amountOut, 500);

  // Pool address from env (fallback to deployed pool on preprod)
  const poolAddress = import.meta.env.VITE_POOL_TNIGHT_MUSDC || '57c54a7c61f60a1f769313d89a4191782fa92c7d91bb51e79bfc9256eca1229b';

  // ----------------------------------------------------------------
  // Quote: amountIn → amountOut  (user typed into the "pay" field)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (quoteDirection !== 'in') return;
    if (!sdk || !tokenIn || !tokenOut || !debouncedAmountIn) return;

    const amountInBigInt = parseTokenAmount(debouncedAmountIn, tokenIn.decimals);
    if (amountInBigInt <= 0n) return;

    const fetchQuote = async () => {
      setLoading(true);
      setError(null);
      try {
        const zeroForOne = tokenIn.symbol === 'tNight';
        const quote = await sdk.getSwapQuote(poolAddress, amountInBigInt, zeroForOne, slippageBps);
        setQuote({
          amountOut: formatTokenAmount(quote.amountOut, tokenOut.decimals),
          priceImpact: quote.priceImpact,
          fee: quote.fee,
          mevSavings: quote.mevSavings,
          executionPrice: quote.executionPrice,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get quote';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [sdk, tokenIn, tokenOut, debouncedAmountIn, quoteDirection, poolAddress, slippageBps, setQuote, setLoading, setError]);

  // ----------------------------------------------------------------
  // Reverse Quote: amountOut → amountIn  (user typed into "receive" field)
  // ----------------------------------------------------------------
  useEffect(() => {
    if (quoteDirection !== 'out') return;
    if (!sdk || !tokenIn || !tokenOut || !debouncedAmountOut) return;

    const amountOutBigInt = parseTokenAmount(debouncedAmountOut, tokenOut.decimals);
    if (amountOutBigInt <= 0n) return;

    const fetchReverseQuote = async () => {
      setLoading(true);
      setError(null);
      try {
        const zeroForOne = tokenIn.symbol === 'tNight';
        const quote = await sdk.swaps.getQuoteReverse(poolAddress, amountOutBigInt, zeroForOne, slippageBps);
        setQuote({
          amountIn: formatTokenAmount(quote.amountIn, tokenIn.decimals),
          priceImpact: quote.priceImpact,
          fee: quote.fee,
          mevSavings: quote.mevSavings,
          executionPrice: quote.executionPrice,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to get quote';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchReverseQuote();
  }, [sdk, tokenIn, tokenOut, debouncedAmountOut, quoteDirection, poolAddress, slippageBps, setQuote, setLoading, setError]);

  // ----------------------------------------------------------------
  // Execute Swap (Optimistic — returns in <2s)
  // ----------------------------------------------------------------
  const executeSwap = useCallback(async () => {
    if (!sdk || !isConnected || !tokenIn || !tokenOut) return;

    // Use whichever amount is the "controlled" input
    const effectiveAmountIn = amountIn;
    if (!effectiveAmountIn || parseFloat(effectiveAmountIn) <= 0) {
      toast.error('Invalid amount');
      return;
    }

    const amountInBigInt = parseTokenAmount(effectiveAmountIn, tokenIn.decimals);
    if (amountInBigInt <= 0n) {
      toast.error('Invalid amount');
      return;
    }

    setSwapping(true);
    setError(null);

    try {
      const zeroForOne = tokenIn.symbol === 'tNight';

      // Fetch a fresh quote (this also warms the pool cache for the optimistic path)
      const quote = await sdk.getSwapQuote(poolAddress, amountInBigInt, zeroForOne, slippageBps);
      const deadline = Math.floor(Date.now() / 1000) + deadlineMinutes * 60;

      // Use the optimistic swap path — returns immediately with expected output
      const optimistic = sdk.swapOptimistic({
        poolAddress,
        amountIn: amountInBigInt,
        amountOutMin: quote.minimumReceived,
        zeroForOne,
        deadline,
      });

      const expectedOut = formatTokenAmount(optimistic.expectedAmountOut, tokenOut.decimals);

      // Set up pending swap tracking in the store
      const pending: PendingSwapInfo = {
        pendingId: optimistic.pendingId,
        tokenIn,
        tokenOut,
        amountIn: effectiveAmountIn,
        expectedAmountOut: expectedOut,
        status: 'proving',
        startTime: Date.now(),
      };
      setPendingSwap(pending);

      // Show immediate success toast — swap is "submitted"
      toast.success(
        <div>
          <div className="font-semibold">Swap Submitted!</div>
          <div className="text-sm opacity-80">
            Swapping {effectiveAmountIn} {tokenIn.symbol} for ~{expectedOut} {tokenOut.symbol}
          </div>
          <div className="text-xs text-blue-400 mt-1">
            ZK proof generating in background...
          </div>
        </div>,
        { duration: 4000 }
      );

      // Clear input fields so user can queue another swap, but do NOT call
      // reset() — that would wipe pendingSwap, tokens, and other state we need.
      useSwapStore.setState({
        amountIn: '',
        amountOut: '',
        priceImpact: 0,
        fee: 0n,
        mevSavings: 0n,
        executionPrice: 0,
        error: null,
      });
      setSwapping(false);

      // Subscribe to background status updates
      const unsub = optimistic.onStatusChange((status, detail) => {
        updatePendingStatus(status, detail);

        if (status === 'confirming' && detail) {
          toast(
            <div>
              <div className="font-semibold">Transaction Submitted</div>
              <div className="text-xs opacity-70 mt-1">Waiting for on-chain confirmation...</div>
            </div>,
            { duration: 3000, icon: '⏳' }
          );
        }
      });

      // Handle final confirmation in the background
      optimistic.confirmation.then(
        (result) => {
          unsub();
          toast.success(
            <div>
              <div className="font-semibold">Swap Confirmed!</div>
              <div className="text-sm opacity-80">
                {effectiveAmountIn} {tokenIn.symbol} → {formatTokenAmount(result.amountOut, tokenOut.decimals)} {tokenOut.symbol}
              </div>
              <div className="text-xs text-green-400 mt-1">
                Block #{result.blockNumber} | MEV Saved: ${(Number(result.mevSaved) / Math.pow(10, tokenOut.decimals)).toFixed(2)}
              </div>
            </div>,
            { duration: 6000 }
          );
          // Refresh wallet balance so UI shows updated amounts
          useWalletStore.getState().refreshBalance();
          // Clear the pending swap
          setPendingSwap(null);
        },
        (error: unknown) => {
          unsub();
          const message = error instanceof Error ? error.message : 'Swap failed';
          toast.error(
            <div>
              <div className="font-semibold">Swap Failed</div>
              <div className="text-sm opacity-80">{message}</div>
            </div>,
            { duration: 6000 }
          );
          setPendingSwap(null);
        },
      );

      return optimistic;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Swap failed';
      setError(message);
      toast.error(`Swap failed: ${message}`);
      setSwapping(false);
      throw err;
    }
  }, [sdk, isConnected, tokenIn, tokenOut, amountIn, poolAddress, slippageBps, deadlineMinutes, setSwapping, setError, setPendingSwap, updatePendingStatus]);

  const isReady =
    isConnected &&
    !!tokenIn &&
    !!tokenOut &&
    !!amountIn &&
    parseFloat(amountIn) > 0;

  return { executeSwap, isReady };
}
