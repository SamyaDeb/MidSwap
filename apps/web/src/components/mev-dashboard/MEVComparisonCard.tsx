import React from 'react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import clsx from 'clsx';

interface Feature {
  label: string;
  value: string;
  good?: boolean;
  bad?: boolean;
}

interface MEVComparisonCardProps {
  platform: string;
  features: Feature[];
  highlighted?: boolean;
}

export const MEVComparisonCard: React.FC<MEVComparisonCardProps> = ({
  platform,
  features,
  highlighted = false
}) => {
  return (
    <div className={clsx(
      'rounded-2xl p-6 border transition-all duration-300',
      highlighted 
        ? 'bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/30 shadow-lg shadow-green-500/5' 
        : 'bg-surface border-white/5'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className={clsx(
          'text-xl font-bold',
          highlighted && 'text-green-400'
        )}>
          {platform}
        </h3>
        {highlighted && (
          <span className="px-3 py-1 bg-green-500/20 rounded-full text-green-400 text-xs font-medium">
            RECOMMENDED
          </span>
        )}
      </div>

      {/* Features List */}
      <div className="space-y-4">
        {features.map((feature, index) => (
          <div 
            key={index}
            className="flex items-center justify-between py-3 border-b border-white/5 last:border-0"
          >
            <span className="text-white/60 text-sm">{feature.label}</span>
            <div className="flex items-center gap-2">
              <span className={clsx(
                'text-sm font-medium',
                feature.good && 'text-green-400',
                feature.bad && 'text-red-400',
                !feature.good && !feature.bad && 'text-white'
              )}>
                {feature.value}
              </span>
              {feature.good && (
                <CheckCircleIcon className="w-5 h-5 text-green-400" />
              )}
              {feature.bad && (
                <XCircleIcon className="w-5 h-5 text-red-400" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Message */}
      {highlighted ? (
        <div className="mt-6 p-4 bg-green-500/10 rounded-xl">
          <p className="text-sm text-green-400 text-center font-medium">
            Trade with complete privacy and zero MEV risk
          </p>
        </div>
      ) : (
        <div className="mt-6 p-4 bg-red-500/10 rounded-xl">
          <p className="text-sm text-red-400 text-center">
            Traders lost $1.38B to MEV in 2023
          </p>
        </div>
      )}
    </div>
  );
};
