import { describe, expect, it } from 'vitest';

import {
  assertNoUiDerivedSemantics,
  isUiDerivedSemanticsAllowedContext,
} from '../architectureGuards';

describe('no UI-derived semantics guard', () => {
  it('blocks production code deriving semantics from UI attributes and names', () => {
    const source = `
      const kindFromDom = selectedNode.getAttribute('data-element-type');
      const isPv = symbol.elementName.includes('PV');
    `;

    expect(assertNoUiDerivedSemantics(source, 'src/ui/sld/SemanticResolver.ts')).toEqual([
      expect.objectContaining({
        code: 'ARCH-UI-SEMANTICS-001',
        context: 'src/ui/sld/SemanticResolver.ts:data-element-type',
      }),
      expect.objectContaining({
        code: 'ARCH-UI-SEMANTICS-001',
        context: 'src/ui/sld/SemanticResolver.ts:elementName.includes',
      }),
    ]);
  });

  it('blocks production code using local elementType registries and pathPoints as topology', () => {
    const source = `
      const builder = BUILDER_REGISTRY[elementType];
      const topologyEdges = route.pathPoints.map((point, index) => ({
        from: route.pathPoints[index - 1],
        to: point,
      }));
    `;

    expect(assertNoUiDerivedSemantics(source, 'src/ui/context-menu/Policy.ts')).toEqual([
      expect.objectContaining({
        code: 'ARCH-UI-SEMANTICS-001',
        context: 'src/ui/context-menu/Policy.ts:BUILDER_REGISTRY[elementType]',
      }),
      expect.objectContaining({
        code: 'ARCH-UI-SEMANTICS-001',
        context: 'src/ui/context-menu/Policy.ts:pathPoints-topology',
      }),
    ]);
  });

  it('allows production code that uses canonical semantic references', () => {
    const source = `
      import type { EngineeringElement } from '../engineering-semantic';

      export function actionsFor(element: EngineeringElement, semanticHash: string) {
        return { semanticHash, role: element.role, elementRefId: element.elementId };
      }
    `;

    expect(assertNoUiDerivedSemantics(source, 'src/ui/context-menu/semanticContextMenuPolicy.ts')).toEqual([]);
  });

  it('keeps the legacy and test allowlist explicit', () => {
    const blockedSource = `
      expect(symbolElement).toHaveAttribute('data-element-type', 'Bus');
      const legacyBuilder = BUILDER_REGISTRY[elementType];
      const routeGraph = route.pathPoints.map((point) => point);
    `;

    expect(isUiDerivedSemanticsAllowedContext('src/ui/sld/__tests__/renderer.test.tsx')).toBe(true);
    expect(isUiDerivedSemanticsAllowedContext('src/ui/sld/legacy/legacySemanticAdapter.ts')).toBe(true);
    expect(assertNoUiDerivedSemantics(blockedSource, 'src/ui/sld/__tests__/renderer.test.tsx')).toEqual([]);
    expect(assertNoUiDerivedSemantics(blockedSource, 'src/ui/sld/legacy/legacySemanticAdapter.ts')).toEqual([]);
  });
});
