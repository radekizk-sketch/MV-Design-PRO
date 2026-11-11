/**
 * Inspektor elementu kanwy — stan aparatu bez fabrykacji (karta #135 × GPZ-PARYTET cz. 2).
 *
 * Narzędzie projektowe nie ma telemetrii. Sekcja „Stan i telemetria aparatu" prawego
 * inspektora (`SekcjaStanuAparatu`, dawniej zakładka panelu szczegółów kanwy) pokazuje:
 *  - POŁOŻENIE łącznika z MODELU — ten sam rachunek co glif kanwy
 *    (`stanLacznikaPolaZModelu` / `stanAparatuZModelu`: `status` gałęzi łączeniowej
 *    rozstrzygnięty rekordami aparatów pola; rekord sprzeczny albo nieznany = nieustalony);
 *  - TELEMETRIĘ (tryb sterowania, komunikacja, uzależnienie, chwila zmiany) WYŁĄCZNIE z rekordu
 *    ŹRÓDŁA runtime zapisanego w modelu (kolejność backendu
 *    `enm.interlock_rules.runtime_state_record`: rekord `switch_state` aparatu pierwotnego pola,
 *    potem `Bay.runtime_state.primary_device_states`). Bez rekordu — „brak telemetrii", nigdy
 *    „LOKALNY / Komunikacja: OK / nieaktywne".
 *
 * Iloczyn cech: położenie {gałąź łączeniowa closed / open / bez statusu} × powiązanie
 * {aparat pierwotny z `linked_ref` do gałęzi, sama gałąź w `equipment_refs`, uziemnik bez
 * gałęzi} × rekord aparatu {brak, zgodny, sprzeczny, „nieznany"} — oraz telemetria {rekord w
 * runtime_state, rekord aparatu pierwotnego, brak rekordu} × {komunikacja true / false / brak} ×
 * {blokada true / false / brak}. Wyrocznia położenia: projekcja aparatów kanwy
 * (`projectBayPrimaryDevices(…).switchState`) — inspektor i glif z jednego źródła.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { makeCalculationReadySnapshot } from '../../../../test/enmCalculationSnapshot';
import type { Bay, BayDeviceState, BayPrimaryDevice, BaySwitchState, EnergyNetworkModel } from '../../../../types/enm';
import { buildSldDataFromSnapshot, projectBayPrimaryDevices } from '../../v2/canvas/enmToSldAdapter';
import { buildDaneElementuStacji, type DaneElementuKanwy } from '../daneElementuKanwy';
import { BRAK_POLOZENIA_W_MODELU, SekcjaStanuAparatu } from '../../../network-build/inspektor-elementu/PanelElementuKanwy';
import { OPIS_POLOZENIA_PL } from '../../v2/model/stanAparatowPola';
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

function danePanelu(snapshot: EnergyNetworkModel): DaneElementuKanwy | null {
  return buildDaneElementuStacji(
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

describe('panel elementu — telemetria tylko ze źródła runtime, położenie z modelu', () => {
  for (const zrodlo of ['runtime', 'aparat'] as const) {
    for (const komunikacja of KOMUNIKACJA) {
      for (const blokada of BLOKADA) {
        it(`źródło=${zrodlo} komunikacja=${String(komunikacja)} blokada=${String(blokada)} — rekord telemetrii przechodzi bez zmian`, () => {
          const dane = danePanelu(
            snapshotZPolem(zrodlo, {
              actual_state: 'otwarty',
              control_mode: komunikacja === null ? null : 'zdalne',
              communication_ok: komunikacja,
              interlock_blocked: blokada,
            }),
          );
          expect(dane?.apparatusState).toEqual({
            // Położenie: rekord `runtime_state` NIE jest źródłem położenia (glif go nie czyta) —
            // decyduje `status` gałęzi `cb-1` (closed). Aparat pierwotny bez `linked_ref` nie
            // ma gałęzi, więc jego położeniem jest rekord aparatu (`otwarty`), jak na glifie.
            actualState: zrodlo === 'runtime' ? 'closed' : 'open',
            controlMode: komunikacja === null ? null : 'zdalne',
            communicationOk: komunikacja,
            interlockBlocked: blokada,
            lastChangeAt: null,
          });
        });
      }
    }
  }

  it('brak rekordu — położenie z gałęzi pola, telemetria pusta (nie wartość domyślna)', () => {
    const dane = danePanelu(snapshotZPolem('brak', { actual_state: 'otwarty' }));
    expect(dane?.apparatusState).toEqual({
      actualState: 'closed',
      controlMode: null,
      communicationOk: null,
      interlockBlocked: null,
      lastChangeAt: null,
    });
  });

  it('napęd rozbrojony zachowuje położenie mechaniczne (jak glif kanwy)', () => {
    const snapshot = snapshotZPolem('aparat', { actual_state: 'zamkniety_naped_rozbrojony' });
    expect(danePanelu(snapshot)?.apparatusState?.actualState).toBe('closed');
  });
});

type StatusGalezi = 'closed' | 'open' | 'brak';
type RekordAparatu = 'brak' | 'zgodny' | 'sprzeczny' | 'nieznany';

/** Pole z gałęzią łączeniową `cb-1` (status wg cechy), aparatem pierwotnym `dev-cb` powiązanym
 *  `linked_ref` z gałęzią (rekord wg cechy) i uziemnikiem `dev-es` bez gałęzi. */
function poleZPowiazaniem(status: StatusGalezi, rekord: RekordAparatu): EnergyNetworkModel {
  const snapshot = snapshotZPolem('brak', { actual_state: 'otwarty' });
  const galaz = snapshot.branches.find((b) => b.ref_id === 'cb-1')!;
  if (status === 'brak') delete (galaz as { status?: string }).status;
  else (galaz as { status: string }).status = status;
  const zgodnyStan: BayDeviceState = status === 'open' ? 'otwarty' : 'zamkniety';
  const sprzecznyStan: BayDeviceState = status === 'open' ? 'zamkniety' : 'otwarty';
  const stanRekordu: BayDeviceState | null =
    rekord === 'zgodny' ? zgodnyStan : rekord === 'sprzeczny' ? sprzecznyStan : rekord === 'nieznany' ? 'nieznany' : null;
  const aparaty: BayPrimaryDevice[] = [
    {
      device_ref: 'dev-cb',
      symbol_ref: 'symbol:cb',
      kind: 'CB',
      placement: 'MIDSTREAM',
      is_controllable: true,
      linked_ref: 'cb-1',
      ...(stanRekordu ? { switch_state: { actual_state: stanRekordu } } : {}),
    },
    {
      device_ref: 'dev-es',
      symbol_ref: 'symbol:es',
      kind: 'ES',
      placement: 'GROUND_BRANCH',
      is_controllable: false,
      ...(stanRekordu ? { switch_state: { actual_state: stanRekordu } } : {}),
    },
  ];
  snapshot.bays = [{ ...snapshot.bays![0], primary_devices: aparaty }];
  return snapshot;
}

function stanGlifu(snapshot: EnergyNetworkModel, deviceRef: string): 'closed' | 'open' | 'unknown' | 'earthed' | 'bad' | undefined {
  const galezie = new Map(snapshot.branches.map((b) => [b.ref_id, b]));
  return projectBayPrimaryDevices(snapshot.bays![0], galezie, snapshot.bays)?.find((d) => d.deviceRef === deviceRef)?.switchState;
}

function polozenie(snapshot: EnergyNetworkModel, ref: string) {
  return buildDaneElementuStacji(snapshot, buildSldDataFromSnapshot(snapshot, null), null, 'apparatus', ref)
    ?.apparatusState?.actualState ?? undefined;
}

describe('położenie łącznika w inspektorze = stan glifu kanwy (jedno źródło)', () => {
  const STATUSY: readonly StatusGalezi[] = ['closed', 'open', 'brak'];
  const REKORDY: readonly RekordAparatu[] = ['brak', 'zgodny', 'sprzeczny', 'nieznany'];
  for (const status of STATUSY) {
    for (const rekord of REKORDY) {
      it(`gałąź ${status} × rekord ${rekord}: aparat powiązany i uziemnik jak na glifie`, () => {
        const snapshot = poleZPowiazaniem(status, rekord);
        for (const ref of ['dev-cb', 'dev-es']) {
          expect(polozenie(snapshot, ref), ref).toBe(stanGlifu(snapshot, ref));
        }
        // Wartości oczekiwane jawnie (wyrocznia nie może być pusta): aparat powiązany z gałęzią
        // bierze `status`, rekord sprzeczny albo „nieznany" daje nieustalony.
        const oczekiwaneCb = status === 'brak'
          ? 'unknown'
          : rekord === 'sprzeczny' || rekord === 'nieznany'
            ? 'unknown'
            : status;
        expect(polozenie(snapshot, 'dev-cb')).toBe(oczekiwaneCb);
        expect(polozenie(snapshot, 'dev-es')).toBe(
          rekord === 'brak' ? undefined : rekord === 'nieznany' ? 'unknown' : rekord === 'zgodny' ? (status === 'open' ? 'open' : 'closed') : status === 'open' ? 'closed' : 'open',
        );
      });
    }
  }

  it('sama gałąź w `equipment_refs` (bez aparatu pierwotnego): położenie = `status` gałęzi', () => {
    for (const status of ['closed', 'open'] as const) {
      const snapshot = snapshotZPolem('brak', { actual_state: 'otwarty' });
      (snapshot.branches.find((b) => b.ref_id === 'cb-1') as { status: string }).status = status;
      expect(polozenie(snapshot, 'cb-1')).toBe(status);
    }
  });
});

describe('inspektor — render sekcji stanu bez fabrykacji', () => {
  function tekstStanu(apparatusState: DaneElementuKanwy['apparatusState']): string {
    const { container } = render(<SekcjaStanuAparatu stan={apparatusState} />);
    return container.querySelector('[data-testid="inspektor-stan-aparatu"]')?.textContent ?? '';
  }

  it('brak położenia i rekordu — „brak stanu w modelu" i „brak telemetrii", żadnego „OK", „LOKALNY" ani „zamknięty"', () => {
    const tekst = tekstStanu(null);
    expect(tekst).toContain(BRAK_POLOZENIA_W_MODELU);
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

  for (const [stan, etykieta] of Object.entries(OPIS_POLOZENIA_PL)) {
    it(`położenie ${stan} — etykieta „${etykieta}", telemetria nadal „brak telemetrii"`, () => {
      const tekst = tekstStanu({
        actualState: stan as keyof typeof OPIS_POLOZENIA_PL,
        controlMode: null,
        communicationOk: null,
        interlockBlocked: null,
        lastChangeAt: null,
      });
      expect(tekst).toContain(etykieta);
      expect(tekst).toContain(BRAK_TELEMETRII);
      expect(tekst).not.toContain('OK');
    });
  }
});
