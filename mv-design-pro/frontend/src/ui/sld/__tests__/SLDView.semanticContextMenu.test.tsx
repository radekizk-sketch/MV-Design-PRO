import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SLDView } from '../SLDView';

vi.mock('../SLDViewCanvas', () => ({
  SLDViewCanvas: ({ symbols }: { symbols: Array<{ id: string; elementId?: string; elementName: string }> }) => (
    <div data-testid="mock-sld-canvas">
      {symbols.map((symbol) => (
        <button
          key={symbol.id}
          type="button"
          data-testid={`sld-symbol-${symbol.id}`}
          data-element-id={symbol.elementId ?? symbol.id}
          data-element-name={symbol.elementName}
        >
          {symbol.elementName}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../ResultsOverlay', () => ({ ResultsOverlay: () => null }));
vi.mock('../DiagnosticsOverlay', () => ({ DiagnosticsOverlay: () => null }));
vi.mock('../DiagnosticResultsLayer', () => ({ DiagnosticResultsLayer: () => null }));
vi.mock('../ProtectionOverlayLayer', () => ({ ProtectionOverlayLayer: () => null }));
vi.mock('../SwitchingStateLegend', () => ({ SwitchingStateLegend: () => null }));
vi.mock('../SldTechLabelsLayer', () => ({ SldTechLabelsLayer: () => null }));
vi.mock('../SldSemanticMinimap', () => ({ SldSemanticMinimap: () => null }));
vi.mock('../export', () => ({
  SldSnapshotExportDialog: () => null,
  executeSldExport: vi.fn(),
  getCurrentLayerState: vi.fn(() => ({})),
  createExportOptions: vi.fn(() => ({})),
}));
vi.mock('../protection', () => ({
  useProtectionStatistics: () => ({ total: 0, critical: 0, warning: 0 }),
}));
vi.mock('../../protection', () => ({
  SEVERITY_FILTER_LABELS_PL: {},
  useSanityChecks: () => ({ hasResults: false, counts: {} }),
}));
vi.mock('../../sld-overlay', () => ({
  useOverlayRuntime: () => ({ overlay: null, legend: null }),
  OverlayLegend: () => null,
}));

describe('SLDView semantic context menu integration', () => {
  it('uses semanticElement.engineeringRole for a legacy-looking visual element on right click', () => {
    render(
      <SLDView
        symbols={[
          {
            id: 'visual-transformer-like',
            elementId: 'bay-line-1',
            elementType: 'TransformerBranch',
            elementName: 'Legacy visual transformer',
            position: { x: 120, y: 80 },
            inService: true,
          } as any,
        ]}
        semanticModel={{
          semanticHash: 'sem-menu-test',
          elements: [
            {
              refId: 'bay-line-1',
              elementKind: 'MV_BAY',
              engineeringRole: 'LINE_FEEDER_BAY',
              completeness: 'MODEL_TECHNICZNY_PELNY',
              voltageDomain: 'SN',
              dataQualityState: 'PELNA',
            },
          ],
        } as any}
        selectedElement={null}
        showGrid={false}
        width={800}
        height={500}
        fitOnMount={false}
      />,
    );

    fireEvent.contextMenu(screen.getByTestId('sld-symbol-visual-transformer-like'), {
      clientX: 240,
      clientY: 160,
    });

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-semantic-derive_cable_section')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-semantic-derive_overhead_section')).toBeInTheDocument();
    expect(screen.queryByTestId('context-menu-semantic-add_transformer_sn_nn')).not.toBeInTheDocument();
    expect(screen.queryByText(/transformatora/i)).not.toBeInTheDocument();
  });
});
