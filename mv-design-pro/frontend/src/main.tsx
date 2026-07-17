import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { queryClient } from './query-client';
import { App } from './App';
import { ErrorBoundary } from './ui/shared/ErrorBoundary';

// E1.7c: nowa powłoka (AppRoot) jest jedynym wejściem aplikacji; App to cienki
// korzeń motywu dark-SCADA (kanon V12.xx) opakowujący AppRoot.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary sectionLabel="Aplikacja MV-DESIGN-PRO">
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
