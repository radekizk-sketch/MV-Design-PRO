/**
 * SLD V3 F5a — kompozycja stacji SN/nN z prymitywów (SLD_CAD_SPEC_V3 §3
 * "Stacja SN/nN"). Czysta funkcja: wejście = geometria już policzona przez
 * measure → bands → columns (F2/F3/r7b) + `StationMeasureInput` (semantyka
 * pól, kierunki §9 z `./directions`) ⇒ wyjście = instancje symboli (z
 * portami W ŚWIECIE), odcinki wewnętrzne (szyna SN, zejścia, TR2W, szyna nN)
 * i WŁAŚCICIELE etykiet gotowi dla `layout/labels.ts` `resolveLabels`. Zero
 * DOM/losowości/Date (P7); GPZ (`compose/gpz.ts`) to F5b — NIE tu.
 *
 * Gramatyka (spec §3): pozioma szyna SN NA OSI B2 (ta sama oś, którą biegnie
 * magistrala widoku sieci — dla stacji na ciągu lokalna szyna SN JEST
 * fizyczną kontynuacją magistrali), zejścia z tej osi do kolumn pól (B4),
 * TR2W w polu transformatorowym, szyna nN + odpływy gdy `hasLvSection`. Ten
 * sam język symboli co GPZ (mniejsza skala gabarytów).
 *
 * SPÓJNOŚĆ measure↔compose (wymóg zadania): rozmieszczenie kolumn pól
 * WEWNĄTRZ bloku używa TEJ SAMEJ funkcji co rezerwacja miejsca
 * (`bayColumnRequiredWidth`, `layout/measure.ts` — zero cienia; lewa krawędź
 * bloku to `column.x + GRID`, FIX-4, patrz `composeStation`), a stos
 * aparatów per rola (`apparatusSymbolsForRole` niżej) MUSI dawać IDENTYCZNY
 * gabaryt {width,height} co `bayColumnFootprint` (measure) — sprawdzane w
 * `__tests__/station.test.ts` (describe „spójność measure↔compose", jedna
 * asercja per `FieldRole` z `ALL_FIELD_ROLES`; dwie niezależne implementacje
 * muszą się zgadzać, bo measure REZERWUJE miejsce, a compose je WYPEŁNIA).
 * FIX-3 (recenzja F5a): stos aparatów jest FLUSH-LEFT wewnątrz rezerwacji
 * pola (`bx`), oznacznik (spec §4: „Q0/Q1/T1", `bayApparatusDesignation`)
 * sidecar PO PRAWEJ stosu — dokładnie model measure (`bayColumnRequiredWidth`:
 * `footprint.width + GRID + szerokość_oznacznika`), nie stos wycentrowany w
 * całej rezerwacji (dawny kod, przez co oznacznik ≥2-znakowy wystawał poza
 * pole).
 *
 * FIX-5 (F6b, spłata długu §9 zapisanego w recenzji F6a): ta wersja pliku
 * NIE kładzie już surowego `bay.designation` jako etykietę
 * `ownerKind:'apparatus'` — `bay.designation` z adaptera v2 bywa LITERALNIE
 * `WE`/`WY`/`ODG` (rola pola, `stationFieldDesignation` w
 * `v2/canvas/enmToSldAdapter.ts`), co naruszało spec §9 „na rysunku" (spec §4
 * chce w tym slocie oznacznik APARATU Q/T, nie token roli pola). Naprawa:
 * `bayApparatusDesignation` (`./directions`, współdzielona z
 * `layout/measure.ts` — jedno źródło prawdy szerokości sidecara I realnego
 * tekstu) zwraca dane WPROST, gdy nie są zakazanym tokenem (prawda danych >
 * konwencja), inaczej wyprowadza Q/T z roli+pozycji pola w `snBays`.
 */

import { GRID, rectsOverlap, snapToGrid, type V3Rect } from '../core/grid';
import { labelLineHeight } from '../core/text';
import { SYMBOL_DEFS, type SymbolDef, type SymbolId } from '../symbols/defs';
import type { SwitchState } from '../symbols/glyphs';
import type { RoutePort, RouteVertex } from '../layout/route';
import {
  bayColumnRequiredWidth,
  formatTransformerRatedPower,
  type StationMeasureInput,
} from '../layout/measure';
import type {
  PortCaptionOwnerInput,
  SimpleAnchoredOwnerInput,
  StationNameBandOwnerInput,
  StationNameBandRow,
} from '../layout/labels';
import { FIELD_ROLE, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';
import { bayApparatusDesignation } from './directions';

// ---------------------------------------------------------------------------
// Role pola → stos aparatów (spec §3). MUSI zostać zsynchronizowane z
// `bayColumnFootprint` (`layout/measure.ts`) — patrz nagłówek pliku.
// ---------------------------------------------------------------------------

/** Stos symboli (od GÓRY do DOŁU, w kolejności rysowania) dla roli pola. */
export function apparatusSymbolsForRole(role: FieldRole): readonly SymbolId[] {
  if (role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER) {
    return ['disconnector', 'fuseSwitch', 'transformer2W'];
  }
  if (role === FIELD_ROLE.DER_PV) return ['derPv'];
  if (role === FIELD_ROLE.DER_BESS) return ['derBess'];
  if (role === FIELD_ROLE.DER_FW) return ['derGenerator'];
  // Domyślnie: pole liniowe / sprzęgło / pomiar — DS + CB (spec §3: „WE:
  // DS+CB; WY: DS+CB").
  return ['disconnector', 'breaker'];
}

/** Gabaryt stosu symboli: szerokość = najszerszy symbol, wysokość = suma
 *  wysokości + GRID między kolejnymi (spec §3, ten sam wzór co
 *  `bayColumnFootprint` w `layout/measure.ts` — test spójności w
 *  `__tests__/station.test.ts`). */
export function stackFootprint(ids: readonly SymbolId[]): { readonly width: number; readonly height: number } {
  const width = Math.max(...ids.map((id) => SYMBOL_DEFS[id].width));
  const height = ids.reduce((sum, id, index) => sum + SYMBOL_DEFS[id].height + (index > 0 ? GRID : 0), 0);
  return { width, height };
}

function apparatusStateFor(symbolId: SymbolId, bay: MiniBlockBayDescriptor): SwitchState | undefined {
  if (symbolId === 'breaker') return bay.cbState;
  if (symbolId === 'disconnector') return bay.dsState;
  return undefined;
}

// ---------------------------------------------------------------------------
// Wyjście kompozycji.
// ---------------------------------------------------------------------------

/** Instancja symbolu w świecie — origin na siatce (grid_probe), porty W
 *  ŚWIECIE (origin + offset z `SYMBOL_DEFS`, klucz = nazwa portu). */
export interface ComposedSymbolInstance {
  readonly symbolId: SymbolId;
  /** Powiązanie z polem ENM (trace/testy) — `undefined` dla symboli nie
   *  należących do żadnego konkretnego pola (dziś: brak takich w F5a). */
  readonly bayRef?: string;
  readonly x: number;
  readonly y: number;
  readonly state?: SwitchState;
  readonly ports: Readonly<Record<string, RoutePort>>;
}

/** Odcinek WEWNĘTRZNY kompozycji (szyna SN/nN, zejście do pola) — polilinia
 *  prosta (bez objazdów `route.ts`: geometria wewnątrz bloku jest znana Z
 *  GÓRY, objazdy dotyczą routingu MIĘDZY stacjami, F3). */
export interface ComposedSegment {
  readonly ownerRef: string;
  readonly points: readonly RouteVertex[];
}

export interface StationCompositionLabelInputs {
  readonly portCaptions: readonly PortCaptionOwnerInput[];
  readonly apparatus: readonly SimpleAnchoredOwnerInput[];
  readonly der: readonly SimpleAnchoredOwnerInput[];
  readonly stationName: StationNameBandOwnerInput;
}

export interface StationComposition {
  readonly stationId: string;
  readonly symbols: readonly ComposedSymbolInstance[];
  readonly segments: readonly ComposedSegment[];
  readonly labels: StationCompositionLabelInputs;
  /** Bbox całej kompozycji (symbole + wierzchołki odcinków) — do wyroczni
   *  „bbox kompozycji ⊆ rezerwacja measure/bands" (test w `__tests__`). */
  readonly bbox: V3Rect;
}

// ---------------------------------------------------------------------------
// Wejście kompozycji.
// ---------------------------------------------------------------------------

export interface ComposeStationColumnInput {
  readonly x: number;
  readonly width: number;
  /** Zaczep magistrali (`ColumnResult.tapX`, `layout/columns.ts`, r7b). */
  readonly tapX: number;
}

export interface ComposeStationInput {
  readonly station: StationMeasureInput;
  readonly column: ComposeStationColumnInput;
  /** Y osi magistrali (pasmo B2 z `bands.ts`) — WSPÓLNA dla całego wiersza,
   *  szyna SN stacji leży DOKŁADNIE na tej osi (spec §3: „przez blok NA OSI
   *  B2"). */
  readonly busAxisY: number;
  /** Y początku bloku stacji (pasmo B4 z `bands.ts`) — WSPÓLNA dla wiersza;
   *  `blockTopY >= busAxisY` (blok stoi POD osią magistrali). */
  readonly blockTopY: number;
  /** Zarezerwowany slot pasma NAZW (`ColumnResult.nameSlot`). */
  readonly nameSlot: V3Rect;
  /** Czy stacja ma sekcję nN (szyna nN + odpływy, spec §3) — POZA zakresem
   *  `StationMeasureInput` (F2, measure-only: obecność nN nie zmienia
   *  rezerwacji B4, `STATION_BLOCK_BUS_CLEARANCE` jest stała niezależnie).
   *  Domyślnie `false`. */
  readonly hasLvSection?: boolean;
}

// ---------------------------------------------------------------------------
// Budowa stosu aparatów jednego pola.
// ---------------------------------------------------------------------------

interface BayStack {
  readonly instances: readonly ComposedSymbolInstance[];
  /** Port GÓRNY pierwszego symbolu w świecie — cel „zejścia" z magistrali. */
  readonly topPort: RoutePort;
  /** Port DOLNY ostatniego symbolu w świecie (dla TR: port `lv`). Gdy
   *  ostatni symbol nie ma portu południowego (np. DER — liść bez dalszych
   *  połączeń), równy `topPort` (ten sam, jedyny port). */
  readonly bottomPort: RoutePort;
}

function portsInWorld(def: SymbolDef, x: number, y: number): Readonly<Record<string, RoutePort>> {
  const out: Record<string, RoutePort> = {};
  def.ports.forEach((p) => {
    out[p.name] = { x: x + p.x, y: y + p.y, dir: p.dir };
  });
  return out;
}

function buildBayStack(
  ids: readonly SymbolId[],
  centerX: number,
  topY: number,
  bay: MiniBlockBayDescriptor,
): BayStack {
  const instances: ComposedSymbolInstance[] = [];
  let y = topY;
  let topPort: RoutePort | null = null;
  let bottomPort: RoutePort | null = null;

  ids.forEach((symbolId, index) => {
    const def = SYMBOL_DEFS[symbolId];
    const x = snapToGrid(centerX - def.width / 2);
    const ports = portsInWorld(def, x, y);
    instances.push({
      symbolId,
      bayRef: bay.bayRef,
      x,
      y,
      state: apparatusStateFor(symbolId, bay),
      ports,
    });

    if (index === 0) {
      const north = def.ports.find((p) => p.dir === 'N');
      topPort = north ? { x: x + north.x, y: y + north.y, dir: north.dir } : Object.values(ports)[0] ?? null;
    }
    const south = def.ports.find((p) => p.dir === 'S');
    bottomPort = south ? { x: x + south.x, y: y + south.y, dir: south.dir } : (topPort ?? Object.values(ports)[0] ?? null);

    y += def.height + (index < ids.length - 1 ? GRID : 0);
  });

  if (!topPort || !bottomPort) {
    throw new Error(`composeStation: pole „${bay.bayRef}" nie ma żadnego symbolu z portem (pusty stos aparatów)`);
  }
  return { instances, topPort, bottomPort };
}

// ---------------------------------------------------------------------------
// composeStation — kompozycja główna.
// ---------------------------------------------------------------------------

function isTransformerRole(role: FieldRole): boolean {
  return role === FIELD_ROLE.TRANSFORMER || role === FIELD_ROLE.RMU_TRANSFORMER;
}

function computeBbox(symbols: readonly ComposedSymbolInstance[], segments: readonly ComposedSegment[]): V3Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  symbols.forEach((s) => {
    const def = SYMBOL_DEFS[s.symbolId];
    minX = Math.min(minX, s.x);
    maxX = Math.max(maxX, s.x + def.width);
    minY = Math.min(minY, s.y);
    maxY = Math.max(maxY, s.y + def.height);
  });
  segments.forEach((seg) => {
    seg.points.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });
  });

  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Komponuje stację SN/nN z prymitywów (spec §3). Czysta funkcja —
 * deterministyczna (to samo wejście ⇒ identyczny wynik, test w
 * `__tests__/station.test.ts`).
 */
export function composeStation(input: ComposeStationInput): StationComposition {
  const { station, column, busAxisY, blockTopY, nameSlot } = input;
  const hasLvSection = input.hasLvSection ?? false;
  const bayDirectionCaptions = station.bayDirectionCaptions ?? [];

  // FIX-4 (recenzja F5a): `tapX` w `measure`/`segments.ts`
  // (`computeStationTaps`) jest `snapToGrid(column.x + GRID + blockWidth/2)`
  // — odtwarzanie `blockLeftX` z `tapX - blockWidth/2` to ROUND-TRIP przez tę
  // zaokrągloną wartość: gdy `blockWidth/2 ≡ 4 mod 8`, zaokrąglenie `tapX` w
  // GÓRĘ/DÓŁ nie odwraca się dokładnie, dryf do 8px (poprzedni komentarz
  // „identyczny wynik z definicji" był błędny — patrz recenzja). `column.x +
  // GRID` to PRAWDA measure WPROST (ten sam margines lewy GRID, spec §5.1
  // "+2×GRID"), bez zaokrąglenia po drodze — `column.x` jest już na siatce z
  // konstrukcji (prefix-sum wielokrotności GRID).
  const blockLeftX = column.x + GRID;

  const symbols: ComposedSymbolInstance[] = [];
  const segments: ComposedSegment[] = [];
  const portCaptions: PortCaptionOwnerInput[] = [];
  const apparatusLabels: SimpleAnchoredOwnerInput[] = [];
  const derLabels: SimpleAnchoredOwnerInput[] = [];
  const lvPorts: RoutePort[] = [];
  const busTapXs: number[] = [];

  const captionHeight = labelLineHeight('t3');

  let bx = blockLeftX;
  station.snBays.forEach((bay, index) => {
    const reservedWidth = bayColumnRequiredWidth(station.snBays, index, station.bayDirectionCaptions);
    const symbolIds = apparatusSymbolsForRole(bay.fieldRole);
    // FIX-3 (recenzja F5a): `bayColumnRequiredWidth` (measure.ts) rezerwuje
    // `footprint.width + GRID + szerokość_oznacznika` — stos aparatów
    // FLUSH-LEFT (przy `bx`) + oznacznik sidecar PO PRAWEJ stosu. Centrowanie
    // stosu w CAŁEJ `reservedWidth` (poprzedni kod) przesuwało go w prawo o
    // połowę sidecara, więc oznacznik ≥2-znakowy wystawał poza rezerwację —
    // `centerX` liczony z `footprint.width` (nie `reservedWidth`) daje stosowi
    // lewą krawędź DOKŁADNIE na `bx`, zgodnie z modelem measure.
    const footprint = stackFootprint(symbolIds);
    const centerX = snapToGrid(bx + footprint.width / 2);
    busTapXs.push(centerX);

    const stack = buildBayStack(symbolIds, centerX, blockTopY, bay);
    symbols.push(...stack.instances);

    // Zejście z osi magistrali (B2) do górnego portu pierwszego aparatu.
    segments.push({
      ownerRef: `${bay.bayRef}#descent`,
      points: [
        { x: centerX, y: busAxisY },
        { x: centerX, y: stack.topPort.y },
      ],
    });

    // Podpis kierunku pola (spec §9, `./directions`) — właściciel gotowy
    // dla `resolveLabels`. Wycinek B2 tego pola: szerokość rezerwacji pola,
    // jeden wiersz t3 tuż NAD osią magistrali.
    const captionText = bayDirectionCaptions[index];
    if (captionText) {
      portCaptions.push({
        ownerRef: `${bay.bayRef}#direction`,
        text: captionText,
        anchorX: centerX,
        primaryRect: { x: bx, y: busAxisY - captionHeight, width: reservedWidth, height: captionHeight },
      });
    }

    // Oznacznik aparatu (spec §4: „Q0/Q1/T1", `bayApparatusDesignation` —
    // FIX-5/§9, patrz nagłówek pliku) — PO PRAWEJ stosu (FIX-3), nie po
    // prawej jego ŚRODKA: `resolveSimpleAnchoredLabel` (`layout/labels.ts`)
    // stawia slot `placement: 'right'` zaczynając w `anchor.x + GRID`, więc
    // zaczep musi być prawą krawędzią stosu (`bx + footprint.width`) — dokładnie
    // tam, gdzie measure.ts kończy `footprint.width` i zaczyna `GRID + oznacznik`.
    const designation = bayApparatusDesignation(station.snBays, index);
    if (designation) {
      apparatusLabels.push({
        ownerRef: `${bay.bayRef}#designation`,
        ownerKind: 'apparatus',
        text: designation,
        labelClass: 't3',
        anchor: { x: snapToGrid(bx + footprint.width), y: stack.topPort.y },
        placement: 'right',
      });
    }

    if (isTransformerRole(bay.fieldRole)) lvPorts.push(stack.bottomPort);

    bx += reservedWidth + GRID;
  });

  // Szyna SN pozioma NA OSI B2 (spec §3: „dł. z liczby pól") — od pierwszego
  // do ostatniego zaczepu pola tej stacji.
  if (busTapXs.length > 0) {
    segments.push({
      ownerRef: `${station.id}#sn-bus`,
      points: [
        { x: busTapXs[0], y: busAxisY },
        { x: busTapXs[busTapXs.length - 1], y: busAxisY },
      ],
    });
  }

  // Szyna nN + odpływy (spec §3) — TYLKO gdy stacja ma sekcję nN, zaczepiona
  // pod NAJNIŻSZYMI portami LV wszystkich pól transformatorowych tej
  // stacji. Odpływy nN (liczba, rozstaw) POZA zakresem F5a — dane wejściowe
  // (`nnFeedersCount`) nie są dziś częścią żadnego kontraktu measure/compose
  // (gap udokumentowany w raporcie F5a); rysujemy WYŁĄCZNIE szynę zbiorczą.
  if (hasLvSection && lvPorts.length > 0) {
    const minX = Math.min(...lvPorts.map((p) => p.x));
    const maxX = Math.max(...lvPorts.map((p) => p.x));
    const busY = snapToGrid(Math.max(...lvPorts.map((p) => p.y)) + GRID);
    const busLeft = minX === maxX ? minX - GRID : minX;
    const busRight = minX === maxX ? maxX + GRID : maxX;

    segments.push({
      ownerRef: `${station.id}#lv-bus`,
      points: [
        { x: busLeft, y: busY },
        { x: busRight, y: busY },
      ],
    });
    lvPorts.forEach((p, index) => {
      segments.push({
        ownerRef: `${station.id}#lv-drop-${index}`,
        points: [
          { x: p.x, y: p.y },
          { x: p.x, y: busY },
        ],
      });
    });
  }

  // Pasmo nazw (B5, spec §4: kolejność pionowa stała) — TA SAMA kolejność
  // co `stationNameBandHeight` (`layout/measure.ts`): nazwa, kod, kVA, typ.
  const rows: StationNameBandRow[] = [{ text: station.name, labelClass: 't1' }];
  if (station.stationCode) rows.push({ text: station.stationCode, labelClass: 't1' });
  if (station.transformerRatedKva != null) {
    rows.push({ text: formatTransformerRatedPower(station.transformerRatedKva), labelClass: 't2' });
  }
  if (station.stationTypeLabel) rows.push({ text: station.stationTypeLabel, labelClass: 't4' });

  const stationName: StationNameBandOwnerInput = { ownerRef: station.id, nameSlot, rows };

  return {
    stationId: station.id,
    symbols,
    segments,
    labels: { portCaptions, apparatus: apparatusLabels, der: derLabels, stationName },
    bbox: computeBbox(symbols, segments),
  };
}

// ---------------------------------------------------------------------------
// Wyrocznie (spec §11, rozszerzenie F5).
// ---------------------------------------------------------------------------

/** grid_probe (F5): wszystkie originy symboli na siatce GRID. */
export function allCompositionSymbolsOnGrid(composition: StationComposition): boolean {
  return composition.symbols.every((s) => s.x % GRID === 0 && s.y % GRID === 0);
}

/** Zero nachodzeń symbol↔symbol (spec §11.1, rozszerzenie F5). */
export function noCompositionSymbolOverlaps(composition: StationComposition): boolean {
  const rects: V3Rect[] = composition.symbols.map((s) => {
    const def = SYMBOL_DEFS[s.symbolId];
    return { x: s.x, y: s.y, width: def.width, height: def.height };
  });
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) return false;
    }
  }
  return true;
}

/**
 * endsAtPorts (spec §11.3, odpowiednik F5): każdy odcinek WEWNĘTRZNY kończy
 * się w porcie symbolu LUB na szynie (odcinku zbiorczym SN/nN tej samej
 * kompozycji — busbar nie ma dziś jawnych portów pośrednich, `makeBusbarDef`
 * F1 ma tylko `left`/`right`; punkt na jej odcinku liczy się jako poprawne
 * zakończenie, odpowiednik „tap").
 */
export function internalSegmentsEndAtPortsOrBus(composition: StationComposition): boolean {
  const ports: RoutePort[] = [];
  composition.symbols.forEach((s) => Object.values(s.ports).forEach((p) => ports.push(p)));

  const busSegments = composition.segments.filter(
    (s) => s.ownerRef.endsWith('#sn-bus') || s.ownerRef.endsWith('#lv-bus'),
  );

  const endpointValid = (p: RouteVertex): boolean => {
    if (ports.some((port) => port.x === p.x && port.y === p.y)) return true;
    return busSegments.some((bus) => {
      const [a, b] = bus.points;
      if (!a || !b || a.y !== b.y || a.y !== p.y) return false;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      return p.x >= minX && p.x <= maxX;
    });
  };

  return composition.segments.every((seg) => {
    const first = seg.points[0];
    const last = seg.points[seg.points.length - 1];
    return !!first && !!last && endpointValid(first) && endpointValid(last);
  });
}
