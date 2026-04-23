/**
 * useSwitchgearOps — Integration hook: Wizard actions → Topology API.
 *
 * RUN #3G §3: Wire wizard CRUD to backend via POST /enm/ops.
 *
 * Each operation:
 *  1. Calls executeTopologyOp(caseId, opName, data)
 *  2. On success, sets reload flag for the calling screen to refresh
 *  3. On BLOCKER issues, sets error in switchgear store
 *
 * BINDING: No auto-guessing, no fabrication. Operations fail openly.
 * DETERMINISTIC: Same op + same data → same backend call.
 */

import { useCallback, useRef } from 'react';
import { useTopologyStore } from '../../topology/store';
import { useSwitchgearStore } from './useSwitchgearStore';
import type { PoleTypeV1 } from '../../sld/core/fieldDeviceContracts';
import type { TopologyOpIssue } from '../../../types/enm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwitchgearOpResult {
  /** Whether the operation succeeded */
  readonly success: boolean;
  /** Created element ref (for bay_create, equipment_add) */
  readonly createdRef: string | null;
  /** Issues returned by backend */
  readonly issues: readonly TopologyOpIssue[];
  /** First BLOCKER message (null if no blockers) */
  readonly blockerMessage: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook providing topology-backed operations for the switchgear wizard.
 *
 * @param caseId - Active study case ID. Required for all operations.
 * @returns Object with async operation functions.
 */
export function useSwitchgearOps(caseId: string | null) {
  const executeOp = useTopologyStore((s) => s.executeOp);
  const setError = useSwitchgearStore((s) => s.setError);
  const setLoading = useSwitchgearStore((s) => s.setLoading);

  // Ref to prevent concurrent ops (debounce guard)
  const opInProgress = useRef(false);

  /**
   * Internal helper: execute a topology op and handle errors.
   */
  const runOp = useCallback(
    async (
      op: string,
      data: Record<string, unknown>,
    ): Promise<SwitchgearOpResult> => {
      if (!caseId) {
        return {
          success: false,
          createdRef: null,
          issues: [],
          blockerMessage: 'Brak aktywnego przypadku (caseId)',
        };
      }

      if (opInProgress.current) {
        return {
          success: false,
          createdRef: null,
          issues: [],
          blockerMessage: 'Operacja w toku — poczekaj na zakończenie',
        };
      }

      opInProgress.current = true;
      setLoading(true);
      setError(null);

      try {
        const result = await executeOp(caseId, op, data);
        const blockers = result.issues.filter(
          (i: TopologyOpIssue) => i.severity === 'BLOCKER',
        );
        const blockerMessage =
          blockers.length > 0 ? blockers[0].message_pl : null;

        if (!result.success && blockerMessage) {
          setError(blockerMessage);
        }

        return {
          success: result.success,
          createdRef: null, // Backend returns this in result, but store doesn't expose it
          issues: result.issues,
          blockerMessage,
        };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Nieznany błąd operacji';
        setError(msg);
        return {
          success: false,
          createdRef: null,
          issues: [],
          blockerMessage: msg,
        };
      } finally {
        opInProgress.current = false;
        setLoading(false);
      }
    },
    [caseId, executeOp, setError, setLoading],
  );

  // ---------------------------------------------------------------------------
  // Public operations
  // ---------------------------------------------------------------------------

  /**
   * Add a new field (bay) to a station.
   * Backend op: bay_create
   */
  const addField = useCallback(
    async (stationId: string, poleType: PoleTypeV1): Promise<SwitchgearOpResult> => {
      return runOp('bay_create', {
        station_id: stationId,
        pole_type: poleType,
      });
    },
    [runOp],
  );

  /**
   * Add a new device (equipment) to a field.
   * Backend op: equipment_add
   */
  const addDevice = useCallback(
    async (fieldId: string, aparatType: string): Promise<SwitchgearOpResult> => {
      return runOp('equipment_add', {
        field_id: fieldId,
        aparat_type: aparatType,
      });
    },
    [runOp],
  );

  /**
   * Remove a device (equipment) from a field.
   * Backend op: equipment_remove
   */
  const removeDevice = useCallback(
    async (deviceId: string): Promise<SwitchgearOpResult> => {
      return runOp('equipment_remove', {
        device_id: deviceId,
      });
    },
    [runOp],
  );

  /**
   * Assign a catalog entry to a device.
   * Backend op: equipment_catalog_assign
   */
  const assignCatalog = useCallback(
    async (deviceId: string, catalogRef: string): Promise<SwitchgearOpResult> => {
      return runOp('equipment_catalog_assign', {
        device_id: deviceId,
        catalog_ref: catalogRef,
      });
    },
    [runOp],
  );

  // ---------------------------------------------------------------------------
  // Config backend sync (RUN #3I)
  // ---------------------------------------------------------------------------

  const loadConfig = useSwitchgearStore((s) => s.loadFromBackend);
  const saveConfig = useSwitchgearStore((s) => s.saveToBackend);
  const validateConfig = useSwitchgearStore((s) => s.validateWithBackend);

  return {
    addField,
    addDevice,
    removeDevice,
    assignCatalog,
    /** Config backend operations (RUN #3I) */
    loadConfig,
    saveConfig,
    validateConfig,
    /** Whether any operation is currently running */
    isReady: caseId !== null,
  } as const;
}
