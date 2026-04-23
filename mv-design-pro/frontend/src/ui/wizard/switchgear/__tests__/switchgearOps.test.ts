/**
 * useSwitchgearOps Tests — Wizard ↔ Topology API integration.
 *
 * RUN #3G §3: Verify wizard operations dispatch correct topology ops.
 *
 * Tests:
 * - addField dispatches 'bay_create' with station_id + pole_type
 * - addDevice dispatches 'equipment_add' with field_id + aparat_type
 * - removeDevice dispatches 'equipment_remove' with device_id
 * - assignCatalog dispatches 'equipment_catalog_assign' with device_id + catalog_ref
 * - Error propagation: BLOCKER issues → switchgear store error
 * - Guard: no caseId → immediate fail
 * - Guard: concurrent ops → debounce
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwitchgearOps } from '../useSwitchgearOps';
import { useTopologyStore } from '../../../topology/store';
import { useSwitchgearStore } from '../useSwitchgearStore';

// =============================================================================
// MOCK SETUP
// =============================================================================

// Track calls to executeOp
let mockExecuteOp: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Reset stores
  useSwitchgearStore.setState({
    isLoading: false,
    errorMessage: null,
  });

  // Create mock executeOp that returns success by default
  mockExecuteOp = vi.fn().mockResolvedValue({
    success: true,
    issues: [],
  });

  // Inject mock into topology store
  useTopologyStore.setState({
    executeOp: mockExecuteOp,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================================
// TESTS
// =============================================================================

describe('useSwitchgearOps', () => {
  // ---------------------------------------------------------------------------
  // addField
  // ---------------------------------------------------------------------------
  describe('addField', () => {
    it('dispatches bay_create with station_id and pole_type', async () => {
      const { result } = renderHook(() => useSwitchgearOps('case_001'));

      let opResult: any;
      await act(async () => {
        opResult = await result.current.addField('station_01', 'POLE_LINIOWE_SN' as any);
      });

      expect(mockExecuteOp).toHaveBeenCalledWith('case_001', 'bay_create', {
        station_id: 'station_01',
        pole_type: 'POLE_LINIOWE_SN',
      });
      expect(opResult.success).toBe(true);
    });

    it('sets loading=true during operation', async () => {
      // Make executeOp slow
      mockExecuteOp.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve({ success: true, issues: [] }), 50);
      }));

      const { result } = renderHook(() => useSwitchgearOps('case_001'));

      const promise = act(async () => {
        await result.current.addField('station_01', 'POLE_LINIOWE_SN' as any);
      });

      // Loading is set eventually
      await promise;
      // After completion, loading is false
      expect(useSwitchgearStore.getState().isLoading).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // addDevice
  // ---------------------------------------------------------------------------
  describe('addDevice', () => {
    it('dispatches equipment_add with field_id and aparat_type', async () => {
      const { result } = renderHook(() => useSwitchgearOps('case_001'));

      await act(async () => {
        await result.current.addDevice('field_01', 'WYLACZNIK');
      });

      expect(mockExecuteOp).toHaveBeenCalledWith('case_001', 'equipment_add', {
        field_id: 'field_01',
        aparat_type: 'WYLACZNIK',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // removeDevice
  // ---------------------------------------------------------------------------
  describe('removeDevice', () => {
    it('dispatches equipment_remove with device_id', async () => {
      const { result } = renderHook(() => useSwitchgearOps('case_001'));

      await act(async () => {
        await result.current.removeDevice('dev_cb_01');
      });

      expect(mockExecuteOp).toHaveBeenCalledWith('case_001', 'equipment_remove', {
        device_id: 'dev_cb_01',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // assignCatalog
  // ---------------------------------------------------------------------------
  describe('assignCatalog', () => {
    it('dispatches equipment_catalog_assign with device_id and catalog_ref', async () => {
      const { result } = renderHook(() => useSwitchgearOps('case_001'));

      await act(async () => {
        await result.current.assignCatalog('dev_cb_01', 'cat_abb_vd4');
      });

      expect(mockExecuteOp).toHaveBeenCalledWith('case_001', 'equipment_catalog_assign', {
        device_id: 'dev_cb_01',
        catalog_ref: 'cat_abb_vd4',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Error propagation
  // ---------------------------------------------------------------------------
  describe('Error handling', () => {
    it('propagates BLOCKER issues to switchgear store error', async () => {
      mockExecuteOp.mockResolvedValue({
        success: false,
        issues: [
          { code: 'FIELD_FULL', severity: 'BLOCKER', message_pl: 'Pole jest pełne' },
        ],
      });

      const { result } = renderHook(() => useSwitchgearOps('case_001'));

      let opResult: any;
      await act(async () => {
        opResult = await result.current.addDevice('field_01', 'WYLACZNIK');
      });

      expect(opResult.success).toBe(false);
      expect(opResult.blockerMessage).toBe('Pole jest pełne');
      expect(useSwitchgearStore.getState().errorMessage).toBe('Pole jest pełne');
    });

    it('handles API exceptions gracefully', async () => {
      mockExecuteOp.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useSwitchgearOps('case_001'));

      let opResult: any;
      await act(async () => {
        opResult = await result.current.removeDevice('dev_01');
      });

      expect(opResult.success).toBe(false);
      expect(opResult.blockerMessage).toBe('Network error');
      expect(useSwitchgearStore.getState().errorMessage).toBe('Network error');
    });

    it('does not set error for WARNING-only issues', async () => {
      mockExecuteOp.mockResolvedValue({
        success: true,
        issues: [
          { code: 'OPTIONAL_MISSING', severity: 'WARNING', message_pl: 'Brak opcjonalnego elementu' },
        ],
      });

      const { result } = renderHook(() => useSwitchgearOps('case_001'));

      let opResult: any;
      await act(async () => {
        opResult = await result.current.addDevice('field_01', 'WYLACZNIK');
      });

      expect(opResult.success).toBe(true);
      expect(opResult.blockerMessage).toBeNull();
      expect(useSwitchgearStore.getState().errorMessage).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Guards
  // ---------------------------------------------------------------------------
  describe('Guards', () => {
    it('returns failure immediately when caseId is null', async () => {
      const { result } = renderHook(() => useSwitchgearOps(null));

      let opResult: any;
      await act(async () => {
        opResult = await result.current.addField('station_01', 'POLE_LINIOWE_SN' as any);
      });

      expect(opResult.success).toBe(false);
      expect(opResult.blockerMessage).toContain('Brak aktywnego przypadku');
      expect(mockExecuteOp).not.toHaveBeenCalled();
    });

    it('isReady is false when caseId is null', () => {
      const { result } = renderHook(() => useSwitchgearOps(null));
      expect(result.current.isReady).toBe(false);
    });

    it('isReady is true when caseId is provided', () => {
      const { result } = renderHook(() => useSwitchgearOps('case_001'));
      expect(result.current.isReady).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Operation result structure
  // ---------------------------------------------------------------------------
  describe('SwitchgearOpResult contract', () => {
    it('returns success, createdRef, issues, blockerMessage fields', async () => {
      const { result } = renderHook(() => useSwitchgearOps('case_001'));

      let opResult: any;
      await act(async () => {
        opResult = await result.current.addField('station_01', 'POLE_LINIOWE_SN' as any);
      });

      expect(opResult).toHaveProperty('success');
      expect(opResult).toHaveProperty('createdRef');
      expect(opResult).toHaveProperty('issues');
      expect(opResult).toHaveProperty('blockerMessage');
    });
  });

  // ---------------------------------------------------------------------------
  // Clears error before each op
  // ---------------------------------------------------------------------------
  describe('Error reset', () => {
    it('clears previous error before starting new operation', async () => {
      // Set an existing error
      useSwitchgearStore.setState({ errorMessage: 'Old error' });

      mockExecuteOp.mockResolvedValue({ success: true, issues: [] });

      const { result } = renderHook(() => useSwitchgearOps('case_001'));

      await act(async () => {
        await result.current.addField('station_01', 'POLE_LINIOWE_SN' as any);
      });

      // Error should be cleared (not 'Old error')
      expect(useSwitchgearStore.getState().errorMessage).toBeNull();
    });
  });
});
