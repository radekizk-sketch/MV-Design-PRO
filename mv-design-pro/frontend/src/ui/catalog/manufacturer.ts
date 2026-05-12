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

/**
 * Czy producent jest gotowy do użycia jako "oficjalny katalog" w UI.
 * Mirror backendowej `Manufacturer.is_verified()`.
 */
export function isManufacturerVerified(m: Manufacturer): boolean {
  return m.status === 'verified' && m.source_refs.length > 0;
}

/**
 * Czy producent jest zablokowany dla użycia bez ostrzeżenia (UI badge).
 */
export function isManufacturerBlockedForUse(m: Manufacturer): boolean {
  return m.status === 'requires_catalog' || m.status === 'deprecated';
}

export function describeManufacturerStatusPl(status: ManufacturerStatus): string {
  switch (status) {
    case 'verified':
      return 'Katalog zweryfikowany';
    case 'user_defined':
      return 'Definicja użytkownika';
    case 'requires_catalog':
      return 'Wymaga uzupełnienia katalogu';
    case 'deprecated':
      return 'Producent wycofany';
  }
}
