import { describe, expect, it } from 'vitest';

import { validateCatalogFirst } from '../catalogFirstRules';

/**
 * Pokrycie skupione na operacjach nN dodanych kartą P0.9 (reguła KLASA NIE
 * INSTANCJA §2: iloczyn cech operacja × sposób podania katalogu). Moduł nie
 * miał WCZEŚNIEJ żadnego testu — pełny retroaktywny audyt wszystkich gałęzi
 * przedkartowych jest poza zasięgiem P0.9 (nazwane w meldunku karty), ale
 * zachowanie domyślne (operacja spoza tabeli) i jedna gałąź przedkartowa są
 * tu pokryte jako dowód, że rozszerzenie nie zepsuło reszty przełącznika.
 */
describe('validateCatalogFirst', () => {
  it('nie blokuje operacji spoza tabeli (zachowanie domyślne switch)', () => {
    // `add_nn_load` NIE JEST już przykładem „spoza tabeli" — karta D4 dopisała
    // dla niej case (patrz opisany niżej blok `add_nn_load`). Przykład zastąpiony
    // nazwą operacji celowo nieistniejącą w switchu.
    expect(validateCatalogFirst('nieznana_operacja_xyz', {})).toBeNull();
  });

  it('pilnuje istniejącej operacji SN (add_relay) — dowód, że rozszerzenie nie zepsuło przełącznika', () => {
    expect(validateCatalogFirst('add_relay', {})).not.toBeNull();
    expect(validateCatalogFirst('add_relay', { catalog_ref: 'relay-1' })).toBeNull();
  });

  describe.each([
    ['add_nn_cable_segment' as const],
    ['add_nn_switch_device' as const],
    ['add_nn_section_coupler' as const],
  ])('%s (P0.9)', (op) => {
    it('blokuje bez catalog_ref i bez catalog_binding', () => {
      expect(validateCatalogFirst(op, {})).toEqual(expect.stringContaining('katalog'));
    });

    it('przepuszcza z catalog_ref (napis niepusty)', () => {
      expect(validateCatalogFirst(op, { catalog_ref: 'kabel-nn-1' })).toBeNull();
    });

    it('przepuszcza z catalog_binding.catalog_item_id', () => {
      expect(
        validateCatalogFirst(op, { catalog_binding: { catalog_item_id: 'kabel-nn-1' } }),
      ).toBeNull();
    });

    it('blokuje catalog_ref pusty/białe znaki', () => {
      expect(validateCatalogFirst(op, { catalog_ref: '   ' })).not.toBeNull();
    });

    it('blokuje catalog_binding bez catalog_item_id', () => {
      expect(validateCatalogFirst(op, { catalog_binding: {} })).not.toBeNull();
    });
  });

  it('NIE waliduje add_nn_distribution_board (payload własny nie niesie catalog_ref — sprawdzenie żyje w zagnieżdżonym `supply`, poza tym walidatorem)', () => {
    expect(validateCatalogFirst('add_nn_distribution_board', { voltage_kv: 0.4 })).toBeNull();
  });

  describe('add_nn_load (karta D4 — rekonsyliacja rozjazdu wymogu katalogu)', () => {
    it('blokuje bez catalog_ref, bez catalog_binding i bez deklaracji trybu eksperckiego (katalog-first domyślne)', () => {
      expect(validateCatalogFirst('add_nn_load', {})).toEqual(expect.stringContaining('katalog'));
    });

    it('przepuszcza z catalog_binding.catalog_item_id', () => {
      expect(
        validateCatalogFirst('add_nn_load', { catalog_binding: { catalog_item_id: 'load-1' } }),
      ).toBeNull();
    });

    it('przepuszcza z jawną deklaracją trybu eksperckiego (source_mode: EKSPERCKI_RECZNY) — TEN SAM '
      + 'wyróżnik, którym operacja domenowa add_nn_load i bramka API rozpoznają tryb ekspercki', () => {
      expect(validateCatalogFirst('add_nn_load', { source_mode: 'EKSPERCKI_RECZNY' })).toBeNull();
    });

    it('nie przepuszcza żadnej innej wartości source_mode — tylko EKSPERCKI_RECZNY zwalnia z katalogu', () => {
      expect(validateCatalogFirst('add_nn_load', { source_mode: 'KATALOG' })).not.toBeNull();
      expect(validateCatalogFirst('add_nn_load', { source_mode: 'inny' })).not.toBeNull();
    });
  });
});
