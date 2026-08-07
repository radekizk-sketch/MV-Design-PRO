/*
 * JEDNO źródło prawdy o PUSTOŚCI modelu (karta S9-11, znalezisko P-8 audytu
 * `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`).
 *
 * DEFEKT KLASY: werdykt „model pusty" liczyły niezależnie trzy miejsca, każde
 * inną regułą na innym zbiorze rodzin elementów:
 *  - kanwa v3 (`hasNetworkModel`) — kategorie ADAPTERA rysunku
 *    (gpzs/stations/cableRuns/ders), więc BRAK MIGAWKI (hydratacja w toku)
 *    wyglądał jak PUSTY MODEL i akcje stanu pustego (`sld-empty-state*`)
 *    siedziały w drzewie przy sieci 16 i 51 stacji (pomiar audytu),
 *  - pas „następny krok" — licznik kafla pulpitu (`mapujModel().elementow`),
 *  - orkiestrator legacy (`hasTopologicalContent`) — własna lista rodzin bez
 *    `measurements`/`protection_assignments`.
 *
 * KANON: pustość jest TRÓJSTANOWA. Brak migawki to NIE pusty model — to brak
 * wiedzy ('nieustalona'); stan pusty kanwy wolno montować WYŁĄCZNIE przy
 * werdykcie 'pusty' (migawka istnieje i nie ma w niej żadnego elementu).
 * Zbiór rodzin = suma wszystkich list dotychczasowych czytelników (zamknięta
 * lista poniżej — nowa rodzina elementów ENM wymaga dopisania TUTAJ, co
 * pilnuje test `__tests__/pustoscModelu.test.ts`).
 *
 * Warstwa: czysty odczyt migawki — zero fizyki, zero mutacji, zero store'ów.
 */

import type { EnergyNetworkModel } from '../../types/enm';

export type PustoscModelu = 'nieustalona' | 'pusty' | 'niepusty';

/**
 * Rodziny elementów rozstrzygające o pustości — suma list dotychczasowych
 * czytelników (`liczbaElementow` pulpitu ∪ `hasTopologicalContent`
 * orkiestratora ∪ kategorie adaptera rysunku) PLUS rodziny, które żaden z
 * nich nie widział, a REALNY kontrakt migawki ENM niesie (`shunt_capacitors`,
 * `connection_nodes` — pomiar na fixture z żywego biegu `s92Bieg.enm.json`).
 * Lista ZAMKNIĘTA względem kontraktu: test `__tests__/pustoscModelu.test.ts`
 * porównuje ją z tablicowymi polami migawki żywego backendu — nowa rodzina w
 * kontrakcie zapala test, dopóki nie zostanie dopisana tutaj.
 */
export const RODZINY_ELEMENTOW = [
  'sources',
  'buses',
  'branches',
  'transformers',
  'loads',
  'generators',
  'shunt_capacitors',
  'substations',
  'bays',
  'junctions',
  'branch_points',
  'corridors',
  'line_runs',
  'connection_nodes',
  'measurements',
  'protection_assignments',
] as const;

/** Trójstanowy werdykt pustości modelu. `null`/`undefined` migawki = 'nieustalona'. */
export function pustoscModelu(
  snapshot: EnergyNetworkModel | null | undefined,
): PustoscModelu {
  if (!snapshot) {
    return 'nieustalona';
  }
  const niepusty = RODZINY_ELEMENTOW.some((rodzina) => {
    const elementy = (snapshot as unknown as Record<string, unknown>)[rodzina];
    return Array.isArray(elementy) && elementy.length > 0;
  });
  return niepusty ? 'niepusty' : 'pusty';
}

/**
 * PREDYKATY PARAMI (reguła KLASA, NIE INSTANCJA §3): oba warunki pochodzą z
 * JEDNEGO werdyktu `pustoscModelu` — i celowo NIE są swoimi negacjami
 * (stan 'nieustalona' nie spełnia żadnego z nich).
 */
export function modelNiepusty(snapshot: EnergyNetworkModel | null | undefined): boolean {
  return pustoscModelu(snapshot) === 'niepusty';
}

export function modelPusty(snapshot: EnergyNetworkModel | null | undefined): boolean {
  return pustoscModelu(snapshot) === 'pusty';
}
