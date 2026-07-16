/*
 * Fixture 1:1 realnego kształtu śladu WHITE BOX (karta E9.1 §2): `TraceStep`
 * z `ui/results-inspector/types.ts:194-244` — pola kanonu (step, title,
 * formula_latex, inputs, substitution, result, notes, element_id) oraz `TraceValue`
 * (`types.ts:249-253`: value, unit?, label?). Pokrycie przypadków wymaganych kartą:
 * krok bez `formula_latex`, krok z `element_id`, wartości z jednostką i bez,
 * `inputs`/`result` jako Record<string,TraceValue>, klucz nieznany (bez etykiety)
 * oraz klucz nieznany z własnym `label`, krok bez `step`/`title` (fallback numeru).
 */

import type { TraceStep } from '../../../../ui/results-inspector/types';

/** Ślad przykładowy — 3 kroki obejmujące wszystkie warianty pól. */
export function traceStepsFixture(): TraceStep[] {
  return [
    {
      step: 1,
      title: 'Impedancja zwarciowa Thevenina',
      formula_latex: '$$Z_k = \\sqrt{R^2 + X^2}$$',
      inputs: {
        r_ohm: { value: 0.5, unit: 'Ω' },
        x_ohm: { value: 1.2, unit: 'Ω' },
      },
      substitution: '$$Z_k = \\sqrt{0{,}5^2 + 1{,}2^2}$$',
      result: {
        z_thevenin_ohm: { value: 1.3, unit: 'Ω' },
      },
      notes: 'Zgodnie z metodą IEC 60909.',
      element_id: 'BUS-GPZ',
    },
    {
      step: 2,
      title: 'Prąd zwarciowy początkowy',
      // brak formula_latex, brak element_id, brak substitution, brak notes
      inputs: {
        c_factor: { value: 1.1 },
        un_kv: { value: 15, unit: 'kV' },
        // klucz nieznany bez etykiety → pomijany poza trybem eksperckim
        wspolczynnik_x: { value: 7 },
        // klucz nieznany z własnym label → etykieta z TraceValue.label
        wielkosc_pomocnicza: { value: 3, unit: 'x', label: 'Wielkość pomocnicza' },
      },
      result: {
        ikss_ka: { value: 12.345, unit: 'kA' },
      },
    },
    {
      // brak step i title → numer z pozycji (3), tytuł fallback „Krok 3"
      result: {
        i_a: { value: 200, unit: 'A' },
      },
    },
  ];
}
