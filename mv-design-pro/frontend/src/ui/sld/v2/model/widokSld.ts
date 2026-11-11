/**
 * Model widoku SLD — kształt danych wyjściowych adaptera ENM → SLD
 * (`canvas/enmToSldAdapter.ts` `SldDataPayload`), czytany przez scenę kanwy v3
 * (`ui/sld/v3/scene/buildScene.ts`), inspektor obiektu kanwy (`sld/shared/daneElementuKanwy.ts`)
 * i drzewo hierarchii.
 *
 * GPZ-PARYTET cz. 2 (pkt 4): typy przeniesione z martwych rendererów v2
 * (`v2/renderer/{StationOnRun,Gpz,Section,Der,Connection}Renderer.tsx`,
 * skasowanych razem z katalogiem `v2/renderer/` — jedynym rendererem SLD jest
 * `SldCanvasV3`). Nazwy `*RendererProps` zastąpione `*ViewModel`, bo to model
 * danych, nie propsy komponentu; pola wyłącznie rendererowe (wywołania zwrotne
 * kliknięć, `selected`) usunięte — żaden zapisujący ich nie ustawiał
 * (`npx tsc --noEmit` na drzewie po kasacji).
 */

import type { StationTransformerUnit } from '../../../network-build/stationTransformerSelection';
import type { MiniBlockBayDescriptor } from './widokPolStacji';
import type { SprzegloSekcjiView } from './sprzeglaSekcji';

/** Moc znamionowa transformatora jako tekst etykiety (kVA albo MVA, przecinek dziesiętny). */
export function formatTransformerRatedPower(kva: number): string {
  return kva >= 1000
    ? `${(kva / 1000).toFixed(1).replace('.', ',')} MVA`
    : `${kva} kVA`;
}

/** Sekcja szyny SN stacji — rekord `Bus` modelu. */
export interface StationSnSectionView {
  readonly busRef: string;
  /** Numer porządkowy sekcji (1..N) w kolejności `Substation.bus_refs`. */
  readonly ordinal: number;
  readonly voltageKv: number | null;
}

export interface StationOnRunViewModel {
  readonly id: string;
  readonly name: string;
  readonly topologicalType: 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
  readonly snBays?: readonly MiniBlockBayDescriptor[];
  /** GEOMETRIA-STACJI (Z-03): sekcje szyn SN stacji — szyny główne strony SN
   *  (`Substation.bus_refs` powyżej pasma nN) w kolejności rekordu stacji. Każda sekcja
   *  rysuje WŁASNY odcinek szyny (`ownerRef = ${busRef}#sn-bus`). Brak/puste = stacja bez
   *  rekordu szyny SN (rysunek prowadzi jedną szynę z konstrukcji bloku). */
  readonly snSections?: readonly StationSnSectionView[];
  /** GEOMETRIA-STACJI (Z-03, Z-08): sprzęgła MIĘDZY sekcjami — gałęzie `bus_coupler`
   *  modelu (`v2/model/sprzeglaSekcji.ts`, jedno źródło z GPZ). */
  readonly snCouplers?: readonly SprzegloSekcjiView[];
  readonly hasTransformer?: boolean;
  /** TR2W-BEZ-POLA (§0.C.2/§0.C.3): jednostki transformatorowe stacji z OBOMA
   *  końcami topologicznymi (`Transformer.hv_bus_ref`/`lv_bus_ref`) — 0..N od
   *  początku, każda z własnym refem i własnym przypisaniem do sekcji szyn
   *  (`selectStationTransformerUnits`, jedno źródło prawdy). */
  readonly transformerUnits?: readonly StationTransformerUnit[];
  readonly transformerRatedKva?: number | null;
  /** Stacja jest punktem NMO (Normalnie Otwartym) — renderuje badge "NOP"
   *  sygnalizujący granicę zasilania dwóch połówek ciągu (IEC 60617 ring). */
  readonly isNop?: boolean;
  /** Krótki kod stacji (S01, S15, S29...) wyświetlany jako prominent badge.
   *  K30-4: zastępuje regex extraction z name (backend gubi name_pl). */
  readonly stationCode?: string | null;
  /** K30-37: napięcie szyny stacji [kV]. Renderer dobiera tint koloru szyny
   *  zgodnie z konwencją dyspozytorską (110kV → czerwień WN, 15kV → zieleń SN,
   *  0.4kV → błękit nN). Brak → fallback do COLOR_FIELD_TRUNK_ENERGIZED. */
  readonly busVoltageKv?: number | null;
  /** Recenzja NO-GO 2026-07-17 pkt 6 (spec §12.5): napięcie szyny nN stacji
   *  [kV] — z rekordu szyny nN (szyna w paśmie nN — `wPasmieNn` z `ui2/model/pasmaNapieciowe` — w `Substation.bus_refs`).
   *  `null`/brak = dana niedostarczona (etykieta szyny nN bez napięcia). */
  readonly nnVoltageKv?: number | null;
  /** Recenzja NO-GO 2026-07-17 pkt 6: ZAGREGOWANY odbiór nN stacji — suma
   *  `Load.p_mw`/`q_mvar` (× `quantity`) rekordów na szynach nN tej stacji.
   *  `null` = ZERO rekordów `Load` (jawna granica modelu, nie zero mocy). */
  readonly aggregatedLvLoad?: { readonly pMw: number; readonly qMvar: number; readonly count: number } | null;
  /** K30-62: vector group transformatora (Dyn5, Yd11, Yzn11) per IEC 60076-1.
   *  Industrial SLD pokazuje vector group obok TR symbol. */
  readonly transformerVectorGroup?: string | null;
  /** P-A POWER-FLOW TOR (one truth): czy szyna stacji jest pod napięciem wg
   *  FROZEN solvera (czy SN/nN bus jest w wyspie slacka). READ z companion —
   *  NIE liczone w SLD. `false` → blok L0 wyszarzony (de-energized, np. za
   *  otwartym NOP). Brak (undefined) → traktowane jak pod napięciem (brak
   *  companion = brak danych solvera). */
  readonly energized?: boolean;
}

export interface GpzViewModel {
  readonly id: string;
}
