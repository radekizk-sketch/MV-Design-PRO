/**
 * Testy okna „Scenariusze zwarciowe" w powłoce ui2 (karta KD-4, luka L-7).
 *
 * INTENCJA: trzy zdolności, które miała wyłącznie martwa trasa mostu — LISTA,
 * DODANIE i URUCHOMIENIE — działają w przestrzeni „Obliczenia" na REALNYCH
 * wywołaniach `/api/execution/...`. Asercje idą przeciwko treści żądania
 * (co backend dostaje), nie przeciwko napisowi na ekranie.
 * Kliki natywne (userEvent), Zero-Debt pkt 5.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { useFaultScenariosStore } from '../../../../../ui/fault-scenarios/store';
import { PanelScenariuszy } from '../PanelScenariuszy';

const CASE_ID = 'case-scen-1';

interface Zadanie {
  readonly url: string;
  readonly metoda: string;
  readonly body: unknown;
}

function scenariusz(
  id: string,
  nazwa: string,
  config: Record<string, unknown> = {
    scenariusz: 'MAX',
    nadpisanie_c: null,
    thermal_time_seconds: 1,
    include_branch_contributions: true,
  },
) {
  return {
    scenario_id: id,
    study_case_id: CASE_ID,
    name: nazwa,
    analysis_type: 'SHORT_CIRCUIT',
    fault_type: 'SC_3F',
    location: { element_ref: 'bus-1', location_type: 'BUS', position: null },
    config,
    fault_impedance_type: 'METALLIC',
    fault_mode: 'METALLIC',
    fault_impedance: null,
    arc_params: null,
    z0_bus_data: null,
    created_at: '2026-07-31T10:00:00Z',
    updated_at: '2026-07-31T10:00:00Z',
    content_hash: 'h',
  };
}

/**
 * Atrapa backendu wierna kontraktowi `ShortCircuitConfigRequest` (extra=forbid):
 * klucz `c_factor` albo brak `scenariusz` → 422 (lista błędów schematu), nadpisanie
 * bez uzasadnienia → 422 z kodem domeny (`OdmowaDanychError`: „<kod>: <komunikat>").
 * `odmowaDomeny` wymusza odmowę domeny niezależnie od treści (ścieżka błędu backendu).
 */
function zamontujBackend(
  lista: ReturnType<typeof scenariusz>[],
  odmowaDomeny: string | null = null,
): Zadanie[] {
  const zadania: Zadanie[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const metoda = init?.method ?? 'GET';
      zadania.push({ url, metoda, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.includes('/fault-scenarios') && metoda === 'GET' && url.includes('/study-cases/')) {
        return new Response(JSON.stringify({ scenarios: lista, count: lista.length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (metoda === 'POST' && url.endsWith('/runs')) {
        return new Response(JSON.stringify({ id: 'run-z-scenariusza' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (metoda === 'POST') {
        const body = (init?.body ? JSON.parse(String(init.body)) : {}) as {
          config?: Record<string, unknown>;
        };
        const config = body.config ?? {};
        if ('c_factor' in config || !('scenariusz' in config)) {
          return new Response(
            JSON.stringify({
              detail: [{ loc: ['body', 'config', 'scenariusz'], msg: 'Field required', type: 'missing' }],
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const nadpisanie = config.nadpisanie_c as { uzasadnienie?: string } | null | undefined;
        if (odmowaDomeny || (nadpisanie && !nadpisanie.uzasadnienie?.trim())) {
          return new Response(
            JSON.stringify({
              detail:
                odmowaDomeny ??
                'fault.c_nadpisanie_bez_uzasadnienia: Nadpisanie współczynnika napięciowego c wymaga uzasadnienia',
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify(scenariusz('scen-nowy', 'Zwarcie na szynie 2')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (metoda === 'DELETE') return new Response(null, { status: 204 });
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return zadania;
}

beforeEach(() => {
  useFaultScenariosStore.getState().reset();
  useAppStateStore.setState({ activeCaseId: CASE_ID });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PanelScenariuszy — scenariusze zwarciowe w powłoce', () => {
  it('LISTA: scenariusze aktywnego przypadku pobierane z backendu', async () => {
    zamontujBackend([scenariusz('s1', 'Zwarcie w GPZ')]);
    render(<PanelScenariuszy />);

    expect(await screen.findByTestId('mvd-scenariusze-wiersz-s1')).toBeTruthy();
    expect(screen.getByTestId('mvd-scenariusze-wiersz-s1').textContent).toContain('Zwarcie w GPZ');
    expect(screen.getByTestId('mvd-scenariusze-wiersz-s1').textContent).toContain('Szyna: bus-1');
  });

  it('DODANIE: pola formularza jadą do żądania 1:1 z kontraktem', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([]);
    render(<PanelScenariuszy />);

    await user.click(screen.getByTestId('mvd-scenariusze-dodaj'));
    await user.type(screen.getByTestId('mvd-scenariusze-nazwa'), 'Zwarcie na odcinku');
    await user.selectOptions(screen.getByTestId('mvd-scenariusze-rodzaj'), 'SC_1F');
    await user.type(screen.getByTestId('mvd-scenariusze-element'), 'branch-7');
    await user.selectOptions(screen.getByTestId('mvd-scenariusze-miejsce'), 'BRANCH_POINT');
    await user.type(screen.getByTestId('mvd-scenariusze-pozycja'), '0.4');
    await user.selectOptions(screen.getByTestId('mvd-scenariusze-tryb'), 'IMPEDANCE');
    await user.clear(screen.getByTestId('mvd-scenariusze-r'));
    await user.type(screen.getByTestId('mvd-scenariusze-r'), '0.5');
    await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

    await waitFor(() => {
      const post = zadania.find((z) => z.metoda === 'POST' && z.url.includes('/fault-scenarios'));
      expect(post).toBeTruthy();
      expect(post!.body).toMatchObject({
        name: 'Zwarcie na odcinku',
        fault_type: 'SC_1F',
        location: { element_ref: 'branch-7', location_type: 'BRANCH_POINT', position: 0.4 },
        config: {
          scenariusz: 'MAX',
          nadpisanie_c: null,
          thermal_time_seconds: 1,
          include_branch_contributions: true,
        },
        fault_mode: 'IMPEDANCE',
        fault_impedance: { r_ohm: 0.5, x_ohm: 0 },
      });
    });
  });

  // Iloczyn cech nośnika c: {MAX, MIN} × {bez nadpisania, nadpisanie z uzasadnieniem,
  // nadpisanie bez uzasadnienia → blokada w formularzu}. Ścieżka natywna (userEvent).
  describe.each(['MAX', 'MIN'] as const)('WSPÓŁCZYNNIK c — scenariusz %s', (wariant) => {
    async function wypelnijPodstawe(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByTestId('mvd-scenariusze-dodaj'));
      await user.type(screen.getByTestId('mvd-scenariusze-nazwa'), `Zwarcie ${wariant}`);
      await user.type(screen.getByTestId('mvd-scenariusze-element'), 'bus-2');
      await user.click(screen.getByTestId(`mvd-scenariusze-scenariusz-${wariant}`));
    }

    it('bez nadpisania: wysyła scenariusz i nadpisanie_c = null, bez klucza c_factor', async () => {
      const user = userEvent.setup();
      const zadania = zamontujBackend([]);
      render(<PanelScenariuszy />);
      await wypelnijPodstawe(user);
      expect(screen.queryByTestId('mvd-scenariusze-c-wartosc')).toBeNull();
      await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

      await waitFor(() => {
        const post = zadania.find((z) => z.metoda === 'POST');
        expect(post).toBeTruthy();
        const config = (post!.body as { config: Record<string, unknown> }).config;
        expect(config).toEqual({
          scenariusz: wariant,
          nadpisanie_c: null,
          thermal_time_seconds: 1,
          include_branch_contributions: true,
        });
        expect(config).not.toHaveProperty('c_factor');
      });
      await waitFor(() => expect(screen.queryByTestId('mvd-scenariusze-formularz')).toBeNull());
      expect(screen.queryByTestId('mvd-scenariusze-blad')).toBeNull();
    });

    it('nadpisanie z uzasadnieniem: wartość i uzasadnienie jadą razem', async () => {
      const user = userEvent.setup();
      const zadania = zamontujBackend([]);
      render(<PanelScenariuszy />);
      await wypelnijPodstawe(user);
      await user.click(screen.getByTestId('mvd-scenariusze-nadpisz-c'));
      await user.type(screen.getByTestId('mvd-scenariusze-c-wartosc'), '1.05');
      await user.type(
        screen.getByTestId('mvd-scenariusze-c-uzasadnienie'),
        'Uzgodnienie z operatorem',
      );
      await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

      await waitFor(() => {
        const post = zadania.find((z) => z.metoda === 'POST');
        expect(post).toBeTruthy();
        expect((post!.body as { config: unknown }).config).toEqual({
          scenariusz: wariant,
          nadpisanie_c: { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z operatorem' },
          thermal_time_seconds: 1,
          include_branch_contributions: true,
        });
      });
    });

    it('nadpisanie bez uzasadnienia: formularz blokuje zapis z komunikatem po polsku', async () => {
      const user = userEvent.setup();
      const zadania = zamontujBackend([]);
      render(<PanelScenariuszy />);
      await wypelnijPodstawe(user);
      await user.click(screen.getByTestId('mvd-scenariusze-nadpisz-c'));
      await user.type(screen.getByTestId('mvd-scenariusze-c-wartosc'), '1.05');
      await user.type(screen.getByTestId('mvd-scenariusze-c-uzasadnienie'), '   ');
      await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

      expect(screen.getByTestId('mvd-scenariusze-blad-formularza').textContent).toContain(
        'wymaga uzasadnienia',
      );
      expect(zadania.some((z) => z.metoda === 'POST')).toBe(false);
    });
  });

  it('nadpisanie z wartością niebędącą liczbą dodatnią: blokada w formularzu', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([]);
    render(<PanelScenariuszy />);
    await user.click(screen.getByTestId('mvd-scenariusze-dodaj'));
    await user.type(screen.getByTestId('mvd-scenariusze-nazwa'), 'Zwarcie');
    await user.type(screen.getByTestId('mvd-scenariusze-element'), 'bus-2');
    await user.click(screen.getByTestId('mvd-scenariusze-nadpisz-c'));
    await user.type(screen.getByTestId('mvd-scenariusze-c-uzasadnienie'), 'Powód');
    await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

    expect(screen.getByTestId('mvd-scenariusze-blad-formularza').textContent).toContain(
      'skończoną liczbą dodatnią',
    );
    expect(zadania.some((z) => z.metoda === 'POST')).toBe(false);
  });

  it('ODMOWA BACKENDU z kodem: komunikat po polsku bez kodu maszynowego', async () => {
    const user = userEvent.setup();
    zamontujBackend(
      [],
      'fault.c_nadpisanie_wartosc_niepoprawna: Wartość nadpisania współczynnika c 0 musi być skończoną liczbą dodatnią.',
    );
    render(<PanelScenariuszy />);
    await user.click(screen.getByTestId('mvd-scenariusze-dodaj'));
    await user.type(screen.getByTestId('mvd-scenariusze-nazwa'), 'Zwarcie');
    await user.type(screen.getByTestId('mvd-scenariusze-element'), 'bus-2');
    await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

    const blad = await screen.findByTestId('mvd-scenariusze-blad');
    expect(blad.textContent).toContain('musi być skończoną liczbą dodatnią');
    expect(blad.textContent).not.toContain('fault.c_');
  });

  it('LISTA: kolumna c pokazuje scenariusz albo nadpisanie z uzasadnieniem', async () => {
    zamontujBackend([
      scenariusz('s1', 'Zwarcie MIN', {
        scenariusz: 'MIN',
        nadpisanie_c: null,
        thermal_time_seconds: 1,
        include_branch_contributions: false,
      }),
      scenariusz('s2', 'Zwarcie z nadpisaniem', {
        scenariusz: 'MAX',
        nadpisanie_c: { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' },
        thermal_time_seconds: 1,
        include_branch_contributions: false,
      }),
    ]);
    render(<PanelScenariuszy />);

    expect((await screen.findByTestId('mvd-scenariusze-c-s1')).textContent).toBe(
      'MIN — IEC 60909-0 tab. 1 per węzeł',
    );
    expect(screen.getByTestId('mvd-scenariusze-c-s2').textContent).toBe(
      'nadpisanie c = 1,05 — Uzgodnienie z OSD',
    );
  });

  it('WALIDACJA: bez nazwy i elementu nie wysyłamy nic do backendu', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([]);
    render(<PanelScenariuszy />);

    await user.click(screen.getByTestId('mvd-scenariusze-dodaj'));
    await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

    expect(screen.getByTestId('mvd-scenariusze-blad-formularza')).toBeTruthy();
    expect(zadania.some((z) => z.metoda === 'POST')).toBe(false);
  });

  it('URUCHOMIENIE: klik „Uruchom" woła realną końcówkę przebiegu scenariusza', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([scenariusz('s1', 'Zwarcie w GPZ')]);
    render(<PanelScenariuszy />);

    await user.click(await screen.findByTestId('mvd-scenariusze-uruchom-s1'));

    await waitFor(() => {
      expect(
        zadania.some((z) => z.metoda === 'POST' && z.url.endsWith('/fault-scenarios/s1/runs')),
      ).toBe(true);
    });
    expect((await screen.findByTestId('mvd-scenariusze-komunikat')).textContent).toContain(
      'Zwarcie w GPZ',
    );
  });

  it('USUNIĘCIE wymaga potwierdzenia (operacja nieodwracalna)', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([scenariusz('s1', 'Zwarcie w GPZ')]);
    render(<PanelScenariuszy />);

    await user.click(await screen.findByTestId('mvd-scenariusze-usun-s1'));
    expect(zadania.some((z) => z.metoda === 'DELETE')).toBe(false);

    await user.click(screen.getByTestId('mvd-scenariusze-usun-potwierdz-s1'));
    await waitFor(() => expect(zadania.some((z) => z.metoda === 'DELETE')).toBe(true));
  });

  it('UCZCIWY STAN ZEROWY: bez aktywnego przypadku nie ma gdzie zapisać scenariusza', () => {
    useAppStateStore.setState({ activeCaseId: null });
    zamontujBackend([]);
    render(<PanelScenariuszy />);

    expect(screen.getByTestId('mvd-scenariusze-brak-przypadku')).toBeTruthy();
    expect(screen.queryByTestId('mvd-scenariusze-dodaj')).toBeNull();
  });
});
