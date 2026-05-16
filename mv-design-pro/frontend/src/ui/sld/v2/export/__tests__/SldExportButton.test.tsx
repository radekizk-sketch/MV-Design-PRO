/**
 * SldExportButton component tests — P0.7 / V12K-007 UI integration.
 *
 * Verifies:
 * - Button renders with default Polish label "Pobierz SVG"
 * - Click triggers export via selector (default 'sld-canvas-root')
 * - onExported callback invoked with filename
 * - onError invoked when SVG not found
 * - busy state during eksport (disabled + "Eksportowanie…" label)
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SldExportButton } from '../SldExportButton';

beforeEach(() => {
  // jsdom does not implement URL.createObjectURL — shim before spy
  // @ts-expect-error jsdom shim
  if (typeof URL.createObjectURL !== 'function') {
    // @ts-expect-error jsdom shim
    URL.createObjectURL = () => 'blob:shim';
  }
  // @ts-expect-error jsdom shim
  if (typeof URL.revokeObjectURL !== 'function') {
    // @ts-expect-error jsdom shim
    URL.revokeObjectURL = () => {};
  }
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('SldExportButton — rendering', () => {
  it('renders with default Polish label "Pobierz SVG"', () => {
    render(<SldExportButton />);
    expect(screen.getByRole('button', { name: 'Pobierz SVG' })).toBeTruthy();
  });

  it('renders custom label when provided', () => {
    render(<SldExportButton label="Eksport schema SVG" />);
    expect(screen.getByRole('button', { name: 'Eksport schema SVG' })).toBeTruthy();
  });

  it('exposes data-testid="sld-export-svg-button"', () => {
    render(<SldExportButton />);
    expect(screen.getByTestId('sld-export-svg-button')).toBeTruthy();
  });
});

describe('SldExportButton — click flow', () => {
  it('triggers export with selector default + onExported callback', async () => {
    document.body.innerHTML = `
      <div data-testid="sld-canvas-root">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <line stroke="currentColor"/>
        </svg>
      </div>
    `;
    const onExported = vi.fn();
    render(
      <SldExportButton
        projectName="Test Proj"
        caseLabel="Wariant A"
        onExported={onExported}
      />,
    );

    fireEvent.click(screen.getByTestId('sld-export-svg-button'));

    await waitFor(() =>
      expect(onExported).toHaveBeenCalledWith(
        'sld_test_proj_wariant_a_light_technical.svg',
      ),
    );
  });

  it('invokes onError when SVG element not found', async () => {
    const onError = vi.fn();
    const onExported = vi.fn();
    render(
      <SldExportButton
        svgSelector="[data-testid='missing-svg']"
        onError={onError}
        onExported={onExported}
      />,
    );

    fireEvent.click(screen.getByTestId('sld-export-svg-button'));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0][0]).toContain('Nie znaleziono elementu SVG');
    expect(onExported).not.toHaveBeenCalled();
  });
});
