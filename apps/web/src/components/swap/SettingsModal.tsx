/**
 * SettingsModal - Swap settings modal
 */

import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useSwapStore } from '@/store/swapStore';
import clsx from 'clsx';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SLIPPAGE_PRESETS = [
  { label: '0.1%', value: 10 },
  { label: '0.5%', value: 50 },
  { label: '1%', value: 100 },
];

const DEADLINE_PRESETS = [
  { label: '10m', value: 10 },
  { label: '20m', value: 20 },
  { label: '30m', value: 30 },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  const { slippageBps, deadlineMinutes, setSlippage, setDeadline } = useSwapStore();

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Custom slippage input
  const handleCustomSlippage = (value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0 && num <= 50) {
      setSlippage(Math.round(num * 100));
    }
  };

  // Custom deadline input
  const handleCustomDeadline = (value: string) => {
    const num = parseInt(value);
    if (!isNaN(num) && num >= 1 && num <= 180) {
      setDeadline(num);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-sm bg-surface rounded-2xl border border-white/10 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-lg font-semibold">Transaction Settings</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Slippage Tolerance */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Slippage Tolerance</span>
              <span className="text-sm text-white/60">{(slippageBps / 100).toFixed(2)}%</span>
            </div>
            <div className="flex gap-2">
              {SLIPPAGE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setSlippage(preset.value)}
                  className={clsx(
                    'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
                    slippageBps === preset.value
                      ? 'bg-accent-primary text-white'
                      : 'bg-surface-light hover:bg-surface-lighter'
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Custom"
                  value={!SLIPPAGE_PRESETS.some(p => p.value === slippageBps) ? (slippageBps / 100).toString() : ''}
                  onChange={(e) => handleCustomSlippage(e.target.value)}
                  className="w-full py-2 px-3 rounded-lg text-sm bg-surface-light border border-white/10 focus:border-accent-primary focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">%</span>
              </div>
            </div>
            {slippageBps < 10 && (
              <p className="mt-2 text-xs text-amber-400">
                Low slippage may cause transaction to fail
              </p>
            )}
            {slippageBps > 500 && (
              <p className="mt-2 text-xs text-amber-400">
                High slippage increases risk of unfavorable trades
              </p>
            )}
          </div>

          {/* Transaction Deadline */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Transaction Deadline</span>
              <span className="text-sm text-white/60">{deadlineMinutes} minutes</span>
            </div>
            <div className="flex gap-2">
              {DEADLINE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setDeadline(preset.value)}
                  className={clsx(
                    'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
                    deadlineMinutes === preset.value
                      ? 'bg-accent-primary text-white'
                      : 'bg-surface-light hover:bg-surface-lighter'
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Custom"
                  value={!DEADLINE_PRESETS.some(p => p.value === deadlineMinutes) ? deadlineMinutes.toString() : ''}
                  onChange={(e) => handleCustomDeadline(e.target.value)}
                  className="w-full py-2 px-3 rounded-lg text-sm bg-surface-light border border-white/10 focus:border-accent-primary focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">m</span>
              </div>
            </div>
          </div>

          {/* MEV Protection Info */}
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 text-green-400 text-sm font-medium mb-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              MEV Protection Active
            </div>
            <p className="text-xs text-white/60">
              All transactions are protected with zero-knowledge proofs. 
              Your trade details are never visible on-chain.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-accent-primary hover:opacity-90 font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
