/**
 * STYK CZŁONÓW NA OBCYM PRZEWODZIE (karta UX-04/POLE-LINIOWE-WZORZEC, decyzja architekta
 * §11.7 pkt 1 z 2026-10-30: każde skrzyżowanie bez węzła modelu dostaje mostek §22.1, kropka
 * stoi wyłącznie w węźle modelu).
 *
 * Przęsło rysunkowe złożone z kilku członów modelu (segmenty łączone węzłem bez stacji,
 * `chainSegmentRefs` w `buildScene.ts`) rysuje się jedną polilinią pociętą na kawałki
 * o równym udziale długości (`splitPolylineIntoPieces`). Punkt cięcia — STYK CZŁONÓW — nie ma
 * na rysunku innego znaczenia niż „tu kończy się jeden człon, a zaczyna drugi”: leży na
 * prostej, a tor przez niego przechodzi bez załamania. Gdy taki punkt wypadnie na OBCYM
 * przewodzie (poziom kabla innej pary stacji przecina pion zejścia dokładnie w punkcie
 * cięcia), skrzyżowanie przestaje być widoczne dla `interiorCrossings` (oba człony kończą się
 * w punkcie przecięcia, a przecięcie liczy się tylko we wnętrzu odcinka) i kanwa nie ma
 * w którym pionie narysować mostka: rysunek czyta się jako połączenie czterech przewodów
 * w punkcie, którego w modelu nie ma (wyrocznia `junctionDotGaps`, „rozgalezienie-bez-kropki”).
 * Pomiar przed naprawą: sieć referencyjna 52 stacji po regeneracji identyfikatorów +
 * odgałęzienie stacji z odgałęzieniem (`buildScene.odejsciaZagniezdzone.test.ts`), L2 —
 * styk `…p1branch/segment`/`…p1branch/segment_L` w (3688, 1360) na poziomie
 * `…/branch_segment_R_R_L`.
 *
 * Naprawa u źródła geometrii, JEDNA dla wszystkich miejsc cięcia (tor główny, przęsła
 * wierszy, zejścia lateralne, ogony otwarte, feedery GPZ): po złożeniu wszystkich odcinków
 * sceny styk leżący na obcym przewodzie jest przesuwany wzdłuż własnej prostej o wielokrotność
 * rastru, aż przestanie dotykać czegokolwiek obcego. Suma geometryczna obu członów jest
 * niezmieniona (zmienia się tylko miejsce podziału między nimi), więc kolizje symboli,
 * etykiet i pasm nie mogą się pogorszyć, a skrzyżowanie trafia do wnętrza członu — z mostkiem
 * rysowalnym, bo odległość od końca członu to co najmniej raster (> `BRIDGE_RADIUS`).
 * Wykrycie i naprawa korzystają z JEDNEJ funkcji (`stykiCzlonowNaObcychPrzewodach`) —
 * predykat wejścia i wyjścia z jednego źródła; wyrocznia fikstur woła tę samą funkcję.
 *
 * Czego ta funkcja NIE przesuwa (świadomie): punktu z symbolem (port aparatu, głowica, punkt
 * odgałęźny, węzeł z kropką — tam obcy przewód to kolizja symbol↔przewód, mierzona osobno),
 * punktu, w którym kończą się więcej niż dwa odcinki toru (rozgałęzienie — wymaga kropki
 * modelu, nie przesunięcia) ani narożnika (dwa człony prostopadłe — obcy przewód przez
 * narożnik nakłada się współliniowo na jeden z członów, co mierzy `nalozeniaRoznychWlascicieli`)
 * ani styku na szynie (dwa zejścia przyłączone do szyny z obu stron, np. zejście transformatora
 * i zejście portalu nN na szynie nN — połączenie z węzłem szyny, §16).
 */
import { GRID, type V3Rect } from '../core/grid';
import type { RouteVertex } from '../layout/route';
import type { PreviewSegment } from '../compose/preview';

/** Rodzaje odcinków będące PRZEWODEM ciągu (człony przęsła): kabel/linia SN, magistrala, nN. */
const RODZAJE_PRZEWODU: ReadonlySet<string> = new Set(['sn', 'snTrunk', 'lv']);

/** Rodzaje odcinków toru mocy, które mogą przechodzić przez styk (przewody i szyny). Adnotacje
 *  (`leader`, `protectionTrip`, `measurementLink`) i znaczniki na torze (`openTerminal`,
 *  `sheetContinuation`, `tieMarker`) torem nie są — jak w `crossings.ts` (`NON_POWER_KINDS`). */
const RODZAJE_TORU_MOCY: ReadonlySet<string> = new Set(['sn', 'snTrunk', 'lv', 'bus', 'busGpz']);

export interface StykCzlonow {
  /** Punkt styku (świat). */
  readonly punkt: RouteVertex;
  /** Indeksy członów w tablicy odcinków: `czlonPrzed` kończy się w styku, `czlonZa` w nim
   *  zaczyna (przy kierunkach rysowania niezgodnych z łańcuchem — kolejność indeksów). */
  readonly czlonPrzed: number;
  readonly czlonZa: number;
  /** Właściciele obu członów i obcego przewodu (WHITE BOX — do raportu). */
  readonly wlascicielPrzed?: string;
  readonly wlascicielZa?: string;
  readonly obcyPrzewod?: string;
  /** Oś prostej styku: człony leżą na pionie albo na poziomie. */
  readonly os: 'pion' | 'poziom';
}

interface Koniec {
  readonly seg: number;
  /** Indeks punktu końcowego w `points` (0 albo ostatni). */
  readonly idx: number;
  /** Sąsiedni wierzchołek członu (wyznacza kierunek krawędzi wchodzącej do styku). */
  readonly sasiad: RouteVertex;
}

interface Krawedz {
  readonly seg: number;
  readonly a: RouteVertex;
  readonly b: RouteVertex;
}

function rodzaj(s: PreviewSegment): string {
  return s.meta?.kind ?? 'sn';
}

function klucz(p: RouteVertex): string {
  return `${p.x},${p.y}`;
}

/** Indeks krawędzi toru mocy: poziome po `y`, pionowe po `x`. */
function indeksKrawedzi(segments: readonly PreviewSegment[]): {
  readonly poziome: ReadonlyMap<number, readonly Krawedz[]>;
  readonly pionowe: ReadonlyMap<number, readonly Krawedz[]>;
} {
  const poziome = new Map<number, Krawedz[]>();
  const pionowe = new Map<number, Krawedz[]>();
  segments.forEach((s, seg) => {
    if (!RODZAJE_TORU_MOCY.has(rodzaj(s))) return;
    for (let i = 0; i + 1 < s.points.length; i++) {
      const a = s.points[i]!;
      const b = s.points[i + 1]!;
      if (a.y === b.y && a.x !== b.x) {
        const lista = poziome.get(a.y) ?? [];
        lista.push({ seg, a, b });
        poziome.set(a.y, lista);
      } else if (a.x === b.x && a.y !== b.y) {
        const lista = pionowe.get(a.x) ?? [];
        lista.push({ seg, a, b });
        pionowe.set(a.x, lista);
      }
    }
  });
  return { poziome, pionowe };
}

/** Krawędzie toru mocy (spoza `pominiete`) zawierające punkt — domknięte (z końcami). */
function krawedzieZawierajace(
  indeks: ReturnType<typeof indeksKrawedzi>,
  p: RouteVertex,
  pominiete: ReadonlySet<number>,
): Krawedz[] {
  const wynik: Krawedz[] = [];
  for (const k of indeks.poziome.get(p.y) ?? []) {
    if (!pominiete.has(k.seg) && p.x >= Math.min(k.a.x, k.b.x) && p.x <= Math.max(k.a.x, k.b.x)) wynik.push(k);
  }
  for (const k of indeks.pionowe.get(p.x) ?? []) {
    if (!pominiete.has(k.seg) && p.y >= Math.min(k.a.y, k.b.y) && p.y <= Math.max(k.a.y, k.b.y)) wynik.push(k);
  }
  return wynik;
}

function wewnatrzSymbolu(p: RouteVertex, symbole: readonly V3Rect[]): boolean {
  return symbole.some((r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height);
}

interface Kandydat {
  readonly punkt: RouteVertex;
  readonly przed: Koniec;
  readonly za: Koniec;
  readonly os: 'pion' | 'poziom';
}

/** Styki członów: punkt, w którym kończą się DOKŁADNIE dwa odcinki toru mocy, oba będące
 *  przewodem, leżące na jednej prostej po przeciwnych stronach punktu, bez symbolu w punkcie. */
function kandydaciStykow(segments: readonly PreviewSegment[], symbole: readonly V3Rect[]): Kandydat[] {
  const konce = new Map<string, Koniec[]>();
  segments.forEach((s, seg) => {
    if (!RODZAJE_TORU_MOCY.has(rodzaj(s)) || s.points.length < 2) return;
    const ostatni = s.points.length - 1;
    for (const [idx, sasiedniIdx] of [
      [0, 1],
      [ostatni, ostatni - 1],
    ] as const) {
      const p = s.points[idx]!;
      const lista = konce.get(klucz(p)) ?? [];
      lista.push({ seg, idx, sasiad: s.points[sasiedniIdx]! });
      konce.set(klucz(p), lista);
    }
  });
  const wynik: Kandydat[] = [];
  for (const lista of konce.values()) {
    if (lista.length !== 2) continue;
    const [k1, k2] = lista as [Koniec, Koniec];
    if (k1.seg === k2.seg) continue;
    if (!RODZAJE_PRZEWODU.has(rodzaj(segments[k1.seg]!)) || !RODZAJE_PRZEWODU.has(rodzaj(segments[k2.seg]!))) continue;
    const p = segments[k1.seg]!.points[k1.idx]!;
    const pion = k1.sasiad.x === p.x && k2.sasiad.x === p.x && Math.sign(k1.sasiad.y - p.y) === -Math.sign(k2.sasiad.y - p.y);
    const poziom = k1.sasiad.y === p.y && k2.sasiad.y === p.y && Math.sign(k1.sasiad.x - p.x) === -Math.sign(k2.sasiad.x - p.x);
    if (!pion && !poziom) continue;
    if (wewnatrzSymbolu(p, symbole)) continue;
    // Człon „przed” kończy się w styku (ostatni punkt); przy kierunkach rysowania niezgodnych
    // z łańcuchem — mniejszy indeks odcinka (deterministycznie).
    const k1Konczy = k1.idx !== 0;
    const k2Konczy = k2.idx !== 0;
    const [przed, za] = k1Konczy !== k2Konczy ? (k1Konczy ? [k1, k2] : [k2, k1]) : k1.seg < k2.seg ? [k1, k2] : [k2, k1];
    wynik.push({ punkt: p, przed, za, os: pion ? 'pion' : 'poziom' });
  }
  return wynik.sort((a, b) => a.punkt.y - b.punkt.y || a.punkt.x - b.punkt.x);
}

/**
 * Styki członów leżące na OBCYM przewodzie: we wnętrzu przewodu (kabel/linia SN, magistrala,
 * nN) innego niż oba człony, prostopadłego do prostej styku. Szyna nie jest obcym przewodem:
 * odcinki kończące się na szynie są do niej przyłączone (węzeł szyny jest węzłem modelu). Wynik posortowany po (y, x) —
 * deterministycznie. Pusty = zielono (wyrocznia fikstur i warunek wyjścia naprawy).
 */
export function stykiCzlonowNaObcychPrzewodach(
  segments: readonly PreviewSegment[],
  symbole: readonly V3Rect[],
): readonly StykCzlonow[] {
  const kandydaci = kandydaciStykow(segments, symbole);
  if (kandydaci.length === 0) return [];
  const indeks = indeksKrawedzi(segments);
  const wynik: StykCzlonow[] = [];
  for (const k of kandydaci) {
    const p = k.punkt;
    // Obcy przewód prostopadły do prostej styku, przechodzący przez styk swoim wnętrzem.
    const obce = (k.os === 'pion' ? indeks.poziome.get(p.y) : indeks.pionowe.get(p.x)) ?? [];
    const obcy = obce.find((e) => {
      if (e.seg === k.przed.seg || e.seg === k.za.seg) return false;
      // Szyna przechodząca przez styk to przyłączenie obu członów do węzła szyny (zejście
      // na szynę z obu stron, §16) — połączenie modelu, nie skrzyżowanie.
      if (!RODZAJE_PRZEWODU.has(rodzaj(segments[e.seg]!))) return false;
      return k.os === 'pion'
        ? p.x > Math.min(e.a.x, e.b.x) && p.x < Math.max(e.a.x, e.b.x)
        : p.y > Math.min(e.a.y, e.b.y) && p.y < Math.max(e.a.y, e.b.y);
    });
    if (!obcy) continue;
    wynik.push({
      punkt: p,
      czlonPrzed: k.przed.seg,
      czlonZa: k.za.seg,
      wlascicielPrzed: segments[k.przed.seg]!.meta?.ownerRef,
      wlascicielZa: segments[k.za.seg]!.meta?.ownerRef,
      obcyPrzewod: segments[obcy.seg]!.meta?.ownerRef,
      os: k.os,
    });
  }
  return wynik;
}

export interface WynikOdsuniecia {
  readonly segments: readonly PreviewSegment[];
  /** Styki przesunięte z obcego przewodu: punkt przed i po przesunięciu. */
  readonly przesuniete: readonly { readonly z: RouteVertex; readonly na: RouteVertex; readonly styk: StykCzlonow }[];
  /** Styki, dla których na żadnym z obu członów nie ma wolnego punktu rastru (audyt). */
  readonly nierozwiazane: readonly StykCzlonow[];
}

function zamienKoniec(s: PreviewSegment, z: RouteVertex, na: RouteVertex): PreviewSegment {
  const ostatni = s.points.length - 1;
  const points = s.points.map((p, i) => ((i === 0 || i === ostatni) && p.x === z.x && p.y === z.y ? na : p));
  return { ...s, points };
}

/**
 * Przesuwa każdy styk członów leżący na obcym przewodzie wzdłuż prostej styku o wielokrotność
 * rastru — naprzemiennie w głąb członu „za” i „przed” (GRID, −GRID, 2·GRID, −2·GRID, …;
 * kolejność stała, deterministyczna) — do pierwszego punktu, który: leży ściśle wewnątrz
 * krawędzi członu, w którą wchodzi (człon nie degeneruje), nie leży w symbolu i nie dotyka
 * żadnego odcinka toru mocy poza oboma członami. Suma geometryczna członów jest niezmieniona.
 * Pętla do wyczerpania: po każdym przesunięciu wykrycie liczy się od nowa na nowej geometrii
 * (ta sama funkcja co wyrocznia), więc wynik nie zależy od kolejności styków.
 */
export function odsunStykiCzlonow(segments: readonly PreviewSegment[], symbole: readonly V3Rect[]): WynikOdsuniecia {
  let biezace: readonly PreviewSegment[] = segments;
  const przesuniete: { z: RouteVertex; na: RouteVertex; styk: StykCzlonow }[] = [];
  const nierozwiazaneKlucze = new Set<string>();
  const nierozwiazane: StykCzlonow[] = [];
  for (;;) {
    const styk = stykiCzlonowNaObcychPrzewodach(biezace, symbole).find((s) => !nierozwiazaneKlucze.has(klucz(s.punkt)));
    if (!styk) break;
    const p = styk.punkt;
    const przed = biezace[styk.czlonPrzed]!;
    const za = biezace[styk.czlonZa]!;
    const sasiadZa = za.points[0]!.x === p.x && za.points[0]!.y === p.y ? za.points[1]! : za.points[za.points.length - 2]!;
    const sasiadPrzed =
      przed.points[przed.points.length - 1]!.x === p.x && przed.points[przed.points.length - 1]!.y === p.y
        ? przed.points[przed.points.length - 2]!
        : przed.points[1]!;
    const pominiete = new Set([styk.czlonPrzed, styk.czlonZa]);
    const indeks = indeksKrawedzi(biezace);
    const kierunek = (sasiad: RouteVertex) => ({ x: Math.sign(sasiad.x - p.x), y: Math.sign(sasiad.y - p.y) });
    const dlugosc = (sasiad: RouteVertex) => Math.abs(sasiad.x - p.x) + Math.abs(sasiad.y - p.y);
    const strony = [
      { u: kierunek(sasiadZa), zasieg: dlugosc(sasiadZa) },
      { u: kierunek(sasiadPrzed), zasieg: dlugosc(sasiadPrzed) },
    ];
    const maksKrok = Math.max(...strony.map((s) => s.zasieg));
    let cel: RouteVertex | null = null;
    for (let krok = GRID; krok < maksKrok && cel == null; krok += GRID) {
      for (const strona of strony) {
        if (krok >= strona.zasieg) continue;
        const kandydat = { x: p.x + strona.u.x * krok, y: p.y + strona.u.y * krok };
        if (wewnatrzSymbolu(kandydat, symbole)) continue;
        if (krawedzieZawierajace(indeks, kandydat, pominiete).length > 0) continue;
        cel = kandydat;
        break;
      }
    }
    if (cel == null) {
      nierozwiazaneKlucze.add(klucz(p));
      nierozwiazane.push(styk);
      continue;
    }
    const nowe = [...biezace];
    nowe[styk.czlonPrzed] = zamienKoniec(przed, p, cel);
    nowe[styk.czlonZa] = zamienKoniec(za, p, cel);
    biezace = nowe;
    przesuniete.push({ z: p, na: cel, styk });
  }
  return { segments: biezace, przesuniete, nierozwiazane };
}

/**
 * Wierzchołki pośrednie odcinków toru mocy leżące na prostej sąsiednich wierzchołków — ta sama
 * klasa ukrycia skrzyżowania co styk członów, wewnątrz JEDNEJ łamanej: krawędzie po obu
 * stronach takiego wierzchołka kończą się w nim, więc przecięcie w tym punkcie nie jest
 * wnętrzem żadnej z nich (`interiorCrossings`). Scena takich wierzchołków nie emituje
 * (`dedupeVertices` w `buildScene.ts`); wyrocznia fikstur pilnuje, żeby żaden nie wrócił.
 */
export function wierzcholkiWspolliniowe(
  segments: readonly PreviewSegment[],
): readonly { readonly ownerRef?: string; readonly punkt: RouteVertex }[] {
  const wynik: { ownerRef?: string; punkt: RouteVertex }[] = [];
  for (const s of segments) {
    if (!RODZAJE_TORU_MOCY.has(rodzaj(s))) continue;
    for (let i = 1; i + 1 < s.points.length; i++) {
      const a = s.points[i - 1]!;
      const p = s.points[i]!;
      const b = s.points[i + 1]!;
      if ((a.x === p.x && b.x === p.x) || (a.y === p.y && b.y === p.y)) wynik.push({ ownerRef: s.meta?.ownerRef, punkt: p });
    }
  }
  return wynik;
}
