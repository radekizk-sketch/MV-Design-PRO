/**
 * Testy adapterow magistrali zdarzen powloki (E15.1).
 * Kryteria akceptacji: docs/uiux/karty/U1_E15_1_MAGISTRALA.md §7.2.
 *
 * Adaptery obserwuja REALNE (produkcyjne) store'y zustand poprzez `.setState`
 * (bez wywolan API — zgodnie z granica karty §6: zero wolan API w tym module).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useAppStateStore } from '../../../ui/app-state/store';
import { useExecutionRunsStore } from '../../../ui/study-cases/runStore';
import { useStudyCasesStore } from '../../../ui/study-cases/store';
import { useSelectionStore } from '../../../ui/selection/store';
import type { EnergyNetworkModel, ReadinessInfo } from '../../../types/enm';
import type { ExecutionRun } from '../../../ui/study-cases/types';

import { subskrybuj } from '../bus';
import { startSnapshotAdapter } from '../adapters/snapshotAdapter';
import { startCaseAdapter } from '../adapters/caseAdapter';
import { startSelectionAdapter, ZRODLO_STORE_SELEKCJI } from '../adapters/selectionAdapter';
import type { ZdarzenieMagistrali } from '../types';

function snapshotZRewizja(revision: number): EnergyNetworkModel {
  return {
    header: {
      enm_version: '1.0',
      name: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      revision,
      hash_sha256: `hash-${revision}`,
      defaults: { frequency_hz: 50, unit_system: 'SI' },
    },
  } as unknown as EnergyNetworkModel;
}

function readinessZLiczba(blokady: number, ostrzezenia: number): ReadinessInfo {
  return {
    ready: blokady === 0,
    blockers: Array.from({ length: blokady }, (_, i) => ({
      code: `B${i}`,
      message_pl: 'blokada',
      element_ref: null,
      severity: 'BLOCKER',
    })),
    warnings: Array.from({ length: ostrzezenia }, (_, i) => ({
      code: `W${i}`,
      message_pl: 'ostrzezenie',
      element_ref: null,
      severity: 'IMPORTANT',
    })),
  };
}

function przebieg(overrides: Partial<ExecutionRun>): ExecutionRun {
  return {
    id: 'run-1',
    study_case_id: 'case-1',
    analysis_type: 'SC_3F',
    solver_input_hash: 'h',
    status: 'PENDING',
    started_at: null,
    finished_at: null,
    error_message: null,
    ...overrides,
  };
}

function zbierzZdarzenia(typ: ZdarzenieMagistrali['typ']): { odebrane: ZdarzenieMagistrali[]; odsubskrybuj: () => void } {
  const odebrane: ZdarzenieMagistrali[] = [];
  const odsubskrybuj = subskrybuj(typ, (z) => odebrane.push(z));
  return { odebrane, odsubskrybuj };
}

describe('snapshotAdapter — topology/snapshotStore.ts -> magistrala (§7.2)', () => {
  let zatrzymaj: () => void;

  beforeEach(() => {
    useSnapshotStore.getState().reset();
    zatrzymaj = startSnapshotAdapter();
  });

  afterEach(() => {
    zatrzymaj();
    useSnapshotStore.getState().reset();
  });

  it('zmiana rewizji snapshotu -> dokladnie jedno zdarzenie model-zmieniony z poprawnym payloadem (rev, zakres)', () => {
    const modelZmieniony = zbierzZdarzenia('model-zmieniony');
    try {
      useSnapshotStore.setState({
        snapshot: snapshotZRewizja(5), rewizjaBiezacegoModelu: 5,
        lastChanges: {
          created_element_ids: ['bus-2'],
          updated_element_ids: ['bus-1'],
          deleted_element_ids: [],
        },
      });

      expect(modelZmieniony.odebrane).toEqual([
        { typ: 'model-zmieniony', rev: 5, zakres: ['bus-1', 'bus-2'] },
      ]);
    } finally {
      modelZmieniony.odsubskrybuj();
    }
  });

  it('zmiana modelu emituje rowniez wyniki-niewazne z ta sama rewizja (Case Immutability Rule)', () => {
    const wynikiNiewazne = zbierzZdarzenia('wyniki-niewazne');
    try {
      useSnapshotStore.setState({ snapshot: snapshotZRewizja(7), rewizjaBiezacegoModelu: 7, lastChanges: null });

      expect(wynikiNiewazne.odebrane).toEqual([
        { typ: 'wyniki-niewazne', przyczyna: 'model-zmieniony', rev: 7 },
      ]);
    } finally {
      wynikiNiewazne.odsubskrybuj();
    }
  });

  it('brak emisji bez zmiany — ta sama rewizja ustawiona ponownie nie generuje kolejnego zdarzenia', () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(3), rewizjaBiezacegoModelu: 3, lastChanges: null });
    const modelZmieniony = zbierzZdarzenia('model-zmieniony');
    try {
      useSnapshotStore.setState({ snapshot: snapshotZRewizja(3), rewizjaBiezacegoModelu: 3, lastChanges: null });
      expect(modelZmieniony.odebrane).toEqual([]);
    } finally {
      modelZmieniony.odsubskrybuj();
    }
  });

  it('zmiana gotowosci (blockers/warnings) -> gotowosc-zmieniona z liczbami zgodnymi ze store readiness', () => {
    // Baza: snapshot z zerowa gotowoscia (jak w realnej odpowiedzi domain-op —
    // readiness zawsze towarzyszy snapshotowi w tym samym DomainOpResponseV1).
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(1), rewizjaBiezacegoModelu: 1, readiness: readinessZLiczba(0, 0) });
    const gotowosc = zbierzZdarzenia('gotowosc-zmieniona');
    try {
      // Ta sama rewizja — zmienia sie wylacznie gotowosc.
      useSnapshotStore.setState({ readiness: readinessZLiczba(2, 1) });
      expect(gotowosc.odebrane).toEqual([{ typ: 'gotowosc-zmieniona', blokady: 2, ostrzezenia: 1 }]);
    } finally {
      gotowosc.odsubskrybuj();
    }
  });

  it('brak projektu (rewizja biezacego modelu nieznana) — adapter nie emituje model-zmieniony', () => {
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(1), rewizjaBiezacegoModelu: 1, lastChanges: null });
    const modelZmieniony = zbierzZdarzenia('model-zmieniony');
    try {
      useSnapshotStore.setState({ snapshot: null, rewizjaBiezacegoModelu: null });
      expect(modelZmieniony.odebrane).toEqual([]);
    } finally {
      modelZmieniony.odsubskrybuj();
    }
  });

  it('PODGLAD PRZEBIEGU w store (setAnalysisRunSnapshot) nie jest zmiana modelu — zero uniewaznien (S9-11 / W-5)', () => {
    // Model biezacy: rew. 3. Wejscie na link przebiegu wgrywa PODGLAD migawki
    // sprzed biegu (inna rewizja naglowka) — akcja PRODUKCYJNA. Dotad adapter
    // czytal rewizje wyswietlanej migawki i emitowal falszywe
    // model-zmieniony/wyniki-niewazne przy kazdym wejsciu na podglad.
    useSnapshotStore.setState({ snapshot: snapshotZRewizja(3), rewizjaBiezacegoModelu: 3, lastChanges: null });
    const modelZmieniony = zbierzZdarzenia('model-zmieniony');
    const wynikiNiewazne = zbierzZdarzenia('wyniki-niewazne');
    try {
      useSnapshotStore.getState().setAnalysisRunSnapshot(snapshotZRewizja(2), 'snap-podglad');
      expect(modelZmieniony.odebrane).toEqual([]);
      expect(wynikiNiewazne.odebrane).toEqual([]);
    } finally {
      modelZmieniony.odsubskrybuj();
      wynikiNiewazne.odsubskrybuj();
    }
  });

  it('po zatrzymaniu adaptera (odsubskrybowanie) zmiany store nie generuja juz zdarzen', () => {
    zatrzymaj();
    const modelZmieniony = zbierzZdarzenia('model-zmieniony');
    try {
      useSnapshotStore.setState({ snapshot: snapshotZRewizja(9), rewizjaBiezacegoModelu: 9, lastChanges: null });
      expect(modelZmieniony.odebrane).toEqual([]);
    } finally {
      modelZmieniony.odsubskrybuj();
    }
  });

  it('brak dostepnego store\'u (getState rzuca) -> adapter no-op z ostrzezeniem raz, bez rzucania wyjatku', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const getStateSpy = vi.spyOn(useSnapshotStore, 'getState').mockImplementation(() => {
      throw new Error('store niedostepny');
    });
    try {
      expect(() => startSnapshotAdapter()).not.toThrow();
      expect(() => startSnapshotAdapter()).not.toThrow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      getStateSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});

describe('caseAdapter — app-state/store.ts -> magistrala: przypadek-aktywny (§7.2)', () => {
  let zatrzymaj: () => void;

  beforeEach(() => {
    useAppStateStore.getState().reset();
    zatrzymaj = startCaseAdapter();
  });

  afterEach(() => {
    zatrzymaj();
    useAppStateStore.getState().reset();
    useExecutionRunsStore.getState().reset();
  });

  it('zmiana activeCaseId -> dokladnie jedno zdarzenie przypadek-aktywny z poprawnym payloadem', () => {
    const przypadekAktywny = zbierzZdarzenia('przypadek-aktywny');
    try {
      useAppStateStore.setState({ activeCaseId: 'case-42' });
      expect(przypadekAktywny.odebrane).toEqual([{ typ: 'przypadek-aktywny', przypadekId: 'case-42' }]);
    } finally {
      przypadekAktywny.odsubskrybuj();
    }
  });

  it('brak emisji bez zmiany — ten sam activeCaseId ustawiony ponownie', () => {
    useAppStateStore.setState({ activeCaseId: 'case-1' });
    const przypadekAktywny = zbierzZdarzenia('przypadek-aktywny');
    try {
      useAppStateStore.setState({ activeCaseId: 'case-1' });
      expect(przypadekAktywny.odebrane).toEqual([]);
    } finally {
      przypadekAktywny.odsubskrybuj();
    }
  });

  it('activeCaseId -> null (brak aktywnego przypadku) nie generuje zdarzenia', () => {
    useAppStateStore.setState({ activeCaseId: 'case-1' });
    const przypadekAktywny = zbierzZdarzenia('przypadek-aktywny');
    try {
      useAppStateStore.setState({ activeCaseId: null });
      expect(przypadekAktywny.odebrane).toEqual([]);
    } finally {
      przypadekAktywny.odsubskrybuj();
    }
  });
});

describe('caseAdapter — study-cases/runStore.ts -> magistrala: wyniki-gotowe (§7.2)', () => {
  let zatrzymaj: () => void;

  beforeEach(() => {
    useExecutionRunsStore.getState().reset();
    zatrzymaj = startCaseAdapter();
  });

  afterEach(() => {
    zatrzymaj();
    useExecutionRunsStore.getState().reset();
    useAppStateStore.getState().reset();
  });

  it('runStatus -> DONE dla znanego przebiegu -> dokladnie jedno zdarzenie wyniki-gotowe (runId, przypadekId z rekordu przebiegu)', () => {
    const runDobiegu = przebieg({ id: 'run-9', study_case_id: 'case-77', status: 'RUNNING' });
    useExecutionRunsStore.setState({ runs: [runDobiegu], activeRunId: 'run-9', runStatus: 'RUNNING' });

    const wynikiGotowe = zbierzZdarzenia('wyniki-gotowe');
    try {
      useExecutionRunsStore.setState({
        runs: [{ ...runDobiegu, status: 'DONE' }],
        runStatus: 'DONE',
      });
      expect(wynikiGotowe.odebrane).toEqual([
        { typ: 'wyniki-gotowe', runId: 'run-9', przypadekId: 'case-77' },
      ]);
    } finally {
      wynikiGotowe.odsubskrybuj();
    }
  });

  it('brak emisji bez zmiany — runStatus DONE ustawiony ponownie na ta sama wartosc', () => {
    const runDobiegu = przebieg({ id: 'run-1', study_case_id: 'case-1', status: 'DONE' });
    useExecutionRunsStore.setState({ runs: [runDobiegu], activeRunId: 'run-1', runStatus: 'DONE' });

    const wynikiGotowe = zbierzZdarzenia('wyniki-gotowe');
    try {
      useExecutionRunsStore.setState({ runs: [runDobiegu], activeRunId: 'run-1', runStatus: 'DONE' });
      expect(wynikiGotowe.odebrane).toEqual([]);
    } finally {
      wynikiGotowe.odsubskrybuj();
    }
  });

  it('runStatus -> RUNNING/PENDING/FAILED nie generuje wyniki-gotowe', () => {
    const wynikiGotowe = zbierzZdarzenia('wyniki-gotowe');
    try {
      useExecutionRunsStore.setState({ runStatus: 'RUNNING' });
      useExecutionRunsStore.setState({ runStatus: 'FAILED' });
      expect(wynikiGotowe.odebrane).toEqual([]);
    } finally {
      wynikiGotowe.odsubskrybuj();
    }
  });

  it('K6: rekord przebiegu doladowany PO ustawieniu DONE (pierwszy bieg przypadku) -> zdarzenie i tak powstaje', () => {
    // `createAndExecuteRun` ustawia DONE ZANIM przeladuje liste przebiegow —
    // dla pierwszego biegu `runs` jest jeszcze puste. Warunkiem emisji jest STAN
    // („DONE, znany, nieogloszony"), nie przejscie statusu.
    useExecutionRunsStore.setState({ runs: [], activeRunId: 'run-nowy', runStatus: 'RUNNING' });
    const wynikiGotowe = zbierzZdarzenia('wyniki-gotowe');
    try {
      useExecutionRunsStore.setState({ runStatus: 'DONE' });
      expect(wynikiGotowe.odebrane).toEqual([]);

      // Doladowanie rejestru (loadRuns) — dopiero teraz przypadek jest znany.
      useExecutionRunsStore.setState({
        runs: [przebieg({ id: 'run-nowy', study_case_id: 'case-nowy', status: 'DONE' })],
      });
      expect(wynikiGotowe.odebrane).toEqual([
        { typ: 'wyniki-gotowe', runId: 'run-nowy', przypadekId: 'case-nowy' },
      ]);

      // Kolejne zmiany store'u nie duplikuja zdarzenia tego samego przebiegu.
      useExecutionRunsStore.setState({ runStatus: 'DONE' });
      expect(wynikiGotowe.odebrane).toHaveLength(1);
    } finally {
      wynikiGotowe.odsubskrybuj();
    }
  });

  it('K6/H-6 R2: po wyniki-gotowe adapter ODSWIEZA aktywny przypadek z serwera (jedna prawda znacznika wynikow)', () => {
    const loadActiveCase = vi.fn(async () => {});
    useStudyCasesStore.setState({ projectId: 'projekt-1', loadActiveCase } as never);
    const runDobiegu = przebieg({ id: 'run-r2', study_case_id: 'case-r2', status: 'RUNNING' });
    useExecutionRunsStore.setState({ runs: [runDobiegu], activeRunId: 'run-r2', runStatus: 'RUNNING' });

    useExecutionRunsStore.setState({ runs: [{ ...runDobiegu, status: 'DONE' }], runStatus: 'DONE' });

    expect(loadActiveCase).toHaveBeenCalledWith('projekt-1');
  });

  it('K6/H-6 R2: bez projektu w zasiegu adapter nie wola niczego (zero zgadywania)', () => {
    const loadActiveCase = vi.fn(async () => {});
    useStudyCasesStore.setState({ projectId: null, loadActiveCase } as never);
    useAppStateStore.setState({ activeProjectId: null } as never);
    const runDobiegu = przebieg({ id: 'run-r2b', study_case_id: 'case-r2b', status: 'RUNNING' });
    useExecutionRunsStore.setState({ runs: [runDobiegu], activeRunId: 'run-r2b', runStatus: 'RUNNING' });

    useExecutionRunsStore.setState({ runs: [{ ...runDobiegu, status: 'DONE' }], runStatus: 'DONE' });

    expect(loadActiveCase).not.toHaveBeenCalled();
  });

  it('runStatus DONE bez odpowiadajacego rekordu w runs -> brak emisji (brak zgadywania przypadekId)', () => {
    useExecutionRunsStore.setState({ runs: [], activeRunId: 'run-nieznany', runStatus: 'RUNNING' });
    const wynikiGotowe = zbierzZdarzenia('wyniki-gotowe');
    try {
      useExecutionRunsStore.setState({ runStatus: 'DONE' });
      expect(wynikiGotowe.odebrane).toEqual([]);
    } finally {
      wynikiGotowe.odsubskrybuj();
    }
  });
});

describe('selectionAdapter — selection/store.ts -> magistrala: selekcja (§7.2)', () => {
  let zatrzymaj: () => void;

  beforeEach(() => {
    useSelectionStore.getState().clearSelection();
    zatrzymaj = startSelectionAdapter();
  });

  afterEach(() => {
    zatrzymaj();
    useSelectionStore.getState().clearSelection();
  });

  it('selectElement -> dokladnie jedno zdarzenie selekcja z obiektId ze store i udokumentowanym zrodlem', () => {
    const selekcja = zbierzZdarzenia('selekcja');
    try {
      useSelectionStore.getState().selectElement({ id: 'bus-1', type: 'Bus', name: 'Szyna 1' });
      expect(selekcja.odebrane).toEqual([
        { typ: 'selekcja', obiektId: 'bus-1', zrodlo: ZRODLO_STORE_SELEKCJI },
      ]);
    } finally {
      selekcja.odsubskrybuj();
    }
  });

  it('brak emisji bez zmiany — ten sam element zaznaczony ponownie', () => {
    useSelectionStore.getState().selectElement({ id: 'bus-1', type: 'Bus', name: 'Szyna 1' });
    const selekcja = zbierzZdarzenia('selekcja');
    try {
      useSelectionStore.getState().selectElement({ id: 'bus-1', type: 'Bus', name: 'Szyna 1' });
      expect(selekcja.odebrane).toEqual([]);
    } finally {
      selekcja.odsubskrybuj();
    }
  });

  it('wyczyszczenie selekcji (obiektId=null) jest emitowane jako prawidlowa zmiana stanu', () => {
    useSelectionStore.getState().selectElement({ id: 'bus-1', type: 'Bus', name: 'Szyna 1' });
    const selekcja = zbierzZdarzenia('selekcja');
    try {
      useSelectionStore.getState().clearSelection();
      expect(selekcja.odebrane).toEqual([{ typ: 'selekcja', obiektId: null, zrodlo: ZRODLO_STORE_SELEKCJI }]);
    } finally {
      selekcja.odsubskrybuj();
    }
  });
});
