/**
 * W3-KABLE-ETYKIETY §7/§6 — testy CZYSTEGO formattera etykiety technicznej
 * linii (`layout/lineLabel.ts`). Determinizm + zero fabrykacji (brakująca dana
 * pominięta, nie zgadywana) + format długości „l = …" wg §7.
 */
import { describe, expect, it } from 'vitest';
import {
  formatLineLengthPl,
  formatRatedVoltageKv,
  formatLineTechnicalLabel,
} from '../lineLabel';

describe('W3 §7 — formatLineLengthPl (format „l = …")', () => {
  it('<1000 m ⇒ „l = NN m" (zaokrąglone do metra)', () => {
    expect(formatLineLengthPl(0.68)).toBe('l = 680 m');
    expect(formatLineLengthPl(0.25)).toBe('l = 250 m');
    expect(formatLineLengthPl(0.9999)).toBe('l = 1000 m'); // 999,9 m → 1000 m (próg <1000 m po zaokrągleniu metrów)
  });

  it('≥1000 m ⇒ „l = N,NN km" z przecinkiem, bez zbędnych zer', () => {
    expect(formatLineLengthPl(1.24)).toBe('l = 1,24 km');
    expect(formatLineLengthPl(1.2)).toBe('l = 1,2 km');
    expect(formatLineLengthPl(2)).toBe('l = 2 km');
    expect(formatLineLengthPl(1.05)).toBe('l = 1,05 km');
  });

  it('brak/≤0 ⇒ null (człon pominięty, zero fabrykacji)', () => {
    expect(formatLineLengthPl(null)).toBeNull();
    expect(formatLineLengthPl(0)).toBeNull();
    expect(formatLineLengthPl(-1)).toBeNull();
    expect(formatLineLengthPl(undefined)).toBeNull();
  });
});

describe('W3 §7 — formatRatedVoltageKv', () => {
  it('całkowite bez miejsc, ułamkowe z przecinkiem', () => {
    expect(formatRatedVoltageKv(20)).toBe('Un=20 kV');
    expect(formatRatedVoltageKv(10.5)).toBe('Un=10,5 kV');
  });
  it('brak/≤0 ⇒ null (katalog nie niesie ⇒ pominięte)', () => {
    expect(formatRatedVoltageKv(null)).toBeNull();
    expect(formatRatedVoltageKv(0)).toBeNull();
    expect(formatRatedVoltageKv(undefined)).toBeNull();
  });
});

describe('W3 §7/§6 — formatLineTechnicalLabel (człon techniczny bez relacji)', () => {
  it('PEŁNY zestaw kabla: typ · napięcie · długość', () => {
    expect(
      formatLineTechnicalLabel({
        typeLabel: 'YAKXS 3×1×240 mm²',
        ratedVoltageKv: 20,
        lengthKm: 0.68,
        overhead: false,
      }),
    ).toBe('YAKXS 3×1×240 mm² · Un=20 kV · l = 680 m');
  });

  it('brak napięcia (katalog nie niesie) ⇒ człon pominięty, zero fabrykacji', () => {
    expect(
      formatLineTechnicalLabel({
        typeLabel: 'Kabel SN XLPE Al 3×120 mm²',
        ratedVoltageKv: null,
        lengthKm: 0.25,
        overhead: false,
      }),
    ).toBe('Kabel SN XLPE Al 3×120 mm² · l = 250 m');
  });

  it('§6: mufa dopisywana TYLKO gdy ENM niesie złącze (hasJoint)', () => {
    expect(
      formatLineTechnicalLabel({
        typeLabel: 'Kabel SN XLPE Al 3×120 mm²',
        ratedVoltageKv: 20,
        lengthKm: 1.24,
        overhead: false,
        hasJoint: true,
      }),
    ).toBe('Kabel SN XLPE Al 3×120 mm² · Un=20 kV · l = 1,24 km · mufa');
  });

  it('§6: linia napowietrzna — typ katalogowy niesie rozróżnienie zakończenia (przyłącze napowietrzne)', () => {
    // Rozróżnienie kabel/napowietrzna jest w etykiecie typu z katalogu.
    expect(
      formatLineTechnicalLabel({
        typeLabel: 'Linia napowietrzna Al 120 mm²',
        ratedVoltageKv: null,
        lengthKm: 0.35,
        overhead: true,
      }),
    ).toBe('Linia napowietrzna Al 120 mm² · l = 350 m');
  });

  it('brak WSZYSTKICH składowych ⇒ null (uczciwy brak — wołający degraduje do relacji)', () => {
    expect(
      formatLineTechnicalLabel({ typeLabel: null, ratedVoltageKv: null, lengthKm: null, overhead: false }),
    ).toBeNull();
  });

  it('determinizm: ten sam wynik dla tego samego wejścia', () => {
    const input = { typeLabel: 'YAKXS 3×1×240 mm²', ratedVoltageKv: 20, lengthKm: 0.68, overhead: false } as const;
    expect(formatLineTechnicalLabel(input)).toBe(formatLineTechnicalLabel(input));
  });
});
