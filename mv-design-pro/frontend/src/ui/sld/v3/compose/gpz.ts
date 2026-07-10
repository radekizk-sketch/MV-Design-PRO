/**
 * SLD V3 F5b — kompozycja GPZ z prymitywów (SLD_CAD_SPEC_V3 §3 "GPZ",
 * §8 "Co przejmujemy z v2"). Czysta funkcja: wejście = `GpzCanonicalRendererProps`
 * (TYP kanoniczny propsów GPZ, importowany WYŁĄCZNIE jako typ — zero cienia
 * modelu, zakaz renderu przez v2, patrz nagłówek `v2/renderer/GpzCanonicalRenderer.tsx`)
 * + `origin` (punkt zaczepienia na siatce arkusza). Wyjście — w KSZTAŁCIE
 * `StationComposition` (`./station`, F5a): instancje symboli z portami W
 * ŚWIECIE, odcinki wewnętrzne, wejścia dla `layout/labels.ts` `resolveLabels`
 * — rozszerzone o `meta` (parityKeys/testId/flagi noDirectTie/busbarRole) na
 * KAŻDYM elemencie, potrzebne migrowanym wyrocznaim v2 (§8: „inwarianty GPZ
 * ... V3 przejmuje je 1:1"). Zero DOM/losowości/Date (P7).
 *
 * Gramatyka (spec §3, IDENTYCZNA z compose/station.ts, większa skala):
 *   szyna WN (110 kV)
 *     → pole WN TR (DS + CB + CT)              [ZERO bezpośredniego styku z TR]
 *     → TR2W
 *     → pole TR (DS + CB + CT + ES)             [ZERO bezpośredniego styku z szyną SN]
 *     → sekcje SN (busbarTopology: single/double/ring)
 *       → pola liniowe/sprzęgła/pomiarowe (kolumny aparatów wg roli)
 *     → sprzęgła międzysekcyjne (props.couplers)
 *
 * Szerokości sekcji/pól/szyny WN z LICZBY pól i gabarytów aparatów
 * (prefix-sum, `stackFootprint` z `./station` — TA SAMA funkcja geometrii
 * stosu, zero duplikacji), NIE ze stałych PITCH (P1; kontrast z legacy
 * `BAY_PITCH`/`LV_SECTION_MIN_WIDTH` w v2 renderze, §0 diagnoza W1).
 *
 * DECYZJA (mechanizm wierszy, plan F5b: „GPZ przejmuje NAPRAWIONY mechanizm
 * wierszy — kolorowanie przedziałów z F5a-fix, NIE stary stagger"): etykiety
 * kierunku/celu pola (feederName/destinationLabel) mogą być SZERSZE niż
 * kolumna aparatów pola (16px), więc sąsiednie podpisy mogą się nakładać w
 * osi X mimo że kolumny aparatów się nie nakładają — dokładnie ten sam
 * problem, który w F5a naprawił `colorSegmentLabelRows` (kolorowanie grafu
 * przedziałów zamiast parzystości). Reużywamy TĘ SAMĄ funkcję (`./segments`)
 * per sekcja, zamiast pisać nowy heurystyczny stagger.
 *
 * DECYZJE/LUKI SPEC udokumentowane przy odpowiednich funkcjach niżej
 * (patrz też raport końcowy zadania): sprzęgło międzysekcyjne reprezentowane
 * jako pojedynczy symbol 'breaker' NA szynie (bez modelu portów E/W —
 * biblioteka F1 nie ma glifu z portami horyzontalnymi); pola WN
 * (`hvSections`) używają uproszczonego stosu CB+DS (bez CT/ES — spec §3 nie
 * rozwija gramatyki pól WN poza polem TR).
 */

import { GRID, rectsOverlap, snapToGrid, snapUp, type V3Rect } from '../core/grid';
import { labelLineHeight, measureLabelWidth } from '../core/text';
import { SYMBOL_DEFS, type SymbolId } from '../symbols/defs';
import type { SwitchState } from '../symbols/glyphs';
import type { RoutePort, RouteVertex } from '../layout/route';
import {
  colorSegmentLabelRows,
  type SegmentLabelSlotX,
} from '../layout/segments';
import type {
  PortCaptionOwnerInput,
  SimpleAnchoredOwnerInput,
  StationNameBandOwnerInput,
  StationNameBandRow,
} from '../layout/labels';
import { stackFootprint } from './station';
import type {
  CanonicalGpzBay,
  CanonicalGpzBusbarTopology,
  CanonicalGpzSection,
  CanonicalGpzTransformer,
  GpzCanonicalRendererProps,
} from '../../v2/renderer/GpzCanonicalRenderer';

// ---------------------------------------------------------------------------
// Meta — atrybuty data-* potrzebne wyrocznaim migrowanym z v2 (§8).
// ---------------------------------------------------------------------------

/** Metadane per-element — odpowiednik nagromadzonych `data-*` z v2, ale na
 *  strukturze (bez DOM). `parityKeys` to LISTA, bo v2 zagnieżdżał czasem
 *  DWA atrybuty `data-parity-key` na tym samym elemencie logicznym (osobny
 *  <g> zewnętrzny z kluczem specyficznym + wewnętrzny glif z kluczem
 *  generycznym, np. `gpz.apparatus.cb.main` + `gpz.apparatus.cb`) — tu
 *  jeden element niesie obie etykiety. */
export interface GpzElementMeta {
  readonly parityKeys: readonly string[];
  readonly testId?: string;
  readonly sectionId?: string;
  readonly transformerRef?: string;
  readonly bayRef?: string;
  readonly busbarRole?: 'primary' | 'reserve';
  readonly dashed?: boolean;
  readonly ringClosure?: boolean;
  /** noDirectTie (spec §8/§3): zawsze `false` z KONSTRUKCJI — compose NIGDY
   *  nie tworzy segmentu szyna→TR ani TR→szyna SN bez pola aparatów. Pole
   *  obecne WYŁĄCZNIE na segmentach łączących TR z jego polami (odpowiednik
   *  `data-direct-110kv-tr-tie`/`data-direct-sn-bus-tie` w v2). */
  readonly directTie110?: false;
  readonly directTieSn?: false;
  /** Odpowiednik `data-terminates-at` w v2 — gdzie faktycznie kończy się
   *  odcinek (aparat pola, nie sąsiedni element elektryczny). */
  readonly terminatesAt?: string;
}

export interface ComposedGpzSymbolInstance {
  readonly symbolId: SymbolId;
  readonly x: number;
  readonly y: number;
  readonly state?: SwitchState;
  readonly ports: Readonly<Record<string, RoutePort>>;
  readonly meta: GpzElementMeta;
}

export interface ComposedGpzSegment {
  readonly ownerRef: string;
  readonly points: readonly RouteVertex[];
  readonly meta: GpzElementMeta;
}

export interface GpzSectionMeta {
  readonly sectionId: string;
  readonly order: number;
  readonly label: string;
  readonly busVoltageKv: number;
  readonly busbarTopology: CanonicalGpzBusbarTopology;
}

export interface GpzTransformerMeta {
  readonly transformerRef: string;
  readonly designation: string;
  readonly hvBayTestId: string;
  readonly trFieldTestId: string;
}

export interface GpzCompositionLabelInputs {
  /** Nazwa GPZ (header, spec §4 tabela „GPZ": nazwa t1, slot „header bloku"). */
  readonly stationName: StationNameBandOwnerInput;
  readonly sectionLabels: readonly SimpleAnchoredOwnerInput[];
  readonly transformerLabels: readonly StationNameBandOwnerInput[];
  readonly fieldDesignations: readonly SimpleAnchoredOwnerInput[];
  /** Podpisy celu/kierunku pola (feederName/destinationLabel) — mechanizm
   *  wierszy (`colorSegmentLabelRows`), patrz nagłówek pliku. */
  readonly fieldCaptions: readonly PortCaptionOwnerInput[];
}

export interface GpzComposition {
  readonly gpzId: string;
  readonly symbols: readonly ComposedGpzSymbolInstance[];
  readonly segments: readonly ComposedGpzSegment[];
  readonly labels: GpzCompositionLabelInputs;
  readonly sections: readonly GpzSectionMeta[];
  readonly transformers: readonly GpzTransformerMeta[];
  /** Zbiór wszystkich `data-parity-key`-odpowiedników obecnych w kompozycji
   *  (migracja `visualParityChecklist.test.tsx` — patrz `__tests__/gpz.test.ts`). */
  readonly parityKeys: ReadonlySet<string>;
  /** Odpowiednik stanów „brak danych" v2 (`gpz.hv.missing`/`gpz.transformer.missing`). */
  readonly missingData: readonly string[];
  readonly bbox: V3Rect;
}

// ---------------------------------------------------------------------------
// Stałe geometryczne — WYŁĄCZNIE odstępy (spec dopuszcza `GAP(3×GRID)` jako
// stałą MIĘDZY elementami, zakazane są stałe PITCH zastępujące pomiar
// TREŚCI — tu żadna szerokość kolumny/sekcji nie jest stała, tylko odstępy).
// ---------------------------------------------------------------------------

const SECTION_MARGIN = 2 * GRID;
const FIELD_GAP = 2 * GRID;
const SECTION_GAP = 4 * GRID;
const HV_MARGIN_TOP = 4 * GRID;
const STACK_GAP = 2 * GRID;
const HV_LINE_BAY_GAP = 2 * GRID;

// ---------------------------------------------------------------------------
// Role pola → stos aparatów + parityKeys (spec §3, migracja kluczy z v2 —
// patrz `visualParityChecklist.test.tsx` REQUIRED_GPZ_PARITY_KEYS).
// ---------------------------------------------------------------------------

interface FieldApparatusSpec {
  readonly symbolId: SymbolId;
  readonly parityKeys: readonly string[];
}

const DS_BUS: FieldApparatusSpec = { symbolId: 'disconnector', parityKeys: ['gpz.apparatus.ds.bus', 'gpz.apparatus.ds'] };
const DS_LIN: FieldApparatusSpec = { symbolId: 'disconnector', parityKeys: ['gpz.apparatus.ds.line', 'gpz.apparatus.ds'] };
const CB_MAIN: FieldApparatusSpec = { symbolId: 'breaker', parityKeys: ['gpz.apparatus.cb.main', 'gpz.apparatus.cb'] };
const CT: FieldApparatusSpec = { symbolId: 'currentTransformer', parityKeys: ['gpz.apparatus.ct'] };
const ES_SIDE: FieldApparatusSpec = { symbolId: 'earthSwitch', parityKeys: ['gpz.apparatus.es.side'] };
const CABLE_HEAD: FieldApparatusSpec = { symbolId: 'cableHead', parityKeys: ['gpz.apparatus.cable_head'] };
const VT: FieldApparatusSpec = { symbolId: 'voltageTransformer', parityKeys: [] };

/** Pole liniowe/odgałęźne (spec §3 „pola liniowe"; grammar 1:1 z v2
 *  `getBayApparatusPolicy` LINE_*): DS_bus + CB + CT + DS_lin + ES + głowica. */
function lineFieldSpec(): readonly FieldApparatusSpec[] {
  return [DS_BUS, CB_MAIN, CT, DS_LIN, ES_SIDE, CABLE_HEAD];
}

/** Pole TR w sekcji SN (fallback — normalnie TR renderowany przez
 *  `transformers`/pole TR dedykowane, patrz `composeTrField`; ta gałąź
 *  obsługuje starsze dane ENM z `bay.fieldRole === 'TRANSFORMER'` wprost w
 *  `section.bays`) i pole TR dedykowane — TA SAMA gramatyka (spec §3: „pole
 *  TR: DS+CB+CT+ES"). */
function transformerFieldSpec(): readonly FieldApparatusSpec[] {
  return [DS_BUS, CB_MAIN, CT, ES_SIDE];
}

/** Pole sprzęgła (bay-based, w `section.bays`, ODRĘBNE od `props.couplers`
 *  między-sekcyjnych) — v2 `getBayApparatusPolicy` COUPLER: DS+CB+CT, brak ES. */
function couplerBaySpec(): readonly FieldApparatusSpec[] {
  return [DS_BUS, CB_MAIN, CT];
}

/** Pole pomiarowe — v2 `getBayApparatusPolicy` MEASUREMENT: DS+VT+ES. */
function measurementFieldSpec(): readonly FieldApparatusSpec[] {
  return [DS_BUS, VT, ES_SIDE];
}

function fieldApparatusSpecForBay(bay: CanonicalGpzBay): readonly FieldApparatusSpec[] {
  const base = ((): readonly FieldApparatusSpec[] => {
    switch (bay.fieldRole) {
      case 'LINE_IN':
      case 'LINE_OUT':
      case 'LINE_BRANCH':
        return lineFieldSpec();
      case 'TRANSFORMER':
        return transformerFieldSpec();
      case 'COUPLER':
        return couplerBaySpec();
      case 'MEASUREMENT':
        return measurementFieldSpec();
    }
  })();
  // esState='absent' (spec/v2: `apparatus.es && esState !== 'absent'`) — pole
  // BEZ uziemnika na fizycznym łączu (rzadkie, ale realne w ENM).
  if (bay.esState === 'absent') return base.filter((s) => s.symbolId !== 'earthSwitch');
  return base;
}

/** Pole WN TR (spec §3 „pole WN TR: DS+CB+CT") — DS+CB+CT, BEZ ES (ziemia po
 *  stronie WN nie jest częścią gramatyki §3 dla tego pola). */
function hvTrFieldSpec(): readonly FieldApparatusSpec[] {
  return [DS_BUS, CB_MAIN, CT];
}

/** Pole TR dedykowane (spec §3 „pole TR: DS+CB+CT+ES") — TA SAMA gramatyka
 *  co `transformerFieldSpec` (pole TR w sekcji SN, gałąź fallback) — jedna
 *  funkcja, dwa miejsca użycia. */
const trFieldSpec = transformerFieldSpec;

/** Pole liniowe WN (`hvSections[].bays`) — spec §3 nie rozwija gramatyki pól
 *  WN poza polem TR; uproszczony stos CB+DS (kanon v2 `HvLineBay`: CB dalej
 *  od szyny, DS bliżej szyny) — DECYZJA (luka spec, patrz raport końcowy). */
function hvLineBaySpec(): readonly FieldApparatusSpec[] {
  return [
    { symbolId: 'breaker', parityKeys: ['gpz.hv.bay', 'gpz.apparatus.cb'] },
    { symbolId: 'disconnector', parityKeys: ['gpz.hv.bay', 'gpz.apparatus.ds'] },
  ];
}

// ---------------------------------------------------------------------------
// Budowa stosu aparatów jednego pola/toru — analogiczne do
// `compose/station.ts` `buildBayStack`, ale samodzielne (typ `CanonicalGpzBay`
// ≠ `MiniBlockBayDescriptor`, zero cienia — patrz nagłówek pliku). Reużywa
// WYŁĄCZNIE geometrii bez stanu (`stackFootprint`, `SYMBOL_DEFS`).
// ---------------------------------------------------------------------------

/** `topPort` — port N pierwszego symbolu stosu (fallback: pierwszy port
 *  dostępny). `bottomPort` — port S OSTATNIEGO symbolu stosu, który go MA,
 *  licząc od góry (FIX-C, recenzja F5b): symbole bez portu S na końcu stosu
 *  (np. ES w polu TR/MEASUREMENT — `earthSwitch` ma WYŁĄCZNIE port N,
 *  odgałęzia się bocznie) nie mogą kolapsować `bottomPort` do `topPort` —
 *  odcinek przelotowy (np. `#tr-field-to-bus`) musi zaczynać się na porcie S
 *  CT (lub innego symbolu z portem S), nie z góry stosu przez wszystkie
 *  aparaty. Gdy ŻADEN symbol w stosie nie ma portu S, fallback = `topPort`. */
interface FieldStack {
  readonly instances: readonly ComposedGpzSymbolInstance[];
  readonly topPort: RoutePort;
  readonly bottomPort: RoutePort;
}

function portsInWorld(symbolId: SymbolId, x: number, y: number): Readonly<Record<string, RoutePort>> {
  const out: Record<string, RoutePort> = {};
  SYMBOL_DEFS[symbolId].ports.forEach((p) => {
    out[p.name] = { x: x + p.x, y: y + p.y, dir: p.dir };
  });
  return out;
}

function buildFieldStack(
  specs: readonly FieldApparatusSpec[],
  centerX: number,
  topY: number,
  testIdFor: (index: number, symbolId: SymbolId) => string | undefined,
  stateFor: (index: number, symbolId: SymbolId) => SwitchState | undefined,
  metaExtra: Partial<GpzElementMeta>,
): FieldStack {
  const instances: ComposedGpzSymbolInstance[] = [];
  let y = topY;
  let topPort: RoutePort | null = null;
  let bottomPort: RoutePort | null = null;

  specs.forEach((spec, index) => {
    const def = SYMBOL_DEFS[spec.symbolId];
    const x = snapToGrid(centerX - def.width / 2);
    const ports = portsInWorld(spec.symbolId, x, y);
    instances.push({
      symbolId: spec.symbolId,
      x,
      y,
      state: stateFor(index, spec.symbolId),
      ports,
      meta: { parityKeys: spec.parityKeys, testId: testIdFor(index, spec.symbolId), ...metaExtra },
    });

    if (index === 0) {
      const north = def.ports.find((p) => p.dir === 'N');
      topPort = north ? { x: x + north.x, y: y + north.y, dir: north.dir } : Object.values(ports)[0] ?? null;
    }
    // FIX-C: nadpisujemy `bottomPort` WYŁĄCZNIE gdy ten symbol ma port S —
    // symbol bez portu S (np. ES na końcu) zostawia poprzednią wartość
    // nietkniętą, więc po pętli `bottomPort` niesie port S NAJNIŻSZEGO
    // symbolu, który go ma, nie `topPort`.
    const south = def.ports.find((p) => p.dir === 'S');
    if (south) {
      bottomPort = { x: x + south.x, y: y + south.y, dir: south.dir };
    }

    y += def.height + (index < specs.length - 1 ? GRID : 0);
  });

  if (!topPort) {
    throw new Error('composeGpz: pusty stos aparatów pola (brak symboli z portem)');
  }
  if (!bottomPort) {
    // Żaden symbol w stosie nie ma portu S (np. stos złożony wyłącznie z
    // ES/VT) — fallback na topPort, zachowując poprzednie zabezpieczenie.
    bottomPort = topPort;
  }
  return { instances, topPort, bottomPort };
}

// ---------------------------------------------------------------------------
// Layout sekcji SN (prefix-sum z LICZBY pól i gabarytów aparatów, spec §3/§5.1).
// ---------------------------------------------------------------------------

interface FieldColumnLayout {
  readonly bay: CanonicalGpzBay;
  readonly index: number;
  readonly spec: readonly FieldApparatusSpec[];
  /** Środek kolumny aparatów, WORLD X (sekcja jest już umieszczona w świecie
   *  w momencie budowy tej struktury — patrz `layoutSections`). */
  readonly centerX: number;
}

interface SectionLayout {
  readonly section: CanonicalGpzSection;
  readonly x: number;
  readonly width: number;
  readonly fields: readonly FieldColumnLayout[];
}

/** Szerokość WYMAGANA kolumny pola: gabaryt stosu aparatów (`stackFootprint`,
 *  reużyte z `./station` — zero duplikacji geometrii) + sidecar oznacznika
 *  (bayNumber/feederName, t3), analogicznie do `bayColumnRequiredWidth`
 *  (`layout/measure.ts`) w compose/station.ts. */
function fieldColumnRequiredWidth(bay: CanonicalGpzBay, spec: readonly FieldApparatusSpec[]): number {
  const footprint = stackFootprint(spec.map((s) => s.symbolId));
  const designation = (bay.bayNumber ?? bay.feederName ?? '').trim();
  const sidecar = designation ? GRID + measureLabelWidth(designation, 't3') : 0;
  return footprint.width + sidecar;
}

function layoutSectionFields(section: CanonicalGpzSection, startX: number): { readonly fields: readonly FieldColumnLayout[]; readonly width: number } {
  const fields: FieldColumnLayout[] = [];
  let cursor = startX + SECTION_MARGIN;
  section.bays.forEach((bay, index) => {
    const spec = fieldApparatusSpecForBay(bay);
    const footprint = stackFootprint(spec.map((s) => s.symbolId));
    const reserved = snapUp(fieldColumnRequiredWidth(bay, spec));
    const centerX = snapToGrid(cursor + footprint.width / 2);
    fields.push({ bay, index, spec, centerX });
    cursor += reserved + FIELD_GAP;
  });
  const contentRight = fields.length > 0 ? cursor - FIELD_GAP + SECTION_MARGIN : startX + SECTION_MARGIN * 2;
  const width = snapUp(Math.max(contentRight - startX, 4 * GRID));
  return { fields, width };
}

/** Prefix-sum sekcji SN (spec §5.3 arytmetyka, zastosowana do sekcji GPZ —
 *  ZERO stałych PITCH: `width` każdej sekcji z liczby pól §3). Sekcje
 *  uporządkowane wg `order` (kanon ENM), nie wg kolejności wejścia. */
function layoutSections(sections: readonly CanonicalGpzSection[], startX: number): readonly SectionLayout[] {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const out: SectionLayout[] = [];
  let cursor = startX;
  ordered.forEach((section) => {
    const { fields, width } = layoutSectionFields(section, cursor);
    out.push({ section, x: cursor, width, fields });
    cursor += width + SECTION_GAP;
  });
  return out;
}

function sectionLayoutById(layouts: readonly SectionLayout[]): ReadonlyMap<string, SectionLayout> {
  return new Map(layouts.map((l) => [l.section.sectionId, l]));
}

/** Tekst etykiety sekcji (spec §4 „Szyna: napięcie nad lewym końcem szyny",
 *  kanon v2 SectionLabel) — WYODRĘBNIONE (użycie w DWÓCH miejscach: pomiar
 *  marginesu lewego niżej i budowa etykiety w pętli sekcji), zero
 *  duplikacji formuły tekstu. */
function sectionLabelText(section: CanonicalGpzSection): string {
  return `${section.label} · ${section.busVoltageKv} kV`;
}

/**
 * D2/k5b (BINDING): etykieta sekcji jest WYŚRODKOWANA na `busLeftX`
 * (`resolveSimpleAnchoredLabel`, placement 'above': `x = anchor.x - width/2`)
 * — dla sekcji NAJBARDZIEJ W LEWO (`order` najmniejszy) `busLeftX` = start
 * layoutu sekcji, a bez marginesu ten start leży w originie GPZ (x=0 w
 * scenie, `buildScene.ts` zaczepia GPZ na lewym krańcu arkusza) — etykieta
 * wystawałaby w lewo o `width/2` NA UJEMNE `x` (obcięta lewą krawędzią
 * arkusza, potwierdzone na fixturze: „Sekcja 1 · 15 kV" przy x≈-56).
 * Naprawa TAM GDZIE PRZYCZYNA (spec §4 „etykieta ma slot WŁASNY, leader
 * wyjątkiem" — clamp pozycji zniekształciłby ten slot, przesunięcie startu
 * układu sekcji go zachowuje): start sekcji przesunięty w prawo o połowę
 * szerokości etykiety NAJBARDZIEJ LEWEJ sekcji (ta sama formuła tekstu jak
 * przy budowie `sectionLabels` niżej — `sectionLabelText`). Sekcje inne niż
 * najbardziej lewa mogą też mieć etykietę szerszą niż ich własna kolumna,
 * ale wystają w kolumnę SĄSIADA (SECTION_GAP), nie za krawędź arkusza — poza
 * zakresem D2 (potwierdzone na fixturze: 1 sekcja, brak sąsiada z tej strony). */
function firstSectionLabelLeftMargin(sections: readonly CanonicalGpzSection[]): number {
  if (sections.length === 0) return 0;
  const first = [...sections].sort((a, b) => a.order - b.order)[0];
  const halfWidth = Math.ceil(measureLabelWidth(sectionLabelText(first), 't2') / 2);
  return snapUp(halfWidth);
}

/** Sekcja docelowa transformatora — 1:1 z v2 (`GpzCanonicalRenderer.tsx`
 *  `TransformersBlock`): mapowanie przez `lvSectionId`, fallback po indeksie
 *  wśród sekcji uporządkowanych `order`. */
function targetSectionForTransformer(
  transformer: CanonicalGpzTransformer,
  index: number,
  byId: ReadonlyMap<string, SectionLayout>,
  ordered: readonly SectionLayout[],
): SectionLayout | null {
  if (transformer.lvSectionId && byId.has(transformer.lvSectionId)) return byId.get(transformer.lvSectionId)!;
  return ordered[index] ?? null;
}

// ---------------------------------------------------------------------------
// composeGpz — kompozycja główna.
// ---------------------------------------------------------------------------

function computeBbox(symbols: readonly ComposedGpzSymbolInstance[], segments: readonly ComposedGpzSegment[]): V3Rect {
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
  segments.forEach((seg) => seg.points.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }));
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function switchStateOrUndefined(state: CanonicalGpzBay['esState'] | undefined): SwitchState | undefined {
  if (state == null || state === 'absent') return undefined;
  return state;
}

/**
 * Komponuje GPZ z prymitywów (spec §3, §8). Czysta funkcja — deterministyczna
 * (to samo wejście ⇒ identyczny wynik, test w `__tests__/gpz.test.ts`).
 *
 * `origin` — punkt zaczepienia na siatce arkusza (WORLD); `props.x`/`props.y`
 * z `GpzCanonicalRendererProps` to STARA geometria slotowa v2 (PITCH) i NIE
 * jest tu czytana (analogicznie do `StationMeasureInput`/UWAGA w `layout/measure.ts`).
 */
export function composeGpz(props: GpzCanonicalRendererProps, origin: { readonly x: number; readonly y: number }): GpzComposition {
  const originX = snapToGrid(origin.x);
  const originY = snapToGrid(origin.y);
  const parityKeys = new Set<string>(['gpz.root']);
  const missingData: string[] = [];
  const symbols: ComposedGpzSymbolInstance[] = [];
  const segments: ComposedGpzSegment[] = [];
  const sectionLabels: SimpleAnchoredOwnerInput[] = [];
  const transformerLabels: StationNameBandOwnerInput[] = [];
  const fieldDesignations: SimpleAnchoredOwnerInput[] = [];
  const fieldCaptions: PortCaptionOwnerInput[] = [];
  const sectionMetas: GpzSectionMeta[] = [];
  const transformerMetas: GpzTransformerMeta[] = [];

  const tag = (keys: readonly string[]): void => keys.forEach((k) => parityKeys.add(k));

  const hvSections = props.hvSections ?? [];
  const hasHvContent = hvSections.length > 0 || props.transformers.length > 0;

  if (!hasHvContent) {
    missingData.push('gpz.hv.missing', 'gpz.transformer.missing');
  } else {
    parityKeys.add('gpz.hv');
    if (props.transformers.length > 0) parityKeys.add('gpz.transformers');
  }

  // -- 1. Pola liniowe WN (hvSections) — rząd nad szyną WN, prefix-sum. -----
  const hvBusY = originY + HV_MARGIN_TOP;
  let hvLineBayCursor = originX + SECTION_MARGIN;
  const hvLineBaySpecTemplate = hvLineBaySpec();
  const hvLineBayFootprint = stackFootprint(hvLineBaySpecTemplate.map((s) => s.symbolId));

  hvSections
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((hvSection) => {
      hvSection.bays.forEach((bay) => {
        const centerX = snapToGrid(hvLineBayCursor + hvLineBayFootprint.width / 2);
        const topY = hvBusY - GRID - hvLineBayFootprint.height;
        const stack = buildFieldStack(
          hvLineBaySpecTemplate,
          centerX,
          topY,
          (_i, id) => `gpz-canonical-hv-bay-${bay.bayRef}-${id}`,
          (_i, id) => (id === 'breaker' ? bay.cbState : id === 'disconnector' ? bay.dsState : undefined),
          { sectionId: hvSection.sectionId, bayRef: bay.bayRef },
        );
        symbols.push(...stack.instances);
        stack.instances.forEach((instance) => tag(instance.meta.parityKeys));
        segments.push({
          ownerRef: `${bay.bayRef}#hv-bus-tap`,
          points: [{ x: centerX, y: stack.bottomPort.y }, { x: centerX, y: hvBusY }],
          meta: { parityKeys: [], sectionId: hvSection.sectionId, bayRef: bay.bayRef },
        });
        const designation = bay.bayNumber ?? bay.feederName ?? null;
        if (designation) {
          fieldDesignations.push({
            ownerRef: `${bay.bayRef}#designation`,
            ownerKind: 'apparatus',
            text: designation,
            labelClass: 't3',
            anchor: { x: centerX, y: topY },
            placement: 'above',
          });
        }
        hvLineBayCursor += hvLineBayFootprint.width + HV_LINE_BAY_GAP;
      });
    });

  // -- 2. Sekcje SN — layout X (prefix-sum), niezależny od WN/TR. -----------
  // D2/k5b (patrz `firstSectionLabelLeftMargin`): rezerwacja slotu etykiety
  // sekcji najbardziej w lewo, żeby nie wystawała za lewą krawędź arkusza.
  const sectionsStartX =
    (hvSections.length > 0 ? hvLineBayCursor + SECTION_GAP : originX) + firstSectionLabelLeftMargin(props.sections);
  const sectionLayouts = layoutSections(props.sections, sectionsStartX);
  const sectionById = sectionLayoutById(sectionLayouts);

  // -- 3. Geometria pionowa: WN → pole WN TR → TR2W → pole TR → szyna SN. --
  const hvFieldSpecTemplate = hvTrFieldSpec();
  const hvFieldFootprint = stackFootprint(hvFieldSpecTemplate.map((s) => s.symbolId));
  const trFieldSpecTemplate = trFieldSpec();
  const trFieldFootprint = stackFootprint(trFieldSpecTemplate.map((s) => s.symbolId));
  const trHeight = SYMBOL_DEFS.transformer2W.height;

  const hvFieldTopY = hvBusY + GRID;
  const trTopY = hvFieldTopY + hvFieldFootprint.height + STACK_GAP;
  const trFieldTopY = trTopY + trHeight + STACK_GAP;
  const snBusY = props.transformers.length > 0
    ? trFieldTopY + trFieldFootprint.height + STACK_GAP
    : hvBusY + 2 * HV_MARGIN_TOP;

  // -- 4. Sekcje SN: szyna(y) + pola liniowe/sprzęgła/pomiarowe. ------------
  sectionLayouts.forEach((layout) => {
    const topology: CanonicalGpzBusbarTopology = layout.section.busbarTopology ?? 'single';
    sectionMetas.push({
      sectionId: layout.section.sectionId,
      order: layout.section.order,
      label: layout.section.label,
      busVoltageKv: layout.section.busVoltageKv,
      busbarTopology: topology,
    });
    tag(['gpz.section']);

    const busLeftX = layout.x;
    const busRightX = layout.x + layout.width;

    const primaryBusMeta: GpzElementMeta = {
      parityKeys: ['gpz.bus.sn'],
      testId: `gpz-canonical-section-${layout.section.sectionId}-bus`,
      sectionId: layout.section.sectionId,
      busbarRole: 'primary',
    };
    tag(primaryBusMeta.parityKeys);
    segments.push({ ownerRef: `${layout.section.sectionId}#bus-primary`, points: [{ x: busLeftX, y: snBusY }, { x: busRightX, y: snBusY }], meta: primaryBusMeta });

    if (topology === 'double' || topology === 'ring') {
      // FIX-B (recenzja F5b): `snBusY` jest już wielokrotnością GRID, więc
      // `snapToGrid(snBusY - GRID/2)` wraca do `snBusY` (reserve pokrywał się
      // z primary) — `- GRID` daje 8px odstępu, NA siatce, bez zaokrąglania.
      const reserveY = snBusY - GRID;
      const reserveMeta: GpzElementMeta = {
        parityKeys: ['gpz.bus.sn.s2'],
        testId: `gpz-canonical-section-${layout.section.sectionId}-bus-s2`,
        sectionId: layout.section.sectionId,
        busbarRole: 'reserve',
        dashed: topology === 'double',
      };
      tag(reserveMeta.parityKeys);
      segments.push({ ownerRef: `${layout.section.sectionId}#bus-reserve`, points: [{ x: busLeftX, y: reserveY }, { x: busRightX, y: reserveY }], meta: reserveMeta });

      if (topology === 'ring') {
        const closureMeta: GpzElementMeta = {
          parityKeys: ['gpz.bus.sn.ring-closure'],
          testId: `gpz-canonical-section-${layout.section.sectionId}-ring-closure`,
          sectionId: layout.section.sectionId,
          ringClosure: true,
        };
        tag(closureMeta.parityKeys);
        segments.push({ ownerRef: `${layout.section.sectionId}#ring-closure`, points: [{ x: busRightX, y: reserveY }, { x: busRightX, y: snBusY }], meta: closureMeta });
      }
    }

    // Etykieta sekcji (label + napięcie) — spec §4 „Szyna: napięcie nad
    // lewym końcem szyny"; tu połączona z etykietą sekcji (kanon v2 SectionLabel).
    sectionLabels.push({
      ownerRef: `${layout.section.sectionId}#label`,
      ownerKind: 'busbar-voltage',
      text: sectionLabelText(layout.section),
      labelClass: 't2',
      anchor: { x: busLeftX, y: snBusY },
      placement: 'above',
    });
    tag(['gpz.section.label']);

    // Podpisy celu/kierunku pola (feederName/destinationLabel) — mechanizm
    // wierszy `colorSegmentLabelRows` (patrz nagłówek pliku: DECYZJA).
    // FIX-A (recenzja F5b): gdy pole nie ma `bayNumber` ANI `destinationLabel`,
    // oznacznik (`fieldDesignations`) i podpis celu (`fieldCaptions`) oba
    // spadały na `feederName` — ten sam tekst dwukrotnie. Dedup: caption z
    // `feederName` TYLKO gdy różni się od tekstu oznacznika (`designationText`,
    // ta sama formuła co przy budowie `fieldDesignations` niżej).
    const captionCandidates = layout.fields.map((field) => {
      const designationText = (field.bay.bayNumber ?? field.bay.feederName ?? '').trim();
      const raw = field.bay.destinationLabel
        ? `→ ${field.bay.destinationLabel}`
        : (field.bay.feederName && field.bay.feederName.trim() !== designationText ? field.bay.feederName : null);
      const text = raw?.trim();
      if (!text) return null;
      const width = snapUp(measureLabelWidth(text, 't3'));
      return { stationIndex: field.index, x: snapToGrid(field.centerX - width / 2), width, text };
    });
    const slots: readonly (SegmentLabelSlotX | null)[] = captionCandidates.map((c) => (c ? { stationIndex: c.stationIndex, x: c.x, width: c.width } : null));
    const rows = colorSegmentLabelRows(slots);
    const captionRowHeight = labelLineHeight('t3');

    layout.fields.forEach((field) => {
      const spec = field.spec;
      const footprint = stackFootprint(spec.map((s) => s.symbolId));
      const topY = snBusY + GRID;
      const stack = buildFieldStack(
        spec,
        field.centerX,
        topY,
        (_i, id) => `gpz-canonical-bay-${field.bay.bayRef}-${id}`,
        (_i, id) => {
          if (id === 'breaker') return field.bay.cbState;
          if (id === 'disconnector') return field.bay.dsState;
          if (id === 'earthSwitch') return switchStateOrUndefined(field.bay.esState);
          return undefined;
        },
        { sectionId: layout.section.sectionId, bayRef: field.bay.bayRef },
      );
      symbols.push(...stack.instances);
      stack.instances.forEach((instance) => tag([...instance.meta.parityKeys, 'gpz.bay']));

      const powerPathMeta: GpzElementMeta = {
        parityKeys: ['gpz.bay.power_path'],
        sectionId: layout.section.sectionId,
        bayRef: field.bay.bayRef,
      };
      tag(powerPathMeta.parityKeys);
      segments.push({
        ownerRef: `${field.bay.bayRef}#descent`,
        points: [{ x: field.centerX, y: snBusY }, { x: field.centerX, y: stack.topPort.y }],
        meta: powerPathMeta,
      });

      const designation = (field.bay.bayNumber ?? field.bay.feederName ?? '').trim();
      if (designation) {
        fieldDesignations.push({
          ownerRef: `${field.bay.bayRef}#designation`,
          ownerKind: 'apparatus',
          text: designation,
          labelClass: 't3',
          anchor: { x: snapToGrid(field.centerX + footprint.width / 2), y: stack.topPort.y },
          placement: 'right',
        });
      }

      const candidate = captionCandidates[field.index];
      if (candidate) {
        const rowIndex = rows.rowOf[field.index];
        const rowY = snBusY - GRID - (rowIndex + 1) * captionRowHeight;
        fieldCaptions.push({
          ownerRef: `${field.bay.bayRef}#caption`,
          text: candidate.text,
          anchorX: field.centerX,
          primaryRect: { x: candidate.x, y: rowY, width: candidate.width, height: captionRowHeight },
        });
      }
    });
  });

  // -- 5. Sprzęgła międzysekcyjne (props.couplers). -------------------------
  props.couplers.forEach((coupler) => {
    const leftLayout = sectionById.get(coupler.leftSectionId);
    const rightLayout = sectionById.get(coupler.rightSectionId);
    if (!leftLayout || !rightLayout) return;
    const first = leftLayout.x <= rightLayout.x ? leftLayout : rightLayout;
    const second = leftLayout.x <= rightLayout.x ? rightLayout : leftLayout;
    const gapStart = first.x + first.width;
    const gapEnd = second.x;
    const midX = snapToGrid((gapStart + gapEnd) / 2);
    const cbDef = SYMBOL_DEFS.breaker;
    const cbX = snapToGrid(midX - cbDef.width / 2);
    const cbY = snapToGrid(snBusY - cbDef.height / 2);
    const couplerMeta: GpzElementMeta = {
      parityKeys: ['gpz.coupler', 'gpz.apparatus.cb'],
      testId: `gpz-canonical-coupler-${coupler.couplerId}`,
      sectionId: coupler.leftSectionId,
    };
    tag(couplerMeta.parityKeys);
    symbols.push({
      symbolId: 'breaker',
      x: cbX,
      y: cbY,
      state: coupler.closedState,
      ports: portsInWorld('breaker', cbX, cbY),
      meta: couplerMeta,
    });
    segments.push({
      ownerRef: `${coupler.couplerId}#tie`,
      points: [{ x: gapStart, y: snBusY }, { x: gapEnd, y: snBusY }],
      meta: { parityKeys: ['gpz.coupler'], sectionId: coupler.leftSectionId },
    });
    fieldDesignations.push({
      ownerRef: `${coupler.couplerId}#designation`,
      ownerKind: 'apparatus',
      text: coupler.designation,
      labelClass: 't3',
      anchor: { x: midX, y: cbY },
      placement: 'above',
    });
  });

  // -- 6. Transformatory: pole WN TR → TR2W → pole TR. ----------------------
  const orderedSectionLayouts = sectionLayouts; // już wg `order`
  const transformerTapXs: number[] = [];
  props.transformers.forEach((transformer, index) => {
    const target = targetSectionForTransformer(transformer, index, sectionById, orderedSectionLayouts);
    const trCenterX = target ? snapToGrid(target.x + target.width / 2) : snapToGrid(originX + SECTION_MARGIN + SYMBOL_DEFS.transformer2W.width / 2);
    transformerTapXs.push(trCenterX);

    const hvBayTestIdBase = `gpz-canonical-hv-tr-bay-${transformer.transformerRef}`;
    const hvStack = buildFieldStack(
      hvFieldSpecTemplate,
      trCenterX,
      hvFieldTopY,
      (_i, id) => `${hvBayTestIdBase}-${id === 'disconnector' ? 'ds' : id === 'breaker' ? 'cb' : 'ct'}`,
      () => 'unknown',
      { transformerRef: transformer.transformerRef },
    );
    symbols.push(...hvStack.instances);
    hvStack.instances.forEach((instance) => tag(instance.meta.parityKeys));

    const hvConnectorMeta: GpzElementMeta = {
      parityKeys: ['gpz.transformer.hv_connector'],
      transformerRef: transformer.transformerRef,
      directTie110: false,
      terminatesAt: 'hv_tr_bay_apparatus',
    };
    tag(hvConnectorMeta.parityKeys);
    segments.push({
      ownerRef: `${transformer.transformerRef}#hv-connector`,
      points: [{ x: trCenterX, y: hvBusY }, { x: trCenterX, y: hvStack.topPort.y }],
      meta: hvConnectorMeta,
    });

    const trDef = SYMBOL_DEFS.transformer2W;
    const trX = snapToGrid(trCenterX - trDef.width / 2);
    const trMeta: GpzElementMeta = {
      parityKeys: ['gpz.transformer.symbol'],
      testId: `gpz-canonical-transformer-${transformer.transformerRef}`,
      transformerRef: transformer.transformerRef,
    };
    tag(trMeta.parityKeys);
    const trPorts = portsInWorld('transformer2W', trX, trTopY);
    symbols.push({ symbolId: 'transformer2W', x: trX, y: trTopY, ports: trPorts, meta: trMeta });

    // Zejście HV→TR: od dolnego portu pola WN TR do górnego portu TR2W (jeśli
    // pole WN TR kończy się wyżej niż TR — zwykle styk 1:1, ale krótki
    // odcinek zamyka geometrię niezależnie od ewentualnej różnicy gabarytów).
    segments.push({
      ownerRef: `${transformer.transformerRef}#hv-field-to-tr`,
      points: [{ x: trCenterX, y: hvStack.bottomPort.y }, { x: trCenterX, y: trTopY }],
      meta: { parityKeys: [], transformerRef: transformer.transformerRef },
    });

    const trFieldTestIdBase = `gpz-canonical-tr-field-${transformer.transformerRef}`;
    const trFieldStack = buildFieldStack(
      trFieldSpecTemplate,
      trCenterX,
      trFieldTopY,
      (_i, id) => `${trFieldTestIdBase}-${id === 'disconnector' ? 'ds' : id === 'breaker' ? 'cb' : id === 'currentTransformer' ? 'ct' : 'es'}`,
      () => 'unknown',
      { transformerRef: transformer.transformerRef },
    );
    symbols.push(...trFieldStack.instances);
    trFieldStack.instances.forEach((instance) => tag(instance.meta.parityKeys));

    const fieldAnchorMeta: GpzElementMeta = {
      parityKeys: ['gpz.transformer.field_anchor_connector'],
      transformerRef: transformer.transformerRef,
      directTieSn: false,
      terminatesAt: 'tr_field_anchor',
    };
    tag(fieldAnchorMeta.parityKeys);
    segments.push({
      ownerRef: `${transformer.transformerRef}#field-anchor`,
      points: [{ x: trCenterX, y: trTopY + trHeight }, { x: trCenterX, y: trFieldStack.topPort.y }],
      meta: fieldAnchorMeta,
    });

    // Zejście pole TR → szyna SN sekcji docelowej (kotwiczenie na busie, NIE
    // bezpośrednio do TR — spec §8/§3: „ZERO bezpośredniego styku z szyną SN").
    segments.push({
      ownerRef: `${transformer.transformerRef}#tr-field-to-bus`,
      points: [{ x: trCenterX, y: trFieldStack.bottomPort.y }, { x: trCenterX, y: snBusY }],
      meta: { parityKeys: ['gpz.bay.power_path'], transformerRef: transformer.transformerRef, sectionId: target?.section.sectionId },
    });

    transformerLabels.push({
      ownerRef: `${transformer.transformerRef}#label`,
      nameSlot: {
        x: snapToGrid(trCenterX + trDef.width / 2 + GRID),
        y: trTopY,
        width: snapUp(Math.max(
          measureLabelWidth(transformer.designation, 't1'),
          measureLabelWidth(`${transformer.snMva} MVA`, 't2'),
          measureLabelWidth(`${transformer.uhvKv}/${transformer.ulvKv} kV`, 't2'),
        )),
        height: labelLineHeight('t1') + 2 * labelLineHeight('t2'),
      },
      rows: [
        { text: transformer.designation, labelClass: 't1' },
        { text: `${transformer.snMva} MVA`, labelClass: 't2' },
        { text: `${transformer.uhvKv}/${transformer.ulvKv} kV`, labelClass: 't2' },
      ],
    });

    transformerMetas.push({
      transformerRef: transformer.transformerRef,
      designation: transformer.designation,
      hvBayTestId: hvBayTestIdBase,
      trFieldTestId: trFieldTestIdBase,
    });
  });

  // -- 7. Szyna WN 110 kV — span z zaczepów WN (pola WN + taps TR), ZAWSZE
  // gdy hasHvContent (§3: szyna WN obejmuje wszystkie pola WN i wszystkie
  // zaczepy pól WN TR — zaczepy zebrane WPROST z kroku 6, zero
  // rekonstrukcji ze zbudowanych symboli).
  if (hasHvContent) {
    const hvBayLeft = hvSections.length > 0 ? originX + SECTION_MARGIN : null;
    const hvBayRight = hvSections.length > 0 ? hvLineBayCursor - HV_LINE_BAY_GAP : null;
    const candidatesX = [
      ...(hvBayLeft != null ? [hvBayLeft] : []),
      ...(hvBayRight != null ? [hvBayRight] : []),
      ...transformerTapXs,
    ];
    const left = candidatesX.length > 0 ? snapToGrid(Math.min(...candidatesX) - SECTION_MARGIN) : originX;
    const right = candidatesX.length > 0 ? snapToGrid(Math.max(...candidatesX) + SECTION_MARGIN) : originX + 4 * GRID;
    const busLeft = left;
    const busRight = right;

    const hvBusMeta: GpzElementMeta = { parityKeys: ['gpz.bus.hv'], testId: 'gpz-canonical-hv-bus', busbarRole: 'primary' };
    tag(hvBusMeta.parityKeys);
    segments.push({ ownerRef: `${props.id}#hv-bus`, points: [{ x: busLeft, y: hvBusY }, { x: busRight, y: hvBusY }], meta: hvBusMeta });
  }

  // -- 8. Nazwa GPZ (header, spec §4 „GPZ: nazwa (t1), header bloku"). ------
  const nameRows: StationNameBandRow[] = [{ text: props.name, labelClass: 't1' }];
  const stationName: StationNameBandOwnerInput = {
    ownerRef: props.id,
    nameSlot: { x: originX, y: originY, width: snapUp(measureLabelWidth(props.name, 't1') + 2 * GRID), height: labelLineHeight('t1') },
    rows: nameRows,
  };

  return {
    gpzId: props.id,
    symbols,
    segments,
    labels: { stationName, sectionLabels, transformerLabels, fieldDesignations, fieldCaptions },
    sections: sectionMetas,
    transformers: transformerMetas,
    parityKeys,
    missingData,
    bbox: computeBbox(symbols, segments),
  };
}

// ---------------------------------------------------------------------------
// Wyrocznie (spec §11, migracja inwariantów GPZ §8).
// ---------------------------------------------------------------------------

/** grid_probe: wszystkie originy symboli i wierzchołki odcinków na siatce. */
export function allGpzSymbolsOnGrid(composition: GpzComposition): boolean {
  const symbolsOk = composition.symbols.every((s) => s.x % GRID === 0 && s.y % GRID === 0);
  const segmentsOk = composition.segments.every((seg) => seg.points.every((p) => p.x % GRID === 0 && p.y % GRID === 0));
  return symbolsOk && segmentsOk;
}

/** Zero nachodzeń symbol↔symbol (spec §11.1). */
export function noGpzSymbolOverlaps(composition: GpzComposition): boolean {
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

/** endsAtPorts (spec §11.3): każdy odcinek kończy się w porcie symbolu lub na
 *  szynie (busbar) tej samej kompozycji — analogicznie do
 *  `compose/station.ts` `internalSegmentsEndAtPortsOrBus`. */
export function gpzInternalSegmentsEndAtPortsOrBus(composition: GpzComposition): boolean {
  const ports: RoutePort[] = [];
  composition.symbols.forEach((s) => Object.values(s.ports).forEach((p) => ports.push(p)));
  const busSegments = composition.segments.filter((s) => s.meta.busbarRole === 'primary' || s.meta.ringClosure);

  const endpointValid = (p: RouteVertex): boolean => {
    if (ports.some((port) => port.x === p.x && port.y === p.y)) return true;
    return busSegments.some((bus) => {
      const [a, b] = bus.points;
      if (!a || !b) return false;
      if (a.y === b.y && a.y === p.y) {
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        return p.x >= minX && p.x <= maxX;
      }
      if (a.x === b.x && a.x === p.x) {
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        return p.y >= minY && p.y <= maxY;
      }
      return false;
    });
  };

  return composition.segments.every((seg) => {
    const first = seg.points[0];
    const last = seg.points[seg.points.length - 1];
    return !!first && !!last && endpointValid(first) && endpointValid(last);
  });
}

/**
 * no_direct_110kv_tr_tie_without_switchgear (migracja
 * `GpzCanonicalRenderer.noDirectTie.test.tsx` 1:1, spec §8): dla KAŻDEGO
 * transformatora — połączenie WN kończy się na aparaturze pola WN TR (nie na
 * szynie WN wprost do TR), połączenie SN kończy się na aparaturze pola TR
 * (nie wprost na szynie SN), i ŻADEN segment „lv_connector" (bezpośredni
 * styk) nie istnieje.
 */
export function noDirectTransformerBusTies(composition: GpzComposition): boolean {
  return composition.transformers.every((tr) => {
    const hvConnector = composition.segments.find(
      (s) => s.meta.transformerRef === tr.transformerRef && s.meta.parityKeys.includes('gpz.transformer.hv_connector'),
    );
    const fieldAnchor = composition.segments.find(
      (s) => s.meta.transformerRef === tr.transformerRef && s.meta.parityKeys.includes('gpz.transformer.field_anchor_connector'),
    );
    const forbiddenDirectLv = composition.segments.some(
      (s) => s.meta.transformerRef === tr.transformerRef && s.meta.parityKeys.includes('gpz.transformer.lv_connector'),
    );
    const hasSymbol = (testId: string): boolean => composition.symbols.some((s) => s.meta.testId === testId);

    return (
      !!hvConnector && hvConnector.meta.directTie110 === false && hvConnector.meta.terminatesAt === 'hv_tr_bay_apparatus' &&
      !!fieldAnchor && fieldAnchor.meta.directTieSn === false && fieldAnchor.meta.terminatesAt === 'tr_field_anchor' &&
      !forbiddenDirectLv &&
      hasSymbol(`${tr.hvBayTestId}-ds`) && hasSymbol(`${tr.hvBayTestId}-cb`) && hasSymbol(`${tr.hvBayTestId}-ct`) &&
      hasSymbol(`${tr.trFieldTestId}-ds`) && hasSymbol(`${tr.trFieldTestId}-cb`) && hasSymbol(`${tr.trFieldTestId}-ct`) && hasSymbol(`${tr.trFieldTestId}-es`)
    );
  });
}

/** Wygodny selektor topologii sekcji po id (dla testów busbarTopology). */
export function busbarTopologyOf(composition: GpzComposition, sectionId: string): CanonicalGpzBusbarTopology | undefined {
  return composition.sections.find((s) => s.sectionId === sectionId)?.busbarTopology;
}
