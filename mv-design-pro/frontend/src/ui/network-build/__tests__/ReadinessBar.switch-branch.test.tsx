import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useAppStateStore } from '../../app-state';
import {
  ustawGotowoscMigawki,
  wyczyscGotowoscMigawki,
} from '../../../test/gotowoscTestUtils';
import { useNotificationStore } from '../../notifications/store';
import { useSelectionStore } from '../../selection/store';
import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../networkBuildStore';
import { ReadinessBar } from '../ReadinessBar';

describe('ReadinessBar - aparatura SN w blokerach', () => {
  beforeEach(() => {
    useAppStateStore.getState().reset();
    useNetworkBuildStore.getState().reset();
    wyczyscGotowoscMigawki();
    useNotificationStore.getState().clearAll();
    useSelectionStore.getState().clearSelection();
    useSnapshotStore.setState({
      snapshot: null,
      logicalViews: null,
      readiness: null,
      fixActions: [],
    } as never);
    useAppStateStore
      .getState()
      .setActiveCase('case-1', 'Przypadek 1', 'ShortCircuitCase', 'FRESH');
  });

  it('kliknięcie blokady katalogu wyłącznika wybiera element typu Switch', () => {
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'src-1' }],
        substations: [],
        transformers: [],
        generators: [],
        buses: [{ ref_id: 'bus-1' }],
        branches: [{
          id: 'brk-1',
          ref_id: 'stn/1/sn_field_breaker/000',
          name: 'Wyłącznik pola SN 1',
          type: 'breaker',
          status: 'closed',
          from_bus_ref: 'bus-1',
          to_bus_ref: 'bus-1',
        }],
      } as never,
      logicalViews: {
        trunks: [],
        terminals: [],
        branches: [],
      } as never,
    });
    ustawGotowoscMigawki({
      blockers: [
        {
          code: 'switch.catalog_ref_missing',
          message_pl: 'Wyłącznik pola SN 1 nie ma przypisanej referencji katalogowej.',
          element_ref: 'stn/1/sn_field_breaker/000',
        },
      ],
    });

    render(<ReadinessBar />);

    fireEvent.click(screen.getByText('Wyłącznik pola SN 1 nie ma przypisanej referencji katalogowej.'));

    expect(useSelectionStore.getState().selectedElement).toMatchObject({
      id: 'stn/1/sn_field_breaker/000',
      type: 'Switch',
      name: 'Wyłącznik pola SN 1',
    });
  });

  it('nie pokazuje surowych referencji bp ani switch_state w komunikacie kontroli', () => {
    useSnapshotStore.setState({
      snapshot: {
        sources: [{ ref_id: 'src-1' }],
        substations: [],
        transformers: [],
        generators: [],
        buses: [{ ref_id: 'bus-1' }],
        branches: [],
        branch_points: [{ ref_id: 'bp/abc123/zksn', name: 'bp/abc123/zksn' }],
      } as never,
      logicalViews: {
        trunks: [],
        terminals: [],
        branches: [],
      } as never,
    });
    ustawGotowoscMigawki({
      blockers: [
        {
          code: 'branch_point.switch_state_missing',
          message_pl: "ZKSN 'bp/abc123/zksn' nie ma stanu łącznika (switch_state).",
          element_ref: 'bp/abc123/zksn',
        },
      ],
    });

    render(<ReadinessBar />);

    expect(screen.getByText('ZKSN wymaga wskazania stanu normalnego łącznika.')).toBeInTheDocument();
    expect(screen.queryByText(/bp\//)).not.toBeInTheDocument();
    expect(screen.queryByText(/switch_state/)).not.toBeInTheDocument();
  });
});
