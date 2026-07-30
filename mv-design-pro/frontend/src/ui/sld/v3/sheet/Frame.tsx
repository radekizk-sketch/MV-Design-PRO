/**
 * SLD V3 — arkusz widoku sieci (SLD_CAD_SPEC_V3 §2 "Siatka, arkusz,
 * typografia", §10 "Arkusz/OSD"). Czysty komponent SVG: ramka, strefy
 * referencyjne (litery pion / cyfry poziom, co 400px), etykieta skali,
 * legenda symboli i linii. Title block (K30-38, `SldTitleBlock` w v2) NIE
 * jest duplikowany tutaj — komponent przyjmuje go jako slot (`titleBlock`
 * prop), zgodnie z planem F4 ("title block reuse"); wpięcie realnego v2
 * title blocka to zakres cutoveru (F6/F8).
 *
 * Typografia: WYŁĄCZNIE jawne atrybuty SVG (`fontFamily`/`fontSize`/
 * `fontWeight`), NIGDY klasa Tailwind w `<text>` — lekcja z commitu
 * `5a235ce` (klasy Tailwind nie działają w kontekście SVG renderowanym poza
 * drzewem DOM z załadowanym Tailwind, np. eksport SVG/PDF).
 */
import type { ReactNode } from 'react';

import { GRID } from '../core/grid';
import { LABEL_TYPOGRAPHY, labelLineHeight } from '../core/text';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import { SYMBOL_GLYPHS } from '../symbols/glyphs';
import { BASE_STROKE, CANVAS_BACKGROUND } from '../theme/colorTokens';

/** Kolor bazowy rysunku w trybie SCADA (spec §2/§6) — nakładki koloru
 *  napięcia/energizacji są zakresem F6 (`SldCanvasV3.tsx`), nie ramki arkusza.
 *  SCHEMAT-10 S3 (V12K-135): wartości TERAZ z `theme/colorTokens.ts` — JEDNO
 *  źródło prawdy, ta sama wartość co dotąd. */
const SHEET_STROKE = BASE_STROKE;
const SHEET_BACKGROUND = CANVAS_BACKGROUND;

/** Strefy referencyjne co 400px (spec §2). */
const ZONE_STEP = 400;
/** Margines ramki na oznaczenia stref (litery/cyfry) NA ZEWNĄTRZ obszaru rysunku.
 *  SCHEMAT-10 S4 (V12K-135/136, D12 reszta): eksportowany (dawniej lokalny) —
 *  `v3/export/exportFrame.ts` reużywa TĘ SAMĄ stałą dla kadru fit-do-treści
 *  eksportu (kadr eksportu = DOKŁADNIE ta sama formuła co ta ramka, 0 nowego
 *  marginesu do kalibracji). */
export const FRAME_MARGIN = 32;

export interface SheetLegendEntry {
  /** `note` (V12K-223) — wiersz OPISU SIECI bez glifu: sposób pracy punktu
   *  neutralnego, poziomy napięć, podstawa normowa. Informacje o CAŁEJ sieci
   *  przegrywały o miejsce z geometrią (trzy próby odrzucone przez bramki,
   *  V12K-221) — legenda jest ich właściwym miejscem, bo tu nie konkurują
   *  z aparaturą pól. */
  readonly kind: 'symbol' | 'line' | 'note';
  readonly id: string;
  readonly labelPl: string;
}

/** Domyślna legenda symboli (≥6 glifów, spec §2 "legenda symboli i linii")
 *  + 2 wpisy linii (kabel ciągły / linia napowietrzna kreska-kropka, spec §6). */
const DEFAULT_SYMBOL_LEGEND_IDS: readonly SymbolId[] = [
  'breaker',
  'disconnector',
  // Recenzja NO-GO 2026-07-17 pkt 5 (spec §12.5): rozłącznik — dedykowany
  // glif szablonu RMU; odbiór zagregowany — zamknięcie toru 0,4 kV (pkt 6).
  'loadBreakSwitch',
  'loadArrow',
  'earthSwitch',
  'fuseSwitch',
  'transformer2W',
  'noPoint',
  'currentTransformer',
  // Recenzja NO-GO 2026-07-17 pkt 11: głowica kablowa (▲) i symbol źródła/
  // ekwiwalentu sieci były NA rysunku, ale NIE w legendzie — czytelnik bez
  // klucza. Dopisane wprost.
  'cableHead',
  'gridSource',
  // F10.5 (spec §20.4, D2-7): „M" musi być jednoznacznie odróżnialne od
  // (niemodelowanego) napędu silnikowego aparatu — legenda niesie
  // rozstrzygający wpis (`meter_symbol_disambiguation` (c),
  // `scene/buildScene.ts`), wzorzec adnotacji ES z F10.1 poniżej.
  // Recenzja NO-GO pkt 11: glif niesie literę WIELKOŚCI (A/V) gdy dane są.
  'meter',
];

/**
 * Etykieta PL wpisu legendy dla danego symbolu — z adnotacją rozstrzygającą
 * dla ES/miernika (patrz komentarze niżej). Wyekstrahowane (K12, KARTA_K12):
 * `sheet/projectLegend.ts` (panel „Legenda" na żądanie kanwy v3 + eksport z
 * legendą) reużywa TĘ SAMĄ regułę etykiet, zamiast duplikować przypadki
 * specjalne ES/miernika.
 */
export function legendLabelForSymbol(id: SymbolId): string {
  // F10.1 (spec §18.1, DEC-1): blokada logiczna uziemnika (zakaz
  // zamknięcia ES na tor pod napięciem) = adnotacja KONWENCYJNA —
  // konwencja dotyczy każdego ES jednakowo, więc jej miejscem jest
  // LEGENDA arkusza (powtarzanie 120× przy każdym symbolu to szum
  // graficzny i źródło kolizji — zweryfikowane wyroczniami; decyzja
  // nadzorcy F10.1). F10.5 (spec §20.4): TEN SAM wzorzec dla miernika —
  // legenda rozstrzyga jednoznaczność „M" (nie napęd silnikowy).
  if (id === 'earthSwitch') return `${SYMBOL_DEFS[id].labelPl} (blokada zamkn. na tor pod napięciem)`;
  if (id === 'meter') {
    // Recenzja NO-GO 2026-07-17 pkt 11: „M" mylące — glif niesie literę
    // mierzonej wielkości (A prąd z CT / V napięcie z VT), legenda to
    // rozstrzyga (nie napęd silnikowy — F10.5 §20.4 zostaje w mocy).
    return 'Miernik — litera = wielkość (A prąd / V napięcie); nie napęd silnikowy';
  }
  return SYMBOL_DEFS[id].labelPl;
}

export function buildDefaultLegend(): readonly SheetLegendEntry[] {
  const symbolEntries: SheetLegendEntry[] = DEFAULT_SYMBOL_LEGEND_IDS.map((id) => ({
    kind: 'symbol',
    id,
    labelPl: legendLabelForSymbol(id),
  }));
  return [
    ...symbolEntries,
    { kind: 'line', id: 'cable', labelPl: 'Kabel' },
    { kind: 'line', id: 'overhead', labelPl: 'Linia napowietrzna' },
    // Recenzja NO-GO 2026-07-17 pkt 11: słupek końca otwartego (§16-v3,
    // `kind:'openTerminal'`) musi być ODRÓŻNIONY od NO w kluczu rysunku —
    // NO = łącznik otwarty na ISTNIEJĄCYM torze, koniec otwarty = tor się
    // fizycznie kończy (rezerwa/etap budowy).
    { kind: 'line', id: 'openTerminal', labelPl: 'Koniec otwarty (słupek — tor bez kontynuacji; to nie NO)' },
  ];
}

/** Litery kolumn stref (A, B, ..., Z, AA, AB, ... — jak numeracja arkuszy
 *  CAD), deterministyczne, bez zależności od locale. */
function zoneLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export interface SheetFrameProps {
  /** Szerokość obszaru rysunku sieci (świat, px — bez marginesu ramki). */
  readonly width: number;
  /** Wysokość obszaru rysunku sieci (świat, px). */
  readonly height: number;
  /** Etykieta skali (spec §10, np. „1:1000"). */
  readonly scaleLabel: string;
  /** SCHEMAT-10 S1 (V12K-135, macierz LOD §3): nazwa aktywnego poziomu
   *  szczegółu z JEDNEGO słownika (`SCENE_LOD_LABELS_PL`) — pasek statusu
   *  arkusza. Brak = pasek LOD nie renderowany (zgodność wstecz). */
  readonly lodLabel?: string;
  /** Liczba opisów ukrytych przez próg czytelności ekranu (V12K-218, karta R2-B).
   *  Ukrycie MUSI być jawne — projektant, który nie widzi opisów, ma wiedzieć,
   *  że są i jak je odsłonić, zamiast wnioskować, że sieć ich nie ma. 0 lub brak
   *  = komunikat nierenderowany (zero szumu przy normalnym zoomie). */
  readonly hiddenLabelCount?: number;
  /** Slot na title block (K30-38, `SldTitleBlock` z v2) — Frame NIE
   *  duplikuje jego zawartości, tylko pozycjonuje jako blok w rogu arkusza. */
  readonly titleBlock?: ReactNode;
  /** Pozycja lewego-górnego rogu title blocka WZGLĘDEM obszaru rysunku
   *  (domyślnie: prawy-dolny róg, przy założeniu typowego footprintu K30-38
   *  360×220 — dokładne wymiary zależą od treści danych OSD, więc wołający
   *  może nadpisać). */
  readonly titleBlockOrigin?: { readonly x: number; readonly y: number };
  /** Legenda — domyślnie ≥6 glifów symboli + 2 typy linii (spec §2). */
  readonly legend?: readonly SheetLegendEntry[];
  /** Treść widoku sieci (SceneGraph symboli/tras/etykiet z F5/F6). */
  readonly children?: ReactNode;
}

const LEGEND_GLYPH_COLUMN_WIDTH = 40;
const LEGEND_ORIGIN = { x: GRID, y: GRID };
/** Wysokość wiersza minimalna (dotychczasowa stała — zachowana dla
 *  najmniejszych glifów, np. `breaker`/`noPoint` 16px) oraz odstęp pionowy
 *  MIĘDZY wierszami (spec P1: przestrzeń wiersza nie może być węższa niż
 *  wymaga treść — glif WYŻSZY niż 24px, np. `fuseSwitch` 32px lub
 *  `transformer2W` 40px, dotąd nadpisywał wiersz NIŻEJ, patrz D1/k5a). */
const LEGEND_ROW_MIN_HEIGHT = 24;
const LEGEND_ROW_PADDING = 8;
/** Wysokość próbki linii legendy (kabel/linia napowietrzna) — brak symbolu
 *  IEC, tylko odcinek, więc wysokość porównywalna z najmniejszym glifem. */
const LEGEND_LINE_SAMPLE_HEIGHT = 16;

export interface LegendRowLayout {
  readonly entry: SheetLegendEntry;
  readonly y: number;
  readonly height: number;
}

function legendEntryContentHeight(entry: SheetLegendEntry): number {
  // `note` (V12K-223) nie ma glifu — jego wysokość to wiersz pisma, nie próbka
  // symbolu; bez tego rozgałęzienia `SYMBOL_DEFS[id]` byłby `undefined` i layout
  // wierszy sypałby się na NaN.
  if (entry.kind === 'note') return labelLineHeight('t3');
  return entry.kind === 'symbol' ? SYMBOL_DEFS[entry.id as SymbolId].height : LEGEND_LINE_SAMPLE_HEIGHT;
}

/**
 * Layout wierszy legendy jako prefix-sum wysokości TREŚCI (nie stały krok) —
 * czysta funkcja, eksportowana dla testu geometrii (D1/k5a: „prostokąty
 * wierszy legendy rozłączne — policz z geometrii, nie snapshot"). Każdy
 * wiersz rezerwuje `max(LEGEND_ROW_MIN_HEIGHT, treść + padding)`, więc glif
 * WYŻSZY niż domyślne 24px (fuseSwitch/transformer2W) nie wchodzi w wiersz
 * następny — kolejny wiersz zaczyna się DOKŁADNIE po końcu poprzedniego.
 */
export function computeLegendRowLayout(entries: readonly SheetLegendEntry[]): readonly LegendRowLayout[] {
  const rows: LegendRowLayout[] = [];
  let y = 0;
  for (const entry of entries) {
    const height = Math.max(LEGEND_ROW_MIN_HEIGHT, legendEntryContentHeight(entry) + LEGEND_ROW_PADDING);
    rows.push({ entry, y, height });
    y += height;
  }
  return rows;
}

function LegendLineSample(props: { readonly id: string; readonly centerY: number }): JSX.Element {
  const dash = props.id === 'overhead' ? '6 3 1 3' : undefined;
  if (props.id === 'openTerminal') {
    // Recenzja NO-GO 2026-07-17 pkt 11: próbka „koniec otwarty" = odcinek
    // toru zakończony PROSTOPADŁYM słupkiem (ta sama geometria co
    // `emitOpenTerminalTick`, scene/buildScene.ts §16-v3) — bez niej wpis
    // legendy nie odpowiadałby glifowi na rysunku.
    return (
      <g data-testid={`sld-sheet-legend-line-${props.id}`} data-parity-key={`legend-line-${props.id}`}>
        <line x1={0} y1={props.centerY} x2={22} y2={props.centerY} stroke={SHEET_STROKE} strokeWidth={1.6} />
        <line x1={22} y1={props.centerY - 6} x2={22} y2={props.centerY + 6} stroke={SHEET_STROKE} strokeWidth={1.6} />
      </g>
    );
  }
  return (
    <line
      data-testid={`sld-sheet-legend-line-${props.id}`}
      data-parity-key={`legend-line-${props.id}`}
      x1={0}
      y1={props.centerY}
      x2={28}
      y2={props.centerY}
      stroke={SHEET_STROKE}
      strokeWidth={1.6}
      strokeDasharray={dash}
    />
  );
}

/**
 * Eksportowane (K12, KARTA_K12): reużywane WPROST przez tor eksportu SVG
 * (`SldCanvasV3Workspace.handleExportSvg`, opcja „Dołącz legendę") — markup
 * legendy dla eksportu jest renderowany TĄ SAMĄ funkcją (`renderToStatic
 * Markup`), zero duplikacji rysunku glifów/próbek linii między kanwą
 * ekranową (gdzie legenda dziś NIE jest częścią sceny — `SheetFrame` wołany
 * z `legend={[]}`) a plikiem eksportu.
 */
export function SheetLegend(props: {
  readonly entries: readonly SheetLegendEntry[];
  readonly sheetHeight: number;
}): JSX.Element {
  const rows = computeLegendRowLayout(props.entries);
  // D1b (F6c): legenda w DOLNYM-lewym rogu arkusza, nie górnym — górny-lewy
  // róg zajmuje GPZ (scena zaczyna się w originie arkusza; sekcja WN i
  // etykieta „Sekcja 1 · …" lądowały POD legendą — kolizja strefy ramki z
  // treścią, potwierdzona renderem F6c). Dolny-lewy jest wolny na układzie
  // grzebieniowym (laterale schodzą schodkowo W PRAWO); REZERWACJA strefy
  // legendy względem treści (gwarancja, nie heurystyka) = zakres F6d.
  const legendHeight = rows.length > 0 ? rows[rows.length - 1].y + rows[rows.length - 1].height : 0;
  const originY = Math.max(LEGEND_ORIGIN.y, props.sheetHeight - legendHeight - LEGEND_ORIGIN.y);
  return (
    <g
      data-testid="sld-sheet-legend"
      data-parity-key="sheet-legend"
      transform={`translate(${LEGEND_ORIGIN.x}, ${originY})`}
    >
      {rows.map(({ entry, y, height }) => {
        const Glyph = entry.kind === 'symbol' ? SYMBOL_GLYPHS[entry.id as SymbolId] : undefined;
        const centerY = y + height / 2;
        const glyphY = Glyph ? y + (height - SYMBOL_DEFS[entry.id as SymbolId].height) / 2 : y;
        return (
          <g key={entry.id} data-testid={`sld-sheet-legend-item-${entry.id}`} data-parity-key={`legend-item-${entry.id}`}>
            {entry.kind === 'note' ? null : Glyph ? (
              <Glyph x={4} y={glyphY} />
            ) : (
              <LegendLineSample id={entry.id} centerY={centerY} />
            )}
            <text
              data-parity-key={`legend-label-${entry.id}`}
              x={entry.kind === 'note' ? 4 : LEGEND_GLYPH_COLUMN_WIDTH}
              y={centerY}
              dominantBaseline="middle"
              fontFamily="sans-serif"
              fontSize={LABEL_TYPOGRAPHY.t3.fontSize}
              fontWeight={LABEL_TYPOGRAPHY.t3.fontWeight}
              fill={SHEET_STROKE}
            >
              {entry.labelPl}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ZoneMarkers(props: { readonly width: number; readonly height: number }): JSX.Element {
  const colCount = Math.max(1, Math.ceil(props.width / ZONE_STEP));
  const rowCount = Math.max(1, Math.ceil(props.height / ZONE_STEP));
  const cols = Array.from({ length: colCount }, (_, i) => i);
  const rows = Array.from({ length: rowCount }, (_, i) => i);

  return (
    <g data-testid="sld-sheet-zone-markers" data-parity-key="sheet-zone-markers">
      {cols.map((i) => {
        const xCenter = Math.min(i * ZONE_STEP + ZONE_STEP / 2, props.width);
        return (
          <text
            key={`col-${i}`}
            data-testid={`sld-sheet-zone-col-${i + 1}`}
            data-parity-key={`sheet-zone-col-${i + 1}`}
            x={xCenter}
            y={-10}
            textAnchor="middle"
            fontFamily="sans-serif"
            fontSize={LABEL_TYPOGRAPHY.t1.fontSize}
            fontWeight={LABEL_TYPOGRAPHY.t1.fontWeight}
            fill={SHEET_STROKE}
          >
            {i + 1}
          </text>
        );
      })}
      {rows.map((i) => {
        const yCenter = Math.min(i * ZONE_STEP + ZONE_STEP / 2, props.height);
        const letter = zoneLetter(i);
        return (
          <text
            key={`row-${i}`}
            data-testid={`sld-sheet-zone-row-${letter}`}
            data-parity-key={`sheet-zone-row-${letter}`}
            x={-16}
            y={yCenter}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="sans-serif"
            fontSize={LABEL_TYPOGRAPHY.t1.fontSize}
            fontWeight={LABEL_TYPOGRAPHY.t1.fontWeight}
            fill={SHEET_STROKE}
          >
            {letter}
          </text>
        );
      })}
      {/* Znaczniki podziału (tick marks) co ZONE_STEP na krawędziach ramki. */}
      {cols.slice(1).map((i) => (
        <line
          key={`col-tick-top-${i}`}
          data-parity-key={`sheet-zone-tick-col-${i}`}
          x1={i * ZONE_STEP}
          y1={0}
          x2={i * ZONE_STEP}
          y2={-6}
          stroke={SHEET_STROKE}
          strokeWidth={1}
        />
      ))}
      {rows.slice(1).map((i) => (
        <line
          key={`row-tick-left-${i}`}
          data-parity-key={`sheet-zone-tick-row-${i}`}
          x1={0}
          y1={i * ZONE_STEP}
          x2={-6}
          y2={i * ZONE_STEP}
          stroke={SHEET_STROKE}
          strokeWidth={1}
        />
      ))}
    </g>
  );
}

/** Footprint domyślny title blocka K30-38 (`SldTitleBlock` w v2) — przybliżony
 *  (szerokość jest stała 360px w v2; wysokość zależy od treści danych OSD,
 *  więc przyjmujemy typowy rozmiar dla domyślnego pozycjonowania — wołający
 *  z realnymi danymi OSD powinien nadpisać `titleBlockOrigin`). */
const DEFAULT_TITLE_BLOCK_FOOTPRINT = { width: 360, height: 220 };

/**
 * Rama arkusza widoku sieci (spec §2/§10): ramka + strefy referencyjne co
 * 400px + etykieta skali + legenda. Czysty SVG — zero fizyki, zero
 * mutacji modelu, zero DOM-measure (rozmiary arkusza są WEJŚCIEM, nie
 * wynikiem pomiaru DOM).
 */
export function SheetFrame(props: SheetFrameProps): JSX.Element {
  const { width, height, scaleLabel, lodLabel, hiddenLabelCount, titleBlock, children } = props;
  const legend = props.legend ?? buildDefaultLegend();
  const titleBlockOrigin = props.titleBlockOrigin ?? {
    x: Math.max(width - DEFAULT_TITLE_BLOCK_FOOTPRINT.width, 0),
    y: Math.max(height - DEFAULT_TITLE_BLOCK_FOOTPRINT.height, 0),
  };

  const svgWidth = width + FRAME_MARGIN * 2;
  const svgHeight = height + FRAME_MARGIN * 2;

  return (
    <svg
      data-testid="sld-sheet-frame"
      data-parity-key="sheet-frame"
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      style={{ background: SHEET_BACKGROUND }}
    >
      <g data-testid="sld-sheet-drawing-area" data-parity-key="sheet-drawing-area" transform={`translate(${FRAME_MARGIN}, ${FRAME_MARGIN})`}>
        <rect
          data-testid="sld-sheet-border"
          data-parity-key="sheet-border"
          x={0}
          y={0}
          width={width}
          height={height}
          fill="none"
          stroke={SHEET_STROKE}
          strokeWidth={1.5}
        />
        <ZoneMarkers width={width} height={height} />
        <text
          data-testid="sld-sheet-scale-label"
          data-parity-key="sheet-scale-label"
          x={width}
          y={height + 20}
          textAnchor="end"
          fontFamily="sans-serif"
          fontSize={LABEL_TYPOGRAPHY.t2.fontSize}
          fontWeight={LABEL_TYPOGRAPHY.t2.fontWeight}
          fill={SHEET_STROKE}
        >
          {`Skala ${scaleLabel}`}
        </text>
        {lodLabel ? (
          <text
            data-testid="sld-sheet-lod-label"
            data-parity-key="sheet-lod-label"
            x={0}
            y={height + 20}
            textAnchor="start"
            fontFamily="sans-serif"
            fontSize={LABEL_TYPOGRAPHY.t2.fontSize}
            fontWeight={LABEL_TYPOGRAPHY.t2.fontWeight}
            fill={SHEET_STROKE}
          >
            {`Widok: ${lodLabel}`}
          </text>
        ) : null}
        {hiddenLabelCount != null && hiddenLabelCount > 0 ? (
          <text
            data-testid="sld-sheet-hidden-labels"
            data-parity-key="sheet-hidden-labels"
            data-hidden-count={hiddenLabelCount}
            x={width}
            y={height + 20}
            textAnchor="end"
            fontFamily="sans-serif"
            fontSize={LABEL_TYPOGRAPHY.t2.fontSize}
            fontWeight={LABEL_TYPOGRAPHY.t2.fontWeight}
            fill={SHEET_STROKE}
          >
            {`Ukryto ${hiddenLabelCount} ${hiddenLabelCount === 1 ? 'opis' : 'opisów'} — przybliż, aby zobaczyć`}
          </text>
        ) : null}
        {/* K12 (KARTA_K12, dyrektywa właściciela 2026-07-30): legenda NIE jest
         *  już domyślną treścią arkusza — `legend` puste (wołający, `SldCanvasV3`,
         *  przekazuje `[]` na kanwie ekranowej) renderuje ZERO grupy w DOM
         *  (nie tylko pustą grupę), żeby nieobecność była jednoznaczna dla
         *  wyroczni/testów DOM. Wołający z realną treścią (eksport z opcją
         *  „Dołącz legendę", panel na żądanie przez `SheetLegend` eksportowany
         *  wyżej, oraz WŁASNE testy `SheetFrame` bez propa `legend` — fallback
         *  `buildDefaultLegend()`) dostają grupę jak dotąd. */}
        {legend.length > 0 && <SheetLegend entries={legend} sheetHeight={height} />}
        <g data-testid="sld-sheet-content" data-parity-key="sheet-content">
          {children}
        </g>
        {titleBlock ? (
          <g
            data-testid="sld-sheet-title-block-slot"
            data-parity-key="sheet-title-block-slot"
            transform={`translate(${titleBlockOrigin.x}, ${titleBlockOrigin.y})`}
          >
            {titleBlock}
          </g>
        ) : null}
      </g>
    </svg>
  );
}
