/**
 * SYMBOL ZIEMI ZAWSZE POD UZIEMNIKIEM, SKIEROWANY W DÓŁ — decyzja właściciela 2026-10-30 (wzorzec
 * HMI e²TANGO, karta UX-04/POLE-LINIOWE-WZORZEC): symbol uziemienia (IEC 60617 S00200, trzy
 * malejące kreski) leży pod kotwicą styku, na końcu pionu odgałęzienia, kreska najdłuższa u góry,
 * najkrótsza u dołu. Dotyczy Q1 (łącznik trójpołożeniowy), Q5 i Q8 (uziemniki) oraz KAŻDEGO glifu
 * z ziemią w schemacie.
 *
 * Inwentarz klasy (wszystkie rysunki z ziemią w kodzie frontendu, stan 2026-10-30):
 *  · v3, kafle QET pola SN: `qetEarthSwitch` (Q5, Q8), `qetThreePositionSwitch` i
 *    `qetThreePositionSwitchZNapedem` (Q1) — kotwica z danych `ziemia.kotwica` (przegub uziemnika
 *    albo dolny koniec zestyku uziemiającego);
 *  · v3, rodzina kanoniczna: `earthSwitch` (kotwica = styk stały noża), `neutralEarthing`
 *    w czterech rodzajach `earthingKind` (kotwica = zacisk górny; przy sieci izolowanej tor do uziomu
 *    jest przerwany CELOWO, w pozostałych ciągły), `capacitorBank` w układzie `GWIAZDA_UZIEMIONA`
 *    (kotwica = punkt gwiazdy);
 *  · rejestr CAD (projekcja nN, harness pakietu symboli): `cad.uziemnik` (kotwica = styk stały);
 *    projekcja nN obraca symbol o 90° wyłącznie dla sprzęgła szyn — test przypina, że żaden symbol
 *    osiągalny w tej orientacji nie niesie ziemi (obrót położyłby ziemię na boku);
 *  · v2 (strony harnessów: galeria, stacja rozdzielcza, źródło OZE; schemat roboczy aplikacji ich
 *    nie montuje): `ApparatusEarthingSwitch`, `ApparatusThreePositionSwitch`, `UziemnikIEC`.
 *  · SVG kanoniczne `ui/sld/canonical_symbols/{ground,earthing_switch,switch_3pos}.svg` — żaden
 *    moduł ich nie importuje (wzmianki tylko w komentarzach), nie trafiają na żaden ekran.
 * Inwentarz jest wyprowadzany z rysunku (detektor ziemi na każdym glifie, w każdym wariancie
 * danych) i porównywany z listą powyżej w obie strony: nowy glif z ziemią spoza listy albo glif
 * z listy bez wykrytej ziemi = czerwony test.
 *
 * Detektor mierzy WYRENDEROWANY SVG (wszystkie transformacje złożone): grupa ziemi = co najmniej
 * trzy równoległe kreski o wspólnym środku, w odstępach ≤ 6 j., o długościach ściśle
 * monotonicznych. Wymagania (każde osobno nazwane w komunikacie):
 *  · kreski poziome (ziemia nie leży na boku);
 *  · najdłuższa u góry, długości maleją w dół (ziemia skierowana w dół);
 *  · pion odgałęzienia dochodzi do najdłuższej kreski od góry (ziemia na końcu pionu), poza
 *    siecią izolowaną, gdzie przerwa jest treścią symbolu;
 *  · najdłuższa kreska leży poniżej kotwicy styku, w jej osi;
 *  · tor od kotwicy do ziemi ciągły — przerwany wyłącznie przy sieci izolowanej (predykat parami:
 *    przerwa ⇔ `earthingKind === 'isolated'`).
 * Iloczyn: {Q1 trójpołożeniowy (bez i z napędem), Q5/Q8 uziemnik, uziemnik rodziny kanonicznej,
 * punkt neutralny ×4 rodzaje, bateria w gwieździe uziemionej, uziemnik CAD, trzy symbole v2} ×
 * stan {zamknięty, otwarty, uziemiony, nieustalony, awaria, brak stanu} × motyw {ciemny, jasny} ×
 * poziom szczegółu {LOD1, LOD2} (mnożnik kreski kanwy `strokeScaleFactor`).
 * Iniekcje (każda czerwona): ziemia odbita w górę, ziemia obrócona na bok, ziemia nad kotwicą,
 * ziemia poza osią kotwicy, brak pionu odgałęzienia, przerwa toru punktu neutralnego uziemionego
 * bezpośrednio (stan sprzed poprawki 2026-10-30).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { UKLADY_POLACZEN_BATERII } from '../../../../../types/enm';
import { ApparatusEarthingSwitch, ApparatusThreePositionSwitch } from '../../../v2/station-rozdzielnia/GpzApparatusSymbols';
import { UziemnikIEC } from '../../../v2/station-rozdzielnia/canon/sldCanonKit';
import { CadSymbol } from '../../cad/CadSymbol';
import { ELECTRICAL_CAD_SYMBOL_REGISTRY, type CadSwitchState, type CadSymbolId } from '../../cad/cadSymbolRegistry';
import { QET_SYMBOLE_POLA_SN, type QetSymbolPolaSnId } from '../../cad/qet/qetPoleSn';
import { strokeScaleFactor } from '../../compose/preview';
import { DEFAULT_LOD_THRESHOLDS, LOD_HYSTERESIS_MARGIN } from '../../canvas/camera';
import { symbolAparatu } from '../../lv-domain/symbolRegistry';
import { DARK_SCADA_SLD_PALETTE } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';
import { SYMBOL_DEFS, type SymbolId } from '../defs';
import { SYMBOL_GLYPHS, SYMBOL_IDS, type GlyphProps, type SwitchState } from '../glyphs';

type P = readonly [number, number];
type M = readonly [number, number, number, number, number, number];

// ---------------------------------------------------------------------------------------------
// Geometria wyrenderowanego SVG
// ---------------------------------------------------------------------------------------------

interface Kreska {
  readonly a: P;
  readonly b: P;
  /** Element źródłowy (iniekcje przesuwają go w dokumencie). */
  readonly el: Element;
  /** `true` dla kresek, które mogą tworzyć ziemię: `line` i proste odcinki `path` z kreską. */
  readonly kandydat: boolean;
}

interface Rysunek {
  readonly kreski: readonly Kreska[];
  /** Obwiednie elementów pełnych (prostokąt, łuk, krzywa, okrąg, wielokąt) — pokrycie toru. */
  readonly bryly: ReadonlyArray<{ readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }>;
}

const JEDNOSTKA: M = [1, 0, 0, 1, 0, 0];

function zloz(p: M, q: M): M {
  return [
    p[0] * q[0] + p[2] * q[1],
    p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3],
    p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4],
    p[1] * q[4] + p[3] * q[5] + p[5],
  ];
}

function macierz(transform: string | null): M {
  let m = JEDNOSTKA;
  for (const [, nazwa, argumenty] of (transform ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = argumenty.trim().split(/[\s,]+/).map(Number);
    let t: M;
    if (nazwa === 'translate') t = [1, 0, 0, 1, a[0], a[1] ?? 0];
    else if (nazwa === 'scale') t = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
    else if (nazwa === 'matrix') t = [a[0], a[1], a[2], a[3], a[4], a[5]];
    else if (nazwa === 'rotate') {
      const r = (a[0] * Math.PI) / 180;
      const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
      t = zloz(zloz([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else throw new Error(`nieobsługiwana transformacja ${nazwa}`);
    m = zloz(m, t);
  }
  return m;
}

const punkt = (m: M, x: number, y: number): P => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const liczba = (n: Element, a: string): number => Number(n.getAttribute(a) ?? 0);

function obwiedniaPunktow(pkt: readonly P[]) {
  const xs = pkt.map((p) => p[0]);
  const ys = pkt.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Odcinki i punkty krzywych ścieżki SVG (M L H V Z — odcinki; Q C S T A — punkty krzywej). */
function sciezka(d: string): { odcinki: Array<[P, P]>; krzywe: P[][] } {
  const tokeny = d.match(/[MmLlHhVvZzQqCcSsTtAa]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? [];
  const odcinki: Array<[P, P]> = [];
  const krzywe: P[][] = [];
  let i = 0;
  let cmd = '';
  let cur: P = [0, 0];
  let start: P = [0, 0];
  const num = (): number => Number(tokeny[i++]);
  while (i < tokeny.length) {
    if (/[A-Za-z]/.test(tokeny[i])) cmd = tokeny[i++];
    const rel = cmd === cmd.toLowerCase();
    const off = (x: number, y: number): P => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    switch (cmd.toUpperCase()) {
      case 'M': {
        cur = off(num(), num());
        start = cur;
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        const n = off(num(), num());
        odcinki.push([cur, n]);
        cur = n;
        break;
      }
      case 'H': {
        const x = num();
        const n: P = [rel ? cur[0] + x : x, cur[1]];
        odcinki.push([cur, n]);
        cur = n;
        break;
      }
      case 'V': {
        const y = num();
        const n: P = [cur[0], rel ? cur[1] + y : y];
        odcinki.push([cur, n]);
        cur = n;
        break;
      }
      case 'Z': {
        odcinki.push([cur, start]);
        cur = start;
        break;
      }
      case 'Q':
      case 'S': {
        const c = off(num(), num());
        const n = off(num(), num());
        krzywe.push([cur, c, n]);
        cur = n;
        break;
      }
      case 'C': {
        const c1 = off(num(), num());
        const c2 = off(num(), num());
        const n = off(num(), num());
        krzywe.push([cur, c1, c2, n]);
        cur = n;
        break;
      }
      case 'T': {
        const n = off(num(), num());
        krzywe.push([cur, n]);
        cur = n;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        num();
        num();
        num();
        const n = off(num(), num());
        krzywe.push([cur, n, [Math.min(cur[0], n[0]) - rx, Math.min(cur[1], n[1]) - ry], [Math.max(cur[0], n[0]) + rx, Math.max(cur[1], n[1]) + ry]]);
        cur = n;
        break;
      }
      default:
        throw new Error(`nieobsługiwane polecenie ścieżki ${cmd} w „${d}"`);
    }
  }
  return { odcinki, krzywe };
}

function rysunek(doc: Document): Rysunek {
  const kreski: Kreska[] = [];
  const bryly: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  const zKreska = (el: Element): boolean => el.getAttribute('stroke') !== 'none' && liczba(el, 'stroke-width') > 0;
  const odwiedz = (el: Element, rodzic: M): void => {
    const m = zloz(rodzic, macierz(el.getAttribute('transform')));
    const tag = el.tagName;
    if (tag === 'line') {
      kreski.push({ a: punkt(m, liczba(el, 'x1'), liczba(el, 'y1')), b: punkt(m, liczba(el, 'x2'), liczba(el, 'y2')), el, kandydat: zKreska(el) });
    } else if (tag === 'path') {
      const { odcinki, krzywe } = sciezka(el.getAttribute('d') ?? '');
      for (const [a, b] of odcinki) kreski.push({ a: punkt(m, ...a), b: punkt(m, ...b), el, kandydat: zKreska(el) });
      for (const k of krzywe) bryly.push(obwiedniaPunktow(k.map((p) => punkt(m, ...p))));
    } else if (tag === 'rect') {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => liczba(el, a));
      bryly.push(obwiedniaPunktow([punkt(m, x, y), punkt(m, x + w, y + h)]));
    } else if (tag === 'circle') {
      const [cx, cy, r] = ['cx', 'cy', 'r'].map((a) => liczba(el, a));
      bryly.push(obwiedniaPunktow([punkt(m, cx - r, cy - r), punkt(m, cx + r, cy + r)]));
    } else if (tag === 'polygon' || tag === 'polyline') {
      const pkt = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      const p: P[] = [];
      for (let j = 0; j + 1 < pkt.length; j += 2) p.push(punkt(m, pkt[j], pkt[j + 1]));
      bryly.push(obwiedniaPunktow(p));
    }
    for (const dziecko of Array.from(el.children)) odwiedz(dziecko, m);
  };
  odwiedz(doc.documentElement, JEDNOSTKA);
  return { kreski, bryly };
}

// ---------------------------------------------------------------------------------------------
// Detektor ziemi i wyrocznia kierunku
// ---------------------------------------------------------------------------------------------

const TOL = 0.3;
const ODSTEP_MAX = 6;

interface GrupaZiemi {
  readonly orientacja: 'pozioma' | 'pionowa';
  /** Kreski od góry do dołu (pozioma) albo od lewej do prawej (pionowa). */
  readonly kreski: readonly Kreska[];
  /** Środek wspólny (x dla poziomych, y dla pionowych). */
  readonly os: number;
}

const dlugosc = (k: Kreska): number => Math.hypot(k.b[0] - k.a[0], k.b[1] - k.a[1]);
const pozioma = (k: Kreska): boolean => Math.abs(k.a[1] - k.b[1]) <= 1e-6 && dlugosc(k) >= 1;
const pionowa = (k: Kreska): boolean => Math.abs(k.a[0] - k.b[0]) <= 1e-6 && dlugosc(k) >= 1;

function wykryjZiemie(r: Rysunek): GrupaZiemi[] {
  const grupy: GrupaZiemi[] = [];
  for (const orientacja of ['pozioma', 'pionowa'] as const) {
    const wzdluz = orientacja === 'pozioma' ? 0 : 1;
    const wpoprzek = 1 - wzdluz;
    const kandydaci = r.kreski.filter((k) => k.kandydat && (orientacja === 'pozioma' ? pozioma(k) : pionowa(k)));
    const srodek = (k: Kreska): number => (k.a[wzdluz] + k.b[wzdluz]) / 2;
    const uzyte = new Set<Kreska>();
    const osie: number[] = [];
    for (const k of kandydaci) {
      // Każdą oś (wspólny środek kresek) przeglądamy raz.
      if (osie.some((o) => Math.abs(o - srodek(k)) <= TOL)) continue;
      osie.push(srodek(k));
      const wspolne = kandydaci
        .filter((q) => Math.abs(srodek(q) - srodek(k)) <= TOL)
        .sort((p, q) => p.a[wpoprzek] - q.a[wpoprzek]);
      // Przebiegi kolejnych kresek w odstępach (0,5; 6] o długościach ściśle monotonicznych.
      let przebieg: Kreska[] = [];
      const zamknij = (): void => {
        if (przebieg.length >= 3) {
          grupy.push({ orientacja, kreski: przebieg, os: srodek(przebieg[0]) });
          przebieg.forEach((q) => uzyte.add(q));
        }
      };
      for (const q of wspolne) {
        const ost = przebieg[przebieg.length - 1];
        const odstep = ost ? q.a[wpoprzek] - ost.a[wpoprzek] : 0;
        const kierunek = przebieg.length >= 2 ? Math.sign(dlugosc(przebieg[1]) - dlugosc(przebieg[0])) : 0;
        const krok = ost ? Math.sign(dlugosc(q) - dlugosc(ost)) : 0;
        const sasiad = ost !== undefined && odstep > 0.5 && odstep <= ODSTEP_MAX && Math.abs(dlugosc(q) - dlugosc(ost)) >= 0.5;
        if (sasiad && (kierunek === 0 || krok === kierunek)) przebieg.push(q);
        else {
          // Zmiana kierunku długości przy zachowanym sąsiedztwie (np. kreska styku stałego tuż
          // nad ziemią): nowy przebieg zaczyna się od ostatniej kreski poprzedniego.
          zamknij();
          przebieg = sasiad && ost !== undefined && !uzyte.has(ost) ? [ost, q] : [q];
        }
      }
      zamknij();
    }
  }
  return grupy;
}

/** Pokrycie odcinka osi pionowej x = X od y0 do y1 tuszem rysunku (kreski pionowe w osi, bryły
 *  przecinające oś). Zwraca przerwy dłuższe niż `TOL`. */
function przerwyToru(r: Rysunek, X: number, y0: number, y1: number): Array<[number, number]> {
  const odcinki: Array<[number, number]> = [];
  for (const k of r.kreski) {
    if (pionowa(k) && Math.abs(k.a[0] - X) <= TOL) odcinki.push([Math.min(k.a[1], k.b[1]), Math.max(k.a[1], k.b[1])]);
  }
  for (const b of r.bryly) if (b.x0 - TOL <= X && X <= b.x1 + TOL) odcinki.push([b.y0, b.y1]);
  odcinki.sort((p, q) => p[0] - q[0]);
  const przerwy: Array<[number, number]> = [];
  let zasieg = y0;
  for (const [a, b] of odcinki) {
    if (b <= zasieg) continue;
    if (a > zasieg + TOL && a < y1) przerwy.push([zasieg, Math.min(a, y1)]);
    zasieg = Math.max(zasieg, b);
    if (zasieg >= y1) break;
  }
  if (zasieg < y1 - TOL) przerwy.push([zasieg, y1]);
  return przerwy;
}

interface Wymagania {
  /** Kotwica styku, pod którą wisi ziemia (współrzędne rysunku). */
  readonly kotwica: P;
  /** Przerwa toru kotwica → ziemia jest treścią symbolu (sieć izolowana). */
  readonly przerwaCelowa: boolean;
}

/** Naruszenia reguły ziemi w rysunku (pusta lista = spełnia). */
function naruszeniaZiemi(r: Rysunek, w: Wymagania): string[] {
  const grupy = wykryjZiemie(r);
  if (grupy.length !== 1) return [`oczekiwano jednej grupy ziemi, wykryto ${grupy.length}`];
  const g = grupy[0];
  const bledy: string[] = [];
  if (g.orientacja !== 'pozioma') return ['ziemia leży na boku — kreski pionowe zamiast poziomych'];
  const dl = g.kreski.map(dlugosc);
  if (!dl.every((d, i) => i === 0 || d < dl[i - 1])) bledy.push(`ziemia skierowana w górę — długości kresek od góry ${dl.map((d) => d.toFixed(1)).join(', ')}`);
  const gora = g.kreski[0];
  const yGory = gora.a[1];
  const [kx, ky] = w.kotwica;
  if (Math.abs(g.os - kx) > TOL) bledy.push(`ziemia poza osią kotwicy — środek ${g.os.toFixed(2)}, kotwica ${kx}`);
  if (!(yGory > ky + 1)) bledy.push(`ziemia nie leży pod kotwicą — górna kreska y=${yGory.toFixed(2)}, kotwica y=${ky}`);
  const pion = r.kreski.some(
    (k) => pionowa(k) && Math.abs(k.a[0] - g.os) <= TOL && Math.abs(Math.max(k.a[1], k.b[1]) - yGory) <= TOL && Math.min(k.a[1], k.b[1]) < yGory - 1,
  );
  if (!w.przerwaCelowa && !pion) bledy.push('brak pionu odgałęzienia dochodzącego od góry do najdłuższej kreski ziemi');
  if (w.przerwaCelowa && pion) bledy.push('sieć izolowana: pion dochodzi do ziemi — przerwa toru zniknęła');
  const przerwy = przerwyToru(r, kx, ky, yGory);
  if (!w.przerwaCelowa && przerwy.length > 0) bledy.push(`tor kotwica → ziemia przerwany: ${przerwy.map(([a, b]) => `${a.toFixed(1)}–${b.toFixed(1)}`).join(', ')}`);
  if (w.przerwaCelowa && przerwy.length === 0) bledy.push('sieć izolowana: tor kotwica → ziemia ciągły — brak przerwy');
  return bledy;
}

// ---------------------------------------------------------------------------------------------
// Inwentarz klasy i iloczyn
// ---------------------------------------------------------------------------------------------

const LODY = [
  ['LOD1', DEFAULT_LOD_THRESHOLDS.l0Max * (1 + LOD_HYSTERESIS_MARGIN)],
  ['LOD2', DEFAULT_LOD_THRESHOLDS.l1Max * (1 - LOD_HYSTERESIS_MARGIN)],
] as const;
const MOTYWY = [
  ['ciemny', DARK_SCADA_SLD_PALETTE],
  ['jasny', LIGHT_TECHNICAL_SLD_PALETTE],
] as const;
type Motyw = (typeof MOTYWY)[number][1];
const STANY: readonly (SwitchState | undefined)[] = ['closed', 'open', 'earthed', 'unknown', 'bad', undefined];
const RODZAJE_UZIEMIENIA = ['direct', 'resistor', 'coil', 'isolated'] as const;

function dokument(el: ReactElement): Document {
  return new DOMParser().parseFromString(renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg">{el}</svg>), 'image/svg+xml');
}

function glif(id: SymbolId, props: Partial<GlyphProps>, motyw: Motyw, skala: number): Document {
  const Glyph = SYMBOL_GLYPHS[id];
  return dokument(<Glyph x={0} y={0} stroke={motyw.baseStroke} kafleStanu={motyw.state} strokeScale={strokeScaleFactor(skala)} {...props} />);
}

/** Wpis inwentarza: rysunek w danym stanie, motywie i skali + wymagania (kotwica z danych albo
 *  z jawnej geometrii symbolu). */
interface Wpis {
  readonly nazwa: string;
  readonly stany: readonly (SwitchState | undefined)[];
  readonly rysuj: (stan: SwitchState | undefined, motyw: Motyw, skala: number) => Document;
  readonly wymagania: Wymagania;
}

const QET_Z_ZIEMIA = (Object.keys(QET_SYMBOLE_POLA_SN) as QetSymbolPolaSnId[]).filter((id) => QET_SYMBOLE_POLA_SN[id].ziemia !== null);

const portGorny = (id: SymbolId): P => {
  const p = SYMBOL_DEFS[id].ports.find((q) => q.dir === 'N');
  if (!p) throw new Error(`${id}: brak zacisku górnego`);
  return [p.x, p.y];
};

const INWENTARZ: readonly Wpis[] = [
  ...QET_Z_ZIEMIA.map((id): Wpis => {
    const z = QET_SYMBOLE_POLA_SN[id].ziemia!;
    return { nazwa: `v3 ${id}`, stany: STANY, rysuj: (stan, motyw, skala) => glif(id, { state: stan }, motyw, skala), wymagania: { kotwica: [z.kotwica.x, z.kotwica.y], przerwaCelowa: false } };
  }),
  // Styk stały noża uziemnika rodziny kanonicznej: koniec noża zamkniętego (8, 14).
  { nazwa: 'v3 earthSwitch', stany: STANY, rysuj: (stan, motyw, skala) => glif('earthSwitch', { state: stan }, motyw, skala), wymagania: { kotwica: [8, 14], przerwaCelowa: false } },
  ...RODZAJE_UZIEMIENIA.map((kind): Wpis => ({
    nazwa: `v3 neutralEarthing ${kind}`,
    stany: [undefined],
    rysuj: (_stan, motyw, skala) => glif('neutralEarthing', { earthingKind: kind }, motyw, skala),
    wymagania: { kotwica: portGorny('neutralEarthing'), przerwaCelowa: kind === 'isolated' },
  })),
  // Punkt gwiazdy baterii: `gwiazda(16, 25, 5)`.
  {
    nazwa: 'v3 capacitorBank GWIAZDA_UZIEMIONA',
    stany: [undefined],
    rysuj: (_stan, motyw, skala) => glif('capacitorBank', { bateria: { uklad: 'GWIAZDA_UZIEMIONA', przekladnikNiezrownowazenia: false } }, motyw, skala),
    wymagania: { kotwica: [16, 25], przerwaCelowa: false },
  },
  // Styk stały noża uziemnika CAD: koniec noża zamkniętego (8, 14).
  {
    nazwa: 'CAD cad.uziemnik',
    stany: ['closed', 'open', 'unknown'],
    rysuj: (stan, motyw, skala) =>
      dokument(<CadSymbol id="cad.uziemnik" x={0} y={0} scale={1} state={stan as CadSwitchState} ink={motyw.baseStroke} paper="none" strokePx={2 * strokeScaleFactor(skala)} />),
    wymagania: { kotwica: [8, 14], przerwaCelowa: false },
  },
  // Styk stały strony ziemi uziemnika v2 (gałąź boczna): (cxAxis + 8, cy + 0,45·8) — tam spoczywa
  // nóż zamknięty (grot) i stoi kropka styku otwartego.
  {
    nazwa: 'v2 ApparatusEarthingSwitch',
    stany: ['closed', 'open', 'unknown'],
    rysuj: (stan) => dokument(<ApparatusEarthingSwitch cxAxis={100} cy={50} state={stan as 'open' | 'closed' | 'unknown'} />),
    wymagania: { kotwica: [108, 53.6], przerwaCelowa: false },
  },
  // Zestyk uziemiający v2: (cx − h − 3, cy + 1).
  {
    nazwa: 'v2 ApparatusThreePositionSwitch',
    stany: ['closed', 'open', 'earthed', 'unknown'],
    rysuj: (stan) => dokument(<ApparatusThreePositionSwitch cx={100} cy={50} position={stan as 'closed' | 'open' | 'earthed' | 'unknown'} />),
    wymagania: { kotwica: [88, 51], przerwaCelowa: false },
  },
  // Przegub uziemnika v2: (x + 16, y + 15).
  ...[false, true].map((closed): Wpis => ({
    nazwa: `v2 UziemnikIEC ${closed ? 'zamknięty' : 'otwarty'}`,
    stany: [undefined],
    rysuj: () => dokument(<UziemnikIEC x={100} y={50} closed={closed} />),
    wymagania: { kotwica: [116, 65], przerwaCelowa: false },
  })),
];

/** Wszystkie warianty danych zmieniające rysunek glifów v3 — przeszukanie inwentarza. */
function wariantyGlifu(id: SymbolId): ReadonlyArray<readonly [string, Partial<GlyphProps>]> {
  const w: Array<readonly [string, Partial<GlyphProps>]> = STANY.map((s) => [`stan ${s ?? 'brak'}`, { state: s }] as const);
  if (id === 'neutralEarthing') RODZAJE_UZIEMIENIA.forEach((k) => w.push([k, { earthingKind: k }]));
  if (id === 'capacitorBank') {
    for (const uklad of [...UKLADY_POLACZEN_BATERII, null]) {
      for (const p of [false, true]) w.push([`${uklad ?? 'NIEOKRESLONY'}${p ? ' z przekładnikiem' : ''}`, { bateria: { uklad, przekladnikNiezrownowazenia: p } }]);
    }
  }
  w.push(['stacja sekcjonowana z transformatorem', { stationSectioned: true, stationHasTransformer: true }]);
  for (const der of ['pv', 'bess', 'wind', 'generator'] as const) w.push([`stacja z OZE ${der}`, { stationDerOnMv: der }]);
  w.push(['licznik A', { meterQuantity: 'A' }], ['licznik V', { meterQuantity: 'V' }]);
  return w;
}

describe('symbol ziemi pod uziemnikiem, skierowany w dół — cała klasa glifów', () => {
  it('inwentarz wykryty z rysunku = inwentarz zadeklarowany (obie strony)', () => {
    const [, motyw] = MOTYWY[0];
    const [, skala] = LODY[1];
    // Klucz: symbol, a dla glifów, w których ziemię niesie DANA modelu (układ baterii), także
    // wariant danej. Ziemia uziemnika i punktu neutralnego nie zależy od stanu ani rodzaju —
    // wykrycie w części wariantów byłoby defektem, więc wymagamy jej we WSZYSTKICH.
    const wykryte = new Set<string>();
    const czesciowe: string[] = [];
    for (const id of SYMBOL_IDS) {
      const warianty = wariantyGlifu(id);
      const zZiemia = warianty.filter(([, props]) => wykryjZiemie(rysunek(glif(id, props, motyw, skala))).length > 0);
      if (id === 'capacitorBank') {
        zZiemia.forEach(([wariant]) => wykryte.add(`${id} · ${wariant}`));
      } else if (zZiemia.length > 0) {
        wykryte.add(id);
        if (zZiemia.length !== warianty.length) czesciowe.push(`${id}: ziemia w ${zZiemia.length} z ${warianty.length} wariantów`);
      }
    }
    for (const id of Object.keys(ELECTRICAL_CAD_SYMBOL_REGISTRY) as CadSymbolId[]) {
      const stany = ['closed', 'open', 'unknown'] as const;
      const zZiemia = stany.filter((stan) => wykryjZiemie(rysunek(dokument(<CadSymbol id={id} x={0} y={0} state={stan} ink="#000" paper="none" />))).length > 0);
      if (zZiemia.length > 0) wykryte.add(id);
      if (zZiemia.length > 0 && zZiemia.length !== stany.length) czesciowe.push(`${id}: ziemia w ${zZiemia.length} z 3 stanów`);
    }
    expect([...wykryte].sort()).toEqual(
      [
        ...QET_Z_ZIEMIA,
        'earthSwitch',
        'neutralEarthing',
        'capacitorBank · GWIAZDA_UZIEMIONA',
        'capacitorBank · GWIAZDA_UZIEMIONA z przekładnikiem',
        'cad.uziemnik',
      ].sort(),
    );
    expect(czesciowe).toEqual([]);
    // Kafle QET z ziemią to dokładnie Q1 (trójpołożeniowy, bez i z napędem) i Q5/Q8 (uziemnik).
    expect([...QET_Z_ZIEMIA].sort()).toEqual(['qetEarthSwitch', 'qetThreePositionSwitch', 'qetThreePositionSwitchZNapedem']);
  });

  it('każdy wpis inwentarza ma wykrytą ziemię (deklaracja bez rysunku = czerwony)', () => {
    const [, motyw] = MOTYWY[0];
    for (const w of INWENTARZ) {
      expect(wykryjZiemie(rysunek(w.rysuj(w.stany[0], motyw, LODY[1][1]))).length, w.nazwa).toBe(1);
    }
  });

  it('iloczyn: glif z ziemią × stan × motyw × LOD — ziemia pozioma, w dół, pod kotwicą, na końcu pionu', () => {
    const naruszenia: string[] = [];
    let przypadki = 0;
    for (const w of INWENTARZ) {
      for (const stan of w.stany) {
        for (const [motyw, paleta] of MOTYWY) {
          for (const [lod, skala] of LODY) {
            przypadki += 1;
            for (const b of naruszeniaZiemi(rysunek(w.rysuj(stan, paleta, skala)), w.wymagania)) {
              naruszenia.push(`${w.nazwa} · ${stan ?? 'brak stanu'} · ${motyw} · ${lod}: ${b}`);
            }
          }
        }
      }
    }
    expect(naruszenia).toEqual([]);
    expect(przypadki).toBe(INWENTARZ.reduce((s, w) => s + w.stany.length, 0) * MOTYWY.length * LODY.length);
  });

  it('predykat parami: tor punktu neutralnego do uziomu przerwany ⇔ sieć izolowana', () => {
    const [, motyw] = MOTYWY[1];
    for (const kind of RODZAJE_UZIEMIENIA) {
      for (const [, skala] of LODY) {
        const r = rysunek(glif('neutralEarthing', { earthingKind: kind }, motyw, skala));
        const g = wykryjZiemie(r)[0];
        const przerwy = przerwyToru(r, ...portGorny('neutralEarthing'), g.kreski[0].a[1]);
        expect(przerwy.length > 0, kind).toBe(kind === 'isolated');
      }
    }
  });

  it('projekcja nN obraca o 90° wyłącznie sprzęgło — żaden symbol osiągalny poziomo nie niesie ziemi', () => {
    const rodzaje = [null, 'WYLACZNIK', 'WYLACZNIK_GLOWNY', 'WYLACZNIK_ODPLYWOWY', 'REKLOZER', 'ROZLACZNIK', 'ROZLACZNIK_BEZPIECZNIKOWY', 'ODLACZNIK', 'UZIEMNIK', 'NIEZNANY'];
    const przestrzenie = [null, 'APARAT_NN_MCB', 'APARAT_NN_RCD'];
    const osiagalne = new Set<CadSymbolId>();
    for (const k of rodzaje) for (const ns of przestrzenie) {
      const s = symbolAparatu('bus_coupler', k, ns);
      if (s) osiagalne.add(s);
    }
    expect(osiagalne.size).toBeGreaterThan(0);
    for (const id of osiagalne) {
      for (const stan of ['closed', 'open', 'unknown'] as const) {
        const doc = dokument(<CadSymbol id={id} x={0} y={0} state={stan} orientation="pozioma" ink="#000" paper="none" />);
        expect(wykryjZiemie(rysunek(doc)), `${id} poziomo`).toEqual([]);
      }
    }
    expect(osiagalne.has('cad.uziemnik')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// Iniekcje — każda musi dać naruszenie
// ---------------------------------------------------------------------------------------------

/** Zmienia geometrię kresek ziemi w dokumencie (przekształcenie punktów `line`). */
function przeksztalcZiemie(doc: Document, f: (p: P, g: GrupaZiemi) => P): Document {
  const g = wykryjZiemie(rysunek(doc))[0];
  for (const k of g.kreski) {
    if (k.el.tagName !== 'line') throw new Error('iniekcja obsługuje kreski `line`');
    const [a, b] = [f(k.a, g), f(k.b, g)];
    // Element `line` ma transformację rodzica; iniekcję wykonujemy w układzie rysunku, więc
    // zdejmujemy translację rodzica (glify są tylko przesuwane — v3 nigdy nie obraca symboli).
    const dx = k.a[0] - liczba(k.el, 'x1');
    const dy = k.a[1] - liczba(k.el, 'y1');
    k.el.setAttribute('x1', String(a[0] - dx));
    k.el.setAttribute('y1', String(a[1] - dy));
    k.el.setAttribute('x2', String(b[0] - dx));
    k.el.setAttribute('y2', String(b[1] - dy));
  }
  return doc;
}

describe('iniekcje reguły ziemi', () => {
  const [, motyw] = MOTYWY[0];
  const skala = LODY[0][1];
  const pierwszy = (w: Wpis): Document => w.rysuj(w.stany[0], motyw, skala);

  it.each(INWENTARZ.map((w) => [w.nazwa, w] as const))('%s: ziemia odbita w górę → czerwony', (_n, w) => {
    const doc = przeksztalcZiemie(pierwszy(w), ([x, y], g) => {
      const ys = g.kreski.map((k) => k.a[1]);
      return [x, Math.min(...ys) + Math.max(...ys) - y];
    });
    expect(naruszeniaZiemi(rysunek(doc), w.wymagania).join(' | ')).toMatch(/skierowana w górę/);
  });

  it.each(INWENTARZ.map((w) => [w.nazwa, w] as const))('%s: ziemia obrócona na bok → czerwony', (_n, w) => {
    const doc = przeksztalcZiemie(pierwszy(w), ([x, y], g) => {
      const c: P = [g.os, g.kreski[1].a[1]];
      return [c[0] - (y - c[1]), c[1] + (x - c[0])];
    });
    expect(naruszeniaZiemi(rysunek(doc), w.wymagania).join(' | ')).toMatch(/na boku/);
  });

  it.each(INWENTARZ.map((w) => [w.nazwa, w] as const))('%s: ziemia nad kotwicą → czerwony', (_n, w) => {
    const doc = przeksztalcZiemie(pierwszy(w), ([x, y], g) => [x, y - (g.kreski[0].a[1] - w.wymagania.kotwica[1]) - 12]);
    expect(naruszeniaZiemi(rysunek(doc), w.wymagania).join(' | ')).toMatch(/nie leży pod kotwicą/);
  });

  it.each(INWENTARZ.map((w) => [w.nazwa, w] as const))('%s: ziemia poza osią kotwicy → czerwony', (_n, w) => {
    const doc = przeksztalcZiemie(pierwszy(w), ([x, y]) => [x + 6, y]);
    expect(naruszeniaZiemi(rysunek(doc), w.wymagania).join(' | ')).toMatch(/poza osią kotwicy/);
  });

  it.each(INWENTARZ.filter((w) => !w.wymagania.przerwaCelowa).map((w) => [w.nazwa, w] as const))(
    '%s: brak pionu odgałęzienia → czerwony',
    (_n, w) => {
      const doc = pierwszy(w);
      const r = rysunek(doc);
      const g = wykryjZiemie(r)[0];
      const yGory = g.kreski[0].a[1];
      for (const k of r.kreski) {
        if (pionowa(k) && Math.abs(k.a[0] - g.os) <= TOL && Math.abs(Math.max(k.a[1], k.b[1]) - yGory) <= TOL) k.el.remove();
      }
      expect(naruszeniaZiemi(rysunek(doc), w.wymagania).join(' | ')).toMatch(/brak pionu odgałęzienia/);
    },
  );

  it('punkt neutralny uziemiony bezpośrednio z przerwą toru (stan sprzed poprawki) → czerwony', () => {
    const w = INWENTARZ.find((q) => q.nazwa === 'v3 neutralEarthing direct')!;
    const doc = pierwszy(w);
    // Poprawka 2026-10-30 dorysowała połączenie zacisku z uziomem w osi (8, 8 → 18); jego zdjęcie
    // odtwarza rysunek sprzed poprawki, który wyglądał jak sieć izolowana.
    const most = Array.from(doc.querySelectorAll('[data-tor-uziemienia="bezposredni"]'));
    expect(most.length).toBe(1);
    most.forEach((e) => e.remove());
    expect(naruszeniaZiemi(rysunek(doc), w.wymagania).join(' | ')).toMatch(/tor kotwica → ziemia przerwany/);
  });

  it('sieć izolowana z domkniętym torem → czerwony (przerwa jest treścią symbolu)', () => {
    const w = INWENTARZ.find((q) => q.nazwa === 'v3 neutralEarthing isolated')!;
    const doc = pierwszy(w);
    const svg = doc.documentElement;
    const l = doc.createElementNS('http://www.w3.org/2000/svg', 'line');
    for (const [a, v] of [['x1', 8], ['y1', 0], ['x2', 8], ['y2', 21], ['stroke', '#000'], ['stroke-width', 1]] as const) l.setAttribute(a, String(v));
    svg.appendChild(l);
    expect(naruszeniaZiemi(rysunek(doc), w.wymagania).join(' | ')).toMatch(/sieć izolowana/);
  });
});
