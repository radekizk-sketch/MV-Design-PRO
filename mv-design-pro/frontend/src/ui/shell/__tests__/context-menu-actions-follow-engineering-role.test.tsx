import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  buildSemanticContextActionSet,
  findSemanticContextActionPolicyViolations,
  type SemanticEngineeringRole,
  type SemanticContextMenuElement,
} from '../../engineering-semantic/semanticContextActions';
import { EngineeringContextMenu } from '../../context-menu/EngineeringContextMenu';
import { buildSemanticRoleContextMenuActions } from '../../context-menu/semanticContextMenuPolicy';
import type { ElementType } from '../../types';

function element(role: SemanticEngineeringRole, elementKind = role): SemanticContextMenuElement {
  return {
    refId: `${role.toLowerCase()}-1`,
    engineeringRole: role,
    elementKind,
    semanticHash: `hash-${role}`,
  };
}

function enabledHandlers(): Record<string, () => void> {
  return new Proxy<Record<string, () => void>>(
    {},
    {
      get: () => vi.fn(),
    },
  );
}

function actionIds(role: SemanticEngineeringRole, elementKind?: string): string[] {
  return buildSemanticRoleContextMenuActions(
    element(role, elementKind),
    'MODEL_EDIT',
    enabledHandlers(),
  ).map((action) => action.id);
}

describe('context menu actions follow production engineering role policy', () => {
  it.each([
    ['LINE_FEEDER_BAY', ['derive_cable_section', 'derive_overhead_section'], ['add_transformer_sn_nn']],
    ['TRANSFORMER_BAY', ['add_transformer_sn_nn'], ['derive_cable_section']],
    ['BUSBAR_SECTION', ['add_sn_bay', 'add_transformer_bay'], ['derive_cable_section']],
    ['MV_CABLE_SEGMENT', ['insert_station_on_segment_sn', 'continue_trunk_segment_sn'], ['add_transformer_sn_nn']],
    ['MV_OVERHEAD_SEGMENT', ['insert_station_on_segment_sn', 'continue_trunk_segment_sn'], ['add_transformer_sn_nn']],
    ['STACJA_SN_NN', ['add_nn_load', 'add_converter_source'], ['derive_cable_section']],
  ] satisfies Array<[SemanticEngineeringRole, string[], string[]]>)(
    '%s resolves actions from semanticContextMenuPolicy',
    (role, expected, forbidden) => {
      const ids = actionIds(role);

      for (const id of expected) {
        expect(ids).toContain(id);
      }
      for (const id of forbidden) {
        expect(ids).not.toContain(id);
      }
    },
  );

  it('semantic policy actions carry real handler refs and mutation operation contracts', () => {
    const roles: SemanticEngineeringRole[] = [
      'LINE_FEEDER_BAY',
      'TRANSFORMER_BAY',
      'BUSBAR_SECTION',
      'MV_CABLE_SEGMENT',
      'MV_OVERHEAD_SEGMENT',
      'STACJA_SN_NN',
    ];

    for (const role of roles) {
      const policy = buildSemanticContextActionSet(element(role));
      expect(findSemanticContextActionPolicyViolations(policy.actions)).toEqual([]);
    }
  });

  it('EngineeringContextMenu renders the semantic station policy and routes through onOperation', () => {
    const onOperation = vi.fn();

    render(
      <EngineeringContextMenu
        state={{
          isOpen: true,
          x: 10,
          y: 10,
          elementId: 'station-1',
          elementType: 'Station' as ElementType,
          elementName: 'Stacja SN/nN',
          semanticElement: element('STACJA_SN_NN', 'STATION_SN_NN'),
          semanticHash: 'hash-station',
        }}
        mode="MODEL_EDIT"
        onClose={vi.fn()}
        onOperation={onOperation}
      />,
    );

    const action = screen.getByTestId('context-menu-semantic-add_converter_source');
    expect(action).toBeInTheDocument();
    fireEvent.click(action);

    expect(onOperation).toHaveBeenCalledWith(
      'add_converter_source',
      'station-1',
      'Station',
      undefined,
    );
  });
});
