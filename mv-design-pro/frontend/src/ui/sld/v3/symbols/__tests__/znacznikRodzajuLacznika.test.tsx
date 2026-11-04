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
 * Człon wysuwny (rozstrzygnięcie architekta 2026-10-30 pkt 3): wykonanie wyłącznika w modelu
 * (`BayPrimaryDevice.wykonanie` = WYSUWNE) rysuje się symbolem `qetBreakerWysuwny`
 * (`…ZNapedem`) — „×” przy styku zamknięcia i „○” członu wysuwnego obok, po stronie przeciwnej
 * do noża otwartego (`data-znacznik-styk="wysuw"`). Test przypina, że każdy łącznik pola i każdy
 * symbol z kaflem ma wiersz tabeli: nowy rysunek bez znacznika w tabeli = czerwony test.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { QET_BOK_KAFLA_STANU, QET_KRESKA_GLIFU, QET_SYMBOLE_POLA_SN, type QetSymbolPolaSnId } from '../../cad/qet/qetPoleSn';
import { RODZAJE_LACZNIKOW_POLA } from '../../compose/rodzajeAparatuPola';
import { WARIANT_RYSUNKU_QET, symbolIdForPrimaryDeviceKind, symboleRodzajuAparatu } from '../../compose/apparatusSequence';
import { strokeScaleFactor } from '../../compose/preview';
import { DEFAULT_LOD_THRESHOLDS, LOD_HYSTERESIS_MARGIN } from '../../canvas/camera';
import { DARK_SCADA_SLD_PALETTE, STATE_COLOR, STANY_KAFLA, type KafleStanuLacznika } from '../../theme/colorTokens';
import { LIGHT_TECHNICAL_SLD_PALETTE } from '../../theme/palette';
import { czySymbolQet, type SymbolId } from '../defs';
import { PODLOGA_ZNACZNIKA_LOD1_PX, SYMBOL_GLYPHS, skalaZnacznikaKafla, type SwitchState } from '../glyphs';

type P = readonly [number, number];
type RodzajZnacznika = 'wylacznik' | 'odlacznik' | 'rozlacznik' | 'uziemnik';
type StykZnacznika = 'closed' | 'earthed';

/** Tabela właściciela (decyzja 2026-10-30, uwagi z odbioru B-02 2026-11-04 pkt 2–3) — rodzaj
 *  aparatu → znaczniki przy stykach stałych, symbol ziemi i człon wysuwny. Wyrocznia jawna,
 *  niezależna od manifestu importera: wyłącznik „×”; rozłącznik — kreska z okręgiem „○” (okrąg
 *  WYŁĄCZNIE tu); odłącznik — kreska styku „⊤” BEZ okręgu; uziemnik — kreska i symbol ziemi;
 *  wyłącznik wysuwny — „×” i pasma szewronów nad i pod kaflem. */
const TABELA_WLASCICIELA: ReadonlyArray<{
  readonly rodzaj: string;
  readonly symbole: readonly QetSymbolPolaSnId[];
  readonly znaczniki: Readonly<Partial<Record<StykZnacznika, RodzajZnacznika>>>;
  readonly ziemia: boolean;
  readonly czlon: boolean;
}> = [
  { rodzaj: 'wyłącznik', symbole: ['qetBreaker', 'qetBreakerZNapedem'], znaczniki: { closed: 'wylacznik' }, ziemia: false, czlon: false },
  { rodzaj: 'odłącznik', symbole: ['qetDisconnector'], znaczniki: { closed: 'odlacznik' }, ziemia: false, czlon: false },
  { rodzaj: 'rozłącznik', symbole: ['qetLoadBreakSwitch', 'qetFuseSwitch'], znaczniki: { closed: 'rozlacznik' }, ziemia: false, czlon: false },
  { rodzaj: 'uziemnik', symbole: ['qetEarthSwitch'], znaczniki: { closed: 'uziemnik' }, ziemia: true, czlon: false },
  {
    rodzaj: 'łącznik trójpołożeniowy',
    symbole: ['qetThreePositionSwitch', 'qetThreePositionSwitchZNapedem'],
    znaczniki: { closed: 'odlacznik', earthed: 'uziemnik' },
    ziemia: true,
    czlon: false,
  },
  {
    rodzaj: 'wyłącznik w wykonaniu wysuwnym (człon wysuwny)',
    symbole: ['qetBreakerWysuwny', 'qetBreakerWysuwnyZNapedem'],
    znaczniki: { closed: 'wylacznik' },
    ziemia: false,
    czlon: true,
  },
];

/** Sygnatura kształtu znacznika rozpoznawana przez wyrocznię (rodzaje elementów i kierunki
 *  kresek): „×” — dwie kreski ukośne, rozłącznik — okrąg i kreska prosta, odłącznik i uziemnik —
 *  jedna kreska prosta (pozioma przy styku nad przegubem, pionowa przy zestyku uziemiającym);
 *  odłącznik od uziemnika odróżnia symbol ziemi. */
const SYGNATURA: Readonly<Record<RodzajZnacznika, string>> = {
  wylacznik: 'kreska-ukosna+kreska-ukosna',
  odlacznik: 'kreska-prosta',
  rozlacznik: 'kreska-prosta+okrag',
  uziemnik: 'kreska-prosta',
};

const UDZIAL: readonly [number, number] = [0.22, 0.28];
const MARGINES = 4;
const ODSTEP = 1;
const STREFA_STYKU = 5;
const PODLOGA_PX = { L0: 8, L1: 8, L2: 10 } as const;

/** Poziomy szczegółu: nazwa przypadku, LOD, skala kamery. LOD1 sprawdzany na OBU brzegach — dolnym
 *  (zejście do LOD0, `l0Max·(1−m)` = 0,51, podłoga 8 px czynna) i wejściu (`l0Max·(1+m)` = 0,69);
 *  LOD2 na dolnym brzegu aktywnego (`l1Max·(1−m)` = 1,02); LOD0 (uwaga właściciela 2026-11-04,
 *  odbiór B-02 pkt 5) na skali 0,45 (kafel 21,6 px — kształt rozróżniający rośnie do podłogi 8 px)
 *  i 0,3 (kafel 14,4 px — kształt rośnie do granicy kafla). */
const LODY = [
  ['L0 dół', 'L0', 0.3],
  ['L0', 'L0', 0.45],
  ['L1 dół', 'L1', DEFAULT_LOD_THRESHOLDS.l0Max * (1 - LOD_HYSTERESIS_MARGIN)],
  ['L1', 'L1', DEFAULT_LOD_THRESHOLDS.l0Max * (1 + LOD_HYSTERESIS_MARGIN)],
  ['L2', 'L2', DEFAULT_LOD_THRESHOLDS.l1Max * (1 - LOD_HYSTERESIS_MARGIN)],
] as const;
const NUMER_LOD = { L0: 0, L1: 1, L2: 2 } as const;

/** Detale kafla wg LOD — wyrocznia jawna uwagi właściciela 2026-11-04 (odbiór B-02 pkt 5): napęd
 *  „M” wyłącznie na LOD2, znak „?”/„!” na LOD2 i LOD1, na LOD0 bez znaku (nośnikiem zostaje
 *  geometria noża). */
const DETALE_WG_LOD = {
  L0: { naped: false, znak: false },
  L1: { naped: false, znak: true },
  L2: { naped: true, znak: true },
} as const;

/** Oczekiwany bok znacznika [j.św.] — wyrocznia jawna rozstrzygnięcia architekta 2026-10-30 pkt 1
 *  i uwagi właściciela 2026-11-04 pkt 5: LOD0/LOD1 — max(udział · bok kafla · skala, 8 px) / skala
 *  (kształt nie maleje razem z kaflem); LOD2 — udział · bok kafla (12 j.św.). */
function bokOczekiwany(lod: keyof typeof PODLOGA_PX, skala: number): number {
  // LOD0: wielkość z dolnego brzegu LOD1 (0,51) — kształt nie maleje względem kafla.
  return lod === 'L2' ? 12 : Math.max(12, PODLOGA_PX.L1 / (lod === 'L0' ? Math.max(skala, 0.51) : skala));
}

/** Największy mnożnik kształtu rosnącego wokół kotwicy `k` (obwiednia `o` w skali 1), przy którym
 *  tusz (pół kreski) zostaje w obszarze `r` — wyrocznia granicy kafla / pasma, niezależna od
 *  `skalaKsztaltuWKaflu`. */
function mnoznikGraniczny(o: { x0: number; y0: number; x1: number; y1: number }, k: P, r: { x: number; y: number; w: number; h: number }, polKreski: number): number {
  let f = Infinity;
  const pary: ReadonlyArray<readonly [number, number]> = [
    [k[0] - o.x0, k[0] - r.x - polKreski],
    [o.x1 - k[0], r.x + r.w - polKreski - k[0]],
    [k[1] - o.y0, k[1] - r.y - polKreski],
    [o.y1 - k[1], r.y + r.h - polKreski - k[1]],
  ];
  for (const [zasieg, miejsce] of pary) if (zasieg > 1e-9) f = Math.min(f, miejsce / zasieg);
  return f;
}
const podlogaKafla = (lod: keyof typeof PODLOGA_PX, skala: number): boolean => bokOczekiwany(lod, skala) > 12 + 1e-9;
const MOTYWY = [
  ['ciemny', DARK_SCADA_SLD_PALETTE.state],
  ['jasny', LIGHT_TECHNICAL_SLD_PALETTE.state],
] as const;
const STANY: readonly (SwitchState | undefined)[] = ['closed', 'open', 'earthed', 'unknown', 'bad', undefined];

const SYMBOLE = TABELA_WLASCICIELA.flatMap((w) => w.symbole.map((id) => [w, id] as const));

function rysuj(
  id: SymbolId,
  state: SwitchState | undefined,
  kafle: KafleStanuLacznika,
  skala: number,
  lod: keyof typeof PODLOGA_PX,
  skalaZnacznika: number = skalaZnacznikaKafla(skala, NUMER_LOD[lod]),
): Document {
  const Glyph = SYMBOL_GLYPHS[id];
  const markup = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg">
      <Glyph x={0} y={0} stroke="#123456" state={state} kafleStanu={kafle} strokeScale={strokeScaleFactor(skala)} skalaZnacznika={skalaZnacznika} lod={NUMER_LOD[lod]} />
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
  id: QetSymbolPolaSnId,
  kafle: KafleStanuLacznika,
  lod: keyof typeof PODLOGA_PX,
  skala: number,
): string[] {
  const wiersz = TABELA_WLASCICIELA.find((w) => w.symbole.includes(id))!;
  const oczekiwane = wiersz.znaczniki;
  const symbol = QET_SYMBOLE_POLA_SN[id];
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
    const styk = g.getAttribute('data-znacznik-styk') as StykZnacznika;
    const rodzaj = g.getAttribute('data-znacznik-rodzaj') as RodzajZnacznika;
    const opis = `znacznik ${rodzaj} (${styk})`;
    const z = ksztalt(g);
    if (rodzaj !== oczekiwane[styk]) bledy.push(`${opis}: tabela właściciela wymaga ${oczekiwane[styk]}`);
    if (sygnatura(z) !== SYGNATURA[oczekiwane[styk] ?? rodzaj]) bledy.push(`${opis}: kształt ${sygnatura(z)} ≠ ${SYGNATURA[oczekiwane[styk] ?? rodzaj]}`);
    const o = obwiednia(z);
    const bok = Math.max(o.x1 - o.x0, o.y1 - o.y0);
    const udzial = bok / kafel.w;
    // Granica kafla (LOD0 przy skali, na której kafel nie mieści znacznika 8 px): kształt rośnie
    // do tuszu na krawędzi kafla — nigdy poniżej proporcji świata (12 j.św.).
    const zrodlo = symbol.znaczniki.find((q) => q.styk === styk);
    let bokWymagany = bokOczekiwany(lod, skala);
    if (zrodlo) {
      const prim = zrodlo.prymitywy;
      const xs = prim.flatMap((q) => (q.k === 'line' ? [q.x1, q.x2] : q.k === 'circle' ? [q.cx - q.r, q.cx + q.r] : []));
      const ys = prim.flatMap((q) => (q.k === 'line' ? [q.y1, q.y2] : q.k === 'circle' ? [q.cy - q.r, q.cy + q.r] : []));
      const fGr = mnoznikGraniczny({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, [zrodlo.kotwica.x, zrodlo.kotwica.y], kafel, QET_KRESKA_GLIFU / 2);
      if (12 * fGr < bokWymagany) {
        if (lod !== 'L0') bledy.push(`${opis}: granica kafla ogranicza znacznik na ${lod} — podłoga ${PODLOGA_PX[lod]} px nieosiągnięta`);
        bokWymagany = Math.max(12, 12 * fGr);
      }
    }
    // Podłoga wygrywa z udziałem: górna granica udziału rośnie do 8 px / skala / bok kafla.
    const podlogaCzynna = bokWymagany > 12 + 1e-9;
    const gornyUdzial = podlogaCzynna ? bokWymagany / kafel.w : UDZIAL[1];
    if (udzial < UDZIAL[0] - 1e-9 || udzial > gornyUdzial + 1e-9) bledy.push(`${opis}: ${bok.toFixed(2)} j.św. = ${(udzial * 100).toFixed(1)} % boku kafla poza 22–28 %`);
    if (bok * skala < Math.min(PODLOGA_PX[lod], bokWymagany * skala) - 1e-9 || bok < bokWymagany - 1e-9) bledy.push(`${opis}: ${(bok * skala).toFixed(2)} px na ${lod} < ${PODLOGA_PX[lod]} px`);
    if (Math.abs(bok - bokWymagany) > 1e-6) bledy.push(`${opis}: bok ${bok.toFixed(3)} j.św. ≠ max(udział · kafel, ${PODLOGA_PX.L1} px / skala) w granicy kafla = ${bokWymagany.toFixed(3)}`);
    for (const w of z.kreski) if (Math.abs(w - kreskaNoza) > 1e-9) bledy.push(`${opis}: kreska ${w} ≠ kreska noża ${kreskaNoza}`);
    for (const c of [...z.kolory, ...noz.kolory]) if (c !== kafle.glif) bledy.push(`${opis}: kolor ${c} ≠ kolor noża i glifu kafla ${kafle.glif}`);
    const polKreski = Math.max(...z.kreski) / 2;
    const margines = Math.min(o.x0 - kafel.x, o.y0 - kafel.y, kafel.x + kafel.w - o.x1, kafel.y + kafel.h - o.y1) - polKreski;
    // Margines 4 j.św. wiąże proporcje świata; gdy podłoga LOD1 powiększa znacznik, wymagany jest
    // tusz w kaflu (≥ 0) — kafel 24,5 px na skali 0,51 nie mieści znacznika 8 px z marginesem 4 j.św.
    const marginesWymagany = podlogaCzynna ? 0 : MARGINES;
    if (margines < marginesWymagany - 1e-9) bledy.push(`${opis}: tusz ${margines.toFixed(2)} j.św. od krawędzi kafla < ${marginesWymagany}`);
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
  // Znaczniki jednego kafla rozłączne: tusz ≥ 0 (na podłodze) albo ≥ odstęp (proporcje świata) —
  // kreska „⊤” funkcji odłącznika nie wchodzi na kreskę uziemnika w żadnej skali.
  for (let i = 0; i < grupy.length; i += 1) {
    for (let j = i + 1; j < grupy.length; j += 1) {
      const [a, b] = [ksztalt(grupy[i]), ksztalt(grupy[j])];
      const pb = probki(b);
      let d = Infinity;
      for (const p of probki(a)) for (const q of pb) d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1]));
      const tusz = d - Math.max(...a.kreski) / 2 - Math.max(...b.kreski) / 2;
      const wymagany = podlogaKafla(lod, skala) ? 0 : ODSTEP;
      if (tusz < wymagany - 0.05) {
        bledy.push(`znaczniki ${grupy[i].getAttribute('data-znacznik-rodzaj')} i ${grupy[j].getAttribute('data-znacznik-rodzaj')}: tusz ${tusz.toFixed(2)} j.św. < ${wymagany} — znaczniki nachodzą na siebie`);
      }
    }
  }
  // Okrąg „○” WYŁĄCZNIE w znaczniku rozłącznika (uwaga właściciela 2026-11-04 pkt 2).
  for (const g of grupy) {
    const rodzaj = g.getAttribute('data-znacznik-rodzaj');
    if (rodzaj !== 'rozlacznik' && g.querySelector('circle')) bledy.push(`znacznik ${rodzaj}: okrąg „○” należy wyłącznie do rozłącznika`);
  }
  // Symbol ziemi: odróżnia uziemnik od odłącznika (ta sama kreska styku); nie maleje razem z kaflem.
  const ziemia = doc.querySelector('[data-qet="ziemia"]');
  if (Boolean(ziemia) !== wiersz.ziemia) bledy.push(`symbol ziemi ${ziemia ? 'obecny' : 'brak'} — tabela właściciela: ${wiersz.ziemia ? 'wymagany' : 'zakazany'}`);
  if (ziemia && symbol.ziemia) {
    const zk = ksztalt(ziemia);
    const kreskiZiemi = zk.odcinki.filter(([a, b]) => Math.abs(a[1] - b[1]) < 1e-6);
    const szer = Math.max(...kreskiZiemi.map(([a, b]) => Math.abs(b[0] - a[0])));
    // Kreski ziemi (bez pionu przyłączenia) rosną od środka górnej, najszerszej kreski.
    const zr = symbol.ziemia.prymitywy.slice(1);
    const xs = zr.flatMap((q) => (q.k === 'line' ? [q.x1, q.x2] : []));
    const ys = zr.flatMap((q) => (q.k === 'line' ? [q.y1, q.y2] : []));
    const g0 = zr[0];
    const kz: P = g0.k === 'line' ? [(g0.x1 + g0.x2) / 2, g0.y1] : [0, 0];
    const fGr = mnoznikGraniczny({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, kz, kafel, QET_KRESKA_GLIFU / 2);
    const wymagana = lod === 'L2' ? 12 : Math.max(12, Math.min(bokOczekiwany(lod, skala), 12 * fGr));
    if (Math.abs(szer - wymagana) > 1e-6) bledy.push(`symbol ziemi: szerokość ${szer.toFixed(3)} j.św. ≠ ${wymagana.toFixed(3)} (podłoga ${PODLOGA_PX.L1} px w granicy kafla)`);
    if (lod === 'L1' && szer * skala < PODLOGA_PX.L1 - 1e-9) bledy.push(`symbol ziemi: ${(szer * skala).toFixed(2)} px na L1 < 8 px`);
  }
  // Człon wysuwny: szewrony nad (w górę) i pod kaflem (w dół), kolor TORU w każdym stanie
  // wyłącznika (uwaga właściciela 2026-11-04 pkt 3), szerokość z podłogą w granicy pasma.
  const czlon = doc.querySelector('[data-qet="czlon"]');
  if (Boolean(czlon) !== wiersz.czlon) bledy.push(`człon wysuwny ${czlon ? 'obecny' : 'brak'} — tabela właściciela: ${wiersz.czlon ? 'wymagany' : 'zakazany'}`);
  if (czlon && symbol.czlon) {
    for (const n of czlon.querySelectorAll('[stroke]')) {
      if (n.getAttribute('stroke') !== '#123456') bledy.push(`człon wysuwny: kolor ${n.getAttribute('stroke')} ≠ kolor toru #123456 (szewrony nie niosą stanu wyłącznika)`);
    }
    for (const [pasmo, wGore, y0] of [
      ['gora', true, 0],
      ['dol', false, kafel.y + kafel.h],
    ] as const) {
      const g = czlon.querySelector(`[data-czlon-pasmo="${pasmo}"]`);
      if (!g) {
        bledy.push(`człon wysuwny: brak pasma ${pasmo}`);
        continue;
      }
      const s = ksztalt(g);
      if (s.odcinki.length !== 4) bledy.push(`człon wysuwny: pasmo ${pasmo} ma ${s.odcinki.length} kresek ≠ 4 (dwa szewrony)`);
      for (const [a, b] of s.odcinki) {
        if ((a[1] < b[1]) !== wGore) bledy.push(`człon wysuwny: szewron w paśmie ${pasmo} skierowany ${wGore ? 'w dół' : 'w górę'}`);
        for (const y of [a[1], b[1]]) if (y < y0 - 1e-6 || y > y0 + symbol.czlon.pasmo + 1e-6) bledy.push(`człon wysuwny: szewron poza pasmem ${pasmo}`);
      }
      const o = obwiednia(s);
      const szer = o.x1 - o.x0;
      const zr = symbol.czlon[pasmo];
      const xs = zr.flatMap((q) => (q.k === 'line' ? [q.x1, q.x2] : []));
      const ys = zr.flatMap((q) => (q.k === 'line' ? [q.y1, q.y2] : []));
      const obszar = { x: 0, y: y0, w: symbol.szerokosc, h: symbol.czlon.pasmo };
      const fGr = mnoznikGraniczny({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, [symbol.szerokosc / 2, y0 + symbol.czlon.pasmo / 2], obszar, QET_KRESKA_GLIFU / 2);
      const wymagana = lod === 'L2' ? 12 : Math.max(12, Math.min(bokOczekiwany(lod, skala), 12 * fGr));
      if (Math.abs(szer - wymagana) > 1e-6) bledy.push(`człon wysuwny: szewron ${szer.toFixed(3)} j.św. ≠ ${wymagana.toFixed(3)} (podłoga ${PODLOGA_PX.L1} px w granicy pasma)`);
      if (szer < 12 - 1e-6) bledy.push(`człon wysuwny: szewron ${szer.toFixed(2)} j.św. mniejszy niż w proporcjach świata (12) — pomniejszony zamiast uproszczony`);
    }
  }
  // Detale wg LOD (jedna tabela): napęd i znak niepewnego stanu.
  const naped = doc.querySelector('[data-qet="osprzet"]');
  const zNapedem = symbol.osprzet.length > 0;
  if (Boolean(naped) !== (zNapedem && DETALE_WG_LOD[lod].naped)) bledy.push(`napęd „M” ${naped ? 'rysowany' : 'zdjęty'} na ${lod} — tabela detali LOD: ${zNapedem && DETALE_WG_LOD[lod].naped ? 'rysowany' : 'zdjęty'}`);
  const stan = doc.querySelector('[data-kafel-stanu]')?.getAttribute('data-kafel-stanu');
  const znak = doc.querySelector('[data-kafel="znak"]');
  const znakWymagany = DETALE_WG_LOD[lod].znak && (stan === 'nieustalony' || stan === 'bledny');
  if (Boolean(znak) !== znakWymagany) bledy.push(`znak stanu niepewnego ${znak ? 'rysowany' : 'zdjęty'} na ${lod} (kafel ${stan}) — tabela detali LOD: ${znakWymagany ? 'rysowany' : 'zdjęty'}`);
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

  it('człon wysuwny: wykonanie wyłącznika z modelu wybiera rysunek „×” z pasmami szewronów (każdy wariant rysunku i napęd)', () => {
    const w = TABELA_WLASCICIELA.find((r) => r.rodzaj.includes('człon wysuwny'))!;
    expect(w.znaczniki).toEqual({ closed: 'wylacznik' });
    expect(w.czlon).toBe(true);
    expect(symbolIdForPrimaryDeviceKind('CB', WARIANT_RYSUNKU_QET, { wysuwny: true })).toBe('qetBreakerWysuwny');
    expect(symbolIdForPrimaryDeviceKind('CB', null, { wysuwny: true })).toBe('qetBreakerWysuwny');
    expect(symbolIdForPrimaryDeviceKind('CB', WARIANT_RYSUNKU_QET, { wysuwny: true, naped: 'SILNIKOWY' })).toBe('qetBreakerWysuwnyZNapedem');
    expect(symbolIdForPrimaryDeviceKind('CB', WARIANT_RYSUNKU_QET, { naped: 'SILNIKOWY' })).toBe('qetBreakerZNapedem');
    // Wykonanie dotyczy wyłącznie wyłącznika (backend `RODZAJE_Z_WYKONANIEM`).
    expect(symbolIdForPrimaryDeviceKind('LOAD_SWITCH', WARIANT_RYSUNKU_QET, { wysuwny: true })).toBe('qetLoadBreakSwitch');
    expect(symboleRodzajuAparatu('CB')).toEqual(expect.arrayContaining(['qetBreakerWysuwny', 'qetBreakerWysuwnyZNapedem']));
    expect([...RODZAJE_LACZNIKOW_POLA].sort()).toEqual(['CB', 'DS', 'ES', 'FUSE', 'LOAD_SWITCH', 'THREE_POSITION_SWITCH']);
  });

  it('trzy kształty znaczników; okrąg wyłącznie w rozłączniku; odłącznik i uziemnik — ta sama kreska, rozróżnia je symbol ziemi', () => {
    expect(new Set([SYGNATURA.wylacznik, SYGNATURA.odlacznik, SYGNATURA.rozlacznik]).size).toBe(3);
    expect(Object.entries(SYGNATURA).filter(([, s]) => s.includes('okrag')).map(([r]) => r)).toEqual(['rozlacznik']);
    expect(SYGNATURA.uziemnik).toBe(SYGNATURA.odlacznik);
    for (const w of TABELA_WLASCICIELA) expect(w.ziemia, w.rodzaj).toBe(Object.values(w.znaczniki).includes('uziemnik'));
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
  const rozmiary = new Map<string, Set<string>>();
  for (const [wiersz, id] of SYMBOLE) {
    for (const state of STANY) {
      for (const [motyw, kafle] of MOTYWY) {
        for (const [nazwaLod, lod, skala] of LODY) {
          it(`${wiersz.rodzaj} (${id}) · ${state ?? 'brak stanu'} · ${motyw} · ${nazwaLod} (skala ${skala.toFixed(2)})`, () => {
            const doc = rysuj(id, state, kafle, skala, lod);
            expect(naruszenia(doc, id, kafle, lod, skala)).toEqual([]);
            for (const g of doc.querySelectorAll('[data-qet="znacznik"]')) {
              const rodzaj = g.getAttribute('data-znacznik-rodzaj') as RodzajZnacznika;
              const z = ksztalt(g);
              const o = obwiednia(z);
              if (!sygnatury.has(rodzaj)) sygnatury.set(rodzaj, new Set());
              const klucz = `${rodzaj}@${nazwaLod}`;
              if (!rozmiary.has(klucz)) rozmiary.set(klucz, new Set());
              sygnatury.get(rodzaj)!.add(sygnatura(z));
              // Proporcje rodzaju: bok obwiedni (większy wymiar) i stosunek boków (okrąg, krzyżyk
              // i kreska z okręgiem — niezależne od orientacji).
              const a = Math.max(o.x1 - o.x0, o.y1 - o.y0);
              const b = Math.min(o.x1 - o.x0, o.y1 - o.y0);
              rozmiary.get(klucz)!.add(`${a.toFixed(3)}:${(b / a).toFixed(3)}`);
            }
          });
        }
      }
    }
  }

  it('spójność: ten sam rodzaj = ta sama sygnatura w każdym LOD i te same proporcje w każdym symbolu, stanie i motywie danego LOD; różne rodzaje rozróżnialne', () => {
    expect([...sygnatury.keys()].sort()).toEqual(['odlacznik', 'rozlacznik', 'uziemnik', 'wylacznik']);
    for (const [rodzaj, zbior] of sygnatury) expect([...zbior], rodzaj).toEqual([SYGNATURA[rodzaj]]);
    for (const [rodzaj, zbior] of rozmiary) expect(zbior.size, `${rodzaj}: ${[...zbior].join(' · ')}`).toBe(1);
    // Wszystkie rodzaje mają ten sam bok znacznika na danym poziomie (jeden rozmiar kafla);
    // stosunek boków rodzaju jest ten sam na każdym poziomie (znacznik rośnie jednokładnie).
    // LOD0 na skali 0,3: granica kafla zatrzymuje każdy rodzaj w innym miejscu (kotwica rodzaju) —
    // bok wiąże wyrocznia granicy w `naruszenia`, nie równość rodzajów.
    for (const [nazwaLod] of LODY.filter(([n]) => n !== 'L0 dół')) {
      const boki = [...rozmiary].filter(([k]) => k.endsWith(`@${nazwaLod}`)).map(([, z]) => [...z][0].split(':')[0]);
      expect(new Set(boki).size, nazwaLod).toBe(1);
    }
    for (const r of sygnatury.keys()) {
      const stosunki = [...rozmiary].filter(([k]) => k.startsWith(`${r}@`)).map(([, z]) => [...z][0].split(':')[1]);
      expect(new Set(stosunki).size, r).toBe(1);
    }
  });

  it('warunek wstępny: kafel 48 j.św., kreska glifu = bok/24', () => {
    expect(QET_BOK_KAFLA_STANU).toBe(48);
    expect(QET_KRESKA_GLIFU).toBeCloseTo(QET_BOK_KAFLA_STANU / 24, 9);
  });
});

describe('znacznik rodzaju aparatu — iniekcje (każda czerwona)', () => {
  const [, kafle] = MOTYWY[0];
  const [, lod, skala] = LODY[4];

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
      (d) => d.querySelector('[data-qet="znacznik"] line')!.setAttribute('stroke', '#000000'),
      /kolor #000000/,
    ],
    [
      'odłącznik z kółkiem (dawny „○”)',
      'qetDisconnector',
      'closed',
      (d) => {
        const g = d.querySelector('[data-znacznik-rodzaj="odlacznik"]')!;
        const c = d.createElementNS('http://www.w3.org/2000/svg', 'circle');
        for (const [k, v] of [['cx', '24'], ['cy', '9'], ['r', '6'], ['stroke-width', String(QET_KRESKA_GLIFU)], ['stroke', g.querySelector('line')!.getAttribute('stroke')!]]) c.setAttribute(k, v);
        g.appendChild(c);
      },
      /okrąg „○” należy wyłącznie do rozłącznika/,
    ],
    [
      'szewrony członu wysuwnego barwione stanem wyłącznika',
      'qetBreakerWysuwny',
      'closed',
      (d) => {
        for (const n of d.querySelectorAll('[data-czlon-pasmo] [stroke]')) n.setAttribute('stroke', kafle.zamkniety);
      },
      /szewrony nie niosą stanu wyłącznika/,
    ],
    ['brak pasma szewronów pod kaflem', 'qetBreakerWysuwnyZNapedem', 'open', (d) => d.querySelector('[data-czlon-pasmo="dol"]')!.remove(), /brak pasma dol/],
    ['brak symbolu ziemi uziemnika (uziemnik nie do odróżnienia od odłącznika)', 'qetEarthSwitch', 'closed', (d) => d.querySelector('[data-qet="ziemia"]')!.remove(), /symbol ziemi brak/],
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
      const doc = rysuj(id, state, kafle, skala, lod);
      expect(naruszenia(doc, id, kafle, lod, skala), 'przed iniekcją').toEqual([]);
      psuj(doc);
      const wynik = naruszenia(doc, id, kafle, lod, skala);
      expect(wynik.join('\n')).toMatch(oczekiwany);
    });
  }

  // Stan sprzed rozstrzygnięcia UX04-KRESKA-PIKTOGRAMU-KAFLA: piktogram kafla dostawał kompensację
  // kreski kanwy (`strokeScaleFactor`). Na dolnym brzegu LOD2 tusz okręgu odłącznika schodzi pod
  // margines 4 j.św., a przy wejściu w LOD1 ramiona krzyżyka wyłącznika zlewają się z nożem.
  for (const [lodI, skalaI, idI, oczekiwanyI] of [
    ['L2', LODY[4][2], 'qetThreePositionSwitch', /od krawędzi kafla < 4/],
    ['L1', LODY[3][2], 'qetBreaker', /nachodzi na nóż/],
  ] as const) {
    it(`kompensacja kreski na piktogramie kafla (${lodI}, ${idI}) — czerwony`, () => {
      const doc = rysuj(idI, 'closed', kafle, skalaI, lodI);
      expect(naruszenia(doc, idI, kafle, lodI, skalaI), 'przed iniekcją').toEqual([]);
      const k = strokeScaleFactor(skalaI);
      expect(k).toBeGreaterThan(1);
      for (const n of doc.querySelectorAll('[data-qet="noz"] [stroke-width], [data-qet="znacznik"] [stroke-width]')) {
        n.setAttribute('stroke-width', String(liczba(n, 'stroke-width') * k));
      }
      expect(naruszenia(doc, idI, kafle, lodI, skalaI).join('\n')).toMatch(oczekiwanyI);
    });
  }

  it('podłoga ekranu: znacznik 12 j.św. na dolnym brzegu LOD2 ma 12,24 px (≥ 10), przy wejściu w LOD1 8,28 px (≥ 8)', () => {
    expect(12 * LODY[4][2]).toBeCloseTo(12.24, 9);
    expect(12 * LODY[3][2]).toBeCloseTo(8.28, 9);
    // Iniekcja: znacznik o dolnym brzegu przedziału udziału (22 % → 10,56 j.św.) przy wejściu
    // w LOD1 ma 7,29 px < 8 — podłoga LOD1 jest czynna, nie trywialna.
    expect(0.22 * QET_BOK_KAFLA_STANU * LODY[3][2]).toBeLessThan(PODLOGA_PX.L1);
    expect(PODLOGA_ZNACZNIKA_LOD1_PX).toBe(PODLOGA_PX.L1);
    // Dolny brzeg LOD1 (0,51): znacznik ma 8 px = 15,69 j.św. = 32,7 % kafla.
    expect(skalaZnacznikaKafla(LODY[2][2], 1) * 12 * LODY[2][2]).toBeCloseTo(8, 9);
    // LOD0 — wielkość z dolnego brzegu LOD1 (uwaga właściciela 2026-11-04 pkt 5); LOD2 — proporcje świata.
    expect(skalaZnacznikaKafla(LODY[1][2], 0) * 12 * 0.51).toBeCloseTo(8, 9);
    expect(skalaZnacznikaKafla(LODY[4][2], 2)).toBe(1);
  });

  // Iniekcja „symbol pomniejszony zamiast uproszczony” (uwaga właściciela 2026-11-04 pkt 5): na LOD0
  // kafel rysowany jak na LOD2 — znacznik w proporcjach świata (bez podłogi) i z pełnym detalem.
  for (const id of ['qetBreakerZNapedem', 'qetDisconnector', 'qetBreakerWysuwny', 'qetEarthSwitch'] as const) {
    it(`LOD0: symbol pomniejszony zamiast uproszczonego (${id}) — czerwony`, () => {
      const [, lodD, skalaD] = LODY[1];
      expect(naruszenia(rysuj(id, 'unknown', kafle, skalaD, lodD), id, kafle, lodD, skalaD)).toEqual([]);
      const markup = renderToStaticMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          {(() => {
            const Glyph = SYMBOL_GLYPHS[id];
            return <Glyph x={0} y={0} stroke="#123456" state="unknown" kafleStanu={kafle} strokeScale={strokeScaleFactor(skalaD)} skalaZnacznika={1} lod={2} />;
          })()}
        </svg>,
      );
      const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
      expect(naruszenia(doc, id, kafle, lodD, skalaD).join('\n')).toMatch(/px na L0 < 8 px|szewron .* ≠|szerokość .* ≠|napęd „M” rysowany|znak stanu niepewnego rysowany/);
    });
  }

  for (const id of ['qetBreaker', 'qetDisconnector', 'qetThreePositionSwitch'] as const) {
    it(`podłoga LOD1 wyłączona (mnożnik 1 na skali 0,51, ${id}) — czerwony`, () => {
      const [, lodD, skalaD] = LODY[2];
      expect(naruszenia(rysuj(id, 'open', kafle, skalaD, lodD), id, kafle, lodD, skalaD)).toEqual([]);
      const doc = rysuj(id, 'open', kafle, skalaD, lodD, 1);
      expect(naruszenia(doc, id, kafle, lodD, skalaD).join('\n')).toMatch(/px na L1 < 8 px/);
    });
  }
});
