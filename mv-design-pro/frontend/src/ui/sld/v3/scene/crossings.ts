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
 * ROZSTRZYGNIĘCIE ARCHITEKTA S7-P2 (2026-10-30, `docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md`
 * §12): przecięcie dwóch kabli BEZ węzła modelu jest skrzyżowaniem z mostkiem — KAŻDE,
 * nie tylko kabla z pola GPZ. Kropka węzłowa stoi wyłącznie tam, gdzie w modelu istnieje
 * węzeł (`PreviewElementMeta.wezelModelu`): węzeł nazwany toru albo węzeł pola, z którego
 * odchodzi odczep. Dawne rozcinanie kabla poziomego w punkcie przecięcia z kropką
 * „węzła T" rysowało połączenie, którego w sieci nie ma (92 kropki w 58 fiksturach, żadna
 * z węzłem modelu) — skasowane. Warunek odbioru: zero kropek bez węzła modelu
 * (`junctionDotGaps`) i każde przecięcie toru mocy z mostkiem (`przecieciaBezMostka`).
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
import { APPARATUS_STACK_VERTICAL_GAP } from '../layout/apparatusStack';
import type { RouteVertex } from '../layout/route';
import type { PreviewSegment } from '../compose/preview';
import { jestZnacznikiemToru } from './znacznikiToru';

/** Promień mostka półłukowego [px świata] — §22.1: GRID/2. */
export const BRIDGE_RADIUS = GRID / 2;

/** Rodzaje segmentów NIE będące torem mocy (ta sama lista co wyłączenia
 *  wyroczni ciągłości — patrz `buildScene.ts` `isAnnotationSegment`). */
// S9-1: `sheetContinuation` (kreski znaku ciągu dalszego na złamaniu arkusza)
// leży NA torze, ale sama torem nie jest — bez tego wyjątku jej przecięcie z
// pionem łącznika byłoby czytane jako skrzyżowanie toru mocy i dostawałoby mostek.
const NON_POWER_KINDS: ReadonlySet<string> = new Set([
  'protectionTrip',
  'measurementLink',
  'leader',
  'sheetContinuation',
  // Znak powiązania (`scene/elementyToru.ts`) — marker na końcu toru, nie tor.
  'tieMarker',
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
 * Wyrocznia odbioru §22.1 (rozstrzygnięcie S7-P2 z 2026-10-30): przecięcia toru mocy
 * sn×sn, których NIE pokrywa mostek żadnego odcinka sceny — ta sama funkcja mostków
 * (`bridgePointsForPolyline`), którą kanwa buduje ścieżkę pionu (`SldCanvasV3`), więc
 * wynik niepusty znaczy: kanwa narysuje to przecięcie bez przeskoku (czytane jak
 * połączenie). Przecięcia z szyną są osobną luką (`crossingBusGaps`) — mostek na szynie
 * jest zakazany. 0 = zielono.
 */
export function przecieciaBezMostka(segments: readonly PreviewSegment[]): readonly PowerPathCrossing[] {
  const crossings = interiorCrossings(segments).filter((c) => !c.involvesBus);
  if (crossings.length === 0) return [];
  const pokryte = new Set<string>();
  for (const s of segments) {
    if (NON_POWER_KINDS.has(s.meta?.kind ?? 'sn')) continue;
    for (const [i, ys] of bridgePointsForPolyline(s.points, crossings)) {
      const a = s.points[i]!;
      const b = s.points[i + 1]!;
      const y1 = Math.min(a.y, b.y);
      const y2 = Math.max(a.y, b.y);
      const rosnaco = [...ys].sort((p, q) => p - q);
      rosnaco.forEach((y, k) => {
        // Mostek jest RYSOWALNY: półłuk ±BRIDGE_RADIUS mieści się w pionie (nie sięga
        // za jego koniec) i nie zachodzi na sąsiedni mostek tego pionu.
        const odKoncow = y - y1 >= BRIDGE_RADIUS && y2 - y >= BRIDGE_RADIUS;
        const odSasiadow =
          (k === 0 || y - rosnaco[k - 1]! >= 2 * BRIDGE_RADIUS) &&
          (k === rosnaco.length - 1 || rosnaco[k + 1]! - y >= 2 * BRIDGE_RADIUS);
        if (odKoncow && odSasiadow) pokryte.add(`${a.x},${y}`);
      });
    }
  }
  const { h } = flatten(segments);
  return crossings.filter((c) => {
    if (!pokryte.has(`${c.x},${c.y}`)) return true;
    // Poziom przechodzi POD całym półłukiem (łuk wybrzusza się w prawo o BRIDGE_RADIUS):
    // koniec poziomu w obrysie łuku zostawiłby łuk nad pustką.
    const poziom = h.find(
      (hs) => hs.a.y === c.y && Math.min(hs.a.x, hs.b.x) < c.x && Math.max(hs.a.x, hs.b.x) > c.x,
    );
    return !poziom || Math.max(poziom.a.x, poziom.b.x) - c.x < BRIDGE_RADIUS;
  });
}

/** Współliniowe nałożenie odcinków dwóch RÓŻNYCH właścicieli toru mocy. */
export interface NalozenieOdcinkow {
  readonly ownerA: string;
  readonly ownerB: string;
  /** Odcinek wspólny (świat) i jego długość [px]. */
  readonly od: RouteVertex;
  readonly do: RouteVertex;
  readonly dlugosc: number;
}

/**
 * Wyrocznia rozłączności toru mocy (rozstrzygnięcie architekta KD-5, 2026-10-30): dwa
 * różne obiekty (kable, szyny, przewody pól) NIE biegną po jednym odcinku — nałożenie
 * współliniowe o dodatniej długości jest fikcją rysunku (czyta się jak jeden przewód).
 * Styk końcami (węzeł, narożnik) nie jest nałożeniem. Warstwy adnotacji wyłączone tą samą
 * listą co przecięcia (`NON_POWER_KINDS`). Wynik posortowany deterministycznie.
 */
export function nalozeniaRoznychWlascicieli(segments: readonly PreviewSegment[]): readonly NalozenieOdcinkow[] {
  const { h, v } = flatten(segments);
  const out: NalozenieOdcinkow[] = [];
  const zbadaj = (lista: readonly FlatSeg[], poziome: boolean): void => {
    for (let i = 0; i < lista.length; i += 1) {
      const e = lista[i]!;
      for (let j = i + 1; j < lista.length; j += 1) {
        const f = lista[j]!;
        if ((e.ownerRef ?? '') === (f.ownerRef ?? '')) continue;
        const osE = poziome ? e.a.y : e.a.x;
        const osF = poziome ? f.a.y : f.a.x;
        if (osE !== osF) continue;
        const wsp = (p: RouteVertex): number => (poziome ? p.x : p.y);
        const lo = Math.max(Math.min(wsp(e.a), wsp(e.b)), Math.min(wsp(f.a), wsp(f.b)));
        const hi = Math.min(Math.max(wsp(e.a), wsp(e.b)), Math.max(wsp(f.a), wsp(f.b)));
        if (hi - lo <= 0) continue;
        const [ownerA, ownerB] = [e.ownerRef ?? '', f.ownerRef ?? ''].sort();
        out.push({
          ownerA: ownerA!,
          ownerB: ownerB!,
          od: poziome ? { x: lo, y: osE } : { x: osE, y: lo },
          do: poziome ? { x: hi, y: osE } : { x: osE, y: hi },
          dlugosc: hi - lo,
        });
      }
    }
  };
  zbadaj(h, true);
  zbadaj(v, false);
  return out.sort(
    (p, q) => p.od.y - q.od.y || p.od.x - q.od.x || p.ownerA.localeCompare(q.ownerA) || p.ownerB.localeCompare(q.ownerB),
  );
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
  readonly reason: 'rozgalezienie-bez-kropki' | 'kropka-bez-wezla-modelu' | 'kropka-poza-torem' | 'kropka-bez-rozgalezienia';
  /** Kropka: `testId` symbolu (WHITE BOX — do raportu luki). */
  readonly testId?: string;
}

interface JunctionSceneInput {
  readonly segments: readonly PreviewSegment[];
  readonly symbols: ReadonlyArray<{
    readonly symbolId: string;
    readonly x: number;
    readonly y: number;
    readonly meta?: { readonly wezelModelu?: string; readonly testId?: string; readonly elementKind?: string; readonly ownerRef?: string };
  }>;
}

/** Tolerancja dopasowania kropka↔węzeł [px świata] — środek symbolu kropki
 *  musi leżeć w promieniu GRID od punktu T-węzła (symbol snapowany do GRID,
 *  węzeł na osi trasy — GRID pokrywa wszystkie legalne zakotwiczenia). */
const DOT_MATCH_TOLERANCE = GRID;

/**
 * Geometryczne T-węzły TRAS ZEWNĘTRZNYCH (świat): punkt, w którym koniec odcinka
 * trasy ZEWNĘTRZNEJ (`ownerRef` z prefiksem `seg/`) ląduje we WNĘTRZU odcinka INNEJ
 * trasy zewnętrznej. Kable ciągu są cięte wyłącznie w węzłach modelu (punkt
 * odgałęźny ma własny symbol, węzeł nazwany — kropkę na końcach kawałków), więc taki
 * styk na rysunku znaczy połączenie dwóch kabli w miejscu, w którym model węzła nie
 * ma — wyrocznia `junctionDotGaps` zgłasza go jako lukę (żadna kropka z węzłem modelu
 * go nie pokrywa). (Styki tras z portami pól/stacji NIE są węzłami tras — rozstrzyga
 * je §16.)
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
      // S9-1: kreski znaku ciągu dalszego (złamanie arkusza) i znak powiązania leżą NA
      // torze, ale nie są torem — nie tworzą węzła T (jak słupek terminalny wyżej).
      !jestZnacznikiemToru(s),
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

/** Odczep z węzła pola: odcinek aparatu bocznego pola (`⟨pole⟩#lateral-…`), pola WN
 *  i pola SN transformatora GPZ (`⟨transformator⟩#hv-lateral-⟨n⟩`,
 *  `⟨transformator⟩#tr-field-lateral-⟨n⟩`) albo odgałęzienia toru pola
 *  (`⟨pole | transformator⟩#odgalezienie-⟨n⟩`, bez przewodów kolumny `…-wire-…`). */
const ODCZEP_WEZLA_POLA = /#(lateral-|hv-lateral-\d+$|tr-field-lateral-\d+$|odgalezienie-\d+$)/;

/**
 * JEDNO źródło prawdy odczepu z węzła modelu (reguła KLASA §3, predykaty parami): ten sam
 * predykat wybiera odcinki, którym scena dorysowuje kropkę (`buildScene.ts`, sekcja 7.6),
 * i węzły, których kropki wymaga wyrocznia (`lateralBranchNodes`). Odcinek odczepu niesie
 * węzeł przyłączenia na osi toru pola jako `points[0]` (`compose/station.ts`,
 * `compose/gpz.ts`, `apparatusSequence.ts::ukladGalezi`) — rysowany wyłącznie wtedy, gdy
 * porty aparatów leżą na wspólnym węźle albo pole niesie układ z szablonu. Zwraca punkt
 * węzła i ref pola (węzeł modelu), `null` dla każdego innego odcinka.
 */
export function odczepWezlaModelu(
  segment: PreviewSegment,
): { readonly punkt: RouteVertex; readonly wezelModelu: string } | null {
  const ref = segment.meta?.ownerRef ?? '';
  if (!ODCZEP_WEZLA_POLA.test(ref)) return null;
  const punkt = segment.points[0];
  if (!punkt) return null;
  return { punkt, wezelModelu: ref.slice(0, ref.indexOf('#')) };
}

/** Rozmiary i porty symboli (kształt `SYMBOL_DEFS`) — podaje wołający, moduł nie importuje
 *  warstwy symboli. */
export type RozmiarySymboli = Readonly<
  Record<
    string,
    {
      readonly width: number;
      readonly height: number;
      readonly ports?: readonly { readonly x: number; readonly y: number; readonly dir?: string }[];
    }
  >
>;

/**
 * Liczba RAMION toru mocy w punkcie `p`: odcinek toru kończący się w `p` daje jedno ramię,
 * odcinek przechodzący przez `p` (wnętrze albo wierzchołek załamania) — dwa, port symbolu
 * w `p` — jedno (kropki węzłowe nie mają ramion). Stos aparatów pola bez portów ENM nie ma
 * przewodów między aparatami: kontrakt stosu (`layout/apparatusStack.ts`, aparat–aparat =
 * `APPARATUS_STACK_VERTICAL_GAP`) łączy port S aparatu z portem N następnego, odległym o ten
 * raster — taki port sąsiada daje jedno ramię, gdy przerwy nie pokrywa żaden odcinek.
 * Rozgałęzienie = co najmniej trzy ramiona; dwa ramiona to ciągłość toru albo narożnik
 * (np. glif źródła przy głowicy kablowej, za którą tor się nie ciągnie), nie węzeł do
 * oznaczenia kropką.
 */
export function ramionaToru(scene: JunctionSceneInput, sizes: RozmiarySymboli, p: RouteVertex): number {
  let ramiona = 0;
  for (const s of scene.segments) {
    if (NON_POWER_KINDS.has(s.meta?.kind ?? 'sn') || jestZnacznikiemToru(s)) continue;
    const pts = s.points;
    if (pts.length < 2) continue;
    if ((pts[0]!.x === p.x && pts[0]!.y === p.y) || (pts[pts.length - 1]!.x === p.x && pts[pts.length - 1]!.y === p.y)) {
      ramiona += 1;
      continue;
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const naOdcinku =
        (a.y === b.y && a.y === p.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x)) ||
        (a.x === b.x && a.x === p.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y));
      if (naOdcinku) {
        ramiona += 2;
        break;
      }
    }
  }
  const przerwaPokryta = (y1: number, y2: number): boolean =>
    scene.segments.some(
      (s) =>
        !NON_POWER_KINDS.has(s.meta?.kind ?? 'sn') &&
        s.points.some((a, i) => {
          const b = s.points[i + 1];
          return b != null && a.x === p.x && b.x === p.x && Math.min(a.y, b.y) <= y1 && Math.max(a.y, b.y) >= y2;
        }),
    );
  for (const sym of scene.symbols) {
    if (sym.symbolId === 'junction' || sym.symbolId === 'branchJunction') continue;
    for (const port of sizes[sym.symbolId]?.ports ?? []) {
      const px = sym.x + port.x;
      const py = sym.y + port.y;
      if (px !== p.x) continue;
      if (py === p.y) ramiona += 1;
      else if (port.dir === 'N' && py === p.y + APPARATUS_STACK_VERTICAL_GAP && !przerwaPokryta(p.y, py)) ramiona += 1;
      else if (port.dir === 'S' && py === p.y - APPARATUS_STACK_VERTICAL_GAP && !przerwaPokryta(py, p.y)) ramiona += 1;
    }
  }
  return ramiona;
}

/**
 * KROPKA-WEZLOWA (V12K-150, spec §22.1, IEC 60617) — odczepy z węzła modelu, które SĄ
 * rozgałęzieniem: punkt na osi toru pola, w którym odchodzi aparat boczny (ES/VT/SA), glif
 * źródła pola albo odgałęzienie toru (przekładnik napięciowy od strony linii, Z.11.1), i który
 * ma co najmniej trzy ramiona toru (`ramionaToru`). Odczep z końca toru, za którym tor się
 * nie ciągnie (glif źródła przy głowicy kablowej pola bez narysowanego kabla), jest
 * narożnikiem — bez kropki. JEDNO źródło dla kropek sceny (`buildScene.ts`, sekcja 7.6)
 * i wymagań wyroczni (`lateralBranchNodes`, `junctionDotGaps`) — predykaty parami.
 * Deterministycznie: sort po (y, x), pierwszy odcinek wygrywa ref węzła.
 */
export function odczepyWezlowModelu(
  scene: JunctionSceneInput,
  sizes: RozmiarySymboli,
): readonly { readonly punkt: RouteVertex; readonly wezelModelu: string }[] {
  const wynik: { readonly punkt: RouteVertex; readonly wezelModelu: string }[] = [];
  const seen = new Set<string>();
  for (const s of scene.segments) {
    const odczep = odczepWezlaModelu(s);
    if (odczep == null) continue;
    const key = `${odczep.punkt.x},${odczep.punkt.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (ramionaToru(scene, sizes, odczep.punkt) >= 3) wynik.push(odczep);
  }
  return wynik.sort((a, b) => (a.punkt.y - b.punkt.y) || (a.punkt.x - b.punkt.x));
}

/** Węzły odczepów z rozgałęzieniem (punkty `odczepyWezlowModelu`) — wymagane kropki. */
export function lateralBranchNodes(scene: JunctionSceneInput, sizes: RozmiarySymboli): readonly RouteVertex[] {
  return odczepyWezlowModelu(scene, sizes).map((o) => o.punkt);
}

function punktNaTorze(segments: readonly PreviewSegment[], x: number, y: number): boolean {
  for (const s of segments) {
    if (NON_POWER_KINDS.has(s.meta?.kind ?? 'sn')) continue;
    for (let i = 0; i + 1 < s.points.length; i++) {
      const a = s.points[i];
      const b = s.points[i + 1];
      if (a.y === b.y && a.y === y && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)) return true;
      if (a.x === b.x && a.x === x && y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)) return true;
    }
  }
  return false;
}

/**
 * junction_dot_probe (spec §22.1, D3-5; rozstrzygnięcie S7-P2 z 2026-10-30):
 * (a) każdy węzeł rozgałęzienia narysowany na torze — odczep z węzła pola
 *     (`lateralBranchNodes`) i każdy T-styk tras zewnętrznych (`externalBranchNodes`) —
 *     ma kropkę w promieniu GRID; T-styk dwóch kabli bez węzła modelu nie ma kropki
 *     z węzłem, więc jest luką (połączenie narysowane bez węzła w sieci);
 * (b) każda kropka (`junction`/`branchJunction`) wskazuje węzeł modelu
 *     (`meta.wezelModelu`), a gdy wołający poda zbiór węzłów modelu (`wezlyModelu`:
 *     `Bus.ref_id` ∪ `Bay.ref_id`) — węzeł istniejący w tym modelu;
 * (c) każda kropka leży na narysowanym torze (nie wisi obok);
 * (d) kropka odczepu stoi wyłącznie w rozgałęzieniu (co najmniej trzy ramiona toru,
 *     `ramionaToru`); kropka węzła nazwanego toru (rekord `Bus`) jest z tego zwolniona.
 * Rozmiary symboli podaje wołający (mapą symbolId→{width,height}) — moduł nie importuje
 * SYMBOL_DEFS, żeby pozostać czysty względem warstwy symboli.
 */
export function junctionDotGaps(
  scene: JunctionSceneInput,
  symbolSizes: RozmiarySymboli,
  wezlyModelu?: ReadonlySet<string>,
): readonly JunctionDotGap[] {
  const nodeSeen = new Set<string>();
  const nodes: RouteVertex[] = [];
  for (const n of [...externalBranchNodes(scene.segments), ...lateralBranchNodes(scene, symbolSizes)]) {
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
      return {
        cx: s.x + size.width / 2,
        cy: s.y + size.height / 2,
        wezel: s.meta?.wezelModelu,
        testId: s.meta?.testId,
        // Kropka węzła NAZWANEGO toru (`scene/elementyToru.ts`): oznacza rekord `Bus` między
        // kawałkami ciągu — sam węzeł modelu, bez wymogu trzech ramion.
        wezelNazwany: s.meta?.elementKind === 'bus' && s.meta?.ownerRef === s.meta?.wezelModelu,
      };
    });
  const zWezlem = (d: (typeof dots)[number]): boolean =>
    d.wezel != null && d.wezel !== '' && (wezlyModelu == null || wezlyModelu.has(d.wezel));
  const gaps: JunctionDotGap[] = [];
  for (const n of nodes) {
    const hit = dots.some(
      (d) => zWezlem(d) && Math.abs(d.cx - n.x) <= DOT_MATCH_TOLERANCE && Math.abs(d.cy - n.y) <= DOT_MATCH_TOLERANCE,
    );
    if (!hit) gaps.push({ x: n.x, y: n.y, reason: 'rozgalezienie-bez-kropki' });
  }
  for (const d of dots) {
    if (!zWezlem(d)) gaps.push({ x: d.cx, y: d.cy, reason: 'kropka-bez-wezla-modelu', testId: d.testId });
    else if (!punktNaTorze(scene.segments, d.cx, d.cy)) {
      gaps.push({ x: d.cx, y: d.cy, reason: 'kropka-poza-torem', testId: d.testId });
    } else if (
      !d.wezelNazwany &&
      !nodes.some((n) => Math.abs(d.cx - n.x) <= DOT_MATCH_TOLERANCE && Math.abs(d.cy - n.y) <= DOT_MATCH_TOLERANCE)
    ) {
      // (d) kropka odczepu tylko w rozgałęzieniu: kropka w narożniku albo na ciągłym torze
      // rysuje węzeł, którego tor nie ma.
      gaps.push({ x: d.cx, y: d.cy, reason: 'kropka-bez-rozgalezienia', testId: d.testId });
    }
  }
  return gaps;
}

/** Węzły modelu, które może oznaczać kropka węzłowa: `Bus.ref_id` (węzeł nazwany toru)
 *  ∪ `Bay.ref_id` (węzeł pola, z którego odchodzi odczep) ∪ `Transformer.ref_id` (węzeł
 *  pola WN/SN transformatora GPZ, z którego odchodzi odczep aparatu bocznego). */
export function wezlyModeluEnm(enm: {
  readonly buses?: readonly { readonly ref_id: string }[] | null;
  readonly bays?: readonly { readonly ref_id: string }[] | null;
  readonly transformers?: readonly { readonly ref_id: string }[] | null;
}): ReadonlySet<string> {
  return new Set([
    ...(enm.buses ?? []).map((b) => b.ref_id),
    ...(enm.bays ?? []).map((b) => b.ref_id),
    ...(enm.transformers ?? []).map((t) => t.ref_id),
  ]);
}

// ---------------------------------------------------------------------------
// §22.3 bus_band_clearance_probe + entry_collinearity_probe (F13.3, D3-4/D3-15).
// ---------------------------------------------------------------------------

/** Pas ochronny szyny: ±2×GRID od osi (spec §22.3 — „żaden pion trasy OBCEJ
 *  nie przechodzi przez pas; do pasa wchodzą wyłącznie zejścia PÓL tej szyny"). */
export const BUS_BAND_HALF = 2 * GRID;

/** Zakres własności stacji/GPZ: dwa pierwsze człony ścieżki `ownerRef`
 *  (`stn/⟨id⟩`, `gpz/⟨id⟩`) — pola (`stn/⟨id⟩/sn_field/…`) i szyna
 *  (`stn/⟨id⟩/sn_bus#sn-bus`) tej samej stacji dzielą prefiks; trasy
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
