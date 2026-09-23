/**
 * Towarzysze werdyktu na ekranie „Jakość wyników" (karta AB-1a-bis).
 *
 * Werdykty walidacji energetycznej, warunków przyłączenia i wytrzymałości cieplnej
 * niosą z backendu pięciu towarzyszy (wartość, wymaganie, zapas, podstawa, dowód).
 * Test sprawdza, że projektant WIDZI zapas (dodatni = w granicy, liczony w
 * backendzie) i podstawę z odznaką statusu źródła — po NATYWNYM kliknięciu
 * wiersza (`userEvent`, nie syntetyczny `dispatchEvent`), przy mocku GLOBALNEGO
 * `fetch` (realna ścieżka: adres końcówki → parsowanie → adapter → render).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SekcjaWalidacji, SekcjaWytrzymaloscCieplna } from '../EkranJakosci';
import type { DowodCieplnyResponse } from '../api';
import {
  CIEPLNA_FIXTURE,
  PODSTAWA_CIEPLNA,
  WALIDACJA_FIXTURE,
  przebiegTestowy,
} from './fixtures';

const fetchMock = vi.fn();

function odpowiedzOk(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Walidacja energetyczna — towarzysze werdyktu w szczególe pozycji', () => {
  function renderWalidacji() {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).includes('/api/quality/energy-validation')
          ? odpowiedzOk(WALIDACJA_FIXTURE)
          : ({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) } as Response),
      ),
    );
    return render(
      <SekcjaWalidacji
        przebieg={przebiegTestowy('pf-1', 'LOAD_FLOW')}
        trybZaawansowania="basic"
        onOtworzDowod={vi.fn()}
      />,
    );
  }

  it('naruszenie: zapas ujemny w pkt proc. i podstawa PN-EN 50160 ze źródłem niezweryfikowanym', async () => {
    const user = userEvent.setup();
    renderWalidacji();
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    await user.click(screen.getByText('Odchylenie napięcia').closest('tr')!);

    const szczegol = screen.getByTestId('mvd-jakosc-walidacja-szczegol');
    // Zapas z backendu (`margines` = −2: 12 % wobec progu 10 %) — UI nie odejmuje.
    expect(within(szczegol).getByTestId('mvd-jakosc-walidacja-margines').textContent).toBe(
      '-2,0 pkt proc.',
    );
    const podstawa = within(szczegol).getByTestId('mvd-jakosc-walidacja-podstawa');
    expect(podstawa.textContent).toContain('PN-EN 50160');
    expect(within(szczegol).getByTestId('mvd-jakosc-walidacja-podstawa-zrodlo').textContent).toBe(
      'źródło niezweryfikowane',
    );
  });

  it('pozycja w granicy: zapas dodatni (konwencja wyniku wyjaśnialnego, nie `margin_pct`)', async () => {
    const user = userEvent.setup();
    renderWalidacji();
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    await user.click(screen.getByText('Linia 1').closest('tr')!);

    const szczegol = screen.getByTestId('mvd-jakosc-walidacja-szczegol');
    expect(within(szczegol).getByTestId('mvd-jakosc-walidacja-margines').textContent).toBe(
      '35,0 pkt proc.',
    );
    // Podstawa progu obciążenia: brak dokumentu normowego nazwanego wprost.
    expect(within(szczegol).getByTestId('mvd-jakosc-walidacja-podstawa-uwaga').textContent).toContain(
      'dokument normowy progu nie jest wskazany w kodzie',
    );
  });

  it('brak danej: zapas to kreska, nie wartość zastępcza', async () => {
    const user = userEvent.setup();
    renderWalidacji();
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-walidacja')).toBeTruthy());
    await user.click(screen.getByText('Węzeł bilansujący').closest('tr')!);

    const szczegol = screen.getByTestId('mvd-jakosc-walidacja-szczegol');
    expect(within(szczegol).getByTestId('mvd-jakosc-walidacja-margines').textContent).toBe('—');
    expect(within(szczegol).getByTestId('mvd-jakosc-walidacja-podstawa')).toBeTruthy();
  });
});

describe('Wytrzymałość cieplna — podstawa z punktem normy i zapas kryteriów cząstkowych', () => {
  const dowod: DowodCieplnyResponse = {
    run_id: 'sc-1',
    branch_id: 'cable_A',
    branch_name: 'Magistrala L-01',
    status: 'PASS',
    kroki: [],
    wartosc: 56250000,
    odniesienie: 127238400,
    margines: 55.8,
    margines_jednostka: '%',
    podstawa: PODSTAWA_CIEPLNA,
  };

  it('po kliknięciu gałęzi panel dowodu pokazuje podstawę i zapas każdego kryterium', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(odpowiedzOk(String(url).includes('/proof') ? dowod : CIEPLNA_FIXTURE)),
    );
    render(
      <SekcjaWytrzymaloscCieplna
        przebieg={przebiegTestowy('sc-1', 'SC_3F')}
        trybZaawansowania="basic"
        onOtworzDowod={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('mvd-jakosc-cieplna')).toBeTruthy());
    await user.click(screen.getByText('Magistrala L-01'));

    const podstawa = await screen.findByTestId('mvd-jakosc-cieplna-podstawa');
    expect(podstawa.textContent).toContain('PN-HD 60364-4-43 · klauzula § 434.5.2');
    expect(screen.getByTestId('mvd-jakosc-cieplna-podstawa-zrodlo').textContent).toBe(
      'źródło niezweryfikowane',
    );
    expect(screen.getByTestId('mvd-jakosc-cieplna-margines').textContent).toBe('55,80 %');
    expect(screen.getByTestId('mvd-jakosc-cieplna-zapas-przekroj_minimalny').textContent).toBe(
      '40,20 mm²',
    );
  });
});
