import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { QetScadaFrame } from '../QetScadaFrame';
import { ocenStanRamki, type ScadaFrameInput } from '../scadaFrameState';

const VER = {
  scenarioId: 'SC-01',
  enmVersion: 'e-003',
  topologyHash: 'sha-a',
  resultSnapshotId: 'lf-004',
  resultTopologyHash: 'sha-a',
  resultEnmVersion: 'e-003',
  resultScenarioId: 'SC-01',
} as const;
const QF: ScadaFrameInput = {
  elementRef: 'QF1',
  rodzaj: 'LACZNIK',
  polozenie: 'ZAMKNIETY',
  eksploatacja: 'NORMALNY',
  jakosc: 'PRAWIDLOWE',
  zrodlo: 'SYMULACJA',
  zasilenie: 'BEZ_NAPIECIA',
  wersjaStanu: VER,
  wersjaWidoku: VER,
};
describe('QET-SCADA Frame — ortogonalne sygnały i blokady', () => {
  it('ZAMKNIĘTY = czerwony mimo braku napięcia i przepływu', () => {
    expect(ocenStanRamki(QF).ramka).toBe('ZAMKNIETY');
    const { container } = render(
      <svg><QetScadaFrame input={QF} x={0} y={10} width={28} height={38} testId="ramka">
        <line x1="14" y1="0" x2="14" y2="60" />
      </QetScadaFrame></svg>,
    );
    const group = container.querySelector('[data-testid="ramka"]')!;
    const rect = group.querySelector('rect[data-cad-overlay="mechanical-position"]')!;
    expect(rect.getAttribute('stroke')).toBe('#F05260');
    expect(group.getAttribute('data-energization')).toBe('BEZ_NAPIECIA');
    expect(group.getAttribute('data-results-current')).toBe('true');
    expect(group.getAttribute('data-state-source')).toBe('SYMULACJA');
  });
  it('OTWARTY = zielony; otwarty pod napięciem jest możliwy', () => {
    const v = { ...QF, polozenie: 'OTWARTY' as const, zasilenie: 'POD_NAPIECIEM' as const };
    expect(ocenStanRamki(v).ramka).toBe('OTWARTY');
    const {container} = render(<svg><QetScadaFrame input={v} x={0} y={0} width={16} height={24}><line /></QetScadaFrame></svg>);
    expect(container.querySelector('[data-cad-overlay="mechanical-position"]')?.getAttribute('stroke')).toBe('#2CCF93');
  });
  it('przejście nie jest ani OTWARTE ani ZAMKNIĘTE', () => {
    const v = ocenStanRamki({...QF, polozenie:'W_PRZELACZANIU'});
    expect(v.ramka).toBe('PRZEJSCIOWY');
    expect(v.moznaSymulowacZmiane).toBe(false);
    expect(v.stanGeometryczny).toBe('unknown');
  });
  it('NIEZNANY, NIEWIARYGODNY, BRAK i PRZESTARZAŁY nie udają ostatniej pozycji', () => {
    for (const jakosc of ['NIEWIARYGODNE','BRAK','PRZESTARZALE'] as const) {
      const v = ocenStanRamki({...QF, jakosc});
      expect(v.ramka).toBe('NIEZNANY');
      expect(v.stanGeometryczny).toBe('unknown');
    }
  });
  it('wyzwolony i potwierdzony OTWARTY = ramka zielona + alarm, a nie kolor alarmu', () => {
    const v = ocenStanRamki({...QF, polozenie:'OTWARTY', eksploatacja:'WYZWOLONY'});
    expect(v.ramka).toBe('OTWARTY');
    expect(v.alarm).toBe(true);
    const {container} = render(<svg><QetScadaFrame input={{...QF,polozenie:'OTWARTY',eksploatacja:'WYZWOLONY'}} x={0} y={0} width={16} height={24}><line /></QetScadaFrame></svg>);
    expect(container.querySelector('[data-cad-overlay="alarm"]')).not.toBeNull();
  });
  it('wyzwolony ZAMKNIĘTY = sprzeczność i NIEZNANY; nie pokazuje czerwonej ramki', () => {
    const v = ocenStanRamki({...QF, eksploatacja:'WYZWOLONY'});
    expect(v.niespojnosc).toBe(true);
    expect(v.ramka).toBe('NIEZNANY');
    expect(v.moznaSymulowacZmiane).toBe(false);
  });
  it('brak spójności ENM/scenariusza = NIEZNANY, bez fałszywej zielonej/czerwonej ramki', () => {
    const v = ocenStanRamki({...QF,wersjaStanu:{...VER,enmVersion:'e-001'}});
    expect(v.ramka).toBe('NIEZNANY');
  });
  it('wynik dla starego ENM lub innego scenariusza = NIEAKTUALNY, mimo identycznej topologii', () => {
    const v = ocenStanRamki({...QF,wersjaWidoku:{...VER,resultEnmVersion:'e-002'}});
    expect(v.ramka).toBe('ZAMKNIETY');
    expect(v.wynikiAktualne).toBe(false);
    const w = ocenStanRamki({...QF,wersjaWidoku:{...VER,resultScenarioId:'SC-02'}});
    expect(w.wynikiAktualne).toBe(false);
  });
  it('bezpiecznik nie jest łącznikiem: brak kolorowej ramki; przepalona wkładka = alarm', () => {
    const v = ocenStanRamki({...QF,elementRef:'FU1',rodzaj:'BEZPIECZNIK',wkladka:'PRZEPALONA'});
    expect(v.ramka).toBe('BRAK_RAMKI');
    expect(v.alarm).toBe(true);
    expect(v.moznaSymulowacZmiane).toBe(false);
  });
  it('blokada nie zmienia koloru pozycji, ale blokuje proponowaną operację symulacji', () => {
    const v = ocenStanRamki({...QF,eksploatacja:'ZABLOKOWANY'});
    expect(v.ramka).toBe('ZAMKNIETY');
    expect(v.blokada).toBe(true);
    expect(v.moznaSymulowacZmiane).toBe(false);
  });
});
