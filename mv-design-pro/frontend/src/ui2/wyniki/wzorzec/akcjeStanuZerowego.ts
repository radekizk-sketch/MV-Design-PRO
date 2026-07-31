/*
 * Akcje stanów zerowych (karta K6 / H-5) — JEDEN rejestr „następnego kroku"
 * dla wszystkich uczciwych stanów zerowych ekranów wyników i strumienia OZE.
 *
 * BÓL (audyt K6): stany zerowe mówiły, CZEGO brakuje („Brak przebiegu…"), ale
 * nie dawały akcji — inżynier lądował w ślepym zaułku albo dostawał wskazówkę
 * „Przejdź do obliczeń", gdzie i tak nie było czym uruchomić biegu.
 *
 * ZASADA (karta §0.1): każda akcja woła ISTNIEJĄCY, realny cel —
 *   - bieg obliczeń: `uruchomObliczenie` (ten sam tor co przycisk „Oblicz"),
 *   - nawigacja: `przejdzDoPrzestrzeni` / `setWynikiTab` (most tras powłoki),
 *   - formularz źródła OZE: `openOperationForm('add_converter_source')` —
 *     ta sama operacja domenowa co `PrzylaczZrodloPrzycisk`.
 * Żadnych nowych endpointów, żadnej fizyki, żadnych kontrolek bez pokrycia.
 */

import { useCallback } from 'react';

import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import type { ExecutionAnalysisType } from '../../../ui/study-cases/types';
import { przejdzDoPrzestrzeni } from '../../shell/przejsciaPrzestrzeni';
import { useShellStore } from '../../shell/useShellStore';
import { useUruchomObliczenie } from '../../spaces/obliczenia/uruchomObliczenie';

/** Akcja stanu zerowego — konwencja `AkcjaPusty` drzewa kontekstowego. */
export interface AkcjaStanuZerowego {
  readonly etykieta: string;
  readonly onKlik: () => void;
  /** Podpowiedź (title) — po co ta akcja i co da. */
  readonly opis?: string;
  /** Akcja w toku (blokuje ponowne kliknięcie). */
  readonly wToku?: boolean;
}

export const AKCJE_STANU_ZEROWEGO_STRINGS = {
  uruchomZwarcie: 'Uruchom obliczenie zwarciowe',
  uruchomZwarcieOpis:
    'Uruchamia przebieg zwarciowy IEC 60909 dla aktywnego zakresu obliczeń i otwiera wyniki.',
  uruchomRozplyw: 'Uruchom obliczenie rozpływu',
  uruchomRozplywOpis:
    'Uruchamia przebieg rozpływu mocy dla aktywnego zakresu obliczeń i otwiera wyniki.',
  wToku: 'Obliczenie w toku…',
  przejdzDoPrzypadkow: 'Przejdź do przypadków',
  przejdzDoPrzypadkowOpis:
    'Otwiera przestrzeń „Obliczenia": wybór aktywnego zakresu i uruchomienie przebiegu.',
  dodajZrodloOze: 'Dodaj źródło OZE',
  dodajZrodloOzeOpis: 'Otwiera formularz źródła PV/BESS/FW z katalogu na kanwie schematu.',
  otworzDokumentacje: 'Domknij dokumentację',
  otworzDokumentacjeOpis: 'Otwiera przestrzeń „Dokumentacja" — raport i dowód obliczeń.',
  porownajWarianty: 'Porównaj warianty',
  porownajWariantyOpis: 'Otwiera okno porównania A/B przebiegów tego projektu.',
} as const;

/** Etykieta/opis biegu wg rodzaju analizy (jedno miejsce, zero literałów w JSX). */
function opisBiegu(rodzaj: ExecutionAnalysisType): { etykieta: string; opis: string } {
  if (rodzaj === 'LOAD_FLOW') {
    return {
      etykieta: AKCJE_STANU_ZEROWEGO_STRINGS.uruchomRozplyw,
      opis: AKCJE_STANU_ZEROWEGO_STRINGS.uruchomRozplywOpis,
    };
  }
  return {
    etykieta: AKCJE_STANU_ZEROWEGO_STRINGS.uruchomZwarcie,
    opis: AKCJE_STANU_ZEROWEGO_STRINGS.uruchomZwarcieOpis,
  };
}

/**
 * Akcja „Uruchom obliczenie [zwarciowe|rozpływu]" — ten sam tor co przycisk
 * „Oblicz" powłoki (`uruchomObliczenie`), z rodzajem analizy WPROST.
 */
export function useAkcjaUruchomObliczenie(rodzaj: ExecutionAnalysisType): AkcjaStanuZerowego {
  const { uruchom, wToku } = useUruchomObliczenie();
  const { etykieta, opis } = opisBiegu(rodzaj);
  const onKlik = useCallback(() => uruchom(rodzaj), [uruchom, rodzaj]);
  return {
    etykieta: wToku ? AKCJE_STANU_ZEROWEGO_STRINGS.wToku : etykieta,
    opis,
    onKlik,
    wToku,
  };
}

/** Akcja „Przejdź do przypadków" — przestrzeń „Obliczenia" (wybór zakresu). */
export function useAkcjaPrzejdzDoPrzypadkow(): AkcjaStanuZerowego {
  const onKlik = useCallback(() => przejdzDoPrzestrzeni('obliczenia'), []);
  return {
    etykieta: AKCJE_STANU_ZEROWEGO_STRINGS.przejdzDoPrzypadkow,
    opis: AKCJE_STANU_ZEROWEGO_STRINGS.przejdzDoPrzypadkowOpis,
    onKlik,
  };
}

/** Akcja „Dodaj źródło OZE" — formularz operacji `add_converter_source` na kanwie. */
export function useAkcjaDodajZrodloOze(): AkcjaStanuZerowego {
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);
  const onKlik = useCallback(() => {
    openOperationForm('add_converter_source', { source: 'stan_zerowy_oze' });
    przejdzDoPrzestrzeni('schemat');
  }, [openOperationForm]);
  return {
    etykieta: AKCJE_STANU_ZEROWEGO_STRINGS.dodajZrodloOze,
    opis: AKCJE_STANU_ZEROWEGO_STRINGS.dodajZrodloOzeOpis,
    onKlik,
  };
}

/** Akcja „Domknij dokumentację" — przestrzeń „Dokumentacja". */
export function useAkcjaOtworzDokumentacje(): AkcjaStanuZerowego {
  const onKlik = useCallback(() => przejdzDoPrzestrzeni('dokumentacja'), []);
  return {
    etykieta: AKCJE_STANU_ZEROWEGO_STRINGS.otworzDokumentacje,
    opis: AKCJE_STANU_ZEROWEGO_STRINGS.otworzDokumentacjeOpis,
    onKlik,
  };
}

/** Akcja „Porównaj warianty" — zakładka porównania A/B w przestrzeni „Wyniki". */
export function useAkcjaPorownajWarianty(): AkcjaStanuZerowego {
  const setWynikiTab = useShellStore((s) => s.setWynikiTab);
  const onKlik = useCallback(() => {
    setWynikiTab('porownanie');
    przejdzDoPrzestrzeni('wyniki');
  }, [setWynikiTab]);
  return {
    etykieta: AKCJE_STANU_ZEROWEGO_STRINGS.porownajWarianty,
    opis: AKCJE_STANU_ZEROWEGO_STRINGS.porownajWariantyOpis,
    onKlik,
  };
}
