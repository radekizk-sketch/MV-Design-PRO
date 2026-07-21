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
import {
  dokumentDostepny,
  maZakonczonyPrzebieg,
  ostatniZakonczonyPrzebieg,
  podsumowanieModelu,
  wykonaneObliczenia,
  zawartoscZPrzebiegow,
} from '../model';

function snapshotTestowy(): EnergyNetworkModel {
  return {
    header: { name: 'Sieć testowa', revision: 4, hash_sha256: 'deadbeef1234' },
    buses: [],
    branches: [],
    transformers: [],
    sources: [],
    generators: [],
    loads: [],
    stations: [],
    junctions: [],
    branch_points: [],
    corridors: [],
    measurements: [],
    protection_assignments: [],
  } as unknown as EnergyNetworkModel;
}

/** Snapshot z realnymi obiektami — do testu panelu „Analizowany model". */
function snapshotZObiektami(): EnergyNetworkModel {
  return {
    header: { name: 'Sieć testowa', revision: 4, hash_sha256: 'deadbeef1234' },
    buses: [
      { ref_id: 'b1', name: 'SN-1', voltage_kv: 15 },
      { ref_id: 'b2', name: 'SN-2', voltage_kv: 15 },
      { ref_id: 'b3', name: 'WN-1', voltage_kv: 110 },
      { ref_id: 'b4', name: 'nN-1', voltage_kv: 0.4 },
    ],
    branches: [{ ref_id: 'l1' }, { ref_id: 'l2' }, { ref_id: 'l3' }],
    transformers: [{ ref_id: 't1' }, { ref_id: 't2' }],
    sources: [{ ref_id: 's1' }],
    generators: [{ ref_id: 'g1' }],
    loads: [{ ref_id: 'o1' }, { ref_id: 'o2' }],
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

  it('karta raportu niesie opis inżynierski, formaty i uczciwe źródło danych', () => {
    render(<HubDokumentacji />);
    const karta = screen.getByTestId('mvd-dok-karta-raport');
    expect(within(karta).getByText(/odciskiem determinizmu/)).toBeTruthy();
    expect(within(karta).getByText(/ŹRÓDŁO DANYCH:/)).toBeTruthy();
    expect(within(karta).getByText(/generator raportu backendu/)).toBeTruthy();
    // Formaty (recenzja pkt 6, realne): PDF/DOCX/JSON.
    for (const f of ['PDF', 'DOCX', 'JSON']) expect(within(karta).getByText(f)).toBeTruthy();
  });

  it('status (recenzja pkt 4): „Wymaga: zakończony przebieg" bez przebiegu; „Do wygenerowania" z przebiegiem', () => {
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-karta-raport-status')).getByText('Wymaga: zakończony przebieg')).toBeTruthy();
    expect(within(screen.getByTestId('mvd-dok-karta-dowod-status')).getByText('Wymaga: zakończony przebieg')).toBeTruthy();
    cleanup();
    useExecutionRunsStore.setState({ runs: [przebiegZakonczony('SC_3F', '2026-07-21T09:00:00Z')] });
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-karta-raport-status')).getByText('Do wygenerowania')).toBeTruthy();
    expect(within(screen.getByTestId('mvd-dok-karta-dowod-status')).getByText('Do wygenerowania')).toBeTruthy();
  });

  it('status: archiwum „Wymaga: otwarty projekt"; z projektem „Do wygenerowania"', () => {
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-karta-archiwum-status')).getByText('Wymaga: otwarty projekt')).toBeTruthy();
    cleanup();
    useAppStateStore.setState({ activeProjectName: 'Projekt X' });
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-karta-archiwum-status')).getByText('Do wygenerowania')).toBeTruthy();
  });

  it('pakiet dowodowy jest wyróżniony jako dowód formalny (recenzja pkt 7)', () => {
    render(<HubDokumentacji />);
    const dowod = screen.getByTestId('mvd-dok-karta-dowod');
    expect(dowod.getAttribute('data-wyroznione')).toBe('true');
    expect(within(dowod).getByText('DOWÓD FORMALNY')).toBeTruthy();
  });

  it('akcje nazywają CO SIĘ WYDARZY (recenzja pkt 3) i otwierają realnych dostawców', async () => {
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

  it('panel „Analizowany model" (recenzja pkt 5): realne liczniki ze snapshotu', () => {
    useSnapshotStore.setState({ snapshot: snapshotZObiektami() });
    render(<HubDokumentacji />);
    const model = screen.getByTestId('mvd-dok-model');
    expect(within(model).getByText('110 / 15 / 0,4 kV')).toBeTruthy(); // poziomy napięć
    expect(within(model).getByText('Węzły (szyny)')).toBeTruthy();
    expect(within(model).getByText('Transformatory')).toBeTruthy();
    expect(within(model).getByText('Generacja / DER')).toBeTruthy();
  });

  it('panel modelu: uczciwy stan zerowy bez modelu', () => {
    useSnapshotStore.setState({ snapshot: null });
    render(<HubDokumentacji />);
    expect(within(screen.getByTestId('mvd-dok-model')).getByText(/Brak modelu sieci/)).toBeTruthy();
  });

  it('zawartość dokumentu (recenzja pkt 8) z REALNYCH przebiegów: rozpływ → sekcje', () => {
    useExecutionRunsStore.setState({ runs: [przebiegZakonczony('LOAD_FLOW', '2026-07-21T12:00:00Z')] });
    render(<HubDokumentacji />);
    const zaw = screen.getByTestId('mvd-dok-karta-raport-zawartosc');
    for (const s of ['Rozpływ mocy', 'Spadki napięć', 'Bilans mocy']) {
      expect(within(zaw).getByText(s)).toBeTruthy();
    }
  });

  it('pasek procesu (recenzja pkt 9): Dokumentacja jest etapem aktywnym', () => {
    render(<HubDokumentacji />);
    const proces = screen.getByTestId('mvd-dok-proces');
    for (const e of ['Projekt', 'Obliczenia', 'Dokumentacja', 'Eksport', 'Wniosek OSD']) {
      expect(within(proces).getByText(e)).toBeTruthy();
    }
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

  it('podsumowanieModelu: realne liczniki i distinct poziomy napięć malejąco', () => {
    expect(podsumowanieModelu(null)).toBeNull();
    const snap = {
      header: { revision: 1, hash_sha256: 'x' },
      buses: [{ voltage_kv: 15 }, { voltage_kv: 15 }, { voltage_kv: 110 }, { voltage_kv: 0.4 }],
      branches: [{}, {}, {}],
      transformers: [{}, {}],
      sources: [{}],
      generators: [{}],
      loads: [{}, {}],
    } as unknown as EnergyNetworkModel;
    const p = podsumowanieModelu(snap)!;
    expect(p.poziomyNapiecKv).toEqual([110, 15, 0.4]);
    expect(p.wezly).toBe(4);
    expect(p.galezie).toBe(3);
    expect(p.transformatory).toBe(2);
    expect(p.zrodla).toBe(1);
    expect(p.generacja).toBe(1);
    expect(p.odbiory).toBe(2);
  });

  it('wykonaneObliczenia: distinct etykiety wyłącznie zakończonych przebiegów', () => {
    const runs = [
      { analysis_type: 'LOAD_FLOW', status: 'DONE' },
      { analysis_type: 'LOAD_FLOW', status: 'DONE' },
      { analysis_type: 'SC_3F', status: 'RUNNING' },
    ];
    expect(wykonaneObliczenia(runs)).toEqual(['Rozpływ mocy']);
  });

  it('zawartoscZPrzebiegow: rozpływ → 3 sekcje, zwarcie → sekcja IEC, tylko zakończone', () => {
    expect(zawartoscZPrzebiegow([{ analysis_type: 'LOAD_FLOW', status: 'DONE' }])).toEqual([
      'Rozpływ mocy', 'Spadki napięć', 'Bilans mocy',
    ]);
    expect(zawartoscZPrzebiegow([{ analysis_type: 'SC_3F', status: 'DONE' }])).toEqual(['Zwarcia (IEC 60909)']);
    expect(zawartoscZPrzebiegow([{ analysis_type: 'LOAD_FLOW', status: 'RUNNING' }])).toEqual([]);
  });
});
