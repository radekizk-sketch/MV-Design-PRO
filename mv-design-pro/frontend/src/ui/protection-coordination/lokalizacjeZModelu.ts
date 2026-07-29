/**
 * Lokalizacje urządzeń zabezpieczeniowych — WYŁĄCZNIE elementy realnego modelu.
 *
 * NAPRAWA FABRYKACJI (V12K-262). Ekran koordynacji nadawał nowemu urządzeniu
 * lokalizację `bus_${liczba urządzeń + 1}`, a klon dostawał `${lokalizacja}_copy`.
 * Oba identyfikatory były WYMYŚLONE przez warstwę prezentacji i miały dwa skutki,
 * oba obserwowalne na realnym projekcie:
 *
 *  1. Prądy koordynacji dopasowują się po `element_id` wiersza biegu, a ten jest
 *     równy `ref_id` elementu ENM (`canonical_analysis._build_snapshot_graph_element_context`).
 *     Wymyślone `bus_1` nie pasuje do niczego, więc ekran ZAWSZE raportował brak
 *     prądów — funkcja wyglądała na żywą, a nie mogła policzyć nic.
 *  2. Gdyby projekt miał szynę o `ref_id` „bus_1", urządzenie po cichu związałoby
 *     się z elementem, którego projektant nie wskazał, a marginesy selektywności
 *     policzyłyby się dla NIE TEJ lokalizacji. Liczba wiarygodna i fałszywa.
 *
 * Dodatkowo klon PRZEPISYWAŁ prądy elementu źródłowego na `${ref}_copy` — czyli
 * fabrykował prąd zwarciowy dla elementu, który nie istnieje. To ten sam defekt,
 * który F-K4 usunął z `handleAddDevice` (losowanie prądów), tylko innym wejściem.
 *
 * Ten moduł jest czysty (bez Reacta) i nie liczy fizyki: rzutuje migawkę ENM na
 * listę wyboru. Identyfikatorem jest `ref_id` — DOKŁADNIE ta przestrzeń nazw,
 * po której dopasowują się wiersze wyników. Zmiana tego pola na `id` zerwałaby
 * wiązanie i przywróciła stan „brak prądów mimo policzonego biegu".
 */

import type { EnergyNetworkModel } from '../../types/enm';

/** Rodzaj elementu — decyduje, którą daną prądową może dostarczyć bieg. */
export type RodzajLokalizacji = 'szyna' | 'galaz' | 'transformator';

export interface LokalizacjaModelu {
  /** `ref_id` elementu ENM — przestrzeń nazw wierszy wyników. */
  readonly refId: string;
  readonly nazwa: string;
  readonly rodzaj: RodzajLokalizacji;
}

const ETYKIETY_RODZAJU: Record<RodzajLokalizacji, string> = {
  szyna: 'szyna',
  galaz: 'gałąź',
  transformator: 'transformator',
};

/** Etykieta pozycji listy wyboru: nazwa elementu + rodzaj + identyfikator modelu. */
export function etykietaLokalizacji(lokalizacja: LokalizacjaModelu): string {
  return `${lokalizacja.nazwa} (${ETYKIETY_RODZAJU[lokalizacja.rodzaj]}) · ${lokalizacja.refId}`;
}

function dodaj(
  cel: LokalizacjaModelu[],
  widziane: Set<string>,
  elementy: readonly { ref_id?: string; name?: string }[] | undefined,
  rodzaj: RodzajLokalizacji,
): void {
  for (const element of elementy ?? []) {
    const refId = element?.ref_id;
    // Element bez `ref_id` nie ma jak zostać dopasowany do wiersza wyniku —
    // pokazanie go na liście obiecywałoby wiązanie, którego nie da się wykonać.
    if (typeof refId !== 'string' || refId.length === 0) continue;
    if (widziane.has(refId)) continue;
    widziane.add(refId);
    cel.push({ refId, nazwa: element.name ?? refId, rodzaj });
  }
}

/**
 * Lokalizacje, w których wolno umieścić urządzenie zabezpieczeniowe.
 *
 * Szyny, gałęzie i transformatory — bo dla tych trzech kolekcji bieg kanoniczny
 * wystawia wiersz wyniku z `element_id = ref_id`. Kolejność jest deterministyczna
 * (rodzaj, potem `ref_id`), żeby lista wyboru nie zmieniała się między renderami.
 */
export function lokalizacjeKoordynacji(
  model: EnergyNetworkModel | null,
): readonly LokalizacjaModelu[] {
  if (model === null) return [];
  const wynik: LokalizacjaModelu[] = [];
  const widziane = new Set<string>();
  dodaj(wynik, widziane, model.buses, 'szyna');
  dodaj(wynik, widziane, model.branches, 'galaz');
  dodaj(wynik, widziane, model.transformers, 'transformator');
  const kolejnosc: Record<RodzajLokalizacji, number> = { szyna: 0, galaz: 1, transformator: 2 };
  return [...wynik].sort(
    (a, b) => kolejnosc[a.rodzaj] - kolejnosc[b.rodzaj] || a.refId.localeCompare(b.refId),
  );
}
