/**
 * SLD V3 — GĘSTOŚĆ INFORMACJI wg rozmiaru ekranowego (karta SLD-SKALA-I-NAWIGACJA,
 * rozstrzygnięcie R3; kontrakt `docs/sld/SLD_LOD_SPEC_OPERATOR_GRADE.md` v2.0).
 *
 * Skala kamery steruje WYŁĄCZNIE tym, które NAPISY są na rysunku — nigdy torem
 * (przewody, szyny, aparaty, stany, punkty rozcięcia, ramka i linie bloku
 * zabezpieczeń, obrys stacji nie mają klasy informacji i są rysowane w każdej
 * skali). Napis jest widoczny, gdy jego wysokość nominalna (świat) razy skala
 * kamery osiąga JEDEN próg czytelności `MIN_READABLE_LABEL_SCREEN_PX`
 * (`core/text.ts`, 9 px). Nie ma nazwanych poziomów ani tabeli progów: liczba
 * „pasm” widoczności wynika z rozmiarów pisma klas (t1 13 px, t2 11 px,
 * t3 10 px, t4 9 px świata), nie z konfiguracji.
 *
 * Pasmo histerezy: napis, który był widoczny, znika dopiero poniżej progu
 * pomniejszonego o `PASMO_HISTEREZY_CZYTELNOSCI`; napis niewidoczny pojawia się
 * dopiero powyżej progu powiększonego o to samo pasmo. Drganie skali kółka lub
 * szczypania wokół progu nie przełącza więc napisu tam i z powrotem.
 *
 * Czysta arytmetyka, bez DOM i bez stanu — stan „poprzednio widoczny” podaje
 * wołający (kanwa trzyma go między klatkami).
 */
import { MIN_READABLE_LABEL_SCREEN_PX } from '../core/text';

/** Klasa informacji napisu sceny, od najważniejszej (R3). `tozsamosc` nie znika
 *  nigdy — poniżej progu rysuje się w stałym rozmiarze ekranowym (R4). */
export type KlasaInformacji = 'tozsamosc' | 'oznaczenia' | 'parametry' | 'wyniki';

/** Kolejność klas informacji (priorytet malejący) — jedno źródło dla planu
 *  etykiet, legendy i testów. */
export const KLASY_INFORMACJI: readonly KlasaInformacji[] = ['tozsamosc', 'oznaczenia', 'parametry', 'wyniki'];

/** Względna szerokość pasma histerezy czytelności (±10 % progu): przy progu 9 px
 *  napis pojawia się od 9,9 px, a znika poniżej 8,1 px ekranu. */
export const PASMO_HISTEREZY_CZYTELNOSCI = 0.1;

/**
 * Czy napis o wysokości nominalnej `wysokoscSwiata` [j.św.] jest czytelny przy
 * skali `skala` [px ekranu / j.św.]. `poprzednio` — widoczność w poprzedniej
 * klatce (`undefined` = brak historii: sam próg). Skala niewiarygodna (≤ 0, NaN
 * — viewport przed pierwszym pomiarem) ⇒ widoczny (brak pomiaru nie jest
 * dowodem nieczytelności; ta sama reguła co `isLabelReadableAtScale`).
 */
export function czytelnyNaEkranie(wysokoscSwiata: number, skala: number, poprzednio?: boolean): boolean {
  if (!Number.isFinite(skala) || skala <= 0) return true;
  const px = wysokoscSwiata * skala;
  const prog =
    poprzednio === true
      ? MIN_READABLE_LABEL_SCREEN_PX * (1 - PASMO_HISTEREZY_CZYTELNOSCI)
      : poprzednio === false
        ? MIN_READABLE_LABEL_SCREEN_PX * (1 + PASMO_HISTEREZY_CZYTELNOSCI)
        : MIN_READABLE_LABEL_SCREEN_PX;
  return px >= prog;
}
