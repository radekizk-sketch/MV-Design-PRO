/**
 * KARTA S9-10 — PIN NIEZMIENNIKA „JEDNA KOTWICA X STACJI MIĘDZY LOD"
 * (zlecony pomiar „X-drift pól L1/L2 (48 px)").
 *
 * CO POMIAR USTALIŁ (sieć referencyjna 53 stacje, histogram dx per symbol):
 *  - KOTWICA LEWA stacji (min X aparatów jej pól sn_field) jest IDENTYCZNA
 *    na L1 i L2 dla WSZYSTKICH 53 stacji (0 driftu);
 *  - pola WEWNĘTRZNE (001, 002, …) przesuwają się między L1 i L2 o 24–224 px
 *    świata (w tym zgłoszone 48 px: pole 002 stacji 4-polowych) — to skutek
 *    ŚWIADOMIE różnych kompozycji pól per LOD (L2 rysuje pełny stos aparatury,
 *    więc pola są szersze; szerokość pochodzi z `bayApparatusPlanFootprint`,
 *    nie ze stałej), a nie innej kotwicy kolumny ani błędnej stałej;
 *  - blok L0 (glif stacji) stoi w odstępie od kotwicy L1 zależnym od
 *    SZEROKOŚCI kolumny stacji (zmierzone wartości 240–344 px świata) — glif
 *    jest osadzony w kolumnie, a kolumna ma szerokość z treści; niezmiennikiem
 *    między L0 a L1 jest PORZĄDEK stacji w osi X (stacja nie zmienia kolumny
 *    przy zoomie), nie liczbowy odstęp.
 *
 * DECYZJA: ujednolicenie podziałki pól między LOD wymagałoby albo rezerwowania
 * na L1 szerokości L2 (poszerzenie arkusza wbrew S9-1/S9-7-8), albo ściskania
 * L2 do podziałki L1 (nachodzenie aparatów) — to rozstrzygnięcie PRODUKTOWE
 * o kompozycji poziomów szczegółu, poza zakresem karty wykonawczej (zapis w
 * rejestrze S9-10). Ten test PRZYPINA niezmiennik, który JEST prawdą geometrii
 * (kotwica), żeby realny drift kotwicy nie mógł wejść niezauważony.
 *
 * Iloczyn cech (reguła KLASA pkt 2): {LOD 0/1/2} × {liczba pól stacji 3 i 4}
 * × {stacja na magistrali / na odgałęzieniu}.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const sceny: Readonly<Record<SceneLod, SceneV3>> = {
  0: buildSceneV3(enm, 0),
  1: buildSceneV3(enm, 1),
  2: buildSceneV3(enm, 2),
};

/** Kotwica lewa stacji na L1/L2 = min X aparatów jej pól sn_field. */
function kotwicePol(scene: SceneV3): ReadonlyMap<string, number> {
  const kotwice = new Map<string, number>();
  for (const s of scene.symbols) {
    const m = (s.meta?.ownerRef ?? '').match(/^(stn\/[^/]+)\/sn_field\//);
    if (!m) continue;
    const cur = kotwice.get(m[1]);
    if (cur === undefined || s.x < cur) kotwice.set(m[1], s.x);
  }
  return kotwice;
}

/** Liczba pól sn_field stacji na danej scenie. */
function liczbaPol(scene: SceneV3): ReadonlyMap<string, number> {
  const pola = new Map<string, Set<string>>();
  for (const s of scene.symbols) {
    const m = (s.meta?.ownerRef ?? '').match(/^(stn\/[^/]+)\/(sn_field\/\d+)/);
    if (!m) continue;
    const zbior = pola.get(m[1]) ?? new Set<string>();
    zbior.add(m[2]);
    pola.set(m[1], zbior);
  }
  return new Map([...pola.entries()].map(([ref, zbior]) => [ref, zbior.size]));
}

describe('S9-10 — kotwica X stacji jest JEDNĄ prawdą między LOD', () => {
  it('L1 ↔ L2: kotwica lewa KAŻDEJ stacji identyczna (iloczyn: liczba pól × magistrala/odgałęzienie)', () => {
    const l1 = kotwicePol(sceny[1]);
    const l2 = kotwicePol(sceny[2]);
    expect(l1.size, 'fixtura ma stacje z polami').toBeGreaterThan(50);
    expect(l2.size).toBe(l1.size);

    const naMagistrali = new Set(sceny[1].meta.mainTrunkStationIds.map((id) => id.replace(/\/station$/, '')));
    const cechy = { pol3: 0, pol4: 0, magistrala: 0, odgalezienie: 0 };
    const polaL1 = liczbaPol(sceny[1]);
    for (const [ref, x1] of l1) {
      expect(l2.get(ref), `kotwica stacji ${ref} (L2 vs L1)`).toBe(x1);
      const n = polaL1.get(ref) ?? 0;
      if (n === 3) cechy.pol3 += 1;
      if (n >= 4) cechy.pol4 += 1;
      if (naMagistrali.has(ref) || naMagistrali.has(`${ref}/station`)) cechy.magistrala += 1;
      else cechy.odgalezienie += 1;
    }
    // Pokrycie iloczynu cech — bez tego zielony wynik nie dowodziłby klasy.
    expect(cechy.pol3, 'zbiór zawiera stacje 3-polowe').toBeGreaterThan(0);
    expect(cechy.pol4, 'zbiór zawiera stacje ≥4-polowe').toBeGreaterThan(0);
    expect(cechy.magistrala, 'zbiór zawiera stacje magistrali').toBeGreaterThan(0);
    expect(cechy.odgalezienie, 'zbiór zawiera stacje odgałęzień').toBeGreaterThan(0);
  });

  it('L0 ↔ L1: porządek stacji w osi X identyczny (stacja nie zmienia kolumny przy zoomie)', () => {
    // W obrębie jednego WIERSZA arkusza (S9-1): porządek X bloków L0 musi być
    // tym samym porządkiem, co porządek kotwic pól na L1 — inaczej stacja
    // „przeskakiwałaby" kolumnę przy przejściu poziomu szczegółu. Porównanie
    // per wiersz, bo między wierszami X zaczyna się od nowa (łamanie arkusza).
    const l0x = new Map<string, number>();
    for (const s of sceny[0].symbols) {
      const ref = s.meta?.ownerRef ?? '';
      if (s.meta?.elementKind === 'station' && ref.startsWith('stn/')) {
        l0x.set(ref.replace(/\/station$/, ''), s.x);
      }
    }
    const l1 = kotwicePol(sceny[1]);
    expect(sceny[0].meta.sheetRows.length, 'arkusz jest łamany na wiersze (S9-1)').toBeGreaterThan(0);
    let porownanych = 0;
    for (const wiersz of sceny[0].meta.sheetRows) {
      const wWierszu = wiersz
        .map((id) => id.replace(/\/station$/, ''))
        .filter((ref) => l0x.has(ref) && l1.has(ref));
      const poL0 = [...wWierszu].sort((a, b) => l0x.get(a)! - l0x.get(b)!);
      const poL1 = [...wWierszu].sort((a, b) => l1.get(a)! - l1.get(b)!);
      expect(poL0, 'porządek X stacji w wierszu identyczny na L0 i L1').toEqual(poL1);
      porownanych += wWierszu.length;
    }
    // `meta.sheetRows` niesie stacje MAGISTRALI (wiersze łamania S9-1) —
    // stacje odgałęzień nie mają wiersza i porównania między-wierszowe nie są
    // zdefiniowane; kotwicę odgałęzień pilnuje test L1↔L2 wyżej (całe 53).
    expect(porownanych).toBeGreaterThan(10);
  });
});
