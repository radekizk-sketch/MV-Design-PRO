/**
 * Zgodność VT ze sposobem uziemienia — sekcja karty zabezpieczeń (V12K-257, karta
 * UX-04/POLE-ZU-SKLADOWA-ZEROWA).
 *
 * Testy pilnują tego, co było źródłem defektów: typy, SPOSÓB UZIEMIENIA i werdykt MUSZĄ
 * pochodzić z backendu. Front nie ma własnego katalogu przekładników, własnej kopii reguły
 * IEC 61869-3 ani własnego wyboru uziemienia — sposób uziemienia sieci SN pola czyta backend
 * z zespołu uziemiającego sekcji w modelu (`/_uziemienie-sn`), a sekcja przekazuje go
 * regule bez przeróbki. Iloczyn cech: uziemienie pola {ustalone, nieustalone z przyczyną}
 * × typ VT {w katalogu, spoza katalogu, bez F_v} × kontekst {jest, brak} × zmiana rewizji
 * modelu.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VtGroundingValidationResponse } from '../../../station-der/audit2-api';
import rekordyAudytu2 from '../../../station-der/__tests__/rekordyAudytu2.json';
import { WalidacjaVtPolaSekcja, type KontekstUziemieniaStacji } from '../WalidacjaVtPolaSekcja';

// Odpowiedzi końcówki z TEJ SAMEJ funkcji backendu (fixtura generowana, parytet pilnuje
// `test_fixtury_ocen_fe.py`) — rekord K, nie flaga `ok` (karta WERDYKT-MIGRACJA-190).
const VT = rekordyAudytu2.vt as unknown as Record<
  'spelnia' | 'nie_spelnia' | 'brak_wspolczynnika',
  VtGroundingValidationResponse
>;

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
  {
    id: 'vt_bez_wspolczynnika',
    name: 'VT bez współczynnika napięciowego',
    rated_voltage_factor: null,
    ratio_primary_v: 15000.0,
    ratio_secondary_v: 100.0,
  },
];

const KONTEKST: KontekstUziemieniaStacji = { projectId: 'proj-1', stationId: 'st-1', rewizja: 1 };

/** Uziemienie pól wg oznaczenia, jak zwraca backend (`typ` albo przyczyna braku). */
type UziemieniePol = Record<string, { typ: string | null; przyczyna?: string }>;

const originalFetch = global.fetch;
let zapytania: string[] = [];
let cialaReguly: Array<Record<string, unknown>> = [];

function zamontujFetch(
  werdykt: VtGroundingValidationResponse,
  uziemienie: UziemieniePol,
): void {
  zapytania = [];
  cialaReguly = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    zapytania.push(url);
    if (url.includes('/api/catalog/vt-types')) {
      return { ok: true, status: 200, json: async () => TYPY_VT } as Response;
    }
    if (url.endsWith('/audit2-station-config/st-1/_uziemienie-sn')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { pola?: string[] };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          station_id: 'st-1',
          sekcje: [],
          przyczyna_braku: null,
          pola: (body.pola ?? []).map((oznaczenie) => ({
            oznaczenie,
            typ_punktu_neutralnego: uziemienie[oznaczenie]?.typ ?? null,
            przyczyna_braku: uziemienie[oznaczenie]?.przyczyna ?? null,
          })),
        }),
      } as Response;
    }
    if (url.includes('/validate-vt-grounding')) {
      cialaReguly.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return { ok: true, status: 200, json: async () => werdykt } as Response;
    }
    throw new Error(`nieoczekiwane zapytanie: ${url}`);
  }) as unknown as typeof fetch;
}

describe('WalidacjaVtPolaSekcja — typy, uziemienie z modelu i werdykt z backendu', () => {
  beforeEach(() => zamontujFetch(VT.spelnia, {}));

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('uziemienie z MODELU trafia do REGUŁY backendu bez przeróbki', async () => {
    zamontujFetch(VT.spelnia, { J01: { typ: 'petersen_coil' } });
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J01', vtCatalogRef: 'vt_20kv_fz_100_3_05_3p_siemens' }]}
        kontekst={KONTEKST}
      />,
    );

    const wiersz = await screen.findByTestId('vt-validation-J01');
    expect(wiersz.getAttribute('data-status')).toBe('SPELNIA');
    expect(screen.getByTestId('vt-validation-etykieta-J01').textContent).toBe(
      VT.spelnia.ocena.etykieta.etykieta_pl,
    );
    expect(wiersz.textContent).toContain(VT.spelnia.message_pl);
    // Bez własnego „zgodny z siecią…" — tekst niesie rekord.
    expect(wiersz.textContent).not.toContain('zgodny z siecią');
    expect(wiersz.textContent).toContain('F_v = 1.9');
    expect(zapytania.some((u) => u.endsWith('/_uziemienie-sn'))).toBe(true);
    expect(cialaReguly).toEqual([{ voltage_factor: 1.9, grounding_type: 'petersen_coil' }]);
  });

  it('niezgodność pokazuje KOMUNIKAT BACKENDU, nie własną interpretację', async () => {
    zamontujFetch(VT.nie_spelnia, { J02: { typ: 'petersen_coil' } });
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J02', vtCatalogRef: 'vt_20kv_100v_05_arteche' }]}
        kontekst={KONTEKST}
      />,
    );

    const wiersz = await screen.findByTestId('vt-validation-J02');
    expect(wiersz.getAttribute('data-status')).toBe('NIE_SPELNIA');
    expect(screen.getByTestId('vt-validation-etykieta-J02').getAttribute('data-semantyka')).toBe(
      VT.nie_spelnia.ocena.etykieta.semantyka,
    );
    expect(wiersz.textContent).toContain(VT.nie_spelnia.message_pl);
  });

  it('pole bez ustalonego uziemienia w modelu: PRZYCZYNA backendu, reguła niewołana', async () => {
    zamontujFetch(
      VT.spelnia,
      {
        J06: {
          typ: null,
          przyczyna: 'Pola o oznaczeniu J06 leżą w sieciach SN o różnym uziemieniu.',
        },
      },
    );
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J06', vtCatalogRef: 'vt_20kv_fz_100_3_05_3p_siemens' }]}
        kontekst={KONTEKST}
      />,
    );

    const wiersz = await screen.findByTestId('vt-validation-J06');
    expect(wiersz.getAttribute('data-status')).toBe('brak-danych');
    expect(wiersz.textContent).toContain('różnym uziemieniu');
    expect(cialaReguly).toEqual([]);
  });

  it('typ spoza katalogu backendu jest nazwany BRAKIEM PODSTAWY, nie niezgodnością', async () => {
    // Dokładnie ten stan zostawiał po sobie równoległy katalog frontu: identyfikator
    // zapisany w modelu, którego backend nie zna.
    zamontujFetch(VT.spelnia, { J03: { typ: 'isolated' } });
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J03', vtCatalogRef: 'vt_20kv_dual' }]}
        kontekst={KONTEKST}
      />,
    );

    const wiersz = await screen.findByTestId('vt-validation-J03');
    expect(wiersz.getAttribute('data-status')).toBe('brak-danych');
    expect(wiersz.textContent).toContain('nie występuje w katalogu');
    expect(wiersz.textContent).toContain('nie da się sprawdzić');
    expect(cialaReguly).toEqual([]);
  });

  it('typ bez współczynnika napięciowego: backend zwraca rekord „ocena niewykonana"', async () => {
    zamontujFetch(VT.brak_wspolczynnika, { J07: { typ: 'resistor_grounded' } });
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J07', vtCatalogRef: 'vt_bez_wspolczynnika' }]}
        kontekst={KONTEKST}
      />,
    );

    const wiersz = await screen.findByTestId('vt-validation-J07');
    // Brak danej idzie do backendu jako `null` — rekord NIE_OCENIONO z nazwanym brakiem,
    // nigdy wartość domyślna (brak danych ≠ spełnia).
    expect(cialaReguly).toEqual([{ voltage_factor: null, grounding_type: 'resistor_grounded' }]);
    expect(wiersz.getAttribute('data-status')).toBe('NIE_OCENIONO');
    expect(wiersz.textContent).toContain(VT.brak_wspolczynnika.message_pl);
  });

  it('bez projektu albo stacji: nazwany stan zerowy, bez zapytań do backendu', () => {
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J04', vtCatalogRef: 'vt_20kv_fz_100_3_05_3p_siemens' }]}
        kontekst={null}
      />,
    );
    expect(screen.getByTestId('vt-walidacja-bez-projektu').textContent).toContain(
      'czytany jest z modelu projektu',
    );
    expect(screen.queryByTestId('vt-validation-J04')).toBeNull();
    expect(zapytania).toEqual([]);
  });

  it('bez pola z przekładnikiem sekcja nie powstaje i nie pyta backendu', () => {
    const { container } = render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J08', vtCatalogRef: null }]}
        kontekst={KONTEKST}
      />,
    );
    expect(container.textContent).toBe('');
    expect(zapytania).toEqual([]);
  });

  it('zmiana rewizji modelu (np. nowy zespół uziemiający) = ponowne sprawdzenie z modelu', async () => {
    zamontujFetch(VT.spelnia, { J09: { typ: 'isolated' } });
    const pola = [{ bayDesignation: 'J09', vtCatalogRef: 'vt_20kv_fz_100_3_05_3p_siemens' }];
    const { rerender } = render(<WalidacjaVtPolaSekcja pola={pola} kontekst={KONTEKST} />);
    await waitFor(() => expect(cialaReguly).toHaveLength(1));
    expect(cialaReguly[0]?.grounding_type).toBe('isolated');

    zamontujFetch(VT.spelnia, { J09: { typ: 'resistor_grounded' } });
    rerender(<WalidacjaVtPolaSekcja pola={pola} kontekst={{ ...KONTEKST, rewizja: 2 }} />);
    await waitFor(() => expect(cialaReguly).toHaveLength(1));
    expect(cialaReguly[0]?.grounding_type).toBe('resistor_grounded');
  });

  it('błąd pobrania jest POKAZANY, a nie zamieniony w milczącą zgodność', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('katalog niedostępny');
    }) as unknown as typeof fetch;
    render(
      <WalidacjaVtPolaSekcja
        pola={[{ bayDesignation: 'J05', vtCatalogRef: 'vt_20kv_fz_100_3_05_3p_siemens' }]}
        kontekst={KONTEKST}
      />,
    );
    const blad = await screen.findByTestId('vt-walidacja-blad');
    expect(blad.textContent).toContain('katalog niedostępny');
    expect(screen.queryByTestId('vt-validation-J05')).toBeNull();
  });
});
