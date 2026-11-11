/*
 * Etykiety drzewa topologii = NAZWY obiektów, nigdy surowe identyfikatory.
 *
 * Defekt (zrzut e2e `wejscia-na-schemat`, tryb administracyjny): liście szyn stacji
 * pokazywały `stn/dff11f…/…` — adapter wpisywał ref jako `etykietaPL` we WSZYSTKICH
 * budowniczych węzłów (szyna magistrali, źródło, odgałęzienie, węzeł izolowany, szyna
 * stacji, szyna poza stacją), a `ContextTree` renderuje `etykietaPL` wprost.
 *
 * ILOCZYN CECH (CLAUDE.md, KLASA NIE INSTANCJA pkt 2): tryb drzewa (zasilania /
 * obwodowy / administracyjny) × rodzaj węzła (źródło, szyna magistrali, odgałęzienie,
 * węzeł izolowany, szyna stacji, szyna poza stacją) — każdy węzeł niosący `id` obiektu
 * modelu ma etykietę z mostu nazw; plus wpięcie hooka (`useTopologyTree`) w migawkę.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import type { Bay, Substation, TopologyGraphSummary } from '../../../../types/enm';
import type { TopologyStructure } from '../../../../ui/topology/api';
import type { TrybDrzewaTopologii, WezelDrzewa } from '../../treeModel';
import { mapowanieTopologiiDoDrzewa, useTopologyTree } from '../topologyTreeAdapter';
import { useTopologyStore } from '../../../../ui/topology/store';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { ustawMigawkeZElementami } from '../../../../test/schematTestowy';

const REF = {
  zrodlo: 'bus/aaaa1111bbbb2222/gpz',
  magistrala: 'bus/cccc3333dddd4444/st1',
  dalej: 'bus/eeee5555ffff6666/st2',
  odgalezienie: 'bus/1111aaaa2222bbbb/branch_end',
  izolowanyA: 'bus/3333cccc4444dddd/iso_a',
  izolowanyB: 'bus/5555eeee6666ffff/iso_b',
} as const;

const GRUPY = new Set(['magistrala', 'odgalezienia', 'izolowane', 'poza-stacja']);

function summary(): TopologyGraphSummary {
  return {
    case_id: 'c', enm_revision: 1, bus_count: 6, branch_count: 4, transformer_count: 0, source_count: 1,
    load_count: 0, generator_count: 0, measurement_count: 0, protection_count: 0, is_radial: true, has_cycles: false,
    adjacency: [
      { bus_ref: REF.zrodlo, neighbor_ref: REF.magistrala, via_ref: 'k1', via_type: 'line' },
      { bus_ref: REF.magistrala, neighbor_ref: REF.dalej, via_ref: 'k2', via_type: 'line' },
      { bus_ref: REF.magistrala, neighbor_ref: REF.odgalezienie, via_ref: 'k3', via_type: 'line' },
      { bus_ref: REF.izolowanyA, neighbor_ref: REF.izolowanyB, via_ref: 'k4', via_type: 'line' },
    ],
    spine: [
      { bus_ref: REF.zrodlo, depth: 0, is_source: true, children_refs: [REF.magistrala] },
      { bus_ref: REF.magistrala, depth: 1, is_source: false, children_refs: [REF.dalej] },
      { bus_ref: REF.dalej, depth: 2, is_source: false, children_refs: [] },
    ],
    lateral_roots: [REF.odgalezienie],
  };
}

const STACJA = 'stn/9999aaaa8888bbbb';
function struktura(): TopologyStructure {
  return {
    case_id: 'c',
    substations: [{ id: STACJA, ref_id: STACJA, name: 'Stacja Sekcyjna', tags: [], meta: {}, station_type: 'mv_lv', bus_refs: [REF.magistrala], transformer_refs: [] } as unknown as Substation],
    bays: [{ id: 'bay-1', ref_id: 'bay-1', name: 'Pole 1', tags: [], meta: {}, bay_role: 'IN', substation_ref: STACJA, bus_ref: REF.magistrala, equipment_refs: [] } as unknown as Bay],
    junctions: [], corridors: [], bus_count: 6, branch_count: 4, transformer_count: 0,
  };
}

function plaskie(wezly: readonly WezelDrzewa[]): WezelDrzewa[] {
  return wezly.flatMap((w) => [w, ...plaskie(w.dzieci)]);
}

const nazwa = (ref: string) => `Nazwa ${ref.split('/').pop()}`;
const TRYBY: readonly TrybDrzewaTopologii[] = ['zasilania', 'obwodowy', 'administracyjny'];
const WSZYSTKIE_REFY = Object.values(REF);

afterEach(() => {
  useSnapshotStore.setState({ snapshot: null } as never);
  useTopologyStore.setState({ summary: null, structure: null } as never);
});

describe('drzewo topologii: etykieta węzła = nazwa obiektu (tryb × rodzaj węzła)', () => {
  it.each(TRYBY)('tryb „%s": każdy węzeł obiektu modelu nosi nazwę z mostu nazw', (tryb) => {
    const wezly = plaskie(mapowanieTopologiiDoDrzewa(summary(), [], tryb, struktura(), nazwa));
    const obiekty = wezly.filter((w) => !GRUPY.has(w.id) && w.id !== STACJA);
    expect(obiekty.length).toBeGreaterThan(0);
    for (const w of obiekty) expect(w.etykietaPL).toBe(nazwa(w.id));
    // Iloczyn kompletny: tryb obejmuje każdy rodzaj węzła, który w nim występuje.
    const ids = new Set(obiekty.map((w) => w.id));
    const oczekiwane = tryb === 'obwodowy' ? WSZYSTKIE_REFY.filter((r) => r !== REF.zrodlo) : WSZYSTKIE_REFY;
    expect([...ids].sort()).toEqual([...oczekiwane].sort());
  });

  it.each(TRYBY)('tryb „%s" bez migawki: żadna etykieta nie jest surowym identyfikatorem', (tryb) => {
    const wezly = plaskie(mapowanieTopologiiDoDrzewa(summary(), [], tryb, struktura()));
    for (const w of wezly) {
      expect(w.etykietaPL).not.toBe(w.id);
      expect(w.etykietaPL).not.toMatch(/[0-9a-f]{12}/);
    }
  });

  it('tryb administracyjny: grupa stacji zachowuje nazwę ze struktury', () => {
    const wezly = mapowanieTopologiiDoDrzewa(summary(), [], 'administracyjny', struktura(), nazwa);
    expect(wezly.find((w) => w.id === STACJA)?.etykietaPL).toBe('Stacja Sekcyjna');
  });

  it('hook `useTopologyTree` bierze nazwy z migawki modelu (to samo źródło co schemat)', () => {
    ustawMigawkeZElementami([
      { kolekcja: 'buses', id: REF.magistrala, name: 'Szyna SN stacji sekcyjnej', pola: { voltage_kv: 15 } },
    ]);
    useTopologyStore.setState({ summary: summary(), structure: struktura() } as never);
    const { result } = renderHook(() => useTopologyTree('administracyjny'));
    const lisc = plaskie(result.current).find((w) => w.id === REF.magistrala);
    expect(lisc?.etykietaPL).toBe('Szyna SN stacji sekcyjnej');
  });
});
