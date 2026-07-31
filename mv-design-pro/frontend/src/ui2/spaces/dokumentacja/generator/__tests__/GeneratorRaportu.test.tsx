/**
 * Testy generatora raportu w powłoce ui2 (karta KD-4, luka L-15).
 *
 * INTENCJA: każda kontrolka składu ma REALNIE trafiać do wywołania eksportu
 * (phantom rule). Testy sprawdzają URL żądania — czyli to, co backend
 * faktycznie dostaje — a nie napis na ekranie. Interakcje przez natywną
 * ścieżkę użytkownika (userEvent), Zero-Debt pkt 5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { useExecutionRunsStore } from '../../../../../ui/study-cases/runStore';
import { useShellStore } from '../../../../shell/useShellStore';
import { GeneratorRaportu } from '../GeneratorRaportu';
import {
  domyslnyPrzebieg,
  etykietaPrzebiegu,
  przebiegiDoRaportu,
} from '../model';

type Run = ReturnType<typeof useExecutionRunsStore.getState>['runs'][number];

function przebieg(id: string, analysisType: string, finishedAt: string, status = 'DONE'): Run {
  return {
    id,
    study_case_id: 'case-1',
    analysis_type: analysisType,
    solver_input_hash: 'h',
    status,
    started_at: finishedAt,
    finished_at: finishedAt,
    error_message: null,
  } as unknown as Run;
}

/** Zbiera URL-e żądań eksportu (fetch) — dowód, co backend dostaje. */
function przechwycFetch(): string[] {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('/results/index')) {
        return new Response(
          JSON.stringify({ tables: [{ table_id: 'short_circuit', label_pl: 'Zwarcia', row_count: 7 }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('x', { status: 200 });
    }),
  );
  return urls;
}

describe('GeneratorRaportu — okno składania raportu (ui2)', () => {
  beforeEach(() => {
    useAppStateStore.setState({ activeRunId: null });
    useExecutionRunsStore.setState({ runs: [] });
    useShellStore.setState({ activeSpace: 'dokumentacja' });
    // jsdom nie ma createObjectURL — pobranie pliku jest efektem ubocznym klienta.
    Object.defineProperty(window.URL, 'createObjectURL', { value: () => 'blob:x', writable: true });
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: () => undefined, writable: true });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('UCZCIWY STAN ZEROWY: brak zakończonego przebiegu → komunikat + akcja do obliczeń', async () => {
    const user = userEvent.setup();
    useExecutionRunsStore.setState({ runs: [przebieg('r1', 'SC_3F', '2026-07-30T10:00:00Z', 'RUNNING')] });

    render(<GeneratorRaportu />);
    expect(screen.getByTestId('mvd-generator-pusty')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Przejdź do obliczeń' }));
    expect(useShellStore.getState().activeSpace).toBe('obliczenia');
  });

  it('SKŁAD JEDZIE DO BACKENDU: profil, poziom, zakres, sekcje i tabela w URL eksportu', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetch();
    useExecutionRunsStore.setState({ runs: [przebieg('run-a', 'SC_3F', '2026-07-30T10:00:00Z')] });

    render(<GeneratorRaportu />);

    // Tabela wiodąca pochodzi z REALNEJ odpowiedzi backendu (results/index).
    await waitFor(() => expect(screen.getByRole('option', { name: 'Zwarcia (7)' })).toBeTruthy());

    await user.selectOptions(screen.getByTestId('mvd-generator-profil'), 'audytowy');
    await user.selectOptions(screen.getByTestId('mvd-generator-poziom'), 'pelny');
    await user.selectOptions(screen.getByTestId('mvd-generator-zakres'), 'active_table');
    await user.selectOptions(screen.getByTestId('mvd-generator-tabela'), 'short_circuit');
    await user.click(screen.getByTestId('mvd-generator-sekcja-summary'));
    await user.click(screen.getByTestId('mvd-generator-sekcja-trace'));

    await user.click(screen.getByTestId('mvd-generator-raport-pdf'));

    await waitFor(() => {
      const eksport = urls.find((u) => u.includes('/export/report/pdf'));
      expect(eksport).toBeTruthy();
      expect(eksport).toContain('profile=audytowy');
      expect(eksport).toContain('detail_level=pelny');
      expect(eksport).toContain('scope=active_table');
      expect(eksport).toContain('focus_table=short_circuit');
      expect(eksport).toContain('sections=summary');
      expect(eksport).toContain('sections=trace');
      // Zapis do magazynu jest domyślnie włączony (dokument trafia na listę).
      expect(eksport).toContain('zapisz_do_magazynu=true');
    });
  });

  it('PAKIET DOWODOWY nie dostaje kompozycji (backend jej dla niego nie przyjmuje)', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetch();
    useExecutionRunsStore.setState({ runs: [przebieg('run-b', 'LOAD_FLOW', '2026-07-30T11:00:00Z')] });

    render(<GeneratorRaportu />);
    await user.selectOptions(screen.getByTestId('mvd-generator-profil'), 'wykonawczy');
    await user.click(screen.getByTestId('mvd-generator-dowod-latex'));

    await waitFor(() => {
      const eksport = urls.find((u) => u.includes('/export/proof/latex'));
      expect(eksport).toBeTruthy();
      expect(eksport).not.toContain('profile=');
      expect(eksport).toContain('zapisz_do_magazynu=true');
    });
  });

  it('WYŁĄCZONY zapis do magazynu → brak parametru (nic nie ląduje na liście)', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetch();
    useExecutionRunsStore.setState({ runs: [przebieg('run-c', 'SC_3F', '2026-07-30T12:00:00Z')] });

    render(<GeneratorRaportu />);
    await user.click(screen.getByTestId('mvd-generator-magazyn'));
    await user.click(screen.getByTestId('mvd-generator-raport-json'));

    await waitFor(() => {
      const eksport = urls.find((u) => u.includes('/export/report/json'));
      expect(eksport).toBeTruthy();
      expect(eksport).not.toContain('zapisz_do_magazynu');
    });
  });

  it('WYBÓR PRZEBIEGU: eksport idzie do wskazanego biegu, nie do aktywnego', async () => {
    const user = userEvent.setup();
    const urls = przechwycFetch();
    useAppStateStore.setState({ activeRunId: 'run-nowszy' });
    useExecutionRunsStore.setState({
      runs: [
        przebieg('run-nowszy', 'SC_3F', '2026-07-30T12:00:00Z'),
        przebieg('run-starszy', 'LOAD_FLOW', '2026-07-29T09:00:00Z'),
      ],
    });

    render(<GeneratorRaportu />);
    await user.selectOptions(screen.getByTestId('mvd-generator-przebieg'), 'run-starszy');
    await user.click(screen.getByTestId('mvd-generator-raport-docx'));

    await waitFor(() => {
      expect(urls.some((u) => u.includes('/analysis-runs/run-starszy/export/report/docx'))).toBe(true);
    });
  });
});

describe('model generatora — czyste selektory', () => {
  it('bierze wyłącznie zakończone przebiegi, najnowszy pierwszy', () => {
    const runs = [
      przebieg('a', 'SC_3F', '2026-07-28T10:00:00Z'),
      przebieg('b', 'LOAD_FLOW', '2026-07-30T10:00:00Z'),
      przebieg('c', 'SC_3F', '2026-07-31T10:00:00Z', 'FAILED'),
    ];
    expect(przebiegiDoRaportu(runs).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('domyślnie wskazuje aktywny przebieg, gdy jest zakończony', () => {
    const runs = przebiegiDoRaportu([
      przebieg('a', 'SC_3F', '2026-07-28T10:00:00Z'),
      przebieg('b', 'LOAD_FLOW', '2026-07-30T10:00:00Z'),
    ]);
    expect(domyslnyPrzebieg(runs, 'a')).toBe('a');
    // Aktywny bieg spoza listy (np. nieukończony) nie może wygrać.
    expect(domyslnyPrzebieg(runs, 'nieistniejacy')).toBe('b');
    expect(domyslnyPrzebieg([], 'a')).toBeNull();
  });

  it('etykieta przebiegu podaje rodzaj analizy po polsku i datę', () => {
    expect(etykietaPrzebiegu(przebieg('a', 'SC_3F', '2026-07-28T10:00:00Z'))).toBe(
      'Zwarcie trójfazowe (3F) · 2026-07-28 10:00',
    );
  });
});
