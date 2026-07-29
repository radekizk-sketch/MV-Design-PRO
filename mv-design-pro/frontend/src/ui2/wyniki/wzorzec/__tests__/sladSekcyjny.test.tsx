import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SladSekcyjny, type SekcjaWywodu, type PozycjaWalidacji } from '../SladSekcyjny';
import { WZORZEC_STRINGS } from '../strings';

const SEKCJE: SekcjaWywodu[] = [
  {
    tytul: 'Dane wejściowe i model',
    kroki: [{ tekst: 'Model: IEC 60909-0:2016 par. 6.6', latex: null }],
    norma: 'IEC 60909-0:2016',
  },
  {
    tytul: 'Wkład: Agregat',
    kroki: [
      { tekst: 'Impedancja zastepcza maszyny', latex: "Z''_m = 0.5 + j\\,2.4\\;\\Omega" },
      { tekst: 'Prad wylaczeniowy symetryczny: Ib = 1.003 kA', latex: null },
    ],
    norma: 'IEC 60909-0:2016 §6.6',
  },
];

const WALIDACJA: PozycjaWalidacji[] = [
  { pozycja_pl: 'Norma bazowa metody', wartosc_pl: 'IEC 60909-0:2016', status: 'INFO' },
  {
    pozycja_pl: 'Reguła małych silników (5%)',
    wartosc_pl: 'SPELNIONA — silniki pomijalne w Ib',
    status: 'PASS',
  },
  {
    pozycja_pl: 'Maszyny asynchroniczne',
    wartosc_pl: 'NIESPELNIONA — wklady uwzglednione w Ib',
    status: 'FAIL',
  },
];

function renderSlad(walidacja?: { tytul: string; pozycje: PozycjaWalidacji[] }) {
  return render(
    <SladSekcyjny sekcje={SEKCJE} walidacja={walidacja} testIdPrefix="mvd-test-slad" />,
  );
}

describe('SladSekcyjny — ślad obliczeń w sekcjach (ZWARCIA-PRO F3 pkt 8)', () => {
  it('domyślnie zwinięty przycisk śladu; po kliknięciu sekcje akordeonu, każda zwinięta', () => {
    renderSlad();
    // Ślad na żądanie (zasada 2026-07-22): przed kliknięciem brak treści.
    expect(screen.queryByTestId('mvd-test-slad')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mvd-test-slad-btn'));
    // Sekcje widoczne, każda domyślnie zwinięta (aria-expanded=false, kroki ukryte).
    const sekcja0 = screen.getByTestId('mvd-test-slad-sekcja-btn-0');
    const sekcja1 = screen.getByTestId('mvd-test-slad-sekcja-btn-1');
    expect(sekcja0).toHaveAttribute('aria-expanded', 'false');
    expect(sekcja1).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('mvd-test-slad-sekcja-kroki-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mvd-test-slad-sekcja-kroki-1')).not.toBeInTheDocument();
  });

  it('klik sekcji rozwija jej kroki: wzór przez KaTeX (math-rendered), tekst monospace', () => {
    renderSlad();
    fireEvent.click(screen.getByTestId('mvd-test-slad-btn'));
    const sekcja1 = screen.getByTestId('mvd-test-slad-sekcja-btn-1');
    fireEvent.click(sekcja1);
    expect(sekcja1).toHaveAttribute('aria-expanded', 'true');
    const kroki = within(screen.getByTestId('mvd-test-slad-sekcja-kroki-1'));
    const wzor = kroki.getByTestId('math-rendered');
    expect(wzor.getAttribute('data-latex')).toContain("Z''_m = 0.5");
    expect(kroki.getByText('Prad wylaczeniowy symetryczny: Ib = 1.003 kA')).toBeInTheDocument();
    // Ponowny klik zwija sekcję (akordeon).
    fireEvent.click(sekcja1);
    expect(sekcja1).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('mvd-test-slad-sekcja-kroki-1')).not.toBeInTheDocument();
  });

  it('sekcja z `norma` pokazuje odwołanie normowe przy tytule', () => {
    renderSlad();
    fireEvent.click(screen.getByTestId('mvd-test-slad-btn'));
    const sekcja1 = within(screen.getByTestId('mvd-test-slad-sekcja-btn-1'));
    expect(sekcja1.getByText('Wkład: Agregat')).toBeInTheDocument();
    expect(sekcja1.getByText('IEC 60909-0:2016 §6.6')).toBeInTheDocument();
  });

  it('pusta lista sekcji → komponent nie renderuje się (uczciwy brak)', () => {
    render(<SladSekcyjny sekcje={[]} testIdPrefix="mvd-test-slad" />);
    expect(screen.queryByTestId('mvd-test-slad-btn')).not.toBeInTheDocument();
  });
});

describe('SladSekcyjny — checklista walidacji metody (ZWARCIA-PRO F3 pkt 10)', () => {
  it('panel walidacji jako ostatnia sekcja: checklista z ikonami statusów, nie kroki', () => {
    renderSlad({ tytul: 'Walidacja metody IEC 60909', pozycje: WALIDACJA });
    fireEvent.click(screen.getByTestId('mvd-test-slad-btn'));
    const btnWalidacji = screen.getByTestId('mvd-test-slad-walidacja-btn');
    expect(btnWalidacji).toHaveAttribute('aria-expanded', 'false');
    expect(within(btnWalidacji).getByText('Walidacja metody IEC 60909')).toBeInTheDocument();
    fireEvent.click(btnWalidacji);
    const lista = screen.getByTestId('mvd-test-slad-walidacja');
    const pozycje = within(lista).getAllByRole('listitem');
    expect(pozycje).toHaveLength(3);
    expect(pozycje[0]).toHaveAttribute('data-status', 'INFO');
    expect(pozycje[1]).toHaveAttribute('data-status', 'PASS');
    expect(pozycje[2]).toHaveAttribute('data-status', 'FAIL');
    // Ikony statusów z dostępnym opisem PL (aria-label ze słownika wzorca).
    expect(
      within(pozycje[1]).getByRole('img', { name: WZORZEC_STRINGS.walidacjaSpelnione }),
    ).toHaveTextContent('✓');
    expect(
      within(pozycje[2]).getByRole('img', { name: WZORZEC_STRINGS.walidacjaNiespelnione }),
    ).toHaveTextContent('✗');
    // Pozycja i wartość PL z backendu (zero fabrykacji w UI).
    expect(within(pozycje[1]).getByText('Reguła małych silników (5%)')).toBeInTheDocument();
    expect(
      within(pozycje[1]).getByText('SPELNIONA — silniki pomijalne w Ib'),
    ).toBeInTheDocument();
  });

  it('brak walidacji → sekcja walidacji nie renderuje się', () => {
    renderSlad();
    fireEvent.click(screen.getByTestId('mvd-test-slad-btn'));
    expect(screen.queryByTestId('mvd-test-slad-walidacja-btn')).not.toBeInTheDocument();
  });
});
