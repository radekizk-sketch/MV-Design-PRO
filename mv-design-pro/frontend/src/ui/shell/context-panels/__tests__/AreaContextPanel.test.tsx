import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const openRouteSurface = vi.fn();

vi.mock('../../../network-build/ProcessPanel', () => ({
  ProcessPanel: () => <div data-testid="mock-process-panel">ProcessPanel</div>,
}));

vi.mock('../../../network-build/networkBuildStore', () => ({
  useNetworkBuildDerived: () => ({
    buildPhase: 'NO_SOURCE',
    buildPhaseLabel: 'Brak źródła zasilania',
    sourceCount: 0,
    trunkCount: 0,
    branchCount: 0,
    stationCount: 0,
    transformerCount: 0,
    generatorCount: 0,
    isReady: false,
    blockersByCategory: { total: 0 },
    ozeSourceSummaries: [],
    stationSummaries: [],
    transformerSummaries: [],
  }),
  useNetworkBuildStore: (selector?: (state: { openRouteSurface: typeof openRouteSurface }) => unknown) => {
    const state = { openRouteSurface };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('../../../study-cases/StudyCaseList', () => ({
  StudyCaseList: () => <div data-testid="mock-study-case-list">StudyCaseList</div>,
}));

vi.mock('../../../study-cases/RunHistoryPanel', () => ({
  RunHistoryPanel: () => <div data-testid="mock-run-history">RunHistoryPanel</div>,
}));

vi.mock('../../../protection/ProtectionLibraryBrowser', () => ({
  ProtectionLibraryBrowser: () => (
    <div data-testid="mock-protection-library">ProtectionLibraryBrowser</div>
  ),
}));

vi.mock('../../../catalog/TypeLibraryBrowser', () => ({
  TypeLibraryBrowser: () => <div data-testid="mock-type-library">TypeLibraryBrowser</div>,
}));

vi.mock('../../../shared/generatorTypeLabels', () => ({
  formatGeneratorTypeShortLabelPl: (t: string) => t,
}));

import { useAppStateStore } from '../../../app-state/store';
import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { useSelectionStore } from '../../../selection/store';
import { type SnapshotState, useSnapshotStore } from '../../../topology/snapshotStore';
import { AreaContextPanel } from '../AreaContextPanel';

describe('AreaContextPanel - routing dziewięciu obszarów', () => {
  it('renderuje panel Model sieci', () => {
    act(() => {
      useAppStateStore.getState().setActiveProject(null);
      useAppStateStore.getState().setActiveCase(null);
      useAppStateStore.getState().setActiveVariant(null);
    });
    render(<AreaContextPanel obszar="MODEL_SIECI" />);
    expect(screen.getByTestId('mo-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mo-project-start')).toBeInTheDocument();
    expect(screen.getByTestId('mo-create-project')).toHaveTextContent('Nowy / otwórz projekt');
  });

  /*
   * ZERO FABRYKACJI (naprawa u źródła + testu — „test maskujący defekt produktu
   * = dwa defekty"). Dwa poprzednie przypadki tego pliku UTRWALAŁY defekt:
   * sprawdzały, że klik w „Utwórz projekt" nadaje `activeProjectName`,
   * `activeCaseId` (losowy UUID) i `activeCaseName` — czyli że aplikacja
   * WYMYŚLA projekt i zakres obliczeń po stronie klienta, bez ani jednego
   * wywołania API. Powstawał zakres-widmo: identyfikator, którego serwer nie
   * zna, więc kolejna operacja domenowa i każdy bieg trafiały w pustkę.
   * Formularz usunięty; stan zerowy prowadzi do REALNEJ ścieżki zakładania
   * projektu (przestrzeń „Projekt", zapis przez API).
   */
  it('Model sieci bez projektu: stan zerowy prowadzi do przestrzeni „Projekt", nic nie wymyśla', () => {
    act(() => {
      useAppStateStore.getState().setActiveProject(null);
      useAppStateStore.getState().setActiveCase(null);
      useAppStateStore.getState().setActiveVariant(null);
    });
    render(<AreaContextPanel obszar="MODEL_SIECI" />);

    act(() => {
      fireEvent.click(screen.getByTestId('mo-create-project'));
    });

    expect(useShellStore.getState().activeSpace).toBe('projekt');
    const state = useAppStateStore.getState();
    expect(state.activeProjectId).toBeNull();
    expect(state.activeCaseId).toBeNull();
    expect(state.activeCaseName).toBeNull();
  });

  it('Model sieci z projektem bez zakresu: stan zerowy prowadzi do „Obliczeń"', () => {
    act(() => {
      useAppStateStore.getState().setActiveProject('project:e2e-existing', 'E2E UIUX RESET');
      useAppStateStore.getState().setActiveCase(null);
      useAppStateStore.getState().setActiveVariant(null);
    });
    render(<AreaContextPanel obszar="MODEL_SIECI" />);

    expect(screen.getByTestId('mo-create-project')).toHaveTextContent(
      'Przejdź do zakresów obliczeń',
    );

    act(() => {
      fireEvent.click(screen.getByTestId('mo-create-project'));
    });

    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
    // Projekt bez zmian, zakres NADAL nieustalony — panel nic nie wymyślił.
    expect(useAppStateStore.getState().activeProjectId).toBe('project:e2e-existing');
    expect(useAppStateStore.getState().activeCaseId).toBeNull();
  });

  it('renderuje panel Schemat i topologia', () => {
    render(<AreaContextPanel obszar="SCHEMAT_TOPOLOGIA" />);
    expect(screen.getByTestId('schemat-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('schemat-action-show-topology')).toBeInTheDocument();
  });

  it('Schemat: odcinki SN pokazują typ katalogowy zamiast surowego typu cable', () => {
    act(() => {
      useSnapshotStore.setState({
        snapshot: {
          sources: [],
          buses: [],
          bays: [],
          substations: [],
          branches: [{
            id: 'seg-1',
            ref_id: 'SEG-1',
            name: 'T1',
            type: 'cable',
            catalog_ref: 'XRUHAKXS 120/25',
            length_km: 0.21,
          }],
        } as SnapshotState['snapshot'],
        readiness: { ready: true, blockers: [], warnings: [] } as SnapshotState['readiness'],
      });
    });

    render(<AreaContextPanel obszar="SCHEMAT_TOPOLOGIA" />);

    expect(screen.getByText('XRUHAKXS 120/25 · 0,21 km')).toBeInTheDocument();
    expect(screen.queryByText('cable · 0,21 km')).not.toBeInTheDocument();
    act(() => {
      useSnapshotStore.getState().reset();
    });
  });

  it('Schemat: powtarzający się kod blokera nie generuje duplikatu klucza React', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const snapshot = {
      sources: [],
      buses: [{ id: 'bus-sn-1', ref_id: 'bus-sn-1', name: 'Szyna SN 1' }],
      bays: [],
      branches: [],
      substations: [],
    } as SnapshotState['snapshot'];
    const readiness = {
      ready: false,
      blockers: [
        {
          code: 'switch.catalog_ref_missing',
          element_ref: 'stn/1/sn_field_breaker/000',
          message_pl: 'Łącznik pola SN 1 nie ma przypisanej referencji katalogowej.',
        },
        {
          code: 'switch.catalog_ref_missing',
          element_ref: 'stn/1/sn_field_breaker/001',
          message_pl: 'Łącznik pola SN 2 nie ma przypisanej referencji katalogowej.',
        },
      ],
      warnings: [],
    } as SnapshotState['readiness'];
    act(() => {
      useSnapshotStore.setState({
        snapshot,
        readiness,
      });
    });

    render(<AreaContextPanel obszar="SCHEMAT_TOPOLOGIA" />);

    expect(screen.getByText(/SN 1/)).toBeInTheDocument();
    expect(screen.getByText(/SN 2/)).toBeInTheDocument();
    expect(
      errorSpy.mock.calls.some((call) =>
        String(call[0]).includes('Encountered two children with the same key'),
      ),
    ).toBe(false);

    errorSpy.mockRestore();
    act(() => {
      useSnapshotStore.getState().reset();
    });
  });

  it('Schemat: aparat pola SN nie trafia do głównego drzewa układów', () => {
    openRouteSurface.mockClear();
    act(() => {
      useSelectionStore.getState().clearSelection();
      useSnapshotStore.setState({
        snapshot: {
          sources: [],
          buses: [],
          bays: [],
          substations: [],
          branches: [{
            id: 'brk-1',
            ref_id: 'stn/1/sn_field_breaker/000',
            name: 'Wyłącznik pola SN 1',
            type: 'breaker',
            status: 'closed',
          }],
        } as SnapshotState['snapshot'],
        readiness: { ready: false, blockers: [], warnings: [] } as SnapshotState['readiness'],
      });
    });

    render(<AreaContextPanel obszar="SCHEMAT_TOPOLOGIA" />);

    expect(screen.queryByText('Aparatura SN')).not.toBeInTheDocument();
    expect(screen.queryByText('Odcinki SN')).not.toBeInTheDocument();
    expect(screen.queryByTestId('model-tree-row-stn/1/sn_field_breaker/000')).not.toBeInTheDocument();
    expect(openRouteSurface).not.toHaveBeenCalled();

    act(() => {
      useSelectionStore.getState().clearSelection();
      useSnapshotStore.getState().reset();
    });
  });

  it('renderuje panel Studia obliczeniowe', () => {
    render(<AreaContextPanel obszar="STUDIA_OBLICZENIOWE" />);
    expect(screen.getByTestId('an-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-study-case-list')).toBeInTheDocument();
  });

  it('renderuje panel Wyniki i analizy', () => {
    render(<AreaContextPanel obszar="WYNIKI_ANALIZY" />);
    expect(screen.getByTestId('wyniki-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('wyniki-action-proof')).toBeInTheDocument();
  });

  it('renderuje panel Zabezpieczenia i automatyka', () => {
    render(<AreaContextPanel obszar="ZABEZPIECZENIA_AUTOMATYKA" />);
    expect(screen.getByTestId('za-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-protection-library')).toBeInTheDocument();
  });

  it('renderuje panel Układy PV/BESS/FW', () => {
    render(<AreaContextPanel obszar="ZRODLA_PRZYLACZENIA" />);
    expect(screen.getByTestId('oz-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('oz-empty-go-model')).toBeInTheDocument();
  });

  it('renderuje panel Katalogi techniczne', () => {
    render(<AreaContextPanel obszar="KATALOGI_TECHNICZNE" />);
    expect(screen.getByTestId('ad-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-type-library')).toBeInTheDocument();
  });

  it('renderuje panel Raporty i uzasadnienia', () => {
    render(<AreaContextPanel obszar="RAPORTY_UZASADNIENIA" />);
    expect(screen.getByTestId('ra-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ra-template-list')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/\[(POWER_FLOW|EQUIPMENT|EARTHING|VDROP|LOSSES|PROTECTION)\]/);
  });

  it('renderuje panel Historia i audyt', () => {
    render(<AreaContextPanel obszar="HISTORIA_AUDYT" />);
    expect(screen.getByTestId('hi-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-run-history')).toBeInTheDocument();
  });

  // D1: aliasy dwuliterowe ('TE'/'MO'/…) i normalizacja nierozpoznanych napisów
  // ZNIKNĘŁY razem z rejestrem `ui/navigation/areaRegistry` — `obszar` jest
  // typem ZAMKNIĘTYM, wyprowadzanym z trasy przez `ui2/legacy/mostObszarow`,
  // więc niepoprawna wartość nie może już dojść do panelu (błąd kompilacji,
  // nie cicha podmiana na „Model sieci"). Intencja testu — „każdy z dziewięciu
  // obszarów ma swoją gałąź" — żyje w pozostałych przypadkach tego pliku oraz
  // w `ui2/legacy/__tests__/mostObszarow.test.ts` (parytet tabela ↔ gałęzie).

  it('Schemat: klik pokazania topologii przełącza tryb pracy bez martwego kliknięcia', () => {
    render(<AreaContextPanel obszar="SCHEMAT_TOPOLOGIA" />);
    act(() => {
      useAppStateStore.getState().setActiveWorkMode('TW');
      fireEvent.click(screen.getByTestId('schemat-action-show-topology'));
    });
    expect(useAppStateStore.getState().activeWorkMode).toBe('TE');
  });

  it('Studia: wybór zwarcia aktywuje typ analizy', () => {
    act(() => {
      useAppStateStore.getState().setActiveAnalysisType(null);
    });
    render(<AreaContextPanel obszar="STUDIA_OBLICZENIOWE" />);
    act(() => {
      fireEvent.click(screen.getByTestId('an-analysis-SC_3F'));
    });
    expect(useAppStateStore.getState().activeAnalysisType).toBe('SHORT_CIRCUIT');
  });
});
