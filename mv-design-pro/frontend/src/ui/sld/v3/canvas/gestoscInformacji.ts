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
 * t3 9 px, t4 8 px świata — `core/text.ts` `LABEL_TYPOGRAPHY`), nie z konfiguracji.
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
import type { OwnedLabel } from '../layout/labels';

/** Klasa informacji napisu sceny, od najważniejszej (R3). `tozsamosc` nie znika
 *  nigdy — poniżej progu rysuje się w stałym rozmiarze ekranowym (R4). */
export type KlasaInformacji = 'tozsamosc' | 'oznaczenia' | 'parametry' | 'wyniki';

/** Kolejność klas informacji (priorytet malejący). */
export const KLASY_INFORMACJI: readonly KlasaInformacji[] = ['tozsamosc', 'oznaczenia', 'parametry', 'wyniki'];

/**
 * Klasa informacji NAPISU SCENY — jedno źródło dla planu renderu
 * (`canvas/labelLegibility.ts`: tożsamość rysuje się w stałym rozmiarze
 * ekranowym, reszta znika poniżej progu) i dla testów. Wyprowadzona z danych
 * etykiety, nigdy z treści tekstu:
 *  - element w stanie błędu (`unresolved`) albo klasa znaczeniowa
 *    `'tozsamosc'` ⇒ `'tozsamosc'` (wyjątek bezwzględny planu nN: etykieta
 *    elementu nierozwiązywalnego nie znika z powodu skali);
 *  - dane pisane klasą `t2` (typ·przekrój·długość przęsła, parametry
 *    transformatora w paśmie nazw) ⇒ `'parametry'`;
 *  - pozostałe dane (`t3`/`t4`: kierunek pola, koniec odcinka, nastawy
 *    zabezpieczeń, odbiór zagregowany nN) ⇒ `'oznaczenia'`.
 * Klasa `'wyniki'` należy do warstwy wynikowej (`canvas/resultLabels.ts`), nie
 * do napisów sceny. Klasa NIE zmienia progu — widoczność danych rozstrzyga
 * rozmiar ekranowy ich pisma (`czytelnyNaEkranie`).
 */
export function klasaInformacjiEtykiety(label: OwnedLabel): Exclude<KlasaInformacji, 'wyniki'> {
  if (label.unresolved === true || label.labelRole === 'tozsamosc') return 'tozsamosc';
  return label.labelClass === 't2' ? 'parametry' : 'oznaczenia';
}

/** Względna szerokość pasma histerezy czytelności (±10 % progu): przy progu 9 px
 *  napis pojawia się od 9,9 px, a znika poniżej 8,1 px ekranu. */
export const PASMO_HISTEREZY_CZYTELNOSCI = 0.1;

/**
 * Najmniejsza skala, przy której napis o wysokości nominalnej `wysokoscSwiata` POJAWIA SIĘ przy
 * powiększaniu z kadru, na którym był niewidoczny (`czytelnyNaEkranie(…, poprzednio = false)`):
 * próg czytelności podniesiony o pasmo histerezy. Dla wyników (pismo t4, 8 j.św.) to 1,2375 —
 * wyniki są czytelne powyżej skali czytania, bo t4 w rozmiarze nominalnym ma 8 px < 9 px.
 */
export function skalaPojawieniaSie(wysokoscSwiata: number): number {
  return (MIN_READABLE_LABEL_SCREEN_PX * (1 + PASMO_HISTEREZY_CZYTELNOSCI)) / wysokoscSwiata;
}

/**
 * Czy napis o wysokości nominalnej `wysokoscSwiata` [j.św.] jest czytelny przy
 * skali `skala` [px ekranu / j.św.]. `poprzednio` — widoczność w poprzedniej
 * klatce (`undefined` = brak historii: sam próg). Skala niewiarygodna (≤ 0, NaN
 * — viewport przed pierwszym pomiarem) ⇒ widoczny (brak pomiaru nie jest
 * dowodem nieczytelności; ta sama reguła co `isLabelReadableAtScale`).
 */
export function czytelnyNaEkranie(wysokoscSwiata: number, skala: number, poprzednio?: boolean): boolean {
  if (!Number.isFinite(skala) || skala <= 0) return true;
  // Wejście w widoczność — próg z `skalaPojawieniaSie` (jedno źródło dla kanwy i testów).
  if (poprzednio === false) return skala >= skalaPojawieniaSie(wysokoscSwiata);
  const px = wysokoscSwiata * skala;
  const prog = poprzednio === true ? MIN_READABLE_LABEL_SCREEN_PX * (1 - PASMO_HISTEREZY_CZYTELNOSCI) : MIN_READABLE_LABEL_SCREEN_PX;
  return px >= prog;
}
