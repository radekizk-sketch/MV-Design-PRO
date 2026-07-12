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
 *
 * F9.3 (SLD_CAD_SPEC_V3 §12 „Kompozycja celki pola wg fizycznej ścieżki
 * mocy", §14.3 „Rozróżnialne sylwetki pól"): stos aparatów pola jest teraz
 * DATA-AWARE (§12.1 „prymat danych nad konwencją") — `stackItemsForBay`
 * niżej woła `resolveBayApparatusSymbolIds` (`./apparatusSequence`, JEDNA
 * prawda współdzielona z `layout/measure.ts`): gdy `bay.primaryDevices`
 * niesie ≥1 aparat mapowalny na symbol pola, stos budowany Z DANYCH
 * (uporządkowanych już przez adapter wg `placement`); inaczej fallback
 * konwencji §12.4 (tabela w `apparatusSequence.ts`, NIE tutaj — usunięta
 * duplikacja `apparatusSymbolsForRole`/`stackFootprint` z tego pliku,
 * re-eksportowane niżej dla zgodności istniejących importów). KAŻDA instancja
 * symbolu niesie `apparatusSource` (`'dane' | 'konwencja'`, spec §12.1
 * „znacznik audytora") i, dla ścieżki danych, `deviceRef` (ENM
 * `BayPrimaryDevice.device_ref` — WHITE BOX, 0 aparatów „z domysłu").
 */

import { GRID, rectsOverlap, snapToGrid, type V3Rect } from '../core/grid';
import { labelLineHeight } from '../core/text';
import { SYMBOL_DEFS, type SymbolDef, type SymbolId } from '../symbols/defs';
import type { SwitchState } from '../symbols/glyphs';
import type { RoutePort, RouteVertex } from '../layout/route';
import {
  bayColumnRequiredWidth,
  entryDescentCaptionInset,
  formatTransformerRatedPower,
  PORT_CAPTION_BUS_CLEARANCE,
  type StationMeasureInput,
} from '../layout/measure';
import type {
  PortCaptionOwnerInput,
  SimpleAnchoredOwnerInput,
  StationNameBandOwnerInput,
  StationNameBandRow,
} from '../layout/labels';
import { ALL_FIELD_ROLES, FIELD_ROLE, type FieldRole } from '../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../v2/renderer/MiniBlockRmuRenderer';
import { bayApparatusDesignation, isLineLikeRole } from './directions';
import {
  apparatusSymbolsForRole,
  resolveBayApparatusSymbolIds,
  stackFootprint,
  symbolIdForPrimaryDeviceKind,
  type BayApparatusSource,
} from './apparatusSequence';

// F9.3: `apparatusSymbolsForRole`/`stackFootprint` przeniesione do
// `./apparatusSequence` (jedna prawda z `layout/measure.ts`) — re-eksport
// zachowuje istniejące importy (`compose/gpz.ts` importuje `stackFootprint`
// z `'./station'`; `__tests__/station.test.ts` importuje oba z `'../station'`).
export { apparatusSymbolsForRole, stackFootprint };

/**
 * Stan łącznika dla ŚCIEŻKI KONWENCJI (§12.4) — mapowanie z agregatów
 * `bay.cbState`/`bay.dsState`/`bay.esState` (jeden stan per KIND, nie per
 * pozycja w stosie — konwencja nie rozróżnia „DS_szynowy" od „DS_liniowy",
 * obie pozycje `disconnector` w §12.4 dostają TEN SAM `bay.dsState`, znana
 * uproszczona reprezentacja: `MiniBlockBayDescriptor` niesie jeden agregat na
 * kind, nie osobny stan per fizyczny aparat). Ścieżka DANYCH (§12.1) ma
 * stan PER APARAT wprost z `BayPrimaryDeviceView.switchState` —
 * `stackItemsForBay` niżej NIE woła tej funkcji w tej ścieżce.
 */
function apparatusStateFor(symbolId: SymbolId, bay: MiniBlockBayDescriptor): SwitchState | undefined {
  if (symbolId === 'breaker') return bay.cbState;
  if (symbolId === 'disconnector') return bay.dsState;
  if (symbolId === 'earthSwitch') return bay.esState;
  return undefined;
}

/** Jeden aparat gotowy do rysowania w stosie — symbol + stan + (dla ścieżki
 *  danych) `device_ref` ENM (WHITE BOX/audyt, spec §12.1). */
interface StackItemSpec {
  readonly symbolId: SymbolId;
  readonly state?: SwitchState;
  readonly deviceRef?: string;
}

/**
 * Rozstrzyga stos aparatów JEDNEGO pola (spec §12.1 „prymat danych nad
 * konwencją"): `resolveBayApparatusSymbolIds` (`./apparatusSequence`, jedna
 * prawda z `layout/measure.ts`) daje listę `symbolId` + `source`; ta funkcja
 * DODATKOWO dowiązuje stan łącznika (per-aparat dla ścieżki danych, per-kind
 * dla konwencji) i `deviceRef` (WYŁĄCZNIE ścieżka danych — konwencja nie ma
 * `device_ref`, bo NIE pochodzi z ENM, spec §12.4 „każdy stos z konwencji
 * nosi `data-apparatus-source=\"konwencja\"`").
 */
function stackItemsForBay(
  bay: MiniBlockBayDescriptor,
): { readonly items: readonly StackItemSpec[]; readonly source: BayApparatusSource } {
  const { symbolIds, source } = resolveBayApparatusSymbolIds(bay);
  if (source === 'dane') {
    // Ta sama filtracja co `resolveBayApparatusSymbolIds` (kind→symbol
    // mapowalny, DER-kindy odfiltrowane) — reużywamy `symbolIdForPrimaryDeviceKind`
    // WPROST (nie duplikujemy reguły filtracji), żeby dowiązać `deviceRef`/
    // `switchState` 1:1 do `symbolIds` już wyliczonych wyżej.
    const devices = (bay.primaryDevices ?? []).filter((d) => symbolIdForPrimaryDeviceKind(d.kind) != null);
    const items: StackItemSpec[] = devices.map((d, index) => ({
      symbolId: symbolIds[index],
      state: d.switchState,
      deviceRef: d.deviceRef,
    }));
    return { items, source };
  }
  const items = symbolIds.map((symbolId) => ({ symbolId, state: apparatusStateFor(symbolId, bay) }));
  return { items, source };
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
  /** F9.3 (spec §12.1, WHITE BOX): `BayPrimaryDevice.device_ref` ENM —
   *  WYŁĄCZNIE gdy ten symbol pochodzi z `apparatusSource==='dane'`.
   *  `undefined` dla stosu konwencji (§12.4) — brak `device_ref`, bo NIE
   *  pochodzi z ENM (zero aparatów „z domysłu" z fałszywym refem). */
  readonly deviceRef?: string;
  /** F9.3 (spec §12.1): pochodzenie stosu tego pola — `'dane'` gdy zbudowany
   *  z `Bay.primary_devices`, `'konwencja'` gdy z fallbacku §12.4. Audytor
   *  DOM czyta to jako `data-apparatus-source` (`scene/buildScene.ts`,
   *  `compose/preview.tsx`/`canvas/SldCanvasV3.tsx`). */
  readonly apparatusSource: BayApparatusSource;
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
  items: readonly StackItemSpec[],
  centerX: number,
  topY: number,
  bay: MiniBlockBayDescriptor,
  apparatusSource: BayApparatusSource,
): BayStack {
  const instances: ComposedSymbolInstance[] = [];
  let y = topY;
  let topPort: RoutePort | null = null;
  let bottomPort: RoutePort | null = null;

  items.forEach((item, index) => {
    const { symbolId } = item;
    const def = SYMBOL_DEFS[symbolId];
    const x = snapToGrid(centerX - def.width / 2);
    const ports = portsInWorld(def, x, y);
    instances.push({
      symbolId,
      bayRef: bay.bayRef,
      deviceRef: item.deviceRef,
      apparatusSource,
      x,
      y,
      state: item.state,
      ports,
    });

    if (index === 0) {
      const north = def.ports.find((p) => p.dir === 'N');
      topPort = north ? { x: x + north.x, y: y + north.y, dir: north.dir } : Object.values(ports)[0] ?? null;
    }
    const south = def.ports.find((p) => p.dir === 'S');
    bottomPort = south ? { x: x + south.x, y: y + south.y, dir: south.dir } : (topPort ?? Object.values(ports)[0] ?? null);

    y += def.height + (index < items.length - 1 ? GRID : 0);
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
    const reservedWidth = bayColumnRequiredWidth(
      station.snBays,
      index,
      station.bayDirectionCaptions,
      station.entryDescentBayIndex,
    );
    // F9.3 (§12.1): stos „dane" gdy `bay.primaryDevices` niepuste i
    // mapowalne, inaczej fallback konwencji (§12.4) — JEDNA prawda z
    // `layout/measure.ts` (`bayColumnFootprint`/`bayColumnRequiredWidth`
    // wołają `resolveBayApparatusSymbolIds` przez tę samą funkcję).
    const { items, source } = stackItemsForBay(bay);
    const symbolIds = items.map((item) => item.symbolId);
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

    const stack = buildBayStack(items, centerX, blockTopY, bay, source);
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
    // jeden wiersz t3 NAD osią magistrali, odsunięty o `PORT_CAPTION_BUS_
    // CLEARANCE` (F6e: `busAxisY - captionHeight` bez odstępu kończył
    // prostokąt DOKŁADNIE na osi — nachodził na zejście WŁASNEGO pola,
    // które zaczyna się na tej samej osi, patrz `measure.ts`
    // `stationPortCaptionHeight`, ta sama stała po obu stronach).
    const captionText = bayDirectionCaptions[index];
    if (captionText) {
      // F6e: pole z pionem zejścia z góry (`entryDescentBayIndex` — stacja 0
      // lateralu) — wycinek B2 zaczyna się ZA osią pionu (oś stosu +
      // prześwit, `entryDescentCaptionInset` — TA SAMA stała co w rezerwacji
      // `bayColumnRequiredWidth`/measure.ts, jedna prawda jak F6b-1), więc
      // podpis kierunku nigdy nie leży pod wchodzącym przewodem.
      const captionInset =
        index === station.entryDescentBayIndex ? entryDescentCaptionInset(bay.fieldRole) : 0;
      const captionRectX = bx + captionInset;
      const captionRectWidth = reservedWidth - captionInset;
      portCaptions.push({
        ownerRef: `${bay.bayRef}#direction`,
        text: captionText,
        anchorX: captionInset > 0 ? captionRectX + Math.floor(captionRectWidth / 2) : centerX,
        primaryRect: {
          x: captionRectX,
          y: busAxisY - captionHeight - PORT_CAPTION_BUS_CLEARANCE,
          width: captionRectWidth,
          height: captionHeight,
        },
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

// ---------------------------------------------------------------------------
// F9.3 — wyrocznie §12.3 (field_entry_probe) i §14.3 (field_silhouette_probe).
// ---------------------------------------------------------------------------

/**
 * field_entry_probe (spec §12.3): dla KAŻDEGO pola liniowego (kabel jest
 * fizycznym wejściem pola, §12.3 wymaganie) ostatni symbol JEGO stosu, w
 * kolejności rysowania OD SZYNY W DÓŁ (§12.2), musi być głowicą kablową
 * (`cableHead`) — zejście kablowe nigdy nie zaczyna się „od gołego stosu".
 * Działa na KOMPOZYCJI (nie na tabeli konwencji w izolacji) — obejmuje więc
 * RÓWNIEŻ ścieżkę danych (§12.1): gdy `primary_devices` nie niesie
 * `CABLE_HEAD`, to jest LUKA DANYCH (audytor zgłasza FAIL), nie fabrykowanie
 * (§12.1 zakazuje dorysowywać głowicę „z domysłu").
 *
 * DECYZJA ZAKRESU (F9.3, patrz raport): „gdy pole ma kabel" jest dziś TRUE
 * dla KAŻDEGO pola liniowego (`isLineLikeRole`) — model `FieldRole`/
 * `MiniBlockBayDescriptor` nie rozróżnia dziś linii napowietrznej od kablowej
 * na poziomie POLA (ten podział istnieje na poziomie `Branch`/segmentu, poza
 * kompozycją stacji) — kandydat na doprecyzowanie w F9.6+, jeśli/gdy kanał
 * danych dostarczy tę informację per pole.
 */
export function fieldStacksEndAtCableHead(
  composition: StationComposition,
  snBays: readonly MiniBlockBayDescriptor[],
): boolean {
  return snBays.every((bay) => {
    if (!isLineLikeRole(bay.fieldRole)) return true;
    const stackSymbols = composition.symbols.filter((s) => s.bayRef === bay.bayRef);
    const last = stackSymbols[stackSymbols.length - 1];
    return last?.symbolId === 'cableHead';
  });
}

/**
 * Klasa sylwetki pola (spec §14.3: „wejście/wyjście/odgałęzienie/
 * transformator/sprzęgło/pomiar/DER"). RULING V12K-031 (nadzorca, runda
 * korekcyjna F9.3, recenzja Opusa — zastępuje pierwotną „DECYZJA F9.3 (dług)"
 * poniższego akapitu): wejście/wyjście/odgałęzienie pola liniowego są
 * FIZYCZNIE IDENTYCZNĄ konstrukcją rozdzielnicy (ta sama sekwencja aparatów,
 * §12.2/§12.4) — rysowanie różnicy stosu/akcentu między nimi fabrykowałoby
 * różnicę konstrukcyjną, której NIE MA (nadrzędny cel dyrektywy: prawda
 * fizyczna > litera zadania rysunkowego). SĄ więc ŚWIADOMIE ZWINIĘTE w JEDNĄ
 * klasę równoważności `'line'` — kierunek niesie podpis `kier./odg.`
 * (`compose/directions.ts`) i, docelowo, strzałki przepływu mocy §14.2/F9.5
 * (prawda solverowa), NIE sylwetka; odgałęzienie różni się AKCENTEM §14.4
 * (`branchJunction`), nie stosem. Patrz `docs/v12xx/REJESTR_KONFLIKTOW.md`
 * V12K-031 (pełna treść rulingu).
 */
export type FieldSilhouetteClass =
  | 'line'
  | 'transformer'
  | 'coupler'
  | 'measurement'
  | 'der_pv'
  | 'der_bess'
  | 'der_fw';

export function fieldSilhouetteClass(role: FieldRole): FieldSilhouetteClass {
  if (isLineLikeRole(role)) return 'line';
  if (isTransformerRole(role)) return 'transformer';
  if (role === FIELD_ROLE.COUPLER) return 'coupler';
  if (role === FIELD_ROLE.MEASUREMENT) return 'measurement';
  if (role === FIELD_ROLE.DER_PV) return 'der_pv';
  if (role === FIELD_ROLE.DER_BESS) return 'der_bess';
  return 'der_fw';
}

/** Reprezentant roli KAŻDEJ klasy (jedno wejście do `apparatusSymbolsForRole`
 *  per klasa) — sygnatura sylwetki to multiset `SymbolId` (sorted) stosu
 *  KONWENCJI tej klasy; właściwość ROLI/klasy, nie pojedynczego pola (pole z
 *  `primary_devices` może mieć inny realny stos — §14.3 mówi o rozróżnialności
 *  KATEGORII pól, nie o konkretnej instancji). */
const SILHOUETTE_CLASS_REPRESENTATIVE_ROLE: Readonly<Record<FieldSilhouetteClass, FieldRole>> = {
  line: FIELD_ROLE.LINE_IN,
  transformer: FIELD_ROLE.TRANSFORMER,
  coupler: FIELD_ROLE.COUPLER,
  measurement: FIELD_ROLE.MEASUREMENT,
  der_pv: FIELD_ROLE.DER_PV,
  der_bess: FIELD_ROLE.DER_BESS,
  der_fw: FIELD_ROLE.DER_FW,
};

function silhouetteSignature(cls: FieldSilhouetteClass): string {
  const role = SILHOUETTE_CLASS_REPRESENTATIVE_ROLE[cls];
  return [...apparatusSymbolsForRole(role)].sort().join(',');
}

/**
 * field_silhouette_probe (spec §14.3, V12K-031 — RESTAURACJA semantyki
 * rola→cecha po recenzji Opusa FIX-2: wersja pośrednia sprawdzała tylko
 * „klasa→sygnatura injektywne dla klas OBECNYCH w jednej stacji", co jest
 * trywialnie prawdziwe, gdy stacja niesie tylko jedną klasę — nie dowodzi
 * NICZEGO o systemie). Ta wersja dowodzi WŁAŚCIWOŚCI GLOBALNEJ, nie
 * per-stacji: dla WSZYSTKICH ról zdefiniowanych (`ALL_FIELD_ROLES`,
 * `apparatusContracts.ts`) — każde dwie role SPOZA TEJ SAMEJ klasy
 * równoważności (`fieldSilhouetteClass`, V12K-031) MUSZĄ mieć RÓŻNE
 * sygnatury wizualne (multiset `SymbolId` stosu konwencji); każde dwie role
 * W TEJ SAMEJ klasie równoważności (np. `LINE_IN`/`LINE_OUT` — klasa
 * `'line'`) MOGĄ (i w tej implementacji DZIELĄ) tę samą sygnaturę — to NIE
 * jest naruszenie §14.3 (ruling V12K-031: identyczna konstrukcja fizyczna,
 * kierunek niesiony podpisem/strzałkami, nie sylwetką).
 */
export function fieldSilhouettesAreInjective(): boolean {
  for (let i = 0; i < ALL_FIELD_ROLES.length; i++) {
    for (let j = i + 1; j < ALL_FIELD_ROLES.length; j++) {
      const roleA = ALL_FIELD_ROLES[i];
      const roleB = ALL_FIELD_ROLES[j];
      const classA = fieldSilhouetteClass(roleA);
      const classB = fieldSilhouetteClass(roleB);
      if (classA === classB) continue; // ta sama klasa — dzielenie sygnatury dopuszczone (V12K-031).
      if (silhouetteSignature(classA) === silhouetteSignature(classB)) return false;
    }
  }
  return true;
}
