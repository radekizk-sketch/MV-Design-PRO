/**
 * Testy huba „Dokumentacja" (karta F-E8.1). Interakcje przez natywną ścieżkę
 * użytkownika (userEvent.click) — Zero-Debt pkt 5 (żadnych syntetycznych
 * dispatchEvent). Karty mapują na REALNYCH dostawców (E-37/E-36/przestrzeń
 * „Projekt") — testy dowodzą nawigacji, nie atrap.
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
import { dokumentDostepny, maZakonczonyPrzebieg, ostatniZakonczonyPrzebieg } from '../model';

function snapshotTestowy(): EnergyNetworkModel {
  return {
    header: { name: 'Sieć testowa', revision: 4, hash_sha256: 'deadbeef1234' },
    buses: [],
    branches: [],
    sources: [],
    loads: [],
    stations: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
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

describe('HubDokumentacji — ekran prowadzący przestrzeni „Dokumentacja"', () => {
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

  it('deklaruje cel ekranu w nagłówku (kontrakt ekranu prowadzącego a)', () => {
    render(<HubDokumentacji />);
    expect(screen.getByRole('heading', { level: 2, name: 'Dokumentacja' })).toBeTruthy();
    expect(screen.getByText(/Domknięcie projektu dokumentem odbiorowym/)).toBeTruthy();
  });

  it('tor pracy: cztery kroki z uczciwymi stanami braku (kontrakt b/c)', () => {
    render(<HubDokumentacji />);
    for (const krok of ['projekt', 'wariant', 'wersja', 'obliczenie']) {
      expect(screen.getByTestId(`mvd-dok-krok-${krok}`).getAttribute('data-stan')).toBe('brak');
    }
    expect(screen.getByText('nie wybrano projektu')).toBeTruthy();
    expect(screen.getByText('nie wykonano obliczeń')).toBeTruthy();
  });

  it('tor pracy: wartości rzeczywiste gdy kontekst kompletny', () => {
    useAppStateStore.setState({ activeProjectName: 'Przyłączenie BESS 5 MW', activeCaseName: 'Wariant letni' });
    useSnapshotStore.setState({ snapshot: snapshotTestowy() });
    useExecutionRunsStore.setState({ runs: [przebiegZakonczony('LOAD_FLOW', '2026-07-21T12:00:00Z')] });
    render(<HubDokumentacji />);
    expect(screen.getByText('Przyłączenie BESS 5 MW')).toBeTruthy();
    expect(screen.getByText('rew. 4 · deadbeef')).toBeTruthy();
    expect(screen.getByText(/Rozpływ mocy · 2026-07-21 12:00/)).toBeTruthy();
  });

  it('akcja naprawcza kroku prowadzi do właściwej przestrzeni (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<HubDokumentacji />);
    await user.click(within(screen.getByTestId('mvd-dok-krok-projekt')).getByRole('button', { name: 'Wybierz projekt' }));
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('karta raportu niesie opis inżynierski i uczciwe źródło danych', () => {
    render(<HubDokumentacji />);
    const karta = screen.getByTestId('mvd-dok-karta-raport');
    expect(within(karta).getByText(/Eksport PDF\/DOCX z odciskiem determinizmu/)).toBeTruthy();
    expect(within(karta).getByText(/ŹRÓDŁO DANYCH:/)).toBeTruthy();
    expect(within(karta).getByText(/generator raportu backendu/)).toBeTruthy();
  });

  it('chip wymagań: dokument z obliczeń wymaga zakończonego przebiegu; z przebiegiem odblokowany', () => {
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-karta-raport')).getByText('wymaga zakończonego przebiegu')).toBeTruthy();
    expect(within(screen.getByTestId('mvd-dok-karta-dowod')).getByText('wymaga zakończonego przebiegu')).toBeTruthy();
    cleanup();
    useExecutionRunsStore.setState({ runs: [przebiegZakonczony('SC_3F', '2026-07-21T09:00:00Z')] });
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-karta-raport')).getByText('można wytworzyć')).toBeTruthy();
    expect(within(screen.getByTestId('mvd-dok-karta-dowod')).getByText('można wytworzyć')).toBeTruthy();
  });

  it('chip wymagań: archiwum projektu wymaga otwartego projektu; z projektem odblokowane', () => {
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-karta-archiwum')).getByText('wymaga otwartego projektu')).toBeTruthy();
    cleanup();
    useAppStateStore.setState({ activeProjectName: 'Projekt X' });
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-karta-archiwum')).getByText('można wytworzyć')).toBeTruthy();
  });

  it('„Otwórz" na karcie raportu otwiera realny generator raportu E-37 (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<HubDokumentacji />);
    await user.click(within(screen.getByTestId('mvd-dok-karta-raport')).getByRole('button', { name: 'Otwórz' }));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-37');
  });

  it('„Otwórz" na karcie pakietu dowodowego otwiera realny ekran dowodu E-36 (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<HubDokumentacji />);
    await user.click(within(screen.getByTestId('mvd-dok-karta-dowod')).getByRole('button', { name: 'Otwórz' }));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-36');
  });

  it('„Otwórz" na karcie archiwum przechodzi do przestrzeni „Projekt" (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<HubDokumentacji />);
    await user.click(within(screen.getByTestId('mvd-dok-karta-archiwum')).getByRole('button', { name: 'Otwórz' }));
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('sekcja NASTĘPNY KROK domyka łańcuch (kontrakt d)', () => {
    render(<HubDokumentacji />);
    expect(screen.getByText('Po wytworzeniu dokumentów')).toBeTruthy();
    expect(screen.getByText(/podstawę wniosku przyłączeniowego do OSD/)).toBeTruthy();
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
});
