/**
 * S9-6 (audyt E-3 „Eksport SVG nie ma tytułówki") — TABLICZKA RYSUNKOWA
 * arkusza eksportu.
 *
 * Rysunek bez metryki nie jest dokumentem projektowym (PN-EN ISO 7200 wymaga
 * m.in. tytułu, formatu arkusza, skali i daty). Arkusz v3 miał na to gotowe
 * miejsce — `SheetFrame` przyjmuje slot `titleBlock` — ale NIKT go nie
 * wypełniał, a jedyny istniejący komponent metryki (`v2/canvas/SldTitleBlock.
 * tsx`) NIE nadaje się do reużycia w tym torze z dwóch mierzalnych powodów:
 *  1. FABRYKACJA — jego `DEFAULTS` podstawiają dane, których w projekcie nie
 *     ma („Sieć: K30 (30 stacji)", „GPZ-A 110/15 kV", „Operator OSD: ENEA"),
 *     więc pusty projekt dostałby cudzą metrykę. Karta S9-6 wymaga wprost
 *     odwrotnego zachowania: brak danej = puste pole z etykietą.
 *  2. Kolory ZASZYTE na ciemno (`#0A0E14` tło, `#DDF7FF` tekst) — w arkuszu
 *     dokumentowym (białym) byłby to czarny prostokąt; ten moduł bierze tusz
 *     z palety kontekstu (`useSldPalette`), jak `SheetLegend`, więc podmiana
 *     na paletę dokumentową (`exportPalette.ts`) obejmuje go tak samo jak
 *     resztę rysunku.
 *
 * ZERO FIZYKI, ZERO LICZENIA: moduł WYŁĄCZNIE formatuje dane, które dostał
 * (nazwy z powłoki, nagłówek migawki ENM, licznik stacji ze sceny). Nie
 * wywodzi napięć, mocy ani skali z geometrii.
 *
 * SKALA: schemat jednokreskowy jest z definicji rysunkiem BEZ SKALI (geometria
 * jest schematyczna, nie odwzorowuje odległości terenowych), więc pole „Skala"
 * mówi to wprost zamiast podawać wymyśloną wartość w rodzaju „1:1000" (którą
 * wpisywał `SldTitleBlock` v2 jako `DEFAULTS.scale`).
 */
import { LABEL_TYPOGRAPHY, labelLineHeight, liczbaRysunkuPl, measureTextWidth } from '../core/text';
import { GRID } from '../core/grid';
import { useSldPalette } from '../theme/palette';

/** Znak „brak danej" — TEN SAM co w pasku stanu powłoki (`shortHash`,
 *  `app-state/useEnmHashChain.ts`), żeby brak wyglądał wszędzie tak samo. */
export const BRAK_DANEJ = '—';

export interface SheetTitleBlockRow {
  readonly labelPl: string;
  /** `null` = danej NIE MA (renderowane jako `BRAK_DANEJ`, pole zostaje). */
  readonly value: string | null;
}

export interface SheetTitleBlockData {
  readonly rows: readonly SheetTitleBlockRow[];
}

export interface SheetTitleBlockInput {
  /** `useAppStateStore.activeProjectName`. */
  readonly projectName?: string | null;
  /** `useAppStateStore.activeCaseName` — przypadek obliczeniowy. */
  readonly caseName?: string | null;
  /** `snapshot.header.name` — nazwa sieci (modelu). */
  readonly networkName?: string | null;
  /** `snapshot.header.updated_at` (ISO) — data aktualizacji modelu. ŚWIADOMIE
   *  NIE `new Date()`: data wykonania eksportu uzależniłaby bajty pliku od
   *  zegara (złamanie determinizmu), a projektanta interesuje data DANYCH. */
  readonly modelUpdatedAtIso?: string | null;
  /** `snapshot.header.revision`. */
  readonly modelRevision?: number | null;
  /** `snapshot.header.hash_sha256`. */
  readonly modelHash?: string | null;
  /** `scene.meta.stationCount` — liczba stacji NA RYSUNKU. */
  readonly stationCount: number;
  /** Proporcja kadru arkusza (szerokość/wysokość) — mierzona, nie deklarowana. */
  readonly sheetAspect: number;
  /** Etykieta poziomu szczegółu (`SCENE_LOD_LABELS_PL`). */
  readonly lodLabelPl?: string | null;
}

/** Docelowy format arkusza rysunku — ten sam, w który celuje łamanie arkusza
 *  (`layout/sheetRows.ts`, `SHEET_TARGET_ASPECT = 420/297`, karta S9-1). */
const FORMAT_ARKUSZA_PL = 'A3 poziomy (420 × 297 mm)';

/** Data z ISO → `RRRR-MM-DD` (bez strefy i godziny — metryka rysunku podaje
 *  dzień). Wejście nierozpoznane ⇒ `null` (brak danej), NIGDY „dziś". */
export function dataMetrykiPl(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/** Wersja modelu jako „rew. N · odcisk8" — człony bez danych POMIJANE. */
export function wersjaModeluPl(revision: number | null | undefined, hash: string | null | undefined): string | null {
  const parts: string[] = [];
  if (typeof revision === 'number') parts.push(`rew. ${revision}`);
  if (hash) parts.push(hash.slice(0, 8));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Wiersze tabliczki — czysta funkcja (testowalna bez DOM). Kolejność stała
 * (determinizm bajtów eksportu).
 */
export function buildSheetTitleBlockData(input: SheetTitleBlockInput): SheetTitleBlockData {
  return {
    rows: [
      { labelPl: 'Projekt', value: input.projectName?.trim() ? input.projectName.trim() : null },
      { labelPl: 'Sieć (model)', value: input.networkName?.trim() ? input.networkName.trim() : null },
      { labelPl: 'Przypadek', value: input.caseName?.trim() ? input.caseName.trim() : null },
      { labelPl: 'Data modelu', value: dataMetrykiPl(input.modelUpdatedAtIso) },
      { labelPl: 'Wersja modelu', value: wersjaModeluPl(input.modelRevision, input.modelHash) },
      {
        labelPl: 'Arkusz',
        value: `${FORMAT_ARKUSZA_PL} · proporcja ${liczbaRysunkuPl(Math.round(input.sheetAspect * 100) / 100)} : 1`,
      },
      { labelPl: 'Skala', value: 'bez skali — schemat jednokreskowy' },
      { labelPl: 'Liczba stacji', value: String(input.stationCount) },
      { labelPl: 'Poziom szczegółu', value: input.lodLabelPl?.trim() ? input.lodLabelPl.trim() : null },
    ],
  };
}

const ROW_HEIGHT = labelLineHeight('t3') + 6;
const PADDING = 8;
const TITLE_HEIGHT = labelLineHeight('t2') + 8;
const LABEL_COLUMN_WIDTH = 132;
/** Nagłówek tabliczki — nazwa rysunku, nie nazwa produktu (zero kodenamów). */
const TYTUL_PL = 'SCHEMAT JEDNOKRESKOWY SIECI SN';

/** Wymiary tabliczki liczone z TREŚCI (ta sama metoda pomiaru tekstu co
 *  reszta arkusza — `measureTextWidth`, `core/text.ts`), więc dłuższa nazwa
 *  projektu poszerza ramkę zamiast wychodzić poza nią. */
export function sheetTitleBlockSize(data: SheetTitleBlockData): { readonly width: number; readonly height: number } {
  const valueWidth = data.rows.reduce(
    (max, row) => Math.max(max, measureTextWidth(row.value ?? BRAK_DANEJ, LABEL_TYPOGRAPHY.t3.fontSize)),
    0,
  );
  const titleWidth = measureTextWidth(TYTUL_PL, LABEL_TYPOGRAPHY.t2.fontSize);
  const width = Math.max(LABEL_COLUMN_WIDTH + valueWidth + PADDING * 2, titleWidth + PADDING * 2);
  const height = TITLE_HEIGHT + data.rows.length * ROW_HEIGHT + PADDING;
  return { width, height };
}

/**
 * Tabliczka rysunkowa — czysty SVG (jak `SheetLegend`), pozycjonuje się sama
 * w PRAWYM-DOLNYM rogu obszaru rysunku (legenda zajmuje lewy-dolny, patrz
 * `sheet/Frame.tsx::SheetLegend`).
 */
export function SheetTitleBlock(props: {
  readonly data: SheetTitleBlockData;
  readonly sheetWidth: number;
  readonly sheetHeight: number;
}): JSX.Element {
  const palette = useSldPalette();
  const size = sheetTitleBlockSize(props.data);
  const originX = Math.max(GRID, props.sheetWidth - size.width - GRID);
  const originY = Math.max(GRID, props.sheetHeight - size.height - GRID);

  return (
    <g
      data-testid="sld-sheet-title-block"
      data-parity-key="sheet-title-block"
      transform={`translate(${originX}, ${originY})`}
    >
      <rect
        x={0}
        y={0}
        width={size.width}
        height={size.height}
        fill={palette.canvasBackground}
        stroke={palette.baseStroke}
        strokeWidth={1.5}
      />
      <line x1={0} y1={TITLE_HEIGHT} x2={size.width} y2={TITLE_HEIGHT} stroke={palette.baseStroke} strokeWidth={1} />
      <text
        data-testid="sld-sheet-title-block-title"
        x={PADDING}
        y={TITLE_HEIGHT - 8}
        fontFamily="sans-serif"
        fontSize={LABEL_TYPOGRAPHY.t2.fontSize}
        fontWeight={700}
        fill={palette.baseStroke}
      >
        {TYTUL_PL}
      </text>
      {props.data.rows.map((row, index) => {
        const y = TITLE_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT - 6;
        return (
          <g key={row.labelPl} data-testid={`sld-sheet-title-block-row-${index}`} data-parity-key={`title-block-row-${index}`}>
            <text
              x={PADDING}
              y={y}
              fontFamily="sans-serif"
              fontSize={LABEL_TYPOGRAPHY.t3.fontSize}
              fontWeight={LABEL_TYPOGRAPHY.t3.fontWeight}
              fill={palette.baseStroke}
            >
              {`${row.labelPl}:`}
            </text>
            <text
              data-testid={`sld-sheet-title-block-value-${index}`}
              data-brak-danej={row.value === null ? 'true' : undefined}
              x={LABEL_COLUMN_WIDTH}
              y={y}
              fontFamily="sans-serif"
              fontSize={LABEL_TYPOGRAPHY.t3.fontSize}
              fontWeight={LABEL_TYPOGRAPHY.t3.fontWeight}
              fill={palette.baseStroke}
            >
              {row.value ?? BRAK_DANEJ}
            </text>
          </g>
        );
      })}
    </g>
  );
}
