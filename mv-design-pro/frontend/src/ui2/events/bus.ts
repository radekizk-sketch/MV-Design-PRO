/**
 * Rdzen magistrali zdarzen powloki (E15.1) — kregoslup powiazania warstw.
 *
 * Czysty TypeScript — BEZ Reacta, BEZ wolan API, BEZ zapisu do zewnetrznych
 * store'ow. Wylacznie dystrybuuje zdarzenia do subskrybentow w kolejnosci FIFO.
 *
 * Kontrakt: docs/uiux/karty/U1_E15_1_MAGISTRALA.md §3, §6, §7.
 *
 * Determinizm:
 * - Zero `Date.now()` / losowosci.
 * - Kolejnosc dostarczenia zdarzen = kolejnosc emisji (FIFO), rowniez gdy
 *   zdarzenie jest emitowane z wnetrza obsluznika innego zdarzenia (emisja
 *   zagniezdzona trafia na koniec kolejki — bez rekurencji, bez przeplatania).
 * - Wynik koncowy (zbior wywolanych obsluznikow per zdarzenie) nie zalezy od
 *   kolejnosci subskrypcji — kazdy subskrybent danego typu jest wywolywany
 *   dokladnie raz na zdarzenie tego typu, niezaleznie od tego, w jakiej
 *   kolejnosci subskrybenci sie zarejestrowali.
 */

import type { ObsluznikZdarzenia, TypZdarzenia, ZdarzenieMagistrali, ZdarzenieTypu } from './types';

export class MagistralaZdarzen {
  private readonly obsluzniceTypu = new Map<TypZdarzenia, Set<ObsluznikZdarzenia<any>>>();
  private readonly obsluzniceWszystkich = new Set<ObsluznikZdarzenia>();
  private readonly kolejka: ZdarzenieMagistrali[] = [];
  private przetwarzanie = false;

  /**
   * Emituje zdarzenie do wszystkich subskrybentow (per-typ + subskrybujacych
   * wszystkie typy). Jesli wywolanie nastapi w trakcie trwajacej dystrybucji
   * (emisja zagniezdzona z wnetrza obsluznika), zdarzenie trafia na koniec
   * kolejki FIFO i zostanie obsluzone dopiero po zakonczeniu biezacej
   * dystrybucji — bez rekurencji.
   */
  emituj(zdarzenie: ZdarzenieMagistrali): void {
    this.kolejka.push(zdarzenie);
    if (this.przetwarzanie) {
      return;
    }
    this.przetwarzanie = true;
    try {
      while (this.kolejka.length > 0) {
        const nastepne = this.kolejka.shift() as ZdarzenieMagistrali;
        this.dystrybuuj(nastepne);
      }
    } finally {
      this.przetwarzanie = false;
    }
  }

  /**
   * Subskrybuje zdarzenia jednego typu. Wielokrotna subskrypcja tego samego
   * obsluznika jest idempotentna (Set) — obsluznik zostanie wywolany raz na
   * zdarzenie. Zwraca funkcje odsubskrybowania, bezpieczna do wywolania w
   * trakcie trwajacej dystrybucji oraz wielokrotnie (kolejne wywolania — no-op).
   */
  subskrybuj<T extends TypZdarzenia>(
    typ: T,
    obsluznik: ObsluznikZdarzenia<ZdarzenieTypu<T>>,
  ): () => void {
    let zbior = this.obsluzniceTypu.get(typ);
    if (!zbior) {
      zbior = new Set();
      this.obsluzniceTypu.set(typ, zbior);
    }
    const zbiorObsluznikow = zbior;
    zbiorObsluznikow.add(obsluznik as ObsluznikZdarzenia<any>);
    return () => {
      zbiorObsluznikow.delete(obsluznik as ObsluznikZdarzenia<any>);
    };
  }

  /**
   * Subskrybuje wszystkie typy zdarzen (np. do celow diagnostycznych/audytu).
   * Zwraca funkcje odsubskrybowania.
   */
  subskrybujWszystkie(obsluznik: ObsluznikZdarzenia): () => void {
    this.obsluzniceWszystkich.add(obsluznik);
    return () => {
      this.obsluzniceWszystkich.delete(obsluznik);
    };
  }

  private dystrybuuj(zdarzenie: ZdarzenieMagistrali): void {
    const zbiorTypu = this.obsluzniceTypu.get(zdarzenie.typ);
    if (zbiorTypu) {
      // Migawka (Array.from) — bezpieczne odsubskrybowanie w trakcie iteracji
      // (przypadek brzegowy §4: "odsubskrybowanie w trakcie emisji").
      for (const obsluznik of Array.from(zbiorTypu)) {
        obsluznik(zdarzenie);
      }
    }
    for (const obsluznik of Array.from(this.obsluzniceWszystkich)) {
      obsluznik(zdarzenie);
    }
  }
}

/** Jedna, wspoldzielona instancja magistrali powloki (singleton modulu). */
export const magistrala = new MagistralaZdarzen();

/** Emituje zdarzenie na wspoldzielonej magistrali powloki. */
export function emituj(zdarzenie: ZdarzenieMagistrali): void {
  magistrala.emituj(zdarzenie);
}

/** Subskrybuje zdarzenia jednego typu na wspoldzielonej magistrali powloki. */
export function subskrybuj<T extends TypZdarzenia>(
  typ: T,
  obsluznik: ObsluznikZdarzenia<ZdarzenieTypu<T>>,
): () => void {
  return magistrala.subskrybuj(typ, obsluznik);
}

/** Subskrybuje wszystkie typy zdarzen na wspoldzielonej magistrali powloki. */
export function subskrybujWszystkie(obsluznik: ObsluznikZdarzenia): () => void {
  return magistrala.subskrybujWszystkie(obsluznik);
}
