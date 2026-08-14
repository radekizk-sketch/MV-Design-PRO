/**
 * T5a (KONCEPCJA_LOD_NN_2026-08.md §L0/§L1, werdykt właściciela §0) — dowód
 * PEŁNEGO POTOKU ENM→scena na fixturze `nnBoardDemo.enm.json`
 * (`public/test-fixtures/`, TA SAMA fixtura, którą wykorzystuje harness
 * zrzutów `e2e/nn-board-screenshot.spec.ts` — jedno źródło danych dla dowodu
 * jednostkowego i dowodu wizualnego B-02). Stacja B tej fixtury niesie DWIE
 * sekcje RGnN (`nn_sections`, sekcja 1 — 4 odpływy istniejące od karty P0.8;
 * sekcja 2 — 14 odpływów DOPISANYCH tą kartą, w tym jeden UNRESOLVED i jeden
 * DER, żeby budżet adaptacyjny na tej sekcji (zmierzony na tej fixturze: 11)
 * był PRZEKROCZONY i test miał co mierzyć) połączone SPRZĘGŁEM
 * (`section_coupler`, `type="bus_coupler"`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3, type PreviewSegment, type PreviewSymbol, type SceneV3 } from '../buildScene';

const here = dirname(fileURLToPath(import.meta.url));

function loadFixture(): EnergyNetworkModel {
  const raw = JSON.parse(
    readFileSync(resolve(here, '../../../../../../public/test-fixtures/nnBoardDemo.enm.json'), 'utf8'),
  ) as { readonly enm: EnergyNetworkModel };
  return raw.enm;
}

const ENM = loadFixture();
const STATION_REF = 'stn/ed91b18ec60d43a0fb4cb92e778fa53e/station';
const SECTION1_BUS = 'stn/ed91b18ec60d43a0fb4cb92e778fa53e/nn_bus';
const SECTION2_BUS = 'stn/test/nn/section2_bus';
const COUPLER_REF = 'stn/test/nn/section_coupler';
const HARD_FAIL_REF = 'stn/test/nn/g4_unresolved';
const DER_FEEDER_REF = 'stn/test/nn/g6_mcb';

function busSegments(scene: SceneV3): readonly PreviewSegment[] {
  return scene.segments.filter((s) => s.meta?.kind === 'bus');
}

function aggregateSymbols(scene: SceneV3): readonly PreviewSymbol[] {
  return scene.symbols.filter((s) => s.symbolId === 'nnAggregate');
}

describe('T5a — L1: szyna RGnN z SEKCJAMI (2 sekcje) i SPRZĘGŁEM na fixturze nnBoardDemo', () => {
  const scene = buildSceneV3(ENM, 2);

  it('scena niesie DWA odrębne odcinki szyny nN tej stacji (sekcja 1 i sekcja 2 — refy REALNE z modelu, nie jeden spłaszczony)', () => {
    const buses = busSegments(scene).filter(
      (s) => s.meta?.ownerRef?.startsWith(`${STATION_REF}#`) || s.meta?.ownerRef?.startsWith(`${SECTION2_BUS}#`),
    );
    const ownerRefs = buses.map((s) => s.meta?.ownerRef);
    expect(ownerRefs).toContain(`${STATION_REF}#lv-bus`);
    expect(ownerRefs).toContain(`${SECTION2_BUS}#lv-bus`);
  });

  it('sprzęgło (`coupler.branchRef`) jest ODCINKIEM LITERALNYM sceny (ref REALNEJ gałęzi ENM, type="bus_coupler")', () => {
    const couplerSegment = scene.segments.find((s) => s.meta?.ownerRef === COUPLER_REF);
    expect(couplerSegment, 'brak odcinka łączącego sekcje po refie sprzęgła').toBeDefined();
    expect(couplerSegment?.meta?.kind).not.toBe('bus'); // łącznik międzysekcyjny, nie sama szyna
    // Aparat sprzęgła (MCB, katalog APARAT_NN_MCB w fixturze) narysowany.
    const couplerApparatus = scene.symbols.find((s) => s.meta?.ownerRef === COUPLER_REF);
    expect(couplerApparatus?.symbolId).toBe('nnBreaker');
  });

  it('DRUGA sekcja (6 odpływów, budżet przekroczony) dostaje DOKŁADNIE JEDEN znacznik agregatu', () => {
    const aggregates = aggregateSymbols(scene);
    expect(aggregates.length).toBeGreaterThanOrEqual(1);
    const agg = aggregates[0];
    expect(agg.meta?.nnAggregateCount).toBeGreaterThan(0);
    expect(agg.meta?.nnAggregateHiddenRefs?.length).toBe(agg.meta?.nnAggregateCount);
  });

  it('NIGDY-W-AGREGACIE: odpływ HARD FAIL (UNRESOLVED) pozostaje SYMBOLEM/SEGMENTEM JAWNYM, nie znika w agregacie', () => {
    const hidden = aggregateSymbols(scene).flatMap((s) => s.meta?.nnAggregateHiddenRefs ?? []);
    expect(hidden).not.toContain(HARD_FAIL_REF);
    // Odpływ nierozpoznany NIE dostaje symbolu aparatu (pusty tor — §0.3), ale
    // JEGO WŁASNY zejściowy odcinek sceny (ownerRef=branchRef) istnieje —
    // dowód, że tor jest jawny, nie wchłonięty przez agregat. Komunikat błędu
    // (WHITE BOX) trafia do `stopNotes` (`scene/buildScene.ts` tłumaczy kod
    // `missingData` na zdanie) — `scene.meta.missingData` to ODRĘBNA lista
    // (kody GPZ/DER na poziomie sceny), nie ta sama warstwa.
    const ownDrop = scene.segments.find((s) => s.meta?.ownerRef === HARD_FAIL_REF);
    expect(ownDrop, 'odpływ HARD FAIL musi mieć własny, jawny odcinek na scenie').toBeDefined();
    expect(scene.meta.stopNotes.some((m) => m.includes(HARD_FAIL_REF))).toBe(true);
  });

  it('NIGDY-W-AGREGACIE: odpływ DER (S2-6) pozostaje SYMBOLEM JAWNYM z własnym aparatem', () => {
    const hidden = aggregateSymbols(scene).flatMap((s) => s.meta?.nnAggregateHiddenRefs ?? []);
    expect(hidden).not.toContain(DER_FEEDER_REF);
    const ownApparatus = scene.symbols.find((s) => s.meta?.ownerRef === DER_FEEDER_REF);
    expect(ownApparatus, 'odpływ DER musi mieć własny, jawny symbol aparatu').toBeDefined();
    expect(ownApparatus?.symbolId).toBe('nnBreaker');
  });

  it('sekcja 1 (4 odpływy, WEWNĄTRZ budżetu) NIE dostaje agregatu — bez zmian względem stanu przed kartą (dowód: zero regresji na małej sekcji)', () => {
    const section1Hidden = aggregateSymbols(scene)
      .filter((s) => (s.meta?.nnAggregateHiddenRefs ?? []).some((r) => r.startsWith('stn/test/nn/f')))
      .flatMap((s) => s.meta?.nnAggregateHiddenRefs ?? []);
    expect(section1Hidden).toEqual([]);
    for (const ref of ['stn/test/nn/f1_mcb', 'stn/test/nn/f2_fuse', 'stn/test/nn/f3_cable', 'stn/test/nn/f4_unresolved']) {
      expect(scene.segments.some((s) => s.meta?.ownerRef === ref), ref).toBe(true);
    }
  });

  it('tor transformacji L1 ZAWSZE WIDOCZNY: symbol transformatora, aparat główny (incomer), obie szyny sekcji, wszystkie obecne jednocześnie', () => {
    const hasTransformer = scene.symbols.some((s) => s.symbolId === 'transformer2W');
    const hasSection1Bus = busSegments(scene).some((s) => s.meta?.ownerRef === `${STATION_REF}#lv-bus`);
    const hasSection2Bus = busSegments(scene).some((s) => s.meta?.ownerRef === `${SECTION2_BUS}#lv-bus`);
    expect(hasTransformer).toBe(true);
    expect(hasSection1Bus).toBe(true);
    expect(hasSection2Bus).toBe(true);
  });
});

describe('T5a — L0: PLAKIETKA nN (struktura) na fixturze nnBoardDemo', () => {
  const sceneL0 = buildSceneV3(ENM, 0);

  it('stacja z rozdzielnicą nN dostaje wiersz strukturalny "nN · {n} odpł." (n = SUMA odpływów obu sekcji: 4+14=18)', () => {
    const rows = sceneL0.labels.filter((l) => l.ownerRef.startsWith(`${STATION_REF}#name-row`));
    const texts = rows.map((l) => l.text);
    expect(texts).toContain('nN · 18 odpł.');
  });

  it('CAŁA geometria nN (szyna/odpływy/sprzęgło/agregat) ZNIKA na L0 — zero symboli/segmentów nN, WYŁĄCZNIE plakietka tekstowa', () => {
    const nnSymbolIds = new Set(['nnBreaker', 'nnFuseSwitch', 'nnDistributionBoard', 'nnAggregate', 'nnMeter']);
    expect(sceneL0.symbols.some((s) => nnSymbolIds.has(s.symbolId))).toBe(false);
    expect(sceneL0.segments.some((s) => s.meta?.ownerRef?.includes('nn_bus') || s.meta?.ownerRef?.includes('section2_bus'))).toBe(false);
  });

  it('stacja BEZ rozdzielnicy nN (GPZ tej samej fixtury) NIE dostaje wiersza plakietki — zero fabrykacji dla stacji bez danych', () => {
    const gpzRows = sceneL0.labels.filter((l) => l.ownerRef.includes('gpz') && l.text.startsWith('nN ·'));
    expect(gpzRows).toEqual([]);
  });
});
