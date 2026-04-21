/**
 * Type Catalog Module (Public Exports)
 *
 * P8.2: UI Assign/Clear Type (Canonical Type Library parity)
 * P13a: Type Library Browser (4 tabs: Line, Cable, Transformer, Switch)
 * elementCatalogRegistry: Single source of truth for Element ↔ Catalog mapping
 * useCatalogAssignment: Reusable hook for catalog assignment flow
 */

export * from './types';
export * from './api';
export { TypePicker } from './TypePicker';
export { TypeLibraryBrowser } from './TypeLibraryBrowser';
export * from './elementCatalogRegistry';
export { useCatalogAssignment } from './useCatalogAssignment';
export type { CatalogAssignmentTarget, CatalogAssignmentState, CatalogAssignmentActions } from './useCatalogAssignment';
