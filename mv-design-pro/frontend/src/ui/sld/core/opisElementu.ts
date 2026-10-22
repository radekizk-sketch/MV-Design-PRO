/**
 * Opis elementu w komunikacie dla projektanta — JEDNA reguła warstwy SLD (partia integracji 10).
 *
 * Rodzaj elementu z nazwą z modelu („Szyna „Sekcja 1”") albo opis braku nazwy („Szyna bez
 * nazwy") — ta sama reguła co backendowe `network_model.nazwy.opis_rodzaju_i_nazwy`.
 * Identyfikator elementu (`ref_id`, `id`) nigdy nie trafia do treści komunikatu: zostaje
 * w polu (`elementRef`, `elementId`), z którego interfejs wiąże nawigację.
 */
export function opisElementu(rodzaj: string, nazwa: string | null | undefined): string {
  const nadana = (nazwa ?? '').trim();
  return nadana ? `${rodzaj} „${nadana}”` : `${rodzaj} bez nazwy`;
}
