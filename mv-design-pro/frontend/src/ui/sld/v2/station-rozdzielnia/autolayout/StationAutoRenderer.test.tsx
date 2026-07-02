/**
 * E2 AUTO-LAYOUT render — ACCEPTANCE: it MATCHES the preset (same companion + same readouts), it
 * does not re-implement the model. Locks the regressions the reviewer flagged: idyn from the
 * companion (not 0), local per-type share, 1f-z restored, NO PCC name, CT ring on the busbar.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { fmt } from '../canon/sldCanonKit';
import { OZE_ARCHETYPES_2A } from '../companions/ozeArchetypes2a';
import { companionToStationModel } from './layoutModel';
import { StationAutoRenderer } from './StationAutoRenderer';
import { layoutStation } from './stationLayout';

function autoText(key: string): { txt: string; companion: (typeof OZE_ARCHETYPES_2A)[string] } {
  const companion = OZE_ARCHETYPES_2A[key];
  const layout = layoutStation(companionToStationModel(companion));
  const { container } = render(
    <svg>
      <StationAutoRenderer layout={layout} companion={companion} />
    </svg>,
  );
  return { txt: container.textContent ?? '', companion };
}

describe('E2 auto-layout render — matches the preset (same model + readouts)', () => {
  it('NO PCC name/marker anywhere (canon)', () => {
    for (const k of ['G4-PVTR', 'G8-BIOGAZ', 'G9-GPO']) expect(autoText(k).txt).not.toContain('PCC');
  });

  it('idyn read PER-BUS from the companion (ip ≤ idyn ✓), not 0', () => {
    const { txt, companion } = autoText('G8-BIOGAZ');
    const idyn = companion.short_circuit.buses['SN_PCC'].idyn_ka; // per-bus, not a source scalar
    expect(idyn).toBeGreaterThan(0);
    expect(txt).toContain(`idyn ${fmt(idyn, 0)} ✓`);
    expect(txt).not.toContain('idyn 0');
    expect(companion.short_circuit.buses['SN_PCC'].max.ip_ka).toBeLessThanOrEqual(idyn);
  });

  it('EVERY bus (SN + each nN) carries its OWN idyn verdict — multi-nN G9 has NO failed/blank ip', () => {
    for (const key of ['G4-PVTR', 'G8-BIOGAZ', 'G9-GPO']) {
      const { txt, companion } = autoText(key);
      expect(txt).not.toContain('✗'); // every per-bus Idyn ≥ ip (real nameplates, no fabrication)
      for (const b of Object.values(companion.short_circuit.buses)) {
        expect(b.idyn_ka).toBeGreaterThan(0);
        expect(b.max.ip_ka).toBeLessThanOrEqual(b.idyn_ka);
        // ip is shown WITH a dynamic verdict (no bare "ip … kA" without "· idyn …").
        expect(txt).toContain(`${fmt(b.max.ip_ka, 1)} kA · idyn ${fmt(b.idyn_ka, 0)} ✓`);
      }
    }
  });

  it('1f-z restored from grid_earthing (kompensowana on SN)', () => {
    const { txt, companion } = autoText('G8-BIOGAZ');
    expect(txt).toContain(`${fmt(companion.source.grid_earthing!.ik_1f_ka)} kA · kompensowana`);
  });

  it('share = local per-type breakdown, NOT a raw enum (G8 synchronous → sieć + maszyna)', () => {
    const { txt, companion } = autoText('G8-BIOGAZ');
    const scb = companion.short_circuit.buses['SN_PCC'];
    const mach = scb.source_contribution.ik_contribution_ka;
    expect(txt).toContain(`sieć ${fmt(scb.max.ikss_ka - mach, 1)} + maszyna ${fmt(mach, 2)} kA`);
    expect(txt).not.toContain('SYNCHRONOUS'); // no raw enum (the previous regression)
  });

  it('ik3f matches the companion (same numbers as the preset)', () => {
    const { txt, companion } = autoText('G8-BIOGAZ');
    const scb = companion.short_circuit.buses['SN_PCC'];
    expect(txt).toContain(`${fmt(scb.max.ikss_ka, 1)} / ${fmt(scb.min.ikss_ka, 1)} kA`);
  });

  it('G9 per-node: collector MIXED (sieć+masz+IBG); LV node shows only its LOCAL source', () => {
    const c = OZE_ARCHETYPES_2A['G9-GPO'];
    const layout = layoutStation(companionToStationModel(c));
    const { container } = render(
      <svg>
        <StationAutoRenderer layout={layout} companion={c} />
      </svg>,
    );
    const txt = container.textContent ?? '';
    // collector (SN) — all three terms.
    expect(txt).toMatch(/sieć [\d,]+ \+ masz [\d,]+ \+ IBG [\d,]+ kA/);
    // WIND_NN (async machine, no local IBG): its readout must NOT carry a spurious cross-bus IBG.
    const windIk = fmt(c.short_circuit.buses['WIND_NN'].max.ikss_ka, 1);
    const windReadout = txt.slice(txt.indexOf(windIk));
    // the wind node's share line is "sieć … + masz …" — no IBG term before the next node.
    expect(windReadout).toMatch(/sieć [\d,]+ \+ masz [\d,]+ kA/);
    // PV_NN (IBG, no machine): "sieć … + IBG …".
    expect(txt).toMatch(/sieć [\d,]+ \+ IBG [\d,]+ kA/);
  });

  it('protection annotations — interface NC RfG on the line bay (codes FROM the model)', () => {
    const { txt, companion } = autoText('G8-BIOGAZ');
    expect(txt).toContain('zab. interfejsowe (NC RfG)');
    const iface = companion.fields.find((f) => f.interface_protection)!.protection_codes;
    expect(iface.length).toBeGreaterThan(0);
    for (const code of iface) expect(txt).toContain(code); // 67 · 67N · 27 · 59 · 81U · 81O · …
  });

  it('protection annotations — per-source set on each source bay (G9 mixed: sync/async/IBG)', () => {
    const { txt, companion } = autoText('G9-GPO');
    expect(txt).toContain('zab. pola');
    for (const f of companion.fields.filter((f) => f.role === 'source' && f.protection_codes.length)) {
      for (const code of f.protection_codes) expect(txt).toContain(code);
    }
    // the synchronous-machine set must be there (87G/40/…) and the async set (46/47/49/51/37/32).
    expect(txt).toContain('87G');
    expect(txt).toContain('49');
  });

  it('protection annotations — single-machine archetype (G8) uses source.protection.machine', () => {
    const { txt, companion } = autoText('G8-BIOGAZ');
    for (const code of companion.source.protection!.machine) expect(txt).toContain(code); // 87G/40/32/64/…
  });

  it('transformer carries the vector-group mark (Dyn) on the block transformer', () => {
    // G4-PVTR has one block transformer; G8 (gensets on SN) has none.
    expect(autoText('G4-PVTR').txt).toContain('Dyn');
    expect(autoText('G9-GPO').txt).toContain('Dyn');
  });
});
