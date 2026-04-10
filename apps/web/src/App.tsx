import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from '@/components/common/Layout';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { SwapPage } from '@/pages/SwapPage';
import { PoolsPage } from '@/pages/PoolsPage';
import { MEVDashboardPage } from '@/pages/MEVDashboardPage';
import { useWalletStore } from '@/store/walletStore';

function App() {
  const initSDK = useWalletStore((state) => state.initSDK);

  // Initialize SDK on mount — errors are caught inside initSDK
  useEffect(() => {
    try {
      initSDK();
    } catch (err) {
      console.error('[App] initSDK threw synchronously:', err);
    }

    // Debug: log what Midnight wallet providers are available after a short delay
    // so that the extension has time to inject itself.
    const timer = setTimeout(() => {
      const midnight = (window as any).midnight;
      if (midnight) {
        console.info('[MidSwap] window.midnight keys found:', Object.keys(midnight));
        for (const [key, provider] of Object.entries(midnight)) {
          const p = provider as any;
          console.info(`  [${key}] name="${p?.name}" rdns="${p?.rdns}" apiVersion="${p?.apiVersion}"`);
        }
      } else {
        console.warn('[MidSwap] window.midnight is not defined. Lace extension may not be installed or not injected yet.');
      }

      const directGlobals = ['lace', 'midnightLace', 'laceMidnight'] as const;
      for (const key of directGlobals) {
        const provider = (window as any)[key];
        if (provider) {
          console.info(`[MidSwap] window.${key} found:`, {
            name: provider?.name,
            rdns: provider?.rdns,
            apiVersion: provider?.apiVersion,
          });
        }
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [initSDK]);

  return (
    <Layout>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<SwapPage />} />
          <Route path="/swap" element={<SwapPage />} />
          <Route path="/pools" element={<PoolsPage />} />
          <Route path="/mev" element={<MEVDashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </Layout>
  );
}

export default App;
