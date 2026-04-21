/**
 * SLD Snapshot Export Tests
 *
 * CANONICAL ALIGNMENT:
 * - ui_canonical_parity.md: PF/CANONICAL-grade export functionality
 * - SLD_UI_ARCHITECTURE.md: Layer visibility and viewport management
 *
 * Tests:
 * - Export type definitions and constants
 * - Filename generation
 * - Viewport calculation for fit-to-network
 * - Layer state management
 * - Export options creation
 */

import { describe, it, expect } from 'vitest';
import {
  generateExportFilename,
  DEFAULT_LAYER_OPTIONS,
  SCOPE_LABELS_PL,
  LAYER_LABELS_PL,
  PNG_SCALE_LABELS_PL,
  PDF_PAGE_SIZE_LABELS_PL,
  PDF_ORIENTATION_LABELS_PL,
  type ExportMetadata,
  type ExportLayerOptions,
} from '../types';
import {
  calculateExportViewport,
  getCurrentLayerState,
  createExportOptions,
} from '../SldSnapshotExport';
import type { AnySldSymbol, NodeSymbol, SourceSymbol } from '../../../sld-editor/types';
import type { ViewportState } from '../../types';

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockMetadata = (overrides: Partial<ExportMetadata> = {}): ExportMetadata => ({
  projectName: 'Test Project',
  caseName: 'Test Case',
  zoomPercent: 100,
  timestamp: '2024-01-15T10:30:00.000Z',
  ...overrides,
});

const createMockBusSymbol = (id: string, x: number, y: number): NodeSymbol => ({
  id,
  elementId: `elem-${id}`,
  elementType: 'Bus',
  elementName: `Szyna ${id}`,
  position: { x, y },
  inService: true,
  width: 80,
  height: 10,
});

const createMockSourceSymbol = (id: string, x: number, y: number): SourceSymbol => ({
  id,
  elementId: `elem-${id}`,
  elementType: 'Source',
  elementName: `Źródło ${id}`,
  position: { x, y },
  inService: true,
  connectedToNodeId: 'bus-1',
});

const createMockSymbols = (): AnySldSymbol[] => [
  createMockBusSymbol('bus-1', 100, 100),
  createMockBusSymbol('bus-2', 300, 100),
  createMockSourceSymbol('src-1', 100, 50),
];

const DEFAULT_VIEWPORT: ViewportState = {
  offsetX: 50,
  offsetY: 50,
  zoom: 1.5,
};

// =============================================================================
// Type Definitions Tests
// =============================================================================

describe('Export Type Definitions', () => {
  describe('DEFAULT_LAYER_OPTIONS', () => {
    it('should have all layer options set to true by default', () => {
      expect(DEFAULT_LAYER_OPTIONS.include_legend).toBe(true);
      expect(DEFAULT_LAYER_OPTIONS.include_results_overlay).toBe(true);
      expect(DEFAULT_LAYER_OPTIONS.include_diagnostics_overlay).toBe(true);
      expect(DEFAULT_LAYER_OPTIONS.include_energization_layer).toBe(true);
      expect(DEFAULT_LAYER_OPTIONS.include_measurement_labels).toBe(true);
    });
  });

  describe('Polish Labels', () => {
    it('should have Polish labels for scope options', () => {
      expect(SCOPE_LABELS_PL.viewport).toBe('Widoczny obszar');
      expect(SCOPE_LABELS_PL.fit).toBe('Cała sieć');
    });

    it('should have Polish labels for layer options', () => {
      expect(LAYER_LABELS_PL.include_legend).toBe('Legenda');
      expect(LAYER_LABELS_PL.include_results_overlay).toBe('Nakładka wyników');
      expect(LAYER_LABELS_PL.include_diagnostics_overlay).toBe('Nakładka diagnostyki');
      expect(LAYER_LABELS_PL.include_energization_layer).toBe('Warstwa energizacji');
      expect(LAYER_LABELS_PL.include_measurement_labels).toBe('Etykiety CT/VT');
    });

    it('should have Polish labels for PNG scale options', () => {
      expect(PNG_SCALE_LABELS_PL[1]).toBe('1× (standardowa)');
      expect(PNG_SCALE_LABELS_PL[2]).toBe('2× (wysoka rozdzielczość)');
    });

    it('should have Polish labels for PDF page size options', () => {
      expect(PDF_PAGE_SIZE_LABELS_PL.A4).toBe('A4');
      expect(PDF_PAGE_SIZE_LABELS_PL.A3).toBe('A3');
    });

    it('should have Polish labels for PDF orientation options', () => {
      expect(PDF_ORIENTATION_LABELS_PL.portrait).toBe('Pionowa');
      expect(PDF_ORIENTATION_LABELS_PL.landscape).toBe('Pozioma');
      expect(PDF_ORIENTATION_LABELS_PL.auto).toBe('Automatyczna');
    });
  });
});

// =============================================================================
// Filename Generation Tests
// =============================================================================

describe('generateExportFilename', () => {
  it('should generate correct PNG filename', () => {
    const metadata = createMockMetadata();
    const filename = generateExportFilename(metadata, 'png');

    expect(filename).toMatch(/^sld_Test_Project_Test_Case_2024-01-15T10-30-00\.png$/);
  });

  it('should generate correct PDF filename', () => {
    const metadata = createMockMetadata();
    const filename = generateExportFilename(metadata, 'pdf');

    expect(filename).toMatch(/^sld_Test_Project_Test_Case_2024-01-15T10-30-00\.pdf$/);
  });

  it('should sanitize special characters in project and case names', () => {
    const metadata = createMockMetadata({
      projectName: 'Test/Project:Name',
      caseName: 'Case<>Name',
    });
    const filename = generateExportFilename(metadata, 'png');

    expect(filename).not.toContain('/');
    expect(filename).not.toContain(':');
    expect(filename).not.toContain('<');
    expect(filename).not.toContain('>');
  });

  it('should truncate long names to 32 characters', () => {
    const metadata = createMockMetadata({
      projectName: 'A'.repeat(50),
      caseName: 'B'.repeat(50),
    });
    const filename = generateExportFilename(metadata, 'png');

    // Should contain truncated names
    const parts = filename.split('_');
    expect(parts[1].length).toBeLessThanOrEqual(32);
    expect(parts[2].length).toBeLessThanOrEqual(32);
  });

  it('should use default names for empty project/case', () => {
    const metadata = createMockMetadata({
      projectName: '',
      caseName: '',
    });
    const filename = generateExportFilename(metadata, 'png');

    expect(filename).toMatch(/^sld_projekt_przypadek_/);
  });
});

// =============================================================================
// Viewport Calculation Tests
// =============================================================================

describe('calculateExportViewport', () => {
  it('should return current viewport for scope=viewport', () => {
    const symbols = createMockSymbols();
    const result = calculateExportViewport(
      'viewport',
      symbols,
      DEFAULT_VIEWPORT,
      1000,
      600
    );

    expect(result).toEqual(DEFAULT_VIEWPORT);
  });

  it('should calculate fit-to-network viewport for scope=fit', () => {
    const symbols = createMockSymbols();
    const result = calculateExportViewport(
      'fit',
      symbols,
      DEFAULT_VIEWPORT,
      1000,
      600
    );

    // Should return a different viewport than the current one
    expect(result).not.toEqual(DEFAULT_VIEWPORT);
    // Should have offset to center content
    expect(result.offsetX).toBeDefined();
    expect(result.offsetY).toBeDefined();
    // Should have appropriate zoom
    expect(result.zoom).toBeGreaterThan(0);
    expect(result.zoom).toBeLessThanOrEqual(3.0); // ZOOM_MAX
  });

  it('should handle empty symbols array for fit scope', () => {
    const result = calculateExportViewport(
      'fit',
      [],
      DEFAULT_VIEWPORT,
      1000,
      600
    );

    // Should return default viewport for empty symbols
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
    expect(result.zoom).toBe(1.0);
  });
});

// =============================================================================
// Layer State Tests
// =============================================================================

describe('getCurrentLayerState', () => {
  it('should reflect overlay visibility states', () => {
    const stateWithOverlays = getCurrentLayerState(true, true);

    expect(stateWithOverlays.include_legend).toBe(true);
    expect(stateWithOverlays.include_results_overlay).toBe(true);
    expect(stateWithOverlays.include_diagnostics_overlay).toBe(true);
    expect(stateWithOverlays.include_energization_layer).toBe(true);
    expect(stateWithOverlays.include_measurement_labels).toBe(true);
  });

  it('should reflect hidden overlay states', () => {
    const stateWithoutOverlays = getCurrentLayerState(false, false);

    expect(stateWithoutOverlays.include_legend).toBe(true); // Legend always visible
    expect(stateWithoutOverlays.include_results_overlay).toBe(false);
    expect(stateWithoutOverlays.include_diagnostics_overlay).toBe(false);
    expect(stateWithoutOverlays.include_energization_layer).toBe(true); // Energization always calculated
    expect(stateWithoutOverlays.include_measurement_labels).toBe(true);
  });

  it('should handle mixed overlay states', () => {
    const mixedState = getCurrentLayerState(true, false);

    expect(mixedState.include_results_overlay).toBe(true);
    expect(mixedState.include_diagnostics_overlay).toBe(false);
  });
});

// =============================================================================
// Export Options Creation Tests
// =============================================================================

describe('createExportOptions', () => {
  const metadata = createMockMetadata();
  const layers: ExportLayerOptions = { ...DEFAULT_LAYER_OPTIONS };

  describe('PNG options', () => {
    it('should create PNG options with default scale', () => {
      const options = createExportOptions(
        'png',
        { scope: 'viewport', layers },
        metadata
      );

      expect(options.format).toBe('png');
      expect(options.scale).toBe(1);
      expect(options.scope).toBe('viewport');
      expect(options.layers).toEqual(layers);
      expect(options.metadata).toEqual(metadata);
    });

    it('should create PNG options with 2× scale', () => {
      const options = createExportOptions(
        'png',
        { scale: 2, scope: 'fit', layers },
        metadata
      );

      expect(options.format).toBe('png');
      expect(options.scale).toBe(2);
      expect(options.scope).toBe('fit');
    });
  });

  describe('PDF options', () => {
    it('should create PDF options with defaults', () => {
      const options = createExportOptions(
        'pdf',
        { scope: 'viewport', layers },
        metadata
      );

      expect(options.format).toBe('pdf');
      expect(options.pageSize).toBe('A4');
      expect(options.orientation).toBe('auto');
      expect(options.scope).toBe('viewport');
      expect(options.layers).toEqual(layers);
      expect(options.metadata).toEqual(metadata);
    });

    it('should create PDF options with A3 and landscape', () => {
      const options = createExportOptions(
        'pdf',
        { pageSize: 'A3', orientation: 'landscape', scope: 'fit', layers },
        metadata
      );

      expect(options.format).toBe('pdf');
      expect(options.pageSize).toBe('A3');
      expect(options.orientation).toBe('landscape');
      expect(options.scope).toBe('fit');
    });
  });
});

// =============================================================================
// Determinism Tests
// =============================================================================

describe('Export Determinism', () => {
  it('should produce identical filename for identical metadata', () => {
    const metadata = createMockMetadata();

    const filename1 = generateExportFilename(metadata, 'png');
    const filename2 = generateExportFilename(metadata, 'png');

    expect(filename1).toBe(filename2);
  });

  it('should produce identical viewport for identical symbols and dimensions', () => {
    const symbols = createMockSymbols();

    const viewport1 = calculateExportViewport('fit', symbols, DEFAULT_VIEWPORT, 1000, 600);
    const viewport2 = calculateExportViewport('fit', symbols, DEFAULT_VIEWPORT, 1000, 600);

    expect(viewport1).toEqual(viewport2);
  });

  it('should produce identical layer state for identical inputs', () => {
    const state1 = getCurrentLayerState(true, false);
    const state2 = getCurrentLayerState(true, false);

    expect(state1).toEqual(state2);
  });
});
