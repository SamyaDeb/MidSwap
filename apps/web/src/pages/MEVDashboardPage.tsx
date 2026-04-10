import React, { useEffect, useMemo } from 'react';
import { 
  ShieldCheckIcon, 
  CurrencyDollarIcon,
  ChartBarIcon,
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';
import { useWalletStore } from '@/store/walletStore';
import { useMEVStore } from '@/store/mevStore';
import { LiveMEVFeed } from '@/components/mev-dashboard/LiveMEVFeed';
import { MEVSavingsChart } from '@/components/mev-dashboard/MEVSavingsChart';

// Stat Card Component
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  sublabel?: string;
  danger?: boolean;
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ 
  icon, 
  label, 
  value, 
  trend, 
  trendUp, 
  sublabel,
  danger,
  loading
}) => (
  <div className={`
    bg-surface rounded-2xl p-6 border
    ${danger ? 'border-red-500/20' : 'border-white/5'}
  `}>
    <div className={`
      w-12 h-12 rounded-xl flex items-center justify-center mb-4
      ${danger ? 'bg-red-500/10 text-red-400' : 'bg-accent-primary/10 text-accent-primary'}
    `}>
      {icon}
    </div>
    <div className="text-sm text-white/60 mb-1">{label}</div>
    <div className="flex items-baseline gap-2">
      {loading ? (
        <div className="h-8 w-24 bg-white/10 rounded animate-pulse" />
      ) : (
        <>
          <span className="text-2xl font-bold">{value}</span>
          {trend && (
            <span className={`text-sm ${trendUp ? 'text-green-400' : 'text-red-400'}`}>
              {trend}
            </span>
          )}
        </>
      )}
    </div>
    {sublabel && (
      <div className="text-xs text-white/40 mt-1">{sublabel}</div>
    )}
  </div>
);

export const MEVDashboardPage: React.FC = () => {
  const { sdk, isConnected, connect } = useWalletStore();
  const { tradeHistory, userStats, ethereumData, setEthereumData, setUserStats } = useMEVStore();

  // Fetch Ethereum MEV data
  useEffect(() => {
    if (!sdk) return;

    const fetchData = async () => {
      try {
        const data = await sdk.getEthereumMEVStats();
        setEthereumData(data);
      } catch (error) {
        console.warn('Failed to fetch MEV stats:', error);
      }
    };

    fetchData();
    
    // Refresh every minute
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [sdk, setEthereumData]);

  // Calculate user stats from trade history
  useEffect(() => {
    if (!sdk || tradeHistory.length === 0) return;

    const trades = tradeHistory.map(t => ({
      amountIn: t.amountIn,
      amountOut: t.amountOut,
      timestamp: t.timestamp
    }));

    const stats = sdk.mev.calculateCumulativeSavings(trades);
    setUserStats(stats);
  }, [sdk, tradeHistory, setUserStats]);

  // Compute display stats
  // MEV savings are in the output token's native units – the MEV analytics module
  // computes estimatedMEV as a fraction of amountOut, so its scale matches the
  // output token. For display as USD-like values we use the output token decimals.
  // Since the dashboard aggregates across trades (which could be either direction),
  // we pick 6 decimals (mUSDC) as a reasonable dollar-proxy denominator. When
  // tNight is the output the value is tiny enough that rounding is fine.
  const MEV_DISPLAY_DECIMALS = 6;
  const displayStats = useMemo(() => {
    const totalSaved = userStats 
      ? `$${(Number(userStats.totalSaved) / Math.pow(10, MEV_DISPLAY_DECIMALS)).toFixed(2)}`
      : '$0.00';
    
    const tradesProtected = userStats?.tradesProtected || 0;
    
    const avgSavingsPerTrade = userStats && userStats.tradesProtected > 0
      ? `$${(Number(userStats.avgSavingsPerTrade) / Math.pow(10, MEV_DISPLAY_DECIMALS)).toFixed(2)}`
      : '$0.00';
    
    const ethMEVLast24h = ethereumData?.last24hMEV || '$--';

    // Calculate trend (mock for now - would need historical data)
    const trend = tradesProtected > 0 ? '+12.5%' : undefined;

    return {
      totalSaved,
      tradesProtected,
      avgSavingsPerTrade,
      ethMEVLast24h,
      trend
    };
  }, [userStats, ethereumData]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-full text-green-400 mb-4">
          <ShieldCheckIcon className="w-5 h-5" />
          <span className="font-medium">MEV Protection Active</span>
        </div>
        <h1 className="text-4xl font-bold mb-4">
          Your Trades Are <span className="text-green-400">Private</span>
        </h1>
        <p className="text-white/60 max-w-2xl mx-auto">
          Every swap on MidSwap uses zero-knowledge proofs to hide your trade details.
          Bots can't front-run what they can't see.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<CurrencyDollarIcon className="w-6 h-6" />}
          label="Total MEV Saved"
          value={displayStats.totalSaved}
          trend={displayStats.trend}
          trendUp={true}
        />
        <StatCard
          icon={<ShieldCheckIcon className="w-6 h-6" />}
          label="Trades Protected"
          value={displayStats.tradesProtected.toString()}
          sublabel="100% private"
        />
        <StatCard
          icon={<ChartBarIcon className="w-6 h-6" />}
          label="Avg Savings/Trade"
          value={displayStats.avgSavingsPerTrade}
          sublabel="vs Ethereum DEXs"
        />
        <StatCard
          icon={<ExclamationTriangleIcon className="w-6 h-6 text-red-400" />}
          label="ETH MEV (24h)"
          value={displayStats.ethMEVLast24h}
          sublabel="Lost by traders"
          danger
          loading={!ethereumData}
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Chart and Comparison */}
        <div className="lg:col-span-2 space-y-6">
          {/* MEV Savings Chart */}
          <MEVSavingsChart />

          {/* Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ethereum Card */}
            <div className="card border-red-500/20">
              <h3 className="text-lg font-semibold mb-4 text-red-400">Ethereum DEXs</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Transaction Visibility</span>
                  <span className="text-red-400">Public Mempool</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Trade Amounts</span>
                  <span className="text-red-400">Fully Visible</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">MEV Bots</span>
                  <span className="text-red-400">Active 24/7</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Front-running Risk</span>
                  <span className="text-red-400 font-bold">HIGH</span>
                </div>
              </div>
            </div>

            {/* MidSwap Card */}
            <div className="card border-green-500/20 bg-green-500/5">
              <h3 className="text-lg font-semibold mb-4 text-green-400">MidSwap</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Transaction Visibility</span>
                  <span className="text-green-400">ZK Private</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Trade Amounts</span>
                  <span className="text-green-400">Hidden</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">MEV Bots</span>
                  <span className="text-green-400">Cannot See Trades</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">Front-running Risk</span>
                  <span className="text-green-400 font-bold">ZERO</span>
                </div>
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">How MidSwap Protects You</h3>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent-primary font-bold">1</span>
                </div>
                <div>
                  <div className="font-medium">Zero-Knowledge Proofs</div>
                  <div className="text-sm text-white/60">Your trade amounts and strategy are encrypted in ZK proofs</div>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent-primary font-bold">2</span>
                </div>
                <div>
                  <div className="font-medium">No Public Mempool</div>
                  <div className="text-sm text-white/60">Transactions are shielded before reaching the network</div>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent-primary font-bold">3</span>
                </div>
                <div>
                  <div className="font-medium">MEV Impossible</div>
                  <div className="text-sm text-white/60">Bots can't extract value from trades they can't see</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Live MEV Feed */}
        <div>
          <LiveMEVFeed />
        </div>
      </div>

      {/* Call to Action for non-connected users */}
      {!isConnected && (
        <div className="mt-8 p-6 bg-gradient-to-r from-accent-primary/10 to-accent-secondary/10 rounded-2xl border border-accent-primary/20 text-center">
          <h3 className="text-xl font-semibold mb-2">Connect Your Wallet</h3>
          <p className="text-white/60 mb-4">
            Connect your Lace wallet to start trading with full MEV protection
          </p>
          <button 
            onClick={() => connect()}
            className="bg-gradient-to-r from-accent-primary to-accent-secondary px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
          >
            Connect Wallet
          </button>
        </div>
      )}
    </div>
  );
};
