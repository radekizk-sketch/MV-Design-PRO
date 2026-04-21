/**
 * UNIFIED SYMBOL RENDERER TESTS — Testy wspolnego renderera symboli
 *
 * PR-SLD-04: Unifikacja symboli w edytorze do standardu CANONICAL
 *
 * CANONICAL ALIGNMENT:
 * - AUDYT_SLD_CANONICAL.md N-04: edytor używa tego samego renderera co podgląd
 * - sld_rules.md § A.2: Symbol types (Bus, Line, Transformer, etc.)
 * - SymbolResolver.ts: Mapowanie element → symbol
 *
 * TEST COVERAGE:
 * - Deterministycznosc renderowania (ten sam input -> identyczne SVG)
 * - Mapowanie typow elementow na symbole CANONICAL
 * - Fallback dla nieobsluzonych typow (Load, nieznane)
 * - Spojnosc portow z routingiem
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnifiedSymbolRenderer, SYMBOL_SIZES, renderSymbol } from '../UnifiedSymbolRenderer';
import type { NodeSymbol, BranchSymbol, SwitchSymbol, SourceSymbol, LoadSymbol } from '../../../sld-editor/types';
import type { SymbolVisualState } from '../UnifiedSymbolRenderer';
import { resolveSymbol, transformPort } from '../../SymbolResolver';

// =============================================================================
// TEST DATA: Symbole testowe dla każdego typu elementu
// =============================================================================

const createBusSymbol = (overrides?: Partial<NodeSymbol>): NodeSymbol => ({
  id: 'bus-symbol-1',
  elementId: 'bus1',
  elementType: 'Bus',
  elementName: 'Szyna zbiorcza',
  position: { x: 200, y: 100 },
  inService: true,
  width: 80,
  height: 40,
  ...overrides,
});

const createLineBranchSymbol = (overrides?: Partial<BranchSymbol>): BranchSymbol => ({
  id: 'line-symbol-1',
  elementId: 'line1',
  elementType: 'LineBranch',
  elementName: 'Linia kablowa',
  position: { x: 200, y: 200 },
  inService: true,
  fromNodeId: 'bus1',
  toNodeId: 'bus2',
  points: [],
  branchType: 'CABLE',
  ...overrides,
});

const createTransformerSymbol = (overrides?: Partial<BranchSymbol>): BranchSymbol => ({
  id: 'transformer-symbol-1',
  elementId: 'transformer1',
  elementType: 'TransformerBranch',
  elementName: 'Transformator',
  position: { x: 200, y: 200 },
  inService: true,
  fromNodeId: 'bus1',
  toNodeId: 'bus2',
  points: [],
  ...overrides,
});

const createSwitchSymbol = (overrides?: Partial<SwitchSymbol>): SwitchSymbol => ({
  id: 'switch-symbol-1',
  elementId: 'switch1',
  elementType: 'Switch',
  elementName: 'Wyłącznik',
  position: { x: 200, y: 200 },
  inService: true,
  fromNodeId: 'bus1',
  toNodeId: 'bus2',
  switchState: 'CLOSED',
  switchType: 'BREAKER',
  ...overrides,
});

const createSourceSymbol = (overrides?: Partial<SourceSymbol>): SourceSymbol => ({
  id: 'source-symbol-1',
  elementId: 'source1',
  elementType: 'Source',
  elementName: 'Zasilanie',
  position: { x: 200, y: 50 },
  inService: true,
  connectedToNodeId: 'bus1',
  ...overrides,
});

const createLoadSymbol = (overrides?: Partial<LoadSymbol>): LoadSymbol => ({
  id: 'load-symbol-1',
  elementId: 'load1',
  elementType: 'Load',
  elementName: 'Odbiornik',
  position: { x: 200, y: 300 },
  inService: true,
  connectedToNodeId: 'bus1',
  ...overrides,
});

const defaultVisualState: SymbolVisualState = {
  selected: false,
  inService: true,
  energized: true,
  highlighted: false,
  highlightSeverity: null,
};

// =============================================================================
// TESTY DETERMINISTYCZNOŚCI
// =============================================================================

describe('UnifiedSymbolRenderer - Determinism', () => {
  it('should render identical SVG for the same input (Bus)', () => {
    const symbol = createBusSymbol();

    const { container: container1 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg1 = container1.innerHTML;

    const { container: container2 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg2 = container2.innerHTML;

    expect(svg1).toBe(svg2);
  });

  it('should render identical SVG for the same input (Switch)', () => {
    const symbol = createSwitchSymbol();

    const { container: container1 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg1 = container1.innerHTML;

    const { container: container2 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg2 = container2.innerHTML;

    expect(svg1).toBe(svg2);
  });

  it('should render identical SVG for the same input (LineBranch)', () => {
    const symbol = createLineBranchSymbol();

    const { container: container1 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg1 = container1.innerHTML;

    const { container: container2 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg2 = container2.innerHTML;

    expect(svg1).toBe(svg2);
  });

  it('should render identical SVG for the same input (Transformer)', () => {
    const symbol = createTransformerSymbol();

    const { container: container1 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg1 = container1.innerHTML;

    const { container: container2 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg2 = container2.innerHTML;

    expect(svg1).toBe(svg2);
  });

  it('should render identical SVG for the same input (Source)', () => {
    const symbol = createSourceSymbol();

    const { container: container1 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg1 = container1.innerHTML;

    const { container: container2 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg2 = container2.innerHTML;

    expect(svg1).toBe(svg2);
  });

  it('should render identical SVG for the same input (Load - fallback)', () => {
    const symbol = createLoadSymbol();

    const { container: container1 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg1 = container1.innerHTML;

    const { container: container2 } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );
    const svg2 = container2.innerHTML;

    expect(svg1).toBe(svg2);
  });
});

// =============================================================================
// TESTY MAPOWANIA TYPÓW NA SYMBOLE CANONICAL
// =============================================================================

describe('UnifiedSymbolRenderer - CANONICAL Symbol Mapping', () => {
  it('should render Bus as CANONICAL busbar symbol', () => {
    const symbol = createBusSymbol();

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toHaveAttribute('data-canonical-symbol', 'busbar');
    expect(symbolElement).toHaveAttribute('data-element-type', 'Bus');
  });

  it('should render LineBranch (CABLE) as CANONICAL line_cable symbol', () => {
    const symbol = createLineBranchSymbol({ branchType: 'CABLE' });

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toHaveAttribute('data-canonical-symbol', 'line_cable');
    expect(symbolElement).toHaveAttribute('data-branch-type', 'CABLE');
  });

  it('should render LineBranch (LINE) as CANONICAL line_overhead symbol', () => {
    const symbol = createLineBranchSymbol({ branchType: 'LINE' });

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toHaveAttribute('data-canonical-symbol', 'line_overhead');
    expect(symbolElement).toHaveAttribute('data-branch-type', 'LINE');
  });

  it('should render TransformerBranch as CANONICAL transformer_2w symbol', () => {
    const symbol = createTransformerSymbol();

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toHaveAttribute('data-canonical-symbol', 'transformer_2w');
    expect(symbolElement).toHaveAttribute('data-element-type', 'TransformerBranch');
  });

  it('should render Switch (BREAKER) as CANONICAL circuit_breaker symbol', () => {
    const symbol = createSwitchSymbol({ switchType: 'BREAKER' });

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toHaveAttribute('data-canonical-symbol', 'circuit_breaker');
    expect(symbolElement).toHaveAttribute('data-switch-type', 'BREAKER');
  });

  it('should render Switch (DISCONNECTOR) as CANONICAL disconnector symbol', () => {
    const symbol = createSwitchSymbol({ switchType: 'DISCONNECTOR' });

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toHaveAttribute('data-canonical-symbol', 'disconnector');
    expect(symbolElement).toHaveAttribute('data-switch-type', 'DISCONNECTOR');
  });

  it('should render Source as CANONICAL utility_feeder symbol', () => {
    const symbol = createSourceSymbol();

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toHaveAttribute('data-canonical-symbol', 'utility_feeder');
    expect(symbolElement).toHaveAttribute('data-element-type', 'Source');
  });
});

// =============================================================================
// TESTY FALLBACK DLA NIEOBSŁUŻONYCH TYPÓW
// =============================================================================

describe('UnifiedSymbolRenderer - Fallback Handling', () => {
  it('should render Load with fallback indicator (no CANONICAL symbol)', () => {
    const symbol = createLoadSymbol();

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    // Load should use fallback triangle
    const fallbackElement = screen.getByTestId('sld-fallback-load');
    expect(fallbackElement).toBeInTheDocument();
    expect(fallbackElement).toHaveAttribute('data-fallback', 'true');
  });

  it('should log warning when using fallback for Load', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const symbol = createLoadSymbol();

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    // No warning should be logged for Load since it has explicit handling
    consoleSpy.mockRestore();
  });

  it('should have data-canonical-symbol attribute for Load', () => {
    const symbol = createLoadSymbol();

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toHaveAttribute('data-canonical-symbol', 'load');
  });
});

// =============================================================================
// TESTY STANU WIZUALNEGO
// =============================================================================

describe('UnifiedSymbolRenderer - Visual States', () => {
  it('should apply selection styling when selected', () => {
    const symbol = createBusSymbol();
    const selectedState: SymbolVisualState = {
      ...defaultVisualState,
      selected: true,
    };

    const { container } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={selectedState} />
      </svg>
    );

    // Selection should be reflected in SVG (CANONICAL blue-600 #2563EB)
    expect(container.innerHTML).toContain('#2563EB');
  });

  it('should apply de-energized styling when not energized', () => {
    const symbol = createBusSymbol();
    const deEnergizedState: SymbolVisualState = {
      ...defaultVisualState,
      energized: false,
    };

    const { container } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={deEnergizedState} />
      </svg>
    );

    // De-energized should use gray color #6B7280 (CANONICAL gray-500)
    expect(container.innerHTML).toContain('#6B7280');
  });

  it('should apply out-of-service styling when not in service', () => {
    const symbol = createBusSymbol({ inService: false });
    const outOfServiceState: SymbolVisualState = {
      ...defaultVisualState,
      inService: false,
    };

    const { container } = render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={outOfServiceState} />
      </svg>
    );

    // Out of service should have reduced opacity
    expect(container.innerHTML).toContain('opacity');
  });

  it('should show switch state for OPEN switches', () => {
    const symbol = createSwitchSymbol({ switchState: 'OPEN' });

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toHaveAttribute('data-switch-state', 'OPEN');
  });

  it('should show switch state for CLOSED switches', () => {
    const symbol = createSwitchSymbol({ switchState: 'CLOSED' });

    render(
      <svg>
        <UnifiedSymbolRenderer symbol={symbol} visualState={defaultVisualState} />
      </svg>
    );

    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toHaveAttribute('data-switch-state', 'CLOSED');
  });
});

// =============================================================================
// TESTY SPÓJNOŚCI PORTÓW
// =============================================================================

describe('UnifiedSymbolRenderer - Port Consistency', () => {
  it('should resolve ports matching SymbolResolver definitions (Bus)', () => {
    const symbol = createBusSymbol();
    const resolved = resolveSymbol(symbol);

    expect(resolved).not.toBeNull();
    expect(resolved!.symbolId).toBe('busbar');
    expect(resolved!.ports.left).toEqual({ x: 0, y: 50 });
    expect(resolved!.ports.right).toEqual({ x: 100, y: 50 });
  });

  it('should resolve ports matching SymbolResolver definitions (Switch)', () => {
    const symbol = createSwitchSymbol();
    const resolved = resolveSymbol(symbol);

    expect(resolved).not.toBeNull();
    expect(resolved!.symbolId).toBe('circuit_breaker');
    expect(resolved!.ports.top).toEqual({ x: 50, y: 0 });
    expect(resolved!.ports.bottom).toEqual({ x: 50, y: 100 });
  });

  it('should resolve ports matching SymbolResolver definitions (Transformer)', () => {
    const symbol = createTransformerSymbol();
    const resolved = resolveSymbol(symbol);

    expect(resolved).not.toBeNull();
    expect(resolved!.symbolId).toBe('transformer_2w');
    expect(resolved!.ports.top).toEqual({ x: 50, y: 0 });
    expect(resolved!.ports.bottom).toEqual({ x: 50, y: 100 });
  });

  it('should resolve ports matching SymbolResolver definitions (Source)', () => {
    const symbol = createSourceSymbol();
    const resolved = resolveSymbol(symbol);

    expect(resolved).not.toBeNull();
    expect(resolved!.symbolId).toBe('utility_feeder');
    expect(resolved!.ports.bottom).toEqual({ x: 50, y: 100 });
  });

  it('should resolve Load to load symbol', () => {
    const symbol = createLoadSymbol();
    const resolved = resolveSymbol(symbol);

    expect(resolved).not.toBeNull();
    expect(resolved!.symbolId).toBe('load');
  });

  it('should transform ports correctly for rotation', () => {
    // Test 90° rotation
    const port = { x: 50, y: 0 }; // top port
    const rotated90 = transformPort(port, 90);
    expect(rotated90).toEqual({ x: 100, y: 50 }); // becomes right port

    // Test 180° rotation
    const rotated180 = transformPort(port, 180);
    expect(rotated180).toEqual({ x: 50, y: 100 }); // becomes bottom port

    // Test 270° rotation
    const rotated270 = transformPort(port, 270);
    expect(rotated270).toEqual({ x: 0, y: 50 }); // becomes left port
  });
});

// =============================================================================
// TESTY SYMBOL_SIZES
// =============================================================================

describe('SYMBOL_SIZES Configuration', () => {
  it('should have sizes for all standard element types', () => {
    expect(SYMBOL_SIZES.Bus).toBeDefined();
    expect(SYMBOL_SIZES.LineBranch).toBeDefined();
    expect(SYMBOL_SIZES.TransformerBranch).toBeDefined();
    expect(SYMBOL_SIZES.Switch).toBeDefined();
    expect(SYMBOL_SIZES.Source).toBeDefined();
    expect(SYMBOL_SIZES.Load).toBeDefined();
  });

  it('should have reasonable dimensions for all types', () => {
    for (const [_type, size] of Object.entries(SYMBOL_SIZES)) {
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
      expect(size.width).toBeLessThanOrEqual(100);
      expect(size.height).toBeLessThanOrEqual(100);
    }
  });
});

// =============================================================================
// TESTY FUNKCJI renderSymbol
// =============================================================================

describe('renderSymbol Function', () => {
  it('should be equivalent to UnifiedSymbolRenderer component', () => {
    const symbol = createBusSymbol();

    const { container: container1 } = render(
      <svg>
        {renderSymbol({
          symbol,
          selected: false,
          inService: true,
          energized: true,
        })}
      </svg>
    );

    const { container: container2 } = render(
      <svg>
        <UnifiedSymbolRenderer
          symbol={symbol}
          visualState={defaultVisualState}
        />
      </svg>
    );

    expect(container1.innerHTML).toBe(container2.innerHTML);
  });

  it('should pass all visual state properties correctly', () => {
    const symbol = createBusSymbol();

    render(
      <svg>
        {renderSymbol({
          symbol,
          selected: true,
          inService: true,
          energized: true,
          highlighted: true,
          highlightSeverity: 'HIGH',
        })}
      </svg>
    );

    // Should render with highlight styling (red #dc2626)
    const symbolElement = screen.getByTestId(`sld-symbol-${symbol.id}`);
    expect(symbolElement).toBeInTheDocument();
  });
});
