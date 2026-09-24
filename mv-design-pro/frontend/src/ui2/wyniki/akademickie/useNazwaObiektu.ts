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

import { FIELD_ROLE_LABEL_PL } from '../../../ui/sld/v2/station-rozdzielnia/contract';
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
 *
 * „Zamknięty” jest POMIAREM, nie deklaracją: strażnik
 * `__tests__/slownikSegmentow.test.ts` czyta wyrocznię
 * `harness-fixtures/generated/segmenty_referencji_modelu.json`, którą eksport
 * fikstur wylicza z KODU backendu budującego identyfikatory (każde wywołanie
 * `_make_id` i każdy f-string `"<prefiks>/{ziarno}/…"` w `backend/src`, ze
 * zbiorami wartości zmiennych czytanymi z map operacji). Nowy segment w
 * backendzie zapala czerwień tutaj, zanim trafi na ekran po angielsku.
 */
export const NAZWY_SEGMENTOW: Readonly<Record<string, string>> = {
  // Prefiksy rodzaju elementu (pierwszy człon identyfikatora).
  gpz: 'GPZ',
  stn: 'stacja',
  station: 'stacja',
  sub: 'stacja',
  substation: 'stacja',
  bp: 'punkt odgałęźny',
  corridor: 'ciąg liniowy',
  seg: 'odcinek',
  segment: 'odcinek',
  bus: 'szyna',
  sw: 'łącznik',
  switch: 'łącznik',
  switch_device: 'łącznik',
  tr: 'transformator',
  transformer: 'transformator',
  bay: 'pole',
  field: 'pole',
  ct: 'przekładnik prądowy',
  vt: 'przekładnik napięciowy',
  relay: 'zabezpieczenie',
  protection: 'zabezpieczenie',
  sn: 'SN',
  nn: 'nN',
  gen: 'generator',
  load: 'odbiór',
  shunt: 'kompensacja równoległa',
  cap: 'bateria kondensatorów',
  spd: 'ochrona przepięciowa',
  arrester: 'ogranicznik przepięć',
  ups: 'zasilacz UPS',
  genset: 'zespół prądotwórczy',
  pv: 'instalacja PV',
  bess: 'magazyn energii',
  fw: 'farma wiatrowa',
  motor: 'silnik',
  // Szyny i węzły.
  bus_sn: 'szyna SN',
  bus_nn: 'szyna nN',
  sn_bus: 'szyna SN',
  sn_bus_b: 'szyna SN sekcji B',
  nn_bus: 'szyna nN',
  bus_110: 'szyna 110 kV',
  hv_auto: 'szyna strony GN',
  lv_auto: 'szyna strony DN',
  board_bus: 'szyna rozdzielnicy',
  section_bus: 'szyna sekcji',
  split_bus: 'szyna podziału',
  cable_bus: 'szyna na końcu kabla',
  feeder_bus: 'szyna odpływu',
  branch_bus: 'szyna odgałęzienia',
  producer_nn_bus: 'szyna nN wytwórcy',
  block_hv_bus: 'szyna GN transformatora blokowego',
  downstream: 'węzeł za odcinkiem',
  switch_node: 'węzeł łącznika',
  junction: 'złącze',
  // Gałęzie, odcinki i ich części.
  branch: 'odgałęzienie',
  branch_segment: 'odcinek odgałęzienia',
  branch_end: 'koniec odgałęzienia',
  branch_connector: 'połączenie odgałęzienia',
  branch_point: 'punkt odgałęźny',
  branch_pole: 'słup odgałęźny',
  zksn: 'ZKSN',
  ring_closure: 'zamknięcie pierścienia',
  nop: 'punkt podziału',
  cable: 'kabel',
  mv_cable: 'kabel SN',
  split_left: 'część 1 po podziale',
  split_right: 'część 2 po podziale',
  merged: 'po scaleniu',
  // Pola, aparaty i zaciski.
  section: 'sekcja',
  coupler: 'sprzęgło',
  sn_coupler: 'sprzęgło SN',
  section_coupler: 'sprzęgło sekcyjne',
  sn_field: 'pole SN',
  source_field: 'pole źródłowe',
  sn_field_terminal: 'zacisk pola SN',
  sn_field_breaker: 'wyłącznik pola SN',
  sn_field_apparatus: 'aparat pola SN',
  field_terminal: 'zacisk pola',
  field_device: 'aparat pola',
  bay_terminal: 'zacisk pola',
  bay_device: 'aparat pola',
  terminal: 'zacisk',
  apparatus: 'aparat',
  breaker: 'wyłącznik',
  nn_main_breaker: 'wyłącznik główny nN',
  measurement: 'pomiar',
  assignment: 'przypisanie',
  board: 'rozdzielnica',
  // Odbiory, odpływy i źródła.
  aux_load: 'odbiór potrzeb własnych',
  outgoing: 'odpływ',
  nn_feeder: 'odpływ nN',
  feeder_device: 'aparat odpływu',
  source: 'źródło',
  nn_source: 'źródło nN',
  der: 'źródło rozproszone',
  converter: 'przekształtnik',
  pv_inverter: 'falownik PV',
  wind_inverter: 'falownik wiatrowy',
  block_transformer: 'transformator blokowy',
  // Kopie elementów rozdzielnicy nN (operacja kopiowania odpływu).
  copy_bus: 'kopia szyny',
  copy_branch: 'kopia gałęzi',
  copy_loads: 'kopia odbioru',
  copy_generators: 'kopia źródła wytwórczego',
  copy_sources: 'kopia źródła zasilania',
  copy_shunt_capacitors: 'kopia baterii kondensatorów',
  // Pozostałe człony GPZ.
  main: 'główne',
  wn_sn: 'WN/SN',
  // Role pól SN zapisane w identyfikatorze pola (rola małymi literami, opcjonalnie
  // z numerem kolejnym) — słowa z KANONU ról (`FIELD_ROLE_LABEL_PL`), bez drugiej
  // kopii etykiet.
  in: rolaBezSlowaPole('LINIA_IN'),
  ...Object.fromEntries(
    Object.keys(FIELD_ROLE_LABEL_PL).map((rola) => [
      rola.toLowerCase(),
      rolaBezSlowaPole(rola as keyof typeof FIELD_ROLE_LABEL_PL),
    ]),
  ),
};

/** Etykieta roli pola z kanonu bez słowa „Pole” (człon stoi po „pole · …”). */
function rolaBezSlowaPole(rola: keyof typeof FIELD_ROLE_LABEL_PL): string {
  return FIELD_ROLE_LABEL_PL[rola].replace(/^Pole /, '');
}

/**
 * Segment w postaci `<rodzaj>_<numer>` (`corridor_01`, `station_03`).
 *
 * Osobna REGUŁA zamiast kolejnych wpisów w słowniku, bo instancji jest tyle, ile
 * obiektów w sieci — dopisywanie `corridor_01`, `corridor_02`, … zamykałoby
 * INSTANCJE, a nie KLASĘ, i pierwszy nowy numer wróciłby na ekran po angielsku.
 */
const RODZAJ_Z_NUMEREM = /^([a-z_]+?)_(\d+)$/;

/**
 * Część odcinka po podziale: wstawienie stacji dzieli odcinek `X` na `X_L` i `X_R`,
 * wstawienie łącznika sekcyjnego na `X_SL` i `X_SR` (część 1 i część 2 — ta sama
 * numeracja, której używa nazwa połówki w backendzie), a punkt odgałęźny dopisuje
 * jeszcze rodzaj (`X_L_zksn`). Podział może się powtarzać (`X_R_R_L_SL`).
 */
const CZESC_PO_PODZIALE = /^([a-z0-9_]+?)((?:_S?[LR])+)(?:_([a-z_]+))?$/;

/**
 * Polska nazwa rodzaju obiektu dla JEDNEGO segmentu referencji.
 *
 * Najpierw słownik (wpis jawny wygrywa — `bus_110` to „szyna 110 kV", a nie
 * „szyna 110"), potem reguła `<rodzaj>_<numer>`, potem część odcinka po podziale.
 * Segment, którego nie tłumaczy żadna z nich, zostaje BEZ ZMIAN — świadomie:
 * lepiej pokazać go wprost niż zmyślić nazwę. Strażnik
 * `__tests__/slownikSegmentow.test.ts` pilnuje, żeby taki segment nie mógł
 * pochodzić z kodu backendu budującego identyfikatory.
 */
export function tlumaczSegment(segment: string): string {
  const jawny = NAZWY_SEGMENTOW[segment];
  if (jawny !== undefined) return jawny;
  const zNumerem = RODZAJ_Z_NUMEREM.exec(segment);
  if (zNumerem) {
    const rodzaj = NAZWY_SEGMENTOW[zNumerem[1]];
    if (rodzaj !== undefined) return `${rodzaj} ${zNumerem[2]}`;
  }
  const podzial = CZESC_PO_PODZIALE.exec(segment);
  if (podzial) {
    const podstawa = tlumaczSegment(podzial[1]);
    const czesci = podzial[2].split('_').filter((czesc) => czesc !== '');
    const numer = czesci.map((czesc) => (czesc.endsWith('L') ? '1' : '2')).join('.');
    const rodzajPunktu = podzial[3] === undefined ? undefined : NAZWY_SEGMENTOW[podzial[3]];
    if (podstawa !== podzial[1] && (podzial[3] === undefined || rodzajPunktu !== undefined)) {
      const przyczyna = rodzajPunktu
        ?? (czesci[czesci.length - 1].startsWith('S') ? 'łącznik sekcyjny' : undefined);
      const przy = przyczyna === undefined ? '' : ` (podział przy: ${przyczyna})`;
      return `${podstawa}, część ${numer}${przy}`;
    }
  }
  return segment;
}

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
      czlony.push(tlumaczSegment(segment));
    });
  if (czlony.length === 0) return 'obiekt modelu bez nazwy';
  // Prefiks często nazywa ten sam rodzaj co następny człon (`tr/…/transformer`,
  // `seg/…/branch_segment`) — człon, który następny powtarza albo zawęża
  // („odcinek” → „odcinek odgałęzienia”), nic nie mówi i odpada.
  return czlony
    .filter((czlon, i) => {
      const nastepny = czlony[i + 1];
      return (
        nastepny === undefined
        || !(nastepny === czlon || nastepny.startsWith(`${czlon} `) || nastepny.startsWith(`${czlon},`))
      );
    })
    .join(' · ');
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
