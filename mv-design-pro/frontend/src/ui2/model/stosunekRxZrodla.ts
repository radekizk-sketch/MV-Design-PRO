/**
 * Stosunek R/X sieci zasilającej (źródła) — JEDNA definicja poprawności dla kreatora źródła
 * (`ui2/kreatory/zrodlo/zrodloModel.ts`), siatki właściwości (`ui/property-grid/validation.ts`)
 * i konfiguratora GPZ (`ui/workspace/surfaces/GpzConfiguratorSurface.tsx`).
 *
 * Lustro reguły backendu (`enm/domain_operations.py`: `_resolve_manual_source_equivalent`
 * przy tworzeniu równoważnika i `_parametry_zwarciowe_zrodla` przy edycji): R/X i R/X (MIN)
 * to liczby DODATNIE. R/X = 0 nie opisuje sieci zasilającej (Z_Q bez rezystancji). Górnej
 * granicy IEC 60909-0 nie podaje — przyjmuje R_Q = 0,1·X_Q dla sieci powyżej 35 kV bez danych,
 * R/X sieci 110 kV bywa 0,05–0,3, a równoważnika SN z siecią kablową powyżej 1. Do karty
 * KATALOG-PRZEJECIE-PR były trzy wersje: kreator ≥ 0 (backend odmawiał zera), siatka (0; 1]
 * (bez podstawy normowej), konfigurator GPZ bez walidacji.
 */

export const KOMUNIKAT_STOSUNKU_RX = 'Stosunek R/X musi być liczbą dodatnią.';
export const KOMUNIKAT_STOSUNKU_RX_MIN = 'Stosunek R/X (MIN) musi być liczbą dodatnią.';

/** R/X poprawny: skończona liczba większa od zera. */
export function stosunekRxPoprawny(wartosc: unknown): wartosc is number {
  return typeof wartosc === 'number' && Number.isFinite(wartosc) && wartosc > 0;
}
