/**
 * Nazwy pozycji katalogu rozdzielnic w kreatorach — nazwa handlowa / katalogowa, nigdy
 * identyfikator (`ZPUE_WLOSZCZOWA__ROTOBLOK__LINE_IN`) ani status źródła danych.
 * Jedno źródło dla wszystkich kreatorów, które pokazują karty pól i rodziny rozdzielnic
 * (stacja SN/nN, pole SN, stacja zasilająca GPZ).
 */

/** Minimalny kształt karty pola potrzebny do nazwy (podzbiór `CompleteMvBayTemplateSummary`). */
interface KartaPolaNazwa {
  readonly template_name_pl?: string | null;
  readonly template_code?: string | null;
  readonly base_template?: { readonly name?: string | null } | null;
}

/** Minimalny kształt rodziny rozdzielnicy (podzbiór `SwitchgearFamily`). */
interface RodzinaNazwa {
  readonly family_name: string;
  readonly series_name?: string | null;
}

/**
 * Nazwa karty pola: nazwa pola producenta (z kodem katalogowym, gdy karta go niesie),
 * a bez niej nazwa pola ze składu kanonicznego; bez obu — `zapas` (np. nazwa roli pola).
 */
export function nazwaKartyPola(karta: KartaPolaNazwa, zapas: string): string {
  const nazwa = karta.template_name_pl?.trim() || karta.base_template?.name?.trim() || zapas;
  const kod = karta.template_code?.trim();
  return kod ? `${nazwa} (${kod})` : nazwa;
}

/** Nazwa rodziny rozdzielnicy: nazwa wyrobu z serią, gdy karta ją podaje. */
export function nazwaRodziny(rodzina: RodzinaNazwa): string {
  const seria = rodzina.series_name?.trim();
  return seria ? `${rodzina.family_name} ${seria}` : rodzina.family_name;
}
