/**
 * elkLayoutOptions — centralna konfiguracja ELK dla deterministycznego SLD (Pakiet J).
 *
 * Wszystkie wartości są frozen — konfiguracja musi być stała i audytowalna.
 *
 * KLUCZOWE ZASADY (binding):
 *   1. randomSeed = 1 (stała ≠ 0)
 *   2. considerModelOrder = true + forceNodeModelOrder = true
 *   3. nodePlacement.strategy = BRANDES_KOEPF
 *   4. crossingMinimization.strategy = LAYER_SWEEP
 *   5. portConstraints = FIXED_ORDER (per-node)
 *   6. direction = DOWN (GPZ u góry, trzon pionowo)
 *   7. spacing.baseValue = 64
 */

/**
 * Globalne opcje ELK dla algorytmu layered.
 * Klucze są stringami zgodnymi z ELK (patrz elkjs documentation).
 */
export const ELK_GLOBAL_LAYOUT_OPTIONS: Readonly<Record<string, string>> = Object.freeze({
  'org.eclipse.elk.algorithm': 'layered',
  'org.eclipse.elk.randomSeed': '1',
  'org.eclipse.elk.direction': 'DOWN',
  'org.eclipse.elk.layered.considerModelOrder': 'true',
  'org.eclipse.elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
  'org.eclipse.elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'org.eclipse.elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'org.eclipse.elk.layered.nodePlacement.favorStraightEdges': 'true',
  'org.eclipse.elk.layered.spacing.baseValue': '64',
  'org.eclipse.elk.layered.edgeNodeBetweenLayers': 'true',
});

/**
 * Per-node options (FIXED_ORDER dla zachowania kolejności portów).
 */
export const ELK_NODE_LAYOUT_OPTIONS: Readonly<Record<string, string>> = Object.freeze({
  'org.eclipse.elk.portConstraints': 'FIXED_ORDER',
});

/**
 * Per-port options helper.
 * Zwraca obiekt dla portu — side i index muszą być jawne.
 */
export type ElkPortSide = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';

export function elkPortOptions(side: ElkPortSide, index: number): Readonly<Record<string, string>> {
  return Object.freeze({
    'org.eclipse.elk.port.side': side,
    'org.eclipse.elk.port.index': String(index),
  });
}
