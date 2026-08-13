/**
 * F13.2 (dyrektywa D3, audyt `SLD_ENGINEERING_CANON_AUDIT_D3_2026-07.md`
 * ustalenia D3-3/D3-11/D3-13; spec `SLD_CAD_SPEC_V3.md` §22.1) — fizyka
 * obrazu: skrzyżowanie ≠ połączenie.
 *
 * Czyste funkcje (zero DOM/losowości — determinizm P7):
 *  - `interiorCrossings(segments)` — wykrycie przecięć ŚCIŚLE WEWNĘTRZNYCH
 *    pionu z poziomem na torze mocy (warstwy adnotacji wyłączone tą samą
 *    regułą co wyrocznie ciągłości: `protectionTrip`/`measurementLink`/
 *    `leader` nie są torem mocy);
 *  - `bridgePointsForPolyline(points, crossings)` — punkty mostków
 *    półłukowych na linii PIONOWEJ (konwencja §22.1/D3-11: pion przeskakuje
 *    poziom, promień `BRIDGE_RADIUS = GRID/2`, jednolicie w całym rysunku);
 *  - `crossingBusGaps(segments)` — wyrocznia-składnik §22.1/§22.3: mostek na
 *    SZYNIE jest ZAKAZANY, więc każde przecięcie, w którym uczestniczy
 *    segment `kind==='bus'`/`'busGpz'`, jest LUKĄ (do naprawy routingiem,
 *    faza F13.3), nie kandydatem na mostek.
 *
 * DECYZJA ARCHITEKTA (F13.2, zapis w planie §F13): mostki są POCHODNĄ RENDERU
 * (kanwa/preview liczą je z tych funkcji przy rysowaniu ścieżki pionu) — scena
 * (`buildSceneV3`: punkty/porty/bbox) pozostaje BAJT-W-BAJT niezmieniona,
 * baseline'y §15.1 nietknięte. Wyrocznia `crossing_probe` sprawdza więc
 * KONTRAKT renderu: (a) zbiór przecięć sn×sn jest w całości pokryty
 * deterministycznym wyliczeniem mostków (z konstrukcji — obie strony liczą TĄ
 * SAMĄ funkcją), (b) zbiór przecięć z szyną = 0 (`crossingBusGaps`).
 */
import { GRID } from '../core/grid';
import type { RouteVertex } from '../layout/route';
import type { PreviewSegment } from '../compose/preview';

/** Promień mostka półłukowego [px świata] — §22.1: GRID/2. */
export const BRIDGE_RADIUS = GRID / 2;

/** Rodzaje segmentów NIE będące torem mocy (ta sama lista co wyłączenia
 *  wyroczni ciągłości — patrz `buildScene.ts` `isAnnotationSegment`). */
// S9-1: `sheetContinuation` (kreski znaku ciągu dalszego na złamaniu arkusza)
// leży NA torze, ale sama torem nie jest — bez tego wyjątku jej przecięcie z
// pionem łącznika byłoby czytane jako węzeł T i dostawałoby kropkę węzłową
// (`resolveTeeJunctions`), czyli rysunek KŁAMAŁBY o połączeniu elektrycznym.
const NON_POWER_KINDS: ReadonlySet<string> = new Set([
  'protectionTrip',
  'measurementLink',
  'leader',
  'sheetContinuation',
]);

/** Rodzaje segmentów będące SZYNĄ (mostek zakazany — §22.1). */
const BUS_KINDS: ReadonlySet<string> = new Set(['bus', 'busGpz']);

export interface PowerPathCrossing {
  /** Punkt przecięcia (świat). */
  readonly x: number;
  readonly y: number;
  /** Właściciele linii poziomej/pionowej (WHITE BOX — do raportów/luk). */
  readonly hOwnerRef?: string;
  readonly vOwnerRef?: string;
  /** Czy w przecięciu uczestniczy szyna (H lub V) — wtedy mostek ZAKAZANY. */
  readonly involvesBus: boolean;
}

interface FlatSeg {
  readonly a: RouteVertex;
  readonly b: RouteVertex;
  readonly ownerRef?: string;
  readonly isBus: boolean;
}

function flatten(segments: readonly PreviewSegment[]): { h: FlatSeg[]; v: FlatSeg[] } {
  const h: FlatSeg[] = [];
  const v: FlatSeg[] = [];
  for (const s of segments) {
    const kind = s.meta?.kind ?? 'sn';
    if (NON_POWER_KINDS.has(kind)) continue;
    const isBus = BUS_KINDS.has(kind);
    for (let i = 0; i + 1 < s.points.length; i++) {
      const a = s.points[i];
      const b = s.points[i + 1];
      if (a.y === b.y && a.x !== b.x) h.push({ a, b, ownerRef: s.meta?.ownerRef, isBus });
      else if (a.x === b.x && a.y !== b.y) v.push({ a, b, ownerRef: s.meta?.ownerRef, isBus });
    }
  }
  return { h, v };
}

/**
 * Przecięcia ŚCIŚLE WEWNĘTRZNE (oba odcinki przecinane w interiorze — styk
 * końcem, tj. węzeł T/L, NIE jest przecięciem: to legalne połączenie, którego
 * elektryczność rozstrzyga `junction_dot` / porty §16).
 * Deterministyczna kolejność wyniku: sort po (y, x).
 */
export function interiorCrossings(segments: readonly PreviewSegment[]): readonly PowerPathCrossing[] {
  const { h, v } = flatten(segments);
  const out: PowerPathCrossing[] = [];
  for (const hs of h) {
    const hx1 = Math.min(hs.a.x, hs.b.x);
    const hx2 = Math.max(hs.a.x, hs.b.x);
    const hy = hs.a.y;
    for (const vs of v) {
      const vy1 = Math.min(vs.a.y, vs.b.y);
      const vy2 = Math.max(vs.a.y, vs.b.y);
      const vx = vs.a.x;
      if (vx > hx1 && vx < hx2 && hy > vy1 && hy < vy2) {
        out.push({
          x: vx,
          y: hy,
          hOwnerRef: hs.ownerRef,
          vOwnerRef: vs.ownerRef,
          involvesBus: hs.isBus || vs.isBus,
        });
      }
    }
  }
  return out.sort((p, q) => (p.y - q.y) || (p.x - q.x));
}

/**
 * Punkty mostków dla JEDNEJ polilinii — dla każdego PIONOWEGO odcinka
 * polilinii zwraca posortowane (po y, rosnąco w kierunku rysowania odcinka)
 * współrzędne y przecięć sn×sn (bez szyn — te są luką, nie mostkiem), w
 * których render ma przerwać pion i poprowadzić półłuk (§22.1: pion
 * przeskakuje poziom).
 *
 * Zwraca mapę: indeks odcinka polilinii → lista y mostków.
 */
export function bridgePointsForPolyline(
  points: readonly RouteVertex[],
  crossings: readonly PowerPathCrossing[],
): ReadonlyMap<number, readonly number[]> {
  const out = new Map<number, readonly number[]>();
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.x !== b.x || a.y === b.y) continue; // tylko piony
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    const ys = crossings
      .filter((c) => !c.involvesBus && c.x === a.x && c.y > y1 && c.y < y2)
      .map((c) => c.y)
      .sort((p, q) => p - q);
    if (ys.length > 0) {
      // Kierunek rysowania odcinka (a→b) może być w dół lub w górę — ścieżka
      // SVG jest budowana w tym kierunku, więc kolejność mostków musi mu
      // odpowiadać.
      out.set(i, a.y < b.y ? ys : [...ys].reverse());
    }
  }
  return out;
}

/**
 * Ścieżka SVG pionowego odcinka z mostkami: linia przerwana w ±BRIDGE_RADIUS
 * wokół każdego mostka, półłuk (sweep w prawo — jednolita konwencja D3-11)
 * ponad linią poziomą. Czysta funkcja tekstowa (testowalna bez DOM).
 */
export function verticalPathWithBridges(
  a: RouteVertex,
  b: RouteVertex,
  bridgeYs: readonly number[],
): string {
  const dir = a.y < b.y ? 1 : -1;
  let d = `M${a.x},${a.y}`;
  let cursorY = a.y;
  for (const by of bridgeYs) {
    const before = by - dir * BRIDGE_RADIUS;
    const after = by + dir * BRIDGE_RADIUS;
    d += ` L${a.x},${before}`;
    // sweep=1 przy rysowaniu w dół i sweep=0 w górę ⇒ łuk ZAWSZE wybrzusza
    // się w PRAWO (x+) — jednolita konwencja mostka w całym rysunku (D3-11).
    const sweep = dir === 1 ? 1 : 0;
    d += ` A${BRIDGE_RADIUS},${BRIDGE_RADIUS} 0 0,${sweep} ${a.x},${after}`;
    cursorY = after;
  }
  void cursorY;
  d += ` L${b.x},${b.y}`;
  return d;
}

/**
 * Pełna ścieżka SVG polilinii z mostkami — publiczne API dla renderu
 * (`SldCanvasV3`/`CompositionPreview`): odcinki poziome/bez mostków jako `L`,
 * odcinki pionowe z mostkami wg `verticalPathWithBridges` (bez powtórnego
 * `M`). Gdy `bridges` puste ⇒ wynik IDENTYCZNY z `pointsToPath`
 * (`compose/preview.tsx`) — zero zmiany renderu tam, gdzie nie ma przecięć
 * (dowód w teście).
 */
export function polylinePathWithBridges(
  points: readonly RouteVertex[],
  bridges: ReadonlyMap<number, readonly number[]>,
): string {
  if (points.length === 0) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const ys = bridges.get(i);
    if (!ys || ys.length === 0 || a.x !== b.x) {
      d += ` L${b.x},${b.y}`;
      continue;
    }
    const dir = a.y < b.y ? 1 : -1;
    const sweep = dir === 1 ? 1 : 0;
    for (const by of ys) {
      d += ` L${a.x},${by - dir * BRIDGE_RADIUS}`;
      d += ` A${BRIDGE_RADIUS},${BRIDGE_RADIUS} 0 0,${sweep} ${a.x},${by + dir * BRIDGE_RADIUS}`;
    }
    d += ` L${b.x},${b.y}`;
  }
  return d;
}

export interface CrossingBusGap {
  readonly x: number;
  readonly y: number;
  readonly hOwnerRef?: string;
  readonly vOwnerRef?: string;
}

/** Wyrocznia-składnik §22.1/§22.3: przecięcia, w których uczestniczy SZYNA —
 *  mostek zakazany, wymagana naprawa routingiem (F13.3). 0 = zielono. */
export function crossingBusGaps(segments: readonly PreviewSegment[]): readonly CrossingBusGap[] {
  return interiorCrossings(segments)
    .filter((c) => c.involvesBus)
    .map((c) => ({ x: c.x, y: c.y, hOwnerRef: c.hOwnerRef, vOwnerRef: c.vOwnerRef }));
}

// ---------------------------------------------------------------------------
// §22.1 junction_dot_probe — kropka węzłowa ⇔ realny węzeł rozgałęzienia tras.
// ---------------------------------------------------------------------------

export interface JunctionDotGap {
  readonly x: number;
  readonly y: number;
  readonly reason: 'rozgalezienie-bez-kropki' | 'kropka-bez-rozgalezienia';
}

interface JunctionSceneInput {
  readonly segments: readonly PreviewSegment[];
  readonly symbols: ReadonlyArray<{
    readonly symbolId: string;
    readonly x: number;
    readonly y: number;
  }>;
}

/** Tolerancja dopasowania kropka↔węzeł [px świata] — środek symbolu kropki
 *  musi leżeć w promieniu GRID od punktu T-węzła (symbol snapowany do GRID,
 *  węzeł na osi trasy — GRID pokrywa wszystkie legalne zakotwiczenia). */
const DOT_MATCH_TOLERANCE = GRID;

/**
 * Realne węzły ROZGAŁĘZIENIA TRAS (świat): punkt, w którym koniec odcinka
 * trasy ZEWNĘTRZNEJ (`ownerRef` z prefiksem `seg/`) ląduje we WNĘTRZU
 * odcinka INNEJ trasy zewnętrznej — klasyczny T-węzeł magistrala×odgałęzienie.
 * (Styki tras z portami pól/stacji NIE są węzłami tras — rozstrzyga je §16;
 * kropka jest konwencją WĘZŁA TRASOWEGO, spec §22.1.)
 */
export function externalBranchNodes(segments: readonly PreviewSegment[]): readonly RouteVertex[] {
  // §16-v3: słupek terminalny (`kind==='openTerminal'`) NIE jest torem —
  // koniec biegu otwartego dotyka jego ŚRODKA z konstrukcji (znak końca,
  // nie węzeł elektryczny); bez wykluczenia każdy słupek czytałby się jako
  // fałszywy T-węzeł „rozgalezienie-bez-kropki" (pomiar: 13 luk na fixturze
  // referencyjnej po dorysowaniu realnych ogonów otwartych ENM).
  const ext = segments.filter(
    (s) =>
      (s.meta?.ownerRef ?? '').startsWith('seg/') &&
      s.meta?.kind !== 'openTerminal' &&
      // S9-1: kreski znaku ciągu dalszego (złamanie arkusza) leżą NA torze, ale
      // nie są torem — nie tworzą węzła T (jak słupek terminalny wyżej).
      s.meta?.kind !== 'sheetContinuation',
  );
  const nodes: RouteVertex[] = [];
  const seen = new Set<string>();
  for (const s of ext) {
    for (const pt of [s.points[0], s.points[s.points.length - 1]]) {
      for (const other of ext) {
        if (other === s || (other.meta?.ownerRef ?? '') === (s.meta?.ownerRef ?? '')) continue;
        for (let i = 0; i + 1 < other.points.length; i++) {
          const a = other.points[i];
          const b = other.points[i + 1];
          const interiorH = a.y === b.y && pt.y === a.y
            && pt.x > Math.min(a.x, b.x) && pt.x < Math.max(a.x, b.x);
          const interiorV = a.x === b.x && pt.x === a.x
            && pt.y > Math.min(a.y, b.y) && pt.y < Math.max(a.y, b.y);
          if (interiorH || interiorV) {
            const key = `${pt.x},${pt.y}`;
            if (!seen.has(key)) {
              seen.add(key);
              nodes.push(pt);
            }
          }
        }
      }
    }
  }
  return nodes.sort((p, q) => (p.y - q.y) || (p.x - q.x));
}

/**
 * KROPKA-WEZLOWA (V12K-150, spec §22.1, IEC 60617) — realne węzły ODCZEPÓW
 * LATERALNYCH POLA (świat): punkt na osi toru głównego, w którym odgałęzia się
 * aparat boczny (ES/VT/SA — `compose/station.ts`/`compose/gpz.ts` budują odcinek
 * `#lateral-…` jako `[{anchor na osi}, {port aparatu bocznego}]`, więc `points[0]`
 * = WĘZEŁ przyłączenia na osi, ta sama prawda co wyrocznia W1b
 * `buildScene.w1MatrixVariants.test` „start odczepu = oś"). W ODRÓŻNIENIU od
 * `externalBranchNodes` (T-węzły TRAS zewnętrznych `seg/…`) te węzły powstają z
 * DANYCH ODGAŁĘZIENIA pola (ownerRef `#lateral-`), nie z heurystyki
 * geometrycznego przecięcia — dług W1b (V12K-150) zamknięty: junction_dot_probe
 * liczy teraz również odczepy WEWNĄTRZ pola, nie tylko węzły tras.
 *
 * Kawałki rozcięte węzłem T (`#tee-N`, `buildScene.resolveTeeJunctions`) są
 * WYKLUCZONE — ich `points[0]` to punkt rozcięcia kabla, nie odczep lateralny
 * (odczep jest krótki i poziomy, nie bywa rozcinany; filtr chroni przed
 * fałszywym węzłem, gdyby kiedyś był).
 */
export function lateralBranchNodes(segments: readonly PreviewSegment[]): readonly RouteVertex[] {
  const nodes: RouteVertex[] = [];
  const seen = new Set<string>();
  for (const s of segments) {
    const ref = s.meta?.ownerRef ?? '';
    if (!ref.includes('#lateral-') || ref.includes('#tee-')) continue;
    const tap = s.points[0];
    if (!tap) continue;
    const key = `${tap.x},${tap.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      nodes.push(tap);
    }
  }
  return nodes.sort((p, q) => (p.y - q.y) || (p.x - q.x));
}

/**
 * junction_dot_probe (spec §22.1, D3-5): (a) każdy realny węzeł rozgałęzienia
 * ma kropkę węzłową (`junction`/`branchJunction`) w promieniu GRID;
 * (b) żadna kropka bez realnego węzła. Węzły = T-węzły TRAS zewnętrznych
 * (`externalBranchNodes`) ∪ odczepy LATERALNE pól (`lateralBranchNodes`,
 * V12K-150 — kropka na odgałęzieniu ES/VT/SA w scenie produkcyjnej). Rozmiary
 * symboli podaje wołający (mapą symbolId→{width,height}) — moduł nie importuje
 * SYMBOL_DEFS, żeby pozostać czysty względem warstwy symboli (wołający:
 * acceptance/testy).
 */
export function junctionDotGaps(
  scene: JunctionSceneInput,
  symbolSizes: Readonly<Record<string, { readonly width: number; readonly height: number }>>,
): readonly JunctionDotGap[] {
  const nodeSeen = new Set<string>();
  const nodes: RouteVertex[] = [];
  for (const n of [...externalBranchNodes(scene.segments), ...lateralBranchNodes(scene.segments)]) {
    const key = `${n.x},${n.y}`;
    if (!nodeSeen.has(key)) {
      nodeSeen.add(key);
      nodes.push(n);
    }
  }
  const dots = scene.symbols
    .filter((s) => s.symbolId === 'junction' || s.symbolId === 'branchJunction')
    .map((s) => {
      const size = symbolSizes[s.symbolId] ?? { width: 0, height: 0 };
      return { cx: s.x + size.width / 2, cy: s.y + size.height / 2 };
    });
  const gaps: JunctionDotGap[] = [];
  for (const n of nodes) {
    const hit = dots.some((d) => Math.abs(d.cx - n.x) <= DOT_MATCH_TOLERANCE && Math.abs(d.cy - n.y) <= DOT_MATCH_TOLERANCE);
    if (!hit) gaps.push({ x: n.x, y: n.y, reason: 'rozgalezienie-bez-kropki' });
  }
  for (const d of dots) {
    const hit = nodes.some((n) => Math.abs(d.cx - n.x) <= DOT_MATCH_TOLERANCE && Math.abs(d.cy - n.y) <= DOT_MATCH_TOLERANCE);
    if (!hit) gaps.push({ x: d.cx, y: d.cy, reason: 'kropka-bez-rozgalezienia' });
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// §22.3 bus_band_clearance_probe + entry_collinearity_probe (F13.3, D3-4/D3-15).
// ---------------------------------------------------------------------------

/** Pas ochronny szyny: ±2×GRID od osi (spec §22.3 — „żaden pion trasy OBCEJ
 *  nie przechodzi przez pas; do pasa wchodzą wyłącznie zejścia PÓL tej szyny"). */
export const BUS_BAND_HALF = 2 * GRID;

/** Zakres własności stacji/GPZ: dwa pierwsze człony ścieżki `ownerRef`
 *  (`stn/⟨id⟩`, `gpz/⟨id⟩`) — pola (`stn/⟨id⟩/sn_field/…`) i szyna
 *  (`stn/⟨id⟩/station#sn-bus`) tej samej stacji dzielą prefiks; trasy
 *  zewnętrzne (`seg/⟨id⟩/…`) nigdy. */
function ownerScope(ownerRef: string | undefined): string {
  return (ownerRef ?? '').split('/').slice(0, 2).join('/');
}

export interface BusBandGap {
  /** Właściciel szyny, której pas naruszono. */
  readonly busOwnerRef?: string;
  /** Oś Y szyny. */
  readonly busY: number;
  /** Naruszający pion: x i właściciel (WHITE BOX — do raportu). */
  readonly x: number;
  readonly vOwnerRef?: string;
}

/**
 * bus_band_clearance_probe (spec §22.3, D3-4/P-5): pion OBCEJ trasy (inny
 * zakres własności niż stacja szyny) przechodzący przez pas ±2×GRID osi szyny
 * w jej rozpiętości X (krawędzie WŁĄCZNIE — pomiar P-5: naruszenia leżą
 * DOKŁADNIE na `x = początek szyny`). 0 = zielono.
 */
export function busBandClearanceGaps(segments: readonly PreviewSegment[]): readonly BusBandGap[] {
  const { v } = flatten(segments);
  const gaps: BusBandGap[] = [];
  for (const s of segments) {
    const kind = s.meta?.kind ?? 'sn';
    if (!BUS_KINDS.has(kind)) continue;
    const scope = ownerScope(s.meta?.ownerRef);
    for (let i = 0; i + 1 < s.points.length; i++) {
      const a = s.points[i];
      const b = s.points[i + 1];
      if (a.y !== b.y || a.x === b.x) continue; // pas dotyczy szyn POZIOMYCH
      const busY = a.y;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      for (const vs of v) {
        if (vs.isBus) continue;
        if (ownerScope(vs.ownerRef) === scope) continue; // zejścia PÓL tej szyny — legalne
        const vy0 = Math.min(vs.a.y, vs.b.y);
        const vy1 = Math.max(vs.a.y, vs.b.y);
        if (vs.a.x >= x0 && vs.a.x <= x1 && vy0 < busY + BUS_BAND_HALF && vy1 > busY - BUS_BAND_HALF) {
          gaps.push({ busOwnerRef: s.meta?.ownerRef, busY, x: vs.a.x, vOwnerRef: vs.ownerRef });
        }
      }
    }
  }
  return gaps.sort((p, q) => (p.busY - q.busY) || (p.x - q.x));
}

export interface EntryCollinearityGap {
  readonly x: number;
  /** Zakres Y pokrycia (interior obu pionów). */
  readonly y0: number;
  readonly y1: number;
  readonly externalOwnerRef?: string;
  readonly internalOwnerRef?: string;
}

/**
 * entry_collinearity_probe (D3-15, audyt §6a): pion trasy ZEWNĘTRZNEJ
 * (`seg/…`) WSPÓŁLINIOWY (to samo X, pokrycie interiorów w Y) z pionem
 * WEWNĘTRZNYM stacji/GPZ (`stn/…`, `gpz/…`) — kabel zewnętrzny i tor pola
 * rysują się jako JEDNA kreska („kabel ląduje na szynie z góry", pole
 * wizualnie ominięte). Dotknięcie samym końcem (styk portowy) NIE jest
 * pokryciem. 0 = zielono.
 */
export function entryCollinearityGaps(segments: readonly PreviewSegment[]): readonly EntryCollinearityGap[] {
  const { v } = flatten(segments);
  const ext = v.filter((s) => (s.ownerRef ?? '').startsWith('seg/'));
  const internal = v.filter((s) => {
    const o = s.ownerRef ?? '';
    return o.startsWith('stn/') || o.startsWith('gpz/');
  });
  const gaps: EntryCollinearityGap[] = [];
  for (const e of ext) {
    const ey0 = Math.min(e.a.y, e.b.y);
    const ey1 = Math.max(e.a.y, e.b.y);
    for (const it of internal) {
      if (it.a.x !== e.a.x) continue;
      const iy0 = Math.min(it.a.y, it.b.y);
      const iy1 = Math.max(it.a.y, it.b.y);
      const o0 = Math.max(ey0, iy0);
      const o1 = Math.min(ey1, iy1);
      if (o1 > o0) {
        gaps.push({ x: e.a.x, y0: o0, y1: o1, externalOwnerRef: e.ownerRef, internalOwnerRef: it.ownerRef });
      }
    }
  }
  return gaps.sort((p, q) => (p.y0 - q.y0) || (p.x - q.x));
}
