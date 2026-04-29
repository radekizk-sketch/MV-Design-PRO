import { describe, expect, it } from 'vitest';

import { assertSldRoutesReferenceEngineeringConnections } from '../architectureGuards';
import { semanticModel } from './contractTestFixtures';

describe('SLD route is not topology', () => {
  it('reports route-only topology when route references no EngineeringConnection', () => {
    expect(assertSldRoutesReferenceEngineeringConnections(semanticModel, {
      semanticHash: semanticModel.semanticHash,
      routes: [{
        routeId: 'route-ghost',
        connectionId: 'missing-connection',
        pathPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      }],
    })).toContainEqual(expect.objectContaining({ code: 'ARCH-SLD-ROUTE-001' }));
  });
});
