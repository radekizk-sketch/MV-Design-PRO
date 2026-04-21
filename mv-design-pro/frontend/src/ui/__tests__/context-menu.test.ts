/**
 * Context Menu Tests
 *
 * CANONICAL ALIGNMENT:
 * - wizard_screens.md § 4: Menu Kontekstowe specifications
 * - sld_rules.md § E.2, § E.3: Context Menu patterns
 *
 * Tests:
 * - Mode-aware action enabling/disabling
 * - RESULT_VIEW blocks mutations
 * - Polish labels
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildContextMenuActions,
  buildBusContextMenu,
  buildNetworkModelContextMenu,
  getContextMenuHeader,
} from '../context-menu/actions';

describe('Context Menu Actions', () => {
  describe('buildContextMenuActions', () => {
    it('should enable all mutation actions in MODEL_EDIT mode', () => {
      const actions = buildContextMenuActions(
        'Bus',
        'bus-1',
        'Szyna główna',
        'MODEL_EDIT',
        { inService: true }
      );

      const inServiceAction = actions.find((a) => a.id === 'in_service');
      expect(inServiceAction).toBeDefined();
      expect(inServiceAction!.enabled).toBe(true);

      const deleteAction = actions.find((a) => a.id === 'delete');
      expect(deleteAction).toBeDefined();
      expect(deleteAction!.enabled).toBe(true);
    });

    it('should disable mutation actions in RESULT_VIEW mode', () => {
      const actions = buildContextMenuActions(
        'Bus',
        'bus-1',
        'Szyna główna',
        'RESULT_VIEW',
        { inService: true }
      );

      const inServiceAction = actions.find((a) => a.id === 'in_service');
      expect(inServiceAction).toBeDefined();
      expect(inServiceAction!.enabled).toBe(false);

      // Delete action should not be visible in RESULT_VIEW
      const deleteAction = actions.find((a) => a.id === 'delete');
      expect(deleteAction).toBeUndefined();
    });

    it('should always enable navigation actions', () => {
      const modes = ['MODEL_EDIT', 'CASE_CONFIG', 'RESULT_VIEW'] as const;

      for (const mode of modes) {
        const actions = buildContextMenuActions('Bus', 'bus-1', 'Szyna główna', mode);

        const showInTreeAction = actions.find((a) => a.id === 'show_in_tree');
        expect(showInTreeAction).toBeDefined();
        expect(showInTreeAction!.enabled).toBe(true);

        const showOnDiagramAction = actions.find((a) => a.id === 'show_on_diagram');
        expect(showOnDiagramAction).toBeDefined();
        expect(showOnDiagramAction!.enabled).toBe(true);
      }
    });

    it('should show results-specific actions in RESULT_VIEW', () => {
      const actions = buildContextMenuActions('Bus', 'bus-1', 'Szyna główna', 'RESULT_VIEW');

      const resultsDetailAction = actions.find((a) => a.id === 'results_detail');
      expect(resultsDetailAction).toBeDefined();
      expect(resultsDetailAction!.enabled).toBe(true);
      expect(resultsDetailAction!.label).toBe('Pokaż szczegóły wyników');

      const exportResultsAction = actions.find((a) => a.id === 'export_results');
      expect(exportResultsAction).toBeDefined();
      expect(exportResultsAction!.label).toBe('Eksportuj wyniki...');
    });

    it('should not show results actions in MODEL_EDIT', () => {
      const actions = buildContextMenuActions('Bus', 'bus-1', 'Szyna główna', 'MODEL_EDIT');

      const resultsDetailAction = actions.find((a) => a.id === 'results_detail');
      expect(resultsDetailAction).toBeUndefined();
    });
  });

  describe('Switch-specific actions', () => {
    it('should show toggle switch action for Switch elements', () => {
      const actions = buildContextMenuActions(
        'Switch',
        'switch-1',
        'Wyłącznik Q1',
        'MODEL_EDIT',
        { switchState: 'CLOSED' }
      );

      const toggleAction = actions.find((a) => a.id === 'toggle_switch');
      expect(toggleAction).toBeDefined();
      expect(toggleAction!.label).toBe('Otwórz łącznik');
      expect(toggleAction!.enabled).toBe(true);
    });

    it('should show correct label for OPEN switch', () => {
      const actions = buildContextMenuActions(
        'Switch',
        'switch-1',
        'Wyłącznik Q1',
        'MODEL_EDIT',
        { switchState: 'OPEN' }
      );

      const toggleAction = actions.find((a) => a.id === 'toggle_switch');
      expect(toggleAction!.label).toBe('Zamknij łącznik');
    });

    it('should disable toggle switch action in RESULT_VIEW', () => {
      const actions = buildContextMenuActions(
        'Switch',
        'switch-1',
        'Wyłącznik Q1',
        'RESULT_VIEW',
        { switchState: 'CLOSED' }
      );

      const toggleAction = actions.find((a) => a.id === 'toggle_switch');
      expect(toggleAction).toBeDefined();
      expect(toggleAction!.enabled).toBe(false);
    });
  });

  describe('buildBusContextMenu', () => {
    it('should include connect submenu in MODEL_EDIT', () => {
      const actions = buildBusContextMenu('bus-1', 'Szyna SN', 'MODEL_EDIT');

      const connectAction = actions.find((a) => a.id === 'connect');
      expect(connectAction).toBeDefined();
      expect(connectAction!.submenu).toBeDefined();
      expect(connectAction!.submenu!.length).toBeGreaterThan(0);

      const submenuLabels = connectAction!.submenu!.map((a) => a.label);
      expect(submenuLabels).toContain('Linię/kabel...');
      expect(submenuLabels).toContain('Transformator...');
      expect(submenuLabels).toContain('Wyłącznik...');
    });

    it('should not include connect submenu in RESULT_VIEW', () => {
      const actions = buildBusContextMenu('bus-1', 'Szyna SN', 'RESULT_VIEW');

      const connectAction = actions.find((a) => a.id === 'connect');
      expect(connectAction).toBeUndefined();
    });
  });

  describe('buildNetworkModelContextMenu', () => {
    it('should have Add submenu only with GPZ start action', () => {
      const actions = buildNetworkModelContextMenu('MODEL_EDIT');

      const addAction = actions.find((a) => a.id === 'add');
      expect(addAction).toBeDefined();
      expect(addAction!.submenu).toBeDefined();

      const submenuLabels = addAction!.submenu!.map((a) => a.label);
      expect(submenuLabels).toEqual(['Dodaj GPZ...']);
    });

    it('should disable Add submenu items in RESULT_VIEW', () => {
      const actions = buildNetworkModelContextMenu('RESULT_VIEW');

      const addAction = actions.find((a) => a.id === 'add');
      expect(addAction).toBeDefined();
      expect(addAction!.enabled).toBe(false);
    });

    it('should always enable validate action', () => {
      const modes = ['MODEL_EDIT', 'CASE_CONFIG', 'RESULT_VIEW'] as const;

      for (const mode of modes) {
        const actions = buildNetworkModelContextMenu(mode);
        const validateAction = actions.find((a) => a.id === 'validate');
        expect(validateAction).toBeDefined();
        expect(validateAction!.enabled).toBe(true);
      }
    });
  });

  describe('getContextMenuHeader', () => {
    it('should return Polish labels for element types', () => {
      expect(getContextMenuHeader('Bus', 'Szyna-01')).toContain('Szyna');
      expect(getContextMenuHeader('LineBranch', 'Linia-01')).toContain('Linia');
      expect(getContextMenuHeader('TransformerBranch', 'TR-01')).toContain('Transformator');
      expect(getContextMenuHeader('Switch', 'WŁ-01')).toContain('Łącznik');
      expect(getContextMenuHeader('Source', 'Źródło-01')).toContain('Źródło');
      expect(getContextMenuHeader('Load', 'Odbiornik-01')).toContain('Odbiornik');
    });

    it('should include element name in header', () => {
      const header = getContextMenuHeader('Bus', 'SZ-GPZ-SN');
      expect(header).toContain('SZ-GPZ-SN');
    });
  });

  describe('Action handlers', () => {
    it('should call handler when provided', () => {
      const mockHandler = vi.fn();
      const actions = buildContextMenuActions(
        'Bus',
        'bus-1',
        'Szyna główna',
        'MODEL_EDIT',
        { onOpenProperties: mockHandler }
      );

      const propertiesAction = actions.find((a) => a.id === 'properties');
      expect(propertiesAction).toBeDefined();
      expect(propertiesAction!.handler).toBe(mockHandler);
    });
  });
});
