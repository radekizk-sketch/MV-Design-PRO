import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { queryClient } from './query-client';
import { ErrorBoundary } from './ui/shared/ErrorBoundary';
import { AppRoot } from './ui2/AppRoot';
import { wybierzWejscie } from './ui2/entry';

// E1.7b: szew parytetowy — wybór wejścia (domyślnie STARA powłoka; nowa przez
// `?powloka=nowa` albo localStorage). Znika w E1.7c wraz z kasacją starej ramy.
const Wejscie = wybierzWejscie() === 'nowe' ? AppRoot : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary sectionLabel="Aplikacja MV-DESIGN-PRO">
      <QueryClientProvider client={queryClient}>
        <Wejscie />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
