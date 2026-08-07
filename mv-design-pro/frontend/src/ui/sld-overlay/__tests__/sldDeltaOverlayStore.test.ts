/**
 * NAKŁADKA RÓŻNIC A/B — klient i store.
 *
 * DŁUG, KTÓRY TE TESTY ZAMYKAJĄ (klasa „klient bez dostawcy"): poprzedni klient
 * wołał trasę, której żaden router nie serwuje, a testy tego nie widziały, bo
 * mockowały klienta i nigdy nie sprawdzały ADRESU. Dlatego tutaj mockowany jest
 * `fetch` (granica sieci), a nie własny moduł — asercja na URL jest jedynym
 * miejscem, w którym rozjazd „klient ↔ dostawca" może zostać złapany po stronie
 * frontu.
 *
 * Pokrycie: adres i metoda · kształt odpowiedzi (odrzucenie obcego) · droga
 * błędu (bez pozostawiania połowicznego stanu) · wyjście z trybu różnic ·
 * postać payloadu dla warstwy etykiet.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pobierzNakladkeRoznic, type NakladkaRoznic } from '../sldDeltaOverlay.api';
import { payloadEtykietRoznic, useSldDeltaOverlayStore } from '../sldDeltaOverlayStore';

const NAKLADKA: NakladkaRoznic = {
  run_id_a: 'run-a',
  run_id_b: 'run-b',
  analysis_type: 'DELTA_SC',
  report_version: '1.3.0',
  elements: {
    'bus-1': {
      ref_id: 'bus-1',
      kind: 'bus',
      badges: [],
      severity: 'WARNING',
      metrics: {
        DELTA_IK_3F_KA: {
          code: 'DELTA_IK_3F_KA',
          value: 2,
          unit: 'kA',
          format_hint: 'fixed2',
          source: 'solver',
        },
      },
    },
  },
  legend: {
    title: 'Legenda roznic A/B',
    entries: [
      { severity: 'INFO', label: 'Bez zmian', description: 'Wartości identyczne' },
      { severity: 'WARNING', label: 'Zmiana', description: 'Wartości różne' },
    ],
  },
  content_hash: 'a'.repeat(64),
  liczba_punktow_zmienionych: 1,
  liczba_punktow_bez_zmian: 0,
  liczba_punktow_bez_odpowiednika: 0,
  liczba_punktow_bez_danych: 0,
};

function odpowiedz(dane: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => dane,
  } as unknown as Response;
}

beforeEach(() => {
  useSldDeltaOverlayStore.setState({ nakladka: null, wTrakcie: false, blad: null });
  vi.restoreAllMocks();
});

describe('Klient nakładki różnic', () => {
  it('woła trasę, którą backend REALNIE serwuje (metoda POST, para przebiegów)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(odpowiedz(NAKLADKA));
    vi.stubGlobal('fetch', mockFetch);

    await pobierzNakladkeRoznic('run-a', 'run-b');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/short-circuit-comparisons/sld-overlay');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ run_id_a: 'run-a', run_id_b: 'run-b' });
  });

  it('odrzuca odpowiedź o obcym kształcie zamiast wpuszczać ją dalej', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedz({ cokolwiek: true })));
    await expect(pobierzNakladkeRoznic('run-a', 'run-b')).rejects.toThrow(/kształt/);
  });

  it('błąd HTTP niesie status w komunikacie', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedz(null, false, 404)));
    await expect(pobierzNakladkeRoznic('run-a', 'run-b')).rejects.toThrow(/404/);
  });
});

describe('Store nakładki różnic', () => {
  it('zaczyna bez nakładki (tryb różnic wyłączony)', () => {
    const stan = useSldDeltaOverlayStore.getState();
    expect(stan.nakladka).toBeNull();
    expect(stan.wTrakcie).toBe(false);
    expect(stan.blad).toBeNull();
  });

  it('wczytuje różnice pary przebiegów', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedz(NAKLADKA)));

    await useSldDeltaOverlayStore.getState().wczytajRoznice('run-a', 'run-b');

    const stan = useSldDeltaOverlayStore.getState();
    expect(stan.nakladka?.run_id_a).toBe('run-a');
    expect(stan.nakladka?.run_id_b).toBe('run-b');
    expect(stan.wTrakcie).toBe(false);
    expect(stan.blad).toBeNull();
  });

  it('błąd pobrania NIE zostawia połowicznej nakładki', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedz(null, false, 500)));

    await useSldDeltaOverlayStore.getState().wczytajRoznice('run-a', 'run-b');

    const stan = useSldDeltaOverlayStore.getState();
    expect(stan.nakladka).toBeNull();
    expect(stan.wTrakcie).toBe(false);
    expect(stan.blad).toMatch(/500/);
  });

  it('ponowne wczytanie po błędzie czyści komunikat', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedz(null, false, 500)));
    await useSldDeltaOverlayStore.getState().wczytajRoznice('run-a', 'run-b');
    expect(useSldDeltaOverlayStore.getState().blad).not.toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedz(NAKLADKA)));
    await useSldDeltaOverlayStore.getState().wczytajRoznice('run-a', 'run-b');

    expect(useSldDeltaOverlayStore.getState().blad).toBeNull();
    expect(useSldDeltaOverlayStore.getState().nakladka).not.toBeNull();
  });

  it('wyjście z trybu różnic zeruje stan', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(odpowiedz(NAKLADKA)));
    await useSldDeltaOverlayStore.getState().wczytajRoznice('run-a', 'run-b');

    useSldDeltaOverlayStore.getState().wyczyscRoznice();

    expect(useSldDeltaOverlayStore.getState().nakladka).toBeNull();
    expect(useSldDeltaOverlayStore.getState().blad).toBeNull();
  });
});

describe('Payload różnic dla warstwy etykiet', () => {
  it('brak nakładki ⇒ brak payloadu (warstwa wraca do wyniku przebiegu)', () => {
    expect(payloadEtykietRoznic(null)).toBeNull();
  });

  it('wiąże nakładkę z przebiegiem porównywanym i zachowuje elementy 1:1', () => {
    const payload = payloadEtykietRoznic(NAKLADKA);
    expect(payload?.run_id).toBe('run-b');
    expect(payload?.analysis_type).toBe('DELTA_SC');
    expect(payload?.elements).toBe(NAKLADKA.elements);
  });

  it('nakładka nie niesie kolorów — wyłącznie wagi i wartości z backendu', () => {
    expect(/#[0-9a-fA-F]{3,8}/.test(JSON.stringify(NAKLADKA))).toBe(false);
  });
});
