/**
 * Testy huba „Dokumentacja" (karta F-E8.1; runda R2 — uproszczenie). Interakcje
 * przez natywną ścieżkę użytkownika (userEvent.click) — Zero-Debt pkt 5
 * (żadnych syntetycznych dispatchEvent). Karty mapują na REALNYCH dostawców
 * (E-37/E-36/przestrzeń „Projekt") — testy dowodzą nawigacji, nie atrap.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useShellStore } from '../../../shell/useShellStore';
import type { EnergyNetworkModel } from '../../../../types/enm';
import { HubDokumentacji } from '../HubDokumentacji';
import { dokumentDostepny, maZakonczonyPrzebieg, ostatniZakonczonyPrzebieg, zawartoscZPrzebiegow } from '../model';

function snapshotTestowy(): EnergyNetworkModel {
  return {
    header: { name: 'Sieć testowa', revision: 4, hash_sha256: 'deadbeef1234' },
    buses: [], branches: [], transformers: [], sources: [], generators: [], loads: [],
    stations: [], junctions: [], branch_points: [], corridors: [], measurements: [], protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

function przebiegZakonczony(analysisType: string, finishedAt: string) {
  return {
    id: `run-${analysisType}-${finishedAt}`,
    analysis_type: analysisType,
    status: 'DONE',
    started_at: finishedAt,
    finished_at: finishedAt,
  } as unknown as ReturnType<typeof useExecutionRunsStore.getState>['runs'][number];
}

describe('HubDokumentacji — ekran prowadzący (R2: 3 pytania inżyniera)', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeProjectName: null, activeCaseName: null, activeCaseId: null });
    useSnapshotStore.setState({ snapshot: null });
    useExecutionRunsStore.setState({ runs: [] });
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
    useShellStore.setState({ activeSpace: 'dokumentacja' });
  });

  afterEach(() => {
    cleanup();
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
    useExecutionRunsStore.setState({ runs: [] });
    useSnapshotStore.setState({ snapshot: null });
  });

  it('deklaruje cel ekranu w nagłówku (jednym zdaniem)', () => {
    render(<HubDokumentacji />);
    expect(screen.getByRole('heading', { level: 2, name: 'Dokumentacja' })).toBeTruthy();
    expect(screen.getByText('Wygeneruj dokumenty odbiorowe z zakończonych obliczeń.')).toBeTruthy();
  });

  it('Q1 status: bez przebiegu — uczciwy komunikat + akcja do obliczeń (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<HubDokumentacji />);
    expect(screen.getByTestId('mvd-dok-status-brak')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Przejdź do obliczeń' }));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('Q1 status: z przebiegiem — „Obliczenia zakończone" + rodzaj/data + wersja układu', () => {
    useSnapshotStore.setState({ snapshot: snapshotTestowy() });
    useExecutionRunsStore.setState({ runs: [przebiegZakonczony('LOAD_FLOW', '2026-07-21T10:30:00Z')] });
    render(<HubDokumentacji />);
    const ok = screen.getByTestId('mvd-dok-status-ok');
    expect(within(ok).getByText('Obliczenia zakończone')).toBeTruthy();
    expect(within(ok).getByText(/Rozpływ mocy · 2026-07-21 10:30/)).toBeTruthy();
    expect(within(ok).getByText(/rew\. 4 · deadbeef/)).toBeTruthy();
  });

  it('Q2 karty: opis krótki, ikona per typ (data-akcent), WHITE BOX wyróżniony', () => {
    render(<HubDokumentacji />);
    expect(screen.getByTestId('mvd-dok-karta-raport').getAttribute('data-akcent')).toBe('accent');
    expect(screen.getByTestId('mvd-dok-karta-archiwum').getAttribute('data-akcent')).toBe('neutralny');
    const dowod = screen.getByTestId('mvd-dok-karta-dowod');
    expect(dowod.getAttribute('data-wyroznione')).toBe('true');
    expect(within(dowod).getByText('DOWÓD FORMALNY')).toBeTruthy();
  });

  it('Q2 status kart: „Wymaga: …" bez danych; „Do wygenerowania" po spełnieniu warunku', () => {
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-karta-raport-status')).getByText('Wymaga: zakończony przebieg')).toBeTruthy();
    expect(within(screen.getByTestId('mvd-dok-karta-archiwum-status')).getByText('Wymaga: otwarty projekt')).toBeTruthy();
    cleanup();
    useExecutionRunsStore.setState({ runs: [przebiegZakonczony('SC_3F', '2026-07-21T09:00:00Z')] });
    useAppStateStore.setState({ activeProjectName: 'Projekt X' });
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-karta-raport-status')).getByText('Do wygenerowania')).toBeTruthy();
    expect(within(screen.getByTestId('mvd-dok-karta-archiwum-status')).getByText('Do wygenerowania')).toBeTruthy();
  });

  it('Q2 zawartość (ważniejsza niż formaty): z REALNEGO przebiegu rozpływu', () => {
    useExecutionRunsStore.setState({ runs: [przebiegZakonczony('LOAD_FLOW', '2026-07-21T12:00:00Z')] });
    render(<HubDokumentacji />);
    const zaw = screen.getByTestId('mvd-dok-karta-raport-zawartosc');
    for (const s of ['Rozpływ mocy', 'Spadki napięć', 'Obciążalność linii', 'Bilans mocy']) {
      expect(within(zaw).getByText(s)).toBeTruthy();
    }
  });

  it('Q2 akcje nazywają skutek i otwierają realnych dostawców (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<HubDokumentacji />);
    await user.click(within(screen.getByTestId('mvd-dok-karta-raport')).getByRole('button', { name: 'Otwórz generator' }));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-37');
    cleanup();
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
    render(<HubDokumentacji />);
    await user.click(within(screen.getByTestId('mvd-dok-karta-dowod')).getByRole('button', { name: 'Otwórz dowód' }));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-36');
    cleanup();
    render(<HubDokumentacji />);
    await user.click(within(screen.getByTestId('mvd-dok-karta-archiwum')).getByRole('button', { name: 'Otwórz archiwum' }));
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('Q2 formaty są drugorzędne (drobny druk obok akcji, nie chipy)', () => {
    render(<HubDokumentacji />);
    const raport = screen.getByTestId('mvd-dok-karta-raport');
    expect(within(raport).getByText('PDF · DOCX · JSON')).toBeTruthy();
  });

  it('Q3 pasek procesu „CO DALEJ": 5 etapów, Dokumentacja aktywna', () => {
    render(<HubDokumentacji />);
    const proces = screen.getByTestId('mvd-dok-proces');
    for (const e of ['Projekt', 'Obliczenia', 'Dokumentacja', 'Eksport', 'Wniosek OSD']) {
      expect(within(proces).getByText(e)).toBeTruthy();
    }
  });
});

describe('model dokumentacji — czyste selektory', () => {
  it('maZakonczonyPrzebieg: dowolny zakończony przebieg wystarcza', () => {
    expect(maZakonczonyPrzebieg([{ analysis_type: 'SC_3F', status: 'RUNNING' }])).toBe(false);
    expect(maZakonczonyPrzebieg([{ analysis_type: 'LOAD_FLOW', status: 'DONE' }])).toBe(true);
  });

  it('dokumentDostepny: „projekt" zależy od projektu, „przebieg" od zakończonego przebiegu', () => {
    const bezPrzebiegu: readonly { analysis_type: string; status: string }[] = [];
    const zPrzebiegiem = [{ analysis_type: 'LOAD_FLOW', status: 'DONE' }];
    expect(dokumentDostepny('projekt', true, bezPrzebiegu)).toBe(true);
    expect(dokumentDostepny('projekt', false, zPrzebiegiem)).toBe(false);
    expect(dokumentDostepny('przebieg', false, zPrzebiegiem)).toBe(true);
    expect(dokumentDostepny('przebieg', true, bezPrzebiegu)).toBe(false);
  });

  it('ostatniZakonczonyPrzebieg wybiera najnowszy po dacie zakończenia', () => {
    const runs = [
      { analysis_type: 'SC_3F', status: 'DONE', finished_at: '2026-07-17T08:00:00Z' },
      { analysis_type: 'LOAD_FLOW', status: 'DONE', finished_at: '2026-07-21T09:00:00Z' },
    ];
    expect(ostatniZakonczonyPrzebieg(runs)?.analysis_type).toBe('LOAD_FLOW');
    expect(ostatniZakonczonyPrzebieg([])).toBeNull();
  });

  it('zawartoscZPrzebiegow: rozpływ → 4 sekcje (z obciążalnością), zwarcie → IEC, tylko zakończone', () => {
    expect(zawartoscZPrzebiegow([{ analysis_type: 'LOAD_FLOW', status: 'DONE' }])).toEqual([
      'Rozpływ mocy', 'Spadki napięć', 'Obciążalność linii', 'Bilans mocy',
    ]);
    expect(zawartoscZPrzebiegow([{ analysis_type: 'SC_3F', status: 'DONE' }])).toEqual(['Zwarcia (IEC 60909)']);
    expect(zawartoscZPrzebiegow([{ analysis_type: 'LOAD_FLOW', status: 'RUNNING' }])).toEqual([]);
  });
});
