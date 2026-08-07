/**
 * INDEKS PRZESTRZENNY PROSTOKĄTÓW — równoważność z przeglądem liniowym (S9-9).
 *
 * DEKLARACJA BEZ TESTU = FAŁSZYWA PEWNOŚĆ (reguła KLASA §4). `core/rectIndex.ts`
 * deklaruje: „`anyOverlap` zwraca DOKŁADNIE to samo, co
 * `rects.some((r) => rectsOverlap(probe, r))`". Na tej deklaracji stoją DWA
 * mechanizmy sceny — silnik etykiet (`layout/declutter.ts`) i plan etykiet w
 * ścieżce gestu (`canvas/labelLegibility.ts`) — więc jej złamanie przesunęłoby
 * etykiety na rysunku technicznym, nie „tylko spowolniło".
 *
 * ILOCZYN CECH, NIE PRZYKŁAD (reguła KLASA §2). Defekt indeksu siatkowego chowa
 * się w kombinacjach: prostokąt większy od komórki × ujemne współrzędne ×
 * dotknięcie krawędzią (test OTWARTY: styk to NIE zachodzenie) × zdegenerowany
 * (zerowa szerokość/wysokość) × przekroczenie limitu komórek (lista „zawsze
 * przeglądana") × zbiór budowany przyrostowo. Poniżej sprawdzamy iloczyn tych
 * cech, a nie jeden dobrany przykład — plus zbiór prostokątów z REALNEJ sceny.
 */

import { describe, expect, it } from 'vitest';

import { rectsOverlap, type V3Rect } from '../grid';
import { buildRectIndex, createRectIndex } from '../rectIndex';

/** Wyrocznia odniesienia: przegląd liniowy — dokładnie kod sprzed karty S9-9. */
function anyOverlapLiniowo(probe: V3Rect, rects: readonly V3Rect[]): boolean {
  return rects.some((r) => rectsOverlap(probe, r));
}

const r = (x: number, y: number, width: number, height: number): V3Rect => ({ x, y, width, height });

/** CECHA: rozmiar względem komórki siatki (bok 128 px świata). */
const ROZMIARY: readonly (readonly [string, number, number])[] = [
  ['mniejszy od komórki', 10, 6],
  ['równy komórce', 128, 128],
  ['kilka komórek', 400, 300],
  ['bardzo długi (poza limit komórek)', 900_000, 4],
  ['bardzo wysoki', 4, 900_000],
  ['zdegenerowany: zerowa szerokość', 0, 50],
  ['zdegenerowany: zerowa wysokość', 50, 0],
  ['zdegenerowany: oba zerowe', 0, 0],
];

/** CECHA: położenie (dodatnie / ujemne / na granicy komórki / bardzo daleko). */
const POLOZENIA: readonly (readonly [string, number, number])[] = [
  ['dodatnie', 300, 200],
  ['ujemne', -300, -200],
  ['mieszane', -64, 512],
  ['zero', 0, 0],
  ['na granicy komórki', 128, 256],
  ['tuż przed granicą komórki', 127, 255],
  ['bardzo daleko (poza zakresem klucza)', 5e9, -5e9],
];

describe('rectIndex — równoważność z przeglądem liniowym', () => {
  it('iloczyn cech: rozmiar × położenie × rozmiar próbnika × położenie próbnika', () => {
    const zbior: V3Rect[] = [];
    for (const [, w, h] of ROZMIARY) {
      for (const [, x, y] of POLOZENIA) zbior.push(r(x, y, w, h));
    }
    const index = buildRectIndex(zbior);

    // Rozbieżności ZBIERANE, a asercja JEDNA: `expect` per próbnik kosztowałby
    // (zmierzone) ~55 ms na wywołanie przez zdejmowanie stosu, czyli ponad
    // minutę na tej macierzy — a raport i tak pokazywałby tylko PIERWSZĄ
    // rozbieżność. Tak widać wszystkie naraz.
    const rozbieznosci: string[] = [];
    let sprawdzonych = 0;
    let zachodzacych = 0;
    for (const [nazwaR, w, h] of ROZMIARY) {
      for (const [nazwaP, x, y] of POLOZENIA) {
        // Próbniki także PRZESUNIĘTE o ułamek i o bok komórki — łapią błąd
        // zaokrąglania indeksu komórki i pominięcie komórki brzegowej.
        for (const dx of [0, 0.5, 127, 128, -128]) {
          for (const dy of [0, 0.5, 127, 128, -128]) {
            const probe = r(x + dx, y + dy, w, h);
            const oczekiwane = anyOverlapLiniowo(probe, zbior);
            if (index.anyOverlap(probe) !== oczekiwane) {
              rozbieznosci.push(
                `${nazwaR} @ ${nazwaP} + (${dx},${dy}) — liniowo=${oczekiwane}, indeks=${!oczekiwane}`,
              );
            }
            sprawdzonych += 1;
            if (oczekiwane) zachodzacych += 1;
          }
        }
      }
    }
    expect(rozbieznosci).toEqual([]);
    // Wyrocznia MUSI mieć obie odpowiedzi, inaczej „przechodzi" trywialnie.
    expect(sprawdzonych).toBeGreaterThan(1000);
    expect(zachodzacych).toBeGreaterThan(0);
    expect(zachodzacych).toBeLessThan(sprawdzonych);
  });

  it('styk krawędzią NIE jest zachodzeniem (test otwarty), tak jak w przeglądzie liniowym', () => {
    const zbior = [r(0, 0, 100, 100)];
    const index = buildRectIndex(zbior);
    const styki: readonly V3Rect[] = [
      r(100, 0, 50, 100), // styk prawą krawędzią
      r(-50, 0, 50, 100), // styk lewą
      r(0, 100, 100, 50), // styk dolną
      r(0, -50, 100, 50), // styk górną
      r(100, 100, 10, 10), // styk narożnikiem
    ];
    for (const probe of styki) {
      expect(index.anyOverlap(probe)).toBe(false);
      expect(anyOverlapLiniowo(probe, zbior)).toBe(false);
    }
    // ...a nachodzenie o pół piksela JEST zachodzeniem — po obu stronach.
    const nachodzi = r(99.5, 0, 50, 100);
    expect(index.anyOverlap(nachodzi)).toBe(true);
    expect(anyOverlapLiniowo(nachodzi, zbior)).toBe(true);
  });

  it('zbiór budowany PRZYROSTOWO daje te same odpowiedzi co przegląd liniowy po każdym kroku', () => {
    // Wzorzec z `declutterLabels` / `planSceneLabels`: zbiór „już zajęte" rośnie
    // w trakcie pętli, a predykat jest odpytywany po każdym dodaniu.
    const index = createRectIndex();
    const zbior: V3Rect[] = [];
    const rozbieznosci: string[] = [];
    let trafien = 0;
    for (let i = 0; i < 200; i++) {
      // Deterministycznie (bez losowości — P7): siatka z celowymi nachodzeniami.
      const probe = r((i * 37) % 900 - 300, (i * 53) % 700 - 200, 40 + (i % 5) * 30, 20 + (i % 3) * 40);
      const oczekiwane = anyOverlapLiniowo(probe, zbior);
      if (index.anyOverlap(probe) !== oczekiwane) rozbieznosci.push(`krok ${i}`);
      if (oczekiwane) trafien += 1;
      index.add(probe);
      zbior.push(probe);
    }
    expect(rozbieznosci).toEqual([]);
    expect(trafien).toBeGreaterThan(0);
  });

  it('pusty zbiór nigdy nie zachodzi', () => {
    const index = buildRectIndex([]);
    expect(index.anyOverlap(r(0, 0, 10, 10))).toBe(false);
    expect(index.anyOverlap(r(-1e6, -1e6, 1e7, 1e7))).toBe(false);
  });

  it('prostokąt ZDEGENEROWANY zachodzi dokładnie tak, jak mówi `rectsOverlap`', () => {
    // PUŁAPKA WYKRYTA TĄ KLASĄ TESTÓW: „zerowa szerokość ⇒ nie zachodzi z niczym"
    // jest FAŁSZEM. `rectsOverlap` to `a.x < bR && b.x < aR && …`, więc odcinek
    // pionowy LEŻĄCY ŚCIŚLE WEWNĄTRZ prostokąta spełnia warunek. Pierwsza wersja
    // indeksu pomijała takie prostokąty i gubiła trafienia — stąd ten test.
    const odcinekPionowy = r(60, 10, 0, 100);
    const odcinekPoziomy = r(10, 60, 100, 0);
    const zbior = [odcinekPionowy, odcinekPoziomy];
    const index = buildRectIndex(zbior);

    const wewnatrz = r(0, 0, 200, 200);
    expect(anyOverlapLiniowo(wewnatrz, zbior)).toBe(true); // stan faktyczny predykatu
    expect(index.anyOverlap(wewnatrz)).toBe(true); // indeks NIE gubi trafienia

    // Zbiór złożony z samych odcinków: odcinek nie zachodzi na odcinek
    // równoległy ani na prostokąt, którego krawędzi tylko dotyka.
    const rownolegly = r(80, 10, 0, 100);
    expect(anyOverlapLiniowo(rownolegly, [odcinekPionowy])).toBe(false);
    expect(buildRectIndex([odcinekPionowy]).anyOverlap(rownolegly)).toBe(false);
  });
});
