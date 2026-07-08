/**
 * SLD V3 — label resolver (SLD_CAD_SPEC_V3 §4 "Model etykiet — sloty
 * właściciela" i §5.5 "Label resolve", potok measure → bands → columns →
 * route → label, ostatni krok). Czysta funkcja: wejściem są WYNIKI
 * poprzednich kroków potoku (columns.ts/bands.ts/route.ts — konkretne
 * prostokąty/współrzędne, nie surowe modele domenowe) + teksty właścicieli.
 * Zero DOM-measure/losowości/Date (P7) — pomiar tekstu WYŁĄCZNIE przez
 * `core/text.ts` (ta sama formuła co measure.ts/F2, jedna prawda).
 *
 * DECYZJA WIĄŻĄCA NADZORCY (F4, r7 — patrz plan wdrożenia §F4): slot etykiety
 * segmentu poziomego magistrali jest kotwiczony do PRZĘSŁA (odcinek szyny
 * biegnący MIĘDZY kolumnami sąsiednich stacji), nie do kolumny stacji
 * docelowej (jak sugerowałby powierzchownie `columns.ts`). Slot 1 (idealny):
 * wyśrodkowany na przęśle, w wierszu B1 wskazanym przez stagger (`./segments`
 * `computeSegmentStagger`, F3 r2). Gdy etykieta szersza niż przęsło (fizyczna
 * norma: `COLUMN_GAP` = 3×GRID = 24px << typowa etykieta kabla ~100-160px, a
 * więc PRAWIE ZAWSZE) — slot 2 zapasowy z OBOWIĄZKOWYM leader-line do środka
 * przęsła.
 *
 * DECYZJA (luka spec, slot zapasowy = "wolny wiersz B1"): spec §4 mówi
 * "3: pasmo marginesu + leader" dla slotu zapasowego segmentu, ale F3 (r7)
 * zauważa, że `columns.ts` JUŻ rezerwuje w B1, w kolumnie stacji docelowej,
 * dokładnie tyle miejsca ile potrzebuje etykieta segmentu (spec §5.3:
 * `width_j = max(blok stacji, etykieta segmentu wejściowego)`) — w wierszu ze
 * staggera. Ten prostokąt (`SegmentLabelSlotResult.rect` z `columns.ts`) JEST
 * więc gotowym, z KONSTRUKCJI wolnym od kolizji "wolnym wierszem B1" — użyto
 * go jako slot zapasowy zamiast wynajdywać nowe pasmo marginesu. Unika to
 * duplikacji rezerwacji miejsca (P1) i jest spójne z resztą potoku: TA SAMA
 * geometria, którą measure/columns policzyły pod kątem "gdzie zmieści się
 * etykieta segmentu", jest tu użyta jako miejsce, w którym faktycznie ląduje
 * etykieta (z leaderem wskazującym na przęsło, do którego elektrycznie
 * należy).
 */

import { GRID, rectsOverlap, snapToGrid, type V3Rect } from '../core/grid';
import { labelLineHeight, measureLabelWidth, type LabelClass } from '../core/text';

/** Właściciel etykiety (spec §4, tabela slotów). */
export type OwnerKind =
  | 'segment-span'      // segment magistrali poziomy (kotwiczony do przęsła, r7)
  | 'segment-lateral'    // segment pionowy (lateral), etykieta rotowana 90°
  | 'station-name'       // wiersz pasma nazw stacji (B5)
  | 'port-caption'       // podpis kierunku pola (t3, spec §9: „kier. Sxx"/„odg. Sxx")
  | 'apparatus'          // oznacznik aparatu (Q0/Q1/T1, t3)
  | 'der'                // rodzaj+moc DER (t2) pod symbolem
  | 'busbar-voltage'     // napięcie szyny (t2) nad lewym końcem
  | 'no-point';          // badge „NO" (t3) przy symbolu

export interface LabelPoint {
  readonly x: number;
  readonly y: number;
}

/** Wynikowa etykieta z właścicielem, slotem i (gdy zapasowy) leader-line
 *  (spec §4 P2: „Przeniesienie do slotu zapasowego ⇒ obowiązkowy leader-line"). */
export interface OwnedLabel {
  readonly ownerRef: string;
  readonly ownerKind: OwnerKind;
  readonly labelClass: LabelClass;
  readonly text: string;
  /** 1 = idealny (bez leadera), 2/3 = zapasowy (leader OBOWIĄZKOWY). */
  readonly slotIndex: 1 | 2 | 3;
  readonly rect: V3Rect;
  /** Segment pionowy (lateral): etykieta czytana z dołu, obrócona 90°. */
  readonly rotated?: boolean;
  readonly leader?: { readonly from: LabelPoint; readonly to: LabelPoint };
}

// ---------------------------------------------------------------------------
// Segment poziomy magistrali — kotwiczenie do PRZĘSŁA (r7).
// ---------------------------------------------------------------------------

export interface SegmentSpanOwnerInput {
  readonly ownerRef: string;
  readonly text: string;
  /** Prawa krawędź kolumny j-1 (lub krawędź bloku GPZ dla pierwszego segmentu). */
  readonly spanStart: number;
  /** Lewa krawędź kolumny j (stacji, do której wchodzi segment). */
  readonly spanEnd: number;
  /** Y osi magistrali (B2) — cel leadera w pionie, gdy slot zapasowy. */
  readonly busAxisY: number;
  /** Prostokąt zarezerwowany przez `columns.ts` (`SegmentLabelSlotResult.rect`)
   *  w kolumnie stacji docelowej, w wierszu wskazanym przez stagger — z
   *  KONSTRUKCJI wolny od kolizji i wystarczająco szeroki (patrz DECYZJA w
   *  nagłówku pliku). Dostarcza Y/wysokość wiersza (slot 1) ORAZ pełni rolę
   *  slotu zapasowego (slot 2), gdy etykieta nie mieści się na przęśle. */
  readonly fallbackRect: V3Rect;
}

function resolveSegmentSpanLabel(owner: SegmentSpanOwnerInput): OwnedLabel {
  const labelClass: LabelClass = 't2';
  const labelWidth = measureLabelWidth(owner.text, labelClass);
  const spanWidth = owner.spanEnd - owner.spanStart;
  const spanCenterX = (owner.spanStart + owner.spanEnd) / 2;
  const fitsSpan = spanWidth > 0 && labelWidth <= spanWidth;

  if (fitsSpan) {
    const x = snapToGrid(spanCenterX - labelWidth / 2);
    return {
      ownerRef: owner.ownerRef,
      ownerKind: 'segment-span',
      labelClass,
      text: owner.text,
      slotIndex: 1,
      rect: { x, y: owner.fallbackRect.y, width: labelWidth, height: owner.fallbackRect.height },
    };
  }

  return {
    ownerRef: owner.ownerRef,
    ownerKind: 'segment-span',
    labelClass,
    text: owner.text,
    slotIndex: 2,
    rect: owner.fallbackRect,
    leader: {
      from: {
        x: owner.fallbackRect.x + owner.fallbackRect.width / 2,
        y: owner.fallbackRect.y + owner.fallbackRect.height,
      },
      to: { x: spanCenterX, y: owner.busAxisY },
    },
  };
}

// ---------------------------------------------------------------------------
// Segment pionowy (lateral) — spec §4: slot 1 PO LEWEJ linii, slot 2 PO
// PRAWEJ, slot 3 margines + leader. Etykieta rotowana 90°, czytana z dołu —
// więc jej "szerokość" (measureLabelWidth) zajmuje przestrzeń PIONOWĄ wzdłuż
// linii, a wysokość wiersza (labelLineHeight) przestrzeń POZIOMĄ (grubość
// bloku tekstu odsuniętą od linii).
// ---------------------------------------------------------------------------

export interface SegmentLateralOwnerInput {
  readonly ownerRef: string;
  readonly text: string;
  readonly lineX: number;
  readonly lineYStart: number;
  readonly lineYEnd: number;
  /** Dostępny prześwit PO LEWEJ linii (do sąsiedniej przeszkody/korytarza).
   *  Brak = brak ograniczenia (`Infinity`). */
  readonly leftClearance?: number;
  /** Dostępny prześwit PO PRAWEJ linii. Brak = brak ograniczenia. */
  readonly rightClearance?: number;
  /** Slot 3 (margines + leader) — WYMAGANY, gdy ani lewo, ani prawo się nie
   *  mieszczą (funkcja rzuca, gdy potrzebny, a nieobecny — wołający musi
   *  policzyć margines korytarza z layoutu, tak jak `columns.ts` dla segmentu
   *  poziomego). */
  readonly fallbackRect?: V3Rect;
}

function resolveSegmentLateralLabel(owner: SegmentLateralOwnerInput): OwnedLabel {
  const labelClass: LabelClass = 't2';
  const alongLine = measureLabelWidth(owner.text, labelClass); // rozciągłość WZDŁUŻ linii (po rotacji)
  const acrossLine = labelLineHeight(labelClass); // grubość bloku tekstu PROSTOPADLE do linii
  const lineLength = Math.abs(owner.lineYEnd - owner.lineYStart);
  const centerY = (owner.lineYStart + owner.lineYEnd) / 2;
  const fitsLength = alongLine <= lineLength;

  const leftClearance = owner.leftClearance ?? Infinity;
  const rightClearance = owner.rightClearance ?? Infinity;
  const required = acrossLine + GRID; // prześwit GRID między tekstem a linią

  if (fitsLength && leftClearance >= required) {
    const x = snapToGrid(owner.lineX - GRID - acrossLine);
    return {
      ownerRef: owner.ownerRef,
      ownerKind: 'segment-lateral',
      labelClass,
      text: owner.text,
      slotIndex: 1,
      rotated: true,
      rect: { x, y: centerY - alongLine / 2, width: acrossLine, height: alongLine },
    };
  }

  if (fitsLength && rightClearance >= required) {
    const x = snapToGrid(owner.lineX + GRID);
    return {
      ownerRef: owner.ownerRef,
      ownerKind: 'segment-lateral',
      labelClass,
      text: owner.text,
      slotIndex: 2,
      rotated: true,
      rect: { x, y: centerY - alongLine / 2, width: acrossLine, height: alongLine },
    };
  }

  if (!owner.fallbackRect) {
    throw new Error(
      `Lateral „${owner.ownerRef}": etykieta nie mieści się ani po lewej, ani po prawej linii, a fallbackRect (slot 3, spec §4) nie został dostarczony.`,
    );
  }
  return {
    ownerRef: owner.ownerRef,
    ownerKind: 'segment-lateral',
    labelClass,
    text: owner.text,
    slotIndex: 3,
    rotated: true,
    rect: owner.fallbackRect,
    leader: {
      from: {
        x: owner.fallbackRect.x + owner.fallbackRect.width / 2,
        y: owner.fallbackRect.y + owner.fallbackRect.height / 2,
      },
      to: { x: owner.lineX, y: centerY },
    },
  };
}

// ---------------------------------------------------------------------------
// Pasmo nazw stacji (B5, spec §4: „kolejność pionowa stała"). Wiersze
// dostarczone przez wołającego JUŻ w kolejności i TYLKO obecne (ta sama
// zasada co `measure.ts` `stationNameBandHeight` — pusty wiersz nie rezerwuje
// miejsca na nic, więc go tu po prostu nie ma na wejściu).
// ---------------------------------------------------------------------------

export interface StationNameBandRow {
  readonly text: string;
  readonly labelClass: LabelClass;
}

export interface StationNameBandOwnerInput {
  readonly ownerRef: string;
  /** Slot pasma nazw (B5) spod tej stacji — `ColumnResult.nameSlot` z `columns.ts`. */
  readonly nameSlot: V3Rect;
  readonly rows: readonly StationNameBandRow[];
}

function resolveStationNameBand(owner: StationNameBandOwnerInput): OwnedLabel[] {
  let y = owner.nameSlot.y;
  return owner.rows.map((row, index) => {
    const height = labelLineHeight(row.labelClass);
    const label: OwnedLabel = {
      ownerRef: `${owner.ownerRef}#name-row-${index}`,
      ownerKind: 'station-name',
      labelClass: row.labelClass,
      text: row.text,
      slotIndex: 1,
      rect: { x: owner.nameSlot.x, y, width: owner.nameSlot.width, height },
    };
    y += height;
    return label;
  });
}

// ---------------------------------------------------------------------------
// Podpis kierunku pola (spec §9/§4): slot 1 nad portem (własny wycinek B2
// zarezerwowany dla tego pola), slot 2 obok z leaderem.
// ---------------------------------------------------------------------------

export interface PortCaptionOwnerInput {
  readonly ownerRef: string;
  /** „kier. S03" / „odg. S15" (spec §9) — tekst gotowy, bez formatowania tu. */
  readonly text: string;
  /** Pozycja portu (środek wycinka pola) w świecie. */
  readonly anchorX: number;
  /** Własny wycinek B2 zarezerwowany dla tego pola (nie nachodzi na sąsiednie
   *  pola tej samej stacji — odpowiedzialność wołającego, analogicznie do
   *  rezerwacji `bayColumnRequiredWidth` w `measure.ts`). */
  readonly primaryRect: V3Rect;
  /** Slot 2 (obok, z leaderem) — wymagany, gdy podpis nie mieści się w `primaryRect`. */
  readonly fallbackRect?: V3Rect;
}

function resolvePortCaption(owner: PortCaptionOwnerInput): OwnedLabel {
  const labelClass: LabelClass = 't3';
  const labelWidth = measureLabelWidth(owner.text, labelClass);
  const fitsPrimary = labelWidth <= owner.primaryRect.width;

  if (fitsPrimary) {
    const rawX = snapToGrid(owner.anchorX - labelWidth / 2);
    const maxX = owner.primaryRect.x + owner.primaryRect.width - labelWidth;
    const x = Math.min(Math.max(rawX, owner.primaryRect.x), Math.max(maxX, owner.primaryRect.x));
    return {
      ownerRef: owner.ownerRef,
      ownerKind: 'port-caption',
      labelClass,
      text: owner.text,
      slotIndex: 1,
      rect: { x, y: owner.primaryRect.y, width: labelWidth, height: owner.primaryRect.height },
    };
  }

  if (!owner.fallbackRect) {
    throw new Error(
      `Podpis portu „${owner.ownerRef}": nie mieści się w primaryRect, a fallbackRect (slot 2, spec §4) nie został dostarczony.`,
    );
  }
  return {
    ownerRef: owner.ownerRef,
    ownerKind: 'port-caption',
    labelClass,
    text: owner.text,
    slotIndex: 2,
    rect: owner.fallbackRect,
    leader: {
      from: {
        x: owner.fallbackRect.x + owner.fallbackRect.width / 2,
        y: owner.fallbackRect.y + owner.fallbackRect.height / 2,
      },
      to: { x: owner.anchorX, y: owner.primaryRect.y + owner.primaryRect.height },
    },
  };
}

// ---------------------------------------------------------------------------
// Etykiety z JEDNYM slotem wg tabeli §4 (bez alternatywy w spec): oznacznik
// aparatu (obok aparatu), DER (pod symbolem), napięcie szyny (nad lewym
// końcem), badge „NO" (przy symbolu). Wspólna geometria: prostokąt
// zaczepiony o punkt kotwiczenia, przesunięty w stronę `placement` o GRID.
// ---------------------------------------------------------------------------

export type SimpleAnchorPlacement = 'above' | 'below' | 'left' | 'right';

export interface SimpleAnchoredOwnerInput {
  readonly ownerRef: string;
  readonly ownerKind: 'apparatus' | 'der' | 'busbar-voltage' | 'no-point';
  readonly text: string;
  readonly labelClass: LabelClass;
  readonly anchor: LabelPoint;
  readonly placement: SimpleAnchorPlacement;
}

function resolveSimpleAnchoredLabel(owner: SimpleAnchoredOwnerInput): OwnedLabel {
  const width = measureLabelWidth(owner.text, owner.labelClass);
  const height = labelLineHeight(owner.labelClass);
  let x: number;
  let y: number;
  switch (owner.placement) {
    case 'above':
      x = owner.anchor.x - width / 2;
      y = owner.anchor.y - GRID - height;
      break;
    case 'below':
      x = owner.anchor.x - width / 2;
      y = owner.anchor.y + GRID;
      break;
    case 'left':
      x = owner.anchor.x - GRID - width;
      y = owner.anchor.y - height / 2;
      break;
    case 'right':
      x = owner.anchor.x + GRID;
      y = owner.anchor.y - height / 2;
      break;
  }
  return {
    ownerRef: owner.ownerRef,
    ownerKind: owner.ownerKind,
    labelClass: owner.labelClass,
    text: owner.text,
    slotIndex: 1,
    rect: { x: snapToGrid(x), y: snapToGrid(y), width, height },
  };
}

// ---------------------------------------------------------------------------
// Wejście/wyjście resolvera.
// ---------------------------------------------------------------------------

export interface ResolveLabelsInput {
  readonly segmentSpans?: readonly SegmentSpanOwnerInput[];
  readonly segmentLaterals?: readonly SegmentLateralOwnerInput[];
  readonly stationNameBands?: readonly StationNameBandOwnerInput[];
  readonly portCaptions?: readonly PortCaptionOwnerInput[];
  /** Aparat/DER/napięcie szyny/badge NO — jeden slot wg tabeli §4. */
  readonly simpleAnchored?: readonly SimpleAnchoredOwnerInput[];
}

/**
 * Rozwiązuje wszystkich właścicieli etykiet na konkretne prostokąty (spec
 * §5.5). Czysta funkcja: kolejność wejścia determinuje kolejność wyjścia
 * (P7) — każdy właściciel jest rozwiązywany NIEZALEŻNIE od pozostałych
 * (brak stanu współdzielonego, brak globalnego przeszukiwania wolnego
 * miejsca) — kolizje są niemożliwe Z KONSTRUKCJI dzięki temu, że sloty
 * wejściowe (rects z `columns.ts`/`bands.ts`) są już wzajemnie rozłączne
 * (spec §11.1, wyrocznia F2/F3); `overlapProbe` niżej to siatka
 * bezpieczeństwa (spec §4: „Wyrocznia kolizji = siatka bezpieczeństwa, nie
 * mechanizm"), nie mechanizm rozstrzygający.
 */
export function resolveLabels(input: ResolveLabelsInput): readonly OwnedLabel[] {
  const out: OwnedLabel[] = [];
  for (const owner of input.segmentSpans ?? []) out.push(resolveSegmentSpanLabel(owner));
  for (const owner of input.segmentLaterals ?? []) out.push(resolveSegmentLateralLabel(owner));
  for (const owner of input.stationNameBands ?? []) out.push(...resolveStationNameBand(owner));
  for (const owner of input.portCaptions ?? []) out.push(resolvePortCaption(owner));
  for (const owner of input.simpleAnchored ?? []) out.push(resolveSimpleAnchoredLabel(owner));
  return out;
}

// ---------------------------------------------------------------------------
// Wyrocznie (spec §11.1, rozszerzone o bbox symboli).
// ---------------------------------------------------------------------------

export interface OverlapProbeResult {
  readonly overlapCount: number;
  /** Pary `ownerRef` (etykieta↔etykieta) lub `ownerRef`↔`symbol#<index>`
   *  (etykieta↔symbol) w kolizji — do diagnostyki w testach/CI. */
  readonly pairs: readonly (readonly [string, string])[];
}

/**
 * overlap_probe (spec §11.1): zero kolizji tekst↔tekst i tekst↔symbol.
 * Czysta geometria (`rectsOverlap`, `core/grid.ts`) — bez znajomości typów
 * domenowych. `symbolRects` to bboxy symboli (F5+) — opcjonalne, bo F4 nie
 * komponuje jeszcze pełnej sceny.
 */
export function overlapProbe(
  labels: readonly OwnedLabel[],
  symbolRects: readonly V3Rect[] = [],
): OverlapProbeResult {
  const pairs: (readonly [string, string])[] = [];

  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (rectsOverlap(labels[i].rect, labels[j].rect)) {
        pairs.push([labels[i].ownerRef, labels[j].ownerRef]);
      }
    }
  }

  labels.forEach((label) => {
    symbolRects.forEach((rect, symbolIndex) => {
      if (rectsOverlap(label.rect, rect)) {
        pairs.push([label.ownerRef, `symbol#${symbolIndex}`]);
      }
    });
  });

  return { overlapCount: pairs.length, pairs };
}

/** Wyrocznia pomocnicza (P2 hard rule): slot zapasowy (`slotIndex >= 2`) MUSI
 *  mieć leader-line. Używana w testach jako kontrola negatywna (etykieta
 *  ręcznie skonstruowana bez leadera przy slocie zapasowym MUSI dać `false`). */
export function leaderInvariantHolds(labels: readonly OwnedLabel[]): boolean {
  return labels.every((label) => label.slotIndex < 2 || label.leader != null);
}
