/*
 * Pasek narzędzi i liczniki modelu na żądanie (karta K1 POWLOKA).
 *
 * Iloczyn cech:
 *   * polecenie {Szukaj, Katalog, Przegląd zbiorczy, Historia} × {akcja podana, brak akcji}
 *     — brak akcji = brak przycisku (zero martwego kliku);
 *   * panel liczników × stan {brak projektu, wczytywanie, model pusty z akcją / bez akcji,
 *     model z elementami} × zamknięcie {ponowny klik, Escape, klik poza};
 *   * `policzLicznikiModelu` × rodzaj gałęzi {kabel, linia napowietrzna, gałąź
 *     wewnętrzna, łącznik} × długość {dodatnia, zero, ujemna, nieskończona, brak} ×
 *     stacja {GPZ, inna}.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PasekNarzedzi, type PasekNarzedziProps } from '../PasekNarzedzi';
import { policzLicznikiModelu, type LicznikiModelu } from '../licznikiModelu';
import { SHELL_STRINGS } from '../strings';
import type { EnergyNetworkModel } from '../../../types/enm';

const ZERO: LicznikiModelu = {
  zrodla: 0,
  szyny: 0,
  odcinkiSn: 0,
  polaSn: 0,
  stacje: 0,
  transformatory: 0,
  generatory: 0,
  odbiory: 0,
  dlugoscKm: null,
};

function props(over: Partial<PasekNarzedziProps> = {}): PasekNarzedziProps {
  return { liczniki: ZERO, projektOtwarty: true, ...over };
}

describe('Pasek narzędzi — polecenie × akcja', () => {
  const POLECENIA = [
    ['onSzukaj', 'mvd-narzedzie-szukaj', SHELL_STRINGS.search, 'Ctrl+K'],
    ['onKatalog', 'mvd-narzedzie-katalog', SHELL_STRINGS.catalog, null],
    ['onPrzegladZbiorczy', 'mvd-narzedzie-przeglad', SHELL_STRINGS.review, null],
    ['onHistoria', 'mvd-narzedzie-historia', SHELL_STRINGS.history, null],
  ] as const;

  for (const [akcja, testId, etykieta, skrot] of POLECENIA) {
    it(`${etykieta}: z akcją woła ją natywnym klikiem, bez akcji nie istnieje`, async () => {
      const user = userEvent.setup();
      const fn = vi.fn();
      const { rerender } = render(<PasekNarzedzi {...props({ [akcja]: fn })} />);
      const przycisk = screen.getByTestId(testId);
      expect(przycisk).toHaveTextContent(etykieta);
      expect(przycisk.getAttribute('title')).toBeTruthy();
      if (skrot) expect(przycisk.getAttribute('title')).toContain(skrot);
      await user.click(przycisk);
      expect(fn).toHaveBeenCalledTimes(1);

      rerender(<PasekNarzedzi {...props()} />);
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    });
  }

  it('przełącznik trybu kanwy jest wstawiany tylko, gdy wołający go poda', () => {
    const { rerender } = render(
      <PasekNarzedzi {...props({ przelacznikPodgladu: <span data-testid="tryb">tryb</span> })} />,
    );
    expect(screen.getByTestId('tryb')).toBeInTheDocument();
    rerender(<PasekNarzedzi {...props()} />);
    expect(screen.queryByTestId('tryb')).not.toBeInTheDocument();
  });

  it('pasek ma rolę toolbar z polską nazwą', () => {
    render(<PasekNarzedzi {...props()} />);
    expect(screen.getByRole('toolbar', { name: SHELL_STRINGS.toolbarLabel })).toBeInTheDocument();
  });
});

describe('Liczniki modelu — panel na żądanie', () => {
  it('domyślnie zamknięty (liczby nie zajmują stałego pasa)', () => {
    render(<PasekNarzedzi {...props()} />);
    expect(screen.queryByTestId('mvd-liczniki-modelu')).not.toBeInTheDocument();
    expect(screen.getByTestId('mvd-narzedzie-model')).toHaveAttribute('aria-expanded', 'false');
  });

  for (const [opis, zamknij] of [
    ['ponowny klik', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByTestId('mvd-narzedzie-model'))],
    ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
    ['klik poza', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByTestId('poza'))],
  ] as const) {
    it(`otwiera się klikiem, zamyka: ${opis}`, async () => {
      const user = userEvent.setup();
      render(
        <div>
          <PasekNarzedzi {...props()} />
          <p data-testid="poza">poza</p>
        </div>,
      );
      await user.click(screen.getByTestId('mvd-narzedzie-model'));
      expect(screen.getByTestId('mvd-liczniki-modelu')).toBeInTheDocument();
      expect(screen.getByTestId('mvd-narzedzie-model')).toHaveAttribute('aria-expanded', 'true');
      await zamknij(user);
      expect(screen.queryByTestId('mvd-liczniki-modelu')).not.toBeInTheDocument();
    });
  }

  it('brak projektu ≠ wczytywanie ≠ zera', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PasekNarzedzi {...props({ liczniki: null, projektOtwarty: false })} />);
    await user.click(screen.getByTestId('mvd-narzedzie-model'));
    expect(screen.getByTestId('mvd-liczniki-brak-projektu')).toBeInTheDocument();
    rerender(<PasekNarzedzi {...props({ liczniki: null, projektOtwarty: true })} />);
    expect(screen.getByTestId('mvd-liczniki-wczytywanie')).toBeInTheDocument();
    expect(screen.queryByTestId('mvd-licznik-zrodla')).not.toBeInTheDocument();
  });

  it('model pusty: akcja „Przejdź do budowy GPZ" tylko, gdy wołający ją poda', async () => {
    const user = userEvent.setup();
    const onZacznijBudowe = vi.fn();
    const { rerender } = render(<PasekNarzedzi {...props({ onZacznijBudowe })} />);
    await user.click(screen.getByTestId('mvd-narzedzie-model'));
    expect(screen.getByTestId('mvd-licznik-dlugosc')).toHaveTextContent('nie podano');
    await user.click(screen.getByTestId('mvd-liczniki-zacznij'));
    expect(onZacznijBudowe).toHaveBeenCalledTimes(1);
    rerender(<PasekNarzedzi {...props()} />);
    expect(screen.queryByTestId('mvd-liczniki-zacznij')).not.toBeInTheDocument();
  });

  it('model z elementami: liczby wiernie, bez akcji pustego modelu', async () => {
    const user = userEvent.setup();
    render(
      <PasekNarzedzi
        {...props({
          liczniki: { ...ZERO, zrodla: 1, szyny: 5, odcinkiSn: 3, polaSn: 4, stacje: 2, transformatory: 2, generatory: 1, odbiory: 6, dlugoscKm: 2.5 },
          onZacznijBudowe: vi.fn(),
        })}
      />,
    );
    await user.click(screen.getByTestId('mvd-narzedzie-model'));
    expect(screen.getByTestId('mvd-licznik-zrodla')).toHaveTextContent('1');
    expect(screen.getByTestId('mvd-licznik-szyny')).toHaveTextContent('5');
    expect(screen.getByTestId('mvd-licznik-odcinki')).toHaveTextContent('3');
    expect(screen.getByTestId('mvd-licznik-pola')).toHaveTextContent('4');
    expect(screen.getByTestId('mvd-licznik-stacje')).toHaveTextContent('2');
    expect(screen.getByTestId('mvd-licznik-odbiory')).toHaveTextContent('6');
    expect(screen.getByTestId('mvd-licznik-dlugosc')).toHaveTextContent('2,50');
    expect(screen.queryByTestId('mvd-liczniki-zacznij')).not.toBeInTheDocument();
  });
});

function model(over: Partial<EnergyNetworkModel>): EnergyNetworkModel {
  return {
    header: { enm_version: '1.0', name: 'Test', revision: 1, hash_sha256: 'x' },
    sources: [],
    buses: [],
    branches: [],
    transformers: [],
    loads: [],
    generators: [],
    substations: [],
    bays: [],
    junctions: [],
    ...over,
  } as unknown as EnergyNetworkModel;
}

describe('policzLicznikiModelu — rodzaj gałęzi × długość × rodzaj stacji', () => {
  it('brak modelu = brak liczb (null), nie zera', () => {
    expect(policzLicznikiModelu(null)).toBeNull();
  });

  it('pusty model = zera i długość „nie podano" (null)', () => {
    expect(policzLicznikiModelu(model({}))).toEqual(ZERO);
  });

  it('odcinki terenowe: kabel i linia liczone; łącznik i gałąź wewnętrzna nie', () => {
    const wynik = policzLicznikiModelu(
      model({
        branches: [
          { ref_id: 'seg/K1', type: 'cable', from_bus_ref: 'A', to_bus_ref: 'B', length_km: 1.25 },
          { ref_id: 'seg/L1', type: 'line_overhead', from_bus_ref: 'B', to_bus_ref: 'C', length_km: 0.75 },
          { ref_id: 'seg/W1', type: 'cable', from_bus_ref: 'C', to_bus_ref: 'D', length_km: 9, meta: { internal: true } },
          { ref_id: 'seg/S1', type: 'switch', from_bus_ref: 'D', to_bus_ref: 'E', length_km: 1 },
        ] as never,
      }),
    );
    expect(wynik?.odcinkiSn).toBe(2);
    expect(wynik?.dlugoscKm).toBeCloseTo(2.0, 10);
  });

  it('długość z dawnej migawki (`lengthKm`, `length`) wchodzi do sumy tak samo jak do predykatu odcinka', () => {
    const wynik = policzLicznikiModelu(
      model({
        branches: [
          { ref_id: 'seg/A', type: 'cable', lengthKm: 0.5 },
          { ref_id: 'seg/B', type: 'cable', length: '0.25' },
        ] as never,
      }),
    );
    expect(wynik?.odcinkiSn).toBe(2);
    expect(wynik?.dlugoscKm).toBeCloseTo(0.75, 10);
  });

  for (const [opis, dlugosc] of [
    ['zero', 0],
    ['ujemna', -1],
    ['nieskończona', Number.POSITIVE_INFINITY],
    ['NaN', Number.NaN],
    ['brak pola', undefined],
  ] as const) {
    it(`długość ${opis}: gałąź nie jest odcinkiem terenowym i nie wchodzi do sumy (brak danej ≠ 0 km)`, () => {
      const galaz: Record<string, unknown> = { ref_id: 'seg/K1', type: 'cable', from_bus_ref: 'A', to_bus_ref: 'B' };
      if (dlugosc !== undefined) galaz.length_km = dlugosc;
      const tylkoTa = policzLicznikiModelu(model({ branches: [galaz] as never }));
      expect(tylkoTa?.odcinkiSn).toBe(0);
      expect(tylkoTa?.dlugoscKm).toBeNull();
      const zDodatnia = policzLicznikiModelu(
        model({
          branches: [galaz, { ref_id: 'seg/K2', type: 'cable', from_bus_ref: 'B', to_bus_ref: 'C', length_km: 0.4 }] as never,
        }),
      );
      // Para: liczba odcinków i suma długości z JEDNEGO źródła — każdy policzony
      // odcinek ma długość w sumie.
      expect(zDodatnia?.odcinkiSn).toBe(1);
      expect(zDodatnia?.dlugoscKm).toBeCloseTo(0.4, 10);
    });
  }

  it('stacje: GPZ (dowolna wielkość liter) nie jest liczona jako stacja SN/nN', () => {
    const wynik = policzLicznikiModelu(
      model({
        substations: [
          { id: 's1', ref_id: 's1', name: 'GPZ', station_type: 'GPZ' },
          { id: 's2', ref_id: 's2', name: 'GPZ 2', station_type: 'gpz' },
          { id: 's3', ref_id: 's3', name: 'ST-1', station_type: 'mv_lv' },
          { id: 's4', ref_id: 's4', name: 'ST-2' },
        ] as never,
      }),
    );
    expect(wynik?.stacje).toBe(2);
  });

  it('liczności pozostałych rodzajów 1:1 z migawki', () => {
    const wynik = policzLicznikiModelu(
      model({
        sources: [{}, {}] as never,
        buses: [{ ref_id: 'B1' }, { ref_id: 'B2' }, { ref_id: 'B3' }] as never,
        transformers: [{}] as never,
        generators: [{}, {}, {}, {}] as never,
        loads: [{}, {}, {}, {}, {}] as never,
      }),
    );
    expect(wynik).toMatchObject({ zrodla: 2, szyny: 3, transformatory: 1, generatory: 4, odbiory: 5 });
  });
});
