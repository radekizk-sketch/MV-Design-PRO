import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openOperationForm: vi.fn(),
  derived: {
    buildPhase: 'READY',
    buildPhaseLabel: 'Do analizy',
    sourceCount: 1,
    configuredGpzSnFieldCount: 2,
    configuredGpzSnFields: [],
    unconfiguredGpzSnFields: [],
    trunkSegmentCount: 1,
    stationCount: 1,
    transformerCount: 1,
    openTerminals: [],
    logicalViews: { trunks: [{ segments: ['seg-1'] }] },
    isReady: true,
    gridSourceStationRef: 'gpz-1',
  },
}));

vi.mock('../networkBuildStore', () => ({
  useNetworkBuildDerived: () => mocks.derived,
  useNetworkBuildStore: (selector: (state: { openOperationForm: typeof mocks.openOperationForm }) => unknown) =>
    selector({ openOperationForm: mocks.openOperationForm }),
}));

import { GuidedBuildActionPanel } from '../GuidedBuildActionPanel';

describe('GuidedBuildActionPanel', () => {
  beforeEach(() => {
    mocks.openOperationForm.mockClear();
    Object.assign(mocks.derived, {
      buildPhase: 'READY',
      buildPhaseLabel: 'Do analizy',
      sourceCount: 1,
      configuredGpzSnFieldCount: 2,
      configuredGpzSnFields: [],
      unconfiguredGpzSnFields: [],
      trunkSegmentCount: 1,
      stationCount: 1,
      transformerCount: 1,
      openTerminals: [],
      logicalViews: { trunks: [{ segments: ['seg-1'] }] },
      isReady: true,
      gridSourceStationRef: 'gpz-1',
    });
  });

  it('używa języka konfiguracji technicznej zamiast debugowego modelu', () => {
    const { container } = render(<GuidedBuildActionPanel />);

    expect(screen.getByText('Konfiguracja układu')).toBeInTheDocument();
    expect(screen.getByText('Następny krok projektowy')).toBeInTheDocument();
    expect(screen.getByText('Struktura układu')).toBeInTheDocument();
    expect(screen.getByText('Można wykonać obliczenia.')).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/Budowa modelu|Stan topologii/);
  });

  it('prowadzi do pierwszej stacji SN/nN, gdy w modelu jest tylko GPZ i odcinek', () => {
    Object.assign(mocks.derived, {
      buildPhase: 'HAS_TRUNKS',
      buildPhaseLabel: 'Magistrala SN wyprowadzona - osadź stacje i ZKSN',
      stationCount: 0,
      transformerCount: 0,
      isReady: false,
    });

    render(<GuidedBuildActionPanel />);

    expect(screen.getByText('Wstaw pierwszą stację SN/nN')).toBeInTheDocument();
    expect(screen.getByText('Po wyprowadzeniu magistrali')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('guided-build-primary-action'));
    expect(mocks.openOperationForm).toHaveBeenCalledWith('insert_station_on_segment_sn', {
      segment_id: 'seg-1',
      position_on_segment: 0.5,
    });
  });
});
