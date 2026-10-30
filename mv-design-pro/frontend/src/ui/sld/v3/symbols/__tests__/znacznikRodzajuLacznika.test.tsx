/**
 * ZNACZNIK RODZAJU APARATU PRZY STYKU STAŁYM — decyzja właściciela 2026-10-30 (wzorzec HMI
 * e²TANGO, karta UX-04/POLE-LINIOWE-WZORZEC). Kafel łącznika zawiera wyłącznie nóż, styk stały ze
 * znacznikiem rodzaju aparatu i ewentualnie napęd M; konwencja: wyłącznik „×”, odłącznik oraz
 * człon wysuwny lub odłączalny „○”, rozłącznik — wyróżnik IEC 60617 S00290 (kreska styku
 * z okręgiem), uziemnik — sama kreska styku i symbol ziemi w dół, łącznik trójpołożeniowy —
 * znaczniki obu funkcji przy odpowiednich stykach.
 *
 * Iloczyn: rodzaj {wyłącznik (bez i z napędem), odłącznik, rozłącznik (sam i z bezpiecznikami),
 * uziemnik, trójpołożeniowy (bez i z napędem), człon wysuwny} × stan {zamknięty, otwarty,
 * uziemiony, nieustalony, awaria, brak stanu} × motyw {ciemny, jasny} × poziom szczegółu
 * {LOD1 — skala wejścia `l0Max·(1+m)`, LOD2 — dolny brzeg aktywnego `l1Max·(1−m)`}. Glif jest
 * rysowany tak jak na kanwie: z mnożnikiem kreski `strokeScaleFactor(skala)` (kanwa podaje go
 * każdemu glifowi — `proporcjeRysunku.test.tsx`).
 *
 * Wyrocznia mierzy WYRENDEROWANY SVG (grupy `data-qet="znacznik"`, nóż `data-qet="noz"`
 * z transformacją `rotate`, tło kafla) — nie czyta geometrii z `qetPoleSn.ts` ani z importera:
 *  · rozmiar znacznika 22–28 % boku kafla i podłoga ekranu (LOD2 ≥ 10 px, LOD1 ≥ 8 px);
 *  · margines tuszu znacznika od krawędzi kafla ≥ 4 j.św.;
 *  · brak kolizji z nożem: tusz znacznika ≥ 1 j.św. od tuszu noża poza strefą styku 5 j.św.
 *    wokół punktu, w którym nóż spoczywa na styku w danym położeniu (styk to zamierzone
 *    zetknięcie noża ze stykiem stałym, nie kolizja);
 *  · kreska znacznika = kreska noża, kolor znacznika = kolor noża = kolor glifu kafla, kontrast
 *    glifu z kaflem czerwonym, zielonym, szarym i fioletowym ≥ 4,5:1;
 *  · rodzaj rozpoznawalny po znaczniku: sygnatura kształtu jednoznaczna dla rodzaju, ta sama
 *    w każdym symbolu, stanie, motywie i LOD, zgodna z tabelą właściciela.
 * Iniekcje (każda czerwona): znacznik za mały, za duży, brak znacznika, znacznik zsunięty na nóż,
 * kreska znacznika ≠ kreska noża, kolor znacznika ≠ kolor noża, zamieniony rodzaj, kompensacja
 * kreski nałożona na piktogram kafla (stan sprzed wiersza UX04-KRESKA-PIKTOGRAMU-KAFLA rejestru
 * konfliktów).
 *
 * Człon wysuwny lub odłączalny: model nie ma rodzaju aparatu ani położenia członu
 * (`BayPrimaryDeviceKind`, `BayPrimaryDevice.switch_state`) — szablon pola zna wyłącznik na wózku
 * tylko z opisu (`bay_templates.py`). Tabela właściciela ma wiersz z „○”, a test przypina, że
 * każdy łącznik pola i każdy symbol z kaflem ma wiersz tabeli: nowy rodzaj (np. człon wysuwny)
 * bez znacznika w tabeli = czerwony test.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QET_BOK_KAFLA_STANU, QET_KRESKA_GLIFU, QET_SYMBOLE_POLA_SN, type QetSymbolPolaSnId } from '../../cad/qet/qetPoleSn';
import { RODZAJE_LACZNIKOW_POLA } from '../../compose/rodzajeAparatuPola';
import { symboleRodzajuAparatu } from '../../compose/apparatusSequence';
import { strokeScaleFactor } from '../../compose/preview';
import { DEFAULT_LOD_THRESHOLDS, LOD_HYSTERESIS_MARGIN } from '../../canvas/camera';
import { DARK_SCADA_SLD_PALETTE, STATE_COLOR, STANY_KAFLA, type KafleStanuLacznika } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';
import { czySymbolQet, type SymbolId } from '../defs';
import { SYMBOL_GLYPHS, type SwitchState } from '../glyphs';

type P = readonly [number, number];
type RodzajZnacznika = 'wylacznik' | 'odlacznik' | 'rozlacznik' | 'uziemnik';

/** Tabela właściciela (decyzja 2026-10-30) — rodzaj aparatu → znaczniki przy stykach stałych.
 *  Wyrocznia jawna, niezależna od manifestu importera. */
const TABELA_WLASCICIELA: ReadonlyArray<{
  readonly rodzaj: string;
  readonly symbole: readonly QetSymbolPolaSnId[];
  readonly znaczniki: Readonly<Partial<Record<'closed' | 'earthed', RodzajZnacznika>>>;
}> = [
  { rodzaj: 'wyłącznik', symbole: ['qetBreaker', 'qetBreakerZNapedem'], znaczniki: { closed: 'wylacznik' } },
  { rodzaj: 'odłącznik', symbole: ['qetDisconnector'], znaczniki: { closed: 'odlacznik' } },
  { rodzaj: 'rozłącznik', symbole: ['qetLoadBreakSwitch', 'qetFuseSwitch'], znaczniki: { closed: 'rozlacznik' } },
  { rodzaj: 'uziemnik', symbole: ['qetEarthSwitch'], znaczniki: { closed: 'uziemnik' } },
  {
    rodzaj: 'łącznik trójpołożeniowy',
    symbole: ['qetThreePositionSwitch', 'qetThreePositionSwitchZNapedem'],
    znaczniki: { closed: 'odlacznik', earthed: 'uziemnik' },
  },
  // Luka modelu: brak rodzaju i położenia członu wysuwnego — wiersz gotowy, symboli brak.
  { rodzaj: 'człon wysuwny lub odłączalny', symbole: [], znaczniki: { closed: 'odlacznik' } },
];

/** Sygnatura kształtu znacznika rozpoznawana przez wyrocznię (rodzaje elementów i kierunki
 *  kresek): „×” — dwie kreski ukośne, „○” — okrąg, rozłącznik — okrąg i kreska prosta, uziemnik —
 *  jedna kreska prosta (pozioma przy styku nad przegubem, pionowa przy zestyku uziemiającym). */
const SYGNATURA: Readonly<Record<RodzajZnacznika, string>> = {
  wylacznik: 'kreska-ukosna+kreska-ukosna',
  odlacznik: 'okrag',
  rozlacznik: 'kreska-prosta+okrag',
  uziemnik: 'kreska-prosta',
};

const UDZIAL: readonly [number, number] = [0.22, 0.28];
const MARGINES = 4;
const ODSTEP = 1;
const STREFA_STYKU = 5;
const PODLOGA_PX = { L1: 8, L2: 10 } as const;

const LODY = [
  ['L1', DEFAULT_LOD_THRESHOLDS.l0Max * (1 + LOD_HYSTERESIS_MARGIN)],
  ['L2', DEFAULT_LOD_THRESHOLDS.l1Max * (1 - LOD_HYSTERESIS_MARGIN)],
] as const;
const MOTYWY = [
  ['ciemny', DARK_SCADA_SLD_PALETTE.state],
  ['jasny', LIGHT_TECHNICAL_SLD_PALETTE.state],
] as const;
const STANY: readonly (SwitchState | undefined)[] = ['closed', 'open', 'earthed', 'unknown', 'bad', undefined];

const SYMBOLE = TABELA_WLASCICIELA.flatMap((w) => w.symbole.map((id) => [w, id] as const));

function rysuj(id: SymbolId, state: SwitchState | undefined, kafle: KafleStanuLacznika, skala: number): Document {
  const Glyph = SYMBOL_GLYPHS[id];
  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg">
      <Glyph x={0} y={0} stroke="#123456" state={state} kafleStanu={kafle} strokeScale={strokeScaleFactor(skala)} />
    </svg>,
  );
  return new DOMParser().parseFromString(markup, 'image/svg+xml');
}

const liczba = (n: Element, a: string): number => Number(n.getAttribute(a));

/** Kreski (odcinki) i okręgi elementu — linia środkowa, po transformacji `rotate(k cx cy)`. */
interface Ksztalt {
  readonly odcinki: ReadonlyArray<readonly [P, P]>;
  readonly okregi: ReadonlyArray<{ readonly c: P; readonly r: number }>;
  readonly kreski: readonly number[];
  readonly kolory: readonly string[];
}

function ksztalt(g: Element): Ksztalt {
  const t = g.getAttribute('transform')?.match(/rotate\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)/);
  const [k, cx, cy] = t ? [Number(t[1]), Number(t[2]), Number(t[3])] : [0, 0, 0];
  const r = (k * Math.PI) / 180;
  const obroc = (x: number, y: number): P => [
    cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r),
    cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r),
  ];
  const odcinki: Array<readonly [P, P]> = [];
  const okregi: Array<{ c: P; r: number }> = [];
  const kreski: number[] = [];
  const kolory: string[] = [];
  for (const n of g.querySelectorAll('line, circle')) {
    if (n.tagName === 'line') odcinki.push([obroc(liczba(n, 'x1'), liczba(n, 'y1')), obroc(liczba(n, 'x2'), liczba(n, 'y2'))]);
    else okregi.push({ c: obroc(liczba(n, 'cx'), liczba(n, 'cy')), r: liczba(n, 'r') });
    kreski.push(liczba(n, 'stroke-width'));
    kolory.push(n.getAttribute('stroke') ?? '');
  }
  if (g.querySelectorAll('path, text, rect').length > 0) throw new Error('znacznik/nóż z prymitywem spoza kresek i okręgów');
  return { odcinki, okregi, kreski, kolory };
}

function probki(s: Ksztalt, krok = 0.1): P[] {
  const wynik: P[] = [];
  for (const [a, b] of s.odcinki) {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / krok));
    for (let i = 0; i <= n; i += 1) wynik.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  }
  for (const { c, r } of s.okregi) {
    for (let i = 0; i < 360; i += 1) wynik.push([c[0] + r * Math.cos((i * Math.PI) / 180), c[1] + r * Math.sin((i * Math.PI) / 180)]);
  }
  return wynik;
}

function obwiednia(s: Ksztalt): { x0: number; y0: number; x1: number; y1: number } {
  const xs = [...s.odcinki.flatMap(([a, b]) => [a[0], b[0]]), ...s.okregi.flatMap(({ c, r }) => [c[0] - r, c[0] + r])];
  const ys = [...s.odcinki.flatMap(([a, b]) => [a[1], b[1]]), ...s.okregi.flatMap(({ c, r }) => [c[1] - r, c[1] + r])];
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function sygnatura(s: Ksztalt): string {
  const czesci = [
    ...s.odcinki.map(([a, b]) => (Math.abs(a[0] - b[0]) < 1e-6 || Math.abs(a[1] - b[1]) < 1e-6 ? 'kreska-prosta' : 'kreska-ukosna')),
    ...s.okregi.map(() => 'okrag'),
  ];
  return czesci.sort().join('+');
}

/** Naruszenia decyzji właściciela na jednym wyrenderowanym kaflu (pusta lista = spełnia). */
function naruszenia(
  doc: Document,
  oczekiwane: Readonly<Partial<Record<'closed' | 'earthed', RodzajZnacznika>>>,
  kafle: KafleStanuLacznika,
  lod: keyof typeof PODLOGA_PX,
  skala: number,
): string[] {
  const bledy: string[] = [];
  const tlo = doc.querySelector('[data-kafel="tlo"]');
  if (!tlo) return ['brak kafla stanu'];
  const kafel = { x: liczba(tlo, 'x'), y: liczba(tlo, 'y'), w: liczba(tlo, 'width'), h: liczba(tlo, 'height') };
  const nozG = doc.querySelector('[data-qet="noz"]');
  if (!nozG) return ['brak noża'];
  const noz = ksztalt(nozG);
  const t = nozG.getAttribute('transform')!.match(/rotate\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)/)!;
  const przegub: P = [Number(t[2]), Number(t[3])];
  const polozenie = doc.querySelector('[data-qet-polozenie]')?.getAttribute('data-qet-polozenie');
  // Koniec noża = punkt dalszy od przegubu; w położeniu stykowym to punkt styku.
  const konce = noz.odcinki.flatMap(([a, b]) => [a, b]);
  const koniec = konce.reduce((m, q) => (Math.hypot(q[0] - przegub[0], q[1] - przegub[1]) > Math.hypot(m[0] - przegub[0], m[1] - przegub[1]) ? q : m));
  const probkiNoza = probki(noz);
  const kreskaNoza = noz.kreski[0];
  const grupy = [...doc.querySelectorAll('[data-qet="znacznik"]')];
  const styki = grupy.map((g) => g.getAttribute('data-znacznik-styk'));
  for (const styk of Object.keys(oczekiwane)) {
    if (styki.filter((s) => s === styk).length !== 1) bledy.push(`styk ${styk}: ${styki.filter((s) => s === styk).length} znaczników (wymagany dokładnie jeden)`);
  }
  for (const s of styki) if (!(s! in oczekiwane)) bledy.push(`znacznik przy styku ${s} spoza tabeli właściciela`);
  for (const g of grupy) {
    const styk = g.getAttribute('data-znacznik-styk') as 'closed' | 'earthed';
    const rodzaj = g.getAttribute('data-znacznik-rodzaj') as RodzajZnacznika;
    const opis = `znacznik ${rodzaj} (${styk})`;
    const z = ksztalt(g);
    if (rodzaj !== oczekiwane[styk]) bledy.push(`${opis}: tabela właściciela wymaga ${oczekiwane[styk]}`);
    if (sygnatura(z) !== SYGNATURA[oczekiwane[styk] ?? rodzaj]) bledy.push(`${opis}: kształt ${sygnatura(z)} ≠ ${SYGNATURA[oczekiwane[styk] ?? rodzaj]}`);
    const o = obwiednia(z);
    const bok = Math.max(o.x1 - o.x0, o.y1 - o.y0);
    const udzial = bok / kafel.w;
    if (udzial < UDZIAL[0] - 1e-9 || udzial > UDZIAL[1] + 1e-9) bledy.push(`${opis}: ${bok.toFixed(2)} j.św. = ${(udzial * 100).toFixed(1)} % boku kafla poza 22–28 %`);
    if (bok * skala < PODLOGA_PX[lod] - 1e-9) bledy.push(`${opis}: ${(bok * skala).toFixed(2)} px na ${lod} < ${PODLOGA_PX[lod]} px`);
    for (const w of z.kreski) if (Math.abs(w - kreskaNoza) > 1e-9) bledy.push(`${opis}: kreska ${w} ≠ kreska noża ${kreskaNoza}`);
    for (const c of [...z.kolory, ...noz.kolory]) if (c !== kafle.glif) bledy.push(`${opis}: kolor ${c} ≠ kolor noża i glifu kafla ${kafle.glif}`);
    const polKreski = Math.max(...z.kreski) / 2;
    const margines = Math.min(o.x0 - kafel.x, o.y0 - kafel.y, kafel.x + kafel.w - o.x1, kafel.y + kafel.h - o.y1) - polKreski;
    if (margines < MARGINES - 1e-9) bledy.push(`${opis}: tusz ${margines.toFixed(2)} j.św. od krawędzi kafla < ${MARGINES}`);
    const naStyku = polozenie === styk;
    const pz = probki(z);
    let d = Infinity;
    for (const q of probkiNoza) {
      if (naStyku && Math.hypot(q[0] - koniec[0], q[1] - koniec[1]) <= STREFA_STYKU) continue;
      for (const p of pz) d = Math.min(d, Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    const odstep = d - polKreski - kreskaNoza / 2;
    if (odstep < ODSTEP - 0.05) bledy.push(`${opis}: tusz ${odstep.toFixed(2)} j.św. od noża (położenie ${polozenie}) < ${ODSTEP} — znacznik nachodzi na nóż`);
  }
  return bledy;
}

/** Luminancja względna i kontrast WCAG 2.x. */
function kontrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('znacznik rodzaju aparatu — tabela właściciela pokrywa każdy łącznik', () => {
  it('każdy łącznik pola rysowany symbolem QET z kaflem ma wiersz tabeli; każdy symbol z kaflem jest w dokładnie jednym wierszu', () => {
    const kaflowe = (Object.keys(QET_SYMBOLE_POLA_SN) as QetSymbolPolaSnId[]).filter((id) => QET_SYMBOLE_POLA_SN[id].kafel);
    expect(SYMBOLE.map(([, id]) => id).sort()).toEqual([...kaflowe].sort());
    const qetLacznikow = [...RODZAJE_LACZNIKOW_POLA].flatMap((kind) => symboleRodzajuAparatu(kind).filter((id) => czySymbolQet(id)));
    for (const id of qetLacznikow) expect(SYMBOLE.some(([, s]) => s === id), id).toBe(true);
  });

  it('człon wysuwny lub odłączalny: wiersz „○” gotowy, model nie ma rodzaju ani położenia członu (luka zgłoszona, nie symbol udający dane)', () => {
    expect(TABELA_WLASCICIELA.find((w) => w.rodzaj.startsWith('człon wysuwny'))?.znaczniki).toEqual({ closed: 'odlacznik' });
    // Zbiór łączników pola = lustro backendu; rodzaj członu wysuwnego dołożony do modelu bez
    // symbolu ze znacznikiem w tabeli czerwieni test wyżej (symbol bez wiersza).
    expect([...RODZAJE_LACZNIKOW_POLA].sort()).toEqual(['CB', 'DS', 'ES', 'FUSE', 'LOAD_SWITCH', 'THREE_POSITION_SWITCH']);
  });

  it('cztery rodzaje znaczników — cztery różne sygnatury kształtu', () => {
    expect(new Set(Object.values(SYGNATURA)).size).toBe(4);
  });

  for (const [motyw, kafle] of MOTYWY) {
    it(`${motyw}: kolor znacznika = kolor glifu kafla, kontrast z każdym kaflem ≥ 4,5:1`, () => {
      for (const stan of STANY_KAFLA) {
        expect(kafle[stan]).toBe(STATE_COLOR[stan]);
        expect(kontrast(kafle.glif, kafle[stan]), `${motyw} · ${stan}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe('znacznik rodzaju aparatu — iloczyn rodzaj × stan × motyw × LOD', () => {
  const sygnatury = new Map<RodzajZnacznika, Set<string>>();
  const rozmiary = new Map<RodzajZnacznika, Set<string>>();
  for (const [wiersz, id] of SYMBOLE) {
    for (const state of STANY) {
      for (const [motyw, kafle] of MOTYWY) {
        for (const [lod, skala] of LODY) {
          it(`${wiersz.rodzaj} (${id}) · ${state ?? 'brak stanu'} · ${motyw} · ${lod} (skala ${skala.toFixed(2)})`, () => {
            const doc = rysuj(id, state, kafle, skala);
            expect(naruszenia(doc, wiersz.znaczniki, kafle, lod, skala)).toEqual([]);
            for (const g of doc.querySelectorAll('[data-qet="znacznik"]')) {
              const rodzaj = g.getAttribute('data-znacznik-rodzaj') as RodzajZnacznika;
              const z = ksztalt(g);
              const o = obwiednia(z);
              if (!sygnatury.has(rodzaj)) sygnatury.set(rodzaj, new Set());
              if (!rozmiary.has(rodzaj)) rozmiary.set(rodzaj, new Set());
              sygnatury.get(rodzaj)!.add(sygnatura(z));
              // Proporcje rodzaju: bok obwiedni (większy wymiar) i stosunek boków (okrąg, krzyżyk
              // i kreska z okręgiem — niezależne od orientacji).
              const a = Math.max(o.x1 - o.x0, o.y1 - o.y0);
              const b = Math.min(o.x1 - o.x0, o.y1 - o.y0);
              rozmiary.get(rodzaj)!.add(`${a.toFixed(3)}:${(b / a).toFixed(3)}`);
            }
          });
        }
      }
    }
  }

  it('spójność: ten sam rodzaj = ta sama sygnatura i te same proporcje w każdym symbolu, stanie, motywie i LOD; różne rodzaje rozróżnialne', () => {
    expect([...sygnatury.keys()].sort()).toEqual(['odlacznik', 'rozlacznik', 'uziemnik', 'wylacznik']);
    for (const [rodzaj, zbior] of sygnatury) expect([...zbior], rodzaj).toEqual([SYGNATURA[rodzaj]]);
    for (const [rodzaj, zbior] of rozmiary) expect(zbior.size, `${rodzaj}: ${[...zbior].join(' · ')}`).toBe(1);
    // Wszystkie rodzaje mają ten sam bok znacznika (jeden rozmiar kafla).
    expect(new Set([...rozmiary.values()].map((z) => [...z][0].split(':')[0])).size).toBe(1);
  });

  it('warunek wstępny: kafel 48 j.św., kreska glifu = bok/24', () => {
    expect(QET_BOK_KAFLA_STANU).toBe(48);
    expect(QET_KRESKA_GLIFU).toBeCloseTo(QET_BOK_KAFLA_STANU / 24, 9);
  });
});

describe('znacznik rodzaju aparatu — iniekcje (każda czerwona)', () => {
  const [, kafle] = MOTYWY[0];
  const [lod, skala] = LODY[1];
  const wiersz = (id: QetSymbolPolaSnId) => TABELA_WLASCICIELA.find((w) => w.symbole.includes(id))!;

  function skaluj(g: Element, k: number): void {
    const o = obwiednia(ksztalt(g));
    const sx = (o.x0 + o.x1) / 2;
    const sy = (o.y0 + o.y1) / 2;
    for (const n of g.querySelectorAll('line')) {
      for (const [ax, ay] of [['x1', 'y1'], ['x2', 'y2']] as const) {
        n.setAttribute(ax, String(sx + (liczba(n, ax) - sx) * k));
        n.setAttribute(ay, String(sy + (liczba(n, ay) - sy) * k));
      }
    }
    for (const n of g.querySelectorAll('circle')) {
      n.setAttribute('cx', String(sx + (liczba(n, 'cx') - sx) * k));
      n.setAttribute('cy', String(sy + (liczba(n, 'cy') - sy) * k));
      n.setAttribute('r', String(liczba(n, 'r') * k));
    }
  }

  const PRZYPADKI: ReadonlyArray<readonly [string, QetSymbolPolaSnId, SwitchState, (doc: Document) => void, RegExp]> = [
    ['znacznik za mały (×0,8)', 'qetDisconnector', 'open', (d) => skaluj(d.querySelector('[data-qet="znacznik"]')!, 0.8), /poza 22–28 %/],
    ['znacznik za duży (×1,25)', 'qetBreaker', 'open', (d) => skaluj(d.querySelector('[data-qet="znacznik"]')!, 1.25), /poza 22–28 %/],
    ['brak znacznika', 'qetLoadBreakSwitch', 'closed', (d) => d.querySelector('[data-qet="znacznik"]')!.remove(), /0 znaczników/],
    [
      'brak znacznika uziemnika w łączniku trójpołożeniowym',
      'qetThreePositionSwitch',
      'earthed',
      (d) => d.querySelector('[data-znacznik-styk="earthed"]')!.remove(),
      /styk earthed: 0 znaczników/,
    ],
    [
      'znacznik zsunięty na nóż',
      'qetBreaker',
      'closed',
      (d) => {
        for (const n of d.querySelectorAll('[data-qet="znacznik"] line')) {
          n.setAttribute('y1', String(liczba(n, 'y1') + 8));
          n.setAttribute('y2', String(liczba(n, 'y2') + 8));
        }
      },
      /nachodzi na nóż/,
    ],
    [
      'kreska znacznika ≠ kreska noża',
      'qetEarthSwitch',
      'open',
      (d) => d.querySelector('[data-qet="znacznik"] line')!.setAttribute('stroke-width', String(QET_KRESKA_GLIFU * 1.5)),
      /≠ kreska noża/,
    ],
    [
      'kolor znacznika ≠ kolor noża',
      'qetDisconnector',
      'closed',
      (d) => d.querySelector('[data-qet="znacznik"] circle')!.setAttribute('stroke', '#000000'),
      /kolor #000000/,
    ],
    [
      'zamieniony rodzaj (rozłącznik z bezpiecznikami oznaczony jak odłącznik)',
      'qetFuseSwitch',
      'open',
      (d) => d.querySelector('[data-qet="znacznik"]')!.setAttribute('data-znacznik-rodzaj', 'odlacznik'),
      /tabela właściciela wymaga rozlacznik/,
    ],
  ];

  for (const [opis, id, state, psuj, oczekiwany] of PRZYPADKI) {
    it(opis, () => {
      const doc = rysuj(id, state, kafle, skala);
      expect(naruszenia(doc, wiersz(id).znaczniki, kafle, lod, skala), 'przed iniekcją').toEqual([]);
      psuj(doc);
      const wynik = naruszenia(doc, wiersz(id).znaczniki, kafle, lod, skala);
      expect(wynik.join('\n')).toMatch(oczekiwany);
    });
  }

  // Stan sprzed rozstrzygnięcia UX04-KRESKA-PIKTOGRAMU-KAFLA: piktogram kafla dostawał kompensację
  // kreski kanwy (`strokeScaleFactor`). Na dolnym brzegu LOD2 tusz okręgu odłącznika schodzi pod
  // margines 4 j.św., a przy wejściu w LOD1 ramiona krzyżyka wyłącznika zlewają się z nożem.
  for (const [lodI, skalaI, idI, oczekiwanyI] of [
    ['L2', LODY[1][1], 'qetDisconnector', /od krawędzi kafla < 4/],
    ['L1', LODY[0][1], 'qetBreaker', /nachodzi na nóż/],
  ] as const) {
    it(`kompensacja kreski na piktogramie kafla (${lodI}, ${idI}) — czerwony`, () => {
      const doc = rysuj(idI, 'closed', kafle, skalaI);
      expect(naruszenia(doc, wiersz(idI).znaczniki, kafle, lodI, skalaI), 'przed iniekcją').toEqual([]);
      const k = strokeScaleFactor(skalaI);
      expect(k).toBeGreaterThan(1);
      for (const n of doc.querySelectorAll('[data-qet="noz"] [stroke-width], [data-qet="znacznik"] [stroke-width]')) {
        n.setAttribute('stroke-width', String(liczba(n, 'stroke-width') * k));
      }
      expect(naruszenia(doc, wiersz(idI).znaczniki, kafle, lodI, skalaI).join('\n')).toMatch(oczekiwanyI);
    });
  }

  it('podłoga ekranu: znacznik 12 j.św. na dolnym brzegu LOD2 ma 12,24 px (≥ 10), przy wejściu w LOD1 8,28 px (≥ 8)', () => {
    expect(12 * LODY[1][1]).toBeCloseTo(12.24, 9);
    expect(12 * LODY[0][1]).toBeCloseTo(8.28, 9);
    // Iniekcja: znacznik o dolnym brzegu przedziału udziału (22 % → 10,56 j.św.) przy wejściu
    // w LOD1 ma 7,29 px < 8 — podłoga LOD1 jest czynna, nie trywialna.
    expect(0.22 * QET_BOK_KAFLA_STANU * LODY[0][1]).toBeLessThan(PODLOGA_PX.L1);
  });
});
