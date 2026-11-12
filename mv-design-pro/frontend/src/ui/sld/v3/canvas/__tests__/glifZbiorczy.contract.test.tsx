/**
 * Karta SLD-SKALA-I-NAWIGACJA, R8 — SYMBOL STACJI w kadrze całej sieci (decyzje właściciela
 * 2026-11-12: budżet 3 000 węzłów; stacja = szyna i nogi toru, bez TR; odgałęzienie O4 — kolejna
 * noga z KOŃCA szyny; stacja z OZE — znak B1 pod szyną; punkt rozłącznikowy (stacja bez TR) — romb
 * R1 na linii; łącznik otwarty — □ w ŚRODKU nogi; niezasilone szare; czerwona szyna = alarm).
 *
 * ILOCZYN CECH (część czysta, stacja syntetyczna o geometrii toru jak w układzie sceny):
 * {położenie: magistrala, odgałęzienie poziome, odgałęzienie pionowe (schodek), stacja końcowa}
 * × {0, 1, 2 odgałęzienia} × {łącznik otwarty: brak, w nodze wejściowej, wyjściowej, odgałęzienia}
 * × {rodzaj: zwykła, punkt rozłącznikowy, OZE}; dla punktu rozłącznikowego {zamknięty, otwarty}
 * × {przelot, z odgałęzieniem} wynika z tego samego iloczynu, a na renderze — osobny test.
 * Część DOM: sieć wzorcowa 52 stacji (nogi = porty sceny, wyłącznie piony — nic „na skróty” i bez
 * obrotu; odgałęzienie z końca szyny ≥ podziałka od nóg magistrali; B1 na stacjach z OZE; alarm;
 * stan niezasilony; kadr roboczy bez symboli) oraz warianty modelu (łącznik otwarty w nodze
 * wejściowej/wyjściowej/odgałęzienia, stacje bez transformatora). Warstwa trafień: obiekt bez
 * węzła nie ma własnego obszaru, szyna SN tak (cel R6).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { PreviewSegment, PreviewSymbol } from '../../compose/preview';
import { GRID } from '../../core/grid';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3, kotwiceWynikow, symbolTestId } from '../SldCanvasV3';
import type { ResultLabelEntry } from '../resultLabels';
import { hierarchiaCelowTrafienia } from '../zakresKadru';
import {
  bezWezlaPrzegladu,
  poleIStacjaObiektu,
  rodzajeStacji,
  stacjePrzegladu,
  type HierarchiaCelowWejscie,
} from '../hitAreas';
import {
  liniaPunktu,
  najgorszyStanStacji,
  przerwyWNogach,
  rombPunktu,
  sciezkaNog,
  symboleStacji,
  xZawieszeniaZnaku,
  znakOze,
  type SymbolStacji,
} from '../glifZbiorczy';
import { przerwaToru } from '../torMocy';
import { kameraNadSrodkiemSceny } from './kameraTestowa';

// ---------------------------------------------------------------------------
// Stacja syntetyczna: szyna SN na y = 0, pola w dół co PODZIALKA, port toru każdego pola na
// y = PORT; odcinki toru (magistrala, odgałęzienie „L”) dochodzą do portów jak w układzie sceny.
// ---------------------------------------------------------------------------
const PODZIALKA = 200;
const PORT = 160;
const SKALA = 0.05;
type Noga = 'we' | 'wy' | 'odg';
type Polozenie = 'magistrala' | 'odgalezienie-poziome' | 'schodek' | 'koncowa';
type Rodzaj = 'zwykla' | 'punkt' | 'oze';
const ST = 'stn/S/station';

interface Syntetyczna {
  readonly symbole: PreviewSymbol[];
  readonly odcinki: PreviewSegment[];
  readonly hierarchia: HierarchiaCelowWejscie;
  /** Indeks symbolu łącznika nogi `i`. */
  readonly lacznik: readonly number[];
}

function torDoPortu(noga: Noga, polozenie: Polozenie, x: number): { x: number; y: number }[] {
  if (noga === 'odg') return [{ x, y: PORT }, { x, y: PORT + 240 }, { x: x + 400, y: PORT + 240 }];
  if (polozenie === 'schodek') {
    // Odgałęzienie pionowe: tor podchodzi z pionu i skręca poziomo do portu.
    return noga === 'we'
      ? [{ x: x - 80, y: -400 }, { x: x - 80, y: PORT }, { x, y: PORT }]
      : [{ x, y: PORT }, { x: x + 80, y: PORT }, { x: x + 80, y: 800 }];
  }
  return noga === 'we'
    ? [{ x: x - 400, y: PORT + 80 }, { x, y: PORT + 80 }, { x, y: PORT }]
    : [{ x, y: PORT }, { x, y: PORT + 80 }, { x: x + 400, y: PORT + 80 }];
}

function stacjaSyntetyczna(nogi: readonly Noga[], polozenie: Polozenie, rodzaj: Rodzaj, otwarty: Noga | 'brak'): Syntetyczna {
  const symbole: PreviewSymbol[] = [];
  const odcinki: PreviewSegment[] = [];
  const pola = new Map<string, { rect: { x: number; y: number; width: number; height: number }; stacjaRef: string }>();
  const lacznik: number[] = [];
  const xKonca = nogi.length * PODZIALKA;
  nogi.forEach((noga, i) => {
    const x = i * PODZIALKA;
    const pole = `stn/S/sn_field/00${i}`;
    pola.set(pole, { rect: { x: x - 16, y: -8, width: 64, height: PORT + 16 }, stacjaRef: ST });
    odcinki.push({ points: [{ x, y: 0 }, { x, y: 56 }], meta: { ownerRef: `${pole}#descent`, elementKind: 'segment' } });
    lacznik.push(symbole.length);
    symbole.push({
      symbolId: 'breaker',
      x: x - 8,
      y: 56,
      state: noga === otwarty ? 'open' : 'closed',
      meta: { ownerRef: pole, elementKind: 'apparatus', trackRole: noga === 'odg' ? 'odgalezienie' : 'glowny' },
    });
    odcinki.push({ points: [{ x, y: 72 }, { x, y: PORT }], meta: { ownerRef: `${pole}#wire-0`, elementKind: 'segment' } });
    odcinki.push({ points: torDoPortu(noga, polozenie, x), meta: { ownerRef: `seg/${noga}${i}`, elementKind: 'segment' } });
  });
  // Szyna SN: od pierwszej nogi do pola transformatora za nogami (jak w układzie sceny).
  odcinki.push({ points: [{ x: 0, y: 0 }, { x: xKonca, y: 0 }], meta: { ownerRef: 'stn/S/sn_bus#sn-bus', elementKind: 'bus' } });
  if (rodzaj !== 'punkt') {
    const pole = 'stn/S/sn_field/009';
    pola.set(pole, { rect: { x: xKonca - 16, y: -8, width: 64, height: 120 }, stacjaRef: ST });
    odcinki.push({ points: [{ x: xKonca, y: 0 }, { x: xKonca, y: 40 }], meta: { ownerRef: `${pole}#descent`, elementKind: 'segment' } });
    symbole.push({ symbolId: 'transformer2W', x: xKonca - 16, y: 40, meta: { ownerRef: pole, elementKind: 'transformer' } });
  }
  if (rodzaj === 'oze') symbole.push({ symbolId: 'derPv', x: xKonca + 40, y: 120, meta: { ownerRef: 'stn/S/der', elementKind: 'der' } });
  const hierarchia: HierarchiaCelowWejscie = {
    pola,
    stacje: new Map([[ST, { x: -16, y: -8, width: xKonca + 96, height: PORT + 200 }]]),
    stacjaObiektu: new Map([
      ['stn/S/sn_bus', ST],
      ['stn/S/der', ST],
    ]),
  };
  return { symbole, odcinki, hierarchia, lacznik };
}

function nogiDla(polozenie: Polozenie, liczbaOdg: number): Noga[] {
  const odg: Noga[] = Array.from({ length: liczbaOdg }, () => 'odg');
  return polozenie === 'koncowa' ? ['we', ...odg] : ['we', 'wy', ...odg];
}

/** Rozbiór ścieżki nóg: całe `d` to wyłącznie pionowe podścieżki „M x y V y2” — żadnego odcinka
 *  na skróty ani kreski ukośnej (symbol nieobrócony). */
function podsciezkiNog(d: string): { x: number; y0: number; y1: number }[] {
  const out: { x: number; y0: number; y1: number }[] = [];
  const re = /M (-?[\d.e+-]+) (-?[\d.e+-]+) V (-?[\d.e+-]+)/g;
  let m: RegExpExecArray | null;
  const dopasowane: string[] = [];
  while ((m = re.exec(d)) !== null) {
    out.push({ x: Number(m[1]), y0: Number(m[2]), y1: Number(m[3]) });
    dopasowane.push(m[0]);
  }
  expect(dopasowane.join(' '), d).toBe(d.trim());
  return out;
}

/** Ścieżka SVG zgodna z oczekiwaną: ten sam szkielet poleceń, liczby z tolerancją — kanwa liczy
 *  rozmiary ekranowe ze skali kamery, a atrybut `data-skala-kamery` niesie ją zaokrągloną. */
function expectSciezkaBliska(d: string | null, oczekiwana: string): void {
  const LICZBA = /-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g;
  expect(d).not.toBeNull();
  expect(d!.replace(LICZBA, '#')).toBe(oczekiwana.replace(LICZBA, '#'));
  const a = (d!.match(LICZBA) ?? []).map(Number);
  const b = (oczekiwana.match(LICZBA) ?? []).map(Number);
  expect(a).toHaveLength(b.length);
  a.forEach((x, i) => expect(Math.abs(x - b[i]), `${d} ≠ ${oczekiwana}`).toBeLessThan(0.1));
}

/** Podziałka pól stacji: najmniejszy odstęp sąsiednich pól (obszary R6 z hierarchii) — miara
 *  niezależna od rysunku nóg, więc noga narysowana pod inną nogą jej nie zmienia. */
function podzialkaPol(h: HierarchiaCelowWejscie, stacjaRef: string): number {
  const xs = [...h.pola.values()].filter((p) => p.stacjaRef === stacjaRef).map((p) => p.rect.x).sort((a, b) => a - b);
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < xs.length; i += 1) if (xs[i] - xs[i - 1] > 0) min = Math.min(min, xs[i] - xs[i - 1]);
  return min;
}

/** Odstęp nogi odgałęzienia od nóg magistrali: każda para ≥ podziałka pól (O4). */
function sprawdzOdgalezieniaZKonca(st: SymbolStacji, podzialka: number): void {
  const mag = st.nogi.filter((n) => n.rola === 'magistrala').map((n) => n.x);
  for (const n of st.nogi.filter((x) => x.rola === 'odgalezienie')) {
    expect(Number.isFinite(podzialka) && podzialka > 0).toBe(true);
    for (const m of mag) expect(Math.abs(n.x - m), `${st.stacjaRef} ${n.pole}`).toBeGreaterThanOrEqual(podzialka);
    // Noga odgałęzienia wychodzi z KOŃCA szyny przeglądowej, nigdy spomiędzy nóg magistrali.
    expect(n.x < Math.min(...mag) || n.x > Math.max(...mag), n.pole).toBe(true);
  }
}

/** □ w środku nogi: środek □ = środek odcinka szyna–punkt załamania toru, odstęp □ od szyny i od
 *  punktu załamania ≥ GRID (podziałka siatki) — linia nie wychodzi z narożnika ani boku □. */
function sprawdzPrzerweWSrodku(z: { x: number; y: number; width: number; height: number }, noga: SymbolStacji['nogi'][number]): void {
  expect(z.x + z.width / 2).toBeCloseTo(noga.x, 9);
  expect(z.y + z.height / 2).toBeCloseTo((noga.ySzyny + noga.yZalamania) / 2, 9);
  const [gora, dol] = noga.ySzyny < noga.yZalamania ? [noga.ySzyny, noga.yZalamania] : [noga.yZalamania, noga.ySzyny];
  // Punkt załamania leży na przedłużeniu nogi, nie wyżej niż port toru.
  expect(Math.abs(noga.yZalamania - noga.ySzyny)).toBeGreaterThanOrEqual(Math.abs(noga.yToru - noga.ySzyny));
  expect(z.y - gora).toBeGreaterThanOrEqual(GRID);
  expect(dol - (z.y + z.height)).toBeGreaterThanOrEqual(GRID);
  expect(z.width).toBeGreaterThan(0);
}

describe('R8 — symbol stacji, ILOCZYN {położenie} × {odgałęzienia} × {łącznik otwarty} × {rodzaj}', () => {
  for (const polozenie of ['magistrala', 'odgalezienie-poziome', 'schodek', 'koncowa'] as const) {
    for (const liczbaOdg of [0, 1, 2]) {
      for (const otwarty of ['brak', 'we', 'wy', 'odg'] as const) {
        if (otwarty === 'odg' && liczbaOdg === 0) continue;
        if (otwarty === 'wy' && polozenie === 'koncowa') continue;
        for (const rodzaj of ['zwykla', 'punkt', 'oze'] as const) {
          it(`${polozenie} × ${liczbaOdg} odg. × otwarty ${otwarty} × ${rodzaj}`, () => {
            const nogi = nogiDla(polozenie, liczbaOdg);
            const s = stacjaSyntetyczna(nogi, polozenie, rodzaj, otwarty);
            const wynik = symboleStacji(s.symbole, s.odcinki, s.hierarchia, SKALA);
            expect(wynik).toHaveLength(1);
            const st = wynik[0];
            expect(st.rodzaj).toBe(rodzaj === 'punkt' ? 'punkt-rozlacznikowy' : rodzaj);
            // Nogi: każde pole z odcinkiem toru, na osi pola, od szyny (y 0) do portu toru (y PORT).
            expect(st.nogi.map((n) => [n.x, n.ySzyny, n.yToru])).toEqual(nogi.map((_, i) => [i * PODZIALKA, 0, PORT]));
            // Punkt załamania: zejście magistrali w osi nogi (PORT + 80), schodek skręca w porcie,
            // odgałęzienie „L” schodzi do PORT + 240.
            expect(st.nogi.map((n) => n.yZalamania)).toEqual(
              nogi.map((n) => (n === 'odg' ? PORT + 240 : polozenie === 'schodek' ? PORT : PORT + 80)),
            );
            expect(st.nogi.map((n) => n.rola)).toEqual(nogi.map((n) => (n === 'odg' ? 'odgalezienie' : 'magistrala')));
            expect(podsciezkiNog(sciezkaNog(st.nogi))).toEqual(nogi.map((_, i) => ({ x: i * PODZIALKA, y0: 0, y1: PORT })));
            sprawdzOdgalezieniaZKonca(st, podzialkaPol(s.hierarchia, ST));
            const xs = st.nogi.map((n) => n.x);
            expect(st.szynaPrzegladu).toEqual(
              nogi.length >= 2 ? { x0: Math.min(...xs), x1: Math.max(...xs), y: 0 } : { x0: 0, x1: rodzaj === 'punkt' ? PODZIALKA : PODZIALKA, y: 0 },
            );

            // Obiekty bez węzła: TR, OZE, aparatura pól i wszystkie odcinki stacji; łącznik otwarty
            // w nodze zostaje węzłem (□), poza punktem rozłącznikowym (stan niesie romb).
            const bez = bezWezlaPrzegladu(s.symbole, s.odcinki, s.hierarchia, stacjePrzegladu(s.symbole, s.hierarchia, SKALA));
            s.symbole.forEach((sym, i) => expect(bez.symbole.has(i), `${sym.symbolId} ${sym.state}`).toBe(!(rodzaj !== 'punkt' && przerwaToru(sym))));
            s.odcinki.forEach((o, i) => expect(bez.odcinki.has(i), o.meta?.ownerRef).toBe(!o.meta!.ownerRef!.startsWith('seg/')));

            const przerwy = przerwyWNogach(s.symbole, [st], s.hierarchia, SKALA);
            if (rodzaj === 'punkt') {
              expect(przerwy.size).toBe(0);
              expect(st.stanPunktu).toBe(otwarty === 'brak' ? 'zamkniety' : 'otwarty');
              // R1: linia wyłącznie przez porty toru (bez nóg i szyny), romb na tej linii.
              const linia = liniaPunktu(st.nogi);
              if (nogi.length >= 2) {
                const punkty = [...linia.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
                expect(punkty).toEqual([...xs].sort((a, b) => a - b).map((x) => ({ x, y: PORT })));
              }
              const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
              expect(rombPunktu(st.nogi, SKALA).startsWith(`M ${cx} ${PORT - 6 / SKALA} `)).toBe(true);
            } else {
              expect(st.stanPunktu).toBeUndefined();
              if (otwarty === 'brak') expect(przerwy.size).toBe(0);
              else {
                const otwarte = nogi.flatMap((n, i) => (n === otwarty ? [i] : []));
                expect([...przerwy.keys()]).toEqual(otwarte.map((i) => s.lacznik[i]));
                for (const i of otwarte) sprawdzPrzerweWSrodku(przerwy.get(s.lacznik[i])!, st.nogi[i]);
              }
            }
            if (rodzaj === 'oze') {
              // B1 pod szyną (po stronie nóg), między nogami magistrali.
              const xz = xZawieszeniaZnaku(st)!;
              const mag = st.nogi.filter((n) => n.rola === 'magistrala').map((n) => n.x);
              if (mag.length >= 2) expect(xz).toBe((Math.min(...mag) + Math.max(...mag)) / 2);
              expect(znakOze(0, xz, 1, SKALA).startsWith(`M ${xz} 0 V ${6 / SKALA} `)).toBe(true);
            }
          });
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Sieć wzorcowa 52 stacji — render DOM kadru całej sieci.
// ---------------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(readFileSync(resolve(here, '../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json'), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }
).enm;
const scene = buildSceneV3(enm);
const hierarchia = hierarchiaCelowTrafienia(enm, scene);
/** Skala kadru całej sieci 52 stacji na kanwie 1200×800 (pomiar `data-skala-kamery`). */
const SKALA_PRZEGLADU = 0.0884;
const idOdcinka = (s: PreviewSegment, i: number) => s.meta?.testId ?? `sld-v3-segment-${i}`;

// Render w każdym teście: automatyczne `cleanup` testing-library odmontowuje drzewo po teście.
function kadrCalejSieci(model: EnergyNetworkModel = enm, overlay?: Parameters<typeof SldCanvasV3>[0]['overlay']) {
  const { container } = render(<SldCanvasV3 snapshot={model} width={1200} height={800} onElementClick={() => {}} overlay={overlay} />);
  const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
  const skala = Number(svg.getAttribute('data-skala-kamery'));
  expect(skala).toBeCloseTo(SKALA_PRZEGLADU, 4);
  return { container, svg, skala };
}

function symbolStacjiWDom(svg: Element, ref: string): Element {
  const g = [...svg.querySelectorAll('[data-symbol-stacji="true"]')].find((x) => x.getAttribute('data-owner-ref') === ref);
  expect(g, ref).toBeDefined();
  return g!;
}

function stacjaObiektuSceny(h: HierarchiaCelowWejscie, ref: string | undefined): string | undefined {
  const { pole, stacja } = poleIStacjaObiektu(h, ref);
  return stacja ?? (pole === undefined ? undefined : h.pola.get(pole)?.stacjaRef);
}

interface PoleEnm {
  readonly ref_id: string;
  readonly field_role?: string;
  readonly primary_devices?: { readonly kind: string; switch_state?: { actual_state: string } }[];
}
interface ModelLuzny {
  substations: { name: string; ref_id: string; transformer_refs: string[] }[];
  transformers: { ref_id: string }[];
  bays: PoleEnm[];
}

/** Wariant modelu: łącznik pola o roli `rola` otwarty; stacja bez transformatora (punkt). */
function wariant(zmiany: { otworz?: readonly (readonly [string, string])[]; bezTr?: readonly string[] }): EnergyNetworkModel {
  const m = structuredClone(enm) as unknown as ModelLuzny;
  const pola = (st: string) => m.bays.filter((b) => b.ref_id.startsWith(st.replace('/station', '/sn_field')));
  for (const [st, rola] of zmiany.otworz ?? []) {
    const pole = pola(st).find((b) => b.field_role === rola)!;
    const ds = pole.primary_devices!.find((d) => d.kind === 'DS' && d.switch_state)!;
    ds.switch_state = { ...ds.switch_state!, actual_state: 'otwarty' };
  }
  for (const st of zmiany.bezTr ?? []) {
    const s = m.substations.find((x) => x.ref_id === st)!;
    const tr = new Set(s.transformer_refs);
    s.transformer_refs = [];
    m.transformers = m.transformers.filter((t) => !tr.has(t.ref_id));
    const trPola = new Set(pola(st).filter((b) => b.field_role === 'TRANSFORMATOROWE').map((b) => b.ref_id));
    m.bays = m.bays.filter((b) => !trPola.has(b.ref_id));
  }
  return m as unknown as EnergyNetworkModel;
}

const stacjeBazy = symboleStacji(scene.symbols, scene.segments, hierarchia, SKALA_PRZEGLADU);
const zOdgalezieniem = stacjeBazy.filter((s) => s.nogi.some((n) => n.rola === 'odgalezienie'));
const przelotowe = stacjeBazy.filter((s) => s.nogi.length === 2);

describe('R8 — symbol stacji na renderze kadru całej sieci (sieć wzorcowa 52 stacji)', () => {
  const rodzaje = rodzajeStacji(scene.symbols, hierarchia);

  it('każda stacja SN/nN jest symbolem stacji, GPZ pełnym rysunkiem; rodzaj z modelu', () => {
    const snNn = [...rodzaje].filter(([, r]) => r !== 'gpz').map(([s]) => s);
    expect(stacjeBazy.map((s) => s.stacjaRef).sort()).toEqual(snNn.sort());
    expect(stacjeBazy).toHaveLength(53);
    expect(stacjeBazy.filter((s) => s.rodzaj === 'oze')).toHaveLength(16);
    const { svg } = kadrCalejSieci();
    expect(svg.querySelectorAll('[data-symbol-stacji="true"]')).toHaveLength(stacjeBazy.length);
    for (const s of stacjeBazy) expect(symbolStacjiWDom(svg, s.stacjaRef).getAttribute('data-rodzaj-stacji')).toBe(s.rodzaj);
  });

  it('nogi = porty sceny: góra na szynie SN, dół na końcu odcinka toru; wyłącznie piony (bez skrótu, bez obrotu)', () => {
    const { svg } = kadrCalejSieci();
    for (const s of stacjeBazy) {
      expect(s.nogi.length, s.stacjaRef).toBeGreaterThanOrEqual(2);
      const g = symbolStacjiWDom(svg, s.stacjaRef);
      const nogi = [...g.querySelectorAll('[data-nogi-stacji]')].flatMap((p) => podsciezkiNog(p.getAttribute('d')!));
      const oczekiwane = s.nogi.map((n) => ({ x: n.x, y0: n.ySzyny, y1: n.yToru }));
      const porzadek = (a: { x: number }, b: { x: number }) => a.x - b.x;
      expect(nogi.sort(porzadek)).toEqual([...oczekiwane].sort(porzadek));
      for (const n of s.nogi) {
        const tor = scene.segments[n.odcinekToru].points;
        expect([tor[0], tor[tor.length - 1]]).toContainEqual({ x: n.x, y: n.yToru });
        expect(s.szyny.some((i) => scene.segments[i].points.some((p) => p.y === n.ySzyny))).toBe(true);
      }
      const sz = s.szynaPrzegladu!;
      expect(g.querySelector('[data-szyna-stacji]')!.getAttribute('d')).toBe(`M ${sz.x0} ${sz.y} H ${sz.x1}`);
    }
  });

  it('odgałęzienie O4: noga odgałęzienia z końca szyny, ≥ podziałka od każdej nogi magistrali', () => {
    expect(zOdgalezieniem).toHaveLength(12);
    for (const s of zOdgalezieniem) {
      const mag = s.nogi.filter((n) => n.rola === 'magistrala').map((n) => n.x);
      expect(mag).toHaveLength(2);
      sprawdzOdgalezieniaZKonca(s, podzialkaPol(hierarchia, s.stacjaRef));
      for (const n of s.nogi.filter((x) => x.rola === 'odgalezienie')) expect([s.szynaPrzegladu!.x0, s.szynaPrzegladu!.x1]).toContain(n.x);
    }
  });

  it('bez TR i aparatury: obiekty stacji bez węzła, odcinki toru spoza stacji z węzłem', () => {
    const { svg } = kadrCalejSieci();
    const bez = bezWezlaPrzegladu(scene.symbols, scene.segments, hierarchia, stacjePrzegladu(scene.symbols, hierarchia, SKALA_PRZEGLADU));
    for (const i of bez.symbole.keys()) expect(svg.querySelector(`[data-testid="${CSS.escape(symbolTestId(scene.symbols[i], i))}"]`)).toBeNull();
    for (const i of bez.odcinki.keys()) expect(svg.querySelector(`[data-testid="${CSS.escape(idOdcinka(scene.segments[i], i))}"]`)).toBeNull();
    const trStacji = scene.symbols
      .map((x, i) => [x, i] as const)
      .filter(([x]) => x.symbolId === 'transformer2W' && rodzaje.get(stacjaObiektuSceny(hierarchia, x.meta?.ownerRef) ?? '') !== 'gpz');
    expect(trStacji).toHaveLength(53);
    for (const [, i] of trStacji) expect(bez.symbole.has(i)).toBe(true);
    // Strzałki odbioru nN (bez ownerRef) należą do stacji z topologii rysunku — też bez węzła.
    const odbiory = scene.symbols.map((x, i) => [x, i] as const).filter(([x]) => x.symbolId === 'loadArrow');
    expect(odbiory.length).toBeGreaterThan(0);
    for (const [, i] of odbiory) expect(bez.symbole.has(i)).toBe(true);
    let tor = 0;
    scene.segments.forEach((s, i) => {
      if (s.points.length < 2 || bez.odcinki.has(i)) return;
      tor += 1;
      expect(svg.querySelector(`[data-testid="${CSS.escape(idOdcinka(s, i))}"]`), s.meta?.ownerRef).not.toBeNull();
    });
    expect(tor).toBeGreaterThan(100);
  });

  it('B1 na każdej stacji z OZE (pod szyną, między nogami magistrali), na zwykłej nie ma', () => {
    const { svg, skala } = kadrCalejSieci();
    for (const s of stacjeBazy) {
      const znak = symbolStacjiWDom(svg, s.stacjaRef).querySelector('[data-znak-oze]');
      expect(znak !== null, s.stacjaRef).toBe(s.rodzaj === 'oze');
      if (znak) {
        const kierunek = s.nogi[0].yToru < s.nogi[0].ySzyny ? -1 : 1;
        expectSciezkaBliska(znak.getAttribute('d'), znakOze(s.szynaPrzegladu!.y, xZawieszeniaZnaku(s)!, kierunek, skala));
      }
    }
  });

  it('alarm: szyna tej jednej stacji czerwona (barwa najgorszego stanu), znacznik R5 na elemencie, reszta bez zmian', () => {
    const s = stacjeBazy[0];
    const ref = scene.segments[s.szyny[0]].meta!.ownerRef!;
    const wpisy: Record<string, ResultLabelEntry> = {
      [ref]: { ownerRef: ref, resultRef: ref, kind: 'bus', severity: 'CRITICAL', lines: [{ prefix: 'U', text: '1,12' }] },
    };
    expect(kotwiceWynikow(scene, wpisy).has(ref)).toBe(true);
    expect(najgorszyStanStacji(hierarchia, [{ ref, severity: 'CRITICAL' }], []).get(s.stacjaRef)).toEqual({ rodzaj: 'przekroczenie', severity: 'CRITICAL' });
    const { svg } = kadrCalejSieci(enm, { energizedByTestId: {}, resultLabelsByOwnerRef: wpisy });
    const alarmowe = [...svg.querySelectorAll('[data-szyna-stacji][data-stan-alarmowy]')];
    expect(alarmowe.map((a) => a.parentElement?.getAttribute('data-owner-ref'))).toEqual([s.stacjaRef]);
    expect(alarmowe[0].getAttribute('data-stan-alarmowy')).toBe('CRITICAL');
    const neutralne = new Set([...svg.querySelectorAll('[data-szyna-stacji]:not([data-stan-alarmowy])')].map((a) => a.getAttribute('stroke')));
    expect(neutralne.size).toBe(1);
    expect(neutralne.has(alarmowe[0].getAttribute('stroke'))).toBe(false);
    expect(svg.querySelectorAll('[data-testid="sld-v3-znacznik-stanu"][data-znacznik-rodzaj="przekroczenie"]')).toHaveLength(1);
  });

  it('stan niezasilony: szyna i nogi stacji w jednej barwie stanu niezasilonego (szarej), nie alarmowej', () => {
    const s = stacjeBazy[1];
    const nakladka: Record<string, boolean> = {};
    for (const i of s.szyny) nakladka[scene.segments[i].meta!.ownerRef!] = false;
    for (const n of s.nogi) nakladka[scene.segments[n.odcinekToru].meta!.ownerRef!] = false;
    const kolory = (g: Element) => new Set([...g.querySelectorAll('[data-nogi-stacji], [data-szyna-stacji]')].map((p) => p.getAttribute('stroke')));
    const zwykle = kolory(symbolStacjiWDom(kadrCalejSieci().svg, s.stacjaRef));
    const po = symbolStacjiWDom(kadrCalejSieci(enm, { energizedByTestId: {}, energizedByOwnerRef: nakladka }).svg, s.stacjaRef);
    const nowe = [...kolory(po)];
    expect(nowe).toHaveLength(1);
    expect(zwykle.has(nowe[0])).toBe(false);
    expect(po.querySelector('[data-stan-alarmowy]')).toBeNull();
  });

  it('warstwa trafień: obiekt bez węzła nie ma własnego obszaru, szyna SN ma (klik w stację)', () => {
    const { svg } = kadrCalejSieci();
    const hity = new Set([...svg.querySelectorAll('[data-hit-for]')].map((h) => h.getAttribute('data-hit-for')));
    const bez = bezWezlaPrzegladu(scene.symbols, scene.segments, hierarchia, stacjePrzegladu(scene.symbols, hierarchia, SKALA_PRZEGLADU));
    for (const i of bez.symbole.keys()) expect(hity.has(symbolTestId(scene.symbols[i], i))).toBe(false);
    for (const s of stacjeBazy) for (const i of s.szyny) expect(hity.has(idOdcinka(scene.segments[i], i)), idOdcinka(scene.segments[i], i)).toBe(true);
    expect(svg.querySelectorAll('[data-hit-klasa="adnotacja"]')).toHaveLength(0);
  });

  it('kadr roboczy (skala czytania): żadnego symbolu stacji, adnotacje własnym celem kliku', () => {
    const c = render(
      <SldCanvasV3 snapshot={enm} width={1200} height={800} cameraOverride={kameraNadSrodkiemSceny(scene, 1, { width: 1200, height: 800 })} />,
    ).container;
    expect(c.querySelectorAll('[data-symbol-stacji="true"]')).toHaveLength(0);
    expect(c.querySelectorAll('[data-hit-klasa="adnotacja"]').length).toBeGreaterThan(0);
  });
});

describe('R8 — warianty modelu na renderze: łącznik otwarty w nodze, punkt rozłącznikowy R1', () => {
  it('ILOCZYN {noga: wejście, wyjście, odgałęzienie}: □ w środku nogi, bez drugiego znacznika R5', () => {
    const [a, b] = przelotowe;
    const c = zOdgalezieniem[0];
    const model = wariant({ otworz: [[a.stacjaRef, 'LINIA_IN'], [b.stacjaRef, 'LINIA_OUT'], [c.stacjaRef, 'LINIA_ODG']] });
    const sc = buildSceneV3(model);
    const h = hierarchiaCelowTrafienia(model, sc);
    const { svg, skala } = kadrCalejSieci(model);
    const st = symboleStacji(sc.symbols, sc.segments, h, skala);
    const przerwy = przerwyWNogach(sc.symbols, st, h, skala);
    expect(new Set([...przerwy.keys()].map((i) => stacjaObiektuSceny(h, sc.symbols[i].meta?.ownerRef)))).toEqual(new Set([a.stacjaRef, b.stacjaRef, c.stacjaRef]));
    const role = new Set<string>();
    for (const [i, z] of przerwy) {
      const wezel = svg.querySelector(`[data-testid="${CSS.escape(symbolTestId(sc.symbols[i], i))}"]`)!;
      expect(wezel.getAttribute('data-przerwa-toru')).toBe('true');
      expectSciezkaBliska(['x', 'y', 'width', 'height'].map((k) => wezel.getAttribute(k)).join(' '), `${z.x} ${z.y} ${z.width} ${z.height}`);
      const ref = sc.symbols[i].meta!.ownerRef!;
      expect(svg.querySelector(`[data-testid="sld-v3-znacznik-stanu"][data-znacznik-ref="${CSS.escape(ref)}"]`)).toBeNull();
      const noga = st.flatMap((s) => s.nogi).find((n) => n.pole === poleIStacjaObiektu(h, ref).pole)!;
      sprawdzPrzerweWSrodku(z, noga);
      role.add(`${noga.rola}:${noga.x === Math.min(...st.find((s) => s.nogi.includes(noga))!.nogi.map((n) => n.x)) ? 'pierwsza' : 'dalsza'}`);
    }
    expect(role.has('odgalezienie:dalsza')).toBe(true);
    expect(role.has('magistrala:pierwsza')).toBe(true);
  });

  it('ILOCZYN punkt rozłącznikowy {zamknięty, otwarty} × {przelot, z odgałęzieniem}: romb na linii, bez szyny i nóg', () => {
    const [p1, p2] = przelotowe;
    const [o1, o2] = zOdgalezieniem;
    const przypadki = [
      [p1.stacjaRef, 'zamkniety', 0],
      [p2.stacjaRef, 'otwarty', 0],
      [o1.stacjaRef, 'zamkniety', 1],
      [o2.stacjaRef, 'otwarty', 1],
    ] as const;
    const model = wariant({ bezTr: przypadki.map(([r]) => r), otworz: [[p2.stacjaRef, 'LINIA_OUT'], [o2.stacjaRef, 'LINIA_OUT']] });
    const sc = buildSceneV3(model);
    const h = hierarchiaCelowTrafienia(model, sc);
    const { svg, skala } = kadrCalejSieci(model);
    const st = symboleStacji(sc.symbols, sc.segments, h, skala);
    for (const [ref, stan, odg] of przypadki) {
      const s = st.find((x) => x.stacjaRef === ref)!;
      expect(s.rodzaj, ref).toBe('punkt-rozlacznikowy');
      expect(s.stanPunktu, ref).toBe(stan);
      expect(s.nogi.filter((n) => n.rola === 'odgalezienie')).toHaveLength(odg);
      const g = symbolStacjiWDom(svg, ref);
      expect(g.getAttribute('data-stan-punktu')).toBe(stan);
      expect(g.querySelector('[data-szyna-stacji]')).toBeNull();
      expect(g.querySelector('[data-nogi-stacji]')).toBeNull();
      expect(g.querySelector('[data-linia-punktu]')!.getAttribute('d')).toBe(liniaPunktu(s.nogi));
      const romb = g.querySelector('[data-romb-punktu]')!;
      expectSciezkaBliska(romb.getAttribute('d'), rombPunktu(s.nogi, skala));
      expect(romb.getAttribute('fill') === romb.getAttribute('stroke'), ref).toBe(stan === 'zamkniety');
      // Żaden obiekt punktu nie ma węzła ani własnego obszaru trafienia poza szyną (stan niesie romb).
      sc.symbols.forEach((x, i) => {
        if (stacjaObiektuSceny(h, x.meta?.ownerRef) === ref) expect(svg.querySelector(`[data-testid="${CSS.escape(symbolTestId(x, i))}"]`), x.symbolId).toBeNull();
      });
      sc.segments.forEach((x, i) => {
        if (stacjaObiektuSceny(h, x.meta?.ownerRef) === ref) expect(svg.querySelector(`[data-testid="${CSS.escape(idOdcinka(x, i))}"]`), x.meta?.ownerRef).toBeNull();
      });
    }
    // Pozostałe stacje bez zmian rodzaju.
    expect(st.filter((x) => x.rodzaj === 'punkt-rozlacznikowy')).toHaveLength(4);
  });
});
