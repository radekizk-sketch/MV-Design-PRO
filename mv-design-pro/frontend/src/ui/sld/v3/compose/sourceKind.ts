/**
 * SLD V3 F9.4 (SLD_CAD_SPEC_V3 §13.1/§13.2, V12K-029) — mapowanie
 * `SldSourceView.kind` (adapter v2, `enmToSldAdapter.ts`) na symbol DER
 * (`symbols/defs.ts`) i etykietę polską (spec §9: zero enumów w UI). Jedna
 * prawda: `layout/measure.ts` (rezerwacja miejsca) i `compose/station.ts`
 * (rysunek) MUSZĄ zgadzać się co do gabarytu symbolu — obie strony importują
 * WYŁĄCZNIE z tego modułu (zero cienia, wzór `apparatusSequence.ts`).
 */

import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import { HIGHLIGHT_COLOR } from '../theme/colorTokens';

/**
 * Podzbiór `SldSourceView['kind']` (v2 adapter) reprezentowany symbolem DER
 * na scenie — WSZYSTKIE oprócz `'external_grid'` (ten ma własny glif
 * `gridSource`, rysowany NAD GPZ — `compose/gpz.ts` — a nie w stacji).
 */
export type DerSourceKind = 'pv' | 'bess' | 'generator' | 'wind' | 'unknown';

/**
 * Jedno widoczne źródło DER przypisane do stacji (spec §13.1, V12K-029) —
 * projekcja `SldSourceView` (adapter v2) ZAWĘŻONA do tego, czego potrzebuje
 * measure/compose (`Pick`-owy podzbiór, wzór `StationMeasureInput`) — zero
 * duplikacji modelu danych.
 */
export interface StationDerSourceInput {
  readonly id: string;
  readonly kind: DerSourceKind;
  readonly ratedPower?: number | null;
  /** F8b-1 (f92-2)/F9.4 (§13.1): `true` dla `kind==='unknown'` (gen_type
   *  nierozpoznany) — źródło NIE zginęło bez śladu (§13.1 wymaganie), ale
   *  jego rodzaj jest honest-unknown (fallback glif `derGenerator`, ZERO
   *  fabrykacji realnego rodzaju). */
  readonly missingData?: boolean;
  /** F11.3 (spec §13.3): stan operacyjny źródła — 1:1 z
   *  `SldSourceView.operationalState` (adapter v2, jedyny pisarz; reguła
   *  `OPERATING_MODE_TO_SOURCE_STATE` z `Generator.meta['operating_mode']`).
   *  `undefined` = uczciwy brak danych ⇒ ZERO nakładki (spec §13.3: „0 stanów
   *  wywiedzionych bez udokumentowanej reguły"). */
  readonly operationalState?: SourceOperationalState;
}

/**
 * F11.3 (spec §13.3) — pięć stanów źródła z kontraktu §13.3. Zamknięta unia,
 * strukturalnie identyczna z `NonNullable<SldSourceView['operationalState']>`
 * (adapter v2) — celowo BEZ importu adaptera (v3 compose nie zależy od v2;
 * zgodność obu unii pilnuje test `sourceState.test.ts`).
 */
export type SourceOperationalState = 'energized' | 'standby' | 'disconnected' | 'maintenance' | 'fault';

/**
 * F11.3 (spec §13.3 „stan = kolor/nakładka, nie geometria", spec §6 P5) —
 * JEDYNA tabela stan→kolor nakładki. Deterministyczna z konstrukcji (czysty
 * słownik, zero warunków). SCHEMAT-10 S3 (V12K-135): wartości TERAZ z
 * `theme/colorTokens.ts` `HIGHLIGHT_COLOR` — JEDNO źródło prawdy (D8: przed
 * S3 `#2ECC71`/`#5B6B76` istniały jako DWA osobne literały — tu I w
 * `canvas/SldCanvasV3.tsx` `OVERLAY_ENERGIZED_STROKE`/`OVERLAY_DEENERGIZED_STROKE`
 * — teraz oba miejsca czytają z tego samego stałej). Nakładka jest WYŁĄCZNIE
 * kolorem kreski glifu + atrybutem DOM `data-source-state` — NIE zmienia
 * geometrii ani bboxu symbolu (§13.3 wyrocznia; dowód inwariancji:
 * `sourceState.test.ts`).
 */
export const SOURCE_STATE_OVERLAY_COLOR: Readonly<Record<SourceOperationalState, string>> = {
  energized: HIGHLIGHT_COLOR.energized,
  standby: HIGHLIGHT_COLOR.standby,
  disconnected: HIGHLIGHT_COLOR.deenergized,
  maintenance: HIGHLIGHT_COLOR.maintenance,
  fault: HIGHLIGHT_COLOR.fault,
};

/** F11.3 (spec §9: zero enumów w UI) — polska etykieta stanu (inspektor/
 *  legenda), NIE rysowana na scenie (§13.3: nakładka = kolor, nie tekst). */
export const SOURCE_STATE_LABEL_PL: Readonly<Record<SourceOperationalState, string>> = {
  energized: 'W pracy',
  standby: 'Gotowość',
  disconnected: 'Odstawione',
  maintenance: 'W serwisie',
  fault: 'Awaria',
};

/** F11.3: strażnik runtime dla wyroczni `sourceStateGaps` (`scene/
 *  buildScene.ts`) — dane sceny pochodzą z JSON (fixtury/ENM), typ statyczny
 *  nie chroni przed wartością skorumpowaną. */
export function isSourceOperationalState(value: unknown): value is SourceOperationalState {
  return typeof value === 'string' && value in SOURCE_STATE_OVERLAY_COLOR;
}

/**
 * F9.4 (§13.2 `source_symbol_probe`): każdy `DerSourceKind` ROZPOZNANY
 * (pv/bess/generator/wind) mapuje na UNIKALNY glif. `'unknown'` jest
 * WYJĄTKIEM UDOKUMENTOWANYM (STOP-notatka raportu F9.4): spec §13.2
 * definiuje symbole dla rodzajów ROZPOZNANYCH i nie przewiduje piątego glifu
 * dla „typu nieznanego" — fallback na `derGenerator` (glif generyczny) +
 * `missingData=true` w meta sceny (adnotacja audytora, NIE fabrykacja
 * rodzaju). Injektywność `DER_SOURCE_KIND_SYMBOL` dla rodzajów rozpoznanych
 * (pv/bess/generator/wind → cztery różne `SymbolId`) jest dowodliwa WPROST
 * z tej tabeli (cztery różne klucze, cztery różne wartości) — nie wymaga
 * osobnej wyroczni sceny; `unknown` DZIELI `derGenerator` z `generator`,
 * WYJĄTEK udokumentowany wyżej, jawnie wyłączony z tego dowodu (dokumentacja,
 * nie luka wyroczni). F9.4 (runda korekcyjna po recenzji Opusa): wcześniejsza
 * wersja tego akapitu przypisywała dowód funkcji `sourceKindSymbolsAreInjective`
 * (`scene/buildScene.ts`) — TAKA funkcja NIGDY nie istniała (wyrocznia-widmo).
 * Realne wyrocznie widoczności/ciągłości źródeł (§13.1/§14.1) to
 * `sourceCoverageGaps`/`allSourcesVisible` i `sourceConnectivityGaps`/
 * `allSourcesConnected` (`scene/buildScene.ts`, runda korekcyjna F9.4).
 */
const DER_SOURCE_KIND_SYMBOL: Readonly<Record<DerSourceKind, SymbolId>> = {
  pv: 'derPv',
  bess: 'derBess',
  generator: 'derGenerator',
  wind: 'derWind',
  unknown: 'derGenerator',
};

export function symbolIdForSourceKind(kind: DerSourceKind): SymbolId {
  return DER_SOURCE_KIND_SYMBOL[kind];
}

/**
 * F9.7 (spec §13.2 `source_symbol_probe`) — realizacja PRAWDZIWA funkcji, o
 * której istnieniu wcześniejsza wersja tego docstringu (wyżej) BŁĘDNIE
 * twierdziła („wyrocznia-widmo", naprawione w rundzie korekcyjnej F9.4 przez
 * USUNIĘCIE fałszywego odwołania — patrz akapit wyżej). Ta funkcja domyka
 * lukę wyroczniową na `accept:sld-v3` (audyt kompletności F9.7, spec §11
 * pozycja 10): dowodzi injektywność `DER_SOURCE_KIND_SYMBOL` dla rodzajów
 * ROZPOZNANYCH (`unknown` jest udokumentowanym wyjątkiem — dzieli glif z
 * `generator`, WYŁĄCZONY z dowodu, patrz akapit wyżej) I sprawdza, że żaden
 * rozpoznany rodzaj DER nie dzieli glifu z `gridSource` (sieć zewnętrzna,
 * `compose/gpz.ts` — odrębna przestrzeń `source_kind`, spec §13.1/§13.2).
 */
export function sourceKindSymbolsAreInjective(): boolean {
  const recognized: readonly DerSourceKind[] = ['pv', 'bess', 'generator', 'wind'];
  const symbolIds = recognized.map((k) => DER_SOURCE_KIND_SYMBOL[k]);
  const allUnique = new Set(symbolIds).size === symbolIds.length;
  const noOverlapWithGridSource = !symbolIds.includes('gridSource' as SymbolId);
  return allUnique && noOverlapWithGridSource;
}

/** Polska etykieta rodzaju (spec §4 „DER: rodzaj+moc pod symbolem", §9 zero
 *  enumów w UI — etykieta jest tekstem inspektora/podpisu, NIE kodem). */
export const DER_SOURCE_KIND_LABEL_PL: Readonly<Record<DerSourceKind, string>> = {
  pv: 'PV',
  bess: 'BESS',
  generator: 'Generator',
  wind: 'Farma wiatrowa',
  unknown: 'Źródło (typ nieznany)',
};

/**
 * Formatowanie mocy DER wejściowej w [MW] (spec §4) — konwencja
 * przecinka/jednostki jak `formatTransformerRatedPower`
 * (`v2/renderer/StationOnRunRenderer.tsx`, próg 1 MW/1000 kVA), zastosowana
 * do INNEJ jednostki wejściowej (MW, nie kVA — `SldSourceView.ratedPower`
 * jest już w MW, zero konwersji zgadywanej).
 */
export function formatDerRatedPower(ratedPowerMw: number): string {
  return ratedPowerMw >= 1
    ? `${ratedPowerMw.toFixed(1).replace('.', ',')} MW`
    : `${Math.round(ratedPowerMw * 1000)} kW`;
}

/** Gabaryt jednego symbolu DER — pomocnicze dla `derRowFootprint`
 *  (`layout/measure.ts`); WYŁĄCZNIE z `SYMBOL_DEFS` (zero duplikacji liczb). */
export function derSymbolSize(kind: DerSourceKind): { readonly width: number; readonly height: number } {
  const def = SYMBOL_DEFS[symbolIdForSourceKind(kind)];
  return { width: def.width, height: def.height };
}

/**
 * Tekst etykiety DER (spec §4 „DER: rodzaj+moc pod symbolem") — JEDNA
 * prawda dla `layout/measure.ts` (`derColumnRequiredWidth`, rezerwacja
 * miejsca) i `compose/station.ts` (rysunek) — dwie niezależne strony MUSZĄ
 * zgadzać się co do treści, inaczej rezerwacja i realny tekst rozjeżdżają
 * się (wzór `formatTransformerRatedPower`/`stationNameBandHeight`).
 */
export function derLabelText(source: {
  readonly kind: DerSourceKind;
  readonly ratedPower?: number | null;
}): string {
  const powerText = source.ratedPower != null ? ` ${formatDerRatedPower(source.ratedPower)}` : '';
  return `${DER_SOURCE_KIND_LABEL_PL[source.kind]}${powerText}`;
}
