/**
 * F8c pkt 3 — testy menu kontekstowego na kanwie v3 (checklista bramkująca
 * §F8c, pozycja 3 „Context-menu"). Wzorzec fixture/setup identyczny jak
 * `sldCanvasV3Workspace.test.tsx` (F8a) — TA SAMA sieć testowa.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSceneV3 } from '../../scene/buildScene';
import { useSnapshotStore } from '../../../../topology/snapshotStore';
import { useSelectionStore } from '../../../../selection';
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
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useSnapshotStore.setState({ snapshot: enm });
});

describe('SldCanvasV3Workspace — F8c pkt 3: menu kontekstowe', () => {
  it('(a) prawy klik w symbol stacji otwiera menu z akcjami dla stacji (SLD_MENU_REGISTRY.station)', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
    expect(stationIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const stationGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[stationIndex];
    expect(stationGroup).toBeTruthy();

    fireEvent.contextMenu(stationGroup!, { clientX: 120, clientY: 80 });

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-open-station-config')).toBeTruthy();
  });

  it('(b) prawy klik w tło (svg, poza symbolem/odcinkiem) otwiera menu tła (SLD_MENU_REGISTRY.background)', () => {
    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    const svg = container.querySelector('[data-testid="sld-canvas-v3"]');
    expect(svg).toBeTruthy();

    fireEvent.contextMenu(svg!, { clientX: 10, clientY: 10 });

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-insert-gpz')).toBeTruthy();
  });

  it('(c) Karta SLD-P (GAP P-1, ZAMKNIĘTY): prawy klik w symbol DER otwiera menu GENERYCZNE (SLD_MENU_REGISTRY.der — show-ncrfg + show-results, BEZ pozycji subtype-specific)', () => {
    // LOD2 ma najpełniejszą scenę (DER widoczne od L1/L2, patrz spec §7) —
    // `lodOverride` wymusza L2 deterministycznie (domyślny LOD Workspace to
    // 0, tylko topologia, bez DER — patrz `SldCanvasV3WorkspaceProps.lodOverride`).
    const scene = buildSceneV3(enm, 2);
    const derIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'der');
    expect(derIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} lodOverride={2} />);
    const derGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[derIndex];
    expect(derGroup).toBeTruthy();

    fireEvent.contextMenu(derGroup!, { clientX: 50, clientY: 50 });

    // Menu SIĘ OTWIERA (GAP P-1 zamknięty) — wyłącznie akcje bez zależności
    // od podtypu, z realnym celem (`useSldActionExecutor`).
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-show-ncrfg')).toBeTruthy();
    expect(screen.getByTestId('sld-menu-show-results')).toBeTruthy();
    // Pozycje subtype-specific v2 (der_pv/der_bess/der_fw) POZOSTAJĄ
    // niedostępne — scena v3 nie niesie `Generator.gen_type` (UDOKUMENTOWANA
    // LUKA, nie regresja; zero zgadywania podtypu).
    expect(screen.queryByTestId('sld-menu-open-pv-config')).toBeNull();
    expect(screen.queryByTestId('sld-menu-open-bess-config')).toBeNull();
    expect(screen.queryByTestId('sld-menu-open-fw-config')).toBeNull();
    expect(screen.queryByTestId('sld-menu-delete-pv')).toBeNull();
    expect(screen.queryByTestId('sld-menu-show-frt-hvrt')).toBeNull();
  });
});
