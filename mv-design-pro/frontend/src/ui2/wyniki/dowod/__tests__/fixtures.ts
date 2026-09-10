/*
 * Fixture pól kanonu śladu WHITE BOX (karta E9.1 §2): `TraceStep`
 * z `ui/results-inspector/types.ts` — pola kanonu (step, title, formula_latex,
 * inputs, substitution, result, notes, element_id). Pokrycie przypadków
 * wymaganych kartą: krok bez `formula_latex`, krok z `element_id`, wartości
 * z jednostką i bez, klucz nieznany (bez etykiety) oraz klucz nieznany
 * z własnym `label`, krok bez `step`/`title` (fallback numeru).
 *
 * KSZTAŁT WARTOŚCI (naprawa KLASA NIE INSTANCJA, karta WB-ROZPLYW): to
 * fixture reprezentuje OPAKOWANY kształt `TraceValue` ({value, unit, label})
 * — WYŁĄCZNIE zgodność wsteczna (starsze/testowe dane), NIE realny kształt
 * solvera. Realny kształt (`WhiteBoxTracer.add` — skalar/liczba zespolona
 * `{re,im}` WPROST, bez opakowania) ma OSOBNĄ fixture:
 * `traceStepsSurowyKsztaltFixture` (poniżej) — obie ścieżki pokryte testem
 * w `dowodModel.test.ts` (`rozpakujWartosc` duck-typing).
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

/**
 * Krok śladu w REALNYM kształcie solvera (`WhiteBoxTracer.add`,
 * `network_model/whitebox/tracer.py` — potwierdzone w `short_circuit_iec60909.py`,
 * np. linie 928-940 i 983-1019, oraz w teście backendu
 * `test_branch_flow_trace_is_whitebox`): `inputs`/`result` niosą skalar
 * (number/string) i liczbę zespoloną zserializowaną jako `{re, im}` WPROST —
 * BEZ opakowania `{value, unit, label}`. Celowo bez adnotacji `: TraceStep`
 * (żeby nie wymuszać rzutowania na inny kształt niż realny — `mapujKroki`
 * przyjmuje `TraceStep[]`, a struktura wejściowa faktycznych wywołań API jest
 * i tak `unknown` z JSON, więc test przekazuje ją WPROST, jak produkcyjny kod).
 */
export function traceStepsSurowyKsztaltFixture() {
  return [
    {
      key: 'thevenin_flow_setup',
      title: 'Podział prądu Thevenina — iniekcja jednostkowa w węźle zwarcia',
      formula_latex: '\\underline{V} = \\underline{Z}_{bus} \\cdot \\underline{i}_{inj}',
      inputs: {
        fault_node_id: 'C',
        ik_thevenin_a: 5611.281490619905,
      },
      substitution: 'i_inj[2] = -1 (pu)',
      result: {
        z1_ohm: { re: 0.0821, im: 0.7734 },
      },
      notes: null,
    },
  ];
}
