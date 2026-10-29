/**
 * Karta SLD-SUBSTRAT (kontynuacja) — REGUŁA KOMPLETNOŚCI RYSUNKU i macierz elementów
 * ciągu.
 *
 * (1) Liczba elementów modelu = narysowane + jawnie zwinięte (`kompletnoscRysunku`),
 *     na KAŻDEJ fiksturze modelu ENM kontraktów SLD (sceny, kanwa, `public`,
 *     substrat 52 stacji) i na każdym LOD — kategoria `niewyjasniony` musi być pusta.
 * (2) ILOCZYN CECH elementów stojących na ciągu głównym: rodzaj {ZKSN, słup
 *     rozgałęźny, łącznik sekcyjny, węzeł nazwany, mufa} × położenie {za GPZ, między
 *     stacjami, za ostatnią stacją} × LOD {0, 1, 2}. Wyrocznia: element ma PRYMITYW
 *     (`narysowany`), a mufa — deklarację modelu `render_on_sld: false`; punkt
 *     odgałęźny ma też narysowaną stację klienta za sobą.
 * (3) Iniekcje: usunięcie prymitywu łącznika / punktu ze sceny MUSI dać pozycję
 *     `niewyjasniony` (wyrocznia gryzie).
 *
 * Fikstury z generatora backendu (`tests/reference_networks/fikstury_enm_sld.py`,
 * `sld_substrate_fixtures.py`), zbudowane ścieżką produktu (API w procesie).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, branchPointCoverageGaps, type SceneV3 } from '../buildScene';
import { kompletnoscRysunku } from '../kompletnoscRysunku';

const here = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(here, '../../../../../..');
const KATALOGI = [
  'src/ui/sld/v3/scene/__tests__/fixtures',
  'src/ui/sld/v3/canvas/__tests__/fixtures',
  'src/ui/sld/v2/geometry/__tests__/fixtures',
  'public/test-fixtures',
];

function wczytaj(sciezka: string): EnergyNetworkModel | null {
  const raw = JSON.parse(readFileSync(sciezka, 'utf8')) as { enm?: EnergyNetworkModel } & EnergyNetworkModel;
  const enm = raw.enm ?? raw;
  return Array.isArray(enm.buses) ? enm : null;
}

const FIKSTURY: readonly (readonly [string, EnergyNetworkModel])[] = KATALOGI.flatMap((katalog) =>
  readdirSync(resolve(FRONTEND, katalog))
    .filter((plik) => plik.endsWith('.enm.json'))
    .sort()
    .flatMap((plik): (readonly [string, EnergyNetworkModel])[] => {
      const enm = wczytaj(resolve(FRONTEND, katalog, plik));
      return enm == null ? [] : [[`${katalog}/${plik}`, enm] as const];
    }),
);

const LODY = [0, 1, 2] as const;

describe('reguła kompletności rysunku — każda fikstura modelu ENM × LOD', () => {
  it('kontrola wejścia: zbiór fikstur obejmuje sceny, kanwę, substrat i macierz elementów ciągu', () => {
    const nazwy = FIKSTURY.map(([n]) => n);
    expect(nazwy.some((n) => n.endsWith('sldSubstrate52s.enm.json'))).toBe(true);
    expect(nazwy.filter((n) => n.includes('elementyCiagu-'))).toHaveLength(4);
    expect(FIKSTURY.length).toBeGreaterThanOrEqual(25);
  });

  for (const [nazwa, enm] of FIKSTURY) {
    for (const lod of LODY) {
      it(`${nazwa} @ L${lod}: liczba elementów = narysowane + jawnie zwinięte (zero niewyjaśnionych)`, () => {
        const raport = kompletnoscRysunku(buildSceneV3(enm, lod), enm);
        expect(raport.niewyjasnione).toEqual([]);
        const suma = Object.values(raport.liczniki).reduce((a, b) => a + b, 0);
        expect(suma).toBe(raport.pozycje.length);
      });
    }
  }
});

const RODZAJE = ['zksn', 'slup', 'lacznik', 'wezel'] as const;
const POLOZENIA = ['za GPZ', 'między stacjami', 'za ostatnią stacją'] as const;

function macierz(rodzaj: (typeof RODZAJE)[number]): EnergyNetworkModel {
  return wczytaj(resolve(FRONTEND, `src/ui/sld/v3/scene/__tests__/fixtures/elementyCiagu-${rodzaj}.enm.json`))!;
}

/** Ref elementu danego rodzaju w danym położeniu — po NAZWIE nadanej w generatorze. */
function elementW(enm: EnergyNetworkModel, rodzaj: (typeof RODZAJE)[number], polozenie: string): string {
  if (rodzaj === 'zksn' || rodzaj === 'slup') {
    return (enm.branch_points ?? []).find((bp) => bp.name.endsWith(polozenie))!.ref_id;
  }
  if (rodzaj === 'lacznik') {
    return (enm.branches ?? []).find((g) => g.name === `Łącznik sekcyjny ${polozenie}`)!.ref_id;
  }
  const indeks = { 'za GPZ': 0, 'między stacjami': 2, 'za ostatnią stacją': 4 }[polozenie]!;
  return (enm.buses ?? []).find((b) => b.name === `Węzeł ${indeks}`)!.ref_id;
}

describe('macierz elementów ciągu: rodzaj × położenie × LOD — element ma prymityw na kanwie', () => {
  for (const rodzaj of RODZAJE) {
    const enm = macierz(rodzaj);
    for (const polozenie of POLOZENIA) {
      for (const lod of LODY) {
        it(`${rodzaj} ${polozenie} @ L${lod}`, () => {
          const scena = buildSceneV3(enm, lod);
          const ref = elementW(enm, rodzaj, polozenie);
          const raport = kompletnoscRysunku(scena, enm);
          expect(raport.pozycje.find((p) => p.ref === ref)?.kategoria).toBe('narysowany');
          expect(raport.niewyjasnione).toEqual([]);
          if (rodzaj === 'zksn' || rodzaj === 'slup') {
            // Stacja klienta za punktem — narysowana (wyrocznia pokrycia punktów).
            expect(branchPointCoverageGaps(scena, enm)).toEqual([]);
            const klient = (enm.substations ?? []).find((s) => s.name === `Stacja klienta ${polozenie}`)!;
            expect(scena.meta.drawnStationIds).toContain(klient.ref_id);
          }
        });
      }
    }
  }

  it('mufa (INLINE_TERMINAL) na każdym połączeniu odcinków: jawne zwinięcie z deklaracji modelu, na każdym LOD', () => {
    const enm = macierz('wezel');
    const mufy = (enm.buses ?? []).filter((b) => (b.meta as { visual_role?: string } | undefined)?.visual_role === 'INLINE_TERMINAL');
    expect(mufy.length).toBeGreaterThan(0);
    for (const lod of LODY) {
      const raport = kompletnoscRysunku(buildSceneV3(enm, lod), enm);
      for (const mufa of mufy) {
        expect(raport.pozycje.find((p) => p.ref === mufa.ref_id)?.kategoria).toBe('deklaracja-modelu');
      }
    }
  });

  it('łącznik sekcyjny otwarty rysuje się jako otwarty (stan z modelu, nie domyślny)', () => {
    const enm = macierz('lacznik');
    const ref = elementW(enm, 'lacznik', 'między stacjami');
    const otwarty: EnergyNetworkModel = {
      ...enm,
      branches: (enm.branches ?? []).map((g) => (g.ref_id === ref ? { ...g, status: 'open' as const } : g)),
    };
    for (const lod of LODY) {
      const symbol = buildSceneV3(otwarty, lod).symbols.find((s) => s.meta?.ownerRef === ref);
      expect(symbol?.state).toBe('open');
      expect(['lineSwitch', 'disconnector']).toContain(symbol?.symbolId);
    }
  });
});

describe('iniekcje: wyrocznia kompletności gryzie', () => {
  const bezPrymitywu = (scena: SceneV3, ref: string): SceneV3 => ({
    ...scena,
    symbols: scena.symbols.filter((s) => s.meta?.ownerRef !== ref),
    labels: scena.labels.filter((l) => !l.ownerRef.startsWith(ref)),
    meta: { ...scena.meta, drawnBranchPointRefs: scena.meta.drawnBranchPointRefs.filter((r) => r !== ref) },
  });

  it('łącznik sekcyjny bez symbolu ⇒ niewyjaśniony', () => {
    const enm = macierz('lacznik');
    const ref = elementW(enm, 'lacznik', 'za GPZ');
    const raport = kompletnoscRysunku(bezPrymitywu(buildSceneV3(enm, 2), ref), enm);
    expect(raport.niewyjasnione.map((p) => p.ref)).toContain(ref);
  });

  it('ZKSN za GPZ bez symbolu ⇒ niewyjaśniony (a jego wnętrze przestaje być „wnętrzem narysowanego punktu")', () => {
    const enm = macierz('zksn');
    const ref = elementW(enm, 'zksn', 'za GPZ');
    const raport = kompletnoscRysunku(bezPrymitywu(buildSceneV3(enm, 2), ref), enm);
    expect(raport.niewyjasnione.map((p) => p.ref)).toContain(ref);
  });
});

describe('stacja z pomiarem z szablonu 1000 kVA za ZKSN zaraz za GPZ (znalezisko integratora)', () => {
  // Sieć z generatora (`_stacja_pomiar_1000`): szablon wstawia ZKSN na odcinek, a stację
  // w odgałęzieniu za nim — poprzednikiem punktu na ciągu jest GPZ. Przed naprawą kanwa
  // gubiła punkt RAZEM ze stacją na każdym LOD.
  const enm = wczytaj(resolve(FRONTEND, 'src/ui/sld/v3/scene/__tests__/fixtures/stacjaPomiar1000.enm.json'))!;
  for (const lod of LODY) {
    it(`L${lod}: ZKSN i stacja z pomiarem narysowane, zero niewyjaśnionych`, () => {
      const scena = buildSceneV3(enm, lod);
      const punkty = enm.branch_points ?? [];
      expect(punkty.length).toBe(1);
      expect(scena.meta.drawnBranchPointRefs).toContain(punkty[0].ref_id);
      const stacje = (enm.substations ?? []).filter((s) => s.station_type !== 'gpz');
      expect(stacje.length).toBeGreaterThan(0);
      for (const stacja of stacje) expect(scena.meta.drawnStationIds).toContain(stacja.ref_id);
      expect(branchPointCoverageGaps(scena, enm)).toEqual([]);
      expect(kompletnoscRysunku(scena, enm).niewyjasnione).toEqual([]);
    });
  }
});

describe('sprzęgło sekcji GPZ na L0 — wnętrze bloku stacji (karta UX-04/POLE-BKR-MODEL)', () => {
  // Fikstura generatora z GPZ o dwóch sekcjach SN i sprzęgłem jako gałęzią. Na L0 GPZ jest
  // symbolem zbiorczym (`composeCollapsedGpz`) — sprzęgło jest wnętrzem bloku; na L1/L2 ma
  // prymityw. ILOCZYN: końce gałęzi {ta sama narysowana stacja, dwie stacje, jeden koniec poza
  // stacją} × LOD {0, 1, 2} × prymityw {jest, usunięty}.
  const enm = wczytaj(resolve(FRONTEND, 'public/test-fixtures/gpz110kvBkr.enm.json'))!;
  const gpz = (enm.substations ?? []).find((s) => s.station_type === 'gpz')!;
  const szynyGpz = new Set(gpz.bus_refs ?? []);
  const sprzeglo = (enm.branches ?? []).find(
    (g) => g.ref_id.includes('/coupler/') && 'from_bus_ref' in g && szynyGpz.has(g.from_bus_ref) && szynyGpz.has(g.to_bus_ref),
  )!;
  const bezPrymitywuGalezi = (scena: SceneV3, ref: string): SceneV3 => ({
    ...scena,
    symbols: scena.symbols.filter((s) => (s.meta?.ownerRef ?? '').split('#')[0] !== ref),
    segments: scena.segments.filter((s) => (s.meta?.ownerRef ?? '').split('#')[0] !== ref),
    labels: scena.labels.filter((l) => l.ownerRef.split('#')[0] !== ref),
  });

  it('kontrola wejścia: GPZ ma sprzęgło między swoimi szynami', () => {
    expect(sprzeglo).toBeDefined();
  });

  for (const lod of LODY) {
    it(`L${lod}: sprzęgło ${lod === 0 ? 'wnętrzem bloku GPZ' : 'narysowane'}; bez prymitywu na L1/L2 — niewyjaśnione`, () => {
      const scena = buildSceneV3(enm, lod);
      const kategoria = kompletnoscRysunku(scena, enm).pozycje.find((p) => p.ref === sprzeglo.ref_id)?.kategoria;
      expect(kategoria).toBe(lod === 0 ? 'blok-stacji' : 'narysowany');
      const bez = kompletnoscRysunku(bezPrymitywuGalezi(scena, sprzeglo.ref_id), enm);
      expect(bez.pozycje.find((p) => p.ref === sprzeglo.ref_id)?.kategoria).toBe(
        lod === 0 ? 'blok-stacji' : 'niewyjasniony',
      );
    });
  }

  // Predykat parami: wnętrze bloku = OBA końce na szynach JEDNEJ narysowanej stacji.
  const syntetyczny = (koniecB: 'ta sama stacja' | 'druga stacja' | 'poza stacją', lod: 0 | 1 | 2) => {
    const snapshot = {
      buses: ['s1/a', 's1/b', 's2/a', 'wolna'].map((ref_id) => ({ ref_id, name: ref_id, voltage_kv: 15 })),
      substations: [
        { ref_id: 's1', name: 's1', station_type: 'mv_lv', bus_refs: ['s1/a', 's1/b'], transformer_refs: [] },
        { ref_id: 's2', name: 's2', station_type: 'mv_lv', bus_refs: ['s2/a'], transformer_refs: [] },
      ],
      branches: [
        {
          ref_id: 'g',
          name: 'g',
          type: 'bus_coupler',
          from_bus_ref: 's1/a',
          to_bus_ref: { 'ta sama stacja': 's1/b', 'druga stacja': 's2/a', 'poza stacją': 'wolna' }[koniecB],
        },
      ],
    } as unknown as EnergyNetworkModel;
    const scena = {
      symbols: [],
      segments: [],
      labels: [],
      meta: { lod, sources: [], drawnStationIds: ['s1', 's2'], drawnBranchPointRefs: [] },
    } as unknown as SceneV3;
    return kompletnoscRysunku(scena, snapshot).pozycje.find((p) => p.ref === 'g')?.kategoria;
  };
  for (const koniecB of ['ta sama stacja', 'druga stacja', 'poza stacją'] as const) {
    for (const lod of LODY) {
      it(`gałąź bez prymitywu: drugi koniec ${koniecB} @ L${lod}`, () => {
        expect(syntetyczny(koniecB, lod)).toBe(lod === 0 && koniecB === 'ta sama stacja' ? 'blok-stacji' : 'niewyjasniony');
      });
    }
  }
});
