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

import type { UkladSieciNn } from '../../../../types/uziemienie';
import type { StationTransformerUnit } from '../../../network-build/stationTransformerSelection';
import type { LodLevel } from '../lod/LodPolicy';
import type { MiniBlockBayDescriptor, MiniBlockDerBadge } from './widokPolStacji';

/** Odsunięcie pnia ciągu SN nad osią stacji (geometria adaptera v2). */
export const STATION_RUN_TRUNK_OFFSET_Y = 80;

/** Moc znamionowa transformatora jako tekst etykiety (kVA albo MVA, przecinek dziesiętny). */
export function formatTransformerRatedPower(kva: number): string {
  return kva >= 1000
    ? `${(kva / 1000).toFixed(1).replace('.', ',')} MVA`
    : `${kva} kVA`;
}

export interface StationOnRunViewModel {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
  readonly topologicalType: 'końcowa' | 'przelotowa' | 'odgałęźna' | 'sekcyjna';
  readonly nnVoltageLevelsCount?: number;
  readonly missingData?: boolean;
  readonly lod?: LodLevel;
  readonly snBays?: readonly MiniBlockBayDescriptor[];
  readonly hasTransformer?: boolean;
  /** TR2W-BEZ-POLA (§0.C.2/§0.C.3): jednostki transformatorowe stacji z OBOMA
   *  końcami topologicznymi (`Transformer.hv_bus_ref`/`lv_bus_ref`) — 0..N od
   *  początku, każda z własnym refem i własnym przypisaniem do sekcji szyn
   *  (`selectStationTransformerUnits`, jedno źródło prawdy). */
  readonly transformerUnits?: readonly StationTransformerUnit[];
  readonly transformerRatedKva?: number | null;
  readonly nnFeedersCount?: number;
  readonly derBadges?: readonly MiniBlockDerBadge[];
  /** Stacja jest punktem NMO (Normalnie Otwartym) — renderuje badge "NOP"
   *  sygnalizujący granicę zasilania dwóch połówek ciągu (IEC 60617 ring). */
  readonly isNop?: boolean;
  /** Skumulowana odległość od GPZ [km] — pomaga Projektantowi ocenić geograficzne
   *  rozmieszczenie stacji na ciągu (np. "1.5 km"). */
  readonly distanceFromGpzKm?: number | null;
  /** Krótki kod stacji (S01, S15, S29...) wyświetlany jako prominent badge.
   *  K30-4: zastępuje regex extraction z name (backend gubi name_pl). */
  readonly stationCode?: string | null;
  /** K30-15.3: peak load attached to station's LV side [kW].
   *  Wartość >0 → 'L' badge widoczny pod transformer pokazujący poziom odbioru
   *  (Eksploatacyjny diff vs station bez load = ZKSN-only). */
  readonly totalLoadKw?: number | null;
  /** K30-15.3: total generation capacity attached [kW]. */
  readonly totalGenerationKw?: number | null;
  /** K30-36: krótkie etykiety roli pola per kolumna połączenia (WE/WY/TR/ODG/SPR/POM).
   *  Index = pozycja w `connectionColumns(topologicalType)`. Wartości:
   *   - 'WE' (wejściowe — Line IN od strony GPZ)
   *   - 'WY' (wyjściowe — Line OUT do następnej stacji)
   *   - 'TR' (transformator)
   *   - 'ODG' (odgałęzienie do branch run)
   *   - 'SPR' (sprzęgło sekcyjne)
   *   - 'POM' (pomiar VT/CT)
   *  Brak → renderer wyprowadza domyślną etykietę z `topologicalType`. */
  readonly bayRoleByColumn?: ReadonlyArray<'WE' | 'WY' | 'TR' | 'ODG' | 'SPR' | 'POM'>;
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
  /** W5-A: układ sieci nN stacji (PN-EN 60364-1 § 312) z `Transformer.lv_earthing_system`. */
  readonly earthingScheme?: UkladSieciNn | null;
  /** K30-44: aktualne odchylenie napięcia od nominalnego [%] — z LF results.
   *  Renderer dobiera ring colour station code badge per PN-EN 50160:
   *   - |ΔU| ≤ 2%  → green (energized OK)
   *   - 2% < |ΔU| ≤ 5%  → amber (warning, w granicach PN-EN 50160 ±10%)
   *   - 5% < |ΔU| ≤ 10% → orange (significant, blisko granicy)
   *   - |ΔU| > 10% → red (poza granicą PN-EN 50160)
   *  Brak → ring color domyślny (cyan #7EC8FF). */
  readonly voltageDeviationPct?: number | null;
  /** Aktualna skala viewportu SLD, uzywana do czytelnosci etykiet overview. */
  readonly viewportScale?: number;
  /** P-A POWER-FLOW TOR (one truth): czy szyna stacji jest pod napięciem wg
   *  FROZEN solvera (czy SN/nN bus jest w wyspie slacka). READ z companion —
   *  NIE liczone w SLD. `false` → blok L0 wyszarzony (de-energized, np. za
   *  otwartym NOP). Brak (undefined) → traktowane jak pod napięciem (brak
   *  companion = brak danych solvera). */
  readonly energized?: boolean;
}

export interface GpzViewModel {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly name: string;
}

export interface SectionViewModel {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly number: number;
  readonly busVoltageKv: number;
  readonly bayCount: number;
  /** Cyfra rzymska sekcji ("I", "II", "III", "IV") albo "S{n}". */
  readonly displayLabel?: string;
}

export interface DerViewModel {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind: 'PV' | 'BESS' | 'FW';
  readonly name: string;
  readonly nominalPowerKw?: number | null;
  readonly hasBlockTransformer?: boolean;
  readonly blockTransformerLabel?: string | null;
  readonly missingData?: boolean;
  /**
   * Aktualny punkt pracy — moc czynna P (MW).
   * Renderowany jako wskaźnik P/Q przy LOD=full.
   */
  readonly operatingPMw?: number | null;
  /**
   * Aktualny punkt pracy — moc bierna Q (Mvar).
   * Przy podaniu obu P i Q wyliczany jest cos φ = P/sqrt(P²+Q²).
   */
  readonly operatingQMvar?: number | null;
  /**
   * Phase 0C operator-grade SLD plan v2 (Acceptance Invariant 10):
   * DER zawsze ma PCC + connection_variant + port + voltage_level —
   * albo widoczny missing-connection blocker.
   *
   * `missingPcc=true` renderuje czerwony X badge nadrzędny do innych badge'y
   * (dominujący wizualnie, operator widzi natychmiast). Backend walidator
   * E028/E029 już blokuje runs gdy ten flag, ale renderer wyróżnia obiekt
   * również wizualnie aby operator wiedział KTÓRY DER jest niekompletny.
   */
  readonly missingPcc?: boolean;
  /**
   * Phase 0C: wariant przyłączenia (z ENM Generator.connection_variant).
   * Rysunek toru falownik → trafo blokowy → port stacji składa v3
   * (`v3/compose/station.ts`, łańcuch DER z deskryptora pola); dawny czytelnik
   * tego pola (renderer drzewa przyłączenia DER v2) skasowany w karcie GPZ-PARYTET cz. 2.
   */
  readonly connectionVariant?:
    | 'nn_side'
    | 'block_transformer'
    | 'LV_BEHIND_STATION_TRANSFORMER'
    | 'DEDICATED_MV_CONNECTION'
    | 'SOURCE_CONNECTION_STATION';
  /**
   * Naprawa hmi.3: LOD (Level of Detail) — uproszczony marker dla zoom out.
   *  - 'full' (default): pełen symbol (DER_BLOCK_SIZE 60px)
   *  - 'compact': romb mniejszy + etykieta typu (35px)
   *  - 'marker': kropka z kolorem typu (12px)
   */
  readonly lod?: 'full' | 'compact' | 'marker';
  /**
   * NC RFG Module wg ENEA profile (enea.yaml):
   * A: Mikro (0.8–1000 kW), B: Małe (1–50 MW), C: Duże (50–75 MW), D: B. duże (>75 MW).
   * null = nieprzypisany / brak profilu operatora.
   */
  readonly ncRfgModule?: 'A' | 'B' | 'C' | 'D' | null;
  /** Aktualna skala viewportu SLD. Uzywana tylko do czytelnosci etykiet. */
  readonly viewportScale?: number;
}

export interface ConnectionViewModel {
  readonly id: string;
  readonly pathPoints: ReadonlyArray<{ x: number; y: number }>;
  readonly transformerLabel?: string | null;
  readonly connectionKind?: 'der_block_transformer' | 'der_nn' | 'generic';
  readonly derRef?: string | null;
  readonly transformerRef?: string | null;
  readonly busPrzylaczeniaRef?: string | null;
  readonly viewportScale?: number;
}
