import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SldSemanticDiagnosticsPanel } from '../SldSemanticDiagnosticsPanel';
import type { SemanticDiagnosticsReport } from '../../engineering-semantic';

const report: SemanticDiagnosticsReport = {
  schemaVersion: 'v12-semantic-diagnostics-report-v8',
  projectRefId: 'project-1',
  semanticHash: 'semantic-abc',
  diagnosticsHash: 'diagnostics-abc',
  generatedAt: '1970-01-01T00:00:00.000Z',
  totals: {
    enmElements: 4,
    semanticElements: 3,
    sldSymbols: 2,
    violations: 2,
    legacyMappings: 1,
  },
  enmElementsWithoutSemanticElement: ['legacy-1'],
  semanticElementsWithoutRole: ['unknown-role-1'],
  semanticElementsWithoutPorts: ['bay-without-port'],
  semanticElementsWithoutNetworkPosition: ['floating-element'],
  semanticElementsWithoutCatalogOrEquivalent: ['segment-sketch'],
  enmElementsNotProductionRenderable: ['legacy-1'],
  elementsRenderedAsSketch: ['segment-sketch'],
  elementsRenderedAsSemanticBlock: ['unknown-role-1'],
  legacyMappings: [{
    enmRefId: 'legacy-1',
    semanticElementRefId: null,
    status: 'WYMAGA_DECYZJI_UZYTKOWNIKA',
    completeness: 'SZKIC_LOGICZNY',
    reportEligibility: {
      RAPORT_TECHNICZNY: 'NIERAPORTOWALNY_SZKIC',
      RAPORT_OSD: 'NIERAPORTOWALNY_SZKIC',
      RAPORT_AUDYTOWY: 'RAPORTOWALNY_Z_OSTRZEZENIEM',
      RAPORT_ZGODNOSCI_ZRODLA: 'NIE_DOTYCZY',
      RAPORT_ZABEZPIECZEN: 'NIE_DOTYCZY',
    },
    canRenderProduction: false,
    canCalculate: false,
    canReport: false,
    recognizedFields: [],
    missingFields: ['engineeringRole'],
    violationCodes: ['SEM-SLD-001'],
  }],
  legacySilentPromotionRefIds: ['legacy-promoted'],
};

describe('SldSemanticDiagnosticsPanel', () => {
  it('renders ENM versus semantic projection gaps and legacy promotion blocks', () => {
    render(<SldSemanticDiagnosticsPanel report={report} />);

    expect(screen.getByTestId('sld-semantic-diagnostics-panel')).toHaveTextContent(
      'Diagnostyka semantyczna modelu',
    );
    expect(screen.getByTestId('sld-semantic-diagnostics-panel')).toHaveTextContent('semantic-abc');
    expect(screen.getByText('ENM bez elementu semantycznego')).toBeInTheDocument();
    expect(screen.getAllByText('legacy-1')).toHaveLength(2);
    expect(screen.getByText('Elementy bez portow')).toBeInTheDocument();
    expect(screen.getByText('bay-without-port')).toBeInTheDocument();
    expect(screen.getByText('Renderowane jako blokada semantyczna')).toBeInTheDocument();
    expect(screen.getAllByText('unknown-role-1')).toHaveLength(2);
    expect(screen.getByText('Cichy awans archiwalny')).toBeInTheDocument();
    expect(screen.getByText('legacy-promoted')).toBeInTheDocument();
  });
});
