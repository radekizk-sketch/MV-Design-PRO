/**
 * Testy ekranu „Analizy techniczne" (przebudowa od zera — audyt właściciela).
 * Interakcje przez natywną ścieżkę użytkownika (userEvent.click) — dyrektywa
 * Zero-Debt pkt 5 (żadnych syntetycznych dispatchEvent).
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
import { EkranAnalizTechnicznych } from '../EkranAnalizTechnicznych';
import { maZakonczonyPrzebieg, ostatniZakonczonyPrzebieg } from '../model';

function snapshotTestowy(): EnergyNetworkModel {
  return {
    header: { name: 'Sieć testowa', revision: 7, hash_sha256: 'abcdef1234567890' },
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

describe('EkranAnalizTechnicznych — hub po przebudowie', () => {
  beforeEach(() => {
    useAppStateStore.setState({
      activeProjectName: null,
      activeCaseName: null,
      activeCaseId: null,
    });
    useSnapshotStore.setState({ snapshot: null });
    useExecutionRunsStore.setState({ runs: [] });
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
    useShellStore.setState({ activeSpace: 'wyniki', wynikiTab: null, wynikiTabElement: null });
  });

  afterEach(() => {
    cleanup();
    useNetworkBuildStore.setState({ activeSurface: null, surfaceStack: [] });
    useExecutionRunsStore.setState({ runs: [] });
    useSnapshotStore.setState({ snapshot: null });
  });

  it('deklaruje cel ekranu w nagłówku (audyt A.1)', () => {
    render(<EkranAnalizTechnicznych />);
    expect(screen.getByRole('heading', { level: 2, name: 'Analizy techniczne' })).toBeTruthy();
    expect(screen.getByText(/interpretujące wyniki zakończonych obliczeń/)).toBeTruthy();
  });

  it('tor pracy: cztery kroki z uczciwymi stanami braku (audyt B/D)', () => {
    render(<EkranAnalizTechnicznych />);
    for (const krok of ['projekt', 'wariant', 'wersja', 'obliczenie']) {
      const el = screen.getByTestId(`mvd-analizy-krok-${krok}`);
      expect(el.getAttribute('data-stan')).toBe('brak');
    }
    expect(screen.getByText('nie wybrano projektu')).toBeTruthy();
    expect(screen.getByText('nie wykonano obliczeń')).toBeTruthy();
  });

  it('tor pracy: wartości rzeczywiste gdy kontekst jest kompletny', () => {
    useAppStateStore.setState({
      activeProjectName: 'Przyłączenie farmy PV 8 MW',
      activeCaseName: 'Wariant zimowy',
    });
    useSnapshotStore.setState({ snapshot: snapshotTestowy() });
    useExecutionRunsStore.setState({ runs: [przebiegZakonczony('LOAD_FLOW', '2026-07-18T10:30:00Z')] });
    render(<EkranAnalizTechnicznych />);
    expect(screen.getByText('Przyłączenie farmy PV 8 MW')).toBeTruthy();
    expect(screen.getByText('Wariant zimowy')).toBeTruthy();
    expect(screen.getByText('rew. 7 · abcdef12')).toBeTruthy();
    expect(screen.getByText(/Rozpływ mocy · 2026-07-18 10:30/)).toBeTruthy();
    for (const krok of ['projekt', 'wariant', 'wersja', 'obliczenie']) {
      expect(screen.getByTestId(`mvd-analizy-krok-${krok}`).getAttribute('data-stan')).toBe('ok');
    }
  });

  it('akcja naprawcza kroku prowadzi do właściwej przestrzeni (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<EkranAnalizTechnicznych />);
    const krokProjekt = screen.getByTestId('mvd-analizy-krok-projekt');
    await user.click(within(krokProjekt).getByRole('button', { name: 'Wybierz projekt' }));
    expect(useShellStore.getState().activeSpace).toBe('projekt');
  });

  it('karta analizy niesie opis inżynierski i źródło danych (audyt B.6)', () => {
    render(<EkranAnalizTechnicznych />);
    const karta = screen.getByTestId('mvd-analizy-karta-koordynacja');
    expect(within(karta).getByText(/dobór nastaw i selektywność/)).toBeTruthy();
    expect(within(karta).getByText(/ŹRÓDŁO DANYCH:/)).toBeTruthy();
    expect(within(karta).getByText(/przebieg zwarciowy \(IEC 60909\)/)).toBeTruthy();
  });

  it('chip wymagań: bez przebiegu zwarciowego karta uczciwie to zapowiada', () => {
    useExecutionRunsStore.setState({ runs: [przebiegZakonczony('LOAD_FLOW', '2026-07-18T10:30:00Z')] });
    render(<EkranAnalizTechnicznych />);
    const koordynacja = screen.getByTestId('mvd-analizy-karta-koordynacja');
    expect(within(koordynacja).getByText('wymaga przebiegu zwarciowego')).toBeTruthy();
    const zbieznosc = screen.getByTestId('mvd-analizy-karta-zbieznosc');
    expect(within(zbieznosc).getByText('dane dostępne')).toBeTruthy();
  });

  it('chip wymagań: zakończone zwarcie odblokowuje karty zwarciowe', () => {
    useExecutionRunsStore.setState({ runs: [przebiegZakonczony('SC_3F', '2026-07-18T09:00:00Z')] });
    render(<EkranAnalizTechnicznych />);
    for (const testid of ['mvd-analizy-karta-koordynacja', 'mvd-analizy-karta-wklady', 'mvd-analizy-karta-cieplna']) {
      expect(within(screen.getByTestId(testid)).getByText('dane dostępne')).toBeTruthy();
    }
    expect(
      within(screen.getByTestId('mvd-analizy-karta-zbieznosc')).getByText('wymaga przebiegu rozpływu'),
    ).toBeTruthy();
  });

  it('„Otwórz" na karcie otwiera powierzchnię kanoniczną mostu (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<EkranAnalizTechnicznych />);
    const karta = screen.getByTestId('mvd-analizy-karta-koordynacja');
    await user.click(within(karta).getByRole('button', { name: 'Otwórz' }));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-28');
  });

  it('karta „Wkłady źródeł rozszerzone" (E-33) prowadzi do realnego dostawcy — zakładki zwarć (klik natywny, P-1)', async () => {
    const user = userEvent.setup();
    render(<EkranAnalizTechnicznych />);
    const karta = screen.getByTestId('mvd-analizy-karta-wklady');
    // Opis inżynierski wg stanu FAKTYCZNEGO dostawcy (rozbicie maszynowe).
    expect(within(karta).getByText(/μ, q oraz Ib/)).toBeTruthy();
    expect(within(karta).getByText(/Wkłady do zwarcia/)).toBeTruthy();
    await user.click(within(karta).getByRole('button', { name: 'Otwórz' }));
    // Deep-link zakładki warsztatu Wyników — bez powierzchni trasowej mostu.
    expect(useShellStore.getState().wynikiTab).toBe('zwarcia');
    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });

  it('karta „Weryfikacja cieplna i dynamiczna toru" (E-34) prowadzi do zakładki zwarć z bilansem IEC (klik natywny, P-1)', async () => {
    const user = userEvent.setup();
    render(<EkranAnalizTechnicznych />);
    const karta = screen.getByTestId('mvd-analizy-karta-cieplna');
    // Opis wskazuje bilans IEC 60909 i miejsce werdyktu (dobór aparatów).
    expect(within(karta).getByText(/Bilans IEC 60909/)).toBeTruthy();
    expect(within(karta).getByText(/dobór aparatów/)).toBeTruthy();
    await user.click(within(karta).getByRole('button', { name: 'Otwórz' }));
    expect(useShellStore.getState().wynikiTab).toBe('zwarcia');
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });

  it('widoki klasyczne otwierają jawne taby powierzchni analiz (parytet mostu)', async () => {
    const user = userEvent.setup();
    render(<EkranAnalizTechnicznych />);
    await user.click(screen.getByTestId('mvd-analizy-klasyczne-slad'));
    const surface = useNetworkBuildStore.getState().activeSurface;
    expect(surface?.screenCode).toBe('E-35');
    expect(surface?.tabId).toBe('trace');
  });

  it('karta „Zabezpieczenia i automatyka" (E-27) jest w grupie zabezpieczeń i otwiera ekran (klik natywny)', async () => {
    const user = userEvent.setup();
    render(<EkranAnalizTechnicznych />);
    const karta = screen.getByTestId('mvd-analizy-karta-zabezpieczenia');
    expect(within(karta).getByText(/SPZ\/SZR\/SCO\/FDIR/)).toBeTruthy();
    await user.click(within(karta).getByRole('button', { name: 'Otwórz' }));
    expect(useNetworkBuildStore.getState().activeSurface?.screenCode).toBe('E-27');
  });

  it('chip wymagań E-27: bez modelu „wymaga modelu sieci", z modelem „dane dostępne" (bez przebiegów)', () => {
    const { unmount } = render(<EkranAnalizTechnicznych />);
    expect(
      within(screen.getByTestId('mvd-analizy-karta-zabezpieczenia')).getByText('wymaga modelu sieci'),
    ).toBeTruthy();
    unmount();
    useSnapshotStore.setState({ snapshot: snapshotTestowy() });
    render(<EkranAnalizTechnicznych />);
    expect(
      within(screen.getByTestId('mvd-analizy-karta-zabezpieczenia')).getByText('dane dostępne'),
    ).toBeTruthy();
  });

  it('wszystkie karty parytetu huba są obecne (E-27…E-34)', () => {
    render(<EkranAnalizTechnicznych />);
    for (const testid of [
      'mvd-analizy-karta-zabezpieczenia',
      'mvd-analizy-karta-koordynacja',
      'mvd-analizy-karta-zbieznosc',
      'mvd-analizy-karta-fazowy',
      'mvd-analizy-karta-stabilnosc',
      'mvd-analizy-karta-skladowe',
      'mvd-analizy-karta-wklady',
      'mvd-analizy-karta-cieplna',
    ]) {
      expect(screen.getByTestId(testid)).toBeTruthy();
    }
  });
});

describe('model — czyste selektory przebiegów', () => {
  it('maZakonczonyPrzebieg rozróżnia rodzaje i statusy', () => {
    const runs = [
      { analysis_type: 'SC_3F', status: 'RUNNING' },
      { analysis_type: 'LOAD_FLOW', status: 'DONE' },
    ];
    expect(maZakonczonyPrzebieg(runs, 'zwarciowy')).toBe(false);
    expect(maZakonczonyPrzebieg(runs, 'rozplywowy')).toBe(true);
    expect(maZakonczonyPrzebieg(runs, 'dowolny')).toBe(true);
    // 'model' nie wymaga przebiegu — dostępność ocenia widok po snapshotcie.
    expect(maZakonczonyPrzebieg([], 'model')).toBe(true);
  });

  it('ostatniZakonczonyPrzebieg wybiera najnowszy po dacie zakończenia', () => {
    const runs = [
      { analysis_type: 'SC_3F', status: 'DONE', finished_at: '2026-07-17T08:00:00Z' },
      { analysis_type: 'LOAD_FLOW', status: 'DONE', finished_at: '2026-07-18T09:00:00Z' },
      { analysis_type: 'SC_1F', status: 'FAILED', finished_at: '2026-07-19T09:00:00Z' },
    ];
    expect(ostatniZakonczonyPrzebieg(runs)?.analysis_type).toBe('LOAD_FLOW');
    expect(ostatniZakonczonyPrzebieg([])).toBeNull();
  });
});

describe('chip wymagań — rodzaj „dowolny"', () => {
  it('bez żadnego przebiegu karta stanu fazowego mówi „wymaga zakończonego przebiegu"', () => {
    useExecutionRunsStore.setState({ runs: [] });
    render(<EkranAnalizTechnicznych />);
    expect(
      within(screen.getByTestId('mvd-analizy-karta-fazowy')).getByText('wymaga zakończonego przebiegu'),
    ).toBeTruthy();
  });
});
