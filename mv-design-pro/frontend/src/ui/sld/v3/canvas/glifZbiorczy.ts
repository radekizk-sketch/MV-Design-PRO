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
import { gabarytSymbolu } from '../symbols/blokZabezpieczen';
import type { PreviewSegment, PreviewSymbol } from '../compose/preview';
import { resultSeverityRank } from '../theme/colorTokens';
import {
  poleIStacjaObiektu,
  punktNaLamanej,
  stacjePrzegladu,
  szynySnPrzegladu,
  stacjaPrzegladuObiektu,
  sprzegloSzyn,
  type HierarchiaCelowWejscie,
  type RodzajStacjiPrzegladu,
} from './hitAreas';
import { ZNACZNIK_PRZERWY_PX } from './oknoRenderu';
import { LACZNIKI_TORU_MOCY, przerwaToru } from './torMocy';
import type { SymbolId } from '../symbols/defs';
import type { OwnedLabel } from '../layout/labels';
import type { EtykietyPrzegladuStacji } from './labelLegibility';

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
  /** Przerwy szyny przeglądowej: rozpiętość [x0, x1] każdego sprzęgła szyn przerywającego tor
   *  (otwarte, nieustalone — `torMocy.przerwaToru`), rosnąco. Sprzęgło zamknięte nie przerywa
   *  szyny; stan obu niesie kafel stanu sprzęgła (`oknoRenderu.wygladAparatuBezWnetrza`). */
  readonly przerwySzyny: readonly { readonly x0: number; readonly x1: number }[];
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
    // Sprzęgło szyn (oględziny architekta 2026-11-13 pkt 2): znak stanu stoi na szynie
    // przeglądowej — szyna obejmuje środek każdego sprzęgła stacji (sekcje po obu stronach).
    const przerwySzyny: { x0: number; x1: number }[] = [];
    if (szynaPrzegladu !== undefined) {
      for (const sx of symbole) {
        if (!sprzegloSzyn(hierarchia, sx) || stacjaPrzegladuObiektu(hierarchia, przeglad, sx.meta?.ownerRef) !== stacjaRef) continue;
        const g = gabarytSymbolu(sx);
        const cx = g.x + g.width / 2;
        szynaPrzegladu = { x0: Math.min(szynaPrzegladu.x0, cx), x1: Math.max(szynaPrzegladu.x1, cx), y: szynaPrzegladu.y };
        if (przerwaToru(sx)) przerwySzyny.push({ x0: g.x, x1: g.x + g.width });
      }
      przerwySzyny.sort((a, b) => a.x0 - b.x0);
    }
    if (rodzaj === 'punkt-rozlacznikowy') {
      const otwarty = symbole.some((s) => przerwaToru(s) && stacjaPrzegladuObiektu(hierarchia, przeglad, s.meta?.ownerRef) === stacjaRef);
      out.push({ stacjaRef, rodzaj, szyny, nogi, szynaPrzegladu, przerwySzyny, stanPunktu: otwarty ? 'otwarty' : 'zamkniety' });
    } else {
      out.push({ stacjaRef, rodzaj, szyny, nogi, szynaPrzegladu, przerwySzyny });
    }
  }
  return out;
}

/**
 * Ranga łącznika jako ŁĄCZNIKA PODSTAWOWEGO pola wg zdolności łączeniowej (mniejsza — ważniejsza):
 * 0 — wyłącznik (łączy i wyłącza prądy zwarciowe; także reklozer i wyłącznik w torze poziomym);
 * 1 — łącznik łączący prąd roboczy: rozłącznik, rozłącznik z bezpiecznikami, łącznik
 * trójpołożeniowy, łącznik w torze poziomym, punkt normalnie otwarty; 2 — odłącznik (łączy
 * bez prądu, przerwa widoczna). Kolejność biblioteki `CONTINUITY_APPARATUS_SYMBOL_IDS` stawia
 * odłącznik przed rozłącznikiem (pierwszeństwo rysunku L0), dlatego tu tabela jawna: w polu
 * „odłącznik + rozłącznik” stanem pola jest rozłącznik. Tabela pokrywa cały zbiór
 * `LACZNIKI_TORU_MOCY` (test kontraktu).
 */
export const RANGA_LACZNIKA_PODSTAWOWEGO: Readonly<Partial<Record<SymbolId, 0 | 1 | 2>>> = {
  breaker: 0,
  qetBreaker: 0,
  qetBreakerZNapedem: 0,
  qetBreakerWysuwny: 0,
  qetBreakerWysuwnyZNapedem: 0,
  lineBreaker: 0,
  recloser: 0,
  loadBreakSwitch: 1,
  qetLoadBreakSwitch: 1,
  fuseSwitch: 1,
  qetFuseSwitch: 1,
  qetThreePositionSwitch: 1,
  qetThreePositionSwitchZNapedem: 1,
  lineSwitch: 1,
  noPoint: 1,
  disconnector: 2,
  qetDisconnector: 2,
};

/**
 * Łączniki ze ZNAKIEM STANU (kafel w barwie położenia) w LOD1 i LOD0 (dyrektywa właściciela
 * 2026-11-13: LOD1 — „podstawowy łącznik i stan”; LOD0 — stan sprzęgła): każde sprzęgło szyn
 * (`hitAreas.sprzegloSzyn`) i ŁĄCZNIK PODSTAWOWY każdego pola — łącznik toru mocy o najmniejszej
 * randze `RANGA_LACZNIKA_PODSTAWOWEGO`, przy remisie pierwszy w kolejności sceny (determinizm).
 * Pozostałe łączniki pola: zamknięte — przelot linii, otwarte — □ przerwy toru
 * (`oknoRenderu.wygladAparatuBezWnetrza`). Wynik: indeksy symboli sceny.
 */
export function lacznikiZeZnakiemStanu(
  symbole: readonly PreviewSymbol[],
  hierarchia: HierarchiaCelowWejscie,
): ReadonlySet<number> {
  const out = new Set<number>();
  const podstawowy = new Map<string, { index: number; ranga: number }>();
  symbole.forEach((symbol, index) => {
    if (symbol.meta?.elementKind !== 'apparatus' || !LACZNIKI_TORU_MOCY.has(symbol.symbolId)) return;
    if (sprzegloSzyn(hierarchia, symbol)) {
      out.add(index);
      return;
    }
    const { pole } = poleIStacjaObiektu(hierarchia, symbol.meta?.ownerRef);
    const ranga = RANGA_LACZNIKA_PODSTAWOWEGO[symbol.symbolId];
    if (pole === undefined || ranga === undefined) return;
    const dotychczas = podstawowy.get(pole);
    if (dotychczas === undefined || ranga < dotychczas.ranga) podstawowy.set(pole, { index, ranga });
  });
  for (const { index } of podstawowy.values()) out.add(index);
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

/** Ścieżka szyny przeglądowej z przerwami sprzęgieł przerywających tor (`przerwySzyny`). */
export function sciezkaSzyny(stacja: SymbolStacji): string {
  const sz = stacja.szynaPrzegladu;
  if (sz === undefined) return '';
  const czesci: string[] = [];
  let x = sz.x0;
  for (const p of stacja.przerwySzyny) {
    if (p.x0 > x) czesci.push(`M ${x} ${sz.y} H ${p.x0}`);
    x = Math.max(x, p.x1);
  }
  if (sz.x1 > x) czesci.push(`M ${x} ${sz.y} H ${sz.x1}`);
  return czesci.join(' ');
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

/**
 * LOD0 — OPISY STACJI W SYMBOLU PRZEGLĄDOWYM (dyrektywa właściciela 2026-11-13, punkt 3a): stacja
 * rysowana symbolem nie ma pod sobą wiersza „Szyna nN · 0,4 kV” ani innych wierszy pasma nazw
 * poza pierwszym (nazwa stacji) — w sieci 52 stacji ten sam wiersz powtarzał się 52 razy. Opisy
 * obiektów, których w LOD0 nie ma na rysunku (pola, źródła i odbiory w stacji), też przechodzą do
 * podpowiedzi celu stacji. Zostają: nazwa stacji (`<stacja>#name-row-0`) i opisy szyn SN (sekcje —
 * stacja dwusekcyjna rozpoznawalna). Położenie nazwy względem obrysu należy do układu
 * (`sld/v3/layout/**`, wykonawca geometrii), nie do tej funkcji. Przynależność opisu do stacji —
 * z hierarchii celów (właściciel bez sufiksu „#…”), a dla właściciela spoza hierarchii — z
 * przedrostka referencji stacji. Wynik: indeksy etykiet sceny przeniesionych do podpowiedzi.
 */
export function etykietyPrzegladu(
  labels: readonly OwnedLabel[],
  stacje: readonly SymbolStacji[],
  hierarchia: HierarchiaCelowWejscie,
): EtykietyPrzegladuStacji {
  const ukryte = new Set<number>();
  if (stacje.length === 0) return { ukryte };
  const poRef = new Map(stacje.map((s) => [s.stacjaRef, s] as const));
  const przedrostki = stacje.map((s) => [s.stacjaRef.slice(0, s.stacjaRef.lastIndexOf('/') + 1), s.stacjaRef] as const).filter(([p]) => p.length > 0);
  labels.forEach((label, index) => {
    const baza = label.ownerRef.split('#')[0];
    const { pole, stacja } = poleIStacjaObiektu(hierarchia, baza);
    let ref = stacja ?? (pole === undefined ? undefined : hierarchia.pola.get(pole)?.stacjaRef);
    if (ref === undefined || !poRef.has(ref)) ref = przedrostki.find(([p]) => baza.startsWith(p))?.[1];
    const st = ref === undefined ? undefined : poRef.get(ref);
    if (st === undefined) return;
    if (label.ownerRef === `${st.stacjaRef}#name-row-0` || label.ownerKind === 'busbar-voltage') return;
    ukryte.add(index);
  });
  return { ukryte };
}

/**
 * Opisy stacji przeglądowych przy skali (`etykietyPrzegladu` na symbolach stacji tej skali) —
 * JEDNO wejście planu etykiet dla kanwy, tuszu kadru (`zakresKadru.prostokatyZakresu`) i sond
 * testowych (para z `znacznikiStanu.przeszkodyEtykietPrzySkali`). `skala` jest skalą poziomu
 * szczegółu (kanwa podaje `oknoRenderu.skalaPoziomu`); wynik pamiętany per skala.
 */
export function przegladEtykietPrzySkali(
  scene: { readonly symbols: readonly PreviewSymbol[]; readonly segments: readonly PreviewSegment[]; readonly labels: readonly OwnedLabel[] },
  hierarchia: HierarchiaCelowWejscie,
): (skala: number) => EtykietyPrzegladuStacji {
  const pamiec = new Map<number, EtykietyPrzegladuStacji>();
  return (skala) => {
    let wynik = pamiec.get(skala);
    if (wynik === undefined) {
      wynik = etykietyPrzegladu(scene.labels, symboleStacji(scene.symbols, scene.segments, hierarchia, skala), hierarchia);
      pamiec.set(skala, wynik);
    }
    return wynik;
  };
}
