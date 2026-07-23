/**
 * SLD V3 F5b — `CompositionPreview` (SLD_CAD_SPEC_V3 §6 "Hierarchia
 * graficzna"). Minimalny, CZYSTY komponent SVG — DEBUG/harness dla
 * wizualnego odbioru kompozycji (`compose/station.ts`, `compose/gpz.ts`) przez
 * nadzorcę i fundament renderu docelowego F6 (`SldCanvasV3`). Bez interakcji
 * (brak onClick/onContextMenu), bez stanu (brak `useState`/hooków), zero
 * DOM-measure/losowości/Date (P7) — WYŁĄCZNIE mapowanie danych już
 * policzonych przez `compose/*` na SVG.
 *
 * DECYZJA (kształt propsów): `compose/station.ts` i `compose/gpz.ts` mają
 * RÓŻNE typy kompozycji (`StationComposition`/`GpzComposition` — różne
 * kształty `labels`, `GpzComposition` niesie `meta` per-element, `Station…`
 * nie). Zamiast importować OBA moduły (sprzężenie harnessu z konkretnymi
 * compose — czego harness nie powinien znać), `CompositionPreview` przyjmuje
 * NAJMNIEJSZY WSPÓLNY, strukturalny kontrakt (`PreviewComposition` niżej):
 * symbole/segmenty z opcjonalnym `meta`, oraz etykiety JUŻ ROZWIĄZANE
 * (`OwnedLabel[]` — wynik `resolveLabels`, `layout/labels.ts`). Wołający
 * (test/harness wizualny) adaptuje `StationComposition`/`GpzComposition` do
 * tego kontraktu i sam wywołuje `resolveLabels` na `composition.labels` —
 * `CompositionPreview` NIE wywołuje `resolveLabels` (to byłaby logika
 * layoutu w komponencie prezentacyjnym, zakazane przez architekturę warstw).
 *
 * Hierarchia grubości (spec §6): szyna 4 / tor SN 1.6 / tor nN 1.2 /
 * leader 0.8 / ramka aparatu 1.2 (ramka aparatu to WEWNĘTRZNA sprawa glifu —
 * `symbols/glyphs.tsx`, F1 — nie dotyczy segmentów tu rysowanych). Domyślny
 * `kind` segmentu (brak `meta.kind`) = `'sn'` (1.6) — większość odcinków
 * kompozycji to tory SN/WN klasy „normalny przewód", nie szyna.
 */
import type { SymbolId } from '../symbols/defs';
import { SYMBOL_GLYPHS, type StationDerGlyphKind, type SwitchState } from '../symbols/glyphs';
import { SOURCE_STATE_OVERLAY_COLOR, type SourceOperationalState } from './sourceKind';
import { LABEL_TYPOGRAPHY } from '../core/text';
import type { OwnedLabel } from '../layout/labels';
import type { RouteVertex } from '../layout/route';
import type { ProtectionTopologyGap } from './protectionTopologyValidation';
import { BASE_STROKE, CANVAS_BACKGROUND } from '../theme/colorTokens';

/** Rodzaj odcinka → grubość (spec §6). `'bus'` obejmuje WSZYSTKIE szyny
 *  (WN/SN, primary/reserve/ring-closure) — spec nie różnicuje grubości szyn
 *  po napięciu, tylko nakładką koloru (F6, poza zakresem tego harnessu). */
/** F9.9 (spec §17.1): `'protectionTrip'` — tor wyzwalania (linia przerywana
 *  dash 4-2, odrębna od `'leader'` dash 3-2) łącząca przekaźnik z wyłącznikiem.
 *  Element WARSTWY ADNOTACJI (§17.1: „nie uczestniczy w ciągłości elektrycznej
 *  ani w wyroczniach toru") — WYŁĄCZONY z wyroczni continuity/port_probe
 *  (`scene/buildScene.ts`), ale OBJĘTY wyroczniami kolizji/siatki (§17.5e). */
/** F10.5 (spec §20.1): `'measurementLink'` — linia SYGNAŁU POMIAROWEGO
 *  CT→przekaźnik, ODRĘBNA od `'protectionTrip'` (tor TRIP przekaźnik→
 *  wyłącznik) — zakaz „jednej anonimowej linii" (§20.1 dosłownie).
 *  Rozróżnialna: cieńsza (0.6 vs 0.8) + INNY dasharray (2-2 vs 4-2, patrz
 *  `PreviewSegmentNode`/`SldCanvasV3`). Element WARSTWY ADNOTACJI (jak
 *  `'protectionTrip'`) — WYŁĄCZONY z continuity/port_probe toru mocy
 *  (§20.1e), OBJĘTY wyroczniami kolizji/siatki. */
/** F13.1 (SLD_CAD_SPEC_V3 §21.2, D3-2/D3-2bis): `'busGpz'` — szyna(y) sekcji
 *  SN GPZ, grubsza niż szyna stacji (`'bus'`, 4) — dominanta kompozycyjna GPZ
 *  jako WN/SN. Szyna WN (`#hv-bus`) i szyny stacji ZOSTAJĄ `'bus'` (spec
 *  §21.2 różnicuje WYŁĄCZNIE szynę sekcji SN GPZ, nie szynę WN ani stacje). */
export type PreviewSegmentKind = 'bus' | 'busGpz' | 'sn' | 'snTrunk' | 'lv' | 'leader' | 'protectionTrip' | 'measurementLink' | 'openTerminal';

/** Eksportowane (F6b): `SldCanvasV3` reużywa TĘ SAMĄ hierarchię grubości
 *  (spec §6), zero duplikacji stałych między harnessem debug i kanwą docelową. */
export const SEGMENT_STROKE_WIDTH: Readonly<Record<PreviewSegmentKind, number>> = {
  bus: 4,
  // F13.1 (spec §21.2): szyna sekcji SN GPZ — grubsza niż szyna stacji (D3-2
  // dominanta kompozycyjna). Szyna stacji ZOSTAJE `bus`=4 (nietknięta).
  busGpz: 6,
  sn: 1.6,
  // F13.4 (spec §22.4, D3-6): tor MAGISTRALI (trasa ciągu głównego GPZ→S0→…)
  // grubszy niż odgałęźny (`sn`) — kanon SCADA: pierwszeństwo czytania
  // kierunku zasilania jednym rzutem oka przy dziesiątkach pól liniowych.
  // Hierarchia §6 zachowana: szyny (4/6) > magistrala (2.4) > odgałęzienie
  // (1.6) > nN (1.2) > adnotacje (≤0.8).
  snTrunk: 2.4,
  lv: 1.2,
  leader: 0.8,
  // F9.9 (spec §17.1): tor wyzwalania — cienki jak leader (adnotacja, nie tor
  // mocy), odróżniony dasharray (4-2, patrz `PreviewSegmentNode`/`SldCanvasV3`).
  protectionTrip: 0.8,
  // F10.5 (spec §20.1): linia pomiarowa — CIEŃSZA niż tor wyzwalania (§20.1
  // „linia pomiarowa cienka od CT"), dodatkowo odróżniona dasharray (2-2).
  measurementLink: 0.6,
  // §16-v3 (SLD_CAD_REBUILD_PLAN_V3 „Dług otwarty" pkt 1): słupek terminalny
  // OTWARTEGO końca ciągu (kreska prostopadła do ostatniego biegu) — grubość
  // toru odgałęźnego (to marker KOŃCA toru SN, nie adnotacja ≤0.8).
  openTerminal: 1.6,
};

/**
 * Mała, ZAMKNIĘTA unia kategorii elementu — fundament selekcji v3 (F8b-1,
 * REBUILD_PLAN_V3 §F8b, zadanie „parytet funkcjonalny v3 przed usunięciem
 * v2"). Pochodna WYŁĄCZNIE `symbolId`/rodzaju segmentu (`buildScene.ts`
 * `classifySymbolElementKind`/`classifyStationSegmentKind`) — deterministyczna,
 * zero zgadywania z danych. `'apparatus'` jest bucketem „reszta" (breaker/
 * disconnector/earthSwitch/fuseSwitch/CT/VT/SA/cableHead/jointSleeve/NO-point)
 * — spec §6 P5 traktuje stan łącznika jako GEOMETRIĘ (nie nakładkę koloru),
 * więc dalsza granulacja tego bucketa nie jest potrzebna konsumentom (F8b-1
 * B: mapowanie na typ selekcji v2; F8b-1 C: WYŁĄCZONY z nakładki energizacji
 * — patrz `SldCanvasV3Workspace.ts`).
 */
/** F9.4: `'source'` — sieć zewnętrzna (`Source` ENM, glif `gridSource`,
 *  `compose/gpz.ts`) — ODRĘBNA od `'der'` (DER: PV/BESS/generator/farma
 *  wiatrowa), bo semantycznie to inny rodzaj elementu ENM (v2 `ElementType`
 *  ma dedykowany literał `'Source'`). Runda korekcyjna F9.4 (recenzja
 *  Opusa, F-3): `SldCanvasV3Workspace.tsx` `elementTypeForKind` NIE MIAŁ
 *  gałęzi `case 'source'` (spadał na `default`→`DescriptiveElement`, klik w
 *  symbol sieci zewnętrznej nie selekcjonował `'Source'`) — ten komentarz
 *  twierdził, że mapowanie istnieje, choć NIE istniało; naprawione (gałąź
 *  dodana), zdanie poniżej jest teraz prawdziwe. */
/** F9.9 (spec §17.1): `'protectionAnnotation'` — przekaźnik/miernik. Element
 *  warstwy adnotacji, celowo WYŁĄCZONY z reguły grupowania Union-Find
 *  (`sourceConnectivityGaps`, `scene/buildScene.ts` — reguła 3 dotyczy
 *  WYŁĄCZNIE `'apparatus'|'transformer'`), więc obecność tego elementu na
 *  scenie NIGDY nie wpływa na wyrocznie ciągłości toru mocy. */
export type PreviewElementKind =
  | 'station' | 'transformer' | 'der' | 'source' | 'apparatus' | 'bus' | 'segment' | 'protectionAnnotation';

/** Metadane wspólne symbolu/segmentu, potrzebne WYŁĄCZNIE do debug-atrybutów
 *  (spec zadania F5b: „data-symbol-canon/data-parity-key przepisywane z
 *  meta") — nadzbiór tego, co niosą `GpzElementMeta`/adapter stacji. */
export interface PreviewElementMeta {
  readonly parityKeys?: readonly string[];
  /** Pojedynczy klucz (kompatybilność z `StationComposition`, które nie mają
   *  listy — adapter wołającego może przekazać jeden klucz tu). */
  readonly parityKey?: string;
  readonly testId?: string;
  readonly kind?: PreviewSegmentKind;
  /** Szyna rezerwowa (busbarRole='reserve', topology='double') rysowana
   *  przerywaną linią — FIX-E (recenzja F5b): wołający przenosi
   *  `GpzElementMeta.dashed` tutaj, harness renderuje `strokeDasharray`. */
  readonly dashed?: boolean;
  /**
   * F8b-1 (spłata długu k1, REBUILD_PLAN_V3 F6b-2/F8a): realny ref ENM (lub
   * kompozyt zakotwiczony w realnym refie z sufiksem `#...`, ta sama
   * konwencja co `ComposedSegment.ownerRef`/`GpzElementMeta` — np. bayRef,
   * segmentRef, station ref, `${stationId}#sn-bus`) elementu, którego ten
   * symbol/segment reprezentuje na scenie. Fundament selekcji (B) i nakładki
   * energizacji (C) — WOŁAJĄCY (`buildScene.ts`) NIE zgaduje: `undefined`,
   * gdy adapter nie daje jednoznacznego dopasowania (np. przęsło bez
   * odpowiadającego `cableRun.segmentPaths`).
   */
  readonly ownerRef?: string;
  /** F8b-1: kategoria elementu — patrz `PreviewElementKind`. */
  readonly elementKind?: PreviewElementKind;
  /** F9.3 (SLD_CAD_SPEC_V3 §12.1): pochodzenie stosu aparatów pola —
   *  `'dane'` gdy zbudowany z `Bay.primary_devices`, `'konwencja'` gdy z
   *  fallbacku rysunkowego §12.4. Audytor DOM czyta to jako
   *  `data-apparatus-source` na grupie symbolu (patrz `PreviewSymbolNode`
   *  niżej i `canvas/SldCanvasV3.tsx`). `undefined` dla elementów, które nie
   *  są aparatem pola (szyny, stacje, DER, segmenty).
   */
  readonly apparatusSource?: 'dane' | 'konwencja';
  /** F10.2 (spec §19.1, V12K-035): pochodzenie IDENTYFIKATORA PER-APARAT
   *  (Q/QE/T) tego symbolu — `'konwencja'` gdy z fallbacku
   *  `apparatusIdentifiers` (`compose/apparatusSequence.ts`, dziś ZAWSZE,
   *  `BayPrimaryDevice.designation` DOMAIN dopiero F10.6); `undefined` dla
   *  symboli BEZ identyfikatora w tej fazie. Audytor DOM
   *  `data-designation-source` — ODDZIELNE od `apparatusSource` (patrz
   *  `ComposedSymbolInstance.designationSource`, `compose/station.ts`). */
  readonly designationSource?: 'dane' | 'konwencja';
  /** F9.4 (spec §13.1, f92-2): `true` dla symboli źródła (`elementKind`
   *  `'der'`/`'source'`) reprezentujących dane niekompletne (dziś: DER
   *  `kind==='unknown'` — `Generator.gen_type` nierozpoznany/`null`).
   *  Adnotacja audytora (`compose/sourceKind.ts`), NIE fabrykacja rodzaju —
   *  `undefined` dla WSZYSTKICH elementów rozpoznanych/nie-źródłowych. */
  readonly missingData?: boolean;
  /** F11.3 (spec §13.3): stan operacyjny źródła — WYŁĄCZNIE dla symboli
   *  `elementKind==='der'` (DER; `Source`/sieć zewnętrzna nie niesie trybu
   *  pracy w ENM — zawsze `undefined`). Jedyny pisarz: adapter v2
   *  (`OPERATING_MODE_TO_SOURCE_STATE` z `Generator.meta['operating_mode']`),
   *  przepisywany 1:1 przez compose→scene. Nakładka = kolor kreski
   *  (`SOURCE_STATE_OVERLAY_COLOR`, `compose/sourceKind.ts`) + atrybut DOM
   *  `data-source-state` — ZERO zmiany geometrii/bboxu (§13.3 wyrocznia
   *  `sourceStateGaps`, `scene/buildScene.ts`). */
  readonly operationalState?: SourceOperationalState;
  /** F9.9 (spec §17.3): kody funkcji przekaźnika — WYŁĄCZNIE dla symboli
   *  `protectionRelay` (`elementKind==='protectionAnnotation'`), przekazane
   *  1:1 do `ProtectionRelayGlyph.labelLines` (`symbols/glyphs.tsx`). */
  readonly protectionCodes?: readonly string[];
  /** F10.5 (spec §20.2): braki topologiczne funkcji zabezpieczeń
   *  (`protectionFunctionTopologyGaps`, `./protectionTopologyValidation`) —
   *  WYŁĄCZNIE dla symboli `protectionRelay`. Obecność (długość > 0) steruje
   *  adnotacją „!" (`ProtectionRelayGlyph.hasTopologyWarning`) — treść żyje
   *  w `missingData`/inspektorze (§20.3 „zwarta, nie zasłania toru"), NIE na
   *  scenie jako osobna etykieta tekstowa. */
  readonly topologyGaps?: readonly ProtectionTopologyGap[];
  /** Recenzja NO-GO 2026-07-17 pkt 11: litera mierzonej wielkości miernika
   *  (A/V z `Measurement.measurement_type`) — WYŁĄCZNIE dla symboli
   *  `meter`; `MeterGlyph` pokazuje ją zamiast mylącego „M". */
  readonly meterQuantity?: 'A' | 'V';
  /** §16-v3: `true` WYŁĄCZNIE dla ostatniego kawałka biegu OTWARTEGO (ciąg
   *  bez stacji na końcu — segment ENM istnieje, następnika brak). Ostatni
   *  wierzchołek takiego kawałka MUSI dotykać słupka terminalnego
   *  (`kind==='openTerminal'`) — wyrocznia `openTerminalGaps`
   *  (`scene/buildScene.ts`); zwykły wolny koniec dalej obcina `port_probe`. */
  readonly openTerminal?: boolean;
  /** SCHEMAT-10 GS-1 (V12K-137, GAP §10.4): podsumowanie sylwetki stacji dla
   *  glifu mini-RMU na L0 — WYŁĄCZNIE dla symboli `stationCollapsed`. Steruje
   *  markerami typu/TR/DER/NO w `StationCollapsedGlyph` (`symbols/glyphs.tsx`),
   *  przekazane 1:1 do `GlyphProps` (wzór `protectionCodes`/`meterQuantity`).
   *  Rodzaj stacji WYPROWADZONY z TYPU elementów (topologia/sprzęgło/TR/DER/NO),
   *  nie z nazw (spec §19.3, macierz §3). */
  readonly stationGlyph?: StationCompactGlyphSummary;
}

/** SCHEMAT-10 GS-1 (V12K-137): kompaktowe cechy stacji rysowane sylwetką
 *  mini-RMU na L0 (`AUDYT_SCHEMATOW_OD_ZERA_2026-07` §3 „Stacja"). Wszystkie
 *  pola WYPROWADZONE z realnej topologii/danych stacji (zero fabrykacji). */
export interface StationCompactGlyphSummary {
  /** Stacja sekcyjna (sprzęgło w `snBays`, `classifyStationTopologicalType`). */
  readonly sectioned: boolean;
  /** Stacja SN/nN z transformatorem (odróżnia od rozdzielni sieciowej bez TR). */
  readonly hasTransformer: boolean;
  /** Dominujący rodzaj DER przyłączonego do stacji, `null` gdy brak DER. */
  readonly der: StationDerGlyphKind | null;
  /** Stacja niesie punkt/łącznik normalnie otwarty (`isNop`). */
  readonly noOpen: boolean;
}

export interface PreviewSymbol {
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  readonly state?: SwitchState;
  readonly meta?: PreviewElementMeta;
}

export interface PreviewSegment {
  readonly points: readonly RouteVertex[];
  readonly meta?: PreviewElementMeta;
}

/** Najmniejszy wspólny kontrakt wejścia — patrz DECYZJA w nagłówku pliku. */
export interface PreviewComposition {
  readonly symbols: readonly PreviewSymbol[];
  readonly segments: readonly PreviewSegment[];
  /** Etykiety JUŻ rozwiązane (`resolveLabels`, `layout/labels.ts`) —
   *  `CompositionPreview` tylko je rysuje, nie liczy slotów. */
  readonly labels: readonly OwnedLabel[];
}

export interface CompositionPreviewProps {
  readonly composition: PreviewComposition;
  readonly width: number;
  readonly height: number;
  /** Tło/kolor bazowy rysunku (spec §6 P5: baza mono, kolor to nakładka —
   *  harness nie nakłada koloru stanu/napięcia, F6). Domyślnie SCADA. */
  readonly background?: string;
  readonly stroke?: string;
}

// SCHEMAT-10 S3 (V12K-135): wartości z `theme/colorTokens.ts` — JEDNO źródło
// prawdy, ta sama wartość co dotąd. Ten harness ZOSTAJE „mono base" (spec §6
// P5) — nakładanie napięcia/stanu tu byłoby zmianą POZA kontrakt harnessu
// (patrz docstring `theme/colorTokens.ts`).
const DEFAULT_BACKGROUND = CANVAS_BACKGROUND;
const DEFAULT_STROKE = BASE_STROKE;

function parityKeysOf(meta: PreviewElementMeta | undefined): string | undefined {
  if (!meta) return undefined;
  if (meta.parityKeys && meta.parityKeys.length > 0) return meta.parityKeys.join(' ');
  return meta.parityKey;
}

/** Eksportowana (F6b): `SldCanvasV3` reużywa tę samą projekcję punktów trasy
 *  na `<path d>` — zero duplikacji między harnessem debug i kanwą docelową. */
export function pointsToPath(points: readonly RouteVertex[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

function PreviewSymbolNode(props: { readonly symbol: PreviewSymbol; readonly stroke: string }): JSX.Element {
  const { symbol, stroke } = props;
  const Glyph = SYMBOL_GLYPHS[symbol.symbolId];
  // F11.3 (spec §13.3): nakładka stanu źródła = WYŁĄCZNIE kolor kreski glifu
  // (tabela `SOURCE_STATE_OVERLAY_COLOR`) + atrybut `data-source-state` —
  // geometria (x/y/glif/bbox) NIETKNIĘTA (§13.3 „nakładka nie zmienia bboxu").
  const state: SourceOperationalState | undefined = symbol.meta?.operationalState;
  const effectiveStroke = state ? SOURCE_STATE_OVERLAY_COLOR[state] : stroke;
  // Uwaga: `data-symbol-canon` jest już zapisywany PRZEZ SAM GLIF
  // (`glyphGroupProps`, `symbols/glyphs.tsx`, F1) — wrapper dopisuje
  // WYŁĄCZNIE meta, którego glif nie znałby (parityKey/testId z compose),
  // żeby nie duplikować atrybutu na dwóch zagnieżdżonych `<g>`.
  return (
    <g
      data-parity-key={parityKeysOf(symbol.meta)}
      data-test-id={symbol.meta?.testId}
      data-apparatus-source={symbol.meta?.apparatusSource}
      data-designation-source={symbol.meta?.designationSource}
      data-missing-data={symbol.meta?.missingData ? 'true' : undefined}
      data-source-state={state}
    >
      <Glyph
        x={symbol.x}
        y={symbol.y}
        state={symbol.state}
        stroke={effectiveStroke}
        labelLines={symbol.meta?.protectionCodes}
        hasTopologyWarning={(symbol.meta?.topologyGaps?.length ?? 0) > 0}
        meterQuantity={symbol.meta?.meterQuantity}
        stationSectioned={symbol.meta?.stationGlyph?.sectioned}
        stationHasTransformer={symbol.meta?.stationGlyph?.hasTransformer}
        stationDer={symbol.meta?.stationGlyph?.der}
        stationNoOpen={symbol.meta?.stationGlyph?.noOpen}
      />
    </g>
  );
}

function PreviewSegmentNode(props: { readonly segment: PreviewSegment; readonly stroke: string }): JSX.Element | null {
  const { segment, stroke } = props;
  if (segment.points.length < 2) return null;
  const kind = segment.meta?.kind ?? 'sn';
  const strokeWidth = SEGMENT_STROKE_WIDTH[kind];
  // F9.9 (spec §17.1: „linia wyzwalania: przerywana, dash 4-2") — dasharray
  // WŁASNY dla `protectionTrip`, odróżniony od `dashed` (4-3, szyna rezerwowa)
  // i `leader` (3-2, leader etykiety). F10.5 (spec §20.1): `measurementLink`
  // dostaje WŁASNY, INNY dasharray (2-2) — dwie linie wtórne muszą być
  // rozróżnialne wizualnie (§20.1 dosłownie), nie tylko przez `ownerRef`.
  const strokeDasharray =
    kind === 'protectionTrip'
      ? '4 2'
      : kind === 'measurementLink'
        ? '2 2'
        : segment.meta?.dashed
          ? '4 3'
          : kind === 'leader'
            ? '3 2'
            : undefined;
  return (
    <path
      d={pointsToPath(segment.points)}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={strokeDasharray}
      data-parity-key={parityKeysOf(segment.meta)}
      data-test-id={segment.meta?.testId}
    />
  );
}

function PreviewLabelNode(props: { readonly label: OwnedLabel; readonly stroke: string }): JSX.Element {
  const { label, stroke } = props;
  const typo = LABEL_TYPOGRAPHY[label.labelClass];
  const cx = label.rect.x + label.rect.width / 2;
  const cy = label.rect.y + label.rect.height / 2;
  const textTransform = label.rotated ? `rotate(-90, ${cx}, ${cy})` : undefined;
  return (
    <g data-owner-ref={label.ownerRef} data-owner-kind={label.ownerKind} data-slot-index={label.slotIndex}>
      {label.leader && (
        <path
          d={pointsToPath([label.leader.from, label.leader.to])}
          fill="none"
          stroke={stroke}
          strokeWidth={SEGMENT_STROKE_WIDTH.leader}
          strokeDasharray="2 2"
          data-parity-key="leader"
        />
      )}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={textTransform}
        fill={stroke}
        fontFamily="sans-serif"
        fontSize={typo.fontSize}
        fontWeight={typo.fontWeight}
      >
        {label.text}
      </text>
    </g>
  );
}

/**
 * Rysuje `PreviewComposition` jako SVG — WYŁĄCZNIE mapowanie danych
 * (symbols→`SYMBOL_GLYPHS`, segments→`<path>` z hierarchią grubości §6,
 * labels→`<text>` z `LABEL_TYPOGRAPHY`). Bez interakcji, bez stanu.
 */
export function CompositionPreview(props: CompositionPreviewProps): JSX.Element {
  const { composition, width, height, background = DEFAULT_BACKGROUND, stroke = DEFAULT_STROKE } = props;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      data-testid="sld-v3-composition-preview"
    >
      <rect x={0} y={0} width={width} height={height} fill={background} />
      <g data-preview-layer="segments">
        {composition.segments.map((segment, index) => (
          <PreviewSegmentNode key={`segment-${index}`} segment={segment} stroke={stroke} />
        ))}
      </g>
      <g data-preview-layer="symbols">
        {composition.symbols.map((symbol, index) => (
          <PreviewSymbolNode key={`symbol-${index}`} symbol={symbol} stroke={stroke} />
        ))}
      </g>
      <g data-preview-layer="labels">
        {composition.labels.map((label, index) => (
          <PreviewLabelNode key={`label-${index}`} label={label} stroke={stroke} />
        ))}
      </g>
    </svg>
  );
}
