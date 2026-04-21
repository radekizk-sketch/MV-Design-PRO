import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SnapshotHistoryModal } from '../SnapshotHistoryModal';
import { useSnapshotStore } from '../../topology/snapshotStore';

describe('SnapshotHistoryModal', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
  });

  it('renders operation history from snapshotStore instead of permanent empty state', () => {
    useSnapshotStore.setState({
      operationHistory: [
        {
          id: 'entry-1',
          timestamp: '2026-04-09T12:00:00.000Z',
          operation: 'add_grid_source_sn',
          elementRef: 'bus-1',
          elementName: 'Szyna SN-1',
          status: 'success',
          createdElementIds: ['bus-1'],
          updatedElementIds: [],
          deletedElementIds: [],
        },
      ],
    });

    render(<SnapshotHistoryModal isOpen onClose={() => undefined} />);

    expect(screen.getByText('Historia zmian modelu')).toBeInTheDocument();
    expect(screen.queryByText('Brak zarejestrowanych operacji')).not.toBeInTheDocument();
    expect(screen.getByText('Dodanie źródła zasilania SN')).toBeInTheDocument();
    expect(screen.getByText('Szyna SN-1')).toBeInTheDocument();
    expect(screen.getByText('+1 / ~0 / -0')).toBeInTheDocument();
  });

  it('pokazuje kanoniczną etykietę dla źródła przekształtnikowego', () => {
    useSnapshotStore.setState({
      operationHistory: [
        {
          id: 'entry-converter',
          timestamp: '2026-04-09T12:00:00.000Z',
          operation: 'add_converter_source',
          elementRef: 'gen-1',
          elementName: 'PV-1',
          status: 'success',
          createdElementIds: ['gen-1'],
          updatedElementIds: [],
          deletedElementIds: [],
        },
      ],
    });

    render(<SnapshotHistoryModal isOpen onClose={() => undefined} />);

    expect(screen.getByText('Dodanie źródła przekształtnikowego')).toBeInTheDocument();
  });
});
