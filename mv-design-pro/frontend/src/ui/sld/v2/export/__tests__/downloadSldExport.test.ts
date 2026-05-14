/**
 * downloadSldExport tests — P0.7 / V12K-007 UI integration.
 *
 * Verifies browser download flow:
 * - downloadSldSvg triggers anchor click + Blob URL
 * - downloadSldSvgBySelector finds <svg> by query
 * - filename hint propagated correctly
 * - URL cleanup (revokeObjectURL called)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadSldSvg, downloadSldSvgBySelector } from '../downloadSldExport';

function makeSvgElement(): SVGSVGElement {
  const parser = new DOMParser();
  const doc = parser.parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line stroke="currentColor"/></svg>`,
    'image/svg+xml',
  );
  return doc.documentElement as unknown as SVGSVGElement;
}

// jsdom does not implement URL.createObjectURL / revokeObjectURL — we have to
// shim them on the URL object so vi.spyOn can hook into them.
beforeEach(() => {
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
});

afterEach(() => {
  // Restore mocks per test
  vi.restoreAllMocks();
  // Remove any leftover anchors
  document.querySelectorAll('a[download]').forEach((a) => a.remove());
});

describe('downloadSldSvg — pipeline integration', () => {
  it('returns filename hint and triggers anchor click', () => {
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Watch click on anchor before download is called
    const originalCreate = document.createElement.bind(document);
    let anchorClicked = false;
    const createSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string, options?: ElementCreationOptions) => {
        const el = originalCreate(tag, options);
        if (tag === 'a') {
          // Stub click
          const a = el as HTMLAnchorElement;
          const origClick = a.click.bind(a);
          a.click = () => {
            anchorClicked = true;
            origClick();
          };
        }
        return el;
      });

    const svg = makeSvgElement();
    const filename = downloadSldSvg(svg, {
      projectName: 'Test',
      caseLabel: 'Wariant',
    });

    expect(filename).toBe('sld_test_wariant_light_technical.svg');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClicked).toBe(true);
    createSpy.mockRestore();
  });

  it('uses default project/case slugs when not provided', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:default');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const filename = downloadSldSvg(makeSvgElement());
    expect(filename).toBe('sld_projekt_snapshot_light_technical.svg');
  });

  it('creates Blob with image/svg+xml MIME type', () => {
    let blobCaptured: Blob | null = null;
    const origCreateObjectURL = URL.createObjectURL;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob) => {
      blobCaptured = b;
      return 'blob:captured';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    downloadSldSvg(makeSvgElement());

    expect(blobCaptured).not.toBeNull();
    expect((blobCaptured as Blob | null)?.type).toBe('image/svg+xml');
    URL.createObjectURL = origCreateObjectURL;
  });
});

describe('downloadSldSvgBySelector — fallback lookup', () => {
  it('finds <svg> by selector and triggers download', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sel');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    document.body.innerHTML = `
      <div data-testid="sld-host">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
          <line stroke="currentColor"/>
        </svg>
      </div>
    `;
    const filename = downloadSldSvgBySelector('[data-testid="sld-host"]', {
      projectName: 'Sel',
    });
    expect(filename).toBe('sld_sel_snapshot_light_technical.svg');
  });

  it('returns null when selector matches nothing', () => {
    const filename = downloadSldSvgBySelector('[data-testid="nope"]');
    expect(filename).toBeNull();
  });

  it('returns null when element has no <svg> child', () => {
    document.body.innerHTML = `<div data-testid="empty-host"></div>`;
    const filename = downloadSldSvgBySelector('[data-testid="empty-host"]');
    expect(filename).toBeNull();
  });

  it('works when selector itself targets an <svg>', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:svg-target');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    document.body.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" id="direct-svg" viewBox="0 0 50 50"><line stroke="currentColor"/></svg>
    `;
    const filename = downloadSldSvgBySelector('#direct-svg', {
      projectName: 'Direct',
    });
    expect(filename).toBe('sld_direct_snapshot_light_technical.svg');
  });
});
