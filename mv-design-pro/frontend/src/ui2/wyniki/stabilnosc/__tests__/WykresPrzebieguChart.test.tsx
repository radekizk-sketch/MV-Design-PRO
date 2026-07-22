/*
 * Testy wykresu przebiegu czasowego stabilności (E-32, karta ST-1). Weryfikują:
 * render kontenera z tytułem PL, legendę serii U(t)/f(t), przełącznik serii
 * (gdy > 1 wielkość) oraz determinizm markupu (normalizacja `recharts\d+`).
 * Serie i etykiety pochodzą z metadanych backendu (zero fabrykacji).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { naSeriePrzebiegu, type PunktPrzebiegu, type WielkoscPrzebiegu } from '../model';
import { STABILNOSC_STRINGS as T } from '../strings';
import { WykresPrzebieguChart } from '../WykresPrzebieguChart';

const QUANTITIES: WielkoscPrzebiegu[] = [
  { key: 'voltage_pu', label_pl: 'Napięcie', unit: 'p.u.' },
  { key: 'frequency_pu', label_pl: 'Częstotliwość', unit: 'p.u.' },
];

const PUNKTY: PunktPrzebiegu[] = [
  { t_s: -0.1, voltage_pu: 1.0, frequency_pu: 1.0 },
  { t_s: 0.0, voltage_pu: 0.0, frequency_pu: 1.0 },
  { t_s: 0.5, voltage_pu: 0.74, frequency_pu: 1.0 },
  { t_s: 2.0, voltage_pu: 0.97, frequency_pu: 0.99 },
];

function renderWykres(quantities: WielkoscPrzebiegu[] = QUANTITIES) {
  return render(<WykresPrzebieguChart punkty={PUNKTY} serie={naSeriePrzebiegu(quantities)} />);
}

describe('WykresPrzebieguChart', () => {
  it('renderuje kontener wykresu z tytułem PL', () => {
    renderWykres();
    expect(screen.getByTestId('mvd-stabilnosc-wykres')).toBeInTheDocument();
    expect(screen.getByText(T.przebiegWykresTytul)).toBeInTheDocument();
  });

  it('legenda pokazuje serie U(t) i f(t) (PL z metadanych backendu)', () => {
    renderWykres();
    expect(screen.getAllByText(T.przebiegSeriaNapiecie).length).toBeGreaterThan(0);
    expect(screen.getAllByText(T.przebiegSeriaCzestotliwosc).length).toBeGreaterThan(0);
  });

  it('przełącznik serii ukrywa/pokazuje wielkość (gdy > 1 seria)', () => {
    renderWykres();
    const btn = screen.getByTestId('mvd-stabilnosc-serie-frequency_pu');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'false');
  });

  it('jedna wielkość → brak przełącznika serii', () => {
    renderWykres([{ key: 'voltage_pu', unit: 'p.u.' }]);
    expect(screen.queryByTestId('mvd-stabilnosc-serie')).not.toBeInTheDocument();
  });

  it('jest deterministyczny — ten sam markup dla tych samych danych', () => {
    const normalizuj = (html: string) => html.replace(/recharts\d+/g, 'rechartsN');
    const a = renderWykres();
    const markupA = normalizuj(a.container.innerHTML);
    a.unmount();
    const b = renderWykres();
    expect(normalizuj(b.container.innerHTML)).toBe(markupA);
  });
});
