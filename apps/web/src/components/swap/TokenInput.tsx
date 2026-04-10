import React, { useEffect, useState } from 'react';
import type { TokenInfo } from '@midswap/sdk';
import { useWalletStore } from '@/store/walletStore';
import { getTokenPrice, formatUSD } from '@/services/PriceOracle';
import clsx from 'clsx';

interface TokenInputProps {
  label: string;
  token: TokenInfo | null;
  amount: string;
  onAmountChange: (value: string) => void;
  onTokenSelect: () => void;
  readOnly?: boolean;
  loading?: boolean;
  showMax?: boolean;
}

export const TokenInput: React.FC<TokenInputProps> = ({
  label,
  token,
  amount,
  onAmountChange,
  onTokenSelect,
  readOnly = false,
  loading = false,
  showMax = true
}) => {
  const { balance, isConnected } = useWalletStore();
  const [usdValue, setUsdValue] = useState<string>('$0.00');
  const [tokenPrice, setTokenPrice] = useState<number>(0);

  // Get token balance
  const getTokenBalance = (): string => {
    if (!token || !isConnected) return '0.00';

    if (token.address === 'native') {
      const nativeBalance = balance.native;
      if (nativeBalance === 0n) return '0.00';
      const normalized = Number(nativeBalance) / Math.pow(10, token.decimals);
      return normalized.toLocaleString(undefined, { 
        minimumFractionDigits: 2,
        maximumFractionDigits: 6 
      });
    }

    const tokenBalance = balance.shieldedTokens.get(token.address);
    if (!tokenBalance || tokenBalance === 0n) return '0.00';
    const normalized = Number(tokenBalance) / Math.pow(10, token.decimals);
    return normalized.toLocaleString(undefined, { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 6 
    });
  };

  // Get balance as number for max button
  const getBalanceNumber = (): number => {
    if (!token || !isConnected) return 0;

    if (token.address === 'native') {
      const nativeBalance = balance.native;
      if (nativeBalance === 0n) return 0;
      return Number(nativeBalance) / Math.pow(10, token.decimals);
    }

    const tokenBalance = balance.shieldedTokens.get(token.address);
    if (!tokenBalance || tokenBalance === 0n) return 0;
    return Number(tokenBalance) / Math.pow(10, token.decimals);
  };

  // Handle max button click
  const handleMax = () => {
    const balanceNum = getBalanceNumber();
    if (balanceNum > 0) {
      // Leave a small amount for gas if native token
      const maxAmount = token?.address === 'native' 
        ? Math.max(0, balanceNum - 0.01) 
        : balanceNum;
      onAmountChange(maxAmount.toString());
    }
  };

  // Fetch token price and calculate USD value
  useEffect(() => {
    if (!token) {
      setUsdValue('$0.00');
      return;
    }

    const fetchPrice = async () => {
      try {
        const price = await getTokenPrice(token.symbol);
        setTokenPrice(price);
      } catch {
        setTokenPrice(0);
      }
    };

    fetchPrice();
  }, [token]);

  // Update USD value when amount or price changes
  useEffect(() => {
    if (!amount || parseFloat(amount) === 0 || tokenPrice === 0) {
      setUsdValue('$0.00');
      return;
    }

    const value = parseFloat(amount) * tokenPrice;
    setUsdValue(formatUSD(value));
  }, [amount, tokenPrice]);

  return (
    <div className="bg-midnight rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-white/60">{label}</span>
        {token && isConnected && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/40">
              Balance: {getTokenBalance()}
            </span>
            {showMax && !readOnly && getBalanceNumber() > 0 && (
              <button
                onClick={handleMax}
                className="text-xs px-2 py-0.5 rounded bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 transition-colors"
              >
                MAX
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        {/* Amount Input */}
        <div className="flex-1">
          {loading ? (
            <div className="h-10 bg-surface-light rounded-lg animate-pulse" />
          ) : (
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => {
                const value = e.target.value;
                // Allow only numbers and single decimal point
                if (/^[0-9]*\.?[0-9]*$/.test(value)) {
                  onAmountChange(value);
                }
              }}
              readOnly={readOnly}
              className={clsx(
                'w-full bg-transparent text-3xl font-medium',
                'placeholder-white/20 focus:outline-none',
                readOnly && 'cursor-default'
              )}
            />
          )}
        </div>

        {/* Token Selector */}
        <button
          onClick={onTokenSelect}
          className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-xl',
            'bg-surface-light hover:bg-surface-lighter transition-colors',
            'border border-white/10'
          )}
        >
          {token ? (
            <>
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center overflow-hidden">
                {token.logoURI ? (
                  <img 
                    src={token.logoURI} 
                    alt={token.symbol}
                    className="w-6 h-6"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <span className={clsx("text-xs font-bold", token.logoURI && "hidden")}>
                  {token.symbol[0]}
                </span>
              </div>
              <span className="font-semibold">{token.symbol}</span>
            </>
          ) : (
            <span className="font-semibold text-accent-primary">Select token</span>
          )}
          <svg className="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* USD Value */}
      {token && (
        <div className="mt-2 text-sm text-white/40">
          {amount && parseFloat(amount) > 0 ? (
            <span>≈ {usdValue}</span>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
      )}
    </div>
  );
};
