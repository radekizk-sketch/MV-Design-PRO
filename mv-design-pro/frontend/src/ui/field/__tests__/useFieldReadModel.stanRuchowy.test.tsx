/**
 * Model odczytu pola: JEDEN model — odpowiedź backendu `field-view` (karta #135 (e)2).
 *
 * Jedyne miejsce składania stanu łącznika (stan z modelu, telemetria ze źródła runtime,
 * blokada z reguł) jest w backendzie (`application/field_read_model._zloz_stan_ruchowy`).
 * Dawniej klient budował z migawki własny model pola (`buildSnapshotFieldReadModel`) i
 * heurystyką „bogatości" przedkładał go nad odpowiedź backendu — model-cień, który najpierw
 * wymyślał „tryb zdalny, uzbrojony, komunikacja OK", a po karcie #135 dalej konkurował z
 * backendem. Skasowany: bez przypadku albo przy błędzie odczytu hook zwraca uczciwy model
 * pusty (z powodem w `error`), a odpowiedź backendu przechodzi 1:1 (bez dopowiadania stanu).
 *
 * Iloczyn cech: {brak przypadku, przypadek + odpowiedź, przypadek + błąd odczytu} × {migawka z
 * polem, bez migawki}.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeCalculationReadySnapshot } from '../../../test/enmCalculationSnapshot';
import { useAppStateStore } from '../../app-state/store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useFieldReadModel } from '../useFieldReadModel';

afterEach(() => {
  useSnapshotStore.setState({ snapshot: null });
  useAppStateStore.setState({ activeCaseId: null });
  vi.unstubAllGlobals();
});

function migawkaZPolem() {
  const snapshot = makeCalculationReadySnapshot();
  snapshot.bays = [
    {
      id: 'bay-1',
      ref_id: 'bay-1',
      name: 'Pole 1',
      tags: [],
      meta: {},
      bay_role: 'OUT',
      substation_ref: 'st-1',
      bus_ref: 'bus-source',
      equipment_refs: ['cb-1'],
    },
  ];
  return snapshot;
}

describe('useFieldReadModel — jeden model pola (backend), bez modelu-cienia z migawki', () => {
  it.each([true, false])('brak przypadku (migawka z polem: %s) → model pusty, nic nie budowane z migawki', (zMigawka) => {
    useSnapshotStore.setState({ snapshot: zMigawka ? migawkaZPolem() : null });
    const { result } = renderHook(() => useFieldReadModel());
    expect(result.current.data.fields).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('przypadek + odpowiedź backendu → pole 1:1, stan łącznika bez dopowiedzenia', async () => {
    const odpowiedz = {
      fields: [
        {
          bay_ref: 'bay-1',
          bay_id: 'bay-1',
          canonical_model: { base_model: { primary_devices: [{ device_ref: 'cb-1', kind: 'CB', switch_state: null }] } },
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(odpowiedz), { status: 200 })));
    useSnapshotStore.setState({ snapshot: migawkaZPolem() });
    useAppStateStore.setState({ activeCaseId: 'case-backend-1' });
    const { result } = renderHook(() => useFieldReadModel());
    await waitFor(() => expect(result.current.data.fields).toHaveLength(1));
    const wylacznik = result.current.data.fields[0].canonical_model.base_model.primary_devices[0];
    expect(wylacznik.switch_state ?? null).toBeNull();
  });

  it('przypadek + błąd odczytu → model pusty z powodem, migawka NIE zastępuje backendu', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    useSnapshotStore.setState({ snapshot: migawkaZPolem() });
    useAppStateStore.setState({ activeCaseId: 'case-backend-blad' });
    const { result } = renderHook(() => useFieldReadModel());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.data.fields).toEqual([]);
  });
});
