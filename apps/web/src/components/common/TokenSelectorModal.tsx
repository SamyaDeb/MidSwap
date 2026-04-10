/**
 * TokenSelectorModal - Modal for selecting tokens in swap/liquidity
 */

import React, { useState, useMemo } from 'react';
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useWalletStore } from '@/store/walletStore';
import { SUPPORTED_TOKENS, type TokenInfo } from '@midswap/sdk';
import clsx from 'clsx';

interface TokenSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenInfo) => void;
  excludeToken?: TokenInfo;
  title?: string;
}

// Convert SUPPORTED_TOKENS to array
const TOKEN_LIST: TokenInfo[] = Object.values(SUPPORTED_TOKENS);

export const TokenSelectorModal: React.FC<TokenSelectorModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  excludeToken,
  title = 'Select a token'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const { balance } = useWalletStore();

  // Filter tokens based on search and exclusion
  const filteredTokens = useMemo(() => {
    return TOKEN_LIST.filter(token => {
      // Exclude the specified token
      if (excludeToken && token.symbol === excludeToken.symbol) {
        return false;
      }

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          token.symbol.toLowerCase().includes(query) ||
          token.name.toLowerCase().includes(query) ||
          token.address.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [searchQuery, excludeToken]);

  // Get token balance
  const getTokenBalance = (token: TokenInfo): string => {
    if (token.address === 'native') {
      const nativeBalance = balance.native;
      if (nativeBalance === 0n) return '0';
      const normalized = Number(nativeBalance) / Math.pow(10, token.decimals);
      return normalized.toFixed(4);
    }
    
    const tokenBalance = balance.shieldedTokens.get(token.address);
    if (!tokenBalance || tokenBalance === 0n) return '0';
    const normalized = Number(tokenBalance) / Math.pow(10, token.decimals);
    return normalized.toFixed(4);
  };

  // Handle token selection
  const handleSelect = (token: TokenInfo) => {
    onSelect(token);
    onClose();
    setSearchQuery('');
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
      setSearchQuery('');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md bg-surface rounded-2xl border border-white/10 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or address"
              className="w-full pl-10 pr-4 py-3 bg-surface-light rounded-xl border border-white/10 focus:border-accent-primary focus:outline-none text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Token List */}
        <div className="max-h-80 overflow-y-auto pb-4">
          {filteredTokens.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/40">
              No tokens found
            </div>
          ) : (
            <div className="space-y-1 px-2">
              {filteredTokens.map((token) => (
                <button
                  key={token.symbol}
                  onClick={() => handleSelect(token)}
                  className={clsx(
                    'w-full flex items-center gap-3 p-3 rounded-xl',
                    'hover:bg-white/5 transition-colors text-left'
                  )}
                >
                  {/* Token Icon */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-primary/20 to-accent-secondary/20 flex items-center justify-center">
                    {token.logoURI ? (
                      <img
                        src={token.logoURI}
                        alt={token.symbol}
                        className="w-8 h-8 rounded-full"
                        onError={(e) => {
                          // Fallback to text if image fails
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-sm font-semibold">
                        {token.symbol.slice(0, 2)}
                      </span>
                    )}
                  </div>

                  {/* Token Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{token.symbol}</span>
                      {token.isShielded && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-500/20 text-green-400 rounded">
                          Shielded
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-white/40 truncate">
                      {token.name}
                    </div>
                  </div>

                  {/* Balance */}
                  <div className="text-right">
                    <div className="font-medium">{getTokenBalance(token)}</div>
                    <div className="text-xs text-white/40">Balance</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <p className="text-xs text-white/40 text-center">
            Only shielded tokens are supported for maximum privacy
          </p>
        </div>
      </div>
    </div>
  );
};

export default TokenSelectorModal;
