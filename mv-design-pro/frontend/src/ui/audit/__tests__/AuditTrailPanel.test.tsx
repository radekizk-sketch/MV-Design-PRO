import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditTrailPanel } from '../AuditTrailPanel';
import { useSnapshotStore } from '../../topology/snapshotStore';

describe('AuditTrailPanel', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
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

  it('wywołuje onSelectElement po kliknięciu', () => {
    const onSelect = vi.fn();
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
    render(<AuditTrailPanel onSelectElement={onSelect} />);
    fireEvent.click(screen.getByTestId('audit-trail-show-element-op-1'));
    expect(onSelect).toHaveBeenCalledWith('gpz-1');
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
