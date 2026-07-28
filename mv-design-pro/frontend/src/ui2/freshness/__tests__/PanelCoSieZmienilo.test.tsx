/**
 * „Co się zmieniło od tego wyniku" (V12K-264) — ostatnie ogniwo łańcucha.
 *
 * Testy pilnują tego, co było długiem: znacznik świeżości pokazywał wyłącznie parę
 * rewizji („rew. 4 → 7"), a przyczyna była STAŁĄ `'model-zmieniony'`. Projektant
 * dostawał informację, że wynik jest nieaktualny, i nic o tym, CO go unieważniło.
 *
 * Trzy kierunki błędu, których żaden test nie może przepuścić:
 *  1. awaria końcówki NIE MOŻE wyglądać jak „nic się nie zmieniło",
 *  2. rozjazd rewizji bez wpisów NIE MOŻE być przemilczany,
 *  3. odpowiedź o nieoczekiwanym kształcie NIE MOŻE być renderowana jak dana.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PanelCoSieZmienilo } from '../PanelCoSieZmienilo';

const ODPOWIEDZ = {
  case_id: 'case-1',
  rewizja_biezaca: 7,
  od_rewizji: 4,
  aktualny: false,
  wpisy: [
    {
      rewizja: 5,
      znacznik_czasu: '2026-07-28T09:15:22+00:00',
      operacja: 'continue_trunk_segment_sn',
      opis_pl: 'Kontynuacja segmentu magistrali SN',
      utworzone: ['lin/gpz_s02', 'stacja_s02/bus_sn'],
      zmienione: [],
      usuniete: [],
      liczba_elementow: 2,
    },
    {
      rewizja: 7,
      znacznik_czasu: '2026-07-28T09:41:03+00:00',
      operacja: 'set_normal_open_point',
      opis_pl: 'Ustawienie punktu normalnie otwartego (NOP)',
      utworzone: [],
      zmienione: ['lin/s02_s03'],
      usuniete: ['lin/stara'],
      liczba_elementow: 2,
    },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

function zamontujFetch(body: unknown, ok = true): void {
  fetchMock = vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body }));
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => zamontujFetch(ODPOWIEDZ));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PanelCoSieZmienilo — przyczyna unieważnienia, nie sama para rewizji', () => {
  it('pyta backend o zmiany PO rewizji wyniku', async () => {
    render(<PanelCoSieZmienilo caseId="case-1" rewizjaDanych={4} />);
    await screen.findByTestId('mvd-co-sie-zmienilo');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/cases/case-1/enm/dziennik-zmian');
    expect(url).toContain('od_rewizji=4');
  });

  it('pokazuje OPIS operacji z kanonu, nie identyfikator', async () => {
    render(<PanelCoSieZmienilo caseId="case-1" rewizjaDanych={4} />);

    const wpis = await screen.findByTestId('mvd-zmiana-5');
    expect(wpis.textContent).toContain('Kontynuacja segmentu magistrali SN');
    // Nazwa techniczna operacji nie trafia na ekran — projektant czyta po polsku.
    expect(wpis.textContent).not.toContain('continue_trunk_segment_sn');
  });

  it('podsumowanie liczy zmiany i dotknięte elementy', async () => {
    render(<PanelCoSieZmienilo caseId="case-1" rewizjaDanych={4} />);
    const p = await screen.findByTestId('mvd-zmiany-podsumowanie');
    expect(p.textContent).toContain('2 zmiany');
    expect(p.textContent).toContain('4 elementy');
  });

  it('klik w element prowadzi DO NIEGO — ostatnie ogniwo drogi od werdyktu', async () => {
    const pokaz = vi.fn();
    const user = userEvent.setup();
    render(
      <PanelCoSieZmienilo caseId="case-1" rewizjaDanych={4} onPokazElement={pokaz} />,
    );

    await user.click(await screen.findByTestId('mvd-zmiana-element-lin/gpz_s02'));
    expect(pokaz).toHaveBeenCalledWith('lin/gpz_s02');
  });

  it('element USUNIĘTY nie jest klikalny — nie ma dokąd prowadzić', async () => {
    render(
      <PanelCoSieZmienilo caseId="case-1" rewizjaDanych={4} onPokazElement={vi.fn()} />,
    );
    await screen.findByTestId('mvd-co-sie-zmienilo');

    // Element usunięty jest WIDOCZNY (to część przyczyny), ale bez przycisku —
    // przycisk prowadzący do nieistniejącego elementu byłby martwym klikiem.
    expect(screen.getByText('lin/stara')).toBeTruthy();
    expect(screen.queryByTestId('mvd-zmiana-element-lin/stara')).toBeNull();
  });
});

describe('PanelCoSieZmienilo — kierunek awarii po bezpiecznej stronie', () => {
  it('awaria końcówki jest NAZWANA, nie zamieniona w „bez zmian"', async () => {
    zamontujFetch({ detail: 'brak' }, false);
    render(<PanelCoSieZmienilo caseId="case-1" rewizjaDanych={4} />);

    const blad = await screen.findByTestId('mvd-zmiany-blad');
    expect(blad.textContent).toContain('Nie udało się pobrać dziennika');
    expect(screen.queryByTestId('mvd-zmiany-brak-przyczyn')).toBeNull();
  });

  it('odpowiedź o nieoczekiwanym kształcie nie jest renderowana jak dana', async () => {
    zamontujFetch({ wpisy: [{ rewizja: 'pięć' }], rewizja_biezaca: 7, aktualny: false });
    render(<PanelCoSieZmienilo caseId="case-1" rewizjaDanych={4} />);

    const blad = await screen.findByTestId('mvd-zmiany-blad');
    expect(blad.textContent).toContain('nieoczekiwany kształt');
  });

  it('rozjazd rewizji BEZ wpisów jest powiedziany wprost', async () => {
    zamontujFetch({
      case_id: 'case-1',
      rewizja_biezaca: 9,
      od_rewizji: 4,
      aktualny: false,
      wpisy: [],
    });
    render(<PanelCoSieZmienilo caseId="case-1" rewizjaDanych={4} />);

    const info = await screen.findByTestId('mvd-zmiany-brak-przyczyn');
    // Milczenie sugerowałoby, że wynik jest aktualny — a nie jest.
    expect(info.textContent).toContain('rewizji 9');
    expect(info.textContent).toContain('dziennik nie zawiera przyczyn');
  });

  it('brak zmian mówi to wprost', async () => {
    zamontujFetch({
      case_id: 'case-1',
      rewizja_biezaca: 4,
      od_rewizji: 4,
      aktualny: true,
      wpisy: [],
    });
    render(<PanelCoSieZmienilo caseId="case-1" rewizjaDanych={4} />);

    await waitFor(() =>
      expect(screen.getByTestId('mvd-zmiany-brak-przyczyn').textContent).toContain(
        'nie zmienił się',
      ),
    );
  });
});
