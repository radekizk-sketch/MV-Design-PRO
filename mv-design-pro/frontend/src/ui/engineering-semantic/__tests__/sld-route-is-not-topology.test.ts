import { describe, expect, it } from 'vitest';

import { baseView, productionConnection, semanticModel, sldRoute } from './fixtures';

describe('SldRoute is not topology', () => {
  it('changes viewHash but not semanticHash when only route geometry changes', () => {
    const connection = productionConnection();
    const model = semanticModel({
      connections: [connection],
      physicalTopologyGraph: {
        graphId: 'physical-1',
        elementRefs: [],
        connectionRefs: [connection.connectionId],
      },
    });
    const view = baseView({ semanticHash: model.semanticHash, routes: [sldRoute()] });

    expect(baseView({
      semanticHash: model.semanticHash,
      routes: [sldRoute({ pathPoints: [{ x: 0, y: 0 }, { x: 100, y: 20 }] })],
    }).viewHash).not.toBe(view.viewHash);
    expect(baseView({
      semanticHash: model.semanticHash,
      routes: [sldRoute({ pathPoints: [{ x: 10, y: 10 }, { x: 0, y: 0 }] })],
    }).viewHash).not.toBe(view.viewHash);
    expect(semanticModel({
      connections: [connection],
      physicalTopologyGraph: {
        graphId: 'physical-1',
        elementRefs: [],
        connectionRefs: [connection.connectionId],
      },
    }).semanticHash).toBe(model.semanticHash);
  });
});
