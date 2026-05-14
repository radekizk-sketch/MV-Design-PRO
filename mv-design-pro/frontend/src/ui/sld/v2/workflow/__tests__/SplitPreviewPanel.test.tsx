import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitPreviewPanel } from '../SplitPreviewPanel';
import type { SplitPreview } from '../ConsciousSplitController';

function makePreview(overrides: Partial<SplitPreview['electricalImpact']> = {}): SplitPreview {
  return {
    insertedStationId: 'STA-NEW-001',
    stationType: 'ZKSN',
    electricalImpact: {
      topologyTypeChanged: false,
      affectedObjectRefs: ['OBJ-1', 'OBJ-2'],
      halves: {
        firstSegmentId: 'SEG-A',
        secondSegmentId: 'SEG-B',
        firstLengthKm: 1.234,
        secondLengthKm: 2.566,
        splitRatio: 0.325,
      },
      catalogInheritance: {
        sourceSegmentRef: 'SEG-ORIG',
        sourceCatalogRef: 'CAT-001',
        firstInherits: true,
        secondInherits: true,
        rule: 'inherit_both',
      },
      invalidatedResults: [],
      affectedProofPacks: [],
      missingDataAfter: [],
      affectedBuses: ['BUS-1'],
      ...overrides,
    },
  };
}

describe('SplitPreviewPanel', () => {
  it('renderuje panel z testid split-preview-panel', () => {
    render(
      <SplitPreviewPanel
        preview={makePreview()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId('split-preview-panel')).toBeInTheDocument();
  });

  it('wyświetla typ stacji i ID wstawionej stacji', () => {
    render(
      <SplitPreviewPanel
        preview={makePreview()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId('split-preview-station')).toHaveTextContent('ZKSN');
    expect(screen.getByTestId('split-preview-station')).toHaveTextContent('STA-NEW-001');
  });

  it('wyświetla długości półodcinków z 3 miejscami dziesiętnymi', () => {
    render(
      <SplitPreviewPanel
        preview={makePreview()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const impact = screen.getByTestId('split-preview-panel');
    expect(impact).toHaveTextContent('1.234 km');
    expect(impact).toHaveTextContent('2.566 km');
  });

  it('wyświetla nazwę odcinka gdy segmentName podana', () => {
    render(
      <SplitPreviewPanel
        preview={makePreview()}
        segmentName="Linia SN Gdańsk–Sopot"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId('split-preview-segment')).toHaveTextContent('Linia SN Gdańsk–Sopot');
  });

  it('NIE pokazuje ostrzeżeń gdy brak naruszeń', () => {
    render(
      <SplitPreviewPanel
        preview={makePreview()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByTestId('split-preview-warnings')).not.toBeInTheDocument();
  });

  it('pokazuje ostrzeżenie o zmianie topologii', () => {
    render(
      <SplitPreviewPanel
        preview={makePreview({ topologyTypeChanged: true })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId('split-preview-warnings')).toHaveTextContent('Zmiana topologii');
  });

  it('pokazuje ostrzeżenie gdy unieważnia wyniki', () => {
    render(
      <SplitPreviewPanel
        preview={makePreview({
          invalidatedResults: [{ runRef: 'run-1', runKind: 'SC3F', reason: 'topology changed' }],
        })}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId('split-preview-warnings')).toHaveTextContent('1 wynik');
  });

  it('wywołuje onConfirm po kliknięciu Potwierdź', () => {
    const onConfirm = vi.fn();
    render(
      <SplitPreviewPanel
        preview={makePreview()}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('split-preview-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('wywołuje onCancel po kliknięciu Anuluj (przycisk główny)', () => {
    const onCancel = vi.fn();
    render(
      <SplitPreviewPanel
        preview={makePreview()}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByTestId('split-preview-cancel-btn'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('blokuje przyciski gdy confirming=true', () => {
    render(
      <SplitPreviewPanel
        preview={makePreview()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        confirming={true}
      />
    );
    expect(screen.getByTestId('split-preview-confirm')).toBeDisabled();
    expect(screen.getByTestId('split-preview-cancel-btn')).toBeDisabled();
    expect(screen.getByTestId('split-preview-confirm')).toHaveTextContent('Zatwierdzanie');
  });
});
