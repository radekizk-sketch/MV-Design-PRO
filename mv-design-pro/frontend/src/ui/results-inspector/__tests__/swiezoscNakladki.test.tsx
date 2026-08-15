/**
 * Swiezosc nakladki SLD — status POCHODZI Z SERWERA, nie z palca (K-S).
 *
 * DEFEKT ZAMKNIETY. `fetchSldOverlay` dopisywalo `result_status: 'VALID'` do
 * kazdej odpowiedzi w ksztalcie `bus_overlays`/`branch_overlays`, bo koncowka
 * `/api/analysis-runs/{id}/overlay` statusu nie oddawala (budowala go i
 * wyrzucala). Efekt: `SldOverlay` porownuje status z `'OUTDATED'`, wiec baner
 * „Wyniki nieaktualne" nie mogl zapalic sie NIGDY — wynik policzony na modelu
 * sprzed edycji wygladal na aktualny.
 *
 * Test jest ILOCZYNEM CECH: {ksztalt plaski nodes/branches, ksztalt
 * bus_overlays/branch_overlays} x {FRESH, OUTDATED, brak pola} — czyli kazda
 * droga, ktora payload moze wejsc do sklepu, i kazdy stan swiezosci. Dodatkowo
 * pin prezentacji: baner pokazuje PRZYCZYNE z backendu, a przy statusie innym
 * niz OUTDATED nie ma go wcale.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchSldOverlay } from '../api';
import { SldOverlay } from '../SldOverlay';
import { useResultsInspectorStore } from '../store';

function odpowiedz(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchSldOverlay — status swiezosci z serwera', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(['FRESH', 'OUTDATED', 'NONE'])(
    'przepisuje status %s z ksztaltu bus_overlays bez wlasnych domyslow',
    async (status) => {
      vi.mocked(global.fetch).mockResolvedValueOnce(
        odpowiedz({
          bus_overlays: [],
          branch_overlays: [],
          result_status: status,
          result_status_reason: 'model-zmieniony',
          result_status_reason_pl: 'Model zmienił się po obliczeniu.',
        }),
      );

      const overlay = await fetchSldOverlay('proj-1', 'diagram-1', 'run-1');

      expect(overlay.result_status).toBe(status);
      expect(overlay.result_status_reason).toBe('model-zmieniony');
      expect(overlay.result_status_reason_pl).toBe('Model zmienił się po obliczeniu.');
    },
  );

  it('brak statusu w odpowiedzi daje NONE, nigdy domniemanej waznosci', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      odpowiedz({ bus_overlays: [], branch_overlays: [] }),
    );

    const overlay = await fetchSldOverlay('proj-1', 'diagram-1', 'run-1');

    expect(overlay.result_status).toBe('NONE');
    expect(overlay.result_status_reason).toBeUndefined();
  });

  it('ksztalt plaski nodes/branches przechodzi ze statusem serwera', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      odpowiedz({
        diagram_id: 'diagram-1',
        run_id: 'run-1',
        result_status: 'OUTDATED',
        result_status_reason: 'brak-odcisku-modelu-w-biegu',
        result_status_reason_pl: 'Przebieg zapisano bez odcisku modelu.',
        nodes: [],
        branches: [],
      }),
    );

    const overlay = await fetchSldOverlay('proj-1', 'diagram-1', 'run-1');

    expect(overlay.result_status).toBe('OUTDATED');
    expect(overlay.result_status_reason_pl).toBe('Przebieg zapisano bez odcisku modelu.');
  });
});

describe('SldOverlay — uczciwa prezentacja nieaktualnosci', () => {
  const pozycje = new Map([['bus-1', { x: 10, y: 20 }]]);

  /**
   * SCIEZKA NATYWNA: odpowiedz serwera -> `loadSldOverlay` (ta sama akcja, ktora
   * wola ekran) -> baner. Wymuszenie `sldOverlay` w sklepie sprawdzaloby tylko
   * render i przepuscilo regresje w kliencie API albo w akcji sklepu — czyli
   * dokladnie w miejscu, gdzie siedzial defekt (status dopisywany z palca).
   */
  async function zaladujNakladke(payload: Record<string, unknown>): Promise<void> {
    vi.mocked(global.fetch).mockResolvedValueOnce(odpowiedz(payload));
    useResultsInspectorStore.setState({ selectedRunId: 'run-1', overlayVisible: true });
    await act(async () => {
      await useResultsInspectorStore.getState().loadSldOverlay('proj-1', 'diagram-1');
    });
  }

  function odpowiedzNakladki(status: string, reasonPl?: string): Record<string, unknown> {
    return {
      bus_overlays: [{ symbol_id: 'bus-1', bus_id: 'bus-1', node_id: 'bus-1', u_kv: 15.1 }],
      branch_overlays: [],
      result_status: status,
      ...(reasonPl ? { result_status_reason_pl: reasonPl } : {}),
    };
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    cleanup();
    useResultsInspectorStore.setState({ sldOverlay: null, selectedRunId: null });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('pokazuje baner z PRZYCZYNA, gdy wynik jest nieaktualny', async () => {
    await zaladujNakladke(odpowiedzNakladki('OUTDATED', 'Model zmienił się po obliczeniu.'));

    render(<SldOverlay nodePositions={pozycje} branchPositions={new Map()} />);

    expect(screen.getByTestId('sld-overlay-outdated')).toHaveTextContent(
      'Wyniki nieaktualne — Model zmienił się po obliczeniu.',
    );
  });

  it('bez przyczyny z serwera pokazuje sam komunikat, bez zmyslania powodu', async () => {
    await zaladujNakladke(odpowiedzNakladki('OUTDATED'));

    render(<SldOverlay nodePositions={pozycje} branchPositions={new Map()} />);

    expect(screen.getByTestId('sld-overlay-outdated')).toHaveTextContent(
      'Wyniki nieaktualne',
    );
  });

  it.each(['FRESH', 'NONE'])('przy statusie %s nie ma banera nieaktualnosci', async (status) => {
    await zaladujNakladke(
      odpowiedzNakladki(status, 'Model nie zmienił się od chwili obliczenia.'),
    );

    render(<SldOverlay nodePositions={pozycje} branchPositions={new Map()} />);

    expect(screen.queryByTestId('sld-overlay-outdated')).toBeNull();
  });
});
