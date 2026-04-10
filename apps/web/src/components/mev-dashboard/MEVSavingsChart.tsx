import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useMEVStore } from '@/store/mevStore';

interface ChartDataPoint {
  date: string;
  saved: number;
  trades: number;
}

interface MEVSavingsChartProps {
  // Optional override data for demo purposes
  demoData?: ChartDataPoint[];
}

export const MEVSavingsChart: React.FC<MEVSavingsChartProps> = ({ demoData }) => {
  const { tradeHistory, userStats } = useMEVStore();

  // Process real trade history into chart data
  const chartData = useMemo(() => {
    // If demo data is provided, use it
    if (demoData) return demoData;

    // If no trades, show empty state or demo data
    if (tradeHistory.length === 0) {
      return [];
    }

    // Group trades by day
    const tradesByDay = new Map<string, { saved: number; trades: number }>();
    
    tradeHistory.forEach(trade => {
      const date = new Date(trade.timestamp);
      const dayKey = date.toLocaleDateString('en-US', { weekday: 'short' });
      
      const existing = tradesByDay.get(dayKey) || { saved: 0, trades: 0 };
      const mevSaved = Number(trade.mevSaved) / 1e6; // Convert from output-token units (mUSDC = 6 decimals) to dollar-like value
      
      tradesByDay.set(dayKey, {
        saved: existing.saved + mevSaved,
        trades: existing.trades + 1
      });
    });

    // Convert to array and sort by day
    const dayOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result: ChartDataPoint[] = [];
    
    dayOrder.forEach(day => {
      const data = tradesByDay.get(day);
      if (data) {
        result.push({
          date: day,
          saved: Math.round(data.saved * 100) / 100, // Round to 2 decimals
          trades: data.trades
        });
      }
    });

    return result;
  }, [tradeHistory, demoData]);

  // Calculate summary stats from real data
  const summaryStats = useMemo(() => {
    if (userStats) {
      return {
        totalSaved: `$${(Number(userStats.totalSaved) / 1e6).toFixed(2)}`,
        tradesProtected: userStats.tradesProtected,
        avgPerTrade: userStats.tradesProtected > 0 
          ? `$${(Number(userStats.avgSavingsPerTrade) / 1e6).toFixed(2)}`
          : '$0.00'
      };
    }

    // Calculate from trade history if userStats not available
    if (tradeHistory.length === 0) {
      return {
        totalSaved: '$0.00',
        tradesProtected: 0,
        avgPerTrade: '$0.00'
      };
    }

    const totalSaved = tradeHistory.reduce((sum, t) => sum + Number(t.mevSaved), 0) / 1e6;
    const avgPerTrade = totalSaved / tradeHistory.length;

    return {
      totalSaved: `$${totalSaved.toFixed(2)}`,
      tradesProtected: tradeHistory.length,
      avgPerTrade: `$${avgPerTrade.toFixed(2)}`
    };
  }, [userStats, tradeHistory]);

  // Show empty state if no data
  const hasData = chartData.length > 0;

  return (
    <div className="bg-surface rounded-2xl p-6 border border-white/5">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">MEV Savings Over Time</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span className="text-white/60">$ Saved</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-accent-primary" />
            <span className="text-white/60">Trades</span>
          </div>
        </div>
      </div>
      
      <div className="h-[300px]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="savedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="tradesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2C2F36" />
              <XAxis 
                dataKey="date" 
                stroke="#6B7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="#6B7280"
                fontSize={12}
                tickFormatter={(value) => `$${value}`}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#212429',
                  border: '1px solid #2C2F36',
                  borderRadius: '12px',
                  padding: '12px'
                }}
                labelStyle={{ color: '#fff', marginBottom: '8px' }}
                formatter={(value: number, name: string) => [
                  name === 'saved' ? `$${value.toFixed(2)}` : value,
                  name === 'saved' ? 'MEV Saved' : 'Trades'
                ]}
              />
              <Area
                type="monotone"
                dataKey="saved"
                stroke="#22c55e"
                fill="url(#savedGradient)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="trades"
                stroke="#8B5CF6"
                fill="url(#tradesGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-white/40">
            <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-center">
              No trades yet.<br />
              <span className="text-sm">Make your first swap to see MEV savings!</span>
            </p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/5">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">{summaryStats.totalSaved}</div>
          <div className="text-xs text-white/40">Total Saved This Week</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{summaryStats.tradesProtected}</div>
          <div className="text-xs text-white/40">Trades Protected</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-400">{summaryStats.avgPerTrade}</div>
          <div className="text-xs text-white/40">Avg Per Trade</div>
        </div>
      </div>

      {/* Info Banner */}
      {!hasData && (
        <div className="mt-4 p-3 bg-accent-primary/10 rounded-xl border border-accent-primary/20">
          <div className="text-sm text-accent-primary">
            Start trading to track your MEV savings. Every swap on MidSwap protects you from MEV extraction!
          </div>
        </div>
      )}
    </div>
  );
};
