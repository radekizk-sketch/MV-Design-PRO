/**
 * JEDEN hook dostępności eksportu wywodu przebiegu (karta UI-02 PANEL-DOLNY) dla
 * wszystkich miejsc, które oferują eksport uzasadnienia: zakładka „Dowody" panelu
 * dolnego, generator dokumentacji i eksport w raporcie mostu. Odpowiedź serwera
 * (`GET …/export/proof/dostepnosc`) jest jedynym źródłem tego, czy polecenie jest
 * aktywne i dlaczego nie — ekrany nie liczą własnych predykatów.
 */
import { useEffect, useState } from 'react';

import {
  dostepnoscFormatu,
  pobierzDostepnoscEksportuWywodu,
  type DostepnoscEksportuWywodu,
  type DostepnoscFormatuWywodu,
  type ProofExportFormat,
} from './reportExportApi';

export type StanDostepnosciEksportuWywodu =
  | { readonly rodzaj: 'brak-biegu' }
  | { readonly rodzaj: 'ladowanie' }
  | { readonly rodzaj: 'gotowe'; readonly dane: DostepnoscEksportuWywodu }
  | { readonly rodzaj: 'blad'; readonly komunikat: string };

export const POWOD_SPRAWDZANIA_EKSPORTU = 'Sprawdzanie dostępności eksportu na serwerze…';
export const POWOD_BRAKU_BIEGU_EKSPORTU = 'Brak zakończonego przebiegu do eksportu.';

export function useDostepnoscEksportuWywodu(
  runId: string | null | undefined,
): StanDostepnosciEksportuWywodu {
  const [stan, setStan] = useState<StanDostepnosciEksportuWywodu>(
    runId ? { rodzaj: 'ladowanie' } : { rodzaj: 'brak-biegu' },
  );
  useEffect(() => {
    if (!runId) {
      setStan({ rodzaj: 'brak-biegu' });
      return;
    }
    const kontroler = new AbortController();
    setStan({ rodzaj: 'ladowanie' });
    pobierzDostepnoscEksportuWywodu(runId, kontroler.signal)
      .then((dane) => {
        if (!kontroler.signal.aborted) setStan({ rodzaj: 'gotowe', dane });
      })
      .catch((blad: unknown) => {
        if (kontroler.signal.aborted) return;
        setStan({
          rodzaj: 'blad',
          komunikat: blad instanceof Error ? blad.message : 'Nie udało się sprawdzić eksportu.',
        });
      });
    return () => kontroler.abort();
  }, [runId]);
  return stan;
}

/**
 * Dostępność formatu w danym stanie bramy — z przyczyną także wtedy, gdy odpowiedzi
 * jeszcze nie ma (sprawdzanie) albo zapytanie się nie powiodło (polecenie nieaktywne,
 * bo serwer niczego nie potwierdził).
 */
export function formatWStanie(
  stan: StanDostepnosciEksportuWywodu,
  format: ProofExportFormat,
): DostepnoscFormatuWywodu {
  switch (stan.rodzaj) {
    case 'gotowe':
      return dostepnoscFormatu(stan.dane, format);
    case 'ladowanie':
      return { format, dostepny: false, powod_pl: POWOD_SPRAWDZANIA_EKSPORTU };
    case 'brak-biegu':
      return { format, dostepny: false, powod_pl: POWOD_BRAKU_BIEGU_EKSPORTU };
    case 'blad':
      return {
        format,
        dostepny: false,
        powod_pl: `Nie udało się sprawdzić dostępności eksportu: ${stan.komunikat}`,
      };
    default:
      return stan satisfies never;
  }
}
