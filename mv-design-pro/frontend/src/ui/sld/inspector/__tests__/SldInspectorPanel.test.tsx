/**
 * SLD Inspector Panel Tests — PR-SLD-07
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § G.1: Inspector wyświetla właściwości wybranego elementu
 * - ui_canonical_parity.md: Property grid w stylu Canonical
 *
 * TEST COVERAGE:
 * - Renderowanie pustego stanu
 * - Renderowanie dla elementu
 * - Renderowanie dla połączenia
 * - Deterministyczność (ten sam input → ten sam output DOM)
 * - Tryb WYNIKI vs EDYCJA
 * - Zamykanie panelu
 * - Polskie etykiety
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SldInspectorPanel } from '../SldInspectorPanel';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockBusSymbol = {
  id: 'bus-sym-1',
  elementId: 'bus-1',
  elementType: 'Bus' as const,
  elementName: 'Szyna główna SN',
  position: { x: 100, y: 100 },
  inService: true,
  width: 80,
  height: 10,
};

const mockSwitchSymbol = {
  id: 'sw-sym-1',
  elementId: 'switch-1',
  elementType: 'Switch' as const,
  elementName: 'Q1',
  position: { x: 200, y: 200 },
  inService: true,
  fromNodeId: 'bus-1',
  toNodeId: 'bus-2',
  switchState: 'CLOSED' as const,
  switchType: 'BREAKER' as const,
};

const mockLineSymbol = {
  id: 'line-sym-1',
  elementId: 'line-1',
  elementType: 'LineBranch' as const,
  elementName: 'Linia L1',
  position: { x: 150, y: 150 },
  inService: true,
  fromNodeId: 'bus-1',
  toNodeId: 'bus-2',
  points: [],
  branchType: 'LINE' as const,
};

const mockTransformerSymbol = {
  id: 'trafo-sym-1',
  elementId: 'trafo-1',
  elementType: 'TransformerBranch' as const,
  elementName: 'TR1 110/15kV',
  position: { x: 250, y: 150 },
  inService: true,
  fromNodeId: 'bus-1',
  toNodeId: 'bus-2',
  points: [],
};

const mockSourceSymbol = {
  id: 'source-sym-1',
  elementId: 'source-1',
  elementType: 'Source' as const,
  elementName: 'Sieć zasilająca',
  position: { x: 100, y: 50 },
  inService: true,
  connectedToNodeId: 'bus-1',
};

const mockLoadSymbol = {
  id: 'load-sym-1',
  elementId: 'load-1',
  elementType: 'Load' as const,
  elementName: 'Odbiornik O1',
  position: { x: 100, y: 300 },
  inService: false,
  connectedToNodeId: 'bus-2',
};

// =============================================================================
// MOCK STORES
// =============================================================================

const mockSymbolsMap = new Map([
  [mockBusSymbol.id, mockBusSymbol],
  [mockSwitchSymbol.id, mockSwitchSymbol],
  [mockLineSymbol.id, mockLineSymbol],
  [mockTransformerSymbol.id, mockTransformerSymbol],
  [mockSourceSymbol.id, mockSourceSymbol],
  [mockLoadSymbol.id, mockLoadSymbol],
]);

// Track mock state
let mockSelectedElement: { id: string; type: string; name: string } | null = null;
let mockSldMode: 'EDYCJA' | 'WYNIKI' = 'EDYCJA';

vi.mock('../../../selection/store', () => ({
  useSelectionStore: vi.fn((selector) => {
    const state = {
      selectedElements: mockSelectedElement ? [mockSelectedElement] : [],
      clearSelection: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('../../../sld-editor/SldEditorStore', () => ({
  useSldEditorStore: vi.fn((selector) => {
    const state = {
      symbols: mockSymbolsMap,
    };
    return selector(state);
  }),
}));

vi.mock('../../sldModeStore', () => ({
  useSldModeStore: vi.fn((selector) => {
    const state = {
      mode: mockSldMode,
    };
    return selector(state);
  }),
  SLD_MODE_LABELS_PL: {
    EDYCJA: 'Edycja',
    WYNIKI: 'Wyniki',
  },
}));

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function setMockSelection(element: typeof mockSelectedElement) {
  mockSelectedElement = element;
}

function setMockSldMode(mode: 'EDYCJA' | 'WYNIKI') {
  mockSldMode = mode;
}

// =============================================================================
// TESTY PUSTEGO STANU
// =============================================================================

describe('SldInspectorPanel - Empty State', () => {
  beforeEach(() => {
    setMockSelection(null);
    setMockSldMode('EDYCJA');
  });

  it('should render empty state when no selection', () => {
    render(<SldInspectorPanel />);

    expect(screen.getByTestId('inspector-empty-state')).toBeInTheDocument();
    expect(screen.getByText('Brak zaznaczenia')).toBeInTheDocument();
    expect(screen.getByText(/Kliknij element/)).toBeInTheDocument();
  });

  it('should show correct title for empty state', () => {
    render(<SldInspectorPanel />);

    const title = screen.getByTestId('inspector-title');
    expect(title.textContent).toBe('Inspektor');
  });

  it('should have data-selection-type="none"', () => {
    render(<SldInspectorPanel />);

    const panel = screen.getByTestId('sld-inspector-panel');
    expect(panel.dataset.selectionType).toBe('none');
  });
});

// =============================================================================
// TESTY RENDEROWANIA ELEMENTU
// =============================================================================

describe('SldInspectorPanel - Element Rendering', () => {
  beforeEach(() => {
    setMockSldMode('EDYCJA');
  });

  it('should render Bus element details', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Szyna główna SN',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByTestId('sld-inspector-panel')).toBeInTheDocument();
    expect(screen.getByText(/Szyna główna SN/)).toBeInTheDocument();
    expect(screen.getByText('Szyna')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-section-basic')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-section-technical')).toBeInTheDocument();
  });

  it('should render Switch element details', () => {
    setMockSelection({
      id: 'switch-1',
      type: 'Switch',
      name: 'Q1',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText(/Q1/)).toBeInTheDocument();
    expect(screen.getByText('Łącznik')).toBeInTheDocument();
    expect(screen.getByText('Wyłącznik')).toBeInTheDocument(); // BREAKER -> Wyłącznik
    expect(screen.getByText('Zamknięty')).toBeInTheDocument(); // CLOSED -> Zamknięty
  });

  it('should render LineBranch element details', () => {
    setMockSelection({
      id: 'line-1',
      type: 'LineBranch',
      name: 'Linia L1',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText(/Linia L1/)).toBeInTheDocument();
    expect(screen.getByText('Linia')).toBeInTheDocument();
    expect(screen.getByText('Napowietrzna')).toBeInTheDocument(); // LINE -> Napowietrzna
  });

  it('should render TransformerBranch element details', () => {
    setMockSelection({
      id: 'trafo-1',
      type: 'TransformerBranch',
      name: 'TR1 110/15kV',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText(/TR1 110\/15kV/)).toBeInTheDocument();
    expect(screen.getByText('Transformator')).toBeInTheDocument();
  });

  it('should render Source element details', () => {
    setMockSelection({
      id: 'source-1',
      type: 'Source',
      name: 'Sieć zasilająca',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText(/Sieć zasilająca/)).toBeInTheDocument();
    expect(screen.getByText('Źródło')).toBeInTheDocument();
  });

  it('should render Load element details', () => {
    setMockSelection({
      id: 'load-1',
      type: 'Load',
      name: 'Odbiornik O1',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText(/Odbiornik O1/)).toBeInTheDocument();
    expect(screen.getByText('Odbiornik')).toBeInTheDocument();
    expect(screen.getByText('Poza służbą')).toBeInTheDocument(); // inService: false
  });
});

// =============================================================================
// TESTY DETERMINISTYCZNOŚCI
// =============================================================================

describe('SldInspectorPanel - Determinism', () => {
  beforeEach(() => {
    setMockSldMode('EDYCJA');
  });

  it('should render identical output for the same input', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Szyna główna SN',
    });

    const { container: container1 } = render(<SldInspectorPanel />);
    const html1 = container1.innerHTML;

    const { container: container2 } = render(<SldInspectorPanel />);
    const html2 = container2.innerHTML;

    expect(html1).toBe(html2);
  });

  it('should render fields in deterministic order', () => {
    setMockSelection({
      id: 'switch-1',
      type: 'Switch',
      name: 'Q1',
    });

    render(<SldInspectorPanel />);

    const fields = screen.getByTestId('inspector-section-fields-basic');
    const fieldElements = fields.querySelectorAll('[data-testid^="inspector-field-"]');

    // Fields should be in a specific order
    const fieldOrder = Array.from(fieldElements).map((el) => el.getAttribute('data-testid'));

    // First field should be element type
    expect(fieldOrder[0]).toContain('type');
  });
});

// =============================================================================
// TESTY TRYBU WYNIKI vs EDYCJA
// =============================================================================

describe('SldInspectorPanel - Mode Differences', () => {
  it('should show "Edycja" mode badge when in EDYCJA mode', () => {
    setMockSldMode('EDYCJA');
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Szyna główna SN',
    });

    render(<SldInspectorPanel />);

    const modeBadge = screen.getByTestId('inspector-mode-badge');
    expect(modeBadge.textContent).toContain('Edycja');
  });

  it('should show "Wyniki" mode badge when in WYNIKI mode', () => {
    setMockSldMode('WYNIKI');
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Szyna główna SN',
    });

    render(<SldInspectorPanel />);

    const modeBadge = screen.getByTestId('inspector-mode-badge');
    expect(modeBadge.textContent).toContain('Wyniki');
  });

  it('should have data-sld-mode attribute matching current mode', () => {
    setMockSldMode('WYNIKI');
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Szyna główna SN',
    });

    render(<SldInspectorPanel />);

    const panel = screen.getByTestId('sld-inspector-panel');
    expect(panel.dataset.sldMode).toBe('WYNIKI');
  });
});

// =============================================================================
// TESTY ZAMYKANIA PANELU
// =============================================================================

describe('SldInspectorPanel - Close Behavior', () => {
  it('should call onClose when close button is clicked', () => {
    const mockOnClose = vi.fn();
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Szyna główna SN',
    });

    render(<SldInspectorPanel onClose={mockOnClose} />);

    const closeButton = screen.getByTestId('inspector-close-button');
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('should have close button with proper aria-label', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Szyna główna SN',
    });

    render(<SldInspectorPanel />);

    const closeButton = screen.getByTestId('inspector-close-button');
    expect(closeButton.getAttribute('aria-label')).toBe('Zamknij inspektor');
  });
});

// =============================================================================
// TESTY SEKCJI SKŁADANYCH
// =============================================================================

describe('SldInspectorPanel - Collapsible Sections', () => {
  beforeEach(() => {
    setMockSldMode('EDYCJA');
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Szyna główna SN',
    });
  });

  it('should render sections expanded by default', () => {
    render(<SldInspectorPanel />);

    const basicSection = screen.getByTestId('inspector-section-fields-basic');
    const technicalSection = screen.getByTestId('inspector-section-fields-technical');

    expect(basicSection).toBeInTheDocument();
    expect(technicalSection).toBeInTheDocument();
  });

  it('should collapse section when header is clicked', () => {
    render(<SldInspectorPanel />);

    const sectionHeader = screen.getByTestId('inspector-section-header-basic');
    fireEvent.click(sectionHeader);

    expect(screen.queryByTestId('inspector-section-fields-basic')).not.toBeInTheDocument();
  });

  it('should expand collapsed section when header is clicked again', () => {
    render(<SldInspectorPanel />);

    const sectionHeader = screen.getByTestId('inspector-section-header-basic');

    // Collapse
    fireEvent.click(sectionHeader);
    expect(screen.queryByTestId('inspector-section-fields-basic')).not.toBeInTheDocument();

    // Expand
    fireEvent.click(sectionHeader);
    expect(screen.getByTestId('inspector-section-fields-basic')).toBeInTheDocument();
  });

  it('should show arrow indicator for collapsed/expanded state', () => {
    render(<SldInspectorPanel />);

    const sectionHeader = screen.getByTestId('inspector-section-header-basic');

    // Expanded state should show collapse indicator
    expect(sectionHeader.textContent).toContain('[-]');

    fireEvent.click(sectionHeader);

    // Collapsed state should show expand indicator
    expect(sectionHeader.textContent).toContain('[+]');
  });
});

// =============================================================================
// TESTY POLSKICH ETYKIET
// =============================================================================

describe('SldInspectorPanel - Polish Labels', () => {
  beforeEach(() => {
    setMockSldMode('EDYCJA');
  });

  it('should use Polish label "Szyna" for Bus type', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText('Szyna')).toBeInTheDocument();
  });

  it('should use Polish label "Łącznik" for Switch type', () => {
    setMockSelection({
      id: 'switch-1',
      type: 'Switch',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText('Łącznik')).toBeInTheDocument();
  });

  it('should use Polish label "Linia" for LineBranch type', () => {
    setMockSelection({
      id: 'line-1',
      type: 'LineBranch',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText('Linia')).toBeInTheDocument();
  });

  it('should use Polish label "Transformator" for TransformerBranch type', () => {
    setMockSelection({
      id: 'trafo-1',
      type: 'TransformerBranch',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText('Transformator')).toBeInTheDocument();
  });

  it('should use Polish label "Źródło" for Source type', () => {
    setMockSelection({
      id: 'source-1',
      type: 'Source',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText('Źródło')).toBeInTheDocument();
  });

  it('should use Polish label "Odbiornik" for Load type', () => {
    setMockSelection({
      id: 'load-1',
      type: 'Load',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText('Odbiornik')).toBeInTheDocument();
  });

  it('should use Polish section labels', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText('Informacje podstawowe')).toBeInTheDocument();
    expect(screen.getByText('Parametry techniczne')).toBeInTheDocument();
  });

  it('should show "Tylko do odczytu" badge', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText('Tylko do odczytu')).toBeInTheDocument();
  });
});

// =============================================================================
// TESTY STANU IN_SERVICE
// =============================================================================

describe('SldInspectorPanel - In Service State', () => {
  beforeEach(() => {
    setMockSldMode('EDYCJA');
  });

  it('should show "W służbie" for inService=true elements', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText('W służbie')).toBeInTheDocument();
  });

  it('should show "Poza służbą" for inService=false elements', () => {
    setMockSelection({
      id: 'load-1',
      type: 'Load',
      name: 'Odbiornik O1',
    });

    render(<SldInspectorPanel />);

    expect(screen.getByText('Poza służbą')).toBeInTheDocument();
  });
});

// =============================================================================
// TESTY ATRYBUTÓW DATA
// =============================================================================

describe('SldInspectorPanel - Data Attributes', () => {
  beforeEach(() => {
    setMockSldMode('EDYCJA');
  });

  it('should have data-selection-id for selected element', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    const panel = screen.getByTestId('sld-inspector-panel');
    expect(panel.dataset.selectionId).toBe('bus-1');
  });

  it('should have data-selection-type="element" for element selection', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    const panel = screen.getByTestId('sld-inspector-panel');
    expect(panel.dataset.selectionType).toBe('element');
  });
});

// =============================================================================
// TESTY STYLÓW
// =============================================================================

describe('SldInspectorPanel - Styling', () => {
  beforeEach(() => {
    setMockSldMode('EDYCJA');
  });

  it('should have fixed width of 340px', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    const panel = screen.getByTestId('sld-inspector-panel');
    expect(panel.style.width).toBe('340px');
  });

  it('should have overflow-y-auto for content scrolling', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Test',
    });

    render(<SldInspectorPanel />);

    const content = screen.getByTestId('inspector-content');
    expect(content.className).toContain('overflow-y-auto');
  });

  it('should use neutral gray colors (not red/green alarm)', () => {
    setMockSelection({
      id: 'bus-1',
      type: 'Bus',
      name: 'Test',
    });

    const { container } = render(<SldInspectorPanel />);
    const html = container.innerHTML;

    // Should contain slate/gray colors (CANONICAL-grade professional)
    expect(html).toContain('slate');
    // No alarm colors (red/green) should appear in normal state
    // Read-only badge now uses slate instead of green
  });
});
