/*
 * Testy klienta certyfikatu zgodności NC RfG (`ui2/oze/api`, karta P39c):
 * poprawne końcówki POST, zwrot widoku JSON / bloba DOCX oraz uczciwa obsługa
 * błędów PL — w tym bramka kompletności 422 z listą braków. `fetch` mockowany.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CertyfikatBrakiError,
  pobierzCertyfikat,
  pobierzCertyfikatDocx,
  type ZadanieCertyfikatu,
} from '../api';
import { certyfikatFixture } from '../macierz/__tests__/fixtures';

const ZADANIE: ZadanieCertyfikatu = {
  run_request: {
    modules: [
      {
        der_ref: 'pv-1',
        der_kind: 'PV',
        module_family: 'PPM',
        operator_id: 'enea',
        p_max_kw: 500,
        voltage_kv: 0.4,
        certificate_status: 'none',
        has_lvrt_curve: true,
        has_hvrt_curve: true,
        has_pf_droop: true,
        has_qu_curve: false,
        has_dynamic_model: false,
        has_scada_communication: false,
        has_disturbance_recorder: false,
        active_power_control_enabled: true,
        stop_generation_enabled: true,
        reduction_generation_enabled: true,
        island_operation_required: false,
        island_operation_capable: false,
        black_start_required: false,
        black_start_capable: false,
        power_oscillation_damping_required: false,
        power_oscillation_damping_enabled: false,
      },
    ],
    procedure_version: 'PTPiREE Procedura testowania v3.0',
  },
  nazwa_projektu: 'Sieć testowa',
  nazwa_przypadku: 'Wariant bazowy',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pobierzCertyfikat — widok JSON', () => {
  it('POST na compliance-certificate z pełnym żądaniem i zwraca widok', async () => {
    const fn = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve(certyfikatFixture()),
      }),
    );
    vi.stubGlobal('fetch', fn);

    const widok = await pobierzCertyfikat(ZADANIE);

    const [url, opcje] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/oze-analysis/compliance-certificate');
    expect(opcje.method).toBe('POST');
    expect(JSON.parse(opcje.body as string)).toEqual(ZADANIE);
    expect(widok.werdykt_zbiorczy.liczba_modulow).toBe(2);
    expect(widok.moduly).toHaveLength(2);
  });

  it('422 z detalem obiektowym → CertyfikatBrakiError z listą braków PL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 422,
          statusText: 'Unprocessable Entity',
          json: () =>
            Promise.resolve({
              detail: {
                komunikat: 'Certyfikat nie może powstać — dane zgodności niekompletne.',
                braki: ['Moduł „PV Dach A”: test FRT_LVRT — brak danych do oceny.'],
              },
            }),
        }),
      ),
    );

    await expect(pobierzCertyfikat(ZADANIE)).rejects.toBeInstanceOf(CertyfikatBrakiError);
    try {
      await pobierzCertyfikat(ZADANIE);
    } catch (err) {
      expect(err).toBeInstanceOf(CertyfikatBrakiError);
      expect((err as CertyfikatBrakiError).braki).toEqual([
        'Moduł „PV Dach A”: test FRT_LVRT — brak danych do oceny.',
      ]);
    }
  });

  it('404 z detalem tekstowym → zwykły błąd z komunikatem PL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: () => Promise.resolve({ detail: 'Nieznany profil operatora sieci.' }),
        }),
      ),
    );

    await expect(pobierzCertyfikat(ZADANIE)).rejects.toThrow('Nieznany profil operatora sieci.');
  });
});

describe('pobierzCertyfikatDocx — plik DOCX (blob)', () => {
  it('POST na compliance-certificate.docx i zwraca blob', async () => {
    const blob = new Blob(['docx'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const fn = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, statusText: 'OK', blob: () => Promise.resolve(blob) }),
    );
    vi.stubGlobal('fetch', fn);

    const wynik = await pobierzCertyfikatDocx(ZADANIE);

    expect(fn.mock.calls[0][0]).toBe('/api/oze-analysis/compliance-certificate.docx');
    expect(wynik).toBeInstanceOf(Blob);
  });

  it('422 braki → CertyfikatBrakiError także dla eksportu DOCX', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 422,
          statusText: 'Unprocessable Entity',
          json: () =>
            Promise.resolve({
              detail: { komunikat: 'Braki kompletności.', braki: ['Moduł „X”: brak testów wymaganych.'] },
            }),
        }),
      ),
    );

    await expect(pobierzCertyfikatDocx(ZADANIE)).rejects.toBeInstanceOf(CertyfikatBrakiError);
  });
});
