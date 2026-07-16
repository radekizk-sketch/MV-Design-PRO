import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SzczegolWerdyktu } from '../SzczegolWerdyktu';
import { mapujMacierz, zbudujModuly, type KomorkaMacierzy } from '../macierzModel';
import { MACIERZ_STRINGS } from '../strings';
import { derFixture, katalogFixture, wynikFixture } from './fixtures';

const moduly = zbudujModuly([
  derFixture({ id: 'pv-1', name: 'PV Dach A' }),
  derFixture({ id: 'bess-1', name: 'Magazyn energii 1', der_kind: 'BESS', nominal_power_kw: 800 }),
  derFixture({ id: 'fw-1', name: 'Farma wiatrowa', der_kind: 'FW', voltage_level_ref: null }),
]);
const wiersze = mapujMacierz(katalogFixture(), wynikFixture(), moduly);

function komorka(testId: string, derRef: string): KomorkaMacierzy {
  return wiersze.find((w) => w.test.test_id === testId)!.komorki.find((k) => k.derRef === derRef)!;
}

describe('SzczegolWerdyktu', () => {
  it('brak wybranej komórki → podpowiedź wyboru', () => {
    render(<SzczegolWerdyktu komorka={null} nazwaModulu={null} onOtworzDowod={vi.fn()} />);
    expect(screen.getByTestId('mvd-oze-szczegol-pusty')).toHaveTextContent(
      MACIERZ_STRINGS.szczegolWybierz,
    );
  });

  it('komórka modułu bez danych → jawny powód braku danych', () => {
    render(
      <SzczegolWerdyktu
        komorka={komorka('FRT_LVRT', 'fw-1')}
        nazwaModulu="Farma wiatrowa"
        onOtworzDowod={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mvd-oze-szczegol-blokada')).toHaveTextContent('napięcie przyłączenia');
  });

  it('komórka z wynikiem → uzasadnienie, metryki i akcje naprawcze', () => {
    render(
      <SzczegolWerdyktu
        komorka={komorka('FRT_LVRT', 'bess-1')}
        nazwaModulu="Magazyn energii 1"
        onOtworzDowod={vi.fn()}
      />,
    );
    expect(screen.getByText('Brak krzywej LVRT — moduł nie spełnia wymogu.')).toBeInTheDocument();
    expect(screen.getByTestId('mvd-oze-szczegol-metryki')).toBeInTheDocument();
    expect(screen.getByText('Wybierz krzywą LVRT operatora w profilu modułu.')).toBeInTheDocument();
  });

  it('odnośnik śladu woła onOtworzDowod', () => {
    const onOtworzDowod = vi.fn();
    render(
      <SzczegolWerdyktu
        komorka={komorka('FREQ_P_F', 'pv-1')}
        nazwaModulu="PV Dach A"
        onOtworzDowod={onOtworzDowod}
      />,
    );
    fireEvent.click(screen.getByTestId('mvd-oze-slad-otworz'));
    expect(onOtworzDowod).toHaveBeenCalledWith('proof://pv-1/FREQ_P_F');
  });
});
