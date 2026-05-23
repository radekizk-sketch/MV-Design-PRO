import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShellV12 } from '../AppShellV12';

const {
  mockActiveMode,
  mockNavigateToCatalog,
  mockNetworkBuildState,
  mockAppState,
  mockSelectedElements,
  mockSnapshot,
} = vi.hoisted(() => ({
  mockNavigateToCatalog: vi.fn(),
  mockNetworkBuildState: {
    activeSurface: null as null | {
      surfaceId: string;
      openMode: 'replace_right_panel' | 'expand_workspace';
      sizeClass?: 'A' | 'B' | 'C';
    },
  },
  mockActiveMode: { value: 'MODEL_EDIT' as 'MODEL_EDIT' | 'RESULT_VIEW' },
  mockSelectedElements: {
    value: [] as Array<{ id: string; type: string; name: string }>,
  },
  mockAppState: {
    activeProjectName: 'Projekt testowy',
  },
  mockSnapshot: {
    value: {
      sources: [],
      buses: [],
      bays: [],
      branches: [],
      substations: [],
      transformers: [],
      generators: [],
      loads: [],
    } as null | {
      sources?: unknown[];
      buses: unknown[];
      bays?: unknown[];
      branches: unknown[];
      substations: unknown[];
      transformers?: unknown[];
      generators?: unknown[];
      loads?: unknown[];
    },
  },
}));

vi.mock('../../app-state', () => ({
  useActiveCaseId: () => 'case-1',
  useActiveMode: () => mockActiveMode.value,
  useIssuePanelOpen: () => false,
}));

vi.mock('../../app-state/store', () => ({
  useAppStateStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeArea: 'SCHEMAT_TOPOLOGIA',
      activeWorkMode: 'TE',
      activeProjectId: 'project-1',
      activeCaseName: 'Przypadek testowy',
      activeCaseId: 'case-1',
      activeVariantName: 'Bazowy',
      activeSnapshotId: null,
      activeProjectName: mockAppState.activeProjectName,
      activeCaseResultStatus: 'NONE',
      setActiveProject: vi.fn(),
    }),
}));

vi.mock('../../navigation/routes', () => ({
  navigateToCatalog: () => mockNavigateToCatalog(),
}));

vi.mock('../../selection', () => ({
  useSelectionStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      selectedElements: mockSelectedElements.value,
      selectedElement: mockSelectedElements.value[0] ?? null,
    }),
}));

const openRouteSurfaceSpy = vi.fn();
vi.mock('../../network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeSurface: mockNetworkBuildState.activeSurface,
      openRouteSurface: openRouteSurfaceSpy,
    }),
  useNetworkBuildDerived: () => ({
    buildPhase: 'READY',
    buildPhaseLabel: 'Gotowy',
    blockersByCategory: {
      total: 0,
      topologia: 0,
      katalogi: 0,
      eksploatacja: 0,
    },
    isReady: true,
  }),
}));

vi.mock('../../topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      snapshot: mockSnapshot.value,
    }),
}));

vi.mock('../../network-build/GlobalSearch', () => ({
  GlobalSearch: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="global-search-modal" /> : null,
}));

vi.mock('../../network-build/CatalogBrowser', () => ({
  CatalogBrowser: () => null,
}));

vi.mock('../../network-build/mass-review', () => ({
  MassReviewPanel: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="mass-review-panel" /> : null,
}));

vi.mock('../../network-build/ProjectMetadataModal', () => ({
  ProjectMetadataModal: ({
    isOpen,
    metadata,
  }: {
    isOpen: boolean;
    metadata?: { projectName?: string };
  }) =>
    isOpen ? <div data-testid="project-metadata-modal">{metadata?.projectName}</div> : null,
}));

// SnapshotHistoryModal mock removed (Phase 0 #3) - modal usunięty z kodu

vi.mock('../../network-build/InspectorEngineeringView', () => ({
  InspectorEngineeringView: () => <div data-testid="inspector-engineering-view" />,
}));

vi.mock('../../network-build/SldVisualModes', () => ({
  SldVisualModes: () => <div data-testid="sld-visual-modes" />,
}));

vi.mock('../../history/UndoRedoButtons', () => ({
  UndoRedoButtons: () => null,
}));

vi.mock('../../issue-panel', () => ({
  IssuePanelContainer: () => <div data-testid="issue-panel" />,
}));

vi.mock('../../workspace', () => ({
  WorkspaceSurfaceRouter: () => <div data-testid="workspace-surface" />,
}));

vi.mock('../TopBar', () => ({
  TopBar: () => <div data-testid="top-bar-v12" />,
}));

vi.mock('../NavigationRail', () => ({
  NavigationRail: () => <div data-testid="navigation-rail" />,
}));

vi.mock('../StatusBarV12', () => ({
  StatusBarV12: () => <div data-testid="status-bar-v12" />,
}));

vi.mock('../V12OverlayModeController', () => ({
  V12OverlayModeController: () => null,
}));

vi.mock('../context-panels', () => ({
  AreaContextPanel: () => <div data-testid="area-context-panel" />,
}));

describe('AppShellV12 workflow strip actions', () => {
  beforeEach(() => {
    mockNetworkBuildState.activeSurface = null;
    mockActiveMode.value = 'MODEL_EDIT';
    mockAppState.activeProjectName = 'Projekt testowy';
    mockSelectedElements.value = [];
    mockSnapshot.value = {
      sources: [],
      buses: [],
      bays: [],
      branches: [],
      substations: [],
      transformers: [],
      generators: [],
      loads: [],
    };
  });

  it('opens search, catalog, mass review, metadata and history from the workflow strip', () => {
    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByText('nie wyznaczono')).toBeInTheDocument();
    expect(screen.queryByText('0.00 km')).not.toBeInTheDocument();
    expect(screen.getByTestId('workflow-context-strip')).toHaveTextContent('Szyny');
    expect(screen.getByTestId('workflow-context-strip')).toHaveTextContent('Odcinki SN');
    expect(screen.getByTestId('workflow-context-strip')).not.toHaveTextContent('Elementy');
    expect(screen.getByTestId('wcs-mass-review')).toHaveTextContent('Kontrola');
    expect(screen.getByTestId('workflow-no-blockers')).toHaveTextContent('Układ:GPZ');
    expect(screen.getByTestId('wcs-model-readiness')).toHaveTextContent('Następny krok:wybór GPZ');

    fireEvent.click(screen.getByTestId('wcs-search'));
    expect(screen.getByTestId('global-search-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wcs-catalog'));
    expect(mockNavigateToCatalog).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId('wcs-mass-review'));
    expect(screen.getByTestId('mass-review-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wcs-project-metadata'));
    expect(screen.getByTestId('project-metadata-modal')).toBeInTheDocument();
    expect(screen.getByTestId('project-metadata-modal')).toHaveTextContent('Projekt testowy');

    // Phase 0 #3: SnapshotHistoryModal usunięte; przycisk historii nawiguje do E-09 przez openRouteSurface
    fireEvent.click(screen.getByTestId('wcs-history'));
    expect(openRouteSurfaceSpy).toHaveBeenCalledWith(
      'E-09',
      expect.objectContaining({ subjectKind: 'analysis_run' }),
    );
  });

  it('wypeĹ‚nia metadane nazwÄ… widocznÄ… w nagĹ‚Ăłwku, gdy store nie ma nazwy projektu', () => {
    mockAppState.activeProjectName = '';

    render(
      <AppShellV12 projectName="Projekt z nagĹ‚Ăłwka">
        <div>SLD</div>
      </AppShellV12>,
    );

    fireEvent.click(screen.getByTestId('wcs-project-metadata'));

    expect(screen.getByTestId('project-metadata-modal')).toHaveTextContent('Projekt z nagĹ‚Ăłwka');
  });

  it('nie pokazuje startu GPZ podczas ładowania znanego zakresu', () => {
    mockSnapshot.value = null;

    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByTestId('wcs-model-loading')).toHaveTextContent('Ładowanie układu sieci');
    expect(screen.queryByTestId('wcs-start-model')).not.toBeInTheDocument();
    expect(screen.queryByText('Przejdź do budowy GPZ')).not.toBeInTheDocument();
  });

  it('po utworzeniu samego GPZ prowadzi do wyprowadzenia ciągu SN zamiast obliczeń', () => {
    mockSnapshot.value = {
      sources: [{ ref_id: 'gpz/1/source/main' }],
      buses: [{ ref_id: 'gpz/1/bus/s1' }],
      bays: [{ ref_id: 'gpz/1/bay/001' }],
      branches: [{ ref_id: 'gpz/1/tr/1', type: 'transformer' }],
      substations: [{ ref_id: 'gpz/1/substation', station_type: 'gpz' }],
      transformers: [{ ref_id: 'gpz/1/tr/1' }],
      generators: [],
      loads: [],
    };

    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByTestId('wcs-model-readiness')).toHaveTextContent('Następny krok:wyprowadź ciąg SN');
    expect(screen.getByTestId('workflow-build-phase')).toHaveAttribute(
      'title',
      'Następny krok: wyprowadź magistralę SN z pola GPZ',
    );
    expect(screen.getByTestId('wcs-model-readiness')).not.toHaveTextContent('Obliczenia:do uruchomienia');
  });

  it('liczy w pasku tylko terenowe odcinki SN, bez wewnetrznej aparatury GPZ', () => {
    mockSnapshot.value = {
      sources: [{ ref_id: 'gpz/1/source/main' }],
      buses: [{ ref_id: 'gpz/1/bus/s1' }, { ref_id: 'bus/seg-1/downstream' }],
      bays: [{ ref_id: 'gpz/1/bay/001' }],
      branches: [
        { ref_id: 'gpz/1/bay/001/q1', type: 'breaker', name: 'Wylacznik pola SN' },
        { ref_id: 'gpz/1/bay/001/internal', type: 'cable', length_km: 0, name: 'Polaczenie wewnetrzne pola' },
        {
          ref_id: 'seg/1/segment',
          type: 'cable',
          length_km: 0.5,
          catalog_namespace: 'KABEL_SN',
          name: 'Odcinek 01',
        },
      ],
      substations: [{ ref_id: 'gpz/1/substation', station_type: 'gpz' }],
      transformers: [],
      generators: [],
      loads: [],
    };

    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByTestId('workflow-context-strip')).toHaveTextContent('Odcinki SN:1');
    expect(screen.getByTestId('workflow-context-strip')).toHaveTextContent('0,50 km');
  });

  it('nie pokazuje fazy analizy po samym odcinku bez stacji', () => {
    mockSnapshot.value = {
      sources: [{ ref_id: 'gpz/1/source/main' }],
      buses: [{ ref_id: 'gpz/1/bus/s1' }, { ref_id: 'bus/seg-1/downstream' }],
      bays: [{ ref_id: 'gpz/1/bay/001' }],
      branches: [
        {
          ref_id: 'seg/1/segment',
          type: 'cable',
          length_km: 0.5,
          catalog_namespace: 'KABEL_SN',
          name: 'Odcinek 01',
        },
      ],
      substations: [{ ref_id: 'gpz/1/substation', station_type: 'gpz' }],
      transformers: [{ ref_id: 'gpz/1/tr/1' }],
      generators: [],
      loads: [],
    };

    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByTestId('workflow-build-phase')).toHaveTextContent('BUDOWA');
    expect(screen.getByTestId('wcs-model-readiness')).toHaveTextContent('Następny krok:osadź stację');
    expect(screen.getByTestId('wcs-model-readiness')).not.toHaveTextContent('Obliczenia:do uruchomienia');
  });

  it('ukrywa i pokazuje lewy oraz prawy pasek boczny', () => {
    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByTestId('context-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ukryj lewy pasek boczny' }));
    expect(screen.queryByTestId('context-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('context-panel-collapsed-rail')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pokaż lewy pasek boczny' }));
    expect(screen.getByTestId('context-panel')).toBeInTheDocument();

    expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Ukryj prawy pasek boczny' }));
    expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Pokaż prawy pasek boczny' }));
    expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'false');
  });

  it('obsluguje skroty klawiaturowe paneli bez pracy w polach formularza', () => {
    render(
      <AppShellV12>
        <input aria-label="Pole testowe" />
      </AppShellV12>,
    );

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(screen.getByTestId('context-panel-collapsed-rail')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'B', ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'true');

    fireEvent.focus(screen.getByRole('textbox', { name: 'Pole testowe' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Pole testowe' }), { key: 'b', ctrlKey: true });
    expect(screen.getByTestId('context-panel-collapsed-rail')).toBeInTheDocument();
  });

  it('pokazuje prawy panel automatycznie, gdy akcja otwiera formularz operacji', async () => {
    const view = render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ukryj prawy pasek boczny' }));
    expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'true');

    mockNetworkBuildState.activeSurface = {
      surfaceId: 'operation:add_converter_source:station-1',
      openMode: 'replace_right_panel',
      sizeClass: 'B',
    };

    view.rerender(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('inspector-panel-sidebar')).toHaveAttribute('data-collapsed', 'false');
    });
  });

  it('po kliknięciu elementu SLD pokazuje inspektor inżynierski także w trybie wyników', () => {
    mockActiveMode.value = 'RESULT_VIEW';
    mockSelectedElements.value = [{ id: 'bay-1#breaker', type: 'Switch', name: 'Wyłącznik pola SN 1' }];

    render(
      <AppShellV12>
        <div>SLD</div>
      </AppShellV12>,
    );

    expect(screen.getByTestId('inspector-engineering-view')).toBeInTheDocument();
  });
});
