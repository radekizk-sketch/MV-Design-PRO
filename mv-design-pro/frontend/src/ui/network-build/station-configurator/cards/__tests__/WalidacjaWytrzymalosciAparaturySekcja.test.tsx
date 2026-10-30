/**
 * Wytrzymałość zwarciowa aparatury I_dyn / I_th — sekcja karty zabezpieczeń (K7-B).
 *
 * Testy pilnują tego, co było źródłem defektu: KATALOG i WERDYKT muszą pochodzić
 * z backendu. Front nie ma już własnej kopii kryterium IEC 60909 ani własnej
 * kopii katalogu aparatury — a gdyby wróciły, ekran mógłby ogłaszać „wytrzymała"
 * na liczbach, których nie widział żaden solver i nie obejmował żaden ślad.
 *
 * Drugi przedmiot testów to UCZCIWE STANY: dopóki odpowiedzi nie ma (albo nie
 * przyszła), ekran nie może pokazywać niczego, co da się przeczytać jako werdykt,
 * a aparat spoza katalogu MUSI być odróżnialny od aparatu niezgodnego.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DeviceWithstandValidationResponse } from '../../../station-der/audit2-api';
import rekordyAudytu2 from '../../../station-der/__tests__/rekordyAudytu2.json';
import { WalidacjaWytrzymalosciAparaturySekcja } from '../WalidacjaWytrzymalosciAparaturySekcja';

// Odpowiedzi końcówki z TEJ SAMEJ funkcji backendu (fixtura generowana, parytet pilnuje
// `test_fixtury_ocen_fe.py`) — rekord W, nie flagi `ok`/`i_dyn_ok` (WERDYKT-MIGRACJA-190).
const WYTRZYMALOSC = rekordyAudytu2.wytrzymalosc as unknown as Record<
  'w_granicach' | 'przekroczona',
  DeviceWithstandValidationResponse
>;

const KATALOG = [
  {
    id: 'wstd_breaker_vacuum_15_25',
    label_pl: 'Wyłącznik próżniowy 15 kV · I_dyn=63 kA · I_th=25 kA/1s',
    device_type: 'breaker_vacuum_15',
    nominal_voltage_kv: 15,
    nominal_current_a: 1250,
    i_dyn_ka: 63,
    i_th_1s_ka: 25,
    i_th_duration_s: 1,
  },
];

const POLA = [
  {
    bayDesignation: 'J01',
    deviceCatalogRef: 'wstd_breaker_vacuum_15_25',
    i_peak_calculated_ka: 50,
    i_thermal_calculated_ka: 20,
    t_clearing_s: 1.0,
  },
];

const originalFetch = global.fetch;
let zapytania: Array<{ url: string; body: unknown }> = [];

function zamontujFetch(
  odpowiedz: DeviceWithstandValidationResponse | 'blad',
  opoznienie?: Promise<void>,
): void {
  zapytania = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    zapytania.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (opoznienie) await opoznienie;
    if (url.endsWith('/device-withstand')) {
      if (odpowiedz === 'blad') {
        return { ok: false, status: 500, statusText: 'Internal Server Error' } as Response;
      }
      return { ok: true, status: 200, json: async () => KATALOG } as Response;
    }
    if (url.includes('/validate-device-withstand')) {
      if (odpowiedz === 'blad') {
        return { ok: false, status: 500, statusText: 'Internal Server Error' } as Response;
      }
      return { ok: true, status: 200, json: async () => odpowiedz } as Response;
    }
    throw new Error(`nieoczekiwane zapytanie: ${url}`);
  }) as unknown as typeof fetch;
}

const WERDYKT_OK = WYTRZYMALOSC.w_granicach;

describe('WalidacjaWytrzymalosciAparaturySekcja — katalog i werdykt z backendu', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('pyta KATALOG BACKENDU o aparaty i KOŃCÓWKĘ BACKENDU o werdykt', async () => {
    zamontujFetch(WERDYKT_OK);
    render(<WalidacjaWytrzymalosciAparaturySekcja pola={POLA} />);

    await waitFor(() => {
      expect(screen.getByTestId('withstand-J01')).toBeInTheDocument();
    });

    expect(zapytania.map((z) => z.url)).toEqual([
      expect.stringContaining('/api/v1/catalog/audit2/device-withstand'),
      expect.stringContaining('/api/v1/catalog/audit2/validate-device-withstand'),
    ]);
    expect(zapytania[1].body).toEqual({
      device_id: 'wstd_breaker_vacuum_15_25',
      i_peak_calculated_ka: 50,
      i_thermal_calculated_ka: 20,
      t_clearing_s: 1.0,
    });
    // Kryteria spełnione na liczbach, dowód niepełny — etykieta rekordu W, nie własne „OK".
    expect(screen.getByTestId('withstand-J01')).toHaveAttribute('data-status', 'BRAK_DOWODU');
    expect(screen.getByTestId('withstand-etykieta-J01').textContent).toBe(
      WERDYKT_OK.wymaganie.etykieta.etykieta_pl,
    );
    expect(screen.getByTestId('withstand-J01').textContent).toContain(WERDYKT_OK.message_pl);
  });

  it('niespełnienie z backendu jest pokazywane etykietą rekordu (nie „ok")', async () => {
    const przekroczona = WYTRZYMALOSC.przekroczona;
    zamontujFetch(przekroczona);
    render(<WalidacjaWytrzymalosciAparaturySekcja pola={POLA} />);

    await waitFor(() => {
      expect(screen.getByTestId('withstand-J01')).toHaveAttribute('data-status', 'NIE_SPELNIA');
    });
    expect(screen.getByTestId('withstand-etykieta-J01').getAttribute('data-semantyka')).toBe(
      przekroczona.wymaganie.etykieta.semantyka,
    );
    expect(screen.getByTestId('withstand-J01').textContent).toContain(przekroczona.message_pl);
  });

  it('aparat SPOZA katalogu daje trzeci stan, nie werdykt negatywny', async () => {
    // Dokładnie ten stan zostawiał po sobie równoległy katalog frontu: referencja
    // zapisana w polu wskazywała donikąd. „Nie da się sprawdzić" i „nie wytrzymuje"
    // to dwie różne wiadomości dla projektanta — muszą być odróżnialne maszynowo.
    zamontujFetch(WERDYKT_OK);
    render(
      <WalidacjaWytrzymalosciAparaturySekcja
        pola={[{ ...POLA[0], deviceCatalogRef: 'wstd_typ_z_kosmosu' }]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('withstand-J01')).toHaveAttribute('data-status', 'brak-danych');
    });
    expect(screen.getByTestId('withstand-J01').textContent).toContain('nie występuje w katalogu');
    // Backend NIE jest pytany o werdykt dla aparatu, którego nie zna.
    expect(zapytania.filter((z) => z.url.includes('/validate-device-withstand'))).toHaveLength(0);
  });

  it('zanim odpowiedź przyjdzie — stan „sprawdzanie", żadnego werdyktu', async () => {
    let zwolnij: () => void = () => undefined;
    const brama = new Promise<void>((resolve) => {
      zwolnij = resolve;
    });
    zamontujFetch(WERDYKT_OK, brama);
    render(<WalidacjaWytrzymalosciAparaturySekcja pola={POLA} />);

    expect(screen.getByTestId('device-withstand-oczekiwanie')).toBeInTheDocument();
    expect(screen.queryByTestId('withstand-J01')).toBeNull();

    zwolnij();
    await waitFor(() => {
      expect(screen.getByTestId('withstand-J01')).toBeInTheDocument();
    });
  });

  it('błąd backendu daje NAZWANY brak podstawy, nigdy domyślnego „wytrzymała"', async () => {
    zamontujFetch('blad');
    render(<WalidacjaWytrzymalosciAparaturySekcja pola={POLA} />);

    await waitFor(() => {
      expect(screen.getByTestId('device-withstand-blad')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('withstand-J01')).toBeNull();
    expect(screen.getByTestId('device-withstand-blad').textContent).toContain(
      'Ocena pochodzi z backendu',
    );
  });

  it('brak pól z aparaturą — sekcja się nie pokazuje i nie pyta backendu', () => {
    zamontujFetch(WERDYKT_OK);
    const { container } = render(<WalidacjaWytrzymalosciAparaturySekcja pola={[]} />);

    expect(container.firstChild).toBeNull();
    expect(zapytania).toHaveLength(0);
  });
});
