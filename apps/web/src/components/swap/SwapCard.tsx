import React, { useState } from 'react';
import { ArrowDownIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useSwapStore } from '@/store/swapStore';
import { useWalletStore } from '@/store/walletStore';
import { TokenInput } from './TokenInput';
import { SwapDetails } from './SwapDetails';
import { TokenSelectorModal } from '@/components/common/TokenSelectorModal';
import { SettingsModal } from './SettingsModal';
import { useSwap } from '@/hooks/useSwap';
import type { TokenInfo } from '@midswap/sdk';
import clsx from 'clsx';

// Status label mapping for pending swap indicator
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  validating: { label: 'Validating...', color: 'text-blue-400' },
  proving: { label: 'Generating ZK proof...', color: 'text-blue-400' },
  submitting: { label: 'Submitting transaction...', color: 'text-yellow-400' },
  confirming: { label: 'Waiting for confirmation...', color: 'text-yellow-400' },
  confirmed: { label: 'Confirmed!', color: 'text-green-400' },
  failed: { label: 'Failed', color: 'text-red-400' },
};

function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export const SwapCard: React.FC = () => {
  const { isConnected, connect } = useWalletStore();
  const {
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    quoteDirection,
    isLoading,
    isSwapping,
    priceImpact,
    mevSavings,
    pendingSwap,
    switchTokens,
    setTokenIn,
    setTokenOut,
    setAmountIn,
    setAmountOut,
  } = useSwapStore();

  const { executeSwap, isReady } = useSwap();

  // Modal states
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false);
  const [selectingFor, setSelectingFor] = useState<'in' | 'out'>('in');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Elapsed timer for pending swap
  const [, setTick] = useState(0);
  React.useEffect(() => {
    if (!pendingSwap || pendingSwap.status === 'confirmed' || pendingSwap.status === 'failed') return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [pendingSwap?.status, pendingSwap?.pendingId]);

  // Handle token selection
  const handleOpenTokenSelector = (type: 'in' | 'out') => {
    setSelectingFor(type);
    setTokenSelectorOpen(true);
  };

  const handleTokenSelect = (token: TokenInfo) => {
    if (selectingFor === 'in') {
      if (tokenOut && token.symbol === tokenOut.symbol) {
        switchTokens();
      } else {
        setTokenIn(token);
      }
    } else {
      if (tokenIn && token.symbol === tokenIn.symbol) {
        switchTokens();
      } else {
        setTokenOut(token);
      }
    }
  };

  const handleSwap = async () => {
    try {
      await executeSwap();
    } catch {
      // Error handled in hook
    }
  };

  const handleConnectWallet = () => {
    connect().catch(console.error);
  };

  // Which field is loading (the auto-computed one)
  const inLoading = isLoading && quoteDirection === 'out';
  const outLoading = isLoading && quoteDirection === 'in';

  // Button state and text
  const getButtonState = () => {
    if (!isConnected) {
      return { text: 'Connect Wallet', disabled: false, action: handleConnectWallet };
    }
    if (!tokenIn || !tokenOut) {
      return { text: 'Select tokens', disabled: true };
    }
    if (!amountIn || parseFloat(amountIn) === 0) {
      return { text: 'Enter amount', disabled: true };
    }
    if (isLoading) {
      return { text: 'Fetching quote...', disabled: true };
    }
    if (isSwapping) {
      return { text: 'Swapping...', disabled: true };
    }
    // Prevent double-submit while a previous swap is still proving/confirming
    if (pendingSwap && pendingSwap.status !== 'confirmed' && pendingSwap.status !== 'failed') {
      return { text: 'Swap in progress...', disabled: true };
    }
    if (priceImpact > 500) {
      return { text: `High Price Impact (${(priceImpact / 100).toFixed(2)}%)`, disabled: false, action: handleSwap };
    }
    return { text: 'Swap', disabled: !isReady, action: handleSwap };
  };

  const buttonState = getButtonState();

  return (
    <>
      <div className="w-full max-w-md mx-auto">
        <div className="bg-surface rounded-3xl border border-white/5 p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Swap</h2>
            <button 
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-lg hover:bg-surface-light transition-colors"
              title="Settings"
            >
              <Cog6ToothIcon className="w-5 h-5 text-white/60" />
            </button>
          </div>

          {/* Pending Swap Banner */}
          {pendingSwap && pendingSwap.status !== 'confirmed' && pendingSwap.status !== 'failed' && (
            <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-blue-400" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className={clsx('text-sm font-medium', STATUS_LABELS[pendingSwap.status]?.color || 'text-blue-400')}>
                    {STATUS_LABELS[pendingSwap.status]?.label || pendingSwap.status}
                  </span>
                </div>
                <span className="text-xs text-white/40">
                  {formatElapsed(Date.now() - pendingSwap.startTime)}
                </span>
              </div>
              <div className="text-xs text-white/50 mt-1">
                {pendingSwap.amountIn} {pendingSwap.tokenIn.symbol} → ~{pendingSwap.expectedAmountOut} {pendingSwap.tokenOut.symbol}
              </div>
              {pendingSwap.txHash && (
                <div className="text-xs text-white/30 mt-1 font-mono truncate">
                  tx: {pendingSwap.txHash.slice(0, 16)}...
                </div>
              )}
            </div>
          )}

          {/* From Token */}
          <TokenInput
            label="You pay"
            token={tokenIn}
            amount={amountIn}
            onAmountChange={setAmountIn}
            onTokenSelect={() => handleOpenTokenSelector('in')}
            showMax={true}
            loading={inLoading}
          />

          {/* Switch Button */}
          <div className="flex justify-center -my-2 relative z-10">
            <button
              onClick={switchTokens}
              className="p-2 rounded-xl bg-surface-light border border-white/10 hover:bg-surface-lighter transition-colors hover:rotate-180 duration-200"
              title="Switch tokens"
            >
              <ArrowDownIcon className="w-5 h-5" />
            </button>
          </div>

          {/* To Token */}
          <TokenInput
            label="You receive"
            token={tokenOut}
            amount={amountOut}
            onAmountChange={setAmountOut}
            onTokenSelect={() => handleOpenTokenSelector('out')}
            loading={outLoading}
            showMax={false}
          />

          {/* Swap Details */}
          {amountIn && amountOut && tokenIn && tokenOut && (
            <SwapDetails
              priceImpact={priceImpact}
              mevSavings={mevSavings}
              tokenIn={tokenIn}
              tokenOut={tokenOut}
            />
          )}

          {/* Swap Button */}
          <button
            onClick={buttonState.action}
            disabled={buttonState.disabled}
            className={clsx(
              'w-full mt-4 py-4 rounded-2xl font-semibold text-lg transition-all',
              buttonState.disabled
                ? 'bg-surface-light text-white/40 cursor-not-allowed'
                : priceImpact > 500
                ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                : 'bg-gradient-to-r from-accent-primary to-accent-secondary hover:opacity-90'
            )}
          >
            {isSwapping ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Swapping...
              </span>
            ) : (
              buttonState.text
            )}
          </button>

          {/* Privacy Badge */}
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-green-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>ZK Private Transaction</span>
          </div>
        </div>
      </div>

      {/* Token Selector Modal */}
      <TokenSelectorModal
        isOpen={tokenSelectorOpen}
        onClose={() => setTokenSelectorOpen(false)}
        onSelect={handleTokenSelect}
        excludeToken={selectingFor === 'in' ? tokenOut ?? undefined : tokenIn ?? undefined}
        title={selectingFor === 'in' ? 'Select token to pay' : 'Select token to receive'}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
};

