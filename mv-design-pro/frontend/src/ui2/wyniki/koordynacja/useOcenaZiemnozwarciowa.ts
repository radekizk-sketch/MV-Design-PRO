/**
 * Ocena ziemnozwarciowa AKTYWNEGO biegu rodziny „Zabezpieczenia" (magazyn kontekstu wyniku —
 * ten sam bieg co sekcja oceny E-28, pasek stanu i panel dolny) dla karty nastaw E-27.
 *
 * Odczyt `GET /api/protection-runs/{id}/results` (pole `ziemnozwarciowe`); świeżość z jednego
 * predykatu (`useSwiezoscBiegu`) — zmiana nastaw w modelu czyni wynik nieaktualnym i karta to
 * mówi. Brak biegu = `null` (karta nie pokazuje oceny, której nie ma). ZERO liczenia.
 */

import { useEffect, useState } from 'react';

import { useAktywnyBieg, useSwiezoscBiegu, type SwiezoscBiegu } from '../kontekst/kontekstWyniku';
import { pobierzWynikOcenyZabezpieczen } from './ocenaZabezpieczenApi';
import type { WynikOcenyZiemnozwarciowej } from './ocenaZiemnozwarciowa';

export interface OcenaZiemnozwarciowaBiegu {
  runId: string;
  wynik: WynikOcenyZiemnozwarciowej | null;
  swiezosc: SwiezoscBiegu | null;
  /** Powód nieaktualności podany przez serwer (`result_status = OUTDATED`). */
  nieaktualnyPowodPl: string | null;
}

export function useOcenaZiemnozwarciowaAktywnegoBiegu(): OcenaZiemnozwarciowaBiegu | null {
  const aktywny = useAktywnyBieg('zabezpieczenia');
  const runId = aktywny?.id ?? null;
  const swiezosc = useSwiezoscBiegu(aktywny);
  const [odczyt, setOdczyt] = useState<{
    runId: string;
    wynik: WynikOcenyZiemnozwarciowej | null;
    nieaktualnyPowodPl: string | null;
  } | null>(null);

  useEffect(() => {
    let anulowano = false;
    if (!runId) {
      setOdczyt(null);
      return undefined;
    }
    pobierzWynikOcenyZabezpieczen(runId)
      .then((w) => {
        if (anulowano) return;
        setOdczyt({
          runId,
          wynik: w.ziemnozwarciowe ?? null,
          nieaktualnyPowodPl: w.result_status === 'OUTDATED' ? w.result_status_reason_pl : null,
        });
      })
      // Odczyt nieudany — karta nastaw nie pokazuje oceny (sekcja E-28 nazywa błąd biegu).
      .catch(() => {
        if (!anulowano) setOdczyt(null);
      });
    return () => {
      anulowano = true;
    };
  }, [runId]);

  if (!odczyt || odczyt.runId !== runId) return null;
  return { ...odczyt, swiezosc };
}
