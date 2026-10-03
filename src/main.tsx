import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DirectionProvider } from '@radix-ui/react-direction';
import { QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import './index.css';
import App from './App';
import { queryClient } from '@/lib/queryClient';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Radix needs to know the page is RTL (menu placement, arrow keys). */}
    <DirectionProvider dir="rtl">
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </DirectionProvider>
  </StrictMode>,
);
