/**
 * Karta SLD-SKALA-I-NAWIGACJA, R8 (budżet DOM kadru całej sieci) — SYMBOL STACJI w kadrze
 * przeglądowym (decyzje właściciela 2026-11-12, szkice „warianty”, „odgałęzienia”, „pion”,
 * „wyjątki”): stacja SN/nN to SZYNA (gruba kreska, barwa szyny) i NOGI toru — wejście, wyjście
 * i każde odgałęzienie jako kolejna noga z szyny. Tor mocy biegnie przez nogi i szynę, bez
 * odcinka „na skróty”; symbolu TR ani aparatury pól w tym oddaleniu nie ma (pojawiają się przy
 * przybliżeniu w tym samym miejscu). Stacja z OZE ma znak B1 (okrąg z falą zawieszony krótkim
 * pionem pod szyną, między nogami magistrali, bez koloru — `znakOze`). Stacja bez transformatora
 * to punkt rozłącznikowy R1: romb na linii portów toru, bez nóg i szyny (`liniaPunktu`,
 * `rombPunktu`). Łącznik otwarty w nodze zostaje własnym węzłem — □ w środku nogi
 * (`przerwyWNogach`); niezasilone szare (barwa stanu toru); czerwona tylko szyna stacji z alarmem
 * (`najgorszyStanStacji`).
 *
 * Geometria wyłącznie z realnej sceny — porty bez zmian przy przybliżaniu: noga = oś pola od
 * punktu przyłączenia do szyny SN do końca odcinka toru (magistrali albo odgałęzienia), który
 * dochodzi do pola; szyna = pozioma kreska na wysokości szyny SN przez rozpiętość nóg — pole
 * odgałęzienia leży w układzie za nogą wyjściową, więc noga odgałęzienia wychodzi z końca szyny
 * (decyzja właściciela O4), a dalszy bieg „L” odgałęzienia jest odcinkiem toru układu. Pole bez odcinka toru (pole transformatora, rezerwa) nie
 * jest nogą. Orientacja jest orientacją układu (`buildScene`) — symbolu się nie obraca.
 * Które stacje i które obiekty: `hitAreas.stacjePrzegladu` / `bezWezlaPrzegladu` — jedno źródło
 * dla rysunku i warstwy trafień.
 *
 * Czyste funkcje, bez DOM.
 */
import { GRID, type V3Rect } from '../core/grid';
import type { PreviewSegment, PreviewSymbol } from '../compose/preview';
import { resultSeverityRank } from '../theme/colorTokens';
import {
  poleIStacjaObiektu,
  punktNaLamanej,
  stacjePrzegladu,
  szynySnPrzegladu,
  stacjaPrzegladuObiektu,
  type HierarchiaCelowWejscie,
  type RodzajStacjiPrzegladu,
} from './hitAreas';
import { przerwaToru } from './torMocy';

/** Noga symbolu stacji: oś pola od szyny do portu toru (współrzędne sceny). */
export interface NogaStacji {
  readonly pole: string;
  readonly x: number;
  readonly ySzyny: number;
  readonly yToru: number;
  /** Punkt załamania toru za nogą: koniec pionowego biegu odcinka toru, który od portu ciągnie
   *  się w osi nogi (odgałęzienie „L”, zejście do magistrali). Bez takiego biegu — `yToru`. Na
   *  ekranie noga kończy się tutaj, więc □ łącznika otwartego stoi w środku odcinka
   *  szyna–załamanie (decyzja właściciela 2026-11-12: linia nigdy z narożnika □). */
  readonly yZalamania: number;
  /** Indeks odcinka toru (magistrali/odgałęzienia) dochodzącego do nogi — wygląd kreski nogi. */
  readonly odcinekToru: number;
  /** Rola pola na torze (`trackRole` aparatów pola): wejście/wyjście magistrali albo odgałęzienie. */
  readonly rola: 'magistrala' | 'odgalezienie';
}

/** Symbol stacji w kadrze przeglądowym. */
export interface SymbolStacji {
  readonly stacjaRef: string;
  readonly rodzaj: RodzajStacjiPrzegladu;
  /** Punkt rozłącznikowy: `otwarty`, gdy którykolwiek łącznik stacji przerywa tor (łącznik otwarty
   *  albo punkt NO, `torMocy.przerwaToru`); stacje SN/nN — `undefined`. */
  readonly stanPunktu?: 'zamkniety' | 'otwarty';
  /** Indeksy odcinków szyny SN stacji (rosnąco). */
  readonly szyny: readonly number[];
  /** Nogi w porządku pól hierarchii. */
  readonly nogi: readonly NogaStacji[];
  /** Szyna rysowana w kadrze przeglądowym: rozpiętość nóg (odgałęzienie wychodzi z KOŃCA szyny,
   *  decyzja właściciela O4), a przy jednej nodze (stacja końcowa) — rozpiętość szyny SN sceny. */
  readonly szynaPrzegladu: { readonly x0: number; readonly x1: number; readonly y: number } | undefined;
}

const EPS = 1e-6;

/**
 * Symbole stacji kadru przeglądowego przy skali `skala`, w porządku stacji hierarchii
 * (determinizm). Stacje spoza `stacjePrzegladu` rysują się pełnym rysunkiem.
 */
export function symboleStacji(
  symbole: readonly PreviewSymbol[],
  odcinki: readonly PreviewSegment[],
  hierarchia: HierarchiaCelowWejscie,
  skala: number,
): readonly SymbolStacji[] {
  const przeglad = stacjePrzegladu(symbole, hierarchia, skala);
  if (przeglad.size === 0) return [];
  const szynyStacji = new Map<string, number[]>();
  const odcinkiPola = new Map<string, number[]>();
  /** Końce odcinków toru spoza stacji i pól (magistrale, odgałęzienia). */
  const konceToru: { x: number; y: number; index: number }[] = [];
  odcinki.forEach((odcinek, index) => {
    if (odcinek.points.length < 2) return;
    const { pole, stacja } = poleIStacjaObiektu(hierarchia, odcinek.meta?.ownerRef);
    if (pole === undefined && stacja === undefined) {
      const pts = odcinek.points;
      konceToru.push({ x: pts[0].x, y: pts[0].y, index }, { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, index });
      return;
    }
    if (pole !== undefined && stacjaPrzegladuObiektu(hierarchia, przeglad, odcinek.meta?.ownerRef) !== undefined) {
      odcinkiPola.set(pole, [...(odcinkiPola.get(pole) ?? []), index]);
    }
  });
  for (const [index, st] of szynySnPrzegladu(odcinki, hierarchia, przeglad)) szynyStacji.set(st, [...(szynyStacji.get(st) ?? []), index]);
  const rolaPola = new Map<string, 'magistrala' | 'odgalezienie'>();
  for (const symbol of symbole) {
    const { pole } = poleIStacjaObiektu(hierarchia, symbol.meta?.ownerRef);
    const r = symbol.meta?.trackRole;
    if (pole === undefined || r === undefined || rolaPola.has(pole)) continue;
    rolaPola.set(pole, r === 'odgalezienie' ? 'odgalezienie' : 'magistrala');
  }
  const out: SymbolStacji[] = [];
  for (const stacjaRef of hierarchia.stacje.keys()) {
    const rodzaj = przeglad.get(stacjaRef);
    if (rodzaj === undefined) continue;
    const szyny = szynyStacji.get(stacjaRef) ?? [];
    const nogi: NogaStacji[] = [];
    for (const [pole, obszar] of hierarchia.pola) {
      if (obszar.stacjaRef !== stacjaRef) continue;
      // Punkt przyłączenia pola do szyny: koniec odcinka pola leżący na szynie SN stacji.
      let przylacze: { x: number; y: number } | undefined;
      for (const i of odcinkiPola.get(pole) ?? []) {
        const pts = odcinki[i].points;
        for (const p of [pts[0], pts[pts.length - 1]]) {
          if (przylacze === undefined && szyny.some((s) => punktNaLamanej(p, odcinki[s].points))) przylacze = p;
        }
      }
      if (przylacze === undefined) continue;
      // Port toru: koniec odcinka magistrali/odgałęzienia na osi pola, w obrębie pola (±2 GRID),
      // najbliższy szynie.
      const r = obszar.rect;
      let port: { y: number; index: number } | undefined;
      for (const k of konceToru) {
        if (Math.abs(k.x - przylacze.x) > EPS) continue;
        if (k.y < r.y - 2 * GRID || k.y > r.y + r.height + 2 * GRID) continue;
        if (Math.abs(k.y - przylacze.y) < EPS) continue;
        if (port === undefined || Math.abs(k.y - przylacze.y) < Math.abs(port.y - przylacze.y)) port = { y: k.y, index: k.index };
      }
      if (port === undefined) continue;
      nogi.push({
        pole,
        x: przylacze.x,
        ySzyny: przylacze.y,
        yToru: port.y,
        yZalamania: koniecPionu(odcinki[port.index].points, przylacze.x, port.y, przylacze.y),
        odcinekToru: port.index,
        rola: rolaPola.get(pole) ?? 'magistrala',
      });
    }
    let szynaPrzegladu: SymbolStacji['szynaPrzegladu'];
    if (nogi.length >= 2) {
      const xs = nogi.map((n) => n.x);
      szynaPrzegladu = { x0: Math.min(...xs), x1: Math.max(...xs), y: nogi[0].ySzyny };
    } else if (szyny.length > 0) {
      const pts = szyny.flatMap((i) => odcinki[i].points);
      const xs = pts.map((p) => p.x);
      szynaPrzegladu = { x0: Math.min(...xs), x1: Math.max(...xs), y: pts[0].y };
    }
    if (rodzaj === 'punkt-rozlacznikowy') {
      const otwarty = symbole.some((s) => przerwaToru(s) && stacjaPrzegladuObiektu(hierarchia, przeglad, s.meta?.ownerRef) === stacjaRef);
      out.push({ stacjaRef, rodzaj, szyny, nogi, szynaPrzegladu, stanPunktu: otwarty ? 'otwarty' : 'zamkniety' });
    } else {
      out.push({ stacjaRef, rodzaj, szyny, nogi, szynaPrzegladu });
    }
  }
  return out;
}

/**
 * Koniec pionowego biegu łamanej toru od portu (x, yPortu) w osi nogi, w kierunku od szyny —
 * pierwszy punkt załamania. Łamana zaczyna albo kończy się w porcie; bieg idzie wzdłuż kolejnych
 * punktów o tym samym x, dopóki oddala się od szyny.
 */
function koniecPionu(points: readonly { readonly x: number; readonly y: number }[], x: number, yPortu: number, ySzyny: number): number {
  const pts = Math.abs(points[0].x - x) < EPS && Math.abs(points[0].y - yPortu) < EPS ? points : [...points].reverse();
  const zwrot = Math.sign(yPortu - ySzyny);
  let y = yPortu;
  for (let i = 1; i < pts.length; i += 1) {
    if (Math.abs(pts[i].x - x) > EPS || Math.sign(pts[i].y - y) !== zwrot) break;
    y = pts[i].y;
  }
  return y;
}

/**
 * Przerwy toru w nogach symboli stacji (decyzja właściciela 2026-11-12): łącznik otwarty pola nogi
 * rysuje się znacznikiem □ w ŚRODKU nogi — noga biegnie dalej ponad □ do szyny i poniżej □ do
 * punktu załamania toru (`NogaStacji.yZalamania`); linia nigdy nie wychodzi z boku ani z narożnika
 * □. Bok znacznika `ZNACZNIK_PRZERWY_PX` ekranu, ograniczony tak, by od szyny i od punktu
 * załamania zostało co najmniej GRID. Wynik: indeks symbolu łącznika → prostokąt znacznika (współrzędne sceny).
 */
export function przerwyWNogach(
  symbole: readonly PreviewSymbol[],
  stacje: readonly SymbolStacji[],
  hierarchia: HierarchiaCelowWejscie,
  skala: number,
): ReadonlyMap<number, V3Rect> {
  const nogaPola = new Map<string, NogaStacji>();
  for (const st of stacje) if (st.rodzaj !== 'punkt-rozlacznikowy') for (const n of st.nogi) nogaPola.set(n.pole, n);
  const out = new Map<number, V3Rect>();
  if (nogaPola.size === 0) return out;
  const s = Number.isFinite(skala) && skala > 0 ? skala : 1;
  symbole.forEach((symbol, index) => {
    if (!przerwaToru(symbol)) return;
    const { pole } = poleIStacjaObiektu(hierarchia, symbol.meta?.ownerRef);
    const noga = pole === undefined ? undefined : nogaPola.get(pole);
    if (noga === undefined) return;
    const dlugosc = Math.abs(noga.yZalamania - noga.ySzyny);
    const bok = Math.max(0, Math.min(ZNACZNIK_PRZERWY_PX / s, dlugosc - 2 * GRID));
    const cy = (noga.ySzyny + noga.yZalamania) / 2;
    out.set(index, { x: noga.x - bok / 2, y: cy - bok / 2, width: bok, height: bok });
  });
  return out;
}

/** Ścieżka nóg symbolu stacji: każda noga osobną podścieżką pionową od szyny do portu toru. */
export function sciezkaNog(nogi: readonly NogaStacji[]): string {
  return nogi.map((n) => `M ${n.x} ${n.ySzyny} V ${n.yToru}`).join(' ');
}

/**
 * Punkt rozłącznikowy R1 (decyzja właściciela 2026-11-12): linia przez porty toru nóg (bez nóg
 * i szyny), w kolejności osi — porty bez zmian przy przybliżaniu; odgałęzienie wychodzi z linii
 * w swoim porcie (węzeł T). Romb na środku rozpiętości portów wejścia i wyjścia.
 */
export function liniaPunktu(nogi: readonly NogaStacji[]): string {
  const porty = [...nogi].sort((a, b) => a.x - b.x || a.yToru - b.yToru);
  if (porty.length < 2) return '';
  return porty.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yToru}`).join(' ');
}

/** Przekątna rombu R1 [px EKRANU]. */
export const ROMB_PUNKTU_PX = 12;

/** Romb R1 o stałym rozmiarze ekranowym, na środku rozpiętości portów nóg. */
export function rombPunktu(nogi: readonly NogaStacji[], skala: number): string {
  if (nogi.length === 0) return '';
  const s = Number.isFinite(skala) && skala > 0 ? skala : 1;
  const xs = nogi.map((n) => n.x);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  // Środek na linii portów: y portu nogi najbliższej środka (porty stacji leżą na jednej linii).
  const cy = [...nogi].sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx) || a.x - b.x)[0].yToru;
  const r = ROMB_PUNKTU_PX / 2 / s;
  return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
}

/** Punkt zawieszenia znaku B1: środek między nogami magistrali (wejście, wyjście); bez nich —
 *  środek szyny przeglądowej. */
export function xZawieszeniaZnaku(stacja: SymbolStacji): number | undefined {
  const mag = stacja.nogi.filter((n) => n.rola === 'magistrala').map((n) => n.x);
  if (mag.length >= 2) return (Math.min(...mag) + Math.max(...mag)) / 2;
  const sz = stacja.szynaPrzegladu;
  return sz === undefined ? undefined : (sz.x0 + sz.x1) / 2;
}

/** Wymiary znaku B1 (stacja z OZE) [px EKRANU]: pion zawieszenia i promień okręgu. */
export const ZNAK_OZE_PX = { pion: 6, promien: 5 } as const;

/**
 * Znak B1 stacji z OZE (decyzja właściciela 2026-11-12): okrąg z falą „~” zawieszony krótkim
 * pionem pod szyną — po stronie nóg (w układzie sceny szyna leży nad torem, więc „pod szyną” to
 * wnętrze symbolu między nogami; nad szyną stoi opis szyny), na środku między nogami magistrali
 * (`xZawieszenia`). Rozmiar stały na ekranie. `kierunekNog` — znak (y portu toru − y szyny).
 */
export function znakOze(ySzyny: number, xZawieszenia: number, kierunekNog: 1 | -1, skala: number): string {
  const s = Number.isFinite(skala) && skala > 0 ? skala : 1;
  const pion = ZNAK_OZE_PX.pion / s;
  const r = ZNAK_OZE_PX.promien / s;
  const cx = xZawieszenia;
  const szyna = { y: ySzyny };
  const zwrot = kierunekNog;
  const yStyku = szyna.y + zwrot * pion;
  const cy = yStyku + zwrot * r;
  const f = 0.55 * r;
  return (
    `M ${cx} ${szyna.y} V ${yStyku} ` +
    `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 ` +
    `M ${cx - f} ${cy} q ${f / 2} ${-f} ${f} 0 t ${f} 0`
  );
}

/** Najgorszy stan alarmowy stacji: miejsce zwarcia albo przekroczenie w wynikach (severity
 *  backendu) obiektu stacji. */
export type StanAlarmowyStacji =
  | { readonly rodzaj: 'miejsce-zwarcia' }
  | { readonly rodzaj: 'przekroczenie'; readonly severity: string };

/**
 * Najgorszy stan alarmowy każdej stacji glifu zbiorczego — z TYCH SAMYCH nośników co znaczniki
 * stanu R5 (`znacznikiStanu.ts`: przekroczenia wyników i punkty zwarcia), bez nowego kanału stanu.
 * Ranga: miejsce zwarcia > przekroczenie wg `resultSeverityRank`; remis — pierwszy w kolejności
 * wejścia (wejście posortowane po ref, determinizm). Stacja bez alarmu nie ma wpisu.
 */
export function najgorszyStanStacji(
  hierarchia: HierarchiaCelowWejscie,
  przekroczenia: readonly { readonly ref: string; readonly severity: string }[],
  punktyZwarcia: readonly { readonly ownerRef: string }[],
): ReadonlyMap<string, StanAlarmowyStacji> {
  const out = new Map<string, StanAlarmowyStacji>();
  const ranga = (s: StanAlarmowyStacji) => (s.rodzaj === 'miejsce-zwarcia' ? Number.POSITIVE_INFINITY : resultSeverityRank(s.severity));
  const zglos = (ref: string, stan: StanAlarmowyStacji) => {
    const { pole, stacja } = poleIStacjaObiektu(hierarchia, ref);
    const glif = stacja ?? (pole === undefined ? undefined : hierarchia.pola.get(pole)?.stacjaRef);
    if (glif === undefined) return;
    const dotychczas = out.get(glif);
    if (dotychczas === undefined || ranga(stan) > ranga(dotychczas)) out.set(glif, stan);
  };
  for (const p of punktyZwarcia) zglos(p.ownerRef, { rodzaj: 'miejsce-zwarcia' });
  for (const p of przekroczenia) zglos(p.ref, { rodzaj: 'przekroczenie', severity: p.severity });
  return out;
}

/** Bok znacznika przerwy toru [px EKRANU] — łącznik otwarty bez czytelnego wnętrza. */
export const ZNACZNIK_PRZERWY_PX = 6;

/**
 * Znacznik przerwy toru dla łącznika otwartego bez czytelnego wnętrza: kwadrat o boku
 * `ZNACZNIK_PRZERWY_PX` ekranu, wyśrodkowany na gabarycie symbolu — wypełniony tłem kanwy
 * (przerywa linię toru) i obrysowany kolorem stanu łącznika.
 */
export function znacznikPrzerwyToru(gabaryt: V3Rect, skala: number): V3Rect {
  const bok = ZNACZNIK_PRZERWY_PX / (Number.isFinite(skala) && skala > 0 ? skala : 1);
  return { x: gabaryt.x + gabaryt.width / 2 - bok / 2, y: gabaryt.y + gabaryt.height / 2 - bok / 2, width: bok, height: bok };
}

/**
 * Znak przeglądowy transformatora (wymaganie „transformator jako znak zmiany poziomu napięcia”):
 * dwa stykające się okręgi uzwojeń w gabarycie symbolu, jedną ścieżką — porty na górnej i dolnej
 * krawędzi gabarytu bez zmian (ciągłość przy przybliżaniu). Rysowany, gdy przy tej skali klik
 * transformatora przejmuje stacja (cel R6 inny niż aparat).
 */
export function znakPrzegladowyTransformatora(g: V3Rect): string {
  const r = Math.min(g.width / 2, g.height / 3);
  const cx = g.x + g.width / 2;
  const c1 = g.y + r;
  const c2 = g.y + g.height - r;
  const okrag = (cy: number) => `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
  return `${okrag(c1)} ${okrag(c2)}`;
}
