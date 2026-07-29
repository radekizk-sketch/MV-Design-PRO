/**
 * P-1 (luka F-E7): akcja SLD „Pokaż zgodność przyłączeniową" (`show-ncrfg`)
 * prowadzi do REALNEGO dostawcy — macierzy wymogów NC RfG ui2 (zakładka
 * „ncrfg" warsztatu Wyników) — deep-linkiem międzypowłokowym
 * (`useShellStore.setWynikiTab` + `setActiveSpace`, wzorzec V12K-106),
 * z przeniesieniem kontekstu modułu (nazwa generatora ze snapshotu ENM).
 *
 * Uzasadnienie harnessa (Zero-Debt pkt 5): kliknięcia są NATYWNE (userEvent),
 * ale wejściem jest przycisk harnessa, nie menu kontekstowe DER na kanwie —
 * menu DER na v3 to UDOKUMENTOWANA LUKA (`elementKindForMenu('der')` →
 * undefined, patrz `SldCanvasV3Workspace.tsx`), a jedyna realna ścieżka
 * (drawer po drop-z-palety) wymaga pełnego przepływu kreatora DER, testowanego
 * osobno. Kontrakt wykonawcy (`useSldActionExecutor`) jest tu jedyną prawdą
 * wspólną dla wszystkich wejść (menu, drawer) — test ćwiczy dokładnie ten
 * kontrakt.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../types/enm';
import { useShellStore } from '../../../../ui2/shell/useShellStore';
import { useAppStateStore } from '../../../app-state';
import { useNetworkBuildStore } from '../../../network-build/networkBuildStore';
import { useSnapshotStore } from '../../../topology/snapshotStore';
import type { SldElementKindForMenu } from '../../v2/command/SldCommandService';
import { useSldActionExecutor } from '../sldActionExecutor';

function Harness({
  actionId,
  kind,
  elementId,
}: {
  actionId: string;
  kind: SldElementKindForMenu;
  elementId: string | null;
}) {
  const handleAction = useSldActionExecutor({ readOnly: false });
  return (
    <button type="button" onClick={() => handleAction(actionId, kind, elementId)}>
      wykonaj akcję
    </button>
  );
}

function snapshotZGeneratorem(): EnergyNetworkModel {
  return {
    header: { name: 'Sieć testowa', revision: 1, hash_sha256: 'deadbeef' },
    buses: [],
    branches: [],
    sources: [],
    loads: [],
    generators: [
      {
        id: 'gen-1',
        ref_id: 'pv/abc123/converter',
        name: 'PV_T1',
        gen_type: 'pv_inverter',
      },
    ],
  } as unknown as EnergyNetworkModel;
}

beforeEach(() => {
  useAppStateStore.getState().reset();
  useSnapshotStore.getState().reset();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  useShellStore.setState({ activeSpace: 'schemat', wynikiTab: null, wynikiTabElement: null });
});

afterEach(() => {
  cleanup();
  useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
});

describe('useSldActionExecutor — show-ncrfg → macierz wymogów NC RfG (P-1, luka F-E7)', () => {
  it('deep-link do zakładki „ncrfg" z kontekstem = nazwą generatora ze snapshotu', async () => {
    const user = userEvent.setup();
    useSnapshotStore.setState({ snapshot: snapshotZGeneratorem() });
    render(<Harness actionId="show-ncrfg" kind="der_pv" elementId="pv/abc123/converter" />);

    await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

    expect(useShellStore.getState().wynikiTab).toBe('ncrfg');
    // Kontekst modułu = nazwa generatora (wspólny klucz kreatora DER),
    // NIE surowy ref ENM — macierz dopasowuje moduł po nazwie.
    expect(useShellStore.getState().wynikiTabElement).toBe('PV_T1');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    // Deep-link NIE otwiera powierzchni trasowej (koniec celowania w legacy E-26).
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });

  it('generator nieznany w snapshotcie: kontekst = surowy ref (zero fabrykacji)', async () => {
    const user = userEvent.setup();
    render(<Harness actionId="show-ncrfg" kind="der_bess" elementId="bess/nieznany" />);

    await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

    expect(useShellStore.getState().wynikiTab).toBe('ncrfg');
    expect(useShellStore.getState().wynikiTabElement).toBe('bess/nieznany');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
  });

  it('kontrola separacji: show-frt-hvrt nadal otwiera powierzchnię E-26 (realny dostawca FRT)', async () => {
    const user = userEvent.setup();
    render(<Harness actionId="show-frt-hvrt" kind="der_pv" elementId="pv/abc123/converter" />);

    await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-26');
    // Deep-link Wyników nieaktywny dla FRT — przestrzeń bez zmian.
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });
});
