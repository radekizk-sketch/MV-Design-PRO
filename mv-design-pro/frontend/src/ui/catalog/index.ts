/**
 * Type Catalog Module (Public Exports)
 *
 * P8.2: UI Assign/Clear Type (Canonical Type Library parity)
 * P13a: Type Library Browser (4 tabs: Line, Cable, Transformer, Switch)
 * elementCatalogRegistry: Single source of truth for Element ↔ Catalog mapping
 * Przypisanie typu do elementu: operacja domenowa `assign_catalog_to_element` z pickera typu
 * (`TypePicker`, filtr `dopuszczenieNowychPol`) albo z kreatora przypisania katalogu.
 */

export * from './types';
export * from './api';
export { TypePicker } from './TypePicker';
export { TypeLibraryBrowser } from './TypeLibraryBrowser';
export * from './elementCatalogRegistry';
