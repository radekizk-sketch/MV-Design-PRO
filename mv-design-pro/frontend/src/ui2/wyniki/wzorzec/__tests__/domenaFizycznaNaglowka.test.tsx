/**
 * Domena fizyczna biegu w JEDYNYM wspólnym nagłówku ekranu analizy (karta AB-1a D1).
 *
 * Łańcuch sprawdzany natywną drogą, bez wymuszania stanu store'ów: odpowiedź HTTP
 * `GET /api/analysis-runs/{id}` (pole `physics_domain` + `physics_domain_pl`, backend
 * `api/canonical_run_views.py`) → normalizator kontraktu przebiegu
 * (`useAnalysisRunContract`) → `useSwiezoscNaglowka` (ta sama derywacja, z której
 * kilkanaście ekranów bierze nagłówek) → `EkranAnalizy` (nagłówek `mvd-wyn-naglowek`).
 * Brak domeny albo wartość spoza kontraktu = brak znacznika (front nie zgaduje domeny
 * z rodzaju analizy).
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EkranAnalizy } from '../EkranAnalizy';
import { WZORZEC_STRINGS } from '../strings';
import { useSwiezoscNaglowka } from '../../../freshness';
import { useAppStateStore } from '../../../../ui/app-state/store';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { propsFixture } from './fixtures';

function EkranZKontraktem({ runId }: { runId: string }) {
  const swiezosc = useSwiezoscNaglowka(runId);
  return (
    <EkranAnalizy
      {...propsFixture({ naglowek: { analizaPL: 'Analiza testowa', runId, ...swiezosc } })}
    />
  );
}

function zamontujFetch(body: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => body })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStateStore.setState({ activeCaseId: 'case-1' } as never);
  useSnapshotStore.setState({ snapshot: null, rewizjaBiezacegoModelu: null } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nagłówek ekranu analizy — domena fizyczna z kontraktu przebiegu', () => {
  it('pokazuje etykietę PL domeny z backendu w każdym trybie', async () => {
    zamontujFetch({
      id: 'run-domena-1',
      analysis_type: 'dynamika_rms',
      physics_domain: 'RMS_DYNAMICS',
      physics_domain_pl: 'dynamika RMS (przebiegi czasowe)',
    });
    render(<EkranZKontraktem runId="run-domena-1" />);

    const znacznik = await screen.findByTestId('mvd-wyn-domena');
    const naglowek = screen.getByTestId('mvd-wyn-naglowek');
    expect(within(naglowek).getByTestId('mvd-wyn-domena')).toBe(znacznik);
    expect(znacznik).toHaveTextContent(
      `${WZORZEC_STRINGS.domenaFizyczna}: dynamika RMS (przebiegi czasowe)`,
    );
    expect(znacznik).toHaveAttribute('data-domena', 'RMS_DYNAMICS');
    expect(znacznik).toHaveAttribute('title', WZORZEC_STRINGS.domenaFizycznaOpis);
  });

  it('kontrakt bez domeny → brak znacznika (bez zgadywania z rodzaju analizy)', async () => {
    zamontujFetch({ id: 'run-domena-2', analysis_type: 'PF' });
    render(<EkranZKontraktem runId="run-domena-2" />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('mvd-wyn-domena')).not.toBeInTheDocument();
  });

  it('domena spoza kontraktu OpenAPI → brak znacznika', async () => {
    zamontujFetch({
      id: 'run-domena-3',
      analysis_type: 'PF',
      physics_domain: 'NIEZNANA_DOMENA',
      physics_domain_pl: 'cokolwiek',
    });
    render(<EkranZKontraktem runId="run-domena-3" />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('mvd-wyn-domena')).not.toBeInTheDocument();
  });

  it('domena bez etykiety PL → brak znacznika (front nie ma własnej mapy nazw)', async () => {
    zamontujFetch({ id: 'run-domena-4', analysis_type: 'PF', physics_domain: 'POWER_FLOW' });
    render(<EkranZKontraktem runId="run-domena-4" />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByTestId('mvd-wyn-domena')).not.toBeInTheDocument();
  });
});
