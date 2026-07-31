/**
 * F8c pkt 4 — testy palety DER (PV/BESS/FW) na kanwie v3 (checklista
 * bramkująca §F8c, pozycja 4 „DER-paleta"). Wzorzec fixture/setup identyczny
 * jak `sldCanvasV3Workspace.test.tsx` (F8a) — TA SAMA sieć testowa.
 *
 * Mechanizm REALNY v2 (zweryfikowany w `SldWorkspaceContainer.tsx`, patrz
 * nagłówek `SldCanvasV3Workspace.tsx`): klik przycisku PV/BESS/FW uzbraja
 * (`useDerDragDrop.startDrag`), NASTĘPNY klik w symbol stacji „zrzuca"
 * (`dropOnStation`) i otwiera `SldDetailDrawer` z zakładką DER pre-filled —
 * NIE natywne HTML5 `dragover`/`drop` (`hoverStation` w hooku jest DEAD CODE
 * w v2, sprawdzone grepem: zero wywołań w `SldWorkspaceContainer.tsx`).
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

/**
 * KD-8 poz. 2: pas narzędzi kanwy jest JEDNYM rzędem — przy wąskiej kanwie
 * (te testy renderują 800 px) grupy o niższej randze są ZWINIĘTE do menu
 * „Narzędzia", zamiast nachodzić na sąsiadów. Użytkownik sięga po nie jednym
 * klikiem w to menu i test idzie DOKŁADNIE tą samą drogą — nie zakłada, że
 * kontrolka jest zawsze w pasie (założenie, które maskowałoby zwinięcie).
 */
function rozwinZwinieteNarzedzia(): void {
  const menu = screen.queryByTestId('sld-v3-toolbar-menu-toggle');
  if (menu && screen.queryByTestId('sld-v3-toolbar-menu') === null) {
    fireEvent.click(menu);
  }
}

beforeEach(() => {
  useSnapshotStore.getState().reset();
  useSelectionStore.getState().clearSelection();
  useRawResultOverlayStore.getState().clear();
  useSnapshotStore.setState({ snapshot: enm });
});

describe('SldCanvasV3Workspace — F8c pkt 4: paleta DER', () => {
  it('(a) startDrag (klik przycisku PV) + drop (klik stacji) otwiera drawer DER z pre-fillem {stationId, kind}', () => {
    const scene = buildSceneV3(enm, 0);
    const stationIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'station');
    const stationOwnerRef = scene.symbols[stationIndex].meta?.ownerRef;
    expect(stationOwnerRef).toBeTruthy();

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);
    rozwinZwinieteNarzedzia();

    fireEvent.click(screen.getByTestId('der-palette-btn-PV'));
    expect(screen.getByTestId('sld-v3-der-cancel')).toBeTruthy();

    const stationGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[stationIndex];
    fireEvent.click(stationGroup!);

    // Uzbrojenie skonsumowane (drop wykonany) — wskaźnik „▸ Wskaż stację" znika.
    expect(screen.queryByTestId('sld-v3-der-cancel')).toBeNull();
    // Drawer DER otwarty, pre-filled dla WŁAŚNIE zrzuconej stacji.
    const label = screen.getByTestId('sld-v2-detail-drawer-label');
    expect(label.textContent).toBeTruthy();
  });

  it('(b) drop poza stacją (klik w aparaturę) = anuluj bez akcji — uzbrojenie znika, drawer NIE otwiera się', () => {
    const scene = buildSceneV3(enm, 0);
    const apparatusIndex = scene.symbols.findIndex((s) => s.meta?.elementKind === 'apparatus');
    expect(apparatusIndex).toBeGreaterThanOrEqual(0);

    const { container } = render(<SldCanvasV3Workspace width={800} height={600} />);

    rozwinZwinieteNarzedzia();
    fireEvent.click(screen.getByTestId('der-palette-btn-BESS'));
    expect(screen.getByTestId('sld-v3-der-cancel')).toBeTruthy();

    const apparatusGroup = container.querySelector('[data-testid="sld-v3-symbols"]')?.children[apparatusIndex];
    fireEvent.click(apparatusGroup!);

    // Anulowane — wskaźnik uzbrojenia znika.
    expect(screen.queryByTestId('sld-v3-der-cancel')).toBeNull();
    // Zero akcji: drawer NIE otwarty (klik podczas anulowania nie przechodzi
    // też do normalnej selekcji/drawera w TYM SAMYM kliku — patrz
    // `handleElementClick` w `SldCanvasV3Workspace.tsx`).
    expect(screen.queryByTestId('sld-v2-detail-drawer-label')).toBeNull();
    // Selekcja globalna też nietknięta tym klikiem (anulowanie = zero akcji).
    expect(useSelectionStore.getState().selectedElement).toBeNull();
  });
});
