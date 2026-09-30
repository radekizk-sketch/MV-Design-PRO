/**
 * SZYNY-STACJI-LUSTRO (commit 2) — sekcja modelu widoku SLD = szyna GŁÓWNA (`szynaGlownaStacji`).
 * ILOCZYN CECH: rodzaj szyny {szyna główna, zacisk pola SN, szyna za aparatem pola nN
 * (strona dolna transformatora, odpływ), szyna obca (koniec odcinka poza stacją)} × miejsce
 * w modelu widoku {lista sekcji, granica transformatora, przypisanie odpływu}. Dane: model
 * z API `gpzFeeder` (backend `tests/reference_networks/fikstury_enm_sld.py`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel, Substation } from '../../../../../types/enm';
import { szynaGlownaStacji, szynyStacji } from '../../../../shared/szynyStacji';
import { buildTerminalGraph } from '../terminalGraph';
import { buildSldViewModel } from '../viewModel';

const here = dirname(fileURLToPath(import.meta.url));
const enm = (
  JSON.parse(readFileSync(resolve(here, '../../scene/__tests__/fixtures/gpzFeeder.enm.json'), 'utf8')) as {
    readonly enm: EnergyNetworkModel;
  }
).enm;
const graph = buildTerminalGraph(enm);
const vm = buildSldViewModel(graph, enm);
const sekcje = new Set(vm.sections.map((s) => s.busRef));
const stacje = (enm.substations ?? []).filter((s) => s.station_type === 'inline') as Substation[];

describe('model widoku — sekcja = szyna główna pola', () => {
  it('kontrola wejścia: stacje mają zaciski SN i szyny za aparatami nN spoza bus_refs', () => {
    for (const s of stacje) {
      const poza = [...szynyStacji(s, enm.branches ?? [])].filter((r) => !(s.bus_refs ?? []).includes(r));
      expect(poza.length).toBeGreaterThanOrEqual(4);
    }
  });

  it.each(stacje.map((s) => [s.ref_id, s] as const))('%s: żadna szyna stacji spoza bus_refs nie jest sekcją; szyny główne są', (_r, s) => {
    for (const szyna of szynyStacji(s, enm.branches ?? [])) {
      const glowna = szynaGlownaStacji(s, enm.branches ?? [], szyna);
      if (glowna !== null && glowna !== szyna) expect(sekcje.has(szyna)).toBe(false);
    }
    for (const glowna of s.bus_refs ?? []) expect(sekcje.has(glowna)).toBe(true);
  });

  it('granica transformatora stacji: strona górna na sekcji szyny SN, dolna na sekcji szyny nN', () => {
    for (const s of stacje) {
      const tr = (enm.transformers ?? []).find((t) => (s.transformer_refs ?? []).includes(t.ref_id))!;
      const granica = vm.transformerBoundaries.find((b) => b.transformerRef === tr.ref_id)!;
      const sn = (s.bus_refs ?? []).find((r) => r.endsWith('/sn_bus'))!;
      const nn = (s.bus_refs ?? []).find((r) => r.endsWith('/nn_bus'))!;
      expect(tr.hv_bus_ref).not.toBe(sn);
      expect(tr.lv_bus_ref).not.toBe(nn);
      expect(granica.hvSectionId).toBe(`${sn}#section`);
      expect(granica.lvSectionId).toBe(`${nn}#section`);
    }
  });

  it('odpływ: aparat pola nN wychodzi z sekcji szyny nN, a jego koniec też leży w tej sekcji', () => {
    for (const s of stacje) {
      const nn = (s.bus_refs ?? []).find((r) => r.endsWith('/nn_bus'))!;
      const aparaty = (enm.branches ?? []).filter((g) => g.from_bus_ref === nn && typeof g.meta?.nn_field_migrowany_z === 'string');
      expect(aparaty.length).toBeGreaterThan(0);
      for (const g of aparaty) {
        const przypisanie = vm.feederAssignments.find((f) => f.branchRef === g.ref_id)!;
        expect(przypisanie.sectionId).toBe(`${nn}#section`);
        expect(przypisanie.farSectionId).toBe(`${nn}#section`);
      }
    }
  });

  it('szyna obca (koniec odcinka poza stacją) jest własną sekcją; liczba sekcji < liczba węzłów grafu', () => {
    const obce = [...graph.nodes.keys()].filter(
      (r) => !(enm.substations ?? []).some((s) => szynyStacji(s, enm.branches ?? []).has(r)),
    );
    expect(obce.length).toBeGreaterThan(0);
    for (const r of obce) expect(sekcje.has(r)).toBe(true);
    expect(vm.sections.length).toBeLessThan(graph.nodes.size);
  });
});
