/**
 * Polska odmiana rzeczownika po liczebniku — JEDNA funkcja dla całej aplikacji (karta
 * GPZ-H5-SLD pkt 3f).
 *
 * Dawniej każdy moduł miał własną kopię (`pluralPl`, `odmianaKroku`, `odmianaPar`,
 * `licznikOdplywowLabel`, `liczbaPolLiniowychPl`, `odmianaIteracji`) albo trójargumentowy
 * skrót `n === 1 ? 'x' : 'y'`, który gubi formę „kilka" („2 opisów", „2 błędów", „5 wyspy",
 * „12 rdzenie"). Reguła (gramatyka polska, liczby całkowite):
 * - `jeden`  — dokładnie 1 („1 opis"); 21, 31, … biorą formę `wiele` („21 opisów");
 * - `kilka`  — końcówka 2–4 poza 12–14 („2 opisy", „23 opisy", „104 opisy");
 * - `wiele`  — 0, 5–21, 12–14, 25–31 itd. („0 opisów", „12 opisów", „25 opisów").
 * Liczba ujemna odmienia się jak jej moduł. Gdy rzeczownik stoi w przypadku rządzonym przez
 * inne słowo („w 2 iteracjach", „brakuje 5 danych"), formy `kilka` i `wiele` są równe —
 * podaje je wołający; reguła wyboru zostaje jedna.
 */

export interface FormyLiczebnikowe {
  /** Forma dla liczby 1 („opis"). */
  readonly jeden: string;
  /** Forma dla końcówek 2–4 poza 12–14 („opisy"). */
  readonly kilka: string;
  /** Forma dla pozostałych liczb („opisów"). */
  readonly wiele: string;
}

/** Forma rzeczownika właściwa dla liczby `n` (bez liczby). */
export function formaLiczebnikowa(n: number, formy: FormyLiczebnikowe): string {
  const modul = Math.abs(n);
  if (modul === 1) return formy.jeden;
  const jednosci = modul % 10;
  const nascie = modul % 100;
  if (jednosci >= 2 && jednosci <= 4 && !(nascie >= 12 && nascie <= 14)) return formy.kilka;
  return formy.wiele;
}

/** Liczba z odmienionym rzeczownikiem: „1 opis", „3 opisy", „12 opisów". */
export function liczbaZOdmiana(n: number, formy: FormyLiczebnikowe): string {
  return `${n} ${formaLiczebnikowa(n, formy)}`;
}
