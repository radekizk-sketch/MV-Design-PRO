import { describe, expect, it } from 'vitest';
import { resolveAttachedSystemSourceBusIds, resolveOperationalRootBusContext } from '../SLDView';
import type { EnergyNetworkModel } from '../../../types/enm';
import type { AnySldSymbol } from '../../sld-editor/types';

function buildSnapshot(sourceBusIds: string[], busNames: Record<string, string> = {}): EnergyNetworkModel {
  return {
    meta: {
      schema_version: '1',
      timestamp: '1970-01-01T00:00:00.000Z',
      case_id: 'case-1',
      case_name: 'Przypadek testowy',
    },
    sources: sourceBusIds.map((busId, index) => ({
      ref_id: `src-${index + 1}`,
      name: `Źródło ${index + 1}`,
      bus_ref: busId,
      voltage_kv: 15,
      sc_mva: 250,
    })),
    buses: Object.entries(busNames).map(([ref_id, name]) => ({
      ref_id,
      name,
      voltage_kv: 15,
      parent_station_ref: null,
      zone: null,
      is_slack: ref_id === sourceBusIds[0],
      switch_state: null,
      coupling_ref: null,
    })),
    lines: [],
    transformers: [],
    loads: [],
    generators: [],
    switches: [],
    protections: [],
    measurements: [],
    stations: [],
  } as unknown as EnergyNetworkModel;
}

function buildSystemSourceSymbol(id: string, connectedToNodeId: string): AnySldSymbol {
  return {
    id,
    elementId: id,
    elementType: 'Source',
    elementName: id,
    position: { x: 0, y: 0 },
    inService: true,
    connectedToNodeId,
    sourceType: 'SYSTEM_SOURCE',
    slackBus: true,
  } as AnySldSymbol;
}

function buildGpzSections(sectionCount: number, rootBusIds: string[]): any {
  return {
    gpzSections: Array.from({ length: sectionCount }, (_, index) => ({
      sectionId: `S${index + 1}`,
      rootBusId: rootBusIds[index] ?? null,
      rootBusName: `Sekcja GPZ ${index + 1}`,
    })),
  };
}

describe('sldRootContext', () => {
  it('preferuje jawny gpzSections dla pojedynczej sekcji nad fallbackiem snapshot/render', () => {
    const attached = resolveAttachedSystemSourceBusIds(
      buildSnapshot(['bus_snapshot']),
      [buildSystemSourceSymbol('src-rendered', 'bus_rendered')],
      buildGpzSections(1, ['bus_canonical']),
    );

    expect([...attached]).toEqual(['bus_canonical']);
  });

  it('nie zgaduje pierwszej sekcji GPZ przy wielosekcyjnym pustym canvasie', () => {
    const root = resolveOperationalRootBusContext(
      buildSnapshot(['bus_a', 'bus_b']),
      [],
      buildGpzSections(2, ['bus_root_a', 'bus_root_b']),
    );

    expect(root).toEqual({
      rootBusId: null,
      rootBusName: null,
    });
  });

  it('nie zgaduje roota z wielu jawnych źródeł systemowych bez kanonicznej annotacji', () => {
    const root = resolveOperationalRootBusContext(
      buildSnapshot(['bus_a', 'bus_b']),
      [],
      null,
    );

    expect(root).toEqual({
      rootBusId: null,
      rootBusName: null,
    });
  });

  it('nie oznacza wielu busów jako root-bus z attached source, gdy brak kanonicznej annotacji GPZ', () => {
    const attached = resolveAttachedSystemSourceBusIds(
      buildSnapshot(['bus_a', 'bus_b']),
      [],
      null,
    );

    expect([...attached]).toEqual([]);
  });

  it('wybiera root z annotacji GPZ nawet gdy snapshot ma kilka źródeł', () => {
    const root = resolveOperationalRootBusContext(
      buildSnapshot(['bus_b', 'bus_a'], {
        bus_canonical: 'Szyna GPZ sekcja 1',
      }),
      [],
      buildGpzSections(1, ['bus_canonical']),
    );

    expect(root).toEqual({
      rootBusId: 'bus_canonical',
      rootBusName: 'Sekcja GPZ 1',
    });
  });
});
