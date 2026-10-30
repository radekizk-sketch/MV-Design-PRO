/**
 * Prezentacja werdyktu próby operacji (`useProbaOperacji`) — wiersz listy gotowości i komunikat
 * kontroli przed zapisem. Treść odmowy pochodzi WPROST z backendu; UI nie dopisuje oceny.
 */

import type { WierszGotowosci } from './model';
import type { StanProbyOperacji } from './probaOperacji';
import { TekstZWzorami } from './tekstZWzorami';

export const PROBA_STRINGS = {
  wiersz: 'Kontrola modelu',
  nieSprawdzono: 'Nie sprawdzono',
  sprawdzanie: 'Sprawdzanie',
  przyjeta: 'Przyjęta',
  odrzucona: 'Odrzucona',
  nieustalona: 'Nieustalona',
  komunikatSprawdzanie: 'Sprawdzanie operacji w modelu sieci (próba bez zapisu)…',
  komunikatPrzyjeta: 'Operacja przyjęta przez walidator modelu sieci (próba bez zapisu).',
  komunikatOdrzucona: (tresc: string) => `Walidator modelu sieci odrzuci tę operację: ${tresc}`,
  komunikatNieustalona: (tresc: string) =>
    `Nie udało się sprawdzić operacji w modelu sieci — wynik kontroli nieznany: ${tresc}`,
} as const;

/** Wiersz listy gotowości z werdyktu próby (`null` = formularz jeszcze niekompletny). */
export function wierszProby(proba: StanProbyOperacji | null): WierszGotowosci {
  const T = PROBA_STRINGS;
  if (!proba) return { etykieta: T.wiersz, stan: 'brak', wartosc: T.nieSprawdzono };
  switch (proba.stan) {
    case 'sprawdzanie':
      return { etykieta: T.wiersz, stan: 'ostrzezenie', wartosc: T.sprawdzanie };
    case 'przyjeta':
      return { etykieta: T.wiersz, stan: 'kompletne', wartosc: T.przyjeta };
    case 'odrzucona':
      return { etykieta: T.wiersz, stan: 'ostrzezenie', wartosc: T.odrzucona };
    case 'nieustalona':
      return { etykieta: T.wiersz, stan: 'ostrzezenie', wartosc: T.nieustalona };
  }
}

/** Zdanie kontroli przed zapisem (`null` = nic do powiedzenia — formularz niekompletny). */
export function komunikatProby(proba: StanProbyOperacji | null): string | null {
  const T = PROBA_STRINGS;
  if (!proba) return null;
  switch (proba.stan) {
    case 'sprawdzanie':
      return T.komunikatSprawdzanie;
    case 'przyjeta':
      return T.komunikatPrzyjeta;
    case 'odrzucona':
      return T.komunikatOdrzucona(proba.komunikat);
    case 'nieustalona':
      return T.komunikatNieustalona(proba.komunikat);
  }
}

export interface KontrolaPrzedZapisemProps {
  proba: StanProbyOperacji | null;
  testid: string;
}

/** Komunikat kontroli przed zapisem w treści kreatora (stan w `data-stan`). */
export function KontrolaPrzedZapisem({ proba, testid }: KontrolaPrzedZapisemProps) {
  const komunikat = komunikatProby(proba);
  if (!proba || !komunikat) return null;
  const odmowa = proba.stan === 'odrzucona' || proba.stan === 'nieustalona';
  return (
    <p
      className={odmowa ? 'mvd-pole-blad' : 'mvd-podsum-komunikat'}
      role={odmowa ? 'alert' : 'status'}
      data-testid={testid}
      data-stan={proba.stan}
    >
      <TekstZWzorami tekst={komunikat} />
    </p>
  );
}
