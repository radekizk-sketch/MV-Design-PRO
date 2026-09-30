// Narzędzie dowodowe (wprowadzone kartą W5-B, bramka 0.8 b): sygnatura sceny SLD v3 dla każdej fikstury ENM
// generowanej narzędziami backendu, przy każdym LOD, zapisana do JSON. Uruchamiane PRZED
// (bazowy kod + bazowe fikstury) i PO (kod karty + fikstury przegenerowane) — pliki porównuje
// integrator. Ścieżka wyjścia z SYGNATURY_SCENY_WYJSCIE; bez zmiennej test jest pomijany.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildSceneV3, type SceneLod } from '../buildScene';
import { loadEnm, sceneSignature } from './syntheticNetworks';

const FRONT = join(__dirname, '..', '..', '..', '..', '..', '..');
const KATALOGI = [
  join(FRONT, 'src', 'ui', 'sld', 'v3', 'scene', '__tests__', 'fixtures'),
  join(FRONT, 'src', 'ui', 'sld', 'v3', 'canvas', '__tests__', 'fixtures'),
  join(FRONT, 'public', 'test-fixtures'),
  join(FRONT, 'src', 'ui', 'sld', 'v2', 'geometry', '__tests__', 'fixtures'),
];

describe('sygnatury sceny SLD v3 fikstur generowanych', () => {
  const wyjscie = process.env.SYGNATURY_SCENY_WYJSCIE;
  it.skipIf(!wyjscie)('zapisuje sygnatury sceny dla każdej fikstury i LOD', () => {
    const wynik: Record<string, Record<string, string>> = {};
    for (const katalog of KATALOGI) {
      for (const plik of readdirSync(katalog).filter((f) => f.endsWith('.enm.json')).sort()) {
        const enm = loadEnm(join(katalog, plik));
        const klucz = `${katalog.slice(FRONT.length + 1)}/${plik}`;
        wynik[klucz] = {};
        for (const lod of [0, 1, 2] as SceneLod[]) {
          try {
            wynik[klucz][`lod${lod}`] = sceneSignature(buildSceneV3(enm, lod));
          } catch (e) {
            wynik[klucz][`lod${lod}`] = `BLAD: ${(e as Error).message.slice(0, 200)}`;
          }
        }
      }
    }
    mkdirSync(dirname(wyjscie as string), { recursive: true });
    writeFileSync(wyjscie as string, JSON.stringify(wynik, null, 2) + '\n', 'utf8');
    expect(Object.keys(wynik).length).toBeGreaterThan(0);
  });
});
