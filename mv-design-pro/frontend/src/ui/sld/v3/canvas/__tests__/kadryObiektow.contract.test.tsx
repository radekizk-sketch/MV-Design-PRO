/**
 * Kadry obiektów (dyrektywa właściciela 2026-11-13, punkty 5–6; scenariusze geometrii kadru
 * GEO-05 „Cały arkusz”, GEO-06 „Dopasuj stację”, GEO-08 „Dopasuj pole” — przypisanie numerów do
 * poleceń przyjęte przez wykonawcę, w repozytorium nie ma ich definicji). Iloczyn
 * {fikstura: GPZ dwusekcyjny z 40 stacjami, sieć wzorcowa 52 stacji} × {cel: cała sieć, stacja,
 * pole stacji, pole GPZ} × {zasłony: brak, inspektor, inspektor i nawigator} × {okno: 1280×720,
 * 1440×900} na kanwie ścieżką polecenia kadru (`zadanieKadru`, to samo, co „Dopasuj do…”):
 *  - cała sieć — treść rysunku w całości w wolnej kanwie (doki nie zasłaniają obiektu);
 *  - stacja i pole — skala kadru nie schodzi pod próg wnętrza pól (LOD2, aparatura czytelna bez
 *    ręcznego powiększania: najmniejszy aparat ≥ 9 px); obiekt mieszczący się przy tej skali
 *    stoi w całości w wolnej kanwie (inspektor nie ucina ostatnich pól), większy — od początku
 *    (lewy górny róg w wolnej kanwie), resztę daje przesuw kadru.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { SldCanvasV3, contentBoundingBoxOf, sceneBoxToCameraWorld } from '../SldCanvasV3';
import { boundingBoxOfRect } from '../camera';
import { NAJMNIEJSZY_GABARYT_SYMBOLU, PROG_WNETRZA_SYMBOLU_PX, SKALA_PODLOGI_ROZDZIELNICY } from '../oknoRenderu';
import { obrysRefow, obrysyZaznaczenia } from '../obrysZaznaczenia';
import { prostokatyZakresu, zakresCelu, type CelKadru } from '../zakresKadru';

const here = dirname(fileURLToPath(import.meta.url));
function wczytaj(sciezka: string): EnergyNetworkModel {
  return (JSON.parse(readFileSync(resolve(here, sciezka), 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;
}
const FIKSTURY = [
  { nazwa: 'GPZ dwusekcyjny z 40 stacjami', enm: wczytaj('../../../../../../public/test-fixtures/gpzDwusekcyjny40.enm.json') },
  { nazwa: 'sieć wzorcowa 52 stacji', enm: wczytaj('../../../v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json') },
] as const;
const ZASLONY = [
  { nazwa: 'bez zasłon', insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  { nazwa: 'inspektor', insets: { top: 0, right: 360, bottom: 0, left: 0 } },
  { nazwa: 'inspektor i nawigator', insets: { top: 0, right: 360 + 220, bottom: 0, left: 0 } },
] as const;
const OKNA = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
] as const;
const TOL = 1;

afterEach(() => cleanup());

interface Cel {
  readonly nazwa: string;
  readonly cel: Exclude<CelKadru, 'tor'>;
  readonly ref: string | undefined;
}
function cele(enm: EnergyNetworkModel): readonly Cel[] {
  const bays = enm.bays ?? [];
  const stacja = (enm.substations ?? []).find((s) => s.ref_id.startsWith('stn/'))?.ref_id;
  const poleStacji = bays.find((b) => b.ref_id.startsWith('stn/'))?.ref_id;
  const poleGpz = bays.find((b) => b.ref_id.startsWith('gpz/'))?.ref_id;
  return [
    { nazwa: 'Cały arkusz (GEO-05)', cel: 'siec', ref: undefined },
    { nazwa: 'Dopasuj stację (GEO-06)', cel: 'stacja', ref: stacja },
    { nazwa: 'Dopasuj pole stacji (GEO-08)', cel: 'pole', ref: poleStacji },
    { nazwa: 'Dopasuj pole GPZ (GEO-08)', cel: 'pole', ref: poleGpz },
    // „Dopasuj widok” z zaznaczoną stacją idzie celem „zaznaczenie” (`ZakresKadru.rozdzielnica`).
    { nazwa: 'Dopasuj widok zaznaczonej stacji (GEO-06)', cel: 'zaznaczenie', ref: stacja },
    { nazwa: 'Dopasuj widok zaznaczonego pola (GEO-08)', cel: 'zaznaczenie', ref: poleStacji },
  ];
}

describe('kadr obiektu z wnętrzem pól — jedno źródło (`ZakresKadru.rozdzielnica`) dla każdego celu', () => {
  for (const f of FIKSTURY) {
    it(f.nazwa, () => {
      const scene = buildSceneV3(f.enm);
      const rozdz = (cel: Exclude<CelKadru, 'tor'>, refy: readonly string[]) =>
        (zakresCelu(cel, f.enm, refy, scene) as { readonly zakres?: { readonly rozdzielnica: boolean } }).zakres?.rozdzielnica;
      const stacja = (f.enm.substations ?? []).find((s) => s.ref_id.startsWith('stn/'))!.ref_id;
      const pole = (f.enm.bays ?? []).find((b) => b.ref_id.startsWith('stn/'))!.ref_id;
      const odcinek = (f.enm.branches ?? []).find((b) => !b.ref_id.startsWith('stn/') && !b.ref_id.startsWith('gpz/'));
      expect(odcinek, 'warunek sensu — odcinek poza stacjami').toBeDefined();
      expect(rozdz('siec', [])).toBe(false);
      expect(rozdz('magistrala', [])).toBe(false);
      expect(rozdz('stacja', [stacja])).toBe(true);
      expect(rozdz('pole', [pole])).toBe(true);
      expect(rozdz('zaznaczenie', [stacja]), 'zaznaczona stacja').toBe(true);
      expect(rozdz('zaznaczenie', [pole]), 'zaznaczone pole').toBe(true);
      expect(rozdz('zaznaczenie', [odcinek!.ref_id]), 'zaznaczony odcinek poza stacją').toBe(false);
      expect(rozdz('zaznaczenie', [stacja, odcinek!.ref_id]), 'zaznaczenie mieszane').toBe(false);
    });
  }
});

describe('cel kadru obiektu = obrys zaznaczenia obiektu (jedno źródło, decyzja architekta 2026-11-13)', () => {
  // Iloczyn: fikstura × cel {stacja — każda stacja, pole — każde pole stacji i GPZ, sekcja — sekcja
  // każdego pola}. Stacja i pole: prostokąt celu kadru jest DOKŁADNIE obrysem, który warstwa
  // zaznaczenia rysuje po zaznaczeniu obiektu (ta sama droga co kanwa: rzut z celu „zaznaczenie”).
  // Sekcja (zaznaczenie wskazuje szynę, nie sekcję z polami): prostokąt celu = obrys jej refów
  // rysunku. Odcinki magistral i opisy wychodzące poza obrys nie powiększają celu (defekt e2e
  // 1280×720: stacja węższa od wolnej kanwy kadrowana „od początku”, pole F02 ucięte).
  const naProstokat = (b: { minX: number; minY: number; maxX: number; maxY: number }) => ({
    x: b.minX,
    y: b.minY,
    width: b.maxX - b.minX,
    height: b.maxY - b.minY,
  });
  for (const f of FIKSTURY) {
    it(f.nazwa, () => {
      const scene = buildSceneV3(f.enm);
      const rzut = (ref: string) => {
        const w = zakresCelu('zaznaczenie', f.enm, [ref], scene);
        return w.dostepny ? w.zakres.refy : [];
      };
      const celKadru = (cel: 'stacja' | 'pole' | 'sekcja', ref: string) => {
        const w = zakresCelu(cel, f.enm, [ref], scene);
        expect(w.dostepny, `${cel} ${ref} dostępny`).toBe(true);
        if (!w.dostepny) return null;
        return { zakres: w.zakres, cel: prostokatyZakresu(scene, w.zakres).cel };
      };
      let porownane = 0;
      const stacje = (f.enm.substations ?? []).map((s) => s.ref_id);
      const pola = (f.enm.bays ?? []).map((b) => b.ref_id);
      for (const ref of [...stacje.map((r) => ['stacja', r] as const), ...pola.map((r) => ['pole', r] as const)]) {
        const [cel, r] = ref;
        if (cel === 'stacja' && !zakresCelu('stacja', f.enm, [r], scene).dostepny) continue;
        const k = celKadru(cel, r);
        // Obiekt bez symboli i odcinków na rysunku (odgałęzienia zagnieżdżone GPZ 40 poza
        // rysunkiem — defekt sceny przypięty w `gpzDwusekcyjny40.contract.test.ts`) nie ma obrysu.
        if (obrysRefow(scene, new Set(k!.zakres.refy)) === null) continue;
        const obrys = obrysyZaznaczenia(scene, [r], rzut);
        expect(obrys, `${cel} ${r}: obrys zaznaczenia`).toHaveLength(1);
        expect(naProstokat(k!.cel!), `${cel} ${r}: cel kadru = obrys zaznaczenia`).toEqual(obrys[0]!.rect);
        porownane += 1;
      }
      for (const r of pola) {
        const w = zakresCelu('sekcja', f.enm, [r], scene);
        if (!w.dostepny || obrysRefow(scene, new Set(w.zakres.refy)) === null) continue;
        expect(naProstokat(prostokatyZakresu(scene, w.zakres).cel!), `sekcja pola ${r}`).toEqual(obrysRefow(scene, new Set(w.zakres.refy)));
        porownane += 1;
      }
      expect(porownane, 'warunek sensu — porównano obiekty').toBeGreaterThan(stacje.length);
    });
  }
});

describe('kadry obiektów × zasłony × okno', () => {
  for (const f of FIKSTURY) {
    const scene = buildSceneV3(f.enm);
    for (const c of cele(f.enm)) {
      it(`${f.nazwa} · ${c.nazwa}: warunek sensu — cel istnieje`, () => {
        if (c.cel !== 'siec') expect(c.ref, 'ref celu w fiksturze').toBeDefined();
      });
      for (const z of ZASLONY) {
        for (const okno of OKNA) {
          it(`${f.nazwa} · ${c.nazwa} · ${z.nazwa} · ${okno.width}×${okno.height}`, () => {
            const wynik = zakresCelu(c.cel, f.enm, c.ref ? [c.ref] : [], scene);
            const zakres = (wynik as { readonly zakres?: Parameters<typeof prostokatyZakresu>[1] }).zakres;
            expect(zakres, 'zakres kadru dostępny').toBeDefined();
            const { container } = render(
              <SldCanvasV3 snapshot={f.enm} {...okno} safeInsets={z.insets} zadanieKadru={{ zakres: zakres!, seq: 1 }} />,
            );
            const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
            const skala = Number(svg.getAttribute('data-skala-kamery'));
            const [vx, vy, vw, vh] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
            const naEkran = (b: { minX: number; minY: number; maxX: number; maxY: number }) => ({
              left: ((b.minX - vx) * okno.width) / vw,
              top: ((b.minY - vy) * okno.height) / vh,
              right: ((b.maxX - vx) * okno.width) / vw,
              bottom: ((b.maxY - vy) * okno.height) / vh,
            });
            const wolna = { left: z.insets.left, top: z.insets.top, right: okno.width - z.insets.right, bottom: okno.height - z.insets.bottom };
            if (c.cel === 'siec') {
              const tresc = naEkran(sceneBoxToCameraWorld(contentBoundingBoxOf(scene) ?? boundingBoxOfRect(scene.bbox)));
              // Kadr całej sieci obejmuje treść; doki jej nie zasłaniają.
              expect(tresc.left).toBeGreaterThanOrEqual(wolna.left - TOL);
              expect(tresc.right).toBeLessThanOrEqual(wolna.right + TOL);
              expect(tresc.top).toBeGreaterThanOrEqual(wolna.top - TOL);
              expect(tresc.bottom).toBeLessThanOrEqual(wolna.bottom + TOL);
              return;
            }
            const cel = prostokatyZakresu(scene, zakres!, sceneBoxToCameraWorld).cel!;
            expect(skala, 'kadr obiektu nie schodzi pod próg wnętrza').toBeGreaterThanOrEqual(SKALA_PODLOGI_ROZDZIELNICY - 1e-4);
            expect(svg.getAttribute('data-poziom-szczegolu'), 'aparatura pola rysowana').toBe('LOD2');
            expect(NAJMNIEJSZY_GABARYT_SYMBOLU * skala, 'najmniejszy aparat czytelny').toBeGreaterThanOrEqual(PROG_WNETRZA_SYMBOLU_PX);
            const r = naEkran(cel);
            expect(r.left, 'początek obiektu w wolnej kanwie (x)').toBeGreaterThanOrEqual(wolna.left - TOL);
            expect(r.top, 'początek obiektu w wolnej kanwie (y)').toBeGreaterThanOrEqual(wolna.top - TOL);
            // Kryterium widza, nie kamery: oś, na której obiekt mieści się w WOLNEJ kanwie (bez oddechu
            // kadru), stoi w całości — zasłona nie ucina ostatnich pól nawet wtedy, gdy z oddechem by się
            // nie zmieścił; oś dłuższa od wolnej kanwy — od początku, resztę daje przesuw.
            if (r.right - r.left <= wolna.right - wolna.left + TOL) {
              expect(r.right, 'obiekt w całości — zasłona nie ucina ostatnich pól').toBeLessThanOrEqual(wolna.right + TOL);
            } else {
              expect(r.left, 'obiekt szerszy od wolnej kanwy — od początku').toBeLessThan(wolna.right);
            }
            if (r.bottom - r.top <= wolna.bottom - wolna.top + TOL) {
              expect(r.bottom, 'obiekt w całości nad dokami').toBeLessThanOrEqual(wolna.bottom + TOL);
            }
          }, 120000);
        }
      }
    }
  }
});

/**
 * Zgłoszenie koordynatora 2026-11-13: po ujednoliceniu pól stacje są szersze i „Dopasuj stację”
 * dawał skalę ok. 1,04 — przy dawnej granicy pełnego rysunku 1,2 był to poziom bez bloków
 * zabezpieczeń i oznaczeń Q. Przy granicy LOD2 0,818 (podłoga kadru 0,9) kadr stacji z trzema
 * polami SN z zabezpieczeniami w oknie 1440×900 bez inspektora pokazuje pełny rysunek pól:
 * każdy element adnotacji zabezpieczeń stacji ma węzeł, ramki bloków są narysowane, oznaczenia
 * aparatów (Q…) są na rysunku. Iloczyn: {fikstura} × {stacja z trzema blokami zabezpieczeń}.
 */
describe('kadr stacji 3-polowej 1440×900 bez inspektora — pełny rysunek pól (LOD2)', () => {
  const STACJE = [
    { fikstura: 'GPZ z odpływami (gpzFeeder)', plik: '../../../../../../public/test-fixtures/gpzFeeder.enm.json' },
    { fikstura: 'GPZ dwusekcyjny z 40 stacjami', plik: '../../../../../../public/test-fixtures/gpzDwusekcyjny40.enm.json' },
    { fikstura: 'stacje konstrukcji pól', plik: '../../../../../../public/test-fixtures/stacjeKonstrukcjiPol.enm.json' },
  ] as const;
  const OKNO = { width: 1440, height: 900 } as const;
  for (const { fikstura, plik } of STACJE) {
    const enm = wczytaj(plik);
    const scene = buildSceneV3(enm);
    // Stacje SN z dokładnie trzema blokami zabezpieczeń pól (trzy pola SN z zabezpieczeniem).
    const bloki = new Map<string, number>();
    for (const s of scene.symbols) {
      const ref = s.meta?.ownerRef ?? '';
      if (s.meta?.elementKind === 'protectionAnnotation' && ref.startsWith('stn/') && s.meta.ramkaBlokuPrzekaznika) {
        const st = ref.split('/').slice(0, 2).join('/');
        bloki.set(st, (bloki.get(st) ?? 0) + 1);
      }
    }
    const stacja = [...bloki].find(([, n]) => n === 3)?.[0];
    it(`${fikstura}: warunek sensu — stacja z trzema blokami zabezpieczeń`, () => {
      expect(stacja).toBeDefined();
    });
    if (stacja === undefined) continue;
    const ref = (enm.substations ?? []).find((s) => s.ref_id.startsWith(`${stacja}/`))!.ref_id;
    const wynik = zakresCelu('stacja', enm, [ref], scene) as { readonly zakres?: Parameters<typeof prostokatyZakresu>[1] };
    const cel = prostokatyZakresu(scene, wynik.zakres!, sceneBoxToCameraWorld).cel!;
    // Warianty okna: 1440×900 (w tym drzewie stacja mieści się przy suficie kadru 1,6) oraz okno
    // o szerokości dobranej tak, by kadr dawał skalę 1,04 zmierzoną przez koordynatora po
    // ujednoliceniu pól (stacja szersza) — przy dawnych progach (pełny rysunek od 1,2, podłoga
    // kadru 1,0) ten wariant dawał poziom bez bloków zabezpieczeń.
    const OKNA_STACJI = [
      { nazwa: '1440×900', okno: OKNO },
      { nazwa: 'kadr 1,04 (stacja po ujednoliceniu pól)', okno: { width: Math.round(1.04 * (cel.maxX - cel.minX) + 80), height: OKNO.height } },
    ] as const;
    for (const { nazwa, okno } of OKNA_STACJI) it(`${fikstura} · ${stacja} · ${nazwa}`, () => {
      const { container } = render(<SldCanvasV3 snapshot={enm} {...okno} zadanieKadru={{ zakres: wynik.zakres!, seq: 1 }} />);
      const svg = container.querySelector('[data-testid="sld-canvas-v3"]')!;
      expect(svg.getAttribute('data-poziom-szczegolu'), `skala ${svg.getAttribute('data-skala-kamery')}`).toBe('LOD2');
      const naRysunku = (sel: string) => [...svg.querySelectorAll(`[data-testid="sld-v3-symbols"] ${sel}`)].filter((n) => (n.getAttribute('data-owner-ref') ?? '').startsWith(`${stacja}/`));
      const adnotacjeSceny = scene.symbols.filter((s) => s.meta?.elementKind === 'protectionAnnotation' && (s.meta.ownerRef ?? '').startsWith(`${stacja}/`)).length;
      expect(naRysunku('[data-element-kind="protectionAnnotation"]').length, 'adnotacje zabezpieczeń stacji z węzłem').toBe(adnotacjeSceny);
      expect(svg.querySelectorAll('[data-przekaznik="ramka-bloku"]').length, 'ramki bloków zabezpieczeń').toBeGreaterThanOrEqual(3);
      const oznaczenia = [...svg.querySelectorAll('[data-testid="sld-v3-labels"] [data-owner-kind="apparatus"]')]
        .filter((g) => (g.getAttribute('data-owner-ref') ?? '').startsWith(`${stacja}/`))
        .map((g) => g.textContent ?? '');
      expect(oznaczenia.some((t) => /^Q\d/.test(t)), `oznaczenia Q na rysunku (${oznaczenia.slice(0, 6).join(', ')})`).toBe(true);
    }, 120000);
  }
});
