/**
 * SLD RECOVERY oracles (2026-07) — executable proof for the failures named in
 * SLD_FORENSIC_AUDIT.md / SLD_ELECTRICAL_SEMANTICS.md.
 *
 * These assert electrical/semantic correctness (not pixels). Passing tests are
 * PROVEN fixes; the single `it.skip` is the executable SPEC for execplan Step 4
 * (E02 trunk-into-bus) — deliberately not asserted-green until that geometry
 * change lands, so this file never fakes success.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSldDataFromSnapshot } from '../enmToSldAdapter';
import { STATION_RUN_TRUNK_OFFSET_Y } from '../../renderer/StationOnRunRenderer';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { enm: EnergyNetworkModel }).enm;

describe('SLD recovery — electrical/semantic oracles', () => {
  const data = buildSldDataFromSnapshot(enm, null);

  // E01: the ENM has exactly one source; the SLD must not render two
  // independent source-looking blocks. Proxy: exactly one GPZ block.
  it('E01: renders exactly one GPZ / source block (single source in ENM)', () => {
    expect(enm.sources.length).toBe(1);
    expect(data.gpzs.length).toBe(1);
  });

  // E11: section labels must never be a zero-based array index ("Sekcja 0"/"S0").
  it('E11: no zero-based section label leaks ("Sekcja 0" / "S0")', () => {
    const labelText = data.labelSpecs.map((l) => l.text).join(' | ');
    expect(labelText).not.toMatch(/\bSekcja 0\b/);
    expect(labelText).not.toMatch(/(^|\|)\s*S0\s*(\||$)/);
    // Section renderer path (SectionRenderer number/displayLabel) — the leak that
    // labelSpecs alone did NOT cover. `number` must be 1-based (never 0), and any
    // displayLabel must not read "Sekcja 0".
    for (const s of data.sections) {
      expect(s.number, `section ${s.id} number must be >= 1`).toBeGreaterThanOrEqual(1);
      if (s.displayLabel) expect(s.displayLabel).not.toMatch(/\bSekcja 0\b/);
    }
  });

  // E08: a cable-class label must never contain the OVERHEAD token (contradiction
  // "Kabel SN · OVERHEAD"); cable and overhead line are distinct classes.
  it('E08: no cable run label mixes "Kabel" with "OVERHEAD"', () => {
    for (const run of data.cableRuns) {
      const texts = [run.label ?? '', ...(run.segmentLabels ?? []).map((s) => s.text)];
      for (const t of texts) {
        const hasKabel = /kabel/i.test(t);
        const hasOverhead = /overhead/i.test(t);
        expect(hasKabel && hasOverhead, `contradictory label: "${t}"`).toBe(false);
      }
    }
  });

  // E07: DER declared connection_variant "nn_side" attaches to the station LV
  // (nN) side — the SLD must anchor such DER to a station, never leave it as a
  // free coordinate on the 15 kV trunk. Proxy: every DER connection references a
  // known station id (its PCC anchor), not a bare trunk coordinate.
  it('E07: nn_side DER are anchored to a station (PCC = station), not the trunk', () => {
    const stationIds = new Set(data.stations.map((s) => s.id));
    const nnGenerators = enm.generators.filter((g) => g.connection_variant === 'nn_side');
    expect(nnGenerators.length).toBeGreaterThan(0);
    // Every nn_side generator's owning station must be a rendered station node.
    for (const g of nnGenerators) {
      const stationRef = g.station_ref
        ?? (typeof g.bus_ref === 'string' && g.bus_ref.startsWith('stn/')
          ? `stn/${g.bus_ref.split('/')[1]}/station`
          : null);
      expect(stationRef, `DER ${g.name} has no resolvable station`).toBeTruthy();
      if (stationRef) expect(stationIds.has(stationRef)).toBe(true);
    }
  });

  // E02/E03: the trunk must physically REACH each trunk station's SN bus (the
  // bus is drawn on the trunk axis at y = station.y - STATION_RUN_TRUNK_OFFSET_Y),
  // proving current enters WE → bus → WY and there is no elevated corridor
  // decoupled from the stations. Now asserted (no longer a skipped SPEC).
  it('E02/E03: trunk polyline reaches every trunk station SN bus (no bypass)', () => {
    const trunk = data.cableRuns.find((r) => r.runKind === 'main_trunk');
    expect(trunk).toBeDefined();
    const pts = trunk!.pathPoints;
    // Trunk stations = the top row (smallest y band) — the fishbone spine.
    const topY = Math.min(...data.stations.map((s) => s.y));
    const trunkStations = data.stations.filter((s) => Math.abs(s.y - topY) < 1);
    expect(trunkStations.length).toBeGreaterThanOrEqual(3);
    for (const st of trunkStations) {
      const busY = st.y - STATION_RUN_TRUNK_OFFSET_Y;
      // The trunk is a straight line at the bus axis; assert a HORIZONTAL
      // segment at y≈busY spans station.x — the trunk physically passes THROUGH
      // the station SN bus (WE→bus→WY), never a corridor decoupled from it.
      const passesThrough = pts.some((p, i) => {
        if (i === 0) return false;
        const a = pts[i - 1];
        const horizontal = Math.abs(a.y - busY) < 1 && Math.abs(p.y - busY) < 1;
        const spans = st.x >= Math.min(a.x, p.x) - 2 && st.x <= Math.max(a.x, p.x) + 2;
        return horizontal && spans;
      });
      expect(passesThrough, `trunk must pass through ${st.id} SN bus at y=${busY}`).toBe(true);
    }
  });

  // §16 / connection_contract (recovery step 5): every rendered cable segment is
  // TERMINAL-TO-TERMINAL — its endpoints are the ENM branch's from_bus/to_bus,
  // not bare coordinates. Proven by matching each segmentPath's fromTerminal/
  // toTerminal busRef to the ENM branch it renders.
  it('§16: every rendered cable segment carries ENM terminal identity (from_bus→to_bus)', () => {
    const branchByRef = new Map(enm.branches.map((b) => [b.ref_id, b]));
    let checked = 0;
    for (const run of data.cableRuns) {
      for (const seg of run.segmentPaths ?? []) {
        const branch = branchByRef.get(seg.segmentRef);
        if (!branch) continue; // fallback/synthetic segments have no ENM branch
        checked += 1;
        expect(seg.fromTerminal, `segment ${seg.segmentRef} missing fromTerminal`).toBeTruthy();
        expect(seg.toTerminal, `segment ${seg.segmentRef} missing toTerminal`).toBeTruthy();
        // Identity must equal the ENM branch endpoints — no coordinate-only edge.
        expect(seg.fromTerminal?.busRef).toBe(branch.from_bus_ref);
        expect(seg.toTerminal?.busRef).toBe(branch.to_bus_ref);
      }
    }
    // The substrate's corridor-routed runs must actually exercise this path.
    expect(checked).toBeGreaterThan(50);
  });
});
