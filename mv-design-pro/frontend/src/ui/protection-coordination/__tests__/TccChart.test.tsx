/**
 * Wykres TCC koordynacji — krzywe złożone urządzeń z modelu (karta BIEG-ZABEZPIECZEN-Z-MODELU).
 *
 * Wejście: PRAWDZIWY wynik backendu dla sieci złotej G08 (dwa wyłączniki liniowe z
 * przekaźnikami, para Q1 → Q2) wygenerowany przez `backend/scripts/eksport_fixtur_harnessu.py`
 * (`koordynacja_scena_wynik`), nie ręcznie wpisane liczby.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { TccChart, TccChartFromResult, nazwaCharakterystykiPL } from '../TccChart';
import type { CoordinationResult } from '../types';
import { LABELS } from '../types';
import wynikSceny from '../../../harness-fixtures/generated/koordynacja_scena_wynik.json';

beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

const WYNIK = wynikSceny as unknown as CoordinationResult;

describe('wynik sieci złotej na wykresie', () => {
  it('wynik niesie krzywe obu urządzeń modelu z punktami z backendu', () => {
    expect(WYNIK.devices.length).toBe(2);
    expect(WYNIK.tcc_curves.length).toBe(2);
    for (const krzywa of WYNIK.tcc_curves) {
      expect(krzywa.points.length).toBeGreaterThan(0);
      expect(krzywa.podstawa_kod).toBe('KRZYWA_PRZEKAZNIKOWA');
    }
  });

  it('legenda: nazwa urządzenia z modelu i polska nazwa charakterystyki, opis stopni w podpowiedzi', () => {
    render(<TccChartFromResult result={WYNIK} devices={WYNIK.devices} />);
    for (const krzywa of WYNIK.tcc_curves) {
      const nazwa = WYNIK.devices.find((d) => d.id === krzywa.device_id)!.name;
      const przycisk = screen.getByText(nazwa).closest('button')!;
      expect(przycisk).toHaveTextContent(`(${nazwaCharakterystykiPL(krzywa.curve_type)})`);
      expect(przycisk).not.toHaveTextContent(krzywa.curve_type);
      expect(przycisk.getAttribute('title')).toBe(krzywa.opis_pl);
    }
  });

  it('znaczniki prądów zwarciowych z wyniku', () => {
    render(<TccChartFromResult result={WYNIK} devices={WYNIK.devices} />);
    expect(WYNIK.fault_markers.length).toBeGreaterThan(0);
    expect(screen.getByText(LABELS.tcc.faultCurrent + ':')).toBeInTheDocument();
  });

  it('klik w legendę zgłasza urządzenie', () => {
    const onDeviceClick = vi.fn();
    render(
      <TccChartFromResult result={WYNIK} devices={WYNIK.devices} onDeviceClick={onDeviceClick} />,
    );
    fireEvent.click(screen.getByText(WYNIK.devices[0].name));
    expect(onDeviceClick).toHaveBeenCalledWith(WYNIK.devices[0].id);
  });

  it('pusty wynik — stan pusty, nie wykres', () => {
    render(<TccChart curves={[]} faultMarkers={[]} />);
    expect(screen.getByTestId('tcc-chart-empty')).toBeInTheDocument();
  });
});

describe('bez banera werdyktu selektywności (P-06)', () => {
  it('wykres nie wydaje oceny „zapewniona / brak selektywności" — odstępy pokazuje panel par', () => {
    render(<TccChartFromResult result={WYNIK} devices={WYNIK.devices} />);
    for (const tekst of ['SELEKTYWNOŚĆ ZAPEWNIONA', 'BRAK SELEKTYWNOŚCI', 'SELEKTYWNOŚĆ NIEOCENIONA']) {
      expect(screen.queryByText(tekst)).toBeNull();
    }
    expect(screen.queryByTestId('selectivity-assessment')).toBeNull();
  });
});
