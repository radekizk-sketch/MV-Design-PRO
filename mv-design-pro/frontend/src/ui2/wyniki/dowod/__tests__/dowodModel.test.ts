import { describe, it, expect } from 'vitest';
import { mapujKroki, formatujWartosc } from '../dowodModel';
import { traceStepsFixture, traceStepsSurowyKsztaltFixture } from './fixtures';

describe('dowodModel — mapujKroki (czysty adapter TraceStep[])', () => {
  it('numer kroku z pola `step`, a przy jego braku z pozycji (1-based)', () => {
    const model = mapujKroki(traceStepsFixture());
    expect(model[0].numer).toBe(1);
    expect(model[1].numer).toBe(2);
    expect(model[2].numer).toBe(3); // brak `step` → pozycja + 1
  });

  it('tytuł z `title`, a przy jego braku fallback „Krok N"', () => {
    const model = mapujKroki(traceStepsFixture());
    expect(model[0].tytul).toBe('Impedancja zwarciowa Thevenina');
    expect(model[2].tytul).toBe('Krok 3');
  });

  it('brak `formula_latex` → wzorLatex === null (pole pominięte, zero atrap)', () => {
    const model = mapujKroki(traceStepsFixture());
    expect(model[0].wzorLatex).toBe('$$Z_k = \\sqrt{R^2 + X^2}$$');
    expect(model[1].wzorLatex).toBeNull();
  });

  it('substitution i notes mapowane, brak → null', () => {
    const model = mapujKroki(traceStepsFixture());
    expect(model[0].podstawienie).toContain('\\sqrt');
    expect(model[0].uwagi).toBe('Zgodnie z metodą IEC 60909.');
    expect(model[1].podstawienie).toBeNull();
    expect(model[1].uwagi).toBeNull();
  });

  it('element_id przeniesiony (do „Pokaż na schemacie"); brak → null', () => {
    const model = mapujKroki(traceStepsFixture());
    expect(model[0].elementId).toBe('BUS-GPZ');
    expect(model[1].elementId).toBeNull();
  });

  it('etykieta wielkości ze słownika TRACE_VALUE_LABELS (znany klucz)', () => {
    const model = mapujKroki(traceStepsFixture());
    const ikss = model[1].wynik.find((w) => w.klucz === 'ikss_ka');
    expect(ikss?.etykieta).toBe('Prąd zwarciowy początkowy Ik"');
    expect(ikss?.jednostka).toBe('kA');
    expect(ikss?.wartosc).toBe('12,345');
  });

  it('etykieta z TraceValue.label, gdy klucz spoza słownika ale label obecny', () => {
    const model = mapujKroki(traceStepsFixture());
    const pomocnicza = model[1].dane.find((w) => w.klucz === 'wielkosc_pomocnicza');
    expect(pomocnicza?.etykieta).toBe('Wielkość pomocnicza');
  });

  it('klucz nieznany bez label → etykieta null (widok zdecyduje o pominięciu)', () => {
    const model = mapujKroki(traceStepsFixture());
    const nieznany = model[1].dane.find((w) => w.klucz === 'wspolczynnik_x');
    expect(nieznany?.etykieta).toBeNull();
  });

  it('kolejność wielkości = kolejność źródłowa (deterministyczna)', () => {
    const model = mapujKroki(traceStepsFixture());
    expect(model[1].dane.map((w) => w.klucz)).toEqual([
      'c_factor',
      'un_kv',
      'wspolczynnik_x',
      'wielkosc_pomocnicza',
    ]);
  });

  it('wartość bez jednostki nie niesie `jednostka`', () => {
    const model = mapujKroki(traceStepsFixture());
    const c = model[1].dane.find((w) => w.klucz === 'c_factor');
    expect(c?.jednostka).toBeUndefined();
    expect(c?.wartosc).toBe('1,1');
  });
});

describe('dowodModel — formatujWartosc (deterministyczne, przecinek PL)', () => {
  it('null → „—"', () => {
    expect(formatujWartosc(null)).toBe('—');
  });
  it('liczba → przecinek dziesiętny', () => {
    expect(formatujWartosc(1.3)).toBe('1,3');
    expect(formatujWartosc(200)).toBe('200');
  });
  it('boolean → tak/nie', () => {
    expect(formatujWartosc(true)).toBe('tak');
    expect(formatujWartosc(false)).toBe('nie');
  });
  it('łańcuch przekazany bez zmian', () => {
    expect(formatujWartosc('IEC 60909')).toBe('IEC 60909');
  });
});

/**
 * KLASA NIE INSTANCJA (karta WB-ROZPLYW): `mapujKroki`/`mapujWielkosci` MUSZĄ
 * poprawnie odczytywać REALNY kształt kroku WHITE BOX solvera — skalar/liczbę
 * zespoloną `{re,im}` WPROST (`WhiteBoxTracer.add`), nie tylko opakowany
 * `TraceValue` z `traceStepsFixture`. Przed naprawą KAŻDA wartość realnego
 * śladu (SC/PF `white_box_trace`, `branch_flow_trace`) renderowała się jako
 * „—" — `mapujWielkosci` czytała `.value`/`.unit` z surowego skalara/obiektu
 * zespolonego (bez `.value`), zawsze `undefined`. Iloczyn cech pokryty:
 * skalar (number/string) × liczba zespolona {re,im} × klucz nieznany.
 */
/**
 * Fixture przez round-trip JSON — TA SAMA droga, którą realne dane przechodzą
 * w produkcji (`fetch(...).json()` w `dowod/api` konsumentów śladu, kształt
 * nieopakowany). Zero rzutowań typów (`as unknown as` zakazane kartą) —
 * `JSON.parse` zwraca `any`, jak realny `Response.json()`.
 */
function realnyKsztalt() {
  return JSON.parse(JSON.stringify(traceStepsSurowyKsztaltFixture()));
}

describe('dowodModel — mapujKroki na REALNYM (nieopakowanym) kształcie kroku solvera', () => {
  it('skalar wprost (number/string) sformatowany — NIE kreska, mimo braku opakowania {value,unit}', () => {
    const model = mapujKroki(realnyKsztalt());
    const fault = model[0].dane.find((w) => w.klucz === 'fault_node_id');
    const ik = model[0].dane.find((w) => w.klucz === 'ik_thevenin_a');
    expect(fault?.wartosc).toBe('C');
    expect(ik?.wartosc).toBe('5611,281490619905');
    // Klucz spoza TRACE_VALUE_LABELS i bez opakowania (więc bez .label) → null
    // (zero zgadywania etykiety) — ale WARTOŚĆ nadal poprawnie odczytana wyżej.
    expect(fault?.etykieta).toBeNull();
    expect(ik?.etykieta).toBeNull();
    expect(fault?.jednostka).toBeUndefined();
  });

  it('liczba zespolona {re, im} wprost (serialize_complex solvera) → „R znak jIm" (przecinek PL), NIE „[object Object]"', () => {
    const model = mapujKroki(realnyKsztalt());
    const z1 = model[0].wynik.find((w) => w.klucz === 'z1_ohm');
    expect(z1?.wartosc).toBe('0,0821 + j0,7734');
    expect(z1?.wartosc).not.toContain('[object Object]');
  });

  it('krok bez formula_latex/notes (raw fixture ma notes: null) → pola pominięte jak przy TraceValue opakowanym', () => {
    const model = mapujKroki(realnyKsztalt());
    expect(model[0].uwagi).toBeNull();
  });

  it('opakowany TraceValue nadal działa identycznie jak przed naprawą (zgodność wsteczna, zero regresji)', () => {
    // Powtórka istniejących asercji z fixture opakowanej — dowód, że naprawa
    // duck-typingu NIE zmienia zachowania dla starszego/testowego kształtu.
    const model = mapujKroki(traceStepsFixture());
    const ikss = model[1].wynik.find((w) => w.klucz === 'ikss_ka');
    expect(ikss?.wartosc).toBe('12,345');
    expect(ikss?.jednostka).toBe('kA');
  });
});
