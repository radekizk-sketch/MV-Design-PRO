/**
 * Testy mostu zakładki „Pozostałe analizy" po przebudowie: hub ui2 jako widok
 * domyślny; powierzchnie-dzieci nadal przez router z paskiem powrotu.
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { MostAnalizTechnicznych } from '../MostAnalizTechnicznych';

describe('MostAnalizTechnicznych — dostawca zakładki po przebudowie', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeProjectName: null, activeCaseName: null });
    useSnapshotStore.setState({ snapshot: null });
    useExecutionRunsStore.setState({ runs: [] });
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  });

  afterEach(() => {
    cleanup();
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
  });

  it('bez aktywnej powierzchni renderuje hub ui2 (nie pusty router)', () => {
    render(<MostAnalizTechnicznych />);
    expect(screen.getByTestId('mvd-analizy-techniczne')).toBeTruthy();
    expect(screen.queryByTestId('mvd-analizy-most-dziecko')).toBeNull();
  });

  it('dawny hub E-35 (zakładka domyślna) jest zastąpiony nowym ekranem', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-35');
    render(<MostAnalizTechnicznych />);
    expect(screen.getByTestId('mvd-analizy-techniczne')).toBeTruthy();
  });

  it('powierzchnia-dziecko (E-28) renderuje router z paskiem powrotu', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-28');
    render(<MostAnalizTechnicznych />);
    expect(screen.getByTestId('mvd-analizy-most-dziecko')).toBeTruthy();
    expect(screen.getByRole('button', { name: '← Analizy techniczne' })).toBeTruthy();
    expect(screen.queryByTestId('mvd-analizy-techniczne')).toBeNull();
  });

  it('jawny tab (ślad obliczeń) nie jest przechwytywany przez hub — deep-linki działają', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-35', { tabId: 'trace' });
    render(<MostAnalizTechnicznych />);
    expect(screen.getByTestId('mvd-analizy-most-dziecko')).toBeTruthy();
  });

  it('powrót czyści powierzchnię trasową i przywraca hub (klik natywny)', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface('E-28');
    render(<MostAnalizTechnicznych />);
    await user.click(screen.getByRole('button', { name: '← Analizy techniczne' }));
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
    expect(screen.getByTestId('mvd-analizy-techniczne')).toBeTruthy();
  });

  it('pełna ścieżka użytkownika: hub → karta → powierzchnia → powrót → hub', async () => {
    const user = userEvent.setup();
    render(<MostAnalizTechnicznych />);
    await user.click(
      screen.getByTestId('mvd-analizy-karta-cieplna').querySelector('button.mvd-analizy-otworz') as HTMLElement,
    );
    expect(screen.getByTestId('mvd-analizy-most-dziecko')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '← Analizy techniczne' }));
    expect(screen.getByTestId('mvd-analizy-techniczne')).toBeTruthy();
  });
});
