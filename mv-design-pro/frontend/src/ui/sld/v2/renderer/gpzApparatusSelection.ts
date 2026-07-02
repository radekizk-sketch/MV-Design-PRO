/**
 * SLD V2 — wspólny kontrakt selekcji aparatu GPZ.
 *
 * Jedno źródło prawdy dla identyfikatorów i payloadu selekcji aparatów GPZ,
 * współdzielone przez `GpzCanonicalRenderer` oraz `GpzSwitchgearRenderer`.
 * Dzięki temu oba renderery emitują BYTE-IDENTYCZNE stringi `apparatusId`
 * (`${bayRef}#${kind}`), które `SldWorkspaceContainer.parseGpzApparatusSelectionId`
 * rozkłada poprawnie — co umożliwia użycie `GpzSwitchgearRenderer` jako
 * drop-in renderera GPZ bez utraty interakcji detail-drawer / context-menu.
 */

/**
 * Kanoniczne rodzaje aparatów GPZ rozpoznawane przez warstwę selekcji.
 * Identyczna unia jak historyczny `CanonicalGpzApparatusKind`.
 */
export type GpzApparatusKind =
  | 'disconnect_bus'
  | 'breaker'
  | 'ct'
  | 'vt'
  | 'switch_disconnector'
  | 'earthing_switch'
  | 'fuse'
  | 'cable_head'
  | 'transformer_symbol';

/**
 * Payload selekcji pojedynczego aparatu pola GPZ.
 *
 *  - `apparatusId`  : `${bayRef}#${apparatusKind}` (parsowalne w kontenerze).
 *  - `bayRef`       : ref pola, do którego należy aparat.
 *  - `apparatusKind`: rodzaj aparatu (jeden z `GpzApparatusKind`).
 *  - `designation`  : oznaczenie IEC 81346 (np. "Q0"), null gdy brak.
 *  - `labelPl`      : polska etykieta aparatu (np. "Wyłącznik").
 */
export interface GpzApparatusSelection {
  readonly apparatusId: string;
  readonly bayRef: string;
  readonly apparatusKind: GpzApparatusKind;
  readonly designation: string | null;
  readonly labelPl: string;
}

/**
 * Buduje kanoniczny identyfikator aparatu (`${bayRef}#${kind}`).
 * MUSI pozostać spójny z `parseGpzApparatusSelectionId` w kontenerze.
 */
export function gpzApparatusId(bayRef: string, kind: GpzApparatusKind): string {
  return `${bayRef}#${kind}`;
}
