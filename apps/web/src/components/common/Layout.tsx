import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ConnectWallet } from '../wallet/ConnectWallet';
import clsx from 'clsx';

const NAV_ITEMS = [
  { path: '/swap', label: 'Swap' },
  { path: '/pools', label: 'Pools' },
  { path: '/mev', label: 'MEV Dashboard' },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = useLocation().pathname;

  return (
    <div className="min-h-screen bg-midnight">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-radial from-accent-primary/5 via-transparent to-transparent pointer-events-none" />
      
      {/* Header */}
      <header className="relative z-10 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <img src="/logo.png" alt="MidSwap Logo" className="w-9 h-9 object-contain" />
              <span className="text-xl font-bold text-white">MidSwap</span>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={clsx(
                    'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    pathname === item.path
                      ? 'bg-surface-light text-white'
                      : 'text-white/60 hover:text-white hover:bg-surface-light/50'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Wallet */}
            <div className="flex items-center gap-4">
              {/* Network badge */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-surface-light rounded-lg">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-white/60">Preprod</span>
              </div>
              
              <ConnectWallet />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-white/40 text-sm">
              <span>Built on</span>
              <span className="font-semibold text-white/60">Midnight</span>
              <span className="text-accent-primary">|</span>
              <span>Privacy-First DeFi</span>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-white/40">
              <a href="https://docs.midnight.network" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Docs</a>
              <a href="https://github.com/MidSwap" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
