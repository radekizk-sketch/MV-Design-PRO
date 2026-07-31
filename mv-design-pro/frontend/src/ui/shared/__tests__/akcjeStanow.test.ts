/**
 * KD-8 poz. 4 — KONTRAKT SYSTEMU STANÓW AKCJI.
 *
 * Defekt z oceny: „Dodaj FW" wyglądał na aktywny przy nieaktywnych „Dodaj
 * PV/BESS", bo każdy przycisk niósł własny kolor obrysu, a nieaktywność
 * wyrażało samo przygaszenie. Test pilnuje trzech rzeczy, których wtedy
 * zabrakło: jedna klasa nieaktywności dla KAŻDEJ roli, zero barw
 * tożsamościowych w akcjach zwykłych i dokładnie jedna akcja pierwszorzędna
 * na panel (ta ostatnia w teście panelu, `Etap3Configurators.test.tsx`).
 */
import { describe, expect, it } from 'vitest';

import { KLASA_AKCJI_NIEAKTYWNEJ, atrybutRoliAkcji, klasaAkcji } from '../akcjeStanow';

describe('system stanów akcji', () => {
  it('stan NIEAKTYWNY jest identyczny dla każdej roli', () => {
    expect(klasaAkcji('pierwszorzedna', true)).toBe(KLASA_AKCJI_NIEAKTYWNEJ);
    expect(klasaAkcji('drugorzedna', true)).toBe(KLASA_AKCJI_NIEAKTYWNEJ);
  });

  it('stan nieaktywny NIE niesie akcentu barwnego (to on mylił co do dostępności)', () => {
    for (const zakazany of ['sygnal-', 'border-scada-sn', 'bg-scada-sn', 'amber', 'emerald', 'cyan', 'rose']) {
      expect(KLASA_AKCJI_NIEAKTYWNEJ, zakazany).not.toContain(zakazany);
    }
    expect(KLASA_AKCJI_NIEAKTYWNEJ).toContain('cursor-not-allowed');
    expect(KLASA_AKCJI_NIEAKTYWNEJ).toContain('text-scada-muted');
  });

  it('akcje drugorzędne mają JEDNĄ wspólną szatę — barwa nie niesie tożsamości', () => {
    const pv = klasaAkcji('drugorzedna');
    const bess = klasaAkcji('drugorzedna');
    const fw = klasaAkcji('drugorzedna');
    expect(new Set([pv, bess, fw]).size).toBe(1);
    for (const rodzina of ['amber', 'cyan', 'emerald', 'sygnal-']) {
      expect(pv, rodzina).not.toContain(rodzina);
    }
  });

  it('CTA jest jedyną rolą z wypełnieniem akcentem', () => {
    const cta = klasaAkcji('pierwszorzedna');
    expect(cta).toContain('bg-scada-sn');
    expect(klasaAkcji('drugorzedna')).not.toContain('bg-scada-sn');
  });

  it('każda rola dzieli ten sam szkielet geometryczny (jeden rytm przycisków)', () => {
    for (const klasa of [klasaAkcji('pierwszorzedna'), klasaAkcji('drugorzedna'), KLASA_AKCJI_NIEAKTYWNEJ]) {
      expect(klasa).toContain('rounded border px-3 py-1.5 text-xs font-semibold');
    }
  });

  it('rola jest znakowana w DOM (policzalna bez zgadywania po klasach)', () => {
    expect(atrybutRoliAkcji('pierwszorzedna')).toEqual({ 'data-akcja': 'pierwszorzedna' });
    expect(atrybutRoliAkcji('drugorzedna')).toEqual({ 'data-akcja': 'drugorzedna' });
  });

  it('funkcja jest czysta (te same argumenty ⇒ ten sam wynik)', () => {
    expect(klasaAkcji('pierwszorzedna')).toBe(klasaAkcji('pierwszorzedna'));
    expect(klasaAkcji('drugorzedna', false)).toBe(klasaAkcji('drugorzedna'));
  });
});
