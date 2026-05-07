/**
 * Testy ModelGapsSurface (E-04) z Etapu 7.
 *
 * Pokrycie:
 *   1. Stan brak readiness → komunikat o wymaganej operacji.
 *   2. Stan ready=true bez blokerów → zielony komunikat o gotowości.
 *   3. Stan z blokerami → lista blokerów z kodami i element_ref.
 *   4. Stan z ostrzeżeniami → osobna lista.
 *   5. Liczniki KPI (blocker count, warning count).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { useSnapshotStore } from '../../topology/snapshotStore';
import { useNetworkBuildStore } from '../../network-build/networkBuildStore';
import { useSelectionStore } from '../../selection';
import { WorkspaceSurfaceRouter } from '../WorkspaceSurfaceRouter';
import type { WorkspaceSurfaceDescriptor } from '../types';

const E04_SURFACE: WorkspaceSurfaceDescriptor = {
  surfaceId: 'e04-test',
  screenCode: 'E-04',
  titlePl: 'Gotowość modelu',
  entityRef: null,
  entityType: null,
  routeState: { payload: {} } as never,
  breadcrumbs: [],
  supportsMiniSld: false,
  supportsChildren: false,
  sizeClass: 'C',
  stackLevel: 0,
  openMode: 'expand_workspace',
  subjectKind: 'helper_context',
  subjectRef: null,
  saveMode: 'edit',
  hasUnsavedChanges: false,
  tabId: null,
} as never;

describe('ModelGapsSurface (E-04) — gotowość modelu', () => {
  beforeEach(() => {
    useSnapshotStore.getState().reset();
    useSelectionStore.getState().clearSelection();
    useNetworkBuildStore.setState({ activeSurface: E04_SURFACE });
  });

  it('renderuje komunikat o brakującym readiness gdy snapshot pusty', () => {
    render(<WorkspaceSurfaceRouter region="main" />);
    expect(screen.getByTestId('model-gaps-surface')).toBeInTheDocument();
    expect(screen.getByText(/Snapshot nie zawiera informacji o gotowości/)).toBeInTheDocument();
  });

  it('renderuje zielony komunikat gdy ready=true bez blokerów', () => {
    useSnapshotStore.setState({
      readiness: {
        ready: true,
        blockers: [],
        warnings: [],
      },
      fixActions: [],
    });

    render(<WorkspaceSurfaceRouter region="main" />);
    expect(screen.getByTestId('model-gaps-surface')).toBeInTheDocument();
    expect(screen.getByText(/Model przechodzi wszystkie reguły walidacji/)).toBeInTheDocument();
  });

  it('renderuje listę blokerów z kodami i polską wiadomością', () => {
    useSnapshotStore.setState({
      readiness: {
        ready: false,
        blockers: [
          {
            code: 'catalog.cable.missing',
            message_pl: 'Brak katalogu dla kabla SN K-12',
            element_ref: 'cable_k12',
            severity: 'BLOCKER',
          },
          {
            code: 'transformer.uk.missing',
            message_pl: 'Brak parametru uk% dla transformatora TR-01',
            element_ref: 'tr_01',
            severity: 'BLOCKER',
          },
        ],
        warnings: [],
      },
      fixActions: [],
    });

    render(<WorkspaceSurfaceRouter region="main" />);
    expect(screen.getByTestId('gap-blocker-0')).toBeInTheDocument();
    expect(screen.getByText(/Brak katalogu dla kabla SN K-12/)).toBeInTheDocument();
    expect(screen.getByText('catalog.cable.missing')).toBeInTheDocument();
    expect(screen.getByTestId('gap-blocker-1')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Napraw:/ })).toHaveLength(2);
  });

  it('renderuje listę ostrzeżeń osobno od blokerów', () => {
    useSnapshotStore.setState({
      readiness: {
        ready: false,
        blockers: [],
        warnings: [
          {
            code: 'voltage.profile.warning',
            message_pl: 'Profil napięcia poza zakresem ±5% w węźle BUS-12',
            element_ref: 'bus_12',
            severity: 'WARNING',
          },
        ],
      },
      fixActions: [],
    });

    render(<WorkspaceSurfaceRouter region="main" />);
    expect(screen.getByTestId('gap-warning-0')).toBeInTheDocument();
    expect(screen.getByText(/Profil napięcia poza zakresem/)).toBeInTheDocument();
  });

  it('liczniki KPI: blokery i ostrzeżenia', () => {
    useSnapshotStore.setState({
      readiness: {
        ready: false,
        blockers: [
          { code: 'a', message_pl: 'A', element_ref: null, severity: 'BLOCKER' },
          { code: 'b', message_pl: 'B', element_ref: null, severity: 'BLOCKER' },
          { code: 'c', message_pl: 'C', element_ref: null, severity: 'BLOCKER' },
        ],
        warnings: [
          { code: 'w', message_pl: 'W1', element_ref: null, severity: 'WARNING' },
        ],
      },
      fixActions: [],
    });

    render(<WorkspaceSurfaceRouter region="main" />);
    expect(screen.getByText('Status: 3 blokerów, 1 ostrzeżeń')).toBeInTheDocument();
  });

  it('klik naprawy blockera wybiera element i otwiera powiazany formularz', () => {
    useSnapshotStore.setState({
      snapshot: {
        generators: [
          {
            id: 'gen_pv_1',
            ref_id: 'gen_pv_1',
            name: 'Blok PV',
            tags: [],
            meta: {},
            bus_ref: 'bus_1',
            p_mw: 0.5,
            gen_type: 'pv_inverter',
          },
        ],
      } as never,
      readiness: {
        ready: false,
        blockers: [
          {
            code: 'generator.block_variant_requires_block_transformer',
            message_pl: 'Generator OZE wymaga transformatora',
            element_ref: 'gen_pv_1',
            severity: 'BLOCKER',
          },
        ],
        warnings: [],
      },
      fixActions: [
        {
          code: 'generator.block_variant_requires_block_transformer',
          action_type: 'ADD_MISSING_DEVICE',
          element_ref: 'gen_pv_1',
          modal_type: 'TransformerModal',
          panel: 'transformer_panel',
          step: 'K5',
          focus: 'blocking_transformer_ref',
          payload_hint: { required: 'blocking_transformer_ref' },
          message_pl: 'Dodaj transformator dedykowany',
        },
      ],
    });

    render(<WorkspaceSurfaceRouter region="main" />);

    fireEvent.click(screen.getByRole('button', { name: /Napraw: Dodaj transformator dedykowany/ }));

    expect(useSelectionStore.getState().selectedElement).toMatchObject({
      id: 'gen_pv_1',
      type: 'PVInverter',
      name: 'Blok PV',
    });
    expect(useSelectionStore.getState().sldCenterOnElement).toBe('gen_pv_1');
    expect(useNetworkBuildStore.getState().activeSurface?.routeState.payload).toMatchObject({
      delegate: 'operation_form',
      operation: 'add_transformer_sn_nn',
    });
  });
});
