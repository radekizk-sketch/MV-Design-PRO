import { describe, expect, it } from 'vitest';

import { assertSldSymbolRoleCopiesMatchSemanticModel } from '../sldProjectionAdapter';
import { busbarElement, semanticModel } from './contractTestFixtures';

describe('SLD symbol role copy matches semantic model', () => {
  it('blocks symbols with diagnostic role copy divergent from EngineeringElement', () => {
    expect(assertSldSymbolRoleCopiesMatchSemanticModel({
      schemaVersion: 'v12-sld-view-v8',
      projectRefId: semanticModel.projectRefId,
      semanticHash: semanticModel.semanticHash,
      rendererRegistryHash: 'renderer-registry',
      layoutRegistryHash: 'layout-registry',
      lodPolicyHash: 'lod-policy',
      viewHash: 'view-1',
      routes: [],
      labels: [],
      symbols: [{
      symbolId: 'symbol-1',
      elementRefId: busbarElement.refId,
      semanticHash: semanticModel.semanticHash,
      elementKind: busbarElement.elementKind,
      engineeringRole: 'LINE_FEEDER_BAY',
      visibilityStatus: 'WIDOCZNY',
      renderClass: 'PRODUKCYJNY_TECHNICZNY',
      rendererKey: 'busbar-section',
      lodLevel: 'LOD_3',
      }],
    }, semanticModel)).toContain('symbol-1:bus-1');
  });
});
