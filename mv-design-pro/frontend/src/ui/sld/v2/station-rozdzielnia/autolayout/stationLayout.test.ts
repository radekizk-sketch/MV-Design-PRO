/**
 * E2 AUTO-LAYOUT — engine acceptance (DoD): DETERMINISM + PRESET REPRODUCTION.
 * The layout is geometry from the MODEL only (the canon companion), proven on G1 (2 tiers),
 * G8 (1 tier) and G9 (3 tiers, multi-transformer). No render here — pure geometry.
 */
import { describe, expect, it } from 'vitest';

import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { companionToStationModel } from './layoutModel';
import { layoutStation, type StationLayout } from './stationLayout';

const layoutOf = (key: string): StationLayout => layoutStation(companionToStationModel(OZE_ARCHETYPES_2A[key]));

const isOrthogonal = (layout: StationLayout): boolean =>
  layout.edges.every((e) =>
    e.points.every((p, i) => i === 0 || p[0] === e.points[i - 1][0] || p[1] === e.points[i - 1][1]),
  );

describe('E2 station auto-layout — determinism + preset reproduction', () => {
  it('DETERMINISM: same model → bit-identical layout (hash + coordinates)', () => {
    const m = companionToStationModel(OZE_ARCHETYPES_2A['G9-GPO']);
    const a = layoutStation(m);
    const b = layoutStation(m);
    expect(a.hash).toBe(b.hash);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // stable hash regardless of bay input order (re-shuffled model → same layout).
    const shuffled = { ...m, bays: [...m.bays].reverse(), buses: [...m.buses].reverse() };
    expect(layoutStation(shuffled).hash).toBe(a.hash);
  });

  it('BANDS: every bus in its voltage tier; tiers ordered by un_kv descending (G9: 3 tiers)', () => {
    const g9 = layoutOf('G9-GPO');
    expect(g9.buses.length).toBe(3); // SN 15 + WIND_NN 0,69 + PV_NN 0,4
    const byKv = [...g9.buses].sort((a, b) => b.unKv - a.unKv);
    // higher voltage ⇒ smaller band index ⇒ higher up (smaller y).
    for (let i = 1; i < byKv.length; i++) {
      expect(byKv[i].band).toBeGreaterThan(byKv[i - 1].band);
      expect(byKv[i].y).toBeGreaterThan(byKv[i - 1].y);
    }
    expect(layoutOf('G4-PVTR').buses.length).toBe(2); // 15,75 + 0,8
    expect(layoutOf('G8-BIOGAZ').buses.length).toBe(1); // single SN tier
  });

  it('MAIN BUSBAR horizontal, spans its bays; bays ordered line → metering → source/trafo', () => {
    const g9 = layoutOf('G9-GPO');
    const sn = g9.buses.find((b) => b.unKv === 15)!;
    const mainBays = g9.bays.filter((b) => b.busId === sn.id);
    // all main bays share the busbar y (horizontal) and lie within the busbar x-range.
    for (const bay of mainBays) {
      expect(bay.busY).toBe(sn.y);
      expect(bay.x).toBeGreaterThanOrEqual(sn.x1);
      expect(bay.x).toBeLessThanOrEqual(sn.x2);
    }
    // the line bay is leftmost; metering next; sources/trafo poles to the right.
    const xOf = (role: string) => Math.min(...mainBays.filter((b) => b.role === role).map((b) => b.x));
    expect(xOf('line')).toBeLessThan(xOf('metering'));
    expect(xOf('metering')).toBeLessThan(xOf('source'));
    expect(xOf('metering')).toBeLessThan(xOf('transformer'));
  });

  it('TRANSFORMERS vertical, span tiers (G9: 2 — PV 15/0,4 + wind 15/0,69)', () => {
    const g9 = layoutOf('G9-GPO');
    expect(g9.transformers.length).toBe(2);
    for (const tr of g9.transformers) {
      expect(tr.hvY).toBeLessThan(tr.lvY); // drops downward (HV tier above LV tier)
      // the transformer x equals its HV pole x (vertical column) and the LV busbar centre.
      const pole = g9.bays.find((b) => b.role === 'transformer' && b.toBus && tr.id.includes(b.toBus));
      expect(pole?.x).toBe(tr.x);
    }
    expect(layoutOf('G4-PVTR').transformers.length).toBe(1); // 15,75/0,8
    expect(layoutOf('G8-BIOGAZ').transformers.length).toBe(0); // no transformer
  });

  it('ROUTING: every edge segment is orthogonal (H or V) — G1, G8, G9', () => {
    expect(isOrthogonal(layoutOf('G4-PVTR'))).toBe(true);
    expect(isOrthogonal(layoutOf('G8-BIOGAZ'))).toBe(true);
    expect(isOrthogonal(layoutOf('G9-GPO'))).toBe(true);
  });

  it('NO-ORPHAN: every bus carries ≥1 bay (drawn regardless of switch state)', () => {
    for (const key of ['G4-PVTR', 'G8-BIOGAZ', 'G9-GPO']) {
      const l = layoutOf(key);
      for (const bus of l.buses) {
        expect(l.bays.some((b) => b.busId === bus.id), `${key} bus ${bus.id} has a bay`).toBe(true);
      }
    }
  });
});
