import React, { useEffect } from 'react';
import { useWalletStore } from '@/store/walletStore';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface ConnectWalletProps {
  className?: string;
}

export const ConnectWallet: React.FC<ConnectWalletProps> = ({ className }) => {
  const { 
    isConnected, 
    isConnecting, 
    address, 
    error,
    connect, 
    disconnect,
    clearError 
  } = useWalletStore();

  // Show error toast with helpful guidance
  useEffect(() => {
      if (error) {
        // Check if it's a "not found" error and give better guidance
        if (error.includes('not found') || error.includes('not installed')) {
          const midnight = (window as any).midnight;
          const keys = midnight ? Object.keys(midnight) : [];
          const globals = [
            (window as any).lace ? 'window.lace' : null,
            (window as any).midnightLace ? 'window.midnightLace' : null,
            (window as any).laceMidnight ? 'window.laceMidnight' : null,
          ].filter(Boolean);
          const found = [...keys, ...globals];
          const msg = found.length > 0
            ? `Lace not connected yet. Found wallet globals: [${found.join(', ')}]. Refresh once after opening the extension, then try again.`
            : 'Lace wallet global not detected yet. Open the Lace extension, refresh the page, and ensure the site is allowed by the extension.';
          toast.error(msg, { duration: 8000 });
        } else {
          toast.error(error, { duration: 6000 });
        }
      clearError();
    }
  }, [error, clearError]);

  const handleClick = async () => {
    if (isConnected) {
      disconnect();
      toast.success('Wallet disconnected');
    } else {
      try {
        await connect();
        toast.success('Wallet connected!');
      } catch {
        // Error already handled by store + useEffect above
      }
    }
  };

  // Truncate address for display
  const displayAddress = address 
    ? `${address.slice(0, 8)}...${address.slice(-6)}`
    : '';

  return (
    <button
      onClick={handleClick}
      disabled={isConnecting}
      className={clsx(
        'px-4 py-2.5 rounded-xl font-semibold transition-all duration-200',
        'flex items-center gap-2',
        isConnected
          ? 'bg-surface-light hover:bg-surface-lighter border border-white/10'
          : 'bg-gradient-to-r from-accent-primary to-accent-secondary hover:opacity-90',
        isConnecting && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {isConnecting ? (
        <>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle 
              className="opacity-25" 
              cx="12" cy="12" r="10" 
              stroke="currentColor" 
              strokeWidth="4" 
              fill="none" 
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" 
            />
          </svg>
          <span>Connecting...</span>
        </>
      ) : isConnected ? (
        <>
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="font-mono text-sm">{displayAddress}</span>
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" 
            />
          </svg>
          <span>Connect Wallet</span>
        </>
      )}
    </button>
  );
};
