/**
 * Tabele wyników koordynacji: czułość, selektywność, przeciążalność i karta liczby zbiorczej.
 *
 * Wejście: PRAWDZIWY wynik backendu dla sieci złotej G08 (`koordynacja_scena_wynik`, generator
 * fikstur) — nie ręcznie wpisane sprawdzenia. Zakaz P-06: tabele pokazują liczby obok wartości
 * wymaganej i fakt „kto zadziała" z backendu, bez plakietek werdyktu.
 *
 * Iloczyn cech: {tabela: czułość, selektywność, przeciążalność} × {wartość: wyznaczona,
 * niewyznaczona (`null`)} × {stan pary: odstęp, nadrzędne się nie pobudza, podrzędne nie
 * zadziała} × {klik: wiersz, przycisk akcji, brak obsługi}.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SensitivityTable,
  SelectivityTable,
  OverloadTable,
  SummaryCard,
  formatNumber,
} from '../ResultsTables';
import type { CoordinationResult, SelectivityCheck, SensitivityCheck } from '../types';
import { LABELS } from '../types';
import wynikSceny from '../../../harness-fixtures/generated/koordynacja_scena_wynik.json';

const WYNIK = wynikSceny as unknown as CoordinationResult;
const URZADZENIA = WYNIK.devices;
const [PARA] = WYNIK.selectivity_checks;
const nazwa = (id: string) => URZADZENIA.find((d) => d.id === id)!.name;

describe('wynik sieci złotej — kształt bez werdyktu (P-06)', () => {
  it('sprawdzenia niosą liczby i wartość wymaganą, nie werdykt', () => {
    for (const c of [...WYNIK.sensitivity_checks, ...WYNIK.overload_checks]) {
      expect(c).not.toHaveProperty('verdict');
      expect(typeof c.required_ratio).toBe('number');
    }
    expect(PARA).not.toHaveProperty('verdict');
    expect(PARA.stan).toBe('ODSTEP');
    expect(WYNIK).not.toHaveProperty('overall_verdict');
  });
});

describe('SensitivityTable', () => {
  it('iloraz obok wymaganego, nazwy z modelu, zdanie backendu', () => {
    render(<SensitivityTable checks={WYNIK.sensitivity_checks} devices={URZADZENIA} />);
    for (const c of WYNIK.sensitivity_checks) {
      const wiersz = screen.getByTestId(`sensitivity-row-${c.device_id}`);
      expect(wiersz).toHaveTextContent(nazwa(c.device_id));
      expect(wiersz).toHaveTextContent(formatNumber(c.ratio, 2));
      expect(wiersz).toHaveTextContent(`${LABELS.summary.wymagany}: ${formatNumber(c.required_ratio, 2)}`);
      expect(wiersz).toHaveTextContent(c.notes_pl);
    }
    expect(screen.queryByText('Werdykt')).toBeNull();
  });

  it('klik w wiersz zgłasza urządzenie', () => {
    const onRowClick = vi.fn();
    const [pierwsze] = WYNIK.sensitivity_checks;
    render(
      <SensitivityTable checks={WYNIK.sensitivity_checks} devices={URZADZENIA} onRowClick={onRowClick} />,
    );
    fireEvent.click(screen.getByText(nazwa(pierwsze.device_id)));
    expect(onRowClick).toHaveBeenCalledWith(pierwsze.device_id);
  });

  it('wartość niewyznaczona to „—", nigdy zero', () => {
    const bezWartosci: SensitivityCheck = {
      ...WYNIK.sensitivity_checks[0],
      i_fault_min_a: null,
      i_pickup_a: null,
      ratio: null,
      margin_percent: null,
    };
    render(<SensitivityTable checks={[bezWartosci]} devices={URZADZENIA} />);
    const wiersz = screen.getByTestId(`sensitivity-row-${bezWartosci.device_id}`);
    expect(wiersz.textContent).toContain('—');
    expect(wiersz.textContent).not.toContain('0.0 ');
  });

  it('brak sprawdzeń — nazwany stan', () => {
    render(<SensitivityTable checks={[]} devices={URZADZENIA} />);
    expect(screen.getByText(LABELS.checks.sensitivity.brak)).toBeInTheDocument();
  });
});

describe('SelectivityTable', () => {
  it('odstęp obok wymaganego i fakt „kto zadziała" z backendu', () => {
    render(<SelectivityTable checks={WYNIK.selectivity_checks} devices={URZADZENIA} />);
    const tabela = screen.getByTestId('selectivity-table');
    expect(tabela).toHaveTextContent(formatNumber(PARA.margin_s, 3));
    expect(tabela).toHaveTextContent(`${LABELS.summary.wymagany}: ${formatNumber(PARA.required_margin_s, 3)}`);
    expect(within(tabela).getByTestId('selectivity-stan')).toHaveTextContent(PARA.stan_pl);
    expect(within(tabela).getByTestId('selectivity-notes')).toHaveTextContent(PARA.notes_pl);
    expect(screen.queryByText('Werdykt')).toBeNull();
  });

  it.each([
    ['NADRZEDNE_NIE_POBUDZA', 'zabezpieczenie nadrzędne się nie pobudza'],
    ['PODRZEDNE_NIE_ZADZIALA', 'zabezpieczenie podrzędne nie zadziała, nadrzędne zadziała'],
  ] as const)('para bez odstępu (%s) — kreska w liczbie, opis faktu z backendu', (stan, stanPl) => {
    const para: SelectivityCheck = { ...PARA, margin_s: null, t_upstream_s: null, stan, stan_pl: stanPl };
    render(<SelectivityTable checks={[para]} devices={URZADZENIA} />);
    const tabela = screen.getByTestId('selectivity-table');
    expect(within(tabela).getByTestId('selectivity-stan')).toHaveTextContent(stanPl);
    expect(tabela.querySelector('tbody tr')!.textContent).toContain('—');
  });

  it('WIDOCZNA akcja w każdym wierszu pary — prowadzi do nastaw pary (V12K-261)', async () => {
    const klik = vi.fn();
    render(<SelectivityTable checks={WYNIK.selectivity_checks} devices={URZADZENIA} onRowClick={klik} />);
    const przycisk = screen.getByTestId(`selectivity-fix-${PARA.upstream_device_id}`);
    expect(przycisk).toHaveTextContent(LABELS.checks.selectivity.fixSettings);
    await userEvent.click(przycisk);
    expect(klik).toHaveBeenCalledWith(PARA.upstream_device_id, PARA.downstream_device_id);
    expect(klik).toHaveBeenCalledTimes(1);
  });

  it('klik w wiersz prowadzi do pary (nadrzędne, podrzędne)', () => {
    const onRowClick = vi.fn();
    render(<SelectivityTable checks={WYNIK.selectivity_checks} devices={URZADZENIA} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText(nazwa(PARA.downstream_device_id)));
    expect(onRowClick).toHaveBeenCalledWith(PARA.upstream_device_id, PARA.downstream_device_id);
  });

  it('bez onRowClick wiersz nie udaje klikalnego i nie ma kolumny akcji', () => {
    render(<SelectivityTable checks={WYNIK.selectivity_checks} devices={URZADZENIA} />);
    const wiersz = screen.getByTestId('selectivity-table').querySelector('tbody tr');
    expect(wiersz?.className).not.toContain('cursor-pointer');
    expect(screen.queryByTestId(`selectivity-fix-${PARA.upstream_device_id}`)).toBeNull();
  });

  it('brak par — nazwany stan', () => {
    render(<SelectivityTable checks={[]} devices={URZADZENIA} />);
    expect(screen.getByText(LABELS.checks.selectivity.minDevicesRequired)).toBeInTheDocument();
  });

  it('urządzenie spoza wyniku nazwane etykietą, nie identyfikatorem', () => {
    const obca = { ...PARA, upstream_device_id: 'relay-obcy-1234' };
    render(<SelectivityTable checks={[obca]} devices={URZADZENIA} />);
    expect(screen.getByText(LABELS.devices.nieznaneUrzadzenie)).toBeInTheDocument();
    expect(screen.getByTestId('selectivity-table')).not.toHaveTextContent('relay-obcy');
  });
});

describe('OverloadTable', () => {
  it('iloraz obok wymaganego, prąd roboczy z biegu rozpływu', () => {
    render(<OverloadTable checks={WYNIK.overload_checks} devices={URZADZENIA} />);
    for (const c of WYNIK.overload_checks) {
      const wiersz = screen.getByTestId(`overload-row-${c.device_id}`);
      expect(wiersz).toHaveTextContent(formatNumber(c.i_operating_a));
      expect(wiersz).toHaveTextContent(formatNumber(c.ratio, 2));
      expect(wiersz).toHaveTextContent(`${LABELS.summary.wymagany}: ${formatNumber(c.required_ratio, 2)}`);
    }
  });

  it('klik w wiersz zgłasza urządzenie', () => {
    const onRowClick = vi.fn();
    const [pierwsze] = WYNIK.overload_checks;
    render(<OverloadTable checks={WYNIK.overload_checks} devices={URZADZENIA} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText(nazwa(pierwsze.device_id)));
    expect(onRowClick).toHaveBeenCalledWith(pierwsze.device_id);
  });

  it('brak sprawdzeń — nazwany stan', () => {
    render(<OverloadTable checks={[]} devices={URZADZENIA} />);
    expect(screen.getByText(LABELS.checks.overload.brak)).toBeInTheDocument();
  });
});

describe('SummaryCard — liczba zbiorcza obok wymaganej', () => {
  const { summary } = WYNIK;

  it('najmniejszy odstęp z backendu i wymagany z kryteriów', () => {
    render(
      <SummaryCard
        title={LABELS.summary.najmniejszyOdstep}
        wartosc={summary.selectivity.najmniejszy_odstep_s}
        wymagana={summary.kryteria.minimum_grading_margin_s}
        miejsca={3}
        bezWartosci={summary.selectivity.bez_odstepu}
        testid="karta"
      />,
    );
    const karta = screen.getByTestId('karta');
    expect(karta).toHaveTextContent(formatNumber(summary.selectivity.najmniejszy_odstep_s, 3));
    expect(karta).toHaveTextContent(
      `${LABELS.summary.wymagany}: ${formatNumber(summary.kryteria.minimum_grading_margin_s, 3)}`,
    );
    expect(screen.queryByTestId('karta-bez-wartosci')).toBeNull();
  });

  it('brak wartości i sprawdzenia bez wartości — kreska i liczba braków, nie zero', () => {
    render(
      <SummaryCard title="Czułość" wartosc={null} wymagana={1.5} miejsca={2} bezWartosci={3} testid="karta" />,
    );
    expect(screen.getByTestId('karta')).toHaveTextContent('—');
    expect(screen.getByTestId('karta-bez-wartosci')).toHaveTextContent(`${LABELS.summary.bezWartosci}: 3`);
  });
});
