import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentInspectorPanel } from '../SegmentInspectorPanel';

describe('SegmentInspectorPanel', () => {
  it('pokazuje kanoniczne etykiety polskie zamiast surowych kluczy technicznych', () => {
    render(
      <SegmentInspectorPanel
        displayName="Magistrala M1"
        technicalRef="seg-001"
        kindLabel="Odcinek magistrali"
        fromLabel="GPZ centrum"
        toLabel="Stacja ST-01"
        statusLabel="zamknięty"
        voltageKv={15}
        lengthKm="1.25"
        branchTypeLabel="Kablowy SN"
        catalogRef="KABEL-001"
        catalogNamespaceLabel="Kabel SN"
        catalogVersion="v1"
        parameterSourceLabel="Katalog"
        hasMaterializedParams
        manualOverrideCount={0}
        readiness={{ ready: true, blockerCount: 0, warningCount: 0 }}
        fixActionMessages={[]}
        lengthDraft="1.25"
        statusDraft="closed"
        catalogDraft="KABEL-001"
        onLengthDraftChange={vi.fn()}
        onStatusDraftChange={vi.fn()}
        onSave={vi.fn()}
        onOpenCatalogPicker={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const panel = screen.getByTestId('sld-segment-inspector');
    expect(panel).toHaveTextContent('Identyfikator odcinka:');
    expect(panel).toHaveTextContent('Od węzła początkowego:');
    expect(panel).toHaveTextContent('Do węzła końcowego:');
    expect(panel).toHaveTextContent('Źródło parametrów:');
    expect(panel).toHaveTextContent('Gotowość obliczeń i szybkie naprawy');
    expect(panel).not.toHaveTextContent('segment_ref:');
    expect(panel).not.toHaveTextContent('edge_id:');
  });
});
