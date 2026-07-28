/**
 * Zgodność VT ze sposobem uziemienia — sekcja karty zabezpieczeń (V12K-257).
 *
 * Testy pilnują tego, co było źródłem defektu: typy i werdykt MUSZĄ pochodzić
 * z backendu. Front nie ma już własnego katalogu przekładników napięciowych ani
 * własnej kopii reguły IEC 61869-3 — a gdyby wróciły, werdykt na ekranie mógłby
 * przeczyć werdyktowi w pakiecie dowodowym (rozjazd naprawiony w V12K-256).
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WalidacjaVtPolaSekcja } from '../WalidacjaVtPolaSekcja';

const TYPY_VT = [
  {
    id: 'vt_20kv_fz_100_3_05_3p_siemens',
    name: 'VT 20 kV/√3 / 100/√3 + 100/3 V kl. 0,5/3P',
    rated_voltage_factor: 1.9,
    ratio_primary_v: 11547.0,
    ratio_secondary_v: 57.7,
  },
  {
    id: 'vt_20kv_100v_05_arteche',
    name: 'VT 20 kV / 100 V kl. 0.5',
    rated_voltage_factor: 1.2,
    ratio_primary_v: 20000.0,
    ratio_secondary_v: 100.0,
  },
];

const originalFetch = global.fetch;
let zapytania: string[] = [];

function zamontujFetch(werdykt: { ok: boolean; message_pl: string }): void {
  zapytania = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    zapytania.push(url);
    if (url.includes('/api/catalog/vt-types')) {
      return { ok: true, status: 200, json: async () => TYPY_VT } as Response;
    }
    if (url.includes('/validate-vt-grounding')) {
      return { ok: true, status: 200, json: async () => werdykt } as Response;
    }
    throw new Error(`nieoczekiwane zapytanie: ${url}`);
  }) as unknown as typeof fetch;
}

describe('WalidacjaVtPolaSekcja — typy i werdykt z backendu', () => {
  beforeEach(() => zamontujFetch({ ok: true, message_pl: '' }));

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('pyta KATALOG BACKENDU o typy i REGUŁĘ BACKENDU o werdykt', async () => {
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J01', vtCatalogRef: 'vt_20kv_fz_100_3_05_3p_siemens' }]}
        typUziemienia="petersen_coil"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('vt-validation-J01')).toBeTruthy());
    expect(zapytania.some((u) => u.includes('/api/catalog/vt-types'))).toBe(true);
    expect(zapytania.some((u) => u.includes('/validate-vt-grounding'))).toBe(true);
    expect(screen.getByTestId('vt-validation-J01').textContent).toContain('F_v = 1.9');
  });

  it('niezgodność pokazuje KOMUNIKAT BACKENDU, nie własną interpretację', async () => {
    zamontujFetch({
      ok: false,
      message_pl: 'Siec skompensowana (Petersena) wymaga VT (faza-ziemia) z U_th >= 1.9.',
    });
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J02', vtCatalogRef: 'vt_20kv_100v_05_arteche' }]}
        typUziemienia="petersen_coil"
      />,
    );

    const wiersz = await screen.findByTestId('vt-validation-J02');
    expect(wiersz.textContent).toContain('wymaga VT (faza-ziemia) z U_th >= 1.9');
  });

  it('typ spoza katalogu backendu jest nazwany BRAKIEM PODSTAWY, nie niezgodnością', async () => {
    // Dokładnie ten stan zostawiał po sobie równoległy katalog frontu: identyfikator
    // zapisany w modelu, którego backend nie zna.
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J03', vtCatalogRef: 'vt_20kv_dual' }]}
        typUziemienia="isolated"
      />,
    );

    const wiersz = await screen.findByTestId('vt-validation-J03');
    expect(wiersz.textContent).toContain('nie występuje w katalogu');
    expect(wiersz.textContent).toContain('nie da się sprawdzić');
    // Reguła NIE jest wołana dla typu, którego nie ma — nie ma czego jej podać.
    expect(zapytania.some((u) => u.includes('/validate-vt-grounding'))).toBe(false);
  });

  it('bez znanego sposobu uziemienia sekcja nie powstaje i nie pyta backendu', () => {
    const { container } = render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J04', vtCatalogRef: 'vt_20kv_fz_100_3_05_3p_siemens' }]}
      />,
    );
    expect(container.textContent).toBe('');
    expect(zapytania).toEqual([]);
  });

  it('błąd pobrania jest POKAZANY, a nie zamieniony w milczącą zgodność', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('katalog niedostępny');
    }) as unknown as typeof fetch;
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J05', vtCatalogRef: 'vt_20kv_fz_100_3_05_3p_siemens' }]}
        typUziemienia="isolated"
      />,
    );
    const blad = await screen.findByTestId('vt-walidacja-blad');
    expect(blad.textContent).toContain('katalog niedostępny');
    expect(screen.queryByTestId('vt-validation-J05')).toBeNull();
  });
});
