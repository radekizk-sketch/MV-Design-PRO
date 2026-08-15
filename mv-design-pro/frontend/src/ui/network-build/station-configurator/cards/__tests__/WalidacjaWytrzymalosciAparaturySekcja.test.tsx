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

import { WalidacjaWytrzymalosciAparaturySekcja } from '../WalidacjaWytrzymalosciAparaturySekcja';

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
  odpowiedz: Record<string, unknown> | 'blad',
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

const WERDYKT_OK = {
  ok: true,
  i_dyn_ok: true,
  i_th_ok: true,
  message_pl: 'OK: aparatura „Wyłącznik próżniowy 15 kV” wytrzymała '
    + '(wykorzystanie I_dyn 79%, I_th 80%).',
  utilization_dyn_percent: 79.36507936507937,
  utilization_th_percent: 80,
};

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
    expect(screen.getByTestId('withstand-J01')).toHaveAttribute('data-withstand-ok', 'true');
    expect(screen.getByTestId('withstand-J01').textContent).toContain('wytrzymała');
  });

  it('BLOKER z backendu jest pokazywany jako brak zgodności (nie „ok")', async () => {
    zamontujFetch({
      ok: false,
      i_dyn_ok: false,
      i_th_ok: true,
      message_pl: 'BLOKER: I_dyn 70,0 kA > 63,0 kA (limit) — przekroczenie '
        + 'wytrzymałości dynamicznej.',
      utilization_dyn_percent: 111.11111111111111,
      utilization_th_percent: 80,
    });
    render(<WalidacjaWytrzymalosciAparaturySekcja pola={POLA} />);

    await waitFor(() => {
      expect(screen.getByTestId('withstand-J01')).toHaveAttribute('data-withstand-ok', 'false');
    });
    expect(screen.getByTestId('withstand-J01').textContent).toContain('BLOKER');
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
      expect(screen.getByTestId('withstand-J01')).toHaveAttribute(
        'data-withstand-ok',
        'nieustalone',
      );
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
      'Werdykt pochodzi z backendu',
    );
  });

  it('brak pól z aparaturą — sekcja się nie pokazuje i nie pyta backendu', () => {
    zamontujFetch(WERDYKT_OK);
    const { container } = render(<WalidacjaWytrzymalosciAparaturySekcja pola={[]} />);

    expect(container.firstChild).toBeNull();
    expect(zapytania).toHaveLength(0);
  });
});
