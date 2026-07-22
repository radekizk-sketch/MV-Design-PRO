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

  // Intencja bez zmian (hub → karta → powierzchnia → powrót); karta ćwicząca
  // ścieżkę to E-28 (koordynacja), bo karty E-33/E-34 prowadzą od karty P-1
  // deep-linkiem do zakładki zwarć warsztatu Wyników (bez powierzchni mostu) —
  // pokrycie w `EkranAnalizTechnicznych.test`.
  it('pełna ścieżka użytkownika: hub → karta → powierzchnia → powrót → hub', async () => {
    const user = userEvent.setup();
    render(<MostAnalizTechnicznych />);
    await user.click(
      screen.getByTestId('mvd-analizy-karta-koordynacja').querySelector('button.mvd-analizy-otworz') as HTMLElement,
    );
    expect(screen.getByTestId('mvd-analizy-most-dziecko')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '← Analizy techniczne' }));
    expect(screen.getByTestId('mvd-analizy-techniczne')).toBeTruthy();
  });

  it('powierzchnia klasy B (E-31, panel prawy) pokazuje HUB w środku, nie router (F-E5c)', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-31');
    expect(useNetworkBuildStore.getState().activeSurface?.openMode).toBe('replace_right_panel');
    render(<MostAnalizTechnicznych />);
    // Środek zakładki: hub widoczny, brak dublowania routera panelu.
    expect(screen.getByTestId('mvd-analizy-most-panel')).toBeTruthy();
    expect(screen.getByTestId('mvd-analizy-techniczne')).toBeTruthy();
    expect(screen.queryByTestId('mvd-analizy-most-dziecko')).toBeNull();
  });

  it('powierzchnia klasy B ma pasek „Zamknij panel analizy", a powierzchnia dalej żyje w panelu', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-31');
    render(<MostAnalizTechnicznych />);
    expect(screen.getByRole('button', { name: 'Zamknij panel analizy' })).toBeTruthy();
    // Powierzchnia pozostaje aktywna (renderuje ją prawy panel powłoki), mimo huba w środku.
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-31');
  });

  it('przycisk „Zamknij panel analizy" czyści powierzchnię panelu i wraca do huba (klik natywny)', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface('E-31');
    render(<MostAnalizTechnicznych />);
    await user.click(screen.getByRole('button', { name: 'Zamknij panel analizy' }));
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
    expect(screen.getByTestId('mvd-analizy-techniczne')).toBeTruthy();
    expect(screen.queryByTestId('mvd-analizy-most-panel')).toBeNull();
  });

  it('powierzchnia klasy C (E-28) nadal renderuje router w środku, nie gałąź panelu (regresja)', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-28');
    expect(useNetworkBuildStore.getState().activeSurface?.openMode).toBe('expand_workspace');
    render(<MostAnalizTechnicznych />);
    expect(screen.getByTestId('mvd-analizy-most-dziecko')).toBeTruthy();
    expect(screen.queryByTestId('mvd-analizy-most-panel')).toBeNull();
  });
});
