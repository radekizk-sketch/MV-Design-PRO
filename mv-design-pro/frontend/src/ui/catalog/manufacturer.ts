/**
 * Manufacturer — typ producenta rozdzielnicy SN (goal §11A).
 *
 * Mirrors backendowy Pydantic model `Manufacturer` z
 * `network_model/catalog/switchgear/manufacturer.py`.
 */

export type ManufacturerStatus =
  | 'verified'
  | 'user_defined'
  | 'requires_catalog'
  | 'deprecated';

export interface Manufacturer {
  readonly manufacturer_ref: string;
  readonly name: string;
  readonly normalized_code: string;
  readonly country: string | null;
  readonly status: ManufacturerStatus;
  readonly source_refs: readonly string[];
  readonly notes_pl: string | null;
}

const NAZWA_STATUSU_PRODUCENTA_PL: Readonly<Record<ManufacturerStatus, string>> = {
  verified: 'katalog zweryfikowany',
  user_defined: 'definicja użytkownika',
  requires_catalog: 'wymaga uzupełnienia katalogu',
  deprecated: 'producent wycofany',
};

/**
 * Status producenta po polsku (`Manufacturer.status` kontraktu) — status spoza unii daje
 * opis jawny, nigdy kod ani `undefined`. Kreator stacji pokazuje go przy nazwie producenta
 * (decyzja PLAN_DOKONCZENIA_100_2026-08-14, pkt 2: status producenta MA być widoczny).
 */
export function describeManufacturerStatusPl(status: string): string {
  return Object.prototype.hasOwnProperty.call(NAZWA_STATUSU_PRODUCENTA_PL, status)
    ? NAZWA_STATUSU_PRODUCENTA_PL[status as ManufacturerStatus]
    : 'status producenta spoza słownika aplikacji';
}

/**
 * Opis jawny producenta, którego referencji nie ma w katalogu producentów — referencja
 * (`ZPUE_WLOSZCZOWA`, `SCHNEIDER_ELECTRIC`) jest kodem katalogu, nie nazwą dla projektanta.
 */
export const PRODUCENT_SPOZA_KATALOGU_PL = 'producent spoza katalogu producentów';

/**
 * Nazwa producenta dla projektanta — JEDNO źródło dla kreatorów pola, źródła i stacji
 * oraz nagłówka rozdzielnicy. Referencja z katalogu daje `Manufacturer.name`
 * (`GET /api/catalog/manufacturers`), referencja spoza katalogu daje opis jawny, brak
 * referencji daje `null` (wywołujący pokazuje swój stan braku). Kod referencji nigdy
 * nie trafia na ekran.
 */
export function nazwaProducentaPl(
  manufacturerRef: string | null | undefined,
  producenci: readonly Manufacturer[],
): string | null {
  if (!manufacturerRef) return null;
  return (
    producenci.find((m) => m.manufacturer_ref === manufacturerRef)?.name
    ?? PRODUCENT_SPOZA_KATALOGU_PL
  );
}
