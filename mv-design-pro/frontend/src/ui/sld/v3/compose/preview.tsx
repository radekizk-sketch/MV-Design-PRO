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
import { SYMBOL_GLYPHS, type SwitchState } from '../symbols/glyphs';
import { LABEL_TYPOGRAPHY } from '../core/text';
import type { OwnedLabel } from '../layout/labels';
import type { RouteVertex } from '../layout/route';

/** Rodzaj odcinka → grubość (spec §6). `'bus'` obejmuje WSZYSTKIE szyny
 *  (WN/SN, primary/reserve/ring-closure) — spec nie różnicuje grubości szyn
 *  po napięciu, tylko nakładką koloru (F6, poza zakresem tego harnessu). */
export type PreviewSegmentKind = 'bus' | 'sn' | 'lv' | 'leader';

/** Eksportowane (F6b): `SldCanvasV3` reużywa TĘ SAMĄ hierarchię grubości
 *  (spec §6), zero duplikacji stałych między harnessem debug i kanwą docelową. */
export const SEGMENT_STROKE_WIDTH: Readonly<Record<PreviewSegmentKind, number>> = {
  bus: 4,
  sn: 1.6,
  lv: 1.2,
  leader: 0.8,
};

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

const DEFAULT_BACKGROUND = '#0B0F14';
const DEFAULT_STROKE = '#E8EEF4';

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
  // Uwaga: `data-symbol-canon` jest już zapisywany PRZEZ SAM GLIF
  // (`glyphGroupProps`, `symbols/glyphs.tsx`, F1) — wrapper dopisuje
  // WYŁĄCZNIE meta, którego glif nie znałby (parityKey/testId z compose),
  // żeby nie duplikować atrybutu na dwóch zagnieżdżonych `<g>`.
  return (
    <g data-parity-key={parityKeysOf(symbol.meta)} data-test-id={symbol.meta?.testId}>
      <Glyph x={symbol.x} y={symbol.y} state={symbol.state} stroke={stroke} />
    </g>
  );
}

function PreviewSegmentNode(props: { readonly segment: PreviewSegment; readonly stroke: string }): JSX.Element | null {
  const { segment, stroke } = props;
  if (segment.points.length < 2) return null;
  const kind = segment.meta?.kind ?? 'sn';
  const strokeWidth = SEGMENT_STROKE_WIDTH[kind];
  const strokeDasharray = segment.meta?.dashed ? '4 3' : kind === 'leader' ? '3 2' : undefined;
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
