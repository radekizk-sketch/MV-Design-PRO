import { describe, expect, it } from 'vitest';

import { semanticModel, sldSymbol, transformerElement } from './fixtures';

describe('SldSymbolInstance semantic copy', () => {
  it('copies elementKind and engineeringRole from EngineeringElement', () => {
    const transformer = transformerElement();
    const model = semanticModel({ elements: [transformer] });
    const symbol = sldSymbol({
      semanticHash: model.semanticHash,
      elementKind: transformer.elementKind,
      engineeringRole: transformer.engineeringRole,
    });

    const element = model.elements.find((candidate) => candidate.refId === symbol.elementRefId);
    expect(symbol.elementKind).toBe(element?.elementKind);
    expect(symbol.engineeringRole).toBe(element?.engineeringRole);
  });
});
