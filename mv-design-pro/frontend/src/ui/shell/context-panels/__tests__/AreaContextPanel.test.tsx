/**
 * Tests for AreaContextPanel — V12 area routing.
 *
 * Sprawdza, że dla każdego z 7 obszarów (MO/AN/ZA/OZ/RA/AD/HI) wybierany jest
 * właściwy panel kontekstowy. Heavy-component children są mockowane.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../network-build/ProcessPanel', () => ({
  ProcessPanel: () => <div data-testid="mock-process-panel">ProcessPanel</div>,
}));

vi.mock('../../../network-build/networkBuildStore', () => ({
  useNetworkBuildDerived: () => ({
    buildPhase: 'NO_SOURCE',
    buildPhaseLabel: 'Brak źródła',
    sourceCount: 0,
    trunkCount: 0,
    branchCount: 0,
    stationCount: 0,
    transformerCount: 0,
    generatorCount: 0,
    isReady: false,
    ozeSourceSummaries: [],
    stationSummaries: [],
    transformerSummaries: [],
  }),
  useNetworkBuildStore: () => ({}),
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

import { AreaContextPanel } from '../AreaContextPanel';

describe('AreaContextPanel — area routing', () => {
  it('renders MO panel for MO area', () => {
    render(<AreaContextPanel areaCode="MO" />);
    expect(screen.getByTestId('mo-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-process-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mo-build-phase')).toBeInTheDocument();
    expect(screen.getByTestId('mo-counter-sources')).toBeInTheDocument();
  });

  it('renders AN panel for AN area', () => {
    render(<AreaContextPanel areaCode="AN" />);
    expect(screen.getByTestId('an-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('an-analysis-list')).toBeInTheDocument();
    expect(screen.getByTestId('mock-study-case-list')).toBeInTheDocument();
    expect(screen.getByTestId('an-analysis-SC_3F')).toBeInTheDocument();
    expect(screen.getByTestId('an-analysis-LOAD_FLOW')).toBeInTheDocument();
  });

  it('renders ZA panel for ZA area with library/diagnostics tabs', () => {
    render(<AreaContextPanel areaCode="ZA" />);
    expect(screen.getByTestId('za-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('za-tab-library')).toBeInTheDocument();
    expect(screen.getByTestId('za-tab-diagnostics')).toBeInTheDocument();
    expect(screen.getByTestId('mock-protection-library')).toBeInTheDocument();
  });

  it('renders OZ panel for OZ area with filters', () => {
    render(<AreaContextPanel areaCode="OZ" />);
    expect(screen.getByTestId('oz-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('oz-filter-all')).toBeInTheDocument();
    expect(screen.getByTestId('oz-filter-PV')).toBeInTheDocument();
    expect(screen.getByTestId('oz-filter-BESS')).toBeInTheDocument();
    expect(screen.getByTestId('oz-filter-WIND')).toBeInTheDocument();
  });

  it('renders RA panel for RA area with templates', () => {
    render(<AreaContextPanel areaCode="RA" />);
    expect(screen.getByTestId('ra-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('ra-template-list')).toBeInTheDocument();
    expect(screen.getByTestId('ra-template-SC3F')).toBeInTheDocument();
    expect(screen.getByTestId('ra-template-VDROP')).toBeInTheDocument();
    expect(screen.getByTestId('ra-template-PROTECTION')).toBeInTheDocument();
    expect(screen.getByTestId('ra-results-status')).toBeInTheDocument();
  });

  it('renders AD panel for AD area', () => {
    render(<AreaContextPanel areaCode="AD" />);
    expect(screen.getByTestId('ad-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-type-library')).toBeInTheDocument();
  });

  it('renders HI panel for HI area', () => {
    render(<AreaContextPanel areaCode="HI" />);
    expect(screen.getByTestId('hi-context-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mock-run-history')).toBeInTheDocument();
    expect(screen.getByTestId('hi-active-run')).toBeInTheDocument();
    expect(screen.getByTestId('hi-active-snapshot')).toBeInTheDocument();
  });

  it('contains no project codenames in any area', () => {
    const codenamePattern = /\bP1[0-9]\b/;
    const areas = ['MO', 'AN', 'ZA', 'OZ', 'RA', 'AD', 'HI'] as const;
    for (const area of areas) {
      const { container, unmount } = render(<AreaContextPanel areaCode={area} />);
      expect(container.textContent ?? '').not.toMatch(codenamePattern);
      unmount();
    }
  });

  it('AN panel: SC_3F button switches activeAnalysisType', async () => {
    const { useAppStateStore } = await import('../../../app-state/store');
    act(() => {
      useAppStateStore.getState().setActiveAnalysisType(null);
    });
    render(<AreaContextPanel areaCode="AN" />);
    const button = screen.getByTestId('an-analysis-SC_3F');
    act(() => {
      fireEvent.click(button);
    });
    expect(useAppStateStore.getState().activeAnalysisType).toBe('SHORT_CIRCUIT');
  });

  it('OZ panel: filter button switches active filter', () => {
    render(<AreaContextPanel areaCode="OZ" />);
    const pvFilter = screen.getByTestId('oz-filter-PV');
    act(() => {
      fireEvent.click(pvFilter);
    });
    expect(pvFilter.getAttribute('class') ?? '').toMatch(/scada-active|scada-sn/);
  });

  it('ZA panel: tab switching changes content', () => {
    render(<AreaContextPanel areaCode="ZA" />);
    const diagTab = screen.getByTestId('za-tab-diagnostics');
    act(() => {
      fireEvent.click(diagTab);
    });
    expect(screen.getByTestId('za-diagnostics-content')).toBeInTheDocument();
  });

  it('renders fallback for unknown area code', () => {
    render(<AreaContextPanel areaCode={'XX' as never} />);
    expect(screen.getByTestId('unknown-context-panel')).toBeInTheDocument();
  });
});
