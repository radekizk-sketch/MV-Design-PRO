/*
 * „Oblicz" paska projektu × tor wykonania `uruchomObliczenie` — PREDYKATY PARAMI
 * (karta K1 POWLOKA, reguła KLASA NIE INSTANCJA pkt 3).
 *
 * Przycisk pokazuje przyczynę niedostępności, a tor wykonania odmawia startu. Gdyby
 * oba miały własny warunek, mogłyby się rozjechać: przycisk „gotowe", a bieg
 * odmówiony (albo przycisk „zablokowane", a bieg rusza). Test przechodzi PEŁNY
 * iloczyn stanów wejścia predykatu — zakres {brak, jest} × gotowość {nieodczytana,
 * gotowa, blokada z komunikatem, blokada bez listy} — i na KAŻDYM stanie sprawdza
 * parę: stan przycisku w powłoce (natywny klik) ⇔ start biegu, a zdanie przyczyny
 * przycisku = zdanie komunikatu toru wykonania.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AppShell } from '../../../shell/AppShell';
import { useShellStore } from '../../../shell/useShellStore';
import { przyczynaBlokadyObliczen, uruchomObliczenie } from '../uruchomObliczenie';
import { useAppStateStore } from '../../../../ui/app-state';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useNotificationStore } from '../../../../ui/notifications/store';
import type { ExecutionRun } from '../../../../ui/study-cases/types';
import type { ReadinessInfo } from '../../../../types/enm';

const CASE_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

const ZAKRESY: ReadonlyArray<[string, string | null]> = [
  ['brak zakresu', null],
  ['zakres aktywny', CASE_ID],
];

const GOTOWOSCI: ReadonlyArray<[string, ReadinessInfo | null]> = [
  ['gotowość nieodczytana', null],
  ['gotowy', { ready: true, blockers: [], warnings: [] }],
  [
    'blokada z komunikatem',
    {
      ready: false,
      blockers: [
        { code: 'E005', message_pl: 'Szyna SN-2 nie ma napięcia znamionowego.', element_ref: 'BUS-2', severity: 'BLOCKER' },
      ],
      warnings: [],
    },
  ],
  ['blokada bez listy', { ready: false, blockers: [], warnings: [] }],
];

const initialApp = useAppStateStore.getState();
const initialSnapshot = useSnapshotStore.getState();
const initialRuns = useExecutionRunsStore.getState();

let createAndExecuteRun: Mock<[string, { analysis_type: string }], Promise<ExecutionRun>>;

beforeEach(() => {
  localStorage.clear();
  useAppStateStore.setState(initialApp, true);
  useSnapshotStore.setState(initialSnapshot, true);
  createAndExecuteRun = vi.fn(
    async (_caseId: string, _request: { analysis_type: string }): Promise<ExecutionRun> => ({
      id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      study_case_id: CASE_ID,
      analysis_type: 'SC_3F',
      solver_input_hash: 'hash',
      status: 'DONE',
      started_at: '2026-10-01T10:00:00Z',
      finished_at: '2026-10-01T10:00:05Z',
      error_message: null,
    }),
  );
  useExecutionRunsStore.setState({ ...initialRuns, createAndExecuteRun } as never, true);
  useNotificationStore.setState({ notifications: [] } as never);
  useShellStore.setState({
    activeSpace: 'obliczenia',
    szczegolyAudytowe: false,
    bottomPanelOpen: false,
    bottomPanelTab: 'problemy',
    layoutBySpace: {},
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('„Oblicz" ⇔ tor wykonania: jeden predykat na pełnym iloczynie stanów', () => {
  for (const [opisZakresu, caseId] of ZAKRESY) {
    for (const [opisGotowosci, readiness] of GOTOWOSCI) {
      it(`${opisZakresu} × ${opisGotowosci}`, async () => {
        const user = userEvent.setup();
        useAppStateStore.setState({ activeProjectId: 'projekt-1', activeCaseId: caseId });
        useSnapshotStore.setState({ readiness });

        render(<AppShell onCalculate={() => void uruchomObliczenie('SC_3F')} />);
        const przycisk = screen.getByTestId('mvd-calculate');
        const zablokowany = przycisk.getAttribute('data-stan') === 'zablokowane';
        const przyczynaPrzycisku = screen.getByTestId('mvd-calculate-przyczyna').textContent;

        // Para 1: stan przycisku = wynik czystego predykatu.
        const blokada = przyczynaBlokadyObliczen(caseId, readiness);
        expect(zablokowany).toBe(blokada !== null);

        await user.click(przycisk);

        if (zablokowany) {
          // Para 2: tor wykonania odmawia startu TYM SAMYM zdaniem, które pokazał przycisk.
          await waitFor(() => expect(useNotificationStore.getState().notifications).toHaveLength(1));
          expect(useNotificationStore.getState().notifications[0].message).toBe(przyczynaPrzycisku);
          expect(przyczynaPrzycisku).toBe(blokada?.komunikat);
          expect(createAndExecuteRun).not.toHaveBeenCalled();
        } else {
          // Para 3: przycisk „gotowe" ⇒ bieg naprawdę rusza.
          await waitFor(() => expect(createAndExecuteRun).toHaveBeenCalledTimes(1));
          expect(createAndExecuteRun).toHaveBeenCalledWith(CASE_ID, { analysis_type: 'SC_3F' });
        }
      });
    }
  }
});
