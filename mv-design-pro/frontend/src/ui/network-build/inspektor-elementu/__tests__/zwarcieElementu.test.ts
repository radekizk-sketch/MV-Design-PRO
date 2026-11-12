// @vitest-environment node
/**
 * Zestawienie zwarciowe inspektora (karta INSPEKTOR-I-NAWIGACJA, sekcja zwarć) — czysta funkcja
 * jako iloczyn cech: strony pasma {obie · tylko MAKS. · tylko MIN.} × rewizje stron {zgodne ·
 * różne} × konfiguracja biegu {stan normalny · scenariusz roboczy · impedancja przejścia ·
 * bieg nieznany rejestrowi} × punkt {w wyniku · poza wynikiem}.
 */
import { describe, expect, it } from 'vitest';

import type { ShortCircuitRow } from '../../../results-inspector/types';
import type { ExecutionRun } from '../../../study-cases/types';
import type { PasmoZwarciaOdpowiedz, StronaPasmaOdpowiedz } from '../../../../ui2/wyniki/zwarcia/api';
import { zestawienieZwarciaElementu } from '../zwarcieElementu';

function wiersz(ik: number, c: number, nadpisanie: Partial<ShortCircuitRow> = {}): ShortCircuitRow {
  return {
    target_id: 'szyna-1',
    target_name: null,
    ikss_ka: ik,
    ip_ka: ik * 2.5,
    ith_ka: ik,
    sk_mva: ik * 26,
    fault_type: '3F',
    flags: [],
    c_factor: c,
    tk_s: 0.5,
    ...nadpisanie,
  };
}

function strona(w: ShortCircuitRow, rewizja: number, zf = false): StronaPasmaOdpowiedz {
  return {
    zrodlo: 'biegu_zapisanego',
    run_id: 'r',
    bieg_bazowy_id: 'r',
    wynik: {
      run_id: 'r',
      rows: [w],
      ...(zf
        ? {
            konfiguracja_biegu: {
              c_factor: { tryb: 'auto_per_wezel', wartosc: null, uzasadnienie: null },
              thermal_time_seconds: { wartosc: 0.5, pochodzenie: 'opcje_biegu' },
              metoda: 'IEC 60909',
              impedancja_przejscia: { r_f_ohm: 1.5, x_f_ohm: 0, poza_zakresem_iec60909: true },
            },
          }
        : {}),
    },
    analysis_case_context: { rewizja_modelu: rewizja },
  };
}

function pasmo(max: StronaPasmaOdpowiedz | null, min: StronaPasmaOdpowiedz | null): PasmoZwarciaOdpowiedz {
  return {
    run_id_kotwicy: 'r',
    scenariusz_kotwicy: max ? 'MAX' : 'MIN',
    typ_zwarcia_kotwicy: '3F',
    brakujacy_scenariusz: max && min ? null : max ? 'MIN' : 'MAX',
    powod_niedostepnosci: null,
    powod_niedostepnosci_pl: max && min ? null : 'brak biegu',
    max,
    min,
  };
}

const BIEG: ExecutionRun = {
  id: 'r',
  study_case_id: 'c',
  analysis_type: 'SC_3F',
  solver_input_hash: 'h',
  status: 'DONE',
  started_at: null,
  finished_at: null,
  error_message: null,
  model_revision: 7,
};

describe('zestawienieZwarciaElementu', () => {
  it('obie strony: wielkości i warunki w kolumnach MAKS. i MIN. osobno, format rejestru kanwy', () => {
    const z = zestawienieZwarciaElementu(pasmo(strona(wiersz(18.5, 1.1), 7), strona(wiersz(12.25, 1), 7)), 'szyna-1', BIEG)!;
    expect(z.wielkosci.map((w) => [w.kod, w.maks, w.min])).toEqual([
      ['IK_3F_A', '18,5 kA', '12,3 kA'],
      ['IP_A', '46,3 kA', '30,6 kA'],
      ['ITH_A', '18,5 kA', '12,3 kA'],
      ['SK_MVA', '481,00 MVA', '318,50 MVA'],
    ]);
    expect(z.warunki.map((w) => [w.kod, w.maks, w.min])).toEqual([
      ['c', '1,10', '1,00'],
      ['tk', '0,50 s', '0,50 s'],
    ]);
    expect(z.rewizjaPl).toBe('rewizja 7');
    expect(z.konfiguracjaPl).toBe('stan normalny modelu');
    expect(z.brakStronyPl).toBeNull();
  });

  it.each([
    ['tylko MAKS.', true],
    ['tylko MIN.', false],
  ] as const)('%s: brakująca kolumna pusta, przyczyna z serwera', (_nazwa, maks) => {
    const s = strona(wiersz(10, maks ? 1.1 : 1), 7);
    const z = zestawienieZwarciaElementu(pasmo(maks ? s : null, maks ? null : s), 'szyna-1', BIEG)!;
    expect(z.wielkosci[0][maks ? 'min' : 'maks']).toBeNull();
    expect(z.wielkosci[0][maks ? 'maks' : 'min']).not.toBeNull();
    expect(z.brakStronyPl).toBe(`Scenariusz ${maks ? 'minimalny' : 'maksymalny'} niedostępny: brak biegu.`);
  });

  it('rewizje stron różne: jawne ostrzeżenie zamiast cichego zestawienia', () => {
    const z = zestawienieZwarciaElementu(pasmo(strona(wiersz(18, 1.1), 7), strona(wiersz(12, 1), 6)), 'szyna-1', BIEG)!;
    expect(z.rewizjaPl).toBe('maks.: rewizja 7, min.: rewizja 6 — scenariusze policzone na różnych stanach modelu');
  });

  it('konfiguracja: scenariusz roboczy, impedancja przejścia, bieg nieznany rejestrowi', () => {
    const zf = pasmo(strona(wiersz(18, 1.1), 7, true), null);
    expect(zestawienieZwarciaElementu(zf, 'szyna-1', { ...BIEG, scenario_ref: { scenario_id: 's', revision: 3 } })!.konfiguracjaPl).toBe(
      'scenariusz roboczy, rewizja 3; impedancja przejścia 1,5000 + j0,0000 Ω (poza zakresem IEC 60909)',
    );
    expect(zestawienieZwarciaElementu(zf, 'szyna-1', null)!.konfiguracjaPl).toMatch(/^stan sieci biegu nieznany/);
  });

  it('punkt poza wynikiem: brak zestawienia (nie wiersz z kreskami)', () => {
    expect(zestawienieZwarciaElementu(pasmo(strona(wiersz(18, 1.1), 7), null), 'inna-szyna', BIEG)).toBeNull();
  });

  it('punkt dopasowany także po element_id wiersza', () => {
    const w = wiersz(18, 1.1, { target_id: 'cel', element_id: 'szyna-1' });
    expect(zestawienieZwarciaElementu(pasmo(strona(w, 7), null), 'szyna-1', BIEG)).not.toBeNull();
  });
});
