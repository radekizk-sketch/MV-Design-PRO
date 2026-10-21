/**
 * Okno scenariusza zwarcia warsztatu (`FaultScenarioModal`) — karta WSPOLCZYNNIK-C-JEDEN-NOSNIK.
 *
 * Defekt naprawiany: okno NIE wysyłało `config` wcale — backend (schemat `extra=forbid`,
 * `config` wymagany przy tworzeniu) odmawiał 422, więc warsztat nie tworzył scenariuszy.
 * Atrapa `fetch` jest wierna kontraktowi `backend/src/api/fault_scenarios.py`:
 *  - brak `config` albo `config.scenariusz` → 422 (tablica pydantic),
 *  - nieznany klucz w `config` (np. dawne `c_factor`) → 422 (`extra=forbid`),
 *  - nadpisanie bez uzasadnienia → 422 odmowy nazwanej: `detail` to zdanie PL bez kodu,
 *    kod `fault.c_nadpisanie_bez_uzasadnienia` w osobnym polu `kod` (`api/odmowa_http`).
 * Iloczyn cech: {MAX, MIN} × {bez nadpisania, nadpisanie z uzasadnieniem, nadpisanie bez
 * uzasadnienia → blokada} × {tworzenie, edycja}. Interakcje natywne (userEvent).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaultScenarioModal } from '../FaultScenarioModal';
import { useFaultScenariosStore } from '../store';
import type { FaultScenario, ShortCircuitConfig } from '../types';

const DOZWOLONE_KLUCZE_CONFIG = new Set([
  'scenariusz',
  'nadpisanie_c',
  'thermal_time_seconds',
  'include_branch_contributions',
]);

interface Wywolanie {
  method: string;
  url: string;
  body: Record<string, unknown>;
}

let wywolania: Wywolanie[] = [];

function odpowiedz(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function scenariuszZ(config: ShortCircuitConfig, id = 'sc-1'): FaultScenario {
  return {
    scenario_id: id,
    study_case_id: 'case-1',
    name: 'Zwarcie na szynie',
    analysis_type: 'SC_3F',
    fault_type: 'SC_3F',
    location: { element_ref: 'bus-1', location_type: 'NODE', position: null },
    config,
    fault_impedance_type: 'METALLIC',
    fault_mode: 'METALLIC',
    fault_impedance: null,
    arc_params: null,
    z0_bus_data: null,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    content_hash: 'h',
  } as FaultScenario;
}

/** Walidacja `config` tak jak backend; `null` = przyjęte. */
function odmowaBackendu(config: unknown, wymagany: boolean): Response | null {
  if (config === undefined || config === null) {
    return wymagany
      ? odpowiedz(422, { detail: [{ loc: ['body', 'config'], msg: 'Field required' }] })
      : null;
  }
  const c = config as Record<string, unknown>;
  const obce = Object.keys(c).filter((k) => !DOZWOLONE_KLUCZE_CONFIG.has(k));
  if (obce.length > 0) {
    return odpowiedz(422, {
      detail: obce.map((k) => ({ loc: ['body', 'config', k], msg: 'Extra inputs are not permitted' })),
    });
  }
  if (c.scenariusz !== 'MAX' && c.scenariusz !== 'MIN') {
    return odpowiedz(422, { detail: [{ loc: ['body', 'config', 'scenariusz'], msg: 'Field required' }] });
  }
  const nad = c.nadpisanie_c as { wartosc?: unknown; uzasadnienie?: unknown } | null | undefined;
  if (nad) {
    if (typeof nad.uzasadnienie !== 'string' || nad.uzasadnienie.trim() === '') {
      return odpowiedz(422, {
        detail: 'Nadpisanie współczynnika napięciowego c wymaga uzasadnienia',
        kod: 'fault.c_nadpisanie_bez_uzasadnienia',
        dane: {},
      });
    }
  }
  return null;
}

function zainstalujBackend(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      wywolania.push({ method, url, body });
      if (method === 'GET' && url.endsWith('/fault-scenarios')) {
        return odpowiedz(200, { scenarios: [], count: 0 });
      }
      if (method === 'POST' && url.endsWith('/study-cases/case-1/fault-scenarios')) {
        const odmowa = odmowaBackendu(body.config, true);
        if (odmowa) return odmowa;
        return odpowiedz(201, scenariuszZ(body.config as ShortCircuitConfig, 'sc-nowy'));
      }
      if (method === 'PUT' && url.includes('/fault-scenarios/')) {
        const odmowa = odmowaBackendu(body.config, false);
        if (odmowa) return odmowa;
        return odpowiedz(200, scenariuszZ(body.config as ShortCircuitConfig));
      }
      return odpowiedz(404, { detail: 'nieznana trasa' });
    }),
  );
}

function wywolaniaZapisu(): Wywolanie[] {
  return wywolania.filter((w) => w.method === 'POST' || w.method === 'PUT');
}

async function otworzNowy(): Promise<ReturnType<typeof userEvent.setup>> {
  useFaultScenariosStore.setState({ studyCaseId: 'case-1', scenarios: [] });
  useFaultScenariosStore.getState().openModal();
  render(<FaultScenarioModal />);
  const user = userEvent.setup();
  await user.type(screen.getByTestId('fault-scenario-name-input'), 'Zwarcie na szynie');
  await user.type(screen.getByTestId('fault-scenario-node-input'), 'bus-1');
  return user;
}

async function ustawNadpisanie(
  user: ReturnType<typeof userEvent.setup>,
  wartosc: string,
  uzasadnienie: string,
): Promise<void> {
  await user.click(screen.getByTestId('fault-scenario-nadpisz-c'));
  const pole = screen.getByTestId('fault-scenario-c-wartosc');
  await user.clear(pole);
  await user.type(pole, wartosc);
  if (uzasadnienie) {
    await user.type(screen.getByTestId('fault-scenario-c-uzasadnienie'), uzasadnienie);
  }
}

beforeEach(() => {
  useFaultScenariosStore.getState().reset();
  wywolania = [];
  zainstalujBackend();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FaultScenarioModal — nośnik współczynnika c (tworzenie)', () => {
  for (const scenariusz of ['MAX', 'MIN'] as const) {
    it(`${scenariusz} bez nadpisania: wysyła config.scenariusz i t_k, backend przyjmuje`, async () => {
      const user = await otworzNowy();
      await user.click(screen.getByTestId(`fault-scenario-scenariusz-${scenariusz}`));
      const tk = screen.getByTestId('fault-scenario-tk-input');
      await user.clear(tk);
      await user.type(tk, '0.5');
      await user.click(screen.getByTestId('fault-scenario-save-btn'));

      await waitFor(() => expect(useFaultScenariosStore.getState().isModalOpen).toBe(false));
      const [zapis] = wywolaniaZapisu();
      expect(zapis.method).toBe('POST');
      expect(zapis.body.config).toEqual({
        scenariusz,
        nadpisanie_c: null,
        thermal_time_seconds: 0.5,
        include_branch_contributions: false,
      });
      expect(zapis.body.config).not.toHaveProperty('c_factor');
    });

    it(`${scenariusz} z nadpisaniem i uzasadnieniem: wysyła nadpisanie_c`, async () => {
      const user = await otworzNowy();
      await user.click(screen.getByTestId(`fault-scenario-scenariusz-${scenariusz}`));
      await ustawNadpisanie(user, '1.05', 'Uzgodnienie z operatorem');
      await user.click(screen.getByTestId('fault-scenario-save-btn'));

      await waitFor(() => expect(useFaultScenariosStore.getState().isModalOpen).toBe(false));
      const [zapis] = wywolaniaZapisu();
      expect((zapis.body.config as ShortCircuitConfig).scenariusz).toBe(scenariusz);
      expect((zapis.body.config as ShortCircuitConfig).nadpisanie_c).toEqual({
        wartosc: 1.05,
        uzasadnienie: 'Uzgodnienie z operatorem',
      });
    });

    it(`${scenariusz} z nadpisaniem BEZ uzasadnienia: blokada w oknie, brak wywołania backendu`, async () => {
      const user = await otworzNowy();
      await user.click(screen.getByTestId(`fault-scenario-scenariusz-${scenariusz}`));
      await ustawNadpisanie(user, '1.05', '');
      await user.click(screen.getByTestId('fault-scenario-save-btn'));

      const blad = await screen.findByTestId('fault-scenario-validation-error');
      expect(blad.textContent).toContain('wymaga uzasadnienia');
      expect(wywolaniaZapisu()).toHaveLength(0);
      expect(useFaultScenariosStore.getState().isModalOpen).toBe(true);
    });
  }

  it('niepoprawna wartość nadpisania (0) blokuje zapis z komunikatem PL', async () => {
    const user = await otworzNowy();
    await ustawNadpisanie(user, '0', 'Uzgodnienie');
    await user.click(screen.getByTestId('fault-scenario-save-btn'));
    const blad = await screen.findByTestId('fault-scenario-validation-error');
    expect(blad.textContent).toContain('skończoną liczbą dodatnią');
    expect(wywolaniaZapisu()).toHaveLength(0);
  });

  it('niedodatni t_k blokuje zapis', async () => {
    const user = await otworzNowy();
    const tk = screen.getByTestId('fault-scenario-tk-input');
    await user.clear(tk);
    await user.type(tk, '0');
    await user.click(screen.getByTestId('fault-scenario-save-btn'));
    const blad = await screen.findByTestId('fault-scenario-validation-error');
    expect(blad.textContent).toContain('t_k');
    expect(wywolaniaZapisu()).toHaveLength(0);
  });
});

describe('FaultScenarioModal — nośnik współczynnika c (edycja)', () => {
  it('wypełnia pola z config scenariusza (MIN + nadpisanie) i odsyła je bez zmian', async () => {
    const config: ShortCircuitConfig = {
      scenariusz: 'MIN',
      nadpisanie_c: { wartosc: 0.98, uzasadnienie: 'Pomiar napięcia w GPZ' },
      thermal_time_seconds: 0.3,
      include_branch_contributions: true,
    };
    useFaultScenariosStore.setState({ studyCaseId: 'case-1', scenarios: [scenariuszZ(config)] });
    useFaultScenariosStore.getState().openModal('sc-1');
    render(<FaultScenarioModal />);
    const user = userEvent.setup();

    expect((screen.getByTestId('fault-scenario-scenariusz-MIN') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('fault-scenario-nadpisz-c') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('fault-scenario-c-wartosc') as HTMLInputElement).value).toBe('0.98');
    expect((screen.getByTestId('fault-scenario-c-uzasadnienie') as HTMLInputElement).value).toBe(
      'Pomiar napięcia w GPZ',
    );
    expect((screen.getByTestId('fault-scenario-tk-input') as HTMLInputElement).value).toBe('0.3');

    await user.click(screen.getByTestId('fault-scenario-save-btn'));
    await waitFor(() => expect(useFaultScenariosStore.getState().isModalOpen).toBe(false));
    const [zapis] = wywolaniaZapisu();
    expect(zapis.method).toBe('PUT');
    expect(zapis.body.config).toEqual(config);
  });

  it('zdjęcie nadpisania w edycji wysyła nadpisanie_c = null przy zachowanym scenariuszu', async () => {
    const config: ShortCircuitConfig = {
      scenariusz: 'MAX',
      nadpisanie_c: { wartosc: 1.05, uzasadnienie: 'Uzgodnienie' },
      thermal_time_seconds: 1,
      include_branch_contributions: false,
    };
    useFaultScenariosStore.setState({ studyCaseId: 'case-1', scenarios: [scenariuszZ(config)] });
    useFaultScenariosStore.getState().openModal('sc-1');
    render(<FaultScenarioModal />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('fault-scenario-nadpisz-c'));
    await user.click(screen.getByTestId('fault-scenario-save-btn'));
    await waitFor(() => expect(useFaultScenariosStore.getState().isModalOpen).toBe(false));
    const [zapis] = wywolaniaZapisu();
    expect((zapis.body.config as ShortCircuitConfig).scenariusz).toBe('MAX');
    expect((zapis.body.config as ShortCircuitConfig).nadpisanie_c).toBeNull();
  });

  it('odmowa backendu z kodem domenowym pokazuje komunikat PL bez kodu', async () => {
    // Backend jest ostateczną bramą: gdyby walidacja okna przepuściła puste uzasadnienie
    // (np. same spacje po stronie innego klienta), kod domenowy wraca w polu `kod` obok zdania PL.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        odpowiedz(422, {
          detail: 'Nadpisanie współczynnika napięciowego c wymaga uzasadnienia',
        kod: 'fault.c_nadpisanie_bez_uzasadnienia',
        dane: {},
        }),
      ),
    );
    const user = await otworzNowy();
    await user.click(screen.getByTestId('fault-scenario-save-btn'));
    const blad = await screen.findByTestId('fault-scenario-validation-error');
    expect(blad.textContent).toContain('wymaga uzasadnienia');
    expect(blad.textContent).not.toContain('fault.c_nadpisanie_bez_uzasadnienia');
  });
});
