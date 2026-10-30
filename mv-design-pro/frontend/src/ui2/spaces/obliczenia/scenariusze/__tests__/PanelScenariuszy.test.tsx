/**
 * Testy okna „Scenariusze zwarciowe" w powłoce ui2 (karta KD-4, luka L-7).
 *
 * INTENCJA: trzy zdolności, które miała wyłącznie martwa trasa mostu — LISTA,
 * DODANIE i URUCHOMIENIE — działają w przestrzeni „Obliczenia" na REALNYCH
 * wywołaniach `/api/execution/...`. Asercje idą przeciwko treści żądania
 * (co backend dostaje), nie przeciwko napisowi na ekranie.
 * Kliki natywne (userEvent), Zero-Debt pkt 5.
 */

import { tekstZrodlowy } from '../../../../../test/tekstZWzorami';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppStateStore } from '../../../../../ui/app-state';
import { runIdOgladanyTeraz, useKontekstWynikuStore } from '../../../../wyniki/kontekst/kontekstWyniku';
import { useFaultScenariosStore } from '../../../../../ui/fault-scenarios/store';
import { PanelScenariuszy } from '../PanelScenariuszy';
import { SCENARIUSZE_STRINGS as T } from '../strings';
import { useZadanieCzasuTb } from '../zadanieCzasuTb';
import { OPIS_CZASU_TB_W_PUNKCIE } from '../../../../../ui/fault-scenarios/wspolczynnikC';

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
    fault_mode: 'METALLIC',
    fault_impedance: null,
    created_at: '2026-07-31T10:00:00Z',
    updated_at: '2026-07-31T10:00:00Z',
    content_hash: 'h',
  };
}

/** Zachowanie atrapy backendu dla biegu ze scenariusza (iloczyn cech testu URUCHOMIENIA). */
type BiegAtrapy = 'DONE' | 'FAILED' | 'ODMOWA_UTWORZENIA';

const JSON_NAGLOWKI = { 'Content-Type': 'application/json' };

function biegWykonania(status: string) {
  return {
    id: 'run-z-scenariusza',
    study_case_id: CASE_ID,
    analysis_type: 'SC_3F',
    solver_input_hash: 'h',
    status,
    started_at: null,
    finished_at: null,
    error_message: null,
  };
}

/**
 * Atrapa backendu wierna kontraktowi `ShortCircuitConfigRequest` (extra=forbid):
 * klucz `c_factor` albo brak `scenariusz` → 422 (lista błędów schematu), nadpisanie
 * bez uzasadnienia → 422 odmowy nazwanej (`api/odmowa_http.pola_odmowy`: zdanie PL
 * w `detail`, kod maszynowy w osobnym polu `kod`, dane w `dane`).
 * `odmowaDomeny` wymusza odmowę domeny niezależnie od treści (ścieżka błędu backendu).
 */
function zamontujBackend(
  lista: ReturnType<typeof scenariusz>[],
  bieg: BiegAtrapy = 'DONE',
  odmowaDomeny: { detail: string; kod: string; dane: Record<string, unknown> } | null = null,
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
          headers: JSON_NAGLOWKI,
        });
      }
      if (metoda === 'POST' && url.includes('/fault-scenarios/') && url.endsWith('/runs')) {
        if (bieg === 'ODMOWA_UTWORZENIA') {
          return new Response(
            JSON.stringify({ detail: 'Model nie ma danych składowej zerowej' }),
            { status: 409, headers: JSON_NAGLOWKI },
          );
        }
        return new Response(JSON.stringify({ ...biegWykonania('PENDING') }), {
          status: 201,
          headers: JSON_NAGLOWKI,
        });
      }
      if (metoda === 'POST' && url.endsWith('/runs/run-z-scenariusza/execute')) {
        return new Response(JSON.stringify(biegWykonania(bieg)), {
          status: 202,
          headers: JSON_NAGLOWKI,
        });
      }
      if (metoda === 'GET' && url.endsWith(`/study-cases/${CASE_ID}/runs`)) {
        return new Response(JSON.stringify({ runs: [biegWykonania(bieg)], count: 1 }), {
          status: 200,
          headers: JSON_NAGLOWKI,
        });
      }
      if (metoda === 'GET' && url.endsWith('/api/analysis-runs/run-z-scenariusza')) {
        return new Response(
          JSON.stringify({ status: bieg, result_status: bieg === 'DONE' ? 'FRESH' : 'FAILED' }),
          { status: 200, headers: JSON_NAGLOWKI },
        );
      }
      if (metoda === 'POST') {
        const body = (init?.body ? JSON.parse(String(init.body)) : {}) as {
          config?: Record<string, unknown>;
        };
        const config = body.config ?? {};
        if ('c_factor' in config || !('scenariusz' in config)) {
          return new Response(
            JSON.stringify({
              detail: [{ loc: ['body', 'config', 'scenariusz'], msg: 'wartość jest wymagana', type: 'missing' }],
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }
        const nadpisanie = config.nadpisanie_c as { uzasadnienie?: string } | null | undefined;
        if (odmowaDomeny || (nadpisanie && !nadpisanie.uzasadnienie?.trim())) {
          return new Response(
            JSON.stringify(
              odmowaDomeny ?? {
                detail: 'Nadpisanie współczynnika napięciowego c wymaga uzasadnienia',
                kod: 'fault.c_nadpisanie_bez_uzasadnienia',
                dane: {},
              },
            ),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(JSON.stringify(scenariusz('scen-nowy', 'Zwarcie na szynie 2')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // Karta TB-WARTOSC-ROBOCZA: PUT scenariusza — wierna kontraktowi reguła t_b
      // (`czas_tb_z_danych`: niedodatni = 422 `fault.czas_tb_niepoprawny`), odpowiedź = scenariusz
      // z konfiguracją z żądania.
      if (metoda === 'PUT' && url.includes('/fault-scenarios/')) {
        const body = (init?.body ? JSON.parse(String(init.body)) : {}) as {
          config?: Record<string, unknown>;
        };
        const id = url.split('/fault-scenarios/')[1];
        const tb = body.config?.breaking_time_seconds;
        if (typeof tb === 'number' && !(tb > 0)) {
          return new Response(
            JSON.stringify({ detail: 'Czas wyłączenia t_b musi być dodatni', kod: 'fault.czas_tb_niepoprawny' }),
            { status: 422, headers: JSON_NAGLOWKI },
          );
        }
        const bazowy = lista.find((x) => x.scenario_id === id) ?? scenariusz(id, id);
        return new Response(JSON.stringify({ ...bazowy, config: body.config ?? bazowy.config }), {
          status: 200,
          headers: JSON_NAGLOWKI,
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
  useZadanieCzasuTb.setState({ zadanie: null });
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
        fault_impedance: { r_f_ohm: 0.5, x_f_ohm: 0 },
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
      'DONE',
      {
        detail: 'Wartość nadpisania współczynnika c 0 musi być skończoną liczbą dodatnią.',
        kod: 'fault.c_nadpisanie_wartosc_niepoprawna',
        dane: {},
      },
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

  // Karta SC-IB-ITH-ZRODLA: t_b jest daną scenariusza. Iloczyn cech: {puste, 0.02, 0.1, 0.25}
  // → klucz `breaking_time_seconds` obecny tylko z liczbą (puste = t_b rozstrzygany w punkcie
  // zwarcia — karta TB-WARTOSC-ROBOCZA); {0, -0.1} → blokada w formularzu bez żądania.
  // Wpisywanie natywne.
  describe('CZAS WYŁĄCZENIA t_b', () => {
    async function wypelnij(user: ReturnType<typeof userEvent.setup>, tb: string) {
      await user.click(screen.getByTestId('mvd-scenariusze-dodaj'));
      await user.type(screen.getByTestId('mvd-scenariusze-nazwa'), 'Zwarcie z t_b');
      await user.type(screen.getByTestId('mvd-scenariusze-element'), 'bus-2');
      if (tb !== '') await user.type(screen.getByTestId('mvd-scenariusze-czas-tb'), tb);
      await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));
    }

    it('puste pole: config bez klucza breaking_time_seconds', async () => {
      const user = userEvent.setup();
      const zadania = zamontujBackend([]);
      render(<PanelScenariuszy />);
      await wypelnij(user, '');
      await waitFor(() => {
        const post = zadania.find((z) => z.metoda === 'POST');
        expect(post).toBeTruthy();
        expect((post!.body as { config: Record<string, unknown> }).config).not.toHaveProperty(
          'breaking_time_seconds',
        );
      });
    });

    it.each([
      ['0.02', 0.02],
      ['0.1', 0.1],
      ['0.25', 0.25],
    ])('t_b = %s: config niesie breaking_time_seconds = %s', async (wpis, oczekiwane) => {
      const user = userEvent.setup();
      const zadania = zamontujBackend([]);
      render(<PanelScenariuszy />);
      await wypelnij(user, wpis);
      await waitFor(() => {
        const post = zadania.find((z) => z.metoda === 'POST');
        expect(post).toBeTruthy();
        expect(
          (post!.body as { config: Record<string, unknown> }).config.breaking_time_seconds,
        ).toBe(oczekiwane);
      });
    });

    it.each(['0', '-0.1'])('t_b = %s: blokada w formularzu, brak żądania', async (wpis) => {
      const user = userEvent.setup();
      const zadania = zamontujBackend([]);
      render(<PanelScenariuszy />);
      await wypelnij(user, wpis);
      const blad = tekstZrodlowy(screen.getByTestId('mvd-scenariusze-blad-formularza'));
      expect(blad).toContain('Czas wyłączenia $t_b$');
      expect(blad).not.toContain('fault.czas_tb_niepoprawny');
      expect(zadania.some((z) => z.metoda === 'POST')).toBe(false);
    });

    it('LISTA: kolumna t_b pokazuje wartość albo regułę punktu zwarcia', async () => {
      zamontujBackend([
        scenariusz('s1', 'Bez t_b', {
          scenariusz: 'MAX',
          nadpisanie_c: null,
          thermal_time_seconds: 1,
          include_branch_contributions: false,
        }),
        scenariusz('s2', 'Z t_b', {
          scenariusz: 'MAX',
          nadpisanie_c: null,
          thermal_time_seconds: 1,
          include_branch_contributions: false,
          breaking_time_seconds: 0.1,
        }),
      ]);
      render(<PanelScenariuszy />);
      // Symbol `$t_b$` przycisku składa KaTeX — porównanie dokładne napisu źródłowego.
      expect(tekstZrodlowy(await screen.findByTestId('mvd-scenariusze-tb-s1'))).toBe(
        `${OPIS_CZASU_TB_W_PUNKCIE} ${T.zmianaTb}`,
      );
      expect(tekstZrodlowy(screen.getByTestId('mvd-scenariusze-tb-s2'))).toBe(`0,1 s ${T.zmianaTb}`);
    });
  });

  // Karta TB-WARTOSC-ROBOCZA: zmiana t_b istniejącego scenariusza (PUT z całą konfiguracją —
  // pozostałe pola bez zmian). Iloczyn cech: {scenariusz bez t_b · z t_b} × {wpis liczby ·
  // wyczyszczenie pola · wpis niefizyczny} — klucz `breaking_time_seconds` tylko z liczbą,
  // niefizyczny = blokada bez żądania. Wejście: przycisk wiersza ALBO żądanie z ekranu wyników
  // ({scenariusz biegu istnieje · usunięty · bieg bez scenariusza}). Kliki natywne.
  describe('ZMIANA t_b scenariusza', () => {
    const KONFIG_BEZ_TB = {
      scenariusz: 'MIN',
      nadpisanie_c: { wartosc: 1.05, uzasadnienie: 'Uzgodnienie z OSD' },
      thermal_time_seconds: 0.5,
      include_branch_contributions: true,
    };
    const KONFIG_Z_TB = { ...KONFIG_BEZ_TB, breaking_time_seconds: 0.25 };

    async function zmienTb(
      user: ReturnType<typeof userEvent.setup>,
      id: string,
      wpis: string,
      zPrzycisku = true,
    ) {
      if (zPrzycisku) await user.click(await screen.findByTestId(`mvd-scenariusze-tb-zmien-${id}`));
      const pole = await screen.findByTestId(`mvd-scenariusze-tb-pole-${id}`);
      await user.clear(pole);
      if (wpis !== '') await user.type(pole, wpis);
      await user.click(screen.getByTestId(`mvd-scenariusze-tb-zapisz-${id}`));
    }

    it.each([
      ['bez t_b', KONFIG_BEZ_TB, '0.08', 0.08],
      ['z t_b', KONFIG_Z_TB, '0.08', 0.08],
      ['bez t_b', KONFIG_BEZ_TB, '', undefined],
      ['z t_b', KONFIG_Z_TB, '', undefined],
    ] as const)('scenariusz %s × wpis „%s" → PUT z pełną konfiguracją', async (_n, konfig, wpis, tb) => {
      const user = userEvent.setup();
      const zadania = zamontujBackend([scenariusz('s1', 'Scenariusz 1', konfig)]);
      render(<PanelScenariuszy />);
      await zmienTb(user, 's1', wpis);
      await waitFor(() => {
        const put = zadania.find((z) => z.metoda === 'PUT');
        expect(put?.url).toContain('/fault-scenarios/s1');
        const { breaking_time_seconds: wyslany, ...reszta } = (put!.body as { config: Record<string, unknown> })
          .config;
        expect(wyslany).toBe(tb);
        const { breaking_time_seconds: _pominiety, ...bazowa } = konfig as Record<string, unknown>;
        expect(reszta).toEqual(bazowa);
        expect(Object.keys((put!.body as Record<string, unknown>))).toEqual(['config']);
      });
      expect(tekstZrodlowy(await screen.findByTestId('mvd-scenariusze-komunikat'))).toContain(
        T.zmianaTbZapisano,
      );
      expect(tekstZrodlowy(screen.getByTestId('mvd-scenariusze-tb-s1'))).toBe(
        `${tb === undefined ? OPIS_CZASU_TB_W_PUNKCIE : '0,08 s'} ${T.zmianaTb}`,
      );
    });

    it.each(['0', '-0.1'])('wpis niefizyczny %s → blokada w wierszu, brak PUT', async (wpis) => {
      const user = userEvent.setup();
      const zadania = zamontujBackend([scenariusz('s1', 'Scenariusz 1', KONFIG_BEZ_TB)]);
      render(<PanelScenariuszy />);
      await zmienTb(user, 's1', wpis);
      expect(tekstZrodlowy(screen.getByTestId('mvd-scenariusze-tb-blad-s1'))).toContain(
        'Czas wyłączenia $t_b$',
      );
      expect(zadania.some((z) => z.metoda === 'PUT')).toBe(false);
    });

    it('żądanie z ekranu wyników: scenariusz biegu istnieje → edycja t_b w jego wierszu', async () => {
      const user = userEvent.setup();
      const zadania = zamontujBackend([
        scenariusz('s1', 'Scenariusz 1', KONFIG_BEZ_TB),
        scenariusz('s2', 'Scenariusz 2', KONFIG_Z_TB),
      ]);
      useZadanieCzasuTb.getState().zazadaj('s2');
      render(<PanelScenariuszy />);
      const pole = await screen.findByTestId('mvd-scenariusze-tb-pole-s2');
      expect(pole).toHaveValue(0.25);
      expect(pole).toHaveFocus();
      expect(screen.queryByTestId('mvd-scenariusze-tb-pole-s1')).not.toBeInTheDocument();
      expect(useZadanieCzasuTb.getState().zadanie).toBeNull();
      await zmienTb(user, 's2', '0.12', false);
      await waitFor(() => {
        const put = zadania.find((z) => z.metoda === 'PUT');
        expect(put?.url).toContain('/fault-scenarios/s2');
        expect((put!.body as { config: Record<string, unknown> }).config.breaking_time_seconds).toBe(0.12);
      });
    });

    it.each([
      ['bieg przypadku bez scenariusza', null, false],
      ['scenariusz biegu usunięty', 'scen-usuniety', true],
    ] as const)('żądanie z ekranu wyników: %s → formularz nowego scenariusza z kursorem w t_b', async (_n, id, komunikat) => {
      zamontujBackend([scenariusz('s1', 'Scenariusz 1', KONFIG_BEZ_TB)]);
      useZadanieCzasuTb.getState().zazadaj(id);
      render(<PanelScenariuszy />);
      const pole = await screen.findByTestId('mvd-scenariusze-czas-tb');
      await waitFor(() => expect(pole).toHaveFocus());
      expect(screen.queryByTestId('mvd-scenariusze-tb-pole-s1')).not.toBeInTheDocument();
      expect(useZadanieCzasuTb.getState().zadanie).toBeNull();
      if (komunikat) {
        expect(tekstZrodlowy(screen.getByTestId('mvd-scenariusze-komunikat'))).toBe(
          T.zmianaTbScenariuszaBrak,
        );
      } else {
        expect(screen.queryByTestId('mvd-scenariusze-komunikat')).not.toBeInTheDocument();
      }
    });
  });

  // Partia integracji 10 (OD-14): rodzaje zwarcia formularza = rodzaje domeny scenariusza
  // (`FaultType`: 3F, 2F, 1F, 2F+G) — 2F+G dotąd nie istniał w scenariuszu, choć rdzeń go liczył.
  it.each(['SC_3F', 'SC_2F', 'SC_1F', 'SC_2F_G'])(
    'RODZAJ %s: dostępny w formularzu i wysłany 1:1 z Z_f',
    async (rodzaj) => {
      const user = userEvent.setup();
      const zadania = zamontujBackend([]);
      render(<PanelScenariuszy />);

      await user.click(screen.getByTestId('mvd-scenariusze-dodaj'));
      await user.type(screen.getByTestId('mvd-scenariusze-nazwa'), `Zwarcie ${rodzaj}`);
      await user.selectOptions(screen.getByTestId('mvd-scenariusze-rodzaj'), rodzaj);
      await user.type(screen.getByTestId('mvd-scenariusze-element'), 'bus-1');
      await user.selectOptions(screen.getByTestId('mvd-scenariusze-tryb'), 'IMPEDANCE');
      await user.clear(screen.getByTestId('mvd-scenariusze-x'));
      await user.type(screen.getByTestId('mvd-scenariusze-x'), '1.5');
      await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

      await waitFor(() => {
        const post = zadania.find((z) => z.metoda === 'POST' && z.url.includes('/fault-scenarios'));
        expect(post?.body).toMatchObject({
          fault_type: rodzaj,
          fault_mode: 'IMPEDANCE',
          fault_impedance: { r_f_ohm: 0, x_f_ohm: 1.5 },
        });
      });
    },
  );

  it('WALIDACJA: bez nazwy i elementu nie wysyłamy nic do backendu', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([]);
    render(<PanelScenariuszy />);

    await user.click(screen.getByTestId('mvd-scenariusze-dodaj'));
    await user.click(screen.getByTestId('mvd-scenariusze-zapisz'));

    expect(screen.getByTestId('mvd-scenariusze-blad-formularza')).toBeTruthy();
    expect(zadania.some((z) => z.metoda === 'POST')).toBe(false);
  });

  // Karta OD-14 (partia integracji 10): „Uruchom" dawniej tworzył bieg PENDING i na tym
  // kończył (nikt go nie wykonywał), a komunikat mówił „uruchomiono". Iloczyn cech:
  // {bieg DONE, bieg FAILED, odmowa utworzenia 409} × {wykonanie zlecone, bieg związany
  // z powłoką, komunikat sukcesu}.
  it('URUCHOMIENIE (DONE): tworzy bieg, ZLECA wykonanie i wiąże wynik z powłoką', async () => {
    const user = userEvent.setup();
    useKontekstWynikuStore.getState().wyczysc();
    const zadania = zamontujBackend([scenariusz('s1', 'Zwarcie w GPZ')], 'DONE');
    render(<PanelScenariuszy />);

    await user.click(await screen.findByTestId('mvd-scenariusze-uruchom-s1'));

    expect((await screen.findByTestId('mvd-scenariusze-komunikat')).textContent).toContain(
      'Zwarcie w GPZ',
    );
    const utworzenie = zadania.findIndex(
      (z) => z.metoda === 'POST' && z.url.endsWith('/fault-scenarios/s1/runs'),
    );
    const wykonanie = zadania.findIndex(
      (z) => z.metoda === 'POST' && z.url.endsWith('/runs/run-z-scenariusza/execute'),
    );
    expect(utworzenie).toBeGreaterThanOrEqual(0);
    expect(wykonanie).toBeGreaterThan(utworzenie);
    // Karta K8: bieg związany z powłoką = oglądany bieg magazynu kontekstu wyniku
    // (jedna akcja `wybierzBieg`, zero drugiego nośnika „aktywnego biegu”).
    expect(runIdOgladanyTeraz()).toBe('run-z-scenariusza');
    expect(useAppStateStore.getState().activeCaseResultStatus).toBe('FRESH');
  });

  it('URUCHOMIENIE (FAILED): bieg wykonany bez wyniku → brak komunikatu sukcesu', async () => {
    const user = userEvent.setup();
    useAppStateStore.setState({ activeCaseResultStatus: 'FRESH' });
    const zadania = zamontujBackend([scenariusz('s1', 'Zwarcie w GPZ')], 'FAILED');
    render(<PanelScenariuszy />);

    await user.click(await screen.findByTestId('mvd-scenariusze-uruchom-s1'));

    await waitFor(() =>
      expect(screen.getByTestId('mvd-scenariusze-uruchom-s1')).not.toBeDisabled(),
    );
    expect(zadania.some((z) => z.url.endsWith('/runs/run-z-scenariusza/execute'))).toBe(true);
    expect(screen.queryByTestId('mvd-scenariusze-komunikat')).toBeNull();
    expect(useAppStateStore.getState().activeCaseResultStatus).toBe('NONE');
  });

  it('URUCHOMIENIE (odmowa 409): treść odmowy w panelu, wykonanie NIE zlecone', async () => {
    const user = userEvent.setup();
    const zadania = zamontujBackend([scenariusz('s1', 'Zwarcie w GPZ')], 'ODMOWA_UTWORZENIA');
    render(<PanelScenariuszy />);

    await user.click(await screen.findByTestId('mvd-scenariusze-uruchom-s1'));

    expect((await screen.findByTestId('mvd-scenariusze-blad')).textContent).toContain(
      'składowej zerowej',
    );
    expect(zadania.some((z) => z.url.endsWith('/execute'))).toBe(false);
    expect(screen.queryByTestId('mvd-scenariusze-komunikat')).toBeNull();
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
