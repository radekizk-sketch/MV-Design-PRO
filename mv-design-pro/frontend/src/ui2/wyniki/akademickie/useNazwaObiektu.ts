/*
 * Most REFERENCJA → NAZWA obiektu na schemacie (V126-JEZYK).
 *
 * Ocena właściciela 0/10 z 2026-08-07 wskazała wprost pole widoczne dla
 * projektanta z treścią `gpz/860003b4514aa388b39561d5005ce584/section/001/bus_sn`.
 * Most istniał w warstwie prezentacji od dawna, ale wyłącznie prywatnie —
 * `resolveElementName` w `ui/topology/snapshotStore` obsługiwał tylko dziennik
 * operacji. Tutaj go REUŻYWAMY (dyrektywa: reużycie zamiast duplikacji),
 * zamiast budować drugie źródło nazw.
 *
 * Uczciwość: gdy migawki modelu nie ma albo obiekt nie występuje w niej pod tą
 * referencją, funkcja zwraca OSTATNI, ludzki segment referencji — nie zmyśla
 * nazwy i nie ukrywa obiektu. Referencje bez segmentu ludzkiego (sam odcisk)
 * zwracają skrócony identyfikator z jawnym wielokropkiem.
 */

import { useCallback } from 'react';

import { selectElementName, useSnapshotStore } from '../../../ui/topology/snapshotStore';

/** Segment wyglądający na identyfikator maszynowy (odcisk / UUID). */
const ODCISK = /^[0-9a-f]{8,}$/i;

/**
 * Słownik segmentów referencji modelu → polska nazwa rodzaju obiektu.
 *
 * To NIE jest zgadywanie nazwy własnej obiektu (tej okno nie fabrykuje), tylko
 * tłumaczenie ZAMKNIĘTEGO słownictwa referencji domeny — dzięki niemu wiersz
 * tabeli mówi „GPZ · sekcja 001 · szyna SN” zamiast pokazywać projektantowi
 * kod produkcyjny `gpz/8600…/section/001/bus_sn` (defekt oceniony na 0/10).
 * Segment nieznany zostaje bez zmian — lepiej pokazać go wprost niż zmyślić.
 */
const NAZWY_SEGMENTOW: Readonly<Record<string, string>> = {
  gpz: 'GPZ',
  station: 'stacja',
  substation: 'stacja',
  section: 'sekcja',
  segment: 'odcinek',
  corridor: 'ciąg liniowy',
  bay: 'pole',
  bus: 'szyna',
  bus_sn: 'szyna SN',
  bus_nn: 'szyna nN',
  transformer: 'transformator',
  motor: 'silnik',
  pv: 'instalacja PV',
  bess: 'magazyn energii',
  junction: 'złącze',
  branch_point: 'punkt odgałęźny',
  nop: 'punkt podziału',
};

/**
 * Zapasowa etykieta referencji, gdy migawka modelu nie zna obiektu: rodzaje
 * obiektów po polsku, odcisk pominięty. Czysta funkcja (bez zależności od
 * store'u), więc testowalna wprost.
 */
export function etykietaZapasowaRefu(ref: string): string {
  if (ref === '') return '—';
  const segmenty = ref.split('/').filter((segment) => segment !== '');
  const czlony: string[] = [];
  segmenty
    .filter((segment) => !ODCISK.test(segment))
    .forEach((segment) => {
      // Numer porządkowy należy do poprzedniego członu („sekcja 001”),
      // a nie stoi osobno — inaczej etykieta czyta się jak lista kluczy.
      if (/^\d+$/.test(segment) && czlony.length > 0) {
        czlony[czlony.length - 1] = `${czlony[czlony.length - 1]} ${segment}`;
        return;
      }
      czlony.push(NAZWY_SEGMENTOW[segment] ?? segment);
    });
  if (czlony.length === 0) return 'obiekt modelu bez nazwy';
  return czlony.join(' · ');
}

/**
 * Zwraca funkcję nazywającą obiekt modelu po referencji. Nazwa pochodzi
 * z migawki ENM (to samo źródło co schemat), więc ekran wyników mówi o tych
 * samych obiektach, o których mówi rysunek.
 */
export function useNazwaObiektu(): (ref: string) => string {
  const snapshot = useSnapshotStore((stan) => stan.snapshot);
  return useCallback(
    (ref: string) => selectElementName(snapshot, ref) ?? etykietaZapasowaRefu(ref),
    [snapshot],
  );
}
