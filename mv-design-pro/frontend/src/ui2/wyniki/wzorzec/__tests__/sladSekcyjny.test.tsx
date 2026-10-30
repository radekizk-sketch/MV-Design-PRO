import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SladSekcyjny, type SekcjaWywodu, type PozycjaWalidacji } from '../SladSekcyjny';

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
  { pozycja_pl: 'Norma bazowa metody', wartosc_pl: 'IEC 60909-0:2016' },
  {
    pozycja_pl: 'Reguła małych silników (p. 6.6)',
    wartosc_pl:
      'suma I″k,M = 0,612 kA > 0,05·I″k = 0,421 kA — pominięcie silników asynchronicznych niedopuszczalne; ich wkłady są uwzględnione w I″k,M i Ib',
  },
  {
    pozycja_pl: 'Maszyny wirujące w modelu',
    wartosc_pl: 'synchroniczne: 1 szt., asynchroniczne: 1 szt.',
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

describe('SladSekcyjny — panel metody (ZWARCIA-PRO F3 pkt 10)', () => {
  it('panel metody jako ostatnia sekcja: pozycje faktów biegu bez statusu i bez ikon oceny', () => {
    renderSlad({ tytul: 'Metoda obliczenia IEC 60909', pozycje: WALIDACJA });
    fireEvent.click(screen.getByTestId('mvd-test-slad-btn'));
    const btnWalidacji = screen.getByTestId('mvd-test-slad-walidacja-btn');
    expect(btnWalidacji).toHaveAttribute('aria-expanded', 'false');
    expect(within(btnWalidacji).getByText('Metoda obliczenia IEC 60909')).toBeInTheDocument();
    fireEvent.click(btnWalidacji);
    const lista = screen.getByTestId('mvd-test-slad-walidacja');
    const pozycje = within(lista).getAllByRole('listitem');
    expect(pozycje).toHaveLength(3);
    // Karta WERDYKT-MIGRACJA-190: żadna pozycja nie jest oceną — brak `data-status`
    // i brak ikon ✓/✗ (dawne PASS/FAIL bez rekordu wyjaśnienia).
    for (const pozycja of pozycje) {
      expect(pozycja).not.toHaveAttribute('data-status');
      expect(within(pozycja).queryByRole('img')).not.toBeInTheDocument();
      expect(pozycja.textContent).not.toMatch(/[✓✗]/);
    }
    // Pozycja i wartość PL z backendu (zero fabrykacji w UI) — zdanie niesie liczby i skutek.
    expect(within(pozycje[1]).getByText('Reguła małych silników (p. 6.6)')).toBeInTheDocument();
    expect(within(pozycje[1]).getByText(WALIDACJA[1].wartosc_pl)).toBeInTheDocument();
  });

  it('brak walidacji → sekcja walidacji nie renderuje się', () => {
    renderSlad();
    fireEvent.click(screen.getByTestId('mvd-test-slad-btn'));
    expect(screen.queryByTestId('mvd-test-slad-walidacja-btn')).not.toBeInTheDocument();
  });
});
