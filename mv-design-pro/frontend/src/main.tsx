import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { queryClient } from './query-client';
import { ErrorBoundary } from './ui/shared/ErrorBoundary';
import { AppRoot } from './ui2/AppRoot';

// E1.7c: nowa powłoka (AppRoot) jest jedynym wejściem aplikacji —
// stara rama (App/AppShellV12/CanonicalLayout) została skasowana.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary sectionLabel="Aplikacja MV-DESIGN-PRO">
      <QueryClientProvider client={queryClient}>
        <AppRoot />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
