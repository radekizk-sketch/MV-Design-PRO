/*
 * PrzyciskAkcjiStanu (karta K6 / H-5) — JEDEN przycisk „następnego kroku"
 * stanów zerowych. Wygląd z globalnych klas powłoki (`.mvd-btn`,
 * `.mvd-btn-primary`) + odstęp `.mvd-stan-akcja` — zero nowych wariantów
 * przycisków, zero literałów UI (etykieta i opis pochodzą z akcji).
 *
 * Testid = `${testid}-akcja`, gdzie `testid` to identyfikator panelu stanu —
 * dzięki temu każdy stan zerowy ma stabilny, wyprowadzony identyfikator akcji.
 */

import type { AkcjaStanuZerowego } from './akcjeStanuZerowego';

export interface PrzyciskAkcjiStanuProps {
  /** Brak akcji = nic nie renderujemy (stan czysto informacyjny). */
  akcja?: AkcjaStanuZerowego;
  /** Testid panelu stanu — baza identyfikatora przycisku. */
  testid: string;
}

export function PrzyciskAkcjiStanu({ akcja, testid }: PrzyciskAkcjiStanuProps) {
  if (!akcja) return null;
  return (
    <button
      type="button"
      className="mvd-btn mvd-btn-primary mvd-stan-akcja"
      title={akcja.opis}
      disabled={akcja.wToku}
      onClick={akcja.onKlik}
      data-testid={`${testid}-akcja`}
    >
      {akcja.etykieta}
    </button>
  );
}
