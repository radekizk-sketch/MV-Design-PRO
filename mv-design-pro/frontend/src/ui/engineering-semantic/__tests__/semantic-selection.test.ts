import { describe, expect, it } from 'vitest';
import {
  buildSemanticElementMap,
  createSemanticContextMenuElement,
  createSemanticSelectedElement,
  findSemanticElement,
  mapSemanticElementKindToElementType,
} from '../semanticSelection';
import type { EngineeringElement, EngineeringElementKind } from '../types';
import { busbarElement, semanticModel } from './contractTestFixtures';

function semanticElement(
  refId: string,
  elementKind: EngineeringElementKind,
  engineeringRole: EngineeringElement['engineeringRole'],
): EngineeringElement {
  return {
    ...busbarElement,
    refId,
    elementKind,
    engineeringRole,
  };
}

describe('semantic selection utilities', () => {
  it('maps semantic element kind to legacy SelectedElement type in one canonical place', () => {
    expect(mapSemanticElementKindToElementType('MV_BAY')).toBe('BaySN');
    expect(mapSemanticElementKindToElementType('BUSBAR_SECTION')).toBe('Bus');
    expect(mapSemanticElementKindToElementType('TRANSFORMER')).toBe('TransformerBranch');
    expect(mapSemanticElementKindToElementType('MV_LV_STATION')).toBe('Station');
  });

  it('builds semantic selected element from EngineeringSemanticModel, not UI labels', () => {
    const bay = semanticElement('bay-1', 'MV_BAY', 'LINE_FEEDER_BAY');
    const model = {
      ...semanticModel,
      semanticHash: 'semantic-selection-hash',
      elements: [bay],
    };
    const selected = createSemanticSelectedElement('bay-1', 'Bus', 'Pole L1', model);

    expect(selected).toEqual({
      id: 'bay-1',
      type: 'BaySN',
      name: 'Pole L1',
      semanticHash: 'semantic-selection-hash',
      semanticElementKind: 'MV_BAY',
      semanticEngineeringRole: 'LINE_FEEDER_BAY',
      semanticCompleteness: bay.completeness,
      semanticVoltageDomain: bay.voltageDomain,
      semanticDataQualityState: bay.dataQualityState,
    });
  });

  it('does not invent semantic metadata for unknown refs', () => {
    const selected = createSemanticSelectedElement('legacy-1', 'Bus', 'Legacy', semanticModel);

    expect(selected).toEqual({
      id: 'legacy-1',
      type: 'Bus',
      name: 'Legacy',
      semanticHash: undefined,
      semanticElementKind: undefined,
      semanticEngineeringRole: undefined,
      semanticCompleteness: undefined,
      semanticVoltageDomain: undefined,
      semanticDataQualityState: undefined,
    });
  });

  it('finds elements and creates context menu semantic payloads from the same map source', () => {
    const elementMap = buildSemanticElementMap(semanticModel);

    expect(findSemanticElement(semanticModel, 'bus-1')).toBe(busbarElement);
    expect(elementMap.get('bus-1')).toBe(busbarElement);
    expect(createSemanticContextMenuElement(busbarElement, semanticModel)).toEqual({
      refId: 'bus-1',
      engineeringRole: 'BUSBAR_SECTION',
      elementKind: 'BUSBAR_SECTION',
      semanticHash: 'semantic-1',
    });
  });
});
