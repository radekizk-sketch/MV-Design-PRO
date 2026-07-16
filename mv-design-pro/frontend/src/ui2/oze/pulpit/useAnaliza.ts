/*
 * Wspólny hook pobierania danych analizy dla sekcji pulpitu OZE (P47a).
 * Zwraca jawny stan: brak przebiegu / ładowanie / błąd / gotowe. Zero fizyki —
 * dane pochodzą wyłącznie z backendu przez przekazany `fetcher`.
 */

import { useEffect, useState } from 'react';

/** Stan pobierania danych analizy powiązanej z przebiegiem. */
export type StanAnalizy<T> =
  | { readonly rodzaj: 'brak_przebiegu' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'blad'; readonly komunikat: string }
  | { readonly rodzaj: 'gotowe'; readonly dane: T };

/**
 * Pobiera dane analizy dla wskazanego przebiegu. `runId === null` daje stan
 * „brak przebiegu" (bez wywołania sieci). Zmiana `runId` uruchamia nowe
 * pobranie; wynik nieaktualnego przebiegu jest ignorowany (guard `aktywne`).
 */
export function useAnaliza<T>(
  runId: string | null,
  fetcher: (runId: string) => Promise<T>,
): StanAnalizy<T> {
  const [stan, setStan] = useState<StanAnalizy<T>>(
    runId === null ? { rodzaj: 'brak_przebiegu' } : { rodzaj: 'ladowanie' },
  );

  useEffect(() => {
    if (runId === null) {
      setStan({ rodzaj: 'brak_przebiegu' });
      return;
    }
    let aktywne = true;
    setStan({ rodzaj: 'ladowanie' });
    fetcher(runId)
      .then((dane) => {
        if (aktywne) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((err: unknown) => {
        if (!aktywne) return;
        const komunikat = err instanceof Error ? err.message : 'Nieznany błąd pobierania';
        setStan({ rodzaj: 'blad', komunikat });
      });
    return () => {
      aktywne = false;
    };
  }, [runId, fetcher]);

  return stan;
}
