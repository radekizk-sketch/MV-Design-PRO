/**
 * Klient zdrowia backendu (karta E1.4, decyzja §2.5): minimalny odczyt /api/health
 * zasilający pasek stanu powłoki. Odpytywanie tylko przy widocznym oknie.
 */
import { useCallback, useEffect, useState } from 'react';

import type { BackendStatus } from './shellStatus';

export const HEALTH_URL = '/api/health';
export const HEALTH_INTERVAL_MS = 30_000;

export function useBackendHealth(intervalMs: number = HEALTH_INTERVAL_MS): {
  status: BackendStatus;
  reconnect: () => void;
} {
  const [status, setStatus] = useState<BackendStatus>('connecting');

  const check = useCallback(() => {
    fetch(HEALTH_URL)
      .then((odpowiedz) => setStatus(odpowiedz.ok ? 'connected' : 'error'))
      .catch(() => setStatus('error'));
  }, []);

  useEffect(() => {
    check();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [check, intervalMs]);

  return { status, reconnect: check };
}
