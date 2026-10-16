/**
 * Przypięcie puli testów (karta SZYBKIE-TESTY, 2026-09-30).
 *
 * Pliki testów biegną równolegle w puli PROCESÓW (`pool: 'forks'`). Testy budżetu algorytmu
 * mierzą czas procesora całego procesu (`src/test/czasProcesora.ts`), więc ich wynik jest
 * poprawny tylko wtedy, gdy plik testów wykonuje się w wątku głównym własnego procesu.
 * Zmiana puli na wątki (domyślna w vitest 1.x) przewraca ten test, zanim zafałszuje pomiary.
 */
import { isMainThread } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';

import { czasProcesoraMs, zmierzCzasProcesora } from '../czasProcesora';

describe('pula testów vitest', () => {
  it('plik testów wykonuje się w wątku głównym osobnego procesu', () => {
    expect(isMainThread).toBe(true);
  });

  it('pomiar czasu procesora zwraca wynik funkcji i nieujemny czas', () => {
    const { wynik, ms } = zmierzCzasProcesora(() => 6 * 7);
    expect(wynik).toBe(42);
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(czasProcesoraMs(() => undefined)).toBeGreaterThanOrEqual(0);
  });
});
