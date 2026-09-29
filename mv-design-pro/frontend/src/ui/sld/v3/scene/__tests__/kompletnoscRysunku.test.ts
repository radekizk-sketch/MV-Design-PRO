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
    .map((plik) => [`${katalog}/${plik}`, wczytaj(resolve(FRONTEND, katalog, plik))] as const)
    .filter((para): para is readonly [string, EnergyNetworkModel] => para[1] != null),
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
