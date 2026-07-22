/**
 * Testy ekranu „Kontrakt analizy" (dostawca E-29…E-32, karta F-E5a; E-33/E-34
 * mają od karty P-1 realnego dostawcę — zakładkę zwarć warsztatu Wyników —
 * i nie są już routowane do kontraktu).
 * Interakcje przez natywną ścieżkę użytkownika (userEvent.click) — dyrektywa
 * Zero-Debt pkt 5 (żadnych syntetycznych dispatchEvent).
 *
 * Hook kontraktu reużyty BEZ ZMIAN — w teście podmieniamy wyłącznie jego wynik
 * (read-only), formatery kontraktu (`formatContractValue`) pozostają rzeczywiste
 * (parytet 1:1 z dawnym `ThinContractSurface`), jak w falach W1–W3.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import type { WorkspaceSurfaceDescriptor } from '../../../../ui/workspace/types';
import { useShellStore } from '../../../shell/useShellStore';
import { EkranKontraktuAnalizy } from '../EkranKontraktuAnalizy';
import { KONTRAKTY_EKRANOW, type KodEkranuKontraktu } from '../model';

// Reużycie hooka kontraktu BEZ ZMIAN: nadpisujemy tylko jego wynik.
vi.mock('../../../../ui/workspace/analysisRunContract', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../ui/workspace/analysisRunContract')>();
  return { ...actual, useAnalysisRunContract: vi.fn() };
});

import {
  formatContractValue,
  useAnalysisRunContract,
  type AnalysisRunContract,
} from '../../../../ui/workspace/analysisRunContract';

const mockKontrakt = vi.mocked(useAnalysisRunContract);

const KODY: readonly KodEkranuKontraktu[] = ['E-29', 'E-30', 'E-31', 'E-32'];

function kontraktFixture(over: Partial<AnalysisRunContract> = {}): AnalysisRunContract {
  return {
    id: 'run-1',
    analysisType: 'load_flow',
    status: 'finished',
    resultStatus: 'valid',
    resultsValid: true,
    createdAt: '2026-07-15T14:32:00Z',
    finishedAt: '2026-07-15T14:32:45Z',
    inputHash: 'a1b2c3',
    proofPackRef: null,
    exportArtifact: null,
    exportPolicy: null,
    summaryJson: {},
    traceSummary: null,
    analysisCaseContext: {
      caseRef: 'case-1',
      caseKind: 'auto',
      snapshotRef: 'v12',
      variantRef: null,
      runRef: null,
      proofPackRef: null,
      qualityGate: 'passed',
      applicabilityScope: ['cała sieć'],
      completeness: 'complete',
      completenessLegacy: 'ok',
      missingPrerequisites: [],
      assumptions: {
        transformer_tap_assumptions_ref: 'tap_frozen',
        grounding_assumptions_ref: 'grounded',
        switching_state_ref: 'normal',
        temperature_assumptions_ref: 'temperature_short_circuit',
        load_assumptions_ref: 'nominal',
        source_assumptions_ref: 'sc_source_max',
        fault_scenario_ref: 'sc_3f',
      },
      lineage: { project_ref: 'projekt-1' },
      reproducibility: {
        solverFamily: 'NR',
        solverVersion: '1.0.0',
        methodVersion: '2026.04',
        formulaSetVersion: '2026.04',
        standardBasisRef: ['IEC-60909'],
        inputHash: 'a1b2c3',
        resultHash: null,
        domainModelVersion: 'dm-1',
        bayContractVersion: 'bay-1',
        resultsContractVersion: 'results-1',
        proofRendererVersion: 'proof-1',
        catalogSnapshotRef: 'catalog-1',
        catalogSchemaVersion: 'schema-1',
        tolerancePolicyRef: 'tol-1',
        roundingPolicyRef: 'round-1',
        qualityGatePolicyVersion: 'gate-1',
      },
    },
    ...over,
  };
}

/** Zbuduj realny deskryptor powierzchni przez store trasowania. */
function otworzPowierzchnie(kod: KodEkranuKontraktu): WorkspaceSurfaceDescriptor {
  useNetworkBuildStore.getState().openRouteSurface(kod, { openMode: 'expand_workspace' });
  const surface = useNetworkBuildStore.getState().activeSurface;
  if (!surface) {
    throw new Error(`Nie udało się otworzyć powierzchni ${kod}`);
  }
  return surface;
}

beforeEach(() => {
  mockKontrakt.mockReturnValue({ data: kontraktFixture(), isLoading: false, error: null });
  useNetworkBuildStore.getState().reset();
  useAppStateStore.getState().reset();
  useShellStore.setState({ activeSpace: 'wyniki' });
});

afterEach(() => {
  cleanup();
  useNetworkBuildStore.getState().reset();
});

describe('EkranKontraktuAnalizy — nagłówek per kod ekranu (FLOW §0.3)', () => {
  it.each(KODY)('%s: tytuł obszaru i zdanie celu inżynierskiego', (kod) => {
    useAppStateStore.getState().setActiveRun('run-1');
    const surface = otworzPowierzchnie(kod);
    render(<EkranKontraktuAnalizy surface={surface} />);

    const config = KONTRAKTY_EKRANOW[kod];
    expect(screen.getByRole('heading', { level: 3, name: config.tytul })).toBeInTheDocument();
    // Zdanie celu inżynierskiego (unikatowe per obszar) jest widoczne w nagłówku.
    expect(screen.getByText(config.cel)).toBeInTheDocument();
  });
});

describe('EkranKontraktuAnalizy — uczciwy stan zerowy bez przebiegu', () => {
  it('brak aktywnego przebiegu → stan zerowy z akcją, bez tabeli wierszy', () => {
    // activeRunId=null (po reset) + brak subjectRef → resolveSurfaceRunId zwraca null.
    const surface = otworzPowierzchnie('E-30');
    render(<EkranKontraktuAnalizy surface={surface} />);

    expect(screen.getByTestId('mvd-kontrakt-zero')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kontrakt-wiersze')).not.toBeInTheDocument();
  });

  it('akcja „Przejdź do obliczeń" (natywny klik) przełącza przestrzeń na obliczenia', async () => {
    const user = userEvent.setup();
    const surface = otworzPowierzchnie('E-30');
    render(<EkranKontraktuAnalizy surface={surface} />);

    expect(useShellStore.getState().activeSpace).toBe('wyniki');
    await user.click(screen.getByTestId('mvd-kontrakt-zero-akcja'));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });
});

describe('EkranKontraktuAnalizy — wiersze fokusowe 1:1 z konfiguracją (parytet W5b-4)', () => {
  it('E-30: wiersze solvera odpowiadają buildWiersze (formatery rzeczywiste)', () => {
    useAppStateStore.getState().setActiveRun('run-1');
    const surface = otworzPowierzchnie('E-30');
    const contract = kontraktFixture();
    render(<EkranKontraktuAnalizy surface={surface} />);

    const siatka = screen.getByTestId('mvd-kontrakt-wiersze');
    const oczekiwane = KONTRAKTY_EKRANOW['E-30'].buildWiersze(contract, {
      surface,
      selectedElement: null,
      snapshot: null,
    });
    for (const wiersz of oczekiwane) {
      expect(within(siatka).getByText(wiersz.label)).toBeInTheDocument();
    }
    // Typ analizy „rozpływ mocy" (formatContractValue z load_flow) jest widoczny.
    expect(within(siatka).getByText(formatContractValue('load_flow'))).toBeInTheDocument();
  });

  // Intencja dawnego testu E-34 (wiersze toru: temperatura, kompletność)
  // przeniesiona wraz ze zdolnością: E-34 prowadzi od karty P-1 do realnego
  // dostawcy (panel „Bilans IEC 60909" zakładki zwarć) — pokrycie w testach
  // `ui2/wyniki/zwarcia` i deep-linku huba (`EkranAnalizTechnicznych.test`).
  it('E-29: wiersze kontekstu Z0 odpowiadają buildWiersze (uziemienie, stan łączników)', () => {
    useAppStateStore.getState().setActiveRun('run-1');
    const surface = otworzPowierzchnie('E-29');
    const contract = kontraktFixture();
    render(<EkranKontraktuAnalizy surface={surface} />);

    const siatka = screen.getByTestId('mvd-kontrakt-wiersze');
    const oczekiwane = KONTRAKTY_EKRANOW['E-29'].buildWiersze(contract, {
      surface,
      selectedElement: null,
      snapshot: null,
    });
    for (const wiersz of oczekiwane) {
      expect(within(siatka).getByText(wiersz.label)).toBeInTheDocument();
    }
    expect(within(siatka).getByText('Uziemienie')).toBeInTheDocument();
  });

  it('wartość brakująca renderuje chip „Do konfiguracji", bez udawania danych', () => {
    useAppStateStore.getState().setActiveRun('run-1');
    mockKontrakt.mockReturnValue({
      data: kontraktFixture({
        analysisCaseContext: {
          ...kontraktFixture().analysisCaseContext!,
          snapshotRef: null,
        },
      }),
      isLoading: false,
      error: null,
    });
    const surface = otworzPowierzchnie('E-30');
    render(<EkranKontraktuAnalizy surface={surface} />);

    const siatka = screen.getByTestId('mvd-kontrakt-wiersze');
    expect(within(siatka).getAllByText('Do konfiguracji').length).toBeGreaterThan(0);
  });
});

describe('EkranKontraktuAnalizy — sekcje warunkowe per flagi ekranu', () => {
  it('E-31: pokazuje założenia, pochodzenie i reprodukowalność (flagi true)', () => {
    useAppStateStore.getState().setActiveRun('run-1');
    const surface = otworzPowierzchnie('E-31');
    render(<EkranKontraktuAnalizy surface={surface} />);

    expect(screen.getByTestId('mvd-kontrakt-zalozenia')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kontrakt-pochodzenie')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-kontrakt-reprodukowalnosc')).toBeInTheDocument();
    // Założenie źródeł z kontraktu (formatContractValue) jest widoczne.
    expect(screen.getAllByText(formatContractValue('sc_source_max')).length).toBeGreaterThan(0);
  });

  it('E-30: NIE pokazuje sekcji warunkowych (flagi false)', () => {
    useAppStateStore.getState().setActiveRun('run-1');
    const surface = otworzPowierzchnie('E-30');
    render(<EkranKontraktuAnalizy surface={surface} />);

    expect(screen.queryByTestId('mvd-kontrakt-zalozenia')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kontrakt-pochodzenie')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kontrakt-reprodukowalnosc')).not.toBeInTheDocument();
  });
});

describe('EkranKontraktuAnalizy — powrót do huba (wzorzec MostAnalizTechnicznych)', () => {
  it('natywny klik „Wróć do analiz" czyści powierzchnię trasową', async () => {
    const user = userEvent.setup();
    useAppStateStore.getState().setActiveRun('run-1');
    const surface = otworzPowierzchnie('E-30');
    expect(useNetworkBuildStore.getState().activeSurface).not.toBeNull();
    render(<EkranKontraktuAnalizy surface={surface} />);

    await user.click(screen.getByTestId('mvd-kontrakt-powrot'));
    // clearRouteManagedSurface usuwa powierzchnię trasową → powrót do huba.
    expect(useNetworkBuildStore.getState().activeSurface).toBeNull();
  });
});

describe('EkranKontraktuAnalizy — brak kontekstu obliczeniowego', () => {
  it('przebieg bez analysisCaseContext → stan „brak kontekstu", bez wierszy', () => {
    useAppStateStore.getState().setActiveRun('run-1');
    mockKontrakt.mockReturnValue({
      data: kontraktFixture({ analysisCaseContext: null }),
      isLoading: false,
      error: null,
    });
    const surface = otworzPowierzchnie('E-30');
    render(<EkranKontraktuAnalizy surface={surface} />);

    expect(screen.getByTestId('mvd-kontrakt-brak-kontekstu')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-kontrakt-wiersze')).not.toBeInTheDocument();
  });
});
