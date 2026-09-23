/*
 * Sekcja inspektora „Model dynamiczny" (karta AB-1a D3): dwie odznaki statusu modelu
 * — oś RÓWNAŃ i oś PARAMETRÓW — z backendu
 * (`GET …/generators/{ref}/status-modelu`, kształt przypięty w
 * `backend/tests/api/test_status_modelu_api.py`). Realna ścieżka: mount → fetch
 * końcówki z adresem z aktywnego projektu/przypadku → render. ZERO oceny w UI.
 *
 * ILOCZYN CECH: {status równań: niezwalidowane | zwalidowane | nieznany} ×
 * {status parametrów: nieznany | zmierzony} × {brak bloku dynamiki} × {błąd końcówki}
 * × {wpięcie w panel: generator ma sekcję | szyna nie ma}.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const appState: { activeProjectId: string | null; activeCaseId: string | null } = {
  activeProjectId: 'proj-1',
  activeCaseId: 'case-1',
};
vi.mock('../../../ui/app-state', () => ({
  useAppStateStore: (selector: (s: typeof appState) => unknown) => selector(appState),
}));

import { InspectorPanel } from '../InspectorPanel';
import { SekcjaModeluDynamicznego } from '../SekcjaModeluDynamicznego';
import { INSPECTOR_STRINGS } from '../strings';
import { resetPinStore, szyna } from './fixtures';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function odpowiedz(status_modelu: unknown, extra: Record<string, unknown> = {}) {
  return {
    generator_ref: 'gen/pv-1',
    rodzina: status_modelu === null ? null : 'przeksztaltnikowa_gfl',
    proweniencja:
      status_modelu === null
        ? null
        : { zrodlo: 'karta_producenta', odniesienie: 'DS-0001', data: '2026-01-01' },
    status_modelu,
    status_rownan_uzasadnienie_pl: status_modelu === null ? null : 'Brak niezależnej wyroczni rodziny.',
    status_rownan_audit_ref: status_modelu === null ? null : 'docs/audit/R10.md',
    ...extra,
  };
}

function mockFetch(dane: unknown, ok = true) {
  const mock = vi.fn(() =>
    Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve(dane) } as Response),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('SekcjaModeluDynamicznego', () => {
  it('przekształtnik bez statusu parametrów → dwie odznaki: równania niezwalidowane, parametry nieznane', async () => {
    const mock = mockFetch(
      odpowiedz({
        rownania: 'UNVALIDATED',
        rownania_pl: 'rownania_niezwalidowane',
        parametry: 'UNKNOWN',
        parametry_pl: 'nieznany',
      }),
    );
    render(<SekcjaModeluDynamicznego generatorRef="gen/pv-1" />);
    const rownania = await screen.findByTestId('mvd-insp-model-dynamiczny-status-rownania');
    expect(mock).toHaveBeenCalledWith(
      '/api/projects/proj-1/cases/case-1/generators/gen%2Fpv-1/status-modelu',
    );
    expect(rownania).toHaveTextContent('równania niezwalidowane');
    expect(screen.getByTestId('mvd-insp-model-dynamiczny-status-parametry')).toHaveTextContent(
      'status parametrów nieznany',
    );
    const sekcja = screen.getByTestId('mvd-insp-model-dynamiczny');
    expect(sekcja).toHaveTextContent('przekształtnik nadążny (GFL)');
    expect(sekcja).toHaveTextContent('karta producenta');
    expect(sekcja).toHaveTextContent('DS-0001');
  });

  it.each([
    ['VALIDATED', 'MODEL_ZWALIDOWANY_POMIAREM', 'równania zwalidowane', 'parametry zwalidowane pomiarem'],
    ['UNKNOWN', 'KARTA_KATALOGOWA', 'status równań nieznany', 'parametry z karty katalogowej'],
  ])('oś równań %s × oś parametrów %s → etykiety z backendu', async (rownania, parametry, etRownan, etParam) => {
    mockFetch(odpowiedz({ rownania, rownania_pl: '', parametry, parametry_pl: '' }));
    render(<SekcjaModeluDynamicznego generatorRef="gen/pv-1" />);
    expect(await screen.findByTestId('mvd-insp-model-dynamiczny-status-rownania')).toHaveTextContent(etRownan);
    expect(screen.getByTestId('mvd-insp-model-dynamiczny-status-parametry')).toHaveTextContent(etParam);
  });

  it('wytwórca bez parametrów dynamicznych → uczciwy stan „brak", bez odznak', async () => {
    mockFetch(odpowiedz(null));
    render(<SekcjaModeluDynamicznego generatorRef="gen/pv-1" />);
    expect(await screen.findByTestId('mvd-insp-model-dynamiczny-brak')).toHaveTextContent(
      INSPECTOR_STRINGS.modelDynBrak,
    );
    expect(screen.queryByTestId('mvd-insp-model-dynamiczny-status-rownania')).not.toBeInTheDocument();
  });

  it('błąd końcówki → komunikat błędu (role=alert), bez odznak', async () => {
    mockFetch({ detail: { code: 'generator.not_found' } }, false);
    render(<SekcjaModeluDynamicznego generatorRef="gen/brak" />);
    await waitFor(() => expect(screen.getByTestId('mvd-insp-model-dynamiczny-blad')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-insp-model-dynamiczny-status-rownania')).not.toBeInTheDocument();
  });
});

describe('InspectorPanel — wpięcie sekcji „Model dynamiczny"', () => {
  const props = {
    rewizjaModelu: 215,
    onOtworzDowod: vi.fn(),
    onNawiguj: vi.fn(),
    onPrzelicz: vi.fn(),
    trybZaawansowania: 'basic' as const,
  };

  it('generator → sekcja pobiera status po `ref_id` elementu', async () => {
    resetPinStore();
    const mock = mockFetch(
      odpowiedz({ rownania: 'UNVALIDATED', rownania_pl: '', parametry: 'UNKNOWN', parametry_pl: '' }),
    );
    render(
      <InspectorPanel
        {...props}
        obiekt={szyna({ id: 'uuid-gen-1', refId: 'gen/pv-1', typ: 'generator', typEtykieta: 'Generator', wyniki: [] })}
      />,
    );
    expect(await screen.findByTestId('mvd-insp-model-dynamiczny-status-rownania')).toBeVisible();
    expect(mock).toHaveBeenCalledWith(
      '/api/projects/proj-1/cases/case-1/generators/gen%2Fpv-1/status-modelu',
    );
  });

  it('szyna → brak sekcji i brak zapytania', () => {
    resetPinStore();
    const mock = mockFetch({});
    render(<InspectorPanel {...props} obiekt={szyna({ refId: 'bus/1' })} />);
    expect(screen.queryByTestId('mvd-insp-model-dynamiczny')).not.toBeInTheDocument();
    expect(mock).not.toHaveBeenCalledWith(expect.stringContaining('status-modelu'));
  });
});
