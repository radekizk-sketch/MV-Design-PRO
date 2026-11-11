/**
 * Katalogi karty technicznej K6 (`katalogiKarty.ts`) — odporność na odpowiedź spoza kontraktu.
 *
 * Bieg `vitest related` (2026-11) pokazał 15 nieobsłużonych odrzuceń w teście integracji
 * powłoki: atrapa `fetch` zwracała obiekt zamiast listy, a budowa katalogów wołała `.map` na
 * obiekcie — wyjątek w obietnicy, której nikt nie obsługiwał. Ta sama ścieżka w produkcji to
 * strona błędu serwera albo zmiana kontraktu. Iloczyn cech: kształt odpowiedzi {lista, obiekt
 * zamiast listy, odrzucenie, wyjątek synchroniczny} × bufor modułu (pełny komplet → bufor;
 * którykolwiek katalog niedostępny → ponowienie przy następnym zamontowaniu).
 */

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Zachowanie = 'lista' | 'obiekt' | 'odrzucenie' | 'wyjatek';

const stan = vi.hoisted(() => ({
  zachowanie: 'lista' as 'lista' | 'obiekt' | 'odrzucenie' | 'wyjatek',
  wywolania: 0,
}));

function odpowiedz<T>(lista: T[]): Promise<T[]> {
  stan.wywolania += 1;
  switch (stan.zachowanie) {
    case 'lista':
      return Promise.resolve(lista);
    case 'obiekt':
      return Promise.resolve({ detail: 'Internal Server Error' } as unknown as T[]);
    case 'odrzucenie':
      return Promise.reject(new Error('HTTP 500'));
    case 'wyjatek':
      throw new Error('synchroniczny wyjątek klienta');
  }
}

vi.mock('../../../catalog/api', () => ({
  fetchMvApparatusTypes: () => odpowiedz([{ id: 'vd4', name: 'VD4 24 kV' }]),
  fetchTransformerTypes: () => odpowiedz([{ id: 'tr-630', name: 'TNOSCT 630 kVA' }]),
  fetchDerConverterTypes: () => odpowiedz([{ id: 'conv-1', name: 'SUN2000', manufacturer: 'Huawei' }]),
  fetchSourceSystemTypes: () => odpowiedz([{ id: 'siec-1', name: 'Sieć 110 kV' }]),
  fetchSwitchgearFamilies: () => odpowiedz([{ switchgear_family_ref: 'rod-1', family_name: 'Rodzina A' }]),
  fetchCompleteBayTemplates: () => odpowiedz([]),
  // Dziesiąty katalog karty (szablony kanoniczne rejestru wzorców pól, strona pola liniowego):
  // brak atrapy dawał odrzucenie, katalog niekompletny i brak bufora drugiego zamontowania.
  fetchSzablonyPolaKanoniczne: () =>
    odpowiedz([{ template_ref: 'szablon-z10', template_name_pl: 'Pole liniowe kablowe' }]),
}));
vi.mock('../../station-der/audit2-api', () => ({
  fetchAudit2CatalogSnapshot: () =>
    odpowiedz([]).then((l) => (Array.isArray(l) ? { pf_curves: [{ id: 'pf-1', label_pl: 'P(f) PSE' }] } : l)),
}));
vi.mock('../../station-der/derRemoteCatalogs', () => ({
  fetchNcRfgOperators: () => odpowiedz([]),
  fetchDerDynamicProfiles: () => odpowiedz([]),
}));

async function zamontuj() {
  const { useKatalogiKarty } = await import('../katalogiKarty');
  return renderHook(() => useKatalogiKarty());
}

beforeEach(() => {
  vi.resetModules();
  stan.wywolania = 0;
});

afterEach(() => {
  cleanup();
});

describe('katalogi karty K6 — odpowiedź spoza kontraktu', () => {
  it('komplet list: katalogi zbudowane i buforowane (drugie zamontowanie bez pobierania)', async () => {
    stan.zachowanie = 'lista';
    const pierwszy = await zamontuj();
    await waitFor(() => expect(pierwszy.result.current.aparatySn.get('vd4')?.name).toBe('VD4 24 kV'));
    expect(pierwszy.result.current.przeksztaltniki.get('conv-1')).toEqual({ name: 'SUN2000', manufacturer: 'Huawei' });
    expect(pierwszy.result.current.krzywePf.get('pf-1')).toBe('P(f) PSE');
    expect(pierwszy.result.current.szablonyKanoniczne.get('szablon-z10')).toBe('Pole liniowe kablowe');
    const poPierwszym = stan.wywolania;
    pierwszy.unmount();
    const drugi = await (async () => {
      const { useKatalogiKarty } = await import('../katalogiKarty');
      return renderHook(() => useKatalogiKarty());
    })();
    expect(drugi.result.current.aparatySn.get('vd4')?.name).toBe('VD4 24 kV');
    expect(stan.wywolania).toBe(poPierwszym);
  });

  it.each<Zachowanie>(['obiekt', 'odrzucenie', 'wyjatek'])(
    'odpowiedź „%s”: bez nieobsłużonego odrzucenia, puste katalogi, ponowienie przy kolejnym zamontowaniu',
    async (zachowanie) => {
      stan.zachowanie = zachowanie;
      const odrzucenia: unknown[] = [];
      const lapacz = (powod: unknown) => odrzucenia.push(powod);
      process.on('unhandledRejection', lapacz);
      try {
        const pierwszy = await zamontuj();
        await waitFor(() => expect(stan.wywolania).toBe(10));
        await new Promise((r) => setTimeout(r, 0));
        expect(pierwszy.result.current.aparatySn.size).toBe(0);
        expect(pierwszy.result.current.krzywePf.size).toBe(0);
        expect(pierwszy.result.current.szablonyPol).toEqual([]);
        pierwszy.unmount();

        // Katalog niedostępny nie jest buforowany: kolejne zamontowanie (ten sam moduł) pobiera
        // ponownie i — gdy serwer już odpowiada listą — pokazuje pozycje.
        stan.zachowanie = 'lista';
        const { useKatalogiKarty } = await import('../katalogiKarty');
        const drugi = renderHook(() => useKatalogiKarty());
        await waitFor(() => expect(drugi.result.current.aparatySn.get('vd4')?.name).toBe('VD4 24 kV'));
        expect(stan.wywolania).toBe(20);
        expect(odrzucenia).toEqual([]);
      } finally {
        process.off('unhandledRejection', lapacz);
      }
    },
  );
});
