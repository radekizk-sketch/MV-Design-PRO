/**
 * Testy zamknięcia luk L-11 (wywód zawężony do WSKAZANEGO elementu) i L-10
 * (źródło LaTeX wywodu) w zakładce „Dowód obliczeń" — karta KD-4.
 *
 * INTENCJA L-11: wskazanie elementu (2× klik na wartości z dowodem albo
 * selekcja na schemacie) ma realnie zawęzić wywód do kroków TEGO elementu, z
 * jawnym powrotem na cały przebieg. Brak kroków elementu = uczciwy komunikat,
 * a nie puste okno.
 * INTENCJA L-10: źródło `.tex` pobiera TEN SAM dostawca co most
 * (`/export/proof/latex`) — prezentacja niczego nie skleja.
 * Kliki natywne (userEvent), Zero-Debt pkt 5.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../ui/app-state';
import { useResultsInspectorStore } from '../../../../ui/results-inspector/store';
import { useSelectionStore } from '../../../../ui/selection';
import { useExecutionRunsStore } from '../../../../ui/study-cases/runStore';
import type { ExtendedTrace } from '../../../../ui/results-inspector/types';
import { DowodPrzebiegu } from '../DowodPrzebiegu';
import { przebiegFixture } from './fixtures';

const RUN_ID = 'run-sc-1';

/** Ślad z krokami DWÓCH elementów + `selection_index` (kontrakt ExtendedTrace). */
function sladDwochElementow(): ExtendedTrace {
  return {
    run_id: RUN_ID,
    snapshot_id: null,
    input_hash: 'abc123',
    white_box_trace: [
      {
        step: 1,
        title: 'Impedancja zastępcza szyny GPZ',
        element_id: 'EL-GPZ',
        result: { z_ohm: { value: 0.49, unit: 'Ω' } },
      },
      {
        step: 2,
        title: 'Impedancja odcinka kablowego',
        element_id: 'EL-KABEL',
        result: { z_ohm: { value: 0.12, unit: 'Ω' } },
      },
      {
        step: 3,
        title: 'Prąd początkowy zwarciowy szyny GPZ',
        element_id: 'EL-GPZ',
        result: { ikss_ka: { value: 12.3, unit: 'kA' } },
      },
    ],
    selection_index: { 'EL-GPZ': 0 },
    catalog_context: [],
  } as unknown as ExtendedTrace;
}

function zamontujSlad(): void {
  useResultsInspectorStore.setState({
    selectedRunId: RUN_ID,
    extendedTrace: sladDwochElementow(),
    isLoadingTrace: false,
    isLoadingIndex: false,
    selectRun: (async () => {}) as never,
    loadExtendedTrace: (async () => {}) as never,
  });
}

beforeEach(() => {
  useAppStateStore.setState({ activeRunId: RUN_ID });
  useExecutionRunsStore.setState({ runs: [przebiegFixture({ id: RUN_ID })], activeRunId: RUN_ID });
  useSelectionStore.setState({ selectedElement: null });
  zamontujSlad();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('L-11 — wywód zawężony do wskazanego elementu', () => {
  it('wskazanie elementu otwiera wywód TEGO elementu i pozwala wrócić na cały przebieg', async () => {
    const user = userEvent.setup();
    render(<DowodPrzebiegu trybZaawansowania="basic" wskazanyElementRef="EL-GPZ" />);

    // Startujemy zawężeni: dwa kroki szyny GPZ z trzech w śladzie.
    const przelacznik = await screen.findByTestId('mvd-dowod-zakres-element');
    expect(przelacznik.textContent).toContain('(2)');
    expect(przelacznik.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('mvd-dowod-zakres-caly').textContent).toContain('(3)');
    expect(screen.queryByText('Impedancja odcinka kablowego')).toBeNull();

    await user.click(screen.getByTestId('mvd-dowod-zakres-caly'));
    expect(screen.getByText('Impedancja odcinka kablowego')).toBeTruthy();
    expect(screen.getByTestId('mvd-dowod-zakres-caly').getAttribute('aria-pressed')).toBe('true');
  });

  it('SELEKCJA na schemacie działa jak wskazanie (przejście z selekcji)', async () => {
    useSelectionStore.setState({
      selectedElement: { id: 'EL-KABEL', type: 'Branch', name: 'Odcinek 1' },
    });
    render(<DowodPrzebiegu trybZaawansowania="basic" />);

    const przelacznik = await screen.findByTestId('mvd-dowod-zakres-element');
    expect(przelacznik.textContent).toContain('Odcinek 1');
    expect(przelacznik.textContent).toContain('(1)');
    // Tytuł kroku pojawia się i w spisie, i w widoku kroku — stąd getAllByText.
    expect(screen.getAllByText('Impedancja odcinka kablowego').length).toBeGreaterThan(0);
    expect(screen.queryByText('Impedancja zastępcza szyny GPZ')).toBeNull();
  });

  it('ELEMENT BEZ KROKÓW: uczciwy komunikat, wywód całego przebiegu zostaje', async () => {
    render(<DowodPrzebiegu trybZaawansowania="basic" wskazanyElementRef="EL-NIEZNANY" />);

    expect(await screen.findByTestId('mvd-dowod-zakres-brak')).toBeTruthy();
    expect(screen.getByTestId('mvd-dowod-zakres-element')).toBeDisabled();
    // Cały ślad nadal dostępny (3 kroki) — nic nie zniknęło.
    expect(screen.getByTestId('mvd-dowod-zakres-caly').textContent).toContain('(3)');
    expect(screen.getByText('Impedancja odcinka kablowego')).toBeTruthy();
  });

  it('BEZ WSKAZANIA I BEZ SELEKCJI: okno zachowuje się 1:1 jak dotąd', () => {
    render(<DowodPrzebiegu trybZaawansowania="basic" />);
    expect(screen.queryByTestId('mvd-dowod-zakres')).toBeNull();
    expect(screen.getByText('Impedancja odcinka kablowego')).toBeTruthy();
  });
});

describe('L-10 — źródło LaTeX wywodu', () => {
  it('pobiera źródło z końcówki eksportu wywodu i pokazuje bajty backendu', async () => {
    const user = userEvent.setup();
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response('\\documentclass{article} % wywod z backendu', { status: 200 });
      }),
    );

    render(<DowodPrzebiegu trybZaawansowania="basic" />);
    await user.click(screen.getByTestId('mvd-dowod-latex-pokaz'));

    await waitFor(() => {
      expect(urls.some((u) => u.includes(`/api/analysis-runs/${RUN_ID}/export/proof/latex`))).toBe(
        true,
      );
    });
    const zrodlo = await screen.findByTestId('mvd-dowod-latex-zrodlo');
    expect(zrodlo.textContent).toContain('% wywod z backendu');
  });

  it('kopiowanie i pobranie są zablokowane, dopóki źródła nie ma (zero pustych plików)', () => {
    render(<DowodPrzebiegu trybZaawansowania="basic" />);
    expect(screen.getByTestId('mvd-dowod-latex-kopiuj')).toBeDisabled();
    expect(screen.getByTestId('mvd-dowod-latex-pobierz')).toBeDisabled();
  });

  it('BŁĄD POBRANIA jest nazwany, a nie zamiatany', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nie ma', { status: 404 })));

    render(<DowodPrzebiegu trybZaawansowania="basic" />);
    await user.click(screen.getByTestId('mvd-dowod-latex-pokaz'));

    expect(await screen.findByTestId('mvd-dowod-latex-blad')).toBeTruthy();
  });

  it('BEZ ŚLADU nie ma sekcji źródła (nie ma czego pobierać)', () => {
    useResultsInspectorStore.setState({ extendedTrace: null });
    render(<DowodPrzebiegu trybZaawansowania="basic" />);
    expect(screen.queryByTestId('mvd-dowod-latex')).toBeNull();
  });
});
