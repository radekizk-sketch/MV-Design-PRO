// @vitest-environment node
/**
 * Zbiór testów budżetu czasu procesora i odmowa pomiaru w biegu równoległym (karta SZYBKIE-TESTY).
 *
 * Ten plik biegnie w GŁÓWNYM, równoległym kroku vitest — celowo nie importuje `czasProcesora`
 * statycznie (skaner przeniósłby go do kroku budżetów); pomocnik ładuje dynamicznie, żeby
 * sprawdzić, że poza krokiem budżetów pomiar jest odmawiany.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { plikiBudzetuCzasu, TRYB_BUDZETOW } from '../../../vite.config';

const KORZEN = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('pliki testów budżetu czasu procesora', () => {
  const pliki = plikiBudzetuCzasu(KORZEN);

  it('zbiór obejmuje znane testy budżetu (inwentarz 2026-10-15) i przypięcie puli', () => {
    for (const plik of [
      'src/test/__tests__/pulaTestow.test.ts',
      'src/ui/sld/v2/__tests__/performance.perf.test.ts',
      'src/ui/sld/v3/scene/__tests__/buildScene.p1Recenzja.test.ts',
      'src/ui/sld/v3/scene/__tests__/buildScene.schemat10s7p3.test.ts',
      'src/ui/sld/v3/scene/__tests__/buildScene.schemat10s7p4.test.ts',
      'src/ui/sld/v3/scene/__tests__/buildScene.schemat10s7p6.test.ts',
      'src/ui/sld/v3/scene/__tests__/kosztSceny.test.ts',
    ]) {
      expect(pliki).toContain(plik);
    }
  });

  it('każdy plik zbioru importuje pomocnik pomiaru, a ten plik — nie', () => {
    for (const plik of pliki) {
      expect(readFileSync(join(KORZEN, plik), 'utf-8')).toMatch(/\/czasProcesora['"]/);
    }
    expect(pliki).not.toContain('src/test/__tests__/plikiBudzetuCzasu.test.ts');
  });

  it('w głównym kroku (tryb inny niż budżetów) pomiar czasu procesora jest odmawiany', async () => {
    expect(import.meta.env.MODE).not.toBe(TRYB_BUDZETOW);
    const sciezka = '../czas' + 'Procesora';
    const pomocnik = (await import(/* @vite-ignore */ sciezka)) as typeof import('../czasProcesora');
    expect(() => pomocnik.czasProcesoraMs(() => 1)).toThrow(/kroku budżetów/);
    // Predykat parą: tryb, w którym pomocnik mierzy, = tryb, w którym konfiguracja uruchamia budżety.
    expect(pomocnik.TRYB_BUDZETOW).toBe(TRYB_BUDZETOW);
  });
});
