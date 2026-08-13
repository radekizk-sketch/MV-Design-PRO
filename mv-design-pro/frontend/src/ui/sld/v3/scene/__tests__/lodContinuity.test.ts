/**
 * K11-B §0.3 (a) — TEST KONTRAKTOWY strażnika ciągłości toru energii w LOD.
 *
 * Dyrektywa właściciela z oceny ekranu 2/10, wymóg 3: „na KAŻDYM poziomie LOD
 * tor od źródła przez magistralę do stacji pozostaje wyrysowany".
 *
 * Sieć: fixtura REFERENCYJNA `sldSubstrate52s` (53 stacje SN, magistrala +
 * 12 lateralów, GPZ z polami) — ta sama, na której stoją pozostałe wyrocznie
 * sceny v3 (`buildScene.test.ts`).
 *
 * TEST MUSI GRYŹĆ (karta §0.3): sekcja „regresja wstrzyknięta" symuluje
 * dokładnie to, przed czym strażnik chroni — LOD, który filtruje klasę
 * elementów toru prądowego — i sprawdza, że wyrocznia to WIDZI. Bez tej
 * sekcji zielony wynik nie dowodziłby niczego.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneLod, type SceneV3 } from '../buildScene';
import {
  CONTINUITY_APPARATUS_SYMBOL_IDS,
  CURRENT_PATH_SEGMENT_KINDS,
  isLodPathContinuous,
  lodPathContinuityGaps,
  stationKeyOfOwnerRef,
} from '../lodContinuity';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

const LODS: readonly SceneLod[] = [0, 1, 2];
const scenes: Readonly<Record<SceneLod, SceneV3>> = {
  0: buildSceneV3(enm, 0),
  1: buildSceneV3(enm, 1),
  2: buildSceneV3(enm, 2),
};

/** Kopia sceny z USUNIĘTĄ klasą elementów — narzędzie sekcji regresyjnej
 *  (symuluje LOD, który filtruje tor prądowy). Scena produkcyjna nietknięta. */
function sceneWithoutSegmentKind(scene: SceneV3, kind: string): SceneV3 {
  return { ...scene, segments: scene.segments.filter((s) => s.meta?.kind !== kind) };
}

function sceneWithoutSymbolIds(scene: SceneV3, ids: readonly string[]): SceneV3 {
  const drop = new Set(ids);
  return { ...scene, symbols: scene.symbols.filter((s) => !drop.has(s.symbolId)) };
}

describe('K11-B — strażnik ciągłości toru energii: KAŻDY LOD niesie pełny tor', () => {
  it.each(LODS)('LOD %i: zero braków ciągłości na sieci referencyjnej', (lod) => {
    const gaps = lodPathContinuityGaps(scenes[lod]);
    expect(gaps).toEqual([]);
    expect(isLodPathContinuous(scenes[lod])).toBe(true);
  });

  it.each(LODS)('LOD %i: zbiór odcinków toru głównego (magistrali) jest NIEPUSTY', (lod) => {
    const trunk = scenes[lod].segments.filter((s) => s.meta?.kind === 'snTrunk');
    expect(trunk.length).toBeGreaterThan(0);
  });

  it.each(LODS)('LOD %i: zbiór aparatów ciągłości elektrycznej jest NIEPUSTY', (lod) => {
    const ids = new Set<string>(CONTINUITY_APPARATUS_SYMBOL_IDS);
    const apparatus = scenes[lod].symbols.filter((s) => ids.has(s.symbolId));
    expect(apparatus.length).toBeGreaterThan(0);
  });

  it.each(LODS)('LOD %i: KAŻDA stacja sceny jest osiągalna ze źródła po wyrysowanych elementach', (lod) => {
    const scene = scenes[lod];
    const stations = new Set<string>();
    for (const symbol of scene.symbols) {
      const key = stationKeyOfOwnerRef(symbol.meta?.ownerRef);
      if (key) stations.add(key);
    }
    // Sieć referencyjna ma stacje na KAŻDYM poziomie — inaczej asercja
    // osiągalności byłaby pusta i nic by nie dowodziła.
    expect(stations.size).toBeGreaterThan(0);
    expect(lodPathContinuityGaps(scene).filter((g) => g.reason === 'stacja-odcieta')).toEqual([]);
  });

  it('kontrakt klas toru prądowego jest jawny i zamknięty (czyta go też strażnik statyczny)', () => {
    expect([...CURRENT_PATH_SEGMENT_KINDS].sort()).toEqual(['bus', 'busGpz', 'lv', 'sn', 'snTrunk']);
    expect([...CONTINUITY_APPARATUS_SYMBOL_IDS].sort()).toEqual([
      'breaker',
      'disconnector',
      'fuseSwitch',
      'loadBreakSwitch',
      'noPoint',
    ]);
  });

  it('stationKeyOfOwnerRef: tożsamość stacji jest LOD-niezależna, elementy spoza stacji dają null', () => {
    expect(stationKeyOfOwnerRef('stn/abc123/station')).toBe('stn/abc123');
    expect(stationKeyOfOwnerRef('stn/abc123/bay/4#breaker')).toBe('stn/abc123');
    expect(stationKeyOfOwnerRef('gpz/main/section/1')).toBeNull();
    expect(stationKeyOfOwnerRef(undefined)).toBeNull();
  });
});

describe('K11-B — REGRESJA WSTRZYKNIĘTA: wyrocznia GRYZIE, gdy LOD filtruje klasę toru', () => {
  it.each(LODS)('LOD %i: usunięcie magistrali (snTrunk) ⇒ brak toru głównego', (lod) => {
    const gaps = lodPathContinuityGaps(sceneWithoutSegmentKind(scenes[lod], 'snTrunk'));
    expect(gaps.some((g) => g.reason === 'brak-toru-glownego')).toBe(true);
  });

  it.each(LODS)('LOD %i: usunięcie aparatów ciągłości ⇒ brak aparatów ciągłości', (lod) => {
    const gaps = lodPathContinuityGaps(sceneWithoutSymbolIds(scenes[lod], CONTINUITY_APPARATUS_SYMBOL_IDS));
    expect(gaps.some((g) => g.reason === 'brak-aparatow-ciaglosci')).toBe(true);
  });

  it.each(LODS)('LOD %i: usunięcie odcinków odgałęźnych (sn) ⇒ stacje odcięte od źródła', (lod) => {
    // Najgroźniejszy przypadek: stacje NADAL narysowane, ale nie ma czym do
    // nich dojechać. Wyrocznia musi go zobaczyć MIMO obecności symboli stacji.
    const okaleczona = sceneWithoutSegmentKind(scenes[lod], 'sn');
    const gaps = lodPathContinuityGaps(okaleczona);
    expect(okaleczona.symbols.length).toBeGreaterThan(0);
    expect(gaps.some((g) => g.reason === 'stacja-odcieta')).toBe(true);
  });

  it.each(LODS)('LOD %i: usunięcie symbolu źródła ⇒ brak źródła', (lod) => {
    const gaps = lodPathContinuityGaps({
      ...scenes[lod],
      symbols: scenes[lod].symbols.filter((s) => s.meta?.elementKind !== 'source'),
    });
    expect(gaps.some((g) => g.reason === 'brak-zrodla')).toBe(true);
  });
});
