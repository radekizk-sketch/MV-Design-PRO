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
  | 'stationCollapsed'; // stacja SN/nN, widok zbiorczy (L0) — kontur kwadratu

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
  // F6b (spłata STOP-notatki F6a): dedykowany symbol zbiorczy stacji na L0 —
  // porty N/S/E/W jak `junction` (ten sam kontrakt geometrii routingu), ale
  // rysunek to KONTUR KWADRATU (nie 4-portowy węzeł kropkowy), żeby stacja na
  // L0 była odróżnialna od jawnego węzła T tras (`junction`), spec §3 „Stacja
  // SN/nN … NIE kafel" — na L0 to nadal „∎16 z kodem", nie punkt.
  stationCollapsed: def('stationCollapsed', 16, 16, [
    { name: 'n', x: 8, y: 0, dir: 'N' },
    { name: 's', x: 8, y: 16, dir: 'S' },
    { name: 'e', x: 16, y: 8, dir: 'E' },
    { name: 'w', x: 0, y: 8, dir: 'W' },
  ], 'Stacja (widok zbiorczy)'),
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
