import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import './index.css';
import App from './App';
import LanguageProvider from '@/i18n/LanguageProvider';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { Toaster } from '@/components/ui/Toast';
import { queryClient } from '@/lib/queryClient';
import { initMonitoring } from '@/lib/monitoring';

// Q02: error tracking first, so errors during the first render are reported too.
initMonitoring();
// S08 (D15): the service worker of the production build (none in the dev server or tests).
if (import.meta.env.PROD) void import('@/offline/pwa').then((pwa) => pwa.registerApp());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sets the Radix direction and <html lang dir>; the language switch remounts the tree. */}
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Toaster />
      </QueryClientProvider>
    </LanguageProvider>
  </StrictMode>,
);
