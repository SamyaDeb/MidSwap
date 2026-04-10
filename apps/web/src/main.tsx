import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { logger, type LogLevel } from '@midswap/sdk';
import App from './App';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import './index.css';

const configuredLogLevel = (import.meta.env.VITE_MIDSWAP_LOG_LEVEL || import.meta.env.MIDSWAP_LOG_LEVEL) as LogLevel | undefined;
const validLogLevels: readonly LogLevel[] = ['debug', 'info', 'warn', 'error', 'silent'];

if (configuredLogLevel && validLogLevels.includes(configuredLogLevel)) {
  logger.setLevel(configuredLogLevel);
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-midnight flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <svg className="animate-spin h-10 w-10 text-accent-primary" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-white/60 text-sm">Loading MidSwap...</span>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <App />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#212429',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
              },
              success: {
                iconTheme: {
                  primary: '#22C55E',
                  secondary: '#fff',
                },
              },
              error: {
                iconTheme: {
                  primary: '#EF4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
