/**
 * KOLUMNY BLOKU PRZEKAŹNIKA W PIŚMIE POWIĘKSZONYM (odbiór B-02 właściciela 2026-11-04 pkt 7) —
 * jedno źródło położeń poziomych komórek bloku dla planu czytelności
 * (`canvas/labelLegibility.ts::przestawPasma`) i dla zapasu szerokości kolumny pola GPZ
 * (`compose/gpz.ts::szerokosciRysunkuPol`).
 *
 * Kody funkcji spoza okręgu stoją w kolumnach pionowych; komórka rośnie w prawo od swojej
 * kotwicy. Gdy pismo rośnie (podłoga czytelności, podłoga opisów celu kadru), komórka lewej
 * kolumny weszłaby na komórkę prawej w tym samym wierszu — więc każda kolumna przesuwa się
 * w prawo tak, by odstęp od powiększonej komórki poprzedniej kolumny w KAŻDYM wierszu był
 * co najmniej odstępem ze sceny. Kolumna = wspólna lewa krawędź prostokątów sceny, wiersz =
 * wspólna górna krawędź. Pismo naturalne (szerokość powiększona = szerokość sceny) — bez
 * przesunięcia (rysunek bajtowo jak scena).
 */
/** Wiersz bloku przekaźnika (kody poza okręgiem i odniesienia obwodów spoza pola —
 *  `compose/gpz.ts`, `compose/station.ts`); człon przed `#` to ref pola. Jedno źródło dla planu
 *  czytelności i kompozycji GPZ. */
export const WIERSZ_BLOKU_PRZEKAZNIKA = /#(protection-codes-full|zrodlo-u0)(-\d+)?$/;

export interface KomorkaBloku {
  /** Prostokąt komórki w scenie (pismo naturalne). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Szerokość komórki w piśmie planu. */
  readonly szerokoscPisma: number;
}

/** Lewa krawędź każdej komórki (indeks wejścia) w piśmie planu. */
export function kolumnyBlokuWPismie(komorki: readonly KomorkaBloku[]): number[] {
  const kolumny = [...new Set(komorki.map((k) => k.x))].sort((a, b) => a - b);
  const xKolumny = new Map<number, number>();
  for (const x of kolumny) {
    let wymagane = x;
    for (const k of komorki) {
      if (k.x !== x) continue;
      // Komórka bezpośrednio na lewo w tym samym wierszu (poprzednia kolumna).
      const poprzednia = komorki
        .filter((p) => p.y === k.y && p.x < x)
        .sort((a, b) => b.x - a.x)[0];
      if (!poprzednia) continue;
      const odstepSceny = x - (poprzednia.x + poprzednia.width);
      wymagane = Math.max(wymagane, xKolumny.get(poprzednia.x)! + poprzednia.szerokoscPisma + odstepSceny);
    }
    xKolumny.set(x, wymagane);
  }
  return komorki.map((k) => xKolumny.get(k.x)!);
}
