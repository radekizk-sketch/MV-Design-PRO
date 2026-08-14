/**
 * Formatowanie WYŁĄCZNIE prezentacyjne wierszy arkusza obliczeń nN (karta
 * ARKUSZ-NN) — ZERO arytmetyki fizycznej, wyłącznie konwersja jednostek
 * (kW/kA — mnożenie/dzielenie przez 1000, jak `EkranSwzNn.tsx::fmtA`) i
 * zaokrąglanie do wyświetlenia. Wspólne dla tabeli EKRANU i eksportu CSV —
 * JEDNO źródło formatowania, żeby treść CSV == treść ekranu (karta §0 pkt 3).
 * Przecinek dziesiętny (konwencja polska): `.toFixed(n).replace('.', ',')` —
 * ten sam wzorzec co `EkranDoboruNn.tsx`/`EkranSwzNn.tsx` (NIE `toLocaleString`,
 * które zależy od danych ICU środowiska i mogłoby złamać determinizm CSV
 * bajt-w-bajt między środowiskami uruchomieniowymi).
 */

import type { ArkuszWartosc } from './nnSiteApi';

export function fmtLiczba(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  return v.toFixed(decimals).replace('.', ',');
}

export function fmtA(v: number | null | undefined, decimals = 1): string {
  const s = fmtLiczba(v, decimals);
  return s ? `${s} A` : '';
}

export function fmtKa(v: number | null | undefined, decimals = 2): string {
  const s = fmtLiczba(v, decimals);
  return s ? `${s} kA` : '';
}

export function fmtProcent(v: number | null | undefined, decimals = 1): string {
  const s = fmtLiczba(v, decimals);
  return s ? `${s} %` : '';
}

/** Etykieta krótka dla stanu NIE-'OK' (brak wartości) — jedno słowo, spójne z
 *  konwencją backendu (`status`: brak danych / nie dotyczy / nierozstrzygalne). */
export function etykietaStanu(status: ArkuszWartosc<unknown>['status']): string {
  if (status === 'nie dotyczy') return 'nie dotyczy';
  if (status === 'nierozstrzygalne') return 'nierozstrzygalne';
  return 'brak danych';
}

/** Tekst komórki tabeli/CSV dla wartość-albo-trzeci-stan: wartość sformatowana
 *  ALBO etykieta stanu (nigdy pusty napis — „puste komórki nie istnieją"). */
export function fmtStan<T>(w: ArkuszWartosc<T>, formatuj: (wartosc: T) => string): string {
  if (w.status === 'OK' && w.wartosc !== null) return formatuj(w.wartosc);
  return `— (${etykietaStanu(w.status)})`;
}
