/**
 * CDSE Modal Dispatcher — maps resolved context to modal targets.
 *
 * ZERO FABRYKACJI (karta W2 pkt 3, 2026-09-09): mapowanie `PROTECTION_DEVICE`
 * → `EditProtectionModal` wskazywał komponent, którego NIE MA w `frontend/src`
 * (`find frontend/src -iname "*EditProtectionModal*"` = 0), a operacja
 * `update_relay_settings` jest wyłączonym stubem backendu
 * (`enm/domain_operations_v2.py`, kod `relay.legacy_write_disabled`).
 * Inwentarz klasy (ta sama kontrola dla WSZYSTKICH 13 wpisów mapy, nie tylko
 * nazwanego w audycie): `find frontend/src -iname "*<Nazwa>*"` = 0 dla
 * KAŻDEGO z `CdseModalId` — AddTrunkSegmentModal, InsertStationModal,
 * AddBranchModal, ConnectRingModal, EditDeviceModal, EditBusSectionModal,
 * EditLoadModal, EditSourceModal, EditInverterSourceModal, EditProtectionModal,
 * EditMeasurementModal, EditSwitchModal, PropertyGridModal — ŻADEN nie istnieje
 * jako komponent. Kanoniczna edycja SLD biegnie inną, żywą ścieżką
 * (`ui/sld/v2/command/SldCommandService.ts` + `sldActionExecutor.ts`, którą
 * pilnuje `scripts/dead_click_guard.py`); ten dyspozytor (`modules/sld/cdse/`)
 * nie ma dziś ŻADNEGO konsumenta w `ui/` poza własnym pakietem
 * (`sldEventRouter.ts`/`index.ts`/testy) — `routeSldClick`/`routeSldDoubleClick`
 * nie są wołane z żadnego realnego ekranu.
 *
 * Tabela zostaje PUSTA, dopóki nie powstanie REALNY modal pod daną nazwą —
 * `dispatchModal` zwraca `null` dla każdego kontekstu, co `sldEventRouter.ts`
 * już poprawnie obsługuje (`SELECTION_ONLY`/`NO_ACTION`, zero zmian tam
 * potrzebnych). Nowy wpis wolno dodać WYŁĄCZNIE razem z realnym komponentem
 * modala pod tą samą nazwą — nigdy jako obietnica bez pokrycia.
 *
 * INVARIANTS:
 * - Deterministic: same context → same modal (or `null`, honestly, until built)
 * - A mapped modal maps to exactly one canonical operation
 * - No fallback logic, no heuristics
 * - Zero fabrykacji: no modalId here without a real component under that name
 */

import type { CdseContextType, CdseResolvedContext } from './contextResolver';

/**
 * Canonical surface identifiers — match operationSurfaceRegistry entries.
 */
export type CdseModalId =
  | 'AddTrunkSegmentModal'
  | 'InsertStationModal'
  | 'AddBranchModal'
  | 'ConnectRingModal'
  | 'EditDeviceModal'
  | 'EditBusSectionModal'
  | 'EditLoadModal'
  | 'EditSourceModal'
  | 'EditInverterSourceModal'
  | 'EditProtectionModal'
  | 'EditMeasurementModal'
  | 'EditSwitchModal'
  | 'PropertyGridModal';

/**
 * Modal dispatch target — fully resolved modal opening instruction.
 */
export interface ModalDispatchTarget {
  /** Modal component identifier */
  modalId: CdseModalId;
  /** Canonical operation this modal will execute */
  canonicalOp: string;
  /** Catalog namespace for pre-populating catalog picker (if applicable) */
  catalogNamespace?: string;
  /** Pre-filled context data for the modal */
  contextData: {
    elementId: string;
    portId?: string;
    trunkId?: string;
    segmentId?: string;
    terminalId?: string;
    branchId?: string;
    stationId?: string;
  };
}

/**
 * Context type → modal mapping table.
 *
 * PUSTA (karta W2 pkt 3): każdy z 13 wpisów, które kiedyś tu stały, mapował na
 * komponent nieobecny w `frontend/src` — usunięte razem, nie tylko
 * `PROTECTION_DEVICE` nazwany w audycie (patrz inwentarz klasy w komentarzu
 * pliku powyżej). Partial, nie total: żaden kontekst nie ma dziś prawa do
 * modala, którego nie ma — `dispatchModal` zwraca `null` dla każdego z nich.
 */
const CONTEXT_TO_MODAL: Partial<
  Record<CdseContextType, { modalId: CdseModalId; canonicalOp: string }>
> = {};

/**
 * Dispatch a modal for the given resolved context.
 *
 * Returns a fully-resolved ModalDispatchTarget, or `null` when the context has
 * no mapped modal — today that is EVERY context (karta W2 pkt 3: the table is
 * empty until a real modal component exists for it). Zero fabrykacji: never
 * invents a target the UI cannot actually open.
 *
 * @param context - Resolved context from contextResolver
 * @returns ModalDispatchTarget or null
 */
export function dispatchModal(context: CdseResolvedContext): ModalDispatchTarget | null {
  const mapping = CONTEXT_TO_MODAL[context.contextType];
  if (!mapping) {
    return null;
  }

  return {
    modalId: mapping.modalId,
    canonicalOp: mapping.canonicalOp,
    catalogNamespace: context.catalogNamespace,
    contextData: {
      elementId: context.elementId,
      portId: context.portId,
      trunkId: context.trunkId,
      segmentId: context.segmentId,
      terminalId: context.terminalId,
      branchId: context.branchId,
      stationId: context.stationId,
    },
  };
}

/**
 * Get all registered modal mappings — for CI guard validation.
 */
export function getAllModalMappings(): Array<{
  contextType: CdseContextType;
  modalId: CdseModalId;
  canonicalOp: string;
}> {
  return Object.entries(CONTEXT_TO_MODAL).map(([contextType, mapping]) => ({
    contextType: contextType as CdseContextType,
    modalId: mapping.modalId,
    canonicalOp: mapping.canonicalOp,
  }));
}
