/**
 * F11.4-B — testy wykonawcy akcji domenowych na kanwie v3 (ARCH-3, spec
 * §10.1: „wykonawca akcji domenowych na v3: BRAMKA REALNA, wdrażana").
 * Wzorzec fixture/setup identyczny jak `contextMenu.test.tsx` (F8c pkt 3) —
 * TA SAMA sieć testowa. Weryfikuje, że menu kontekstowe v3 WYKONUJE akcje
 * (nie tylko je pokazuje) przez `useSldActionExecutor`
 * (`shared/sldActionExecutor.ts`) — TEN SAM wykonawca co v2
 * (`SldWorkspaceContainer.tsx`), zero duplikacji.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useAppStateStore } from '../../../../app-state';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
import { useNetworkBuildStore } from '../../../../network-build/networkBuildStore';
import { useNotificationStore } from '../../../../notifications/store';
import { SldCanvasV3Workspace } from '../SldCanvasV3Workspace';
import { useRawResultOverlayStore } from '../../../../sld-overlay/rawResultOverlayStore';

afterEach(() => {
  cleanup();
  useRawResultOverlayStore.getState().clear();
});

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'v2',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

beforeEach(() => {
  useAppStateStore.getState().reset();
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useNotificationStore.getState().clearAll();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useSnapshotStore.setState({ snapshot: enm });
});

function openStationMenu(): { stationId: string } {
  const scene = buildSceneV3(enm, 0);
  const stationSymbol = scene.symbols.find((s) => s.meta?.elementKind === 'station');
  const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
  expect(stationIndex).toBeGreaterThanOrEqual(0);

  const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
  const stationGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[stationIndex];
  fireEvent.contextMenu(stationGroup!, { clientX: 120, clientY: 80 });
  expect(screen.getByRole('menu')).toBeTruthy();

  return { stationId: stationSymbol!.meta!.ownerRef! };
}

describe('SldCanvasV3Workspace — F11.4-B: wykonawca akcji domenowych (ARCH-3)', () => {
  it('(a) akcja "Usuń stację" z menu stacji pokazuje potwierdzenie (notify sticky) i po potwierdzeniu woła executeDomainOperation("delete_element", {element_ref,...})', async () => {
    useAppStateStore.setState({ activeCaseId: 'case-v3-del-1' });
    const executeDomainOperation = vi.fn().mockResolvedValue({});
    useSnapshotStore.setState({ executeDomainOperation } as never);

    const { stationId } = openStationMenu();

    fireEvent.click(screen.getByTestId('sld-menu-delete-station'));

    const notification = useNotificationStore
      .getState()
      .notifications.find((n) => n.actions?.some((a) => a.label === 'Usuń'));
    expect(notification).toBeTruthy();
    expect(notification!.sticky).toBe(true);

    const confirmAction = notification!.actions!.find((a) => a.label === 'Usuń')!;
    confirmAction.onClick();

    await vi.waitFor(() => {
      expect(executeDomainOperation).toHaveBeenCalledWith('case-v3-del-1', 'delete_element', {
        element_ref: stationId,
        action_id: 'delete-station',
        source: 'sld_context_menu',
      });
    });

    // Menu zamyka się po wywołaniu akcji (patrz `handleContextMenuAction`).
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('(b) akcja nawigacyjna ("Pokaż kontrolę konfiguracji" z menu tła) woła openRouteSurface z poprawnym screenCode (E-04, ACTION_TO_SCREEN)', () => {
    const openRouteSurface = vi.fn();
    useNetworkBuildStore.setState({ openRouteSurface } as never);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]');
    fireEvent.contextMenu(svg!, { clientX: 10, clientY: 10 });
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.click(screen.getByTestId('sld-menu-show-readiness'));

    expect(openRouteSurface).toHaveBeenCalledWith('E-04', {
      entityRef: null,
      subjectKind: 'helper_context',
    });
  });

  it('(c) akcja formularzowa ("Dodaj obciążenie nN" z menu stacji) woła openOperationForm z op/context zbudowanym przez buildSldOperationContext', () => {
    const openOperationForm = vi.fn();
    useNetworkBuildStore.setState({ openOperationForm } as never);

    const { stationId } = openStationMenu();

    fireEvent.click(screen.getByTestId('sld-menu-add-load'));

    expect(openOperationForm).toHaveBeenCalledTimes(1);
    const [op, context] = openOperationForm.mock.calls[0] as [string, Record<string, unknown>];
    expect(op).toBe('add_nn_load');
    expect(context).toMatchObject({ source: 'sld_context_menu' });
    // `buildOperationContext` (network-build/operationContext.ts) wzbogaca
    // kontekst o referencję elementu — dowód, że wykonawca v3 przeszedł
    // przez TĘ SAMĄ ścieżkę `buildSldOperationContext` co v2 (nie skrót).
    expect(JSON.stringify(context)).toContain(stationId);
  });

  it('(d) readOnly=true blokuje akcje budujące (np. "Dodaj obciążenie nN") z komunikatem PL, bez wywołania openOperationForm', () => {
    const openOperationForm = vi.fn();
    useNetworkBuildStore.setState({ openOperationForm } as never);

    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} readOnly />);
    const stationGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[stationIndex];
    fireEvent.contextMenu(stationGroup!, { clientX: 120, clientY: 80 });
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.click(screen.getByTestId('sld-menu-add-load'));

    expect(openOperationForm).not.toHaveBeenCalled();
    const warning = useNotificationStore
      .getState()
      .notifications.find((n) => n.message === 'Tryb podglądu schematu — przełącz na edycję, aby budować sieć.');
    expect(warning).toBeTruthy();
    expect(warning!.type).toBe('warning');
  });
});
