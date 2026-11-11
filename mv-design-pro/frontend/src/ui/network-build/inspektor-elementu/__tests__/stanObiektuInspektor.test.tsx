/**
 * Inspektor obiektu schematu — stan obiektu (istniejący / projektowany) przez operację
 * `set_object_state` (zakaz gazów fluorowanych w obiektach projektowanych, rozporządzenie (UE)
 * 2024/573, art. 13 ust. 9). Decyzja architekta 2026-11-11: karta łącznika (`SwitchCard`,
 * bez konsumenta produkcyjnego) skasowana; zdolność „stan samodzielnego łącznika" żyje w
 * `ui/field/EdytorStanuObiektuPola.tsx`, osadzonym w inspektorze (`PanelElementuKanwy`) i w
 * rejestrze formularzy (`OPERATION_FORM_REGISTRY.set_object_state`).
 *
 * Ścieżka użytkownika: wskazanie obiektu (drzewo / wyszukiwarka — selekcja pod refem modelu;
 * aparat pola — wiersz tabeli aparatów karty pola, `wskazanieAparatuPola`) → inspektor
 * z `useStanPaneluElementu` → natywny klik przycisku „Oznacz jako …" (`fireEvent.click`).
 *
 * Iloczyn cech:
 *   obiekt {łącznik poza polem, łącznik w polu bez własnego stanu (`equipment_refs`), łącznik
 *           opisany aparatem pola (`linked_ref`), aparat pola (`device_ref`), pole, bezpiecznik,
 *           odcinek kablowy}
 *   × stan bieżący {ISTNIEJACY, PROJEKTOWANY, brak}
 *   × tryb {MODEL_EDIT — edytor, RESULT_VIEW — bez edytora}
 *   × odpowiedź backendu {sukces, odmowa}
 *   → ładunek operacji (cel z modelu: `switch_ref` / `bay_ref`+`device_ref` / `bay_ref`),
 *     przyciski dla stanów innych niż bieżący, odmowa w komunikacie `role="alert"`.
 * Łącznik opisany aparatem pola idzie przez aparat (`device_ref` — backend ustawia aparat
 * i gałąź razem; `switch_ref` na nim kończy się odmową `object_state.switch_has_bay_device`).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeCalculationReadySnapshot } from '../../../../test/enmCalculationSnapshot';
import type { Bay, Branch, EnergyNetworkModel, StanObiektu } from '../../../../types/enm';
import { useAppStateStore } from '../../../app-state';
import { useSelectionStore } from '../../../selection';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import { useRawResultOverlayStore } from '../../../sld-overlay/rawResultOverlayStore';
import { buildCanvasModelIndex } from '../../../sld/v3/canvas/canvasMenuSubject';
import { useKontekstElementuKanwy } from '../../../sld/shared/kontekstElementuKanwy';
import { OPERATION_FORM_REGISTRY } from '../../../workspace/operationFormRegistry';
import { useNetworkBuildStore } from '../../networkBuildStore';
import { wskazanieAparatuPola } from '../stanPaneluElementu';
import { InspektorKanwyTestowy } from './inspektorKanwyTestowy';

const exec = vi.fn();

function galaz(ref: string, typ: Branch['type'], stan?: StanObiektu): Branch {
  return {
    id: ref,
    ref_id: ref,
    name: `Łącznik ${ref}`,
    tags: [],
    meta: {},
    type: typ,
    from_bus_ref: 'bus-source',
    to_bus_ref: 'bus-load',
    status: 'closed',
    ...(stan ? { stan_obiektu: stan } : {}),
  } as Branch;
}

function pole(extra: Partial<Bay>): Bay {
  return {
    id: 'bay-1',
    ref_id: 'bay-1',
    name: 'Pole L1',
    tags: [],
    meta: {},
    bay_role: 'OUT',
    substation_ref: 'st-1',
    bus_ref: 'bus-source',
    equipment_refs: [],
    ...extra,
  } as Bay;
}

function model(galezie: Branch[], pola: Bay[] = []): EnergyNetworkModel {
  const snapshot = makeCalculationReadySnapshot();
  snapshot.branches.push(...galezie);
  snapshot.bays = pola;
  // Stacja-właścicielka pól (`Bay.substation_ref`) — pole poza stacją nie jest obiektem schematu.
  snapshot.substations = [
    { id: 'st-1', ref_id: 'st-1', name: 'Stacja S1', tags: [], meta: {}, station_type: 'mv_lv', bus_refs: ['bus-source'] },
  ] as unknown as EnergyNetworkModel['substations'];
  return snapshot;
}

function montuj(enm: EnergyNetworkModel, ref: string): void {
  useSnapshotStore.setState({ snapshot: enm, executeDomainOperation: exec });
  render(<InspektorKanwyTestowy />);
  // Wskazanie spoza kanwy (drzewo projektu / wyszukiwarka): selekcja pod refem modelu.
  act(() => useSelectionStore.getState().selectElement({ id: ref, type: 'Switch', name: ref }));
}

function przyciski(): string[] {
  return screen
    .queryAllByRole('button', { name: /^Oznacz (pole )?jako / })
    .map((b) => b.textContent ?? '');
}

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useAppStateStore.setState({ activeCaseId: 'case-1', activeCaseResultStatus: 'NONE', activeMode: 'MODEL_EDIT' });
  exec.mockReset().mockResolvedValue({ error: null });
});
afterEach(() => {
  cleanup();
  useKontekstElementuKanwy.getState().wyczysc();
  useAppStateStore.setState({ activeCaseId: null, activeCaseResultStatus: 'NONE', activeMode: 'MODEL_EDIT' });
});

const STANY: readonly (StanObiektu | undefined)[] = ['ISTNIEJACY', 'PROJEKTOWANY', undefined];
const NAZWA: Record<StanObiektu, string> = { ISTNIEJACY: 'istniejący', PROJEKTOWANY: 'projektowany' };

describe('inspektor — łącznik poza polem (rozłącznik sekcyjny, sprzęgło)', () => {
  for (const typ of ['switch', 'breaker', 'disconnector', 'bus_coupler'] as const) {
    for (const stan of STANY) {
      it(`${typ} × stan ${stan ?? 'brak'}: przyciski stanów innych niż bieżący, klik → switch_ref`, async () => {
        montuj(model([galaz('sw-1', typ, stan)]), 'sw-1');
        const wartosc = await screen.findByTestId('stan-obiektu-elementu-wartosc');
        expect(wartosc.getAttribute('data-stan')).toBe(stan ?? '');
        const oczekiwane = (['ISTNIEJACY', 'PROJEKTOWANY'] as const).filter((s) => s !== stan);
        expect(przyciski()).toEqual(oczekiwane.map((s) => `Oznacz jako ${NAZWA[s]}`));
        fireEvent.click(screen.getByRole('button', { name: `Oznacz jako ${NAZWA[oczekiwane[0]]}` }));
        await waitFor(() =>
          expect(exec).toHaveBeenCalledWith('case-1', 'set_object_state', {
            switch_ref: 'sw-1',
            stan_obiektu: oczekiwane[0],
          }),
        );
      });
    }
  }

  it('odmowa backendu wraca zdaniem w komunikacie role="alert"', async () => {
    exec.mockResolvedValue({ error: 'Łącznik sw-1 zawiera gaz fluorowany (SF₆) — wybierz wykonanie bez gazów.' });
    montuj(model([galaz('sw-1', 'switch', 'ISTNIEJACY')]), 'sw-1');
    fireEvent.click(await screen.findByRole('button', { name: 'Oznacz jako projektowany' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('zawiera gaz fluorowany (SF₆)');
  });

  it('tryb wyników (RESULT_VIEW): bez edytora stanu — zmiana modelu tylko w trybie edycji', async () => {
    useAppStateStore.setState({ activeMode: 'RESULT_VIEW' });
    montuj(model([galaz('sw-1', 'switch', 'PROJEKTOWANY')]), 'sw-1');
    await screen.findByTestId('inspektor-element-kanwy');
    expect(screen.queryByTestId('inspektor-stan-obiektu')).toBeNull();
    expect(przyciski()).toEqual([]);
  });
});

describe('inspektor — łącznik w polu', () => {
  it('bez własnego stanu w `equipment_refs` pola: stan pola, akcja ze switch_ref', async () => {
    const enm = model(
      [galaz('sw-1', 'disconnector')],
      [pole({ stan_obiektu: 'PROJEKTOWANY', equipment_refs: ['sw-1'] })],
    );
    montuj(enm, 'sw-1');
    expect((await screen.findByTestId('stan-obiektu-elementu-wartosc')).getAttribute('data-stan')).toBe('PROJEKTOWANY');
    expect(screen.getByTestId('stan-obiektu-elementu-uwaga')).toHaveTextContent('ma stan pola „Pole L1”');
    fireEvent.click(screen.getByRole('button', { name: 'Oznacz jako istniejący' }));
    await waitFor(() =>
      expect(exec).toHaveBeenCalledWith('case-1', 'set_object_state', { switch_ref: 'sw-1', stan_obiektu: 'ISTNIEJACY' }),
    );
  });

  for (const stan of STANY) {
    it(`opisany aparatem pola (linked_ref) × stan ${stan ?? 'brak'}: cel = aparat (bay_ref + device_ref)`, async () => {
      const enm = model(
        [galaz('sw-1', 'breaker', stan)],
        [
          pole({
            stan_obiektu: 'ISTNIEJACY',
            equipment_refs: ['sw-1'],
            primary_devices: [
              { device_ref: 'cb-1', kind: 'CB', placement: 'MIDSTREAM', linked_ref: 'sw-1', ...(stan ? { stan_obiektu: stan } : {}) },
            ] as Bay['primary_devices'],
          }),
        ],
      );
      montuj(enm, 'sw-1');
      expect((await screen.findByTestId('stan-obiektu-elementu-wartosc')).getAttribute('data-stan')).toBe(stan ?? '');
      expect(screen.getByTestId('stan-obiektu-elementu-uwaga')).toHaveTextContent('zmiana obejmuje oba');
      const cel = stan === 'ISTNIEJACY' ? 'PROJEKTOWANY' : 'ISTNIEJACY';
      fireEvent.click(screen.getByRole('button', { name: `Oznacz jako ${NAZWA[cel]}` }));
      await waitFor(() =>
        expect(exec).toHaveBeenCalledWith('case-1', 'set_object_state', {
          bay_ref: 'bay-1',
          device_ref: 'cb-1',
          stan_obiektu: cel,
        }),
      );
      expect(exec.mock.calls.some((c) => 'switch_ref' in (c[2] as Record<string, unknown>))).toBe(false);
    });
  }

  it('aparat pola wskazany z wiersza karty pola (bez gałęzi): bay_ref + device_ref', async () => {
    const enm = model(
      [],
      [
        pole({
          stan_obiektu: 'ISTNIEJACY',
          primary_devices: [
            { device_ref: 'es-1', kind: 'ES', placement: 'MIDSTREAM', stan_obiektu: 'ISTNIEJACY' },
          ] as Bay['primary_devices'],
        }),
      ],
    );
    useSnapshotStore.setState({ snapshot: enm, executeDomainOperation: exec });
    render(<InspektorKanwyTestowy />);
    const { zaznaczenie, kontekst } = wskazanieAparatuPola(
      enm,
      buildCanvasModelIndex(enm),
      { rodzaj: 'aparat', poleRef: 'bay-1', aparatRef: 'es-1' },
      false,
    );
    act(() => {
      useKontekstElementuKanwy.getState().ustawKontekst(kontekst);
      useSelectionStore.getState().selectElement(zaznaczenie);
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Oznacz jako projektowany' }));
    await waitFor(() =>
      expect(exec).toHaveBeenCalledWith('case-1', 'set_object_state', {
        bay_ref: 'bay-1',
        device_ref: 'es-1',
        stan_obiektu: 'PROJEKTOWANY',
      }),
    );
  });
});

describe('inspektor — pole rozdzielnicy', () => {
  for (const stan of STANY) {
    it(`pole × stan ${stan ?? 'brak'}: edytor pola, klik → bay_ref (pole z aparatami)`, async () => {
      const enm = model([], [pole({ ...(stan ? { stan_obiektu: stan } : {}) })]);
      montuj(enm, 'bay-1');
      const wartosc = await screen.findByTestId('stan-obiektu-pola-wartosc');
      expect(wartosc.getAttribute('data-stan')).toBe(stan ?? '');
      const cel = stan === 'ISTNIEJACY' ? 'PROJEKTOWANY' : 'ISTNIEJACY';
      fireEvent.click(screen.getByTestId(`stan-obiektu-pola-ustaw-${cel}`));
      await waitFor(() =>
        expect(exec).toHaveBeenCalledWith('case-1', 'set_object_state', { bay_ref: 'bay-1', stan_obiektu: cel }),
      );
    });
  }
});

describe('inspektor — obiekty bez stanu obiektu', () => {
  it('bezpiecznik (bez komory gaszeniowej z gazem): bez edytora stanu', async () => {
    montuj(model([galaz('fu-1', 'fuse')]), 'fu-1');
    await screen.findByTestId('inspektor-element-kanwy');
    expect(screen.queryByTestId('inspektor-stan-obiektu')).toBeNull();
  });

  it('odcinek kablowy: bez edytora stanu', async () => {
    montuj(model([]), 'line-1');
    await screen.findByTestId('inspektor-element-kanwy');
    expect(screen.queryByTestId('inspektor-stan-obiektu')).toBeNull();
  });
});

describe('rejestr formularzy — `set_object_state` z kontekstu otwarcia', () => {
  const przypadki: readonly (readonly [string, Record<string, unknown>, Record<string, unknown>])[] = [
    ['switch_ref', { switch_ref: 'sw-1' }, { switch_ref: 'sw-1' }],
    ['element_ref łącznika (akcja naprawcza)', { element_ref: 'sw-1' }, { switch_ref: 'sw-1' }],
    ['bay_ref', { bay_ref: 'bay-1' }, { bay_ref: 'bay-1' }],
    ['bay_ref + device_ref', { bay_ref: 'bay-1', device_ref: 'cb-1' }, { bay_ref: 'bay-1', device_ref: 'cb-1' }],
  ];
  for (const [nazwa, kontekst, ladunek] of przypadki) {
    it(`${nazwa}: ten sam edytor, klik → set_object_state`, async () => {
      const enm = model(
        [galaz('sw-1', 'switch', 'ISTNIEJACY')],
        [
          pole({
            stan_obiektu: 'ISTNIEJACY',
            primary_devices: [
              { device_ref: 'cb-1', kind: 'CB', placement: 'MIDSTREAM', stan_obiektu: 'ISTNIEJACY' },
            ] as Bay['primary_devices'],
          }),
        ],
      );
      useSnapshotStore.setState({ snapshot: enm, executeDomainOperation: exec });
      act(() => useNetworkBuildStore.getState().openOperationForm('set_object_state', kontekst));
      const Formularz = OPERATION_FORM_REGISTRY.set_object_state;
      expect(Formularz).not.toBeNull();
      if (!Formularz) return;
      render(<Formularz />);
      const przycisk = 'bay_ref' in ladunek && !('device_ref' in ladunek)
        ? screen.getByTestId('stan-obiektu-pola-ustaw-PROJEKTOWANY')
        : screen.getByRole('button', { name: 'Oznacz jako projektowany' });
      fireEvent.click(przycisk);
      await waitFor(() =>
        expect(exec).toHaveBeenCalledWith('case-1', 'set_object_state', { ...ladunek, stan_obiektu: 'PROJEKTOWANY' }),
      );
      act(() => useNetworkBuildStore.getState().closeOperationForm());
    });
  }

  it('obiekt bez stanu obiektu (bezpiecznik): komunikat zamiast edytora', () => {
    useSnapshotStore.setState({ snapshot: model([galaz('fu-1', 'fuse')]), executeDomainOperation: exec });
    act(() => useNetworkBuildStore.getState().openOperationForm('set_object_state', { switch_ref: 'fu-1' }));
    const Formularz = OPERATION_FORM_REGISTRY.set_object_state;
    if (!Formularz) throw new Error('brak formularza set_object_state w rejestrze');
    render(<Formularz />);
    expect(screen.getByTestId('formularz-stan-obiektu-brak')).toBeInTheDocument();
    act(() => useNetworkBuildStore.getState().closeOperationForm());
  });
});
