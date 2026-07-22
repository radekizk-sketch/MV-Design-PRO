/*
 * Rejestr przekroczeń „Co wymaga uwagi" (karta A1 / V12K-098, FLOW etap E6).
 *
 * BÓL PERSONY (audyt AUDYT_FLOW_INZYNIER_PROJEKTANT_2026-07 §2 A1): przekroczenia
 * są rozproszone po zakładkach (rozpływ osobno, jakość osobno…). Inżynier analiz
 * nie widzi WSZYSTKICH problemów sieci w jednym miejscu z akcją naprawczą.
 *
 * Ten model KONSOLIDUJE werdykty przekroczeń w jedną, znormalizowaną listę
 * (`Przekroczenie`). ZERO fizyki — czyta gotowe werdykty adapterów (`ostrzezenie`),
 * nie liczy progów. ZERO fabrykacji (dyrektywa #3): źródłem jest realny wynik
 * ze store'u analizy.
 *
 * ŹRÓDŁA (stan bieżący — tylko analizy trzymające wynik w synchronicznym store):
 * - Rozpływ mocy: `usePowerFlowResultsStore.results` → szyny z napięciem poza
 *   normatywnym przedziałem (`napiecePozaZakresem`, ten sam werdykt co adapter
 *   `rozplyw/adapters/rozplywAdapter.ts:94`). Element = Bus.
 *
 * ROZSZERZALNOŚĆ (kolejka audytu §5, A2): kolejne analizy, gdy ich wynik trafi do
 * synchronicznego store'u, dokłada się jako kolejny kolektor `przekroczenia*` i
 * konkatenuje w `useRejestrPrzekroczen`. Analizy pobierane asynchronicznie per ekran
 * (jakość/zwarcia — `fetch...` on-demand) NIE są tu zgadywane (brak źródła w store).
 */

import { useMemo } from 'react';

import type { PowerFlowResultV1 } from '../../../ui/power-flow-results/types';
import { usePowerFlowResultsStore } from '../../../ui/power-flow-results/store';
import type { ElementType } from '../../../ui/types';
import type { RodzajPrzekroczenia } from '../wzorzec';
import { fmtPU, napiecePozaZakresem, NAPIECIE_MAX_PU } from '../rozplyw/strings';
import { CO_WYMAGA_UWAGI_STRINGS as T } from './strings';

/** Znormalizowana pozycja przekroczenia (jedna linia rejestru). */
export interface Przekroczenie {
  /** Deterministyczny, unikatowy klucz (React key + wybór) — `analiza::rodzaj::element`. */
  klucz: string;
  /** Etykieta analizy źródłowej (PL). */
  analizaPL: string;
  /** Identyfikator elementu sieci (do „Popraw w modelu"). */
  elementRef: string;
  /** Typ elementu (dla selekcji/property-grid). */
  elementTyp: ElementType;
  /** Nazwa elementu do prezentacji (fallback = ref). */
  elementNazwa: string;
  /** Co zostało przekroczone (PL, z werdyktu adaptera — nie liczone tutaj). */
  opis: string;
  /** Sformatowana wartość z jednostką. */
  wartosc: string;
  /** Rodzaj przekroczenia (K1 / F-E6.3) — akcja kontekstowa `usePoprawWModelu`. */
  rodzaj: RodzajPrzekroczenia;
}

/**
 * Kolektor przekroczeń rozpływu: szyny z napięciem poza przedziałem. Czysty
 * (bez React) — ten sam werdykt `napiecePozaZakresem`, którego używa adapter
 * tabeli szyn (spójność werdyktu ekran↔rejestr).
 */
export function przekroczeniaRozplywu(wynik: PowerFlowResultV1 | null): Przekroczenie[] {
  if (!wynik) return [];
  return wynik.bus_results
    .filter((r) => napiecePozaZakresem(r.v_pu))
    .map((r) => ({
      klucz: `rozplyw::napiecie::${r.bus_id}`,
      analizaPL: T.analizaRozplyw,
      elementRef: r.bus_id,
      elementTyp: 'Bus' as ElementType,
      elementNazwa: r.bus_id,
      opis: r.v_pu > NAPIECIE_MAX_PU ? T.opisNapiecieWysokie : T.opisNapiecieNiskie,
      wartosc: `${fmtPU(r.v_pu)} ${T.jednPU}`,
      rodzaj: 'napiecie' as RodzajPrzekroczenia,
    }));
}

/** Projekcja read-only rejestru: lista przekroczeń + czy jest jakikolwiek przebieg. */
export interface RejestrPrzekroczen {
  przekroczenia: Przekroczenie[];
  /** Czy istnieje jakikolwiek zakończony przebieg (rozróżnia „brak przebiegu"
   * od „sieć w normie" — uczciwe stany zerowe, FLOW §0). */
  maPrzebieg: boolean;
}

/** Czyta i konsoliduje przekroczenia ze store'ów analiz (read-only, zero fizyki). */
export function useRejestrPrzekroczen(): RejestrPrzekroczen {
  const wynikRozplywu = usePowerFlowResultsStore((s) => s.results);
  const przekroczenia = useMemo(() => [...przekroczeniaRozplywu(wynikRozplywu)], [wynikRozplywu]);
  return { przekroczenia, maPrzebieg: wynikRozplywu !== null };
}
