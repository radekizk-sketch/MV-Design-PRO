import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditTrailPanel } from '../AuditTrailPanel';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useSelectionStore } from '../../selection/store';
import type { EnergyNetworkModel } from '../../../types/enm';

describe('AuditTrailPanel', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
    useSelectionStore.getState().clearSelection();
  });

  it('renderuje empty state gdy brak historii', () => {
    render(<AuditTrailPanel />);
    expect(screen.getByTestId('audit-trail-empty')).toBeInTheDocument();
    expect(screen.getByText(/Historia jest pusta/)).toBeInTheDocument();
  });

  it('pokazuje liczbę wpisów w nagłówku', () => {
    useSnapshotStore.setState({
      operationHistory: [
        {
          id: 'op-1',
          timestamp: '2026-05-22T10:30:00Z',
          operation: 'add_grid_source_sn',
          elementRef: 'gpz-1',
          elementName: 'GPZ Główny',
          status: 'success',
        },
      ],
    });
    render(<AuditTrailPanel />);
    expect(screen.getByText(/Wszystkie operacje \(1\)/)).toBeInTheDocument();
  });

  it('mapuje operation name na polską etykietę', () => {
    useSnapshotStore.setState({
      operationHistory: [
        {
          id: 'op-1',
          timestamp: '2026-05-22T10:30:00Z',
          operation: 'add_grid_source_sn',
          elementRef: 'gpz-1',
          elementName: 'GPZ',
          status: 'success',
        },
      ],
    });
    render(<AuditTrailPanel />);
    expect(screen.getByText('Dodanie GPZ')).toBeInTheDocument();
  });

  it('filtruje po statusie', () => {
    useSnapshotStore.setState({
      operationHistory: [
        {
          id: 'op-ok',
          timestamp: '2026-05-22T10:30:00Z',
          operation: 'add_grid_source_sn',
          elementRef: null,
          elementName: null,
          status: 'success',
        },
        {
          id: 'op-err',
          timestamp: '2026-05-22T10:31:00Z',
          operation: 'add_sn_bay',
          elementRef: null,
          elementName: null,
          status: 'error',
        },
      ],
    });
    render(<AuditTrailPanel />);
    expect(screen.getByTestId('audit-trail-entry-op-ok')).toBeInTheDocument();
    expect(screen.getByTestId('audit-trail-entry-op-err')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('audit-trail-status-filter'), { target: { value: 'error' } });
    expect(screen.queryByTestId('audit-trail-entry-op-ok')).toBeNull();
    expect(screen.getByTestId('audit-trail-entry-op-err')).toBeInTheDocument();
  });

  it('filtruje po elementRef gdy podany', () => {
    useSnapshotStore.setState({
      operationHistory: [
        {
          id: 'op-1',
          timestamp: '2026-05-22T10:30:00Z',
          operation: 'add_grid_source_sn',
          elementRef: 'gpz-1',
          elementName: 'GPZ',
          status: 'success',
        },
        {
          id: 'op-2',
          timestamp: '2026-05-22T10:31:00Z',
          operation: 'add_sn_bay',
          elementRef: 'bay-1',
          elementName: 'Pole 1',
          status: 'success',
        },
      ],
    });
    render(<AuditTrailPanel elementRef="gpz-1" />);
    expect(screen.getByTestId('audit-trail-entry-op-1')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-trail-entry-op-2')).toBeNull();
    expect(screen.getByText(/Operacje dla elementu \(1\)/)).toBeInTheDocument();
  });

  it('„Pokaż na schemacie" zaznacza element modelu (wspólna droga wejścia)', () => {
    useSnapshotStore.setState({
      snapshot: {
        buses: [{ id: 'gpz-1', ref_id: 'gpz-1', name: 'GPZ', voltage_kv: 15 }],
        branches: [],
        transformers: [],
        sources: [],
        loads: [],
        generators: [],
        substations: [],
        bays: [],
        junctions: [],
        corridors: [],
        measurements: [],
        protection_assignments: [],
      } as unknown as EnergyNetworkModel,
      operationHistory: [
        {
          id: 'op-1',
          timestamp: '2026-05-22T10:30:00Z',
          operation: 'add_grid_source_sn',
          elementRef: 'gpz-1',
          elementName: 'GPZ',
          status: 'success',
        },
      ],
    });
    render(<AuditTrailPanel />);
    const przycisk = screen.getByTestId('audit-trail-show-element-op-1');
    expect(przycisk).toHaveTextContent('Pokaż na schemacie');
    fireEvent.click(przycisk);
    expect(useSelectionStore.getState().selectedElement?.id).toBe('gpz-1');
    expect(useSelectionStore.getState().sldWskazanie?.ref).toBe('gpz-1');
  });

  it('element usunięty z modelu nie ma przycisku (bez martwego kliku)', () => {
    useSnapshotStore.setState({
      snapshot: { buses: [], branches: [], transformers: [], sources: [], loads: [], generators: [] } as unknown as EnergyNetworkModel,
      operationHistory: [
        {
          id: 'op-9',
          timestamp: '2026-05-22T10:30:00Z',
          operation: 'add_grid_source_sn',
          elementRef: 'usuniety-1',
          elementName: 'Usunięty',
          status: 'success',
        },
      ],
    });
    render(<AuditTrailPanel />);
    expect(screen.queryByTestId('audit-trail-show-element-op-9')).toBeNull();
  });

  it('search filtruje po nazwie elementu', () => {
    useSnapshotStore.setState({
      operationHistory: [
        {
          id: 'op-1',
          timestamp: '2026-05-22T10:30:00Z',
          operation: 'add_grid_source_sn',
          elementRef: 'gpz-1',
          elementName: 'GPZ Główny',
          status: 'success',
        },
        {
          id: 'op-2',
          timestamp: '2026-05-22T10:31:00Z',
          operation: 'add_sn_bay',
          elementRef: 'bay-1',
          elementName: 'Pole liniowe',
          status: 'success',
        },
      ],
    });
    render(<AuditTrailPanel />);
    fireEvent.change(screen.getByTestId('audit-trail-search'), { target: { value: 'pole' } });
    expect(screen.queryByTestId('audit-trail-entry-op-1')).toBeNull();
    expect(screen.getByTestId('audit-trail-entry-op-2')).toBeInTheDocument();
  });
});
