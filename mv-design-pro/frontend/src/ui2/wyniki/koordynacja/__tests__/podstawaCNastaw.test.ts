/**
 * Podstawa współczynnika c nastaw I>/I>> (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK).
 *
 * INTENCJA: proweniencja nastaw niesie scenariusz kotwicy, tryb c kotwicy i podstawę c
 * wariantu minimalnego — ekran pokazuje je wprost, bez liczby c zgadywanej w UI.
 * Iloczyn cech: {scenariusz kotwicy MAX, MIN, niezapisany} × {c auto per węzeł,
 * nadpisanie z uzasadnieniem}.
 */
import { describe, expect, it } from 'vitest';

import { opisPodstawyCNastaw, type ProweniencjaNastaw } from '../nastawyApi';

function wejscie(over: Partial<ProweniencjaNastaw>): ProweniencjaNastaw {
  return {
    kotwica_run_id: 'run-1',
    scenariusz_kotwicy: 'MAX',
    c_kotwicy: { tryb: 'auto_per_wezel', wartosc: null, uzasadnienie: null },
    c_wariantu_min: 'IEC 60909-0 tab. 1, scenariusz MIN (per węzeł)',
    line_id: 'ln1',
    next_bus_id: 'b',
    zacisk_zabezpieczenia: 'od',
    zrodlo_zacisku: 'model',
    project_name: 'P',
    case_name: 'C',
    line_name: 'L',
    run_timestamp: '2026-10-15T10:00:00Z',
    solver_version: '1',
    engine_input: {},
    ...over,
  };
}

const AUTO = { tryb: 'auto_per_wezel', wartosc: null, uzasadnienie: null } as const;
const NADPISANIE = { tryb: 'nadpisanie', wartosc: 1.05, uzasadnienie: 'uzgodnienie z OSD' } as const;

describe('opisPodstawyCNastaw', () => {
  it.each([
    ['MAX', AUTO, 'scenariusz MAX, c: IEC 60909-0 tab. 1 per węzeł'],
    ['MIN', AUTO, 'scenariusz MIN, c: IEC 60909-0 tab. 1 per węzeł'],
    [null, AUTO, 'scenariusz nie zapisano na biegu, c: IEC 60909-0 tab. 1 per węzeł'],
    ['MAX', NADPISANIE, 'scenariusz MAX, c: nadpisanie ręczne c = 1,05 — uzgodnienie z OSD'],
    ['MIN', NADPISANIE, 'scenariusz MIN, c: nadpisanie ręczne c = 1,05 — uzgodnienie z OSD'],
    [null, NADPISANIE, 'scenariusz nie zapisano na biegu, c: nadpisanie ręczne c = 1,05 — uzgodnienie z OSD'],
  ] as const)('kotwica %s × c %o → %s', (scenariusz, c, oczekiwany) => {
    const opis = opisPodstawyCNastaw(wejscie({ scenariusz_kotwicy: scenariusz, c_kotwicy: c }));
    expect(opis.kotwica).toBe(oczekiwany);
    expect(opis.wariantMin).toBe('IEC 60909-0 tab. 1, scenariusz MIN (per węzeł)');
  });
});
