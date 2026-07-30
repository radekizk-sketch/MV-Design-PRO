/**
 * K12 (KARTA_K12, dyrektywa właściciela 2026-07-30) — wyrocznie
 * `computeProjectLegendEntries` (legenda „na żądanie" liczona z REALNEJ
 * sceny, zero fabrykacji). Fixtury `SceneV3` KONSTRUOWANE wprost (nie przez
 * `buildSceneV3`/ENM) — czysta funkcja testowana w izolacji od kompozycji.
 */
import { describe, expect, it } from 'vitest';

import { computeProjectLegendEntries } from '../projectLegend';
import type { SceneV3 } from '../../scene/buildScene';
import type { PreviewSegment, PreviewSymbol } from '../../compose/preview';

function makeScene(options: {
  readonly symbols?: readonly Pick<PreviewSymbol, 'symbolId'>[];
  readonly segments?: readonly Pick<PreviewSegment, 'meta'>[];
  readonly neutralEarthingNotePl?: string | null;
}): SceneV3 {
  const symbols = (options.symbols ?? []).map((s) => ({
    symbolId: s.symbolId,
    x: 0,
    y: 0,
  })) as unknown as readonly PreviewSymbol[];
  const segments = (options.segments ?? []).map((s) => ({
    points: [],
    meta: s.meta,
  })) as unknown as readonly PreviewSegment[];
  return {
    symbols,
    segments,
    labels: [],
    junctions: [],
    crossings: [],
    bbox: { x: 0, y: 0, width: 0, height: 0 },
    meta: {
      lod: 2,
      stationCount: 0,
      gpzId: null,
      parityKeys: [],
      missingData: [],
      sections: [],
      transformers: [],
      mainTrunkStationIds: [],
      lateralRunIds: [],
      stopNotes: [],
      sources: [],
      neutralEarthingNotePl: options.neutralEarthingNotePl,
    },
  } as unknown as SceneV3;
}

describe('computeProjectLegendEntries — zero fabrykacji (K12 §0.3)', () => {
  it('scena pusta (brak symboli/odcinków) ⇒ legenda pusta — uczciwy stan zerowy', () => {
    const scene = makeScene({});
    expect(computeProjectLegendEntries(scene)).toEqual([]);
  });

  it('symbol NIEOBECNY w scenie NIE ma wpisu — sieć bez agregatu (loadArrow) nie pokazuje "Odbiór (zagregowany)"', () => {
    const scene = makeScene({
      symbols: [{ symbolId: 'breaker' }, { symbolId: 'transformer2W' }, { symbolId: 'gridSource' }],
    });
    const entries = computeProjectLegendEntries(scene);
    const ids = entries.map((e) => e.id);
    expect(ids).toContain('breaker');
    expect(ids).toContain('transformer2W');
    expect(ids).toContain('gridSource');
    expect(ids).not.toContain('loadArrow');
  });

  it('symbol OBECNY w scenie MA wpis, gdy dołożony (agregat obecny ⇒ wpis obecny)', () => {
    const scene = makeScene({ symbols: [{ symbolId: 'loadArrow' }] });
    const entries = computeProjectLegendEntries(scene);
    expect(entries.map((e) => e.id)).toContain('loadArrow');
    expect(entries.find((e) => e.id === 'loadArrow')?.labelPl).toBe('Odbiór (zagregowany)');
  });

  it('symbol POZA historycznym kuratorem 12 pozycji (np. derPv/junction/stationCollapsed) MA wpis — pełne pokrycie, nie tylko dawny kurator', () => {
    const scene = makeScene({
      symbols: [{ symbolId: 'derPv' }, { symbolId: 'junction' }, { symbolId: 'stationCollapsed' }],
    });
    const ids = computeProjectLegendEntries(scene).map((e) => e.id);
    expect(ids).toContain('derPv');
    expect(ids).toContain('junction');
    expect(ids).toContain('stationCollapsed');
  });

  it('kolejność wpisów symboli jest DETERMINISTYCZNA (kolejność SYMBOL_DEFS), niezależna od kolejności w scenie', () => {
    const sceneA = makeScene({ symbols: [{ symbolId: 'transformer2W' }, { symbolId: 'breaker' }] });
    const sceneB = makeScene({ symbols: [{ symbolId: 'breaker' }, { symbolId: 'transformer2W' }] });
    expect(computeProjectLegendEntries(sceneA).map((e) => e.id)).toEqual(
      computeProjectLegendEntries(sceneB).map((e) => e.id),
    );
  });

  it('duplikaty tego samego symbolu w scenie ⇒ JEDEN wpis w legendzie (nie powielony)', () => {
    const scene = makeScene({
      symbols: [{ symbolId: 'breaker' }, { symbolId: 'breaker' }, { symbolId: 'breaker' }],
    });
    expect(computeProjectLegendEntries(scene).filter((e) => e.id === 'breaker')).toHaveLength(1);
  });

  it('"overhead" (linia napowietrzna) NIGDY nie pojawia się — scena v3 nie renderuje tego stylu linii (zero fabrykacji rozciągnięte na linie)', () => {
    const scene = makeScene({
      segments: [{ meta: { kind: 'sn' } as PreviewSegment['meta'] }],
    });
    expect(computeProjectLegendEntries(scene).map((e) => e.id)).not.toContain('overhead');
  });

  it('"cable" obecny, gdy scena ma ≥1 odcinek toru mocy (bus/sn/snTrunk/lv)', () => {
    for (const kind of ['bus', 'busGpz', 'sn', 'snTrunk', 'lv'] as const) {
      const scene = makeScene({ segments: [{ meta: { kind } as PreviewSegment['meta'] }] });
      expect(computeProjectLegendEntries(scene).map((e) => e.id)).toContain('cable');
    }
  });

  it('"cable" NIEOBECNY, gdy scena ma WYŁĄCZNIE adnotacje (leader/protectionTrip/measurementLink), zero toru mocy', () => {
    const scene = makeScene({
      segments: [
        { meta: { kind: 'leader' } as PreviewSegment['meta'] },
        { meta: { kind: 'protectionTrip' } as PreviewSegment['meta'] },
        { meta: { kind: 'measurementLink' } as PreviewSegment['meta'] },
      ],
    });
    expect(computeProjectLegendEntries(scene).map((e) => e.id)).not.toContain('cable');
  });

  it('segment bez `meta.kind` domyślnie liczy się jako tor mocy ("sn") — zgodnie z fallbackiem renderu (SceneSegmentNode)', () => {
    const scene = makeScene({ segments: [{ meta: undefined }] });
    expect(computeProjectLegendEntries(scene).map((e) => e.id)).toContain('cable');
  });

  it('"openTerminal" obecny WYŁĄCZNIE, gdy scena ma ≥1 słupek końca otwartego', () => {
    const sceneBez = makeScene({ segments: [{ meta: { kind: 'sn' } as PreviewSegment['meta'] }] });
    expect(computeProjectLegendEntries(sceneBez).map((e) => e.id)).not.toContain('openTerminal');

    const sceneZ = makeScene({
      segments: [
        { meta: { kind: 'sn' } as PreviewSegment['meta'] },
        { meta: { kind: 'openTerminal' } as PreviewSegment['meta'] },
      ],
    });
    expect(computeProjectLegendEntries(sceneZ).map((e) => e.id)).toContain('openTerminal');
  });

  it('opis punktu neutralnego (V12K-223) doklejony jako wpis `note`, WYŁĄCZNIE gdy scena go niesie', () => {
    const sceneBezOpisu = makeScene({ symbols: [{ symbolId: 'breaker' }] });
    expect(computeProjectLegendEntries(sceneBezOpisu).some((e) => e.kind === 'note')).toBe(false);

    const sceneZOpisem = makeScene({
      symbols: [{ symbolId: 'breaker' }],
      neutralEarthingNotePl: 'Punkt neutralny: rezystor 57,7 Ω',
    });
    const entries = computeProjectLegendEntries(sceneZOpisem);
    const note = entries.find((e) => e.kind === 'note');
    expect(note?.id).toBe('sn-neutral-earthing');
    expect(note?.labelPl).toBe('Punkt neutralny: rezystor 57,7 Ω');
    // Note jest OSTATNIM wpisem (symbole → linie → opis) — spójne z dawnym
    // zachowaniem `buildDefaultLegend()+note` (SldCanvasV3.tsx sprzed K12).
    expect(entries[entries.length - 1]).toBe(note);
  });

  it('etykiety ES/miernika zachowują adnotację rozstrzygającą (F10.1/F10.5) — reużycie `legendLabelForSymbol`, nie duplikat', () => {
    const scene = makeScene({ symbols: [{ symbolId: 'earthSwitch' }, { symbolId: 'meter' }] });
    const entries = computeProjectLegendEntries(scene);
    expect(entries.find((e) => e.id === 'earthSwitch')?.labelPl).toContain('blokada zamkn. na tor pod napięciem');
    expect(entries.find((e) => e.id === 'meter')?.labelPl).toContain('nie napęd silnikowy');
  });
});
