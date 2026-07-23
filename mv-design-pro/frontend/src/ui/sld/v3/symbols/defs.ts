/**
 * SLD V3 — biblioteka symboli IEC 60617 jako CZYSTE DANE (SLD_CAD_SPEC_V3 §3).
 *
 * Każdy symbol: bbox (wielokrotność GRID), nazwane porty NA siatce i NA
 * krawędzi bboxa (wyrocznia grid_probe/port_probe — spec §11.2/§11.3).
 * Rysunek (glif SVG) w `glyphs.tsx`; layout zna WYŁĄCZNIE te dane.
 *
 * Odstępstwo od tabeli spec §3: symbole DER mają 32×32 (nie 24×24), bo port
 * centralny 12px nie leży na siatce GRID=8 — wyrocznia siatki jest nadrzędna.
 */

import { GRID, isOnGrid, type SymbolPort } from '../core/grid';

export type SymbolId =
  | 'breaker'          // wyłącznik (CB)
  | 'disconnector'     // odłącznik (DS)
  | 'loadBreakSwitch'  // rozłącznik (łącznik obciążeniowy, spec §12.5 — recenzja NO-GO pkt 5)
  | 'earthSwitch'      // uziemnik (ES)
  | 'fuseSwitch'       // rozłącznik z bezpiecznikiem
  | 'transformer2W'    // transformator dwuuzwojeniowy
  | 'cableHead'        // głowica kablowa
  | 'jointSleeve'      // mufa kablowa
  | 'noPoint'          // punkt podziału NO (łącznik otwarty na torze)
  | 'junction'         // węzeł T (jawna kropka)
  | 'branchJunction'   // węzeł rozgałęzienia lateralu — akcent (spec §14.4)
  | 'currentTransformer' // przekładnik prądowy CT
  | 'voltageTransformer' // przekładnik napięciowy VT
  | 'surgeArrester'    // ogranicznik przepięć SA
  | 'derPv'            // falownik PV
  | 'derBess'          // magazyn energii
  | 'derGenerator'     // generator (G w okręgu)
  | 'derWind'          // farma wiatrowa (turbina, F9.4 §13.2)
  | 'gridSource'       // sieć zewnętrzna (Source ENM, F9.4 §13.1/§13.2)
  | 'stationCollapsed' // stacja SN/nN, widok zbiorczy (L0) — mini-RMU (sylwetka)
  | 'protectionRelay'  // F9.9: przekaźnik zabezpieczeniowy (okrąg + kody ANSI, §17.1)
  | 'meter'            // F9.9: miernik (okrąg „M"/litera wielkości, §17.1)
  | 'loadArrow';       // zagregowany odbiór 0,4 kV (spec §12.5 — recenzja NO-GO pkt 6)

export interface SymbolDef {
  readonly id: SymbolId;
  readonly width: number;
  readonly height: number;
  readonly ports: readonly SymbolPort[];
  /** Polska nazwa dla inspektora/tooltipa (spec §9 — zero enumów w UI). */
  readonly labelPl: string;
}

function def(
  id: SymbolId,
  width: number,
  height: number,
  ports: readonly SymbolPort[],
  labelPl: string,
): SymbolDef {
  return { id, width, height, ports, labelPl };
}

export const SYMBOL_DEFS: Readonly<Record<SymbolId, SymbolDef>> = {
  breaker: def('breaker', 16, 16, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 16, dir: 'S' },
  ], 'Wyłącznik'),
  disconnector: def('disconnector', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Odłącznik'),
  // Recenzja NO-GO 2026-07-17 pkt 5 (spec §12.5): ROZŁĄCZNIK (łącznik
  // obciążeniowy, IEC 60617 switch-disconnector) — dedykowany glif,
  // odróżnialny od odłącznika poprzeczką na końcu styku ruchomego.
  // Kasuje udokumentowaną aproksymację `LOAD_SWITCH→disconnector`
  // (nagłówek compose/apparatusSequence.ts).
  loadBreakSwitch: def('loadBreakSwitch', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Rozłącznik'),
  earthSwitch: def('earthSwitch', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Uziemnik'),
  fuseSwitch: def('fuseSwitch', 16, 32, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 32, dir: 'S' },
  ], 'Rozłącznik z bezpiecznikiem'),
  transformer2W: def('transformer2W', 32, 40, [
    { name: 'hv', x: 16, y: 0, dir: 'N' },
    { name: 'lv', x: 16, y: 40, dir: 'S' },
  ], 'Transformator SN/nN'),
  cableHead: def('cableHead', 16, 16, [
    { name: 'line', x: 8, y: 16, dir: 'S' },
  ], 'Głowica kablowa'),
  jointSleeve: def('jointSleeve', 16, 16, [
    { name: 'a', x: 0, y: 8, dir: 'W' },
    { name: 'b', x: 16, y: 8, dir: 'E' },
  ], 'Mufa kablowa'),
  noPoint: def('noPoint', 16, 16, [
    { name: 'a', x: 0, y: 8, dir: 'W' },
    { name: 'b', x: 16, y: 8, dir: 'E' },
  ], 'Punkt podziału sieci (NO)'),
  junction: def('junction', 16, 16, [
    { name: 'n', x: 8, y: 0, dir: 'N' },
    { name: 's', x: 8, y: 16, dir: 'S' },
    { name: 'e', x: 16, y: 8, dir: 'E' },
    { name: 'w', x: 0, y: 8, dir: 'W' },
  ], 'Węzeł'),
  // F9.3 (spec §14.4 „jawne rozgałęzienia" — akcent węzłów): gabaryt 32×32
  // (4×GRID, vs 16×16 `junction` bazowy) — ZAWSZE odróżnialny gabarytowo
  // (branch_accent_probe: „gabaryt większy niż junction bazowy"). Porty N/S/
  // E/W jak `junction`, skalowane do bboxa (spec §11.2/§11.3 grid_probe/
  // port_probe — 32/2=16=2×GRID, centrowanie zostaje na siatce).
  branchJunction: def('branchJunction', 32, 32, [
    { name: 'n', x: 16, y: 0, dir: 'N' },
    { name: 's', x: 16, y: 32, dir: 'S' },
    { name: 'e', x: 32, y: 16, dir: 'E' },
    { name: 'w', x: 0, y: 16, dir: 'W' },
  ], 'Węzeł rozgałęzienia'),
  currentTransformer: def('currentTransformer', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Przekładnik prądowy'),
  voltageTransformer: def('voltageTransformer', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Przekładnik napięciowy'),
  surgeArrester: def('surgeArrester', 16, 24, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Ogranicznik przepięć'),
  // Recenzja NO-GO 2026-07-17 pkt 6 (spec §12.5): zagregowany ODBIÓR 0,4 kV
  // — strzałka odbioru (IEC 60617), zaczep portem N do szyny nN.
  loadArrow: def('loadArrow', 16, 16, [
    { name: 'top', x: 8, y: 0, dir: 'N' },
  ], 'Odbiór (zagregowany)'),
  derPv: def('derPv', 32, 32, [
    { name: 'ac', x: 16, y: 0, dir: 'N' },
  ], 'Instalacja fotowoltaiczna'),
  derBess: def('derBess', 32, 32, [
    { name: 'ac', x: 16, y: 0, dir: 'N' },
  ], 'Magazyn energii'),
  derGenerator: def('derGenerator', 32, 32, [
    { name: 'ac', x: 16, y: 0, dir: 'N' },
  ], 'Generator'),
  // F9.4 (spec §13.2, V12K-029): farma wiatrowa — sam gabaryt/porty jak
  // pozostałe DER (32×32, port `ac` na N) — rozróżnienie glifem (`glyphs.tsx`).
  derWind: def('derWind', 32, 32, [
    { name: 'ac', x: 16, y: 0, dir: 'N' },
  ], 'Farma wiatrowa'),
  // F9.4 (spec §13.1/§13.2): sieć zewnętrzna (Source ENM) — jeden port
  // `bottom` (S), gabaryt 16×24 jak `disconnector`/`earthSwitch` (aparat
  // jednokolumnowy, nie DER 32×32 — ten symbol nie jest instalacją DER).
  gridSource: def('gridSource', 16, 24, [
    { name: 'bottom', x: 8, y: 24, dir: 'S' },
  ], 'Sieć zewnętrzna'),
  // SCHEMAT-10 GS-1 (V12K-137, GAP `S7_GAP_CROSSING_ZERO` §10.4, macierz
  // `AUDYT_SCHEMATOW_OD_ZERA_2026-07` §3 wiersz „Stacja"): symbol zbiorczy
  // stacji na L0 to MINI-RMU — sylwetka tej samej gramatyki co L1/L2 w
  // miniaturze (obrys enklozury + wewnętrzna kreska szyny SN), nie goły
  // kwadrat 16×16. Rozmiar 48×48 (6×GRID) WYPROWADZONY z czytelności na
  // kadrze CAŁEJ sieci referencyjnej: przy fit `sldSubstrate52s` (bbox
  // 14296×4379, harness 1800×1100, padding 40) skala fit=0,1203 ⇒ 48px świata
  // = 5,78px ekranu (16px dawało 1,93px — nieodróżnialne od kropki węzła).
  // Prześwit sąsiadów na L0 (min. odstęp osi stacji tego samego pasa = 664px)
  // ⇒ glif zajmuje <8% odstępu, zero ryzyka kolizji (`noSceneSymbolOverlaps`).
  // Porty N/S/E/W jak `junction` (kontrakt routingu; L0 kotwiczy dodatkowo
  // ŚRODKIEM — `sceneSegmentEndpointGaps`). Markery typu/TR/DER/NO rysuje
  // `StationCollapsedGlyph` WEWNĄTRZ bboxa (zero nowej rezerwacji), sterowane
  // `GlyphProps` (`meta.stationGlyph`, wzór `protectionCodes`/`meterQuantity`).
  stationCollapsed: def('stationCollapsed', 48, 48, [
    { name: 'n', x: 24, y: 0, dir: 'N' },
    { name: 's', x: 24, y: 48, dir: 'S' },
    { name: 'e', x: 48, y: 24, dir: 'E' },
    { name: 'w', x: 0, y: 24, dir: 'W' },
  ], 'Stacja (widok zbiorczy)'),
  // F9.9 (spec §17.1/§17.3): przekaźnik zabezpieczeniowy — okrąg 24×24
  // (3×GRID) w kolumnie adnotacji pola. Element ADNOTACJI (NIE aparat toru
  // mocy, §17.1: „nie uczestniczy w ciągłości elektrycznej ani w wyroczniach
  // toru") — port `link` WYŁĄCZNIE geometryczny (zaczep TORU WYZWALANIA
  // przerywanego, §17.1), nie oznacza udziału w routingu elektrycznym.
  // Port `link` na y=8 (NIE geometryczny środek y=12 — 24/2=12 NIE jest
  // wielokrotnością GRID=8, złamałoby grid_probe §11.2; y=8 jest najbliższą
  // wielokrotnością GRID w bboxie 24×24, wybór wizualnie równoważny).
  protectionRelay: def('protectionRelay', 24, 24, [
    { name: 'link', x: 0, y: 8, dir: 'W' },
  ], 'Przekaźnik zabezpieczeniowy'),
  // F9.9 (spec §17.1): miernik — okrąg 24×24 (3×GRID), TA SAMA średnica co
  // przekaźnik (§17.3 nie różnicuje gabarytu). Spec nie przewiduje rysowanej
  // linii do miernika (kotwiczenie WYŁĄCZNIE pozycją, §17.2 „okrąg M przy
  // przekładniku pomiarowym") — port `anchor` WYŁĄCZNIE dla spójności z
  // biblioteką (każdy symbol ma ≥1 port, `symbols/__tests__/symbols.test.tsx`
  // grid_probe), nieużywany przez routing/tor wyzwalania.
  meter: def('meter', 24, 24, [
    { name: 'anchor', x: 0, y: 8, dir: 'W' },
  ], 'Miernik'),
};

/** Szyna zbiorcza — długość z treści (P1), więc fabryka, nie stała definicja. */
export interface BusbarDef {
  readonly length: number;
  readonly ports: readonly SymbolPort[];
}

export function makeBusbarDef(length: number): BusbarDef {
  if (!isOnGrid(length) || length < 2 * GRID) {
    throw new Error(`Długość szyny musi być wielokrotnością GRID=${GRID} i ≥ ${2 * GRID}: ${length}`);
  }
  return {
    length,
    ports: [
      { name: 'left', x: 0, y: 0, dir: 'W' },
      { name: 'right', x: length, y: 0, dir: 'E' },
    ],
  };
}
