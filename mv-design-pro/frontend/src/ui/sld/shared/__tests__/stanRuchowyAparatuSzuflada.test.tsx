/**
 * Szuflada SLD — stan ruchowy aparatu bez fabrykacji (karta #135).
 *
 * Narzędzie projektowe nie ma telemetrii. Zakładka „Stan + telemetria" aparatu czyta rekord
 * ŹRÓDŁA runtime zapisany w modelu (ta sama kolejność co backend
 * `enm.interlock_rules.runtime_state_record`: rekord `switch_state` aparatu pierwotnego pola,
 * potem `Bay.runtime_state.primary_device_states`). Bez źródła szuflada pokazuje „brak
 * telemetrii" — nigdy „zamknięty / LOKALNY / Komunikacja: OK / nieaktywne".
 *
 * Iloczyn cech: {rekord w runtime_state, rekord aparatu pierwotnego, brak rekordu} ×
 * {komunikacja true / false / brak} × {blokada true / false / brak} — dane szuflady i render.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeCalculationReadySnapshot } from '../../../../test/enmCalculationSnapshot';
import type { Bay, BaySwitchState, EnergyNetworkModel } from '../../../../types/enm';
import { SldDetailDrawer, type SldDetailDrawerData } from '../../v2/canvas/SldDetailDrawer';
import { buildSldDataFromSnapshot } from '../../v2/canvas/enmToSldAdapter';
import { buildStationBranchDetailDrawerData } from '../detailDrawerData';
import { BRAK_TELEMETRII } from '../../../field/fieldLabels';

type Zrodlo = 'runtime' | 'aparat' | 'brak';

function snapshotZPolem(zrodlo: Zrodlo, rekord: BaySwitchState): EnergyNetworkModel {
  const snapshot = makeCalculationReadySnapshot();
  snapshot.branches.push({
    id: 'cb-1',
    ref_id: 'cb-1',
    name: 'Wyłącznik pola',
    tags: [],
    meta: {},
    type: 'breaker',
    from_bus_ref: 'bus-source',
    to_bus_ref: 'bus-load',
    status: 'closed',
  });
  const pole: Bay = {
    id: 'bay-1',
    ref_id: 'bay-1',
    name: 'Pole 1',
    tags: [],
    meta: {},
    bay_role: 'OUT',
    substation_ref: 'st-1',
    bus_ref: 'bus-source',
    equipment_refs: ['cb-1'],
  };
  if (zrodlo === 'runtime') {
    pole.runtime_state = {
      secondary_communication_status: 'ok',
      control_availability: 'dostepne',
      measurement_availability: 'dostepne',
      primary_device_states: { 'cb-1': rekord },
      active_alarms: [],
      pending_command: null,
      energization_and_safety: {
        energized_from_bus_side: false,
        energized_from_feeder_side: false,
        grounded: false,
        visible_isolation_gap: false,
        safe_to_work: false,
      },
    };
  }
  if (zrodlo === 'aparat') {
    pole.primary_devices = [
      {
        device_ref: 'cb-1',
        symbol_ref: 'symbol:cb',
        kind: 'CB',
        placement: 'MIDSTREAM',
        is_controllable: true,
        switch_state: rekord,
      },
    ];
  }
  snapshot.bays = [pole];
  return snapshot;
}

function daneSzuflady(snapshot: EnergyNetworkModel): SldDetailDrawerData | null {
  return buildStationBranchDetailDrawerData(
    snapshot,
    buildSldDataFromSnapshot(snapshot, null),
    null,
    'apparatus',
    'cb-1',
  );
}

const KOMUNIKACJA: ReadonlyArray<boolean | null> = [true, false, null];
const BLOKADA: ReadonlyArray<boolean | null> = [true, false, null];

afterEach(() => cleanup());

describe('szuflada — dane stanu aparatu tylko ze źródła runtime', () => {
  for (const zrodlo of ['runtime', 'aparat'] as const) {
    for (const komunikacja of KOMUNIKACJA) {
      for (const blokada of BLOKADA) {
        it(`źródło=${zrodlo} komunikacja=${String(komunikacja)} blokada=${String(blokada)} — rekord przechodzi bez zmian`, () => {
          const dane = daneSzuflady(
            snapshotZPolem(zrodlo, {
              actual_state: 'otwarty',
              control_mode: komunikacja === null ? null : 'zdalne',
              communication_ok: komunikacja,
              interlock_blocked: blokada,
            }),
          );
          expect(dane?.apparatusState).toEqual({
            actualState: 'open',
            controlMode: komunikacja === null ? null : 'zdalne',
            communicationOk: komunikacja,
            interlockBlocked: blokada,
            lastChangeAt: null,
          });
        });
      }
    }
  }

  it('brak źródła runtime — brak rekordu stanu (nie stan domyślny)', () => {
    const dane = daneSzuflady(snapshotZPolem('brak', { actual_state: 'otwarty' }));
    expect(dane?.apparatusState).toBeNull();
  });

  it('napęd rozbrojony zachowuje położenie mechaniczne (jak adaptery SLD)', () => {
    const dane = daneSzuflady(
      snapshotZPolem('runtime', { actual_state: 'zamkniety_naped_rozbrojony' }),
    );
    expect(dane?.apparatusState?.actualState).toBe('closed');
  });
});

describe('szuflada — render zakładki stanu bez fabrykacji', () => {
  function tekstStanu(apparatusState: SldDetailDrawerData['apparatusState']): string {
    const data: SldDetailDrawerData = { kind: 'apparatus', elementId: 'cb-1', label: 'CB-1', apparatusState };
    const { container } = render(<SldDetailDrawer open data={data} onClose={vi.fn()} />);
    return container.querySelector('[data-testid="drawer-apparatus-state"]')?.textContent ?? '';
  }

  it('brak rekordu — „brak telemetrii", żadnego „OK", „LOKALNY" ani stanu „zamknięty"', () => {
    const tekst = tekstStanu(null);
    expect(tekst).toContain(BRAK_TELEMETRII);
    expect(tekst).not.toContain('OK');
    expect(tekst).not.toContain('LOKALNY');
    expect(tekst).not.toContain('zamknięty');
    expect(tekst).not.toContain('nieaktywne');
  });

  for (const komunikacja of KOMUNIKACJA) {
    it(`komunikacja=${String(komunikacja)} — etykieta z jednego miejsca`, () => {
      const tekst = tekstStanu({
        actualState: 'closed',
        controlMode: 'miejscowe',
        communicationOk: komunikacja,
        interlockBlocked: null,
        lastChangeAt: null,
      });
      if (komunikacja === true) expect(tekst).toContain('OK');
      if (komunikacja === false) expect(tekst).toContain('BŁĄD');
      if (komunikacja === null) {
        expect(tekst).toContain(BRAK_TELEMETRII);
        expect(tekst).not.toContain('OK');
      }
      expect(tekst).toContain('miejscowe');
    });
  }
});
