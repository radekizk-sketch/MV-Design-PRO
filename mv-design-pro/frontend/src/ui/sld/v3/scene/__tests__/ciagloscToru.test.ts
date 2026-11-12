// @vitest-environment node
/**
 * K11-B §0.3 (a) — TEST KONTRAKTOWY strażnika ciągłości toru energii.
 *
 * Dyrektywa właściciela z oceny ekranu 2/10, wymóg 3: tor od źródła przez
 * magistralę do stacji pozostaje wyrysowany. Intencja zachowana po karcie
 * SLD-SKALA-I-NAWIGACJA (R1): dawniej sprawdzano trzy sceny poziomów
 * szczegółu, dziś jest JEDNA scena niezależna od skali, więc wymóg dotyczy
 * jej — a to, że skala nie wpływa na scenę, pilnuje
 * `scripts/sld_scena_niezalezna_od_skali_guard.py`.
 *
 * Sieć: fixtura REFERENCYJNA `sldSubstrate52s` (53 stacje SN, magistrala +
 * 12 lateralów, GPZ z polami) — ta sama, na której stoją pozostałe wyrocznie
 * sceny v3 (`buildScene.test.ts`).
 *
 * TEST MUSI GRYŹĆ (karta §0.3): sekcja „regresja wstrzyknięta" symuluje
 * dokładnie to, przed czym strażnik chroni — scenę, która filtruje klasę
 * elementów toru prądowego — i sprawdza, że wyrocznia to WIDZI. Bez tej
 * sekcji zielony wynik nie dowodziłby niczego.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type SceneV3 } from '../buildScene';
import {
  CONTINUITY_APPARATUS_SYMBOL_IDS,
  CURRENT_PATH_SEGMENT_KINDS,
  isPathContinuous,
  pathContinuityGaps,
  stationKeyOfOwnerRef,
} from '../ciagloscToru';

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

const scena: SceneV3 = buildSceneV3(enm);

/** Kopia sceny z USUNIĘTĄ klasą elementów — narzędzie sekcji regresyjnej
 *  (symuluje scenę, która filtruje tor prądowy). Scena produkcyjna nietknięta. */
function sceneWithoutSegmentKind(scene: SceneV3, kind: string): SceneV3 {
  return { ...scene, segments: scene.segments.filter((s) => s.meta?.kind !== kind) };
}

function sceneWithoutSymbolIds(scene: SceneV3, ids: readonly string[]): SceneV3 {
  const drop = new Set(ids);
  return { ...scene, symbols: scene.symbols.filter((s) => !drop.has(s.symbolId)) };
}

describe('K11-B — strażnik ciągłości toru energii: scena niesie pełny tor', () => {
  it('zero braków ciągłości na sieci referencyjnej', () => {
    const gaps = pathContinuityGaps(scena);
    expect(gaps).toEqual([]);
    expect(isPathContinuous(scena)).toBe(true);
  });

  it('zbiór odcinków toru głównego (magistrali) jest NIEPUSTY', () => {
    const trunk = scena.segments.filter((s) => s.meta?.kind === 'snTrunk');
    expect(trunk.length).toBeGreaterThan(0);
  });

  it('zbiór aparatów ciągłości elektrycznej jest NIEPUSTY', () => {
    const ids = new Set<string>(CONTINUITY_APPARATUS_SYMBOL_IDS);
    const apparatus = scena.symbols.filter((s) => ids.has(s.symbolId));
    expect(apparatus.length).toBeGreaterThan(0);
  });

  it('KAŻDA stacja sceny jest osiągalna ze źródła po wyrysowanych elementach', () => {
    const scene = scena;
    const stations = new Set<string>();
    for (const symbol of scene.symbols) {
      const key = stationKeyOfOwnerRef(symbol.meta?.ownerRef);
      if (key) stations.add(key);
    }
    // Sieć referencyjna ma stacje — inaczej asercja
    // osiągalności byłaby pusta i nic by nie dowodziła.
    expect(stations.size).toBeGreaterThan(0);
    expect(pathContinuityGaps(scene).filter((g) => g.reason === 'stacja-odcieta')).toEqual([]);
  });

  it('kontrakt klas toru prądowego jest jawny i zamknięty (czyta go też strażnik statyczny)', () => {
    expect([...CURRENT_PATH_SEGMENT_KINDS].sort()).toEqual(['bus', 'busGpz', 'lv', 'sn', 'snTrunk']);
    // Karta SLD-SUBSTRAT (kontynuacja): łącznik i wyłącznik sekcyjny NA torze
    // ciągu (`lineSwitch`/`lineBreaker`, `scene/elementyToru.ts`) są aparatami
    // ciągłości tak samo jak ich pionowe odpowiedniki w polach — zamknięty łącznik
    // na torze nie przerywa toru energii. Karta UX-04/POLE-LINIOWE-WZORZEC: rysunek
    // QElectroTech EN 60617 tego samego łącznika toru (pole liniowe GPZ wg ENEA Z.10)
    // jest aparatem ciągłości jak jego kanoniczny odpowiednik; uziemnik (poza torem)
    // ciągłości nie niesie. Wyłącznik z napędem silnikowym M (`qetBreakerZNapedem`, rekord
    // `naped`, korekta właściciela 2026-10-29 pkt 4) to TEN SAM wyłącznik toru ze znakiem
    // napędu — aparat ciągłości jak `qetBreaker`; tak samo łącznik trójpołożeniowy ze znakiem
    // napędu zasobnikowego (`qetThreePositionSwitchZNapedem`, decyzja architekta 2026-10-30).
    // Wyłącznik w wykonaniu wysuwnym (`BayPrimaryDevice.wykonanie` = WYSUWNE, rozstrzygnięcie
    // architekta 2026-10-30 pkt 3) — ten sam wyłącznik toru ze znacznikiem członu wysuwnego „○".
    expect([...CONTINUITY_APPARATUS_SYMBOL_IDS].sort()).toEqual([
      'breaker',
      'disconnector',
      'fuseSwitch',
      'lineBreaker',
      'lineSwitch',
      'loadBreakSwitch',
      'noPoint',
      'qetBreaker',
      'qetBreakerWysuwny',
      'qetBreakerWysuwnyZNapedem',
      'qetBreakerZNapedem',
      'qetDisconnector',
      'qetFuseSwitch',
      'qetLoadBreakSwitch',
      'qetThreePositionSwitch',
      'qetThreePositionSwitchZNapedem',
    ]);
  });

  it('stationKeyOfOwnerRef: tożsamość stacji z prefiksu refu, elementy spoza stacji dają null', () => {
    expect(stationKeyOfOwnerRef('stn/abc123/station')).toBe('stn/abc123');
    expect(stationKeyOfOwnerRef('stn/abc123/bay/4#breaker')).toBe('stn/abc123');
    expect(stationKeyOfOwnerRef('gpz/main/section/1')).toBeNull();
    expect(stationKeyOfOwnerRef(undefined)).toBeNull();
  });
});

describe('K11-B — REGRESJA WSTRZYKNIĘTA: wyrocznia GRYZIE, gdy scena filtruje klasę toru', () => {
  it('usunięcie magistrali (snTrunk) ⇒ brak toru głównego', () => {
    const gaps = pathContinuityGaps(sceneWithoutSegmentKind(scena, 'snTrunk'));
    expect(gaps.some((g) => g.reason === 'brak-toru-glownego')).toBe(true);
  });

  it('usunięcie aparatów ciągłości ⇒ brak aparatów ciągłości', () => {
    const gaps = pathContinuityGaps(sceneWithoutSymbolIds(scena, CONTINUITY_APPARATUS_SYMBOL_IDS));
    expect(gaps.some((g) => g.reason === 'brak-aparatow-ciaglosci')).toBe(true);
  });

  it('usunięcie odcinków odgałęźnych (sn) ⇒ stacje odcięte od źródła', () => {
    // Najgroźniejszy przypadek: stacje NADAL narysowane, ale nie ma czym do
    // nich dojechać. Wyrocznia musi go zobaczyć MIMO obecności symboli stacji.
    const okaleczona = sceneWithoutSegmentKind(scena, 'sn');
    const gaps = pathContinuityGaps(okaleczona);
    expect(okaleczona.symbols.length).toBeGreaterThan(0);
    expect(gaps.some((g) => g.reason === 'stacja-odcieta')).toBe(true);
  });

  it('usunięcie symbolu źródła ⇒ brak źródła', () => {
    const gaps = pathContinuityGaps({
      ...scena,
      symbols: scena.symbols.filter((s) => s.meta?.elementKind !== 'source'),
    });
    expect(gaps.some((g) => g.reason === 'brak-zrodla')).toBe(true);
  });
});
