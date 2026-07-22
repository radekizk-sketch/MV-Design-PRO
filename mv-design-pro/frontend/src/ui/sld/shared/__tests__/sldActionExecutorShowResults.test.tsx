/**
 * D-2 (decyzja właściciela, AskUserQuestion 2026-07-22): akcja SLD „Pokaż
 * wyniki" (`show-results`) prowadzi do REALNEGO dostawcy — zakładki „Rozpływ"
 * warsztatu Wyników ui2 — deep-linkiem międzypowłokowym
 * (`useShellStore.setWynikiTab` + `setActiveSpace`, wzorzec P-1 `show-ncrfg`),
 * z preselekcją wiersza klikniętego elementu (`wynikiTabElement`). Koniec
 * celowania w legacy powierzchnię E-24 („Profile operatora i źródeł").
 *
 * Uzasadnienie harnessa (Zero-Debt pkt 5): kliknięcia są NATYWNE (userEvent)
 * w przycisk harnessa wołający `useSldActionExecutor` z ustalonym
 * (actionId, kind, elementId) — dokładnie kontrakt, który konsumuje realne
 * menu kontekstowe SLD (`SldContextMenuController.onAction`) i drawer
 * (wspólne dla obu — `sldActionExecutorNcRfg.test.tsx` używa tego samego
 * wzorca dla show-ncrfg).
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

describe('useSldActionExecutor — show-results → zakładka „Rozpływ" (D-2)', () => {
  it('odcinek SN (overhead_line_sn): deep-link do zakładki „rozplyw" z ref elementu', async () => {
    const user = userEvent.setup();
    render(<Harness actionId="show-results" kind="overhead_line_sn" elementId="line/L-1" />);

    await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

    expect(useShellStore.getState().wynikiTab).toBe('rozplyw');
    expect(useShellStore.getState().wynikiTabElement).toBe('line/L-1');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    // Deep-link NIE otwiera powierzchni trasowej (koniec celowania w legacy E-24).
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });

  it('pole SN (bay): deep-link niesie surowy ref pola (zero fabrykacji mapowania)', async () => {
    const user = userEvent.setup();
    render(<Harness actionId="show-results" kind="bay" elementId="bay/B-3" />);

    await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

    expect(useShellStore.getState().wynikiTab).toBe('rozplyw');
    expect(useShellStore.getState().wynikiTabElement).toBe('bay/B-3');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
  });

  it('aparatura (apparatus): ref pola macierzystego (bayRef) — jak gałąź nawigacyjna', async () => {
    const user = userEvent.setup();
    render(
      <Harness actionId="show-results" kind="apparatus" elementId="bay/B-3#breaker" />,
    );

    await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

    expect(useShellStore.getState().wynikiTab).toBe('rozplyw');
    expect(useShellStore.getState().wynikiTabElement).toBe('bay/B-3');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
  });

  it('brak elementId: kontekst = null (żądanie nadal otwiera zakładkę)', async () => {
    const user = userEvent.setup();
    render(<Harness actionId="show-results" kind="station" elementId={null} />);

    await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

    expect(useShellStore.getState().wynikiTab).toBe('rozplyw');
    expect(useShellStore.getState().wynikiTabElement).toBeNull();
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
  });

  it('kontrola separacji: show-readiness nadal otwiera powierzchnię E-04 (bez zmian)', async () => {
    const user = userEvent.setup();
    render(<Harness actionId="show-readiness" kind="station" elementId="station/ST-1" />);

    await user.click(screen.getByRole('button', { name: 'wykonaj akcję' }));

    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-04');
    // Deep-link Wyników nieaktywny dla show-readiness — przestrzeń bez zmian.
    expect(useShellStore.getState().wynikiTab).toBeNull();
    expect(useShellStore.getState().activeSpace).toBe('schemat');
  });
});
