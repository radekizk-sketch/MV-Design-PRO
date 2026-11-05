/**
 * Karta PRZEGLAD-SIECI-JEDNA-KOMPOZYCJA — test jako ILOCZYN CECH.
 *
 * Cechy, w których defekt przeglądu mógłby się schować (każda kombinacja jest
 * sprawdzana, a nie przykład z karty):
 *  · liczba pól liniowych GPZ: 1 / 2 / 4 (z odejściem i bez),
 *  · liczba sekcji szyn GPZ: 1 / 2,
 *  · magistrala: 0 / 1 / N stacji, odgałęzienie,
 *  · instalacje DER na SN: PV / BESS (wstrzyknięte w sieć referencyjną),
 *  · duża sieć referencyjna (53 stacje),
 *  · poziom szczegółu: L0 / L1 / L2.
 * Motyw (jasny/ciemny) nie wchodzi do sceny — scena jest motywu-niezależna z
 * konstrukcji (kolory nadaje warstwa renderu); oba motywy ćwiczy spec e2e
 * `e2e/przeglad-sieci-zrzuty-screenshot.spec.ts` na żywej aplikacji.
 *
 * Wyrocznie (a)–(f) mają iniekcje: każda dostaje scenę zepsutą dokładnie tym
 * defektem, który ma łapać, i musi go zgłosić (czerwony bez naprawy).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  computeInitialCameraState,
  DEFAULT_LOD_THRESHOLDS,
  lodThresholdsForMinApparatus,
} from '../../canvas/camera';
import { SLD_CANVAS_DOCK_INSETS } from '../../canvas/toolbarLayout';
import { MIN_SYMBOL_SCREEN_PX, SYMBOL_DEFS } from '../../symbols/defs';
import { buildSceneV3, OPEN_TERMINAL_LABEL_TEXT, type SceneLod, type SceneV3 } from '../buildScene';
import {
  magistralaPrzyRamieGaps,
  najmniejszyAparatCiaglosci,
  nazwyBezWielokropkaGaps,
  pozycjeKompozycjiGaps,
  przegladSceneGaps,
  ramaStrefyGpzGaps,
  rowneZejsciaGaps,
  zakonczeniaTorowGaps,
} from '../przegladKompozycja';
import { buildDerSnFixture } from './fixtures/w2cDerSnFixtures';

const here = dirname(fileURLToPath(import.meta.url));

function wczytaj(sciezka: string): EnergyNetworkModel {
  const raw = JSON.parse(readFileSync(sciezka, 'utf8')) as { readonly enm?: EnergyNetworkModel } & EnergyNetworkModel;
  return raw.enm ?? raw;
}

const PRZEGLADY = [
  'przegladGpz1s1p0st',
  'przegladGpz1s2p1st',
  'przegladGpz1s4p1st',
  'przegladGpz2s2p0st',
  'przegladGpz2s2p3stOdg',
] as const;

const FIKSTURY: Readonly<Record<string, () => EnergyNetworkModel>> = {
  ...Object.fromEntries(PRZEGLADY.map((n) => [n, () => wczytaj(resolve(here, 'fixtures', `${n}.enm.json`))])),
  sldSubstrate52s: () =>
    wczytaj(resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json')),
  derPv: () => buildDerSnFixture([{ technology: 'PV' }]).enm,
  derBess: () => buildDerSnFixture([{ technology: 'BESS' }]).enm,
};

const LODS: readonly SceneLod[] = [0, 1, 2];
const sceny = new Map<string, Readonly<Record<SceneLod, SceneV3>>>();
function scenyFikstury(nazwa: string): Readonly<Record<SceneLod, SceneV3>> {
  const gotowe = sceny.get(nazwa);
  if (gotowe) return gotowe;
  const enm = FIKSTURY[nazwa]();
  const wynik = { 0: buildSceneV3(enm, 0), 1: buildSceneV3(enm, 1), 2: buildSceneV3(enm, 2) };
  sceny.set(nazwa, wynik);
  return wynik;
}

/** Liczba pól liniowych GPZ w scenie (zejścia pól GPZ). */
function polaGpz(scene: SceneV3): number {
  return scene.segments.filter((s) => /^gpz\/[^/]+\/bay\/.*#descent$/.test(s.meta?.ownerRef ?? '')).length;
}

describe('przegląd sieci — jedna kompozycja: iloczyn fikstura × LOD', () => {
  for (const nazwa of Object.keys(FIKSTURY)) {
    it(`${nazwa}: (a) pozycje pól i aparatów ciągłości identyczne na L0/L1/L2`, () => {
      expect(pozycjeKompozycjiGaps(scenyFikstury(nazwa))).toEqual([]);
    });
    for (const lod of LODS) {
      it(`${nazwa} L${lod}: brak bloków zwiniętych, wyrocznie (b)–(e) czyste`, () => {
        const scena = scenyFikstury(nazwa)[lod];
        expect(scena.symbols.some((s) => (s.symbolId as string).endsWith('Collapsed'))).toBe(false);
        expect(przegladSceneGaps(scena)).toEqual([]);
      });
    }
  }

  it('fikstury pokrywają zadeklarowane cechy (pola GPZ 1/2/4, sekcje 1/2, stacje 0/1/N, odgałęzienie)', () => {
    const p = (n: string) => scenyFikstury(n)[2];
    expect(polaGpz(p('przegladGpz1s1p0st'))).toBe(1);
    expect(polaGpz(p('przegladGpz1s2p1st'))).toBe(2);
    expect(polaGpz(p('przegladGpz1s4p1st'))).toBe(4);
    expect(p('przegladGpz2s2p0st').meta.sections.length).toBe(2);
    expect(p('przegladGpz1s1p0st').meta.stationCount).toBe(0);
    expect(p('przegladGpz1s2p1st').meta.stationCount).toBe(1);
    expect(p('przegladGpz2s2p3stOdg').meta.stationCount).toBeGreaterThanOrEqual(4);
    for (const der of ['derPv', 'derBess']) {
      expect(p(der).symbols.some((s) => s.symbolId.startsWith('der'))).toBe(true);
      // DER na każdym LOD (dawny blok zwinięty chował go na L0).
      expect(scenyFikstury(der)[0].symbols.some((s) => s.symbolId.startsWith('der'))).toBe(true);
    }
  });

  it('L0 zdejmuje wyłącznie szczegół: podpisy aparatów i ról pól są od L1, nazwy stacji/GPZ na każdym LOD', () => {
    const s = scenyFikstury('przegladGpz1s4p1st');
    const rodzaje = (lod: SceneLod) => new Set(s[lod].labels.map((l) => l.ownerKind));
    expect(rodzaje(0).has('apparatus')).toBe(false);
    expect(rodzaje(0).has('field-role')).toBe(false);
    expect(rodzaje(1).has('field-role')).toBe(true);
    for (const lod of LODS) {
      expect(s[lod].labels.some((l) => l.ownerKind === 'station-name' && l.ownerRef.endsWith('/substation#name-row-0'))).toBe(true);
      expect(s[lod].labels.some((l) => l.ownerKind === 'station-name' && l.ownerRef.endsWith('/station#name-row-0'))).toBe(true);
    }
  });

  it('(d) bieg bez stacji odbiorczej: słupek na każdym LOD, podpis braku modelu od L1', () => {
    const s = scenyFikstury('przegladGpz1s1p0st');
    for (const lod of LODS) {
      expect(s[lod].segments.some((g) => g.meta?.kind === 'openTerminal')).toBe(true);
      const podpis = s[lod].labels.find((l) => l.text === OPEN_TERMINAL_LABEL_TEXT);
      if (lod === 0) expect(podpis).toBeUndefined();
      else expect(podpis?.ownerKind).toBe('segment-endpoint');
    }
  });
});

/** (f) Kadr po dopasowaniu: treść zajmuje ≥ 60 % mniejszego wymiaru kanwy, a
 *  mały model (≤ 20 pól) startuje na L1/L2 dzięki progom z gabarytu aparatu. */
describe('przegląd sieci — (f) kadr po dopasowaniu i progi LOD z gabarytu aparatu', () => {
  const KANWA = { width: 1322, height: 856 };

  function obwiedniaTresci(scene: SceneV3) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const dodaj = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const s of scene.symbols) {
      const d = SYMBOL_DEFS[s.symbolId];
      dodaj(s.x, s.y);
      dodaj(s.x + d.width, s.y + d.height);
    }
    for (const g of scene.segments) for (const p of g.points) dodaj(p.x, p.y);
    return { minX, minY, maxX, maxY };
  }

  function kadr(scene: SceneV3) {
    const bbox = obwiedniaTresci(scene);
    const aparat = najmniejszyAparatCiaglosci(scene);
    const progi = lodThresholdsForMinApparatus(aparat, MIN_SYMBOL_SCREEN_PX);
    const stan = computeInitialCameraState(bbox, KANWA, undefined, null, SLD_CANVAS_DOCK_INSETS, progi);
    const s = stan.transform.scale;
    const udzial = Math.max((bbox.maxX - bbox.minX) * s, (bbox.maxY - bbox.minY) * s) / Math.min(KANWA.width, KANWA.height);
    return { udzial, lod: stan.lod, aparatNaEkranie: (aparat ?? 16) * s };
  }

  // Oczekiwany poziom startu wynika z ROZMIARU aparatu na ekranie, nie z nazwy
  // fikstury: mały model (GPZ + ≤ 1 stacja) startuje na L1/L2; model z pięcioma
  // stacjami w dwóch wierszach arkusza ma przy dopasowaniu aparat 16 j.św. poniżej
  // `MIN_SYMBOL_SCREEN_PX` i uczciwie startuje na L0 (ta sama kompozycja).
  const OCZEKIWANY_START: Readonly<Record<(typeof PRZEGLADY)[number], 'L0' | 'L1+'>> = {
    przegladGpz1s1p0st: 'L1+',
    przegladGpz1s2p1st: 'L1+',
    przegladGpz1s4p1st: 'L1+',
    przegladGpz2s2p0st: 'L1+',
    przegladGpz2s2p3stOdg: 'L0',
  };

  for (const nazwa of PRZEGLADY) {
    it(`${nazwa}: treść ≥ 60 % mniejszego wymiaru kanwy, poziom startu z rozmiaru aparatu na ekranie`, () => {
      const scena = scenyFikstury(nazwa)[2];
      expect(polaGpz(scena)).toBeLessThanOrEqual(20);
      const { udzial, lod, aparatNaEkranie } = kadr(scena);
      expect(udzial).toBeGreaterThanOrEqual(0.6);
      if (OCZEKIWANY_START[nazwa] === 'L1+') {
        expect(lod).toBeGreaterThanOrEqual(1);
        expect(aparatNaEkranie).toBeGreaterThanOrEqual(MIN_SYMBOL_SCREEN_PX);
      } else {
        expect(lod).toBe(0);
        expect(aparatNaEkranie).toBeLessThan(MIN_SYMBOL_SCREEN_PX / 0.85);
      }
    });
  }

  it('próg l0Max z gabarytu: 16 j.św. → 0,6 (domyślny), kafel 48 j.św. → 0,2, brak aparatu → domyślny, nigdy ponad l1Max', () => {
    expect(lodThresholdsForMinApparatus(16, MIN_SYMBOL_SCREEN_PX)).toBe(DEFAULT_LOD_THRESHOLDS);
    expect(lodThresholdsForMinApparatus(48, MIN_SYMBOL_SCREEN_PX).l0Max).toBe(0.2);
    expect(lodThresholdsForMinApparatus(null, MIN_SYMBOL_SCREEN_PX)).toBe(DEFAULT_LOD_THRESHOLDS);
    expect(lodThresholdsForMinApparatus(2, MIN_SYMBOL_SCREEN_PX).l0Max).toBe(DEFAULT_LOD_THRESHOLDS.l1Max);
    // Brama progu: na wyjściu L1→L0 najmniejszy aparat ma ≥ MIN_SYMBOL_SCREEN_PX.
    for (const gabaryt of [16, 24, 32, 48]) {
      const { l0Max } = lodThresholdsForMinApparatus(gabaryt, MIN_SYMBOL_SCREEN_PX);
      expect(gabaryt * l0Max * 0.85).toBeGreaterThanOrEqual(MIN_SYMBOL_SCREEN_PX - 1e-9);
    }
  });
});

describe('przegląd sieci — iniekcje (każda wyrocznia łapie swój defekt)', () => {
  const baza = () => scenyFikstury('przegladGpz1s4p1st');

  it('(a) przesunięty aparat na L0 → luka', () => {
    const s = baza();
    const i = s[0].symbols.findIndex((x) => x.symbolId === 'breaker');
    const zepsuta = { ...s[0], symbols: s[0].symbols.map((x, k) => (k === i ? { ...x, x: x.x + 8 } : x)) };
    expect(pozycjeKompozycjiGaps({ 0: zepsuta, 1: s[1], 2: s[2] }).length).toBeGreaterThan(0);
  });

  it('(a) brak kompozycji na L0 (dawny blok zwinięty) → luka', () => {
    const s = baza();
    const zepsuta = { ...s[0], symbols: s[0].symbols.filter((x) => !(x.meta?.ownerRef ?? '').startsWith('gpz/')) };
    expect(pozycjeKompozycjiGaps({ 0: zepsuta, 1: s[1], 2: s[2] }).length).toBeGreaterThan(0);
  });

  it('(b) wydłużone zejście jednego pola → luka', () => {
    const s = baza()[2];
    const i = s.segments.findIndex((g) => (g.meta?.ownerRef ?? '').endsWith('#descent'));
    const zepsuta = {
      ...s,
      segments: s.segments.map((g, k) =>
        k === i ? { ...g, points: [g.points[0], { x: g.points[1].x, y: g.points[1].y + 16 }] } : g,
      ),
    };
    expect(rowneZejsciaGaps(zepsuta).length).toBeGreaterThan(0);
  });

  it('(c) rama strefy wielokrotnie większa od treści (obraz sprzed karty) → luka', () => {
    const s = baza()[0];
    const rama = s.meta.gpzZone!;
    const zepsuta = { ...s, meta: { ...s.meta, gpzZone: { ...rama, width: rama.width * 3 } } };
    expect(ramaStrefyGpzGaps(zepsuta).length).toBeGreaterThan(0);
  });

  it('(c) treść poza ramą → luka', () => {
    const s = baza()[0];
    const rama = s.meta.gpzZone!;
    const zepsuta = { ...s, meta: { ...s.meta, gpzZone: { ...rama, height: rama.height / 2 } } };
    expect(ramaStrefyGpzGaps(zepsuta).length).toBeGreaterThan(0);
  });

  it('(c) magistrala biegnąca krawędzią ramy → luka', () => {
    const s = scenyFikstury('przegladGpz1s1p0st')[0];
    const rama = s.meta.gpzZone!;
    const yRamy = rama.y + rama.height + 8;
    const zepsuta = {
      ...s,
      segments: s.segments.map((g) =>
        g.meta?.kind === 'snTrunk' ? { ...g, points: g.points.map((p, k) => (k === 0 ? p : { x: p.x, y: yRamy })) } : g,
      ),
    };
    expect(magistralaPrzyRamieGaps(zepsuta).length).toBeGreaterThan(0);
  });

  it('(d) zdjęty słupek końca → luka; zdjęty podpis braku stacji na L1 → luka', () => {
    const s = scenyFikstury('przegladGpz1s1p0st');
    const bezSlupka = { ...s[1], segments: s[1].segments.filter((g) => g.meta?.kind !== 'openTerminal') };
    expect(zakonczeniaTorowGaps(bezSlupka).length).toBeGreaterThan(0);
    const bezPodpisu = { ...s[1], labels: s[1].labels.filter((l) => l.text !== OPEN_TERMINAL_LABEL_TEXT) };
    expect(zakonczeniaTorowGaps(bezPodpisu).length).toBeGreaterThan(0);
  });

  it('(e) wielokropek w nazwie → luka; nazwa szersza od rezerwacji → luka', () => {
    const s = baza()[0];
    const i = s.labels.findIndex((l) => l.ownerRef.endsWith('/substation#name-row-0'));
    const zWielokropkiem = { ...s, labels: s.labels.map((l, k) => (k === i ? { ...l, text: 'G…1' } : l)) };
    expect(nazwyBezWielokropkaGaps(zWielokropkiem).length).toBeGreaterThan(0);
    const za_waska = {
      ...s,
      labels: s.labels.map((l, k) => (k === i ? { ...l, rezerwacjaSzerokosci: 4 } : l)),
    };
    expect(nazwyBezWielokropkaGaps(za_waska).length).toBeGreaterThan(0);
  });
});
