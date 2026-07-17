/**
 * F12-B (docs/execplans/SLD_CAD_REBUILD_PLAN_V3.md §F12, spec §10.1 ARCH-4 —
 * pozycja „NetworkHierarchyTree"): budowa `Hierarchy` (`v2/domain/HierarchyTree.ts`
 * `buildHierarchy`) z ENM snapshot, WSPÓŁDZIELONA między v2
 * (`SldWorkspaceContainer.tsx`) i v3 (`SldCanvasV3Workspace.tsx`).
 *
 * ŹRÓDŁO: wyciągnięte 1:1 z `useMemo` `networkHierarchy` w
 * `v2/canvas/SldWorkspaceContainer.tsx` (Iter 11, komentarz „buduj hierarchię
 * z snapshot dla drzewa GPZ→Sekcja→Pole"). Mapowanie snapshot →
 * `EnmInputForHierarchy` jest DEFENSYWNE (strukturalny match z fallbackami
 * dla brakujących pól) — ENM snapshot types (`types/enm.ts`) różnią się od
 * `HierarchyTree`-input, ZERO zmiany zachowania względem oryginału.
 *
 * Czysta funkcja (zero DOM/store) — v2 i v3 wołają ją identycznie wewnątrz
 * własnego `useMemo(() => buildNetworkHierarchyFromSnapshot(snapshot), [snapshot])`.
 */
import { buildHierarchy, type EnmInputForHierarchy, type Hierarchy } from '../v2/domain/HierarchyTree';
import type { EnergyNetworkModel } from '../../../types/enm';

const EMPTY_HIERARCHY_INPUT: EnmInputForHierarchy = {
  substations: [],
  bays: [],
  buses: [],
  sources: [],
  line_runs: [],
  generators: [],
};

export function buildNetworkHierarchyFromSnapshot(snapshot: EnergyNetworkModel | null): Hierarchy {
  if (!snapshot) {
    return buildHierarchy(EMPTY_HIERARCHY_INPUT);
  }
  // Mapowanie snapshot → EnmInputForHierarchy w trybie defensywnym.
  // ENM snapshot types (z types/enm.ts) różnią się od HierarchyTree-input.
  // Używamy strukturalnego match'u z fallbackami dla brakujących pól.
  const enmInput = {
    substations: ((snapshot.substations ?? []) as readonly unknown[]).map(
      (raw): EnmInputForHierarchy['substations'][number] => {
        const s = raw as Record<string, unknown>;
        return {
          ref_id: String(s.ref_id ?? ''),
          name: String(s.name ?? s.ref_id ?? ''),
          station_type: String(s.station_type ?? 'mv_lv'),
          bus_refs: Array.isArray(s.bus_refs) ? (s.bus_refs as string[]) : [],
          gpz_sections: Array.isArray(s.gpz_sections)
            ? (s.gpz_sections as EnmInputForHierarchy['substations'][number]['gpz_sections'])
            : undefined,
        };
      },
    ),
    bays: ((snapshot.bays ?? []) as readonly unknown[]).map(
      (raw): EnmInputForHierarchy['bays'][number] => {
        const b = raw as Record<string, unknown>;
        return {
          ref_id: String(b.ref_id ?? ''),
          name: String(b.name ?? b.ref_id ?? ''),
          bay_role: (b.bay_role as EnmInputForHierarchy['bays'][number]['bay_role']) ?? 'OUT',
          substation_ref: String(b.substation_ref ?? ''),
          bus_ref: String(b.bus_ref ?? ''),
        };
      },
    ),
    buses: ((snapshot.buses ?? []) as readonly unknown[]).map(
      (raw): EnmInputForHierarchy['buses'][number] => {
        const b = raw as Record<string, unknown>;
        return {
          ref_id: String(b.ref_id ?? ''),
          voltage_kv: Number(b.voltage_kv ?? 15),
          name: String(b.name ?? b.ref_id ?? ''),
        };
      },
    ),
    sources: ((snapshot.sources ?? []) as readonly unknown[]).map(
      (raw): EnmInputForHierarchy['sources'][number] => {
        const s = raw as Record<string, unknown>;
        return {
          ref_id: String(s.ref_id ?? ''),
          bus_ref: String(s.bus_ref ?? ''),
          sk3_mva: typeof s.sk3_mva === 'number' ? s.sk3_mva : null,
        };
      },
    ),
    line_runs: [],
    generators: [],
  } satisfies EnmInputForHierarchy;
  return buildHierarchy(enmInput);
}
