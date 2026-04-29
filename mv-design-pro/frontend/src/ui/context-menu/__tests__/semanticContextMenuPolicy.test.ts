import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EngineeringContextMenu } from '../EngineeringContextMenu';
import {
  buildSemanticRoleContextMenuActions,
  semanticActionOperationId,
} from '../semanticContextMenuPolicy';
import { buildSemanticContextActionSet } from '../../engineering-semantic/semanticContextActions';
import type {
  SemanticContextMenuElement,
  SemanticEngineeringRole,
} from '../../engineering-semantic/semanticContextActions';

function elementWithRole(role: SemanticEngineeringRole): SemanticContextMenuElement {
  return {
    refId: `element-${role}`,
    elementKind: role === 'GPZ_SUPPLY_NODE'
      ? 'GPZ'
      : role === 'BUSBAR_SECTION'
        ? 'BUSBAR_SECTION'
        : role === 'MV_CABLE_SEGMENT'
          ? 'MV_CABLE_SEGMENT'
          : role === 'MV_OVERHEAD_SEGMENT'
            ? 'MV_OVERHEAD_SEGMENT'
            : role === 'MV_LV_TRANSFORMER'
              ? 'TRANSFORMER'
              : 'MV_BAY',
    engineeringRole: role,
    semanticHash: 'semantic-test',
  };
}

describe('semantic context menu adapter', () => {
  it('maps EngineeringRole to ContextMenuAction without local ElementType decisions', () => {
    const handlers = new Proxy<Record<string, () => void>>(
      {},
      { get: () => vi.fn() },
    );
    const actions = buildSemanticRoleContextMenuActions(
      elementWithRole('LINE_FEEDER_BAY'),
      'MODEL_EDIT',
      handlers,
    );

    expect(actions.map((action) => action.id)).toContain('derive_cable_section');
    expect(actions.map((action) => action.id)).toContain('derive_overhead_section');
    expect(actions.every((action) => action.testId?.startsWith('context-menu-semantic-'))).toBe(true);
  });

  it('uses operationId for canonical domain routing', () => {
    const handlers = new Proxy<Record<string, () => void>>(
      {},
      { get: () => vi.fn() },
    );
    const actions = buildSemanticRoleContextMenuActions(
      elementWithRole('COUPLER_BAY'),
      'MODEL_EDIT',
      handlers,
    );
    const couplerAction = actions.find((action) => action.id === 'connect_busbar_sections');

    expect(couplerAction).toBeDefined();
    expect(couplerAction?.actionKey).toBe('connect_busbar_sections');
    expect(couplerAction?.enabled).toBe(true);
    expect(couplerAction?.handler).toBeDefined();

    const semanticDefinition = buildSemanticContextActionSet(
      elementWithRole('COUPLER_BAY'),
    ).actions.find((action) => action.actionId === 'connect_busbar_sections');
    expect(semanticDefinition).toBeDefined();
    expect(semanticActionOperationId(semanticDefinition!)).toBe('insert_section_switch_sn');
  });

  it('blocks semantic actions without a handler instead of creating an empty click', () => {
    const actions = buildSemanticRoleContextMenuActions(
      elementWithRole('GPZ_SUPPLY_NODE'),
      'MODEL_EDIT',
      {},
    );
    const editableActions = actions.filter((action) => action.section === 'Edytuj');

    expect(editableActions.length).toBeGreaterThan(0);
    for (const action of editableActions) {
      expect(action.enabled).toBe(false);
      expect(action.blockedReason).toContain('Brak');
    }
  });

  it('keeps result actions blocked outside RESULT_VIEW with an explicit reason', () => {
    const handlers = new Proxy<Record<string, () => void>>(
      {},
      { get: () => vi.fn() },
    );
    const actions = buildSemanticRoleContextMenuActions(
      elementWithRole('MV_CABLE_SEGMENT'),
      'MODEL_EDIT',
      handlers,
    );
    const resultAction = actions.find((action) => action.id === 'show_results');

    expect(resultAction).toBeDefined();
    expect(resultAction?.enabled).toBe(false);
    expect(resultAction?.blockedReason).toContain('Najpierw uruchom obliczenia');
  });

  it('EngineeringContextMenu uses semanticElement role before legacy ElementType builder', () => {
    render(createElement(EngineeringContextMenu, {
      state: {
        isOpen: true,
        x: 10,
        y: 10,
        elementId: 'bay-1',
        elementType: 'TransformerBranch',
        elementName: 'Legacy type says transformer',
        semanticElement: elementWithRole('LINE_FEEDER_BAY'),
      },
      mode: 'MODEL_EDIT',
      onClose: vi.fn(),
      onOperation: vi.fn(),
    }));

    expect(screen.getByTestId('context-menu-semantic-derive_cable_section')).toBeInTheDocument();
    expect(screen.getByTestId('context-menu-semantic-derive_overhead_section')).toBeInTheDocument();
  });

  it('EngineeringContextMenu does not use BUILDER_REGISTRY[elementType] in the production path without semantic context', () => {
    render(createElement(EngineeringContextMenu, {
      state: {
        isOpen: true,
        x: 10,
        y: 10,
        elementId: 'bus-1',
        elementType: 'Bus',
        elementName: 'Bus without semantic context',
      },
      mode: 'MODEL_EDIT',
      onClose: vi.fn(),
      onOperation: vi.fn(),
    }));

    expect(screen.getByTestId('context-menu-semantic-unavailable')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });

  it('EngineeringContextMenu blocks legacy builders when semanticHash exists without semanticElement', () => {
    render(createElement(EngineeringContextMenu, {
      state: {
        isOpen: true,
        x: 10,
        y: 10,
        elementId: 'bus-2',
        elementType: 'Bus',
        elementName: 'Bus with semantic hash only',
        semanticHash: 'hash-without-element',
        legacyMenuMode: 'element-type-builders',
      },
      mode: 'MODEL_EDIT',
      onClose: vi.fn(),
      onOperation: vi.fn(),
    }));

    const diagnosticAction = screen.getByTestId('context-menu-semantic-unavailable');
    expect(diagnosticAction).toBeInTheDocument();
    expect(diagnosticAction).toHaveAttribute(
      'title',
      'Element ma hash semantyczny, ale nie dostarczono semanticElement dla polityki menu.',
    );
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });

  it('allows ElementType builders only when legacy mode is explicitly marked', () => {
    render(createElement(EngineeringContextMenu, {
      state: {
        isOpen: true,
        x: 10,
        y: 10,
        elementId: 'bus-legacy',
        elementType: 'Bus',
        elementName: 'Legacy fixture bus',
        legacyMenuMode: 'element-type-builders',
      },
      mode: 'MODEL_EDIT',
      onClose: vi.fn(),
      onOperation: vi.fn(),
    }));

    expect(screen.queryByTestId('context-menu-semantic-unavailable')).not.toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(1);
  });
});
