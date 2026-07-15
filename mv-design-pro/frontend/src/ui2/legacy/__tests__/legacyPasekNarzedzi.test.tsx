/**
 * Testy LegacyPasekNarzedzi (E1.7c) — PORT testu
 * `ui/shell/__tests__/app-shell-workflow-strip-actions.test.tsx` po kasacji
 * AppShellV12. Intencja zachowana 1:1: akcje paska przepływu pracy
 * (wyszukiwanie, katalog, przegląd zbiorczy, metadane projektu, historia E-09)
 * są podpięte do realnych efektów; stany ładowania/pustego układu bez zmian.
 * (Przypadek propa `projectName` nagłówka usunięty razem z propem AppShellV12 —
 * źródłem nazwy projektu jest store aplikacji.)
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LegacyPasekNarzedzi } from '../LegacyPasekNarzedzi';

const {
  mockActiveMode,
  mockNavigateToCatalog,
  mockAppState,
  mockSnapshot,
} = vi.hoisted(() => ({
  mockNavigateToCatalog: vi.fn(),
  mockActiveMode: { value: 'MODEL_EDIT' as 'MODEL_EDIT' | 'RESULT_VIEW' },
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

vi.mock('../../../ui/app-state', () => ({
  useActiveCaseId: () => 'case-1',
  useActiveMode: () => mockActiveMode.value,
  useIssuePanelOpen: () => false,
}));

vi.mock('../../../ui/app-state/store', () => ({
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

vi.mock('../../../ui/navigation/routes', () => ({
  navigateToCatalog: () => mockNavigateToCatalog(),
}));

const openRouteSurfaceSpy = vi.fn();
vi.mock('../../../ui/network-build/networkBuildStore', () => ({
  useNetworkBuildStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeSurface: null,
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

vi.mock('../../../ui/topology/snapshotStore', () => ({
  useSnapshotStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      snapshot: mockSnapshot.value,
    }),
}));

vi.mock('../../../ui/network-build/GlobalSearch', () => ({
  GlobalSearch: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="global-search-modal" /> : null,
}));

vi.mock('../../../ui/network-build/mass-review', () => ({
  MassReviewPanel: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="mass-review-panel" /> : null,
}));

vi.mock('../../../ui/network-build/ProjectMetadataModal', () => ({
  ProjectMetadataModal: ({
    isOpen,
    metadata,
  }: {
    isOpen: boolean;
    metadata?: { projectName?: string };
  }) =>
    isOpen ? <div data-testid="project-metadata-modal">{metadata?.projectName}</div> : null,
}));

describe('LegacyPasekNarzedzi — akcje paska przepływu pracy (port z AppShellV12)', () => {
  beforeEach(() => {
    mockActiveMode.value = 'MODEL_EDIT';
    mockAppState.activeProjectName = 'Projekt testowy';
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
    openRouteSurfaceSpy.mockClear();
    mockNavigateToCatalog.mockClear();
  });

  it('otwiera wyszukiwanie, katalog, przegląd zbiorczy, metadane i historię z paska przepływu', () => {
    render(<LegacyPasekNarzedzi />);

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

    fireEvent.click(screen.getByTestId('wcs-history'));
    expect(openRouteSurfaceSpy).toHaveBeenCalledWith(
      'E-09',
      expect.objectContaining({ subjectKind: 'analysis_run' }),
    );
  });

  it('nie pokazuje startu GPZ podczas ładowania znanego zakresu', () => {
    mockSnapshot.value = null;

    render(<LegacyPasekNarzedzi />);

    expect(screen.getByTestId('wcs-model-loading')).toHaveTextContent('Ładowanie układu sieci');
    expect(screen.queryByTestId('wcs-start-model')).not.toBeInTheDocument();
    expect(screen.queryByText('Przejdź do budowy GPZ')).not.toBeInTheDocument();
  });

  it('pasek nie renderuje się w trybie przeglądu wyników (jak w starej ramie)', () => {
    mockActiveMode.value = 'RESULT_VIEW';

    render(<LegacyPasekNarzedzi />);

    expect(screen.queryByTestId('workflow-context-strip')).not.toBeInTheDocument();
  });
});
