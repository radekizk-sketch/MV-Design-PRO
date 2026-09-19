/**
 * Testy mostu zakładki „Widoki klasyczne" warsztatu Wyników (karta B-02 / W3-E):
 * rejestr widoków klasycznych jako widok domyślny; powierzchnie-dzieci nadal przez
 * router z paskiem powrotu. Intencje przeniesione z testów dawnego huba „Analizy
 * techniczne" (`EkranAnalizTechnicznych.test.tsx`, skasowany razem z hubem): karta
 * E-27/E-28 otwiera powierzchnię kanoniczną mostu, widoki klasyczne otwierają jawne
 * taby powierzchni analiz, komplet kart rejestru jest obecny. Kliki natywne
 * (userEvent) — Zero-Debt pkt 5.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { MostAnalizTechnicznych, WidokiKlasyczne } from '../MostAnalizTechnicznych';
import { WIDOKI_KLASYCZNE, jestDawnymHubem } from '../model';
import { ANALIZY_STRINGS as T } from '../strings';

describe('MostAnalizTechnicznych — dostawca zakładki „Widoki klasyczne"', () => {
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

  it('bez aktywnej powierzchni renderuje rejestr widoków klasycznych (nie pusty router)', () => {
    render(<MostAnalizTechnicznych />);
    expect(screen.getByTestId('mvd-analizy-widoki-klasyczne')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: T.tytul })).toBeTruthy();
    expect(screen.getByText(T.cel)).toBeTruthy();
    expect(screen.queryByTestId('mvd-analizy-most-dziecko')).toBeNull();
  });

  it('dawny hub E-35 (zakładka domyślna „results") jest zastąpiony rejestrem', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-35');
    render(<MostAnalizTechnicznych />);
    expect(screen.getByTestId('mvd-analizy-widoki-klasyczne')).toBeTruthy();
    expect(jestDawnymHubem(useNetworkBuildStore.getState().activeSurface)).toBe(true);
  });

  it('komplet kart rejestru: każda z tytułem, zdaniem inżynierskim i przyciskiem „Otwórz"', () => {
    render(<WidokiKlasyczne />);
    expect(WIDOKI_KLASYCZNE.length).toBeGreaterThan(0);
    for (const widok of WIDOKI_KLASYCZNE) {
      const karta = screen.getByTestId(widok.testid);
      expect(within(karta).getByRole('heading', { level: 5, name: widok.tytul })).toBeTruthy();
      expect(within(karta).getByText(widok.opis)).toBeTruthy();
      expect(within(karta).getByRole('button', { name: T.otworz })).toBeTruthy();
    }
  });

  // KLASA: rejestr niesie WYŁĄCZNIE powierzchnie bez dostawcy ui2 — karta dla ekranu,
  // który ma zakładkę w obszarach warsztatu (E-29…E-34), byłaby drugą drogą do tej
  // samej zdolności (dwa wejścia = dwa źródła prawdy o tym, gdzie żyje funkcja).
  it('rejestr wskazuje wyłącznie powierzchnie mostu bez odpowiednika ui2 (E-27, E-28, taby E-35)', () => {
    const kody = new Set(WIDOKI_KLASYCZNE.map((widok) => widok.ekran));
    expect([...kody].sort()).toEqual(['E-27', 'E-28', 'E-35']);
    for (const widok of WIDOKI_KLASYCZNE.filter((w) => w.ekran === 'E-35')) {
      expect(widok.tabId, `tab E-35 bez jawnego tabId: ${widok.tytul}`).toBeTruthy();
    }
  });

  it('karta „Zabezpieczenia i automatyka" (E-27) otwiera powierzchnię kanoniczną mostu (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<MostAnalizTechnicznych />);
    const karta = screen.getByTestId('mvd-analizy-karta-zabezpieczenia');
    expect(within(karta).getByText(/SPZ\/SZR\/SCO\/FDIR/)).toBeTruthy();
    await user.click(within(karta).getByRole('button', { name: T.otworz }));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-27');
  });

  it('karta koordynacji (E-28) otwiera powierzchnię; powierzchnia-dziecko ma router z paskiem powrotu', async () => {
    const user = userEvent.setup();
    render(<MostAnalizTechnicznych />);
    await user.click(
      within(screen.getByTestId('mvd-analizy-karta-koordynacja')).getByRole('button', { name: T.otworz }),
    );
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-28');
    expect(screen.getByTestId('mvd-analizy-most-dziecko')).toBeTruthy();
    expect(screen.getByRole('button', { name: T.powrot })).toBeTruthy();
    expect(screen.queryByTestId('mvd-analizy-widoki-klasyczne')).toBeNull();
  });

  it('widoki klasyczne otwierają JAWNE taby powierzchni analiz (parytet mostu: compare/trace/ncrfg-tests)', async () => {
    const user = userEvent.setup();
    for (const widok of WIDOKI_KLASYCZNE.filter((w) => w.tabId !== undefined)) {
      // Najpierw odmontowanie, potem zerowanie store'u — inaczej poprzedni render
      // dostałby aktualizację poza act.
      cleanup();
      useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
      render(<MostAnalizTechnicznych />);
      await user.click(within(screen.getByTestId(widok.testid)).getByRole('button', { name: T.otworz }));
      const surface = useNetworkBuildStore.getState().activeSurface;
      expect(surface?.screenCode, widok.tytul).toBe('E-35');
      expect(surface?.tabId, widok.tytul).toBe(widok.tabId);
      // Jawny tab NIE jest przechwytywany przez rejestr — deep-linki `#analysis?tab=…` działają.
      expect(screen.getByTestId('mvd-analizy-most-dziecko')).toBeTruthy();
    }
  });

  it('powrót czyści powierzchnię trasową i przywraca rejestr (klik natywny)', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface('E-28');
    render(<MostAnalizTechnicznych />);
    await user.click(screen.getByRole('button', { name: T.powrot }));
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
    expect(screen.getByTestId('mvd-analizy-widoki-klasyczne')).toBeTruthy();
  });

  it('pełna ścieżka użytkownika: rejestr → karta → powierzchnia → powrót → rejestr', async () => {
    const user = userEvent.setup();
    render(<MostAnalizTechnicznych />);
    await user.click(
      screen.getByTestId('mvd-analizy-karta-koordynacja').querySelector('button.mvd-analizy-otworz') as HTMLElement,
    );
    expect(screen.getByTestId('mvd-analizy-most-dziecko')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: T.powrot }));
    expect(screen.getByTestId('mvd-analizy-widoki-klasyczne')).toBeTruthy();
  });

  it('powierzchnia klasy B (E-31, panel prawy) pokazuje REJESTR w środku, nie router (F-E5c)', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-31');
    expect(useNetworkBuildStore.getState().activeSurface?.openMode).toBe('replace_right_panel');
    render(<MostAnalizTechnicznych />);
    expect(screen.getByTestId('mvd-analizy-most-panel')).toBeTruthy();
    expect(screen.getByTestId('mvd-analizy-widoki-klasyczne')).toBeTruthy();
    expect(screen.queryByTestId('mvd-analizy-most-dziecko')).toBeNull();
  });

  it('powierzchnia klasy B ma pasek „Zamknij panel analizy", a powierzchnia dalej żyje w panelu', () => {
    useNetworkBuildStore.getState().openRouteSurface('E-31');
    render(<MostAnalizTechnicznych />);
    expect(screen.getByRole('button', { name: T.zamknijPanel })).toBeTruthy();
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-31');
  });

  it('przycisk „Zamknij panel analizy" czyści powierzchnię panelu i wraca do rejestru (klik natywny)', async () => {
    const user = userEvent.setup();
    useNetworkBuildStore.getState().openRouteSurface('E-31');
    render(<MostAnalizTechnicznych />);
    await user.click(screen.getByRole('button', { name: T.zamknijPanel }));
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
    expect(screen.getByTestId('mvd-analizy-widoki-klasyczne')).toBeTruthy();
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
