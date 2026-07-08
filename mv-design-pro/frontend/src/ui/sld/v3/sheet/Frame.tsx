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
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import { SYMBOL_GLYPHS } from '../symbols/glyphs';

/** Kolor bazowy rysunku w trybie SCADA (spec §2/§6) — nakładki koloru
 *  napięcia/energizacji są zakresem F6, nie ramki arkusza. */
const SHEET_STROKE = '#E8EEF4';
const SHEET_BACKGROUND = '#0B0F14';

/** Strefy referencyjne co 400px (spec §2). */
const ZONE_STEP = 400;
/** Margines ramki na oznaczenia stref (litery/cyfry) NA ZEWNĄTRZ obszaru rysunku. */
const FRAME_MARGIN = 32;

export interface SheetLegendEntry {
  readonly kind: 'symbol' | 'line';
  readonly id: string;
  readonly labelPl: string;
}

/** Domyślna legenda symboli (≥6 glifów, spec §2 "legenda symboli i linii")
 *  + 2 wpisy linii (kabel ciągły / linia napowietrzna kreska-kropka, spec §6). */
const DEFAULT_SYMBOL_LEGEND_IDS: readonly SymbolId[] = [
  'breaker',
  'disconnector',
  'earthSwitch',
  'fuseSwitch',
  'transformer2W',
  'noPoint',
  'currentTransformer',
];

function buildDefaultLegend(): readonly SheetLegendEntry[] {
  const symbolEntries: SheetLegendEntry[] = DEFAULT_SYMBOL_LEGEND_IDS.map((id) => ({
    kind: 'symbol',
    id,
    labelPl: SYMBOL_DEFS[id].labelPl,
  }));
  return [
    ...symbolEntries,
    { kind: 'line', id: 'cable', labelPl: 'Kabel' },
    { kind: 'line', id: 'overhead', labelPl: 'Linia napowietrzna' },
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

const LEGEND_ROW_HEIGHT = 24;
const LEGEND_GLYPH_COLUMN_WIDTH = 40;
const LEGEND_ORIGIN = { x: GRID, y: GRID };

function LegendLineSample(props: { readonly id: string; readonly y: number }): JSX.Element {
  const dash = props.id === 'overhead' ? '6 3 1 3' : undefined;
  return (
    <line
      data-testid={`sld-sheet-legend-line-${props.id}`}
      data-parity-key={`legend-line-${props.id}`}
      x1={0}
      y1={props.y + 8}
      x2={28}
      y2={props.y + 8}
      stroke={SHEET_STROKE}
      strokeWidth={1.6}
      strokeDasharray={dash}
    />
  );
}

function SheetLegend(props: { readonly entries: readonly SheetLegendEntry[] }): JSX.Element {
  return (
    <g
      data-testid="sld-sheet-legend"
      data-parity-key="sheet-legend"
      transform={`translate(${LEGEND_ORIGIN.x}, ${LEGEND_ORIGIN.y})`}
    >
      {props.entries.map((entry, index) => {
        const y = index * LEGEND_ROW_HEIGHT;
        const Glyph = entry.kind === 'symbol' ? SYMBOL_GLYPHS[entry.id as SymbolId] : undefined;
        return (
          <g key={entry.id} data-testid={`sld-sheet-legend-item-${entry.id}`} data-parity-key={`legend-item-${entry.id}`}>
            {Glyph ? <Glyph x={4} y={y} /> : <LegendLineSample id={entry.id} y={y} />}
            <text
              data-parity-key={`legend-label-${entry.id}`}
              x={LEGEND_GLYPH_COLUMN_WIDTH}
              y={y + 13}
              fontFamily="sans-serif"
              fontSize={9}
              fontWeight={700}
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
            fontSize={13}
            fontWeight={700}
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
            fontSize={13}
            fontWeight={700}
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
  const { width, height, scaleLabel, titleBlock, children } = props;
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
          fontSize={11}
          fontWeight={600}
          fill={SHEET_STROKE}
        >
          {`Skala ${scaleLabel}`}
        </text>
        <SheetLegend entries={legend} />
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
