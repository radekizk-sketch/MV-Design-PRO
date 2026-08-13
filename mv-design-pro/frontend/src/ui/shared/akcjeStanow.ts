/**
 * KD-8 poz. 4 — JEDEN SYSTEM STANÓW PRZYCISKÓW AKCJI.
 *
 * Ocena właściciela: „»Dodaj FW« wygląda na aktywny przy nieaktywnych »Dodaj
 * PV/BESS«". Przyczyna: każdy przycisk niósł WŁASNY kolor obrysu (bursztyn /
 * cyjan / zieleń), a stan nieaktywny wyrażało wyłącznie przygaszenie
 * (`opacity-55`). Kolorowy obrys jest silniejszym sygnałem niż przezroczystość,
 * więc przycisk NIEAKTYWNY o mocnym obrysie wygląda na aktywniejszy niż
 * aktywny o obrysie stonowanym — i dokładnie tak to wyglądało na zrzucie.
 *
 * KONTRAKT:
 *  1. Rola niesie WYŁĄCZNIE dwie wartości: `pierwszorzedna` (CTA — dokładnie
 *     JEDNA na panel) i `drugorzedna` (każda pozostała akcja).
 *  2. Stan NIEAKTYWNY ma ZAWSZE tę samą klasę, niezależnie od roli — zero
 *     kolorowych obrysów, zero „przygaszonego CTA", które nadal krzyczy.
 *  3. Barwa nie niesie tożsamości akcji (PV/BESS/FW rozróżnia ETYKIETA, nie
 *     kolor obrysu) — barwa jest zarezerwowana dla stanu i hierarchii.
 *
 * Klasy idą z tokenów motywu (`--scada-*`), więc system stanów działa
 * identycznie w obu motywach.
 */

export type RolaAkcji = 'pierwszorzedna' | 'drugorzedna';

/** Wspólny szkielet geometryczny — ten sam dla każdej roli i każdego stanu. */
const SZKIELET = 'rounded border px-3 py-1.5 text-xs font-semibold transition';

/**
 * Stan NIEAKTYWNY — JEDNA klasa dla wszystkich ról. Kursor „niedozwolony" i
 * stonowana powierzchnia; ZERO akcentu barwnego (to właśnie akcent mylił
 * użytkownika co do dostępności akcji).
 */
export const KLASA_AKCJI_NIEAKTYWNEJ =
  `${SZKIELET} cursor-not-allowed border-scada-border bg-scada-surface text-scada-muted`;

/** CTA panelu — wypełnienie akcentem SN z tuszem tła (kontrast 13,4:1 / 5,5:1). */
const KLASA_CTA = `${SZKIELET} border-scada-sn bg-scada-sn text-scada-bg hover:brightness-110`;

/** Akcja drugorzędna — powierzchnia panelu, obrys neutralny. */
const KLASA_DRUGORZEDNA =
  `${SZKIELET} border-scada-border-strong bg-scada-panel-raised text-scada-text hover:bg-scada-hover-nav`;

/**
 * Klasa przycisku akcji dla roli i stanu. Czysta funkcja — ta sama para
 * argumentów zawsze daje ten sam łańcuch klas.
 */
export function klasaAkcji(rola: RolaAkcji, nieaktywna = false): string {
  if (nieaktywna) return KLASA_AKCJI_NIEAKTYWNEJ;
  return rola === 'pierwszorzedna' ? KLASA_CTA : KLASA_DRUGORZEDNA;
}

/**
 * Atrybut DOM znakujący rolę akcji — pozwala policzyć CTA na panelu (kontrakt
 * „dokładnie jeden") bez zgadywania po klasach CSS.
 */
export function atrybutRoliAkcji(rola: RolaAkcji): { readonly 'data-akcja': RolaAkcji } {
  return { 'data-akcja': rola };
}
