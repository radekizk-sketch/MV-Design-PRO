/**
 * Project Archive API Tests
 *
 * Tests for the project archive API client.
 * Validates:
 * - exportProject: POST call, blob response, error handling
 * - downloadProjectArchive: file naming, cleanup
 * - importProject: FormData construction, options handling
 * - previewArchive: FormData construction, response parsing
 * - Error message extraction from JSON responses
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  exportProject,
  importProject,
  previewArchive,
  downloadProjectArchive,
} from '../api';
import type { ImportResponse, ArchivePreviewResponse } from '../types';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const MOCK_IMPORT_RESPONSE: ImportResponse = {
  status: 'SUCCESS',
  project_id: 'proj-new',
  warnings: [],
  errors: [],
  migrated_from_version: null,
};

const MOCK_PREVIEW_RESPONSE: ArchivePreviewResponse = {
  valid: true,
  format_id: 'mvdp-archive-v1',
  schema_version: '1.0.0',
  project_name: 'Test Projekt',
  project_description: 'Opis projektu',
  exported_at: '2025-01-15T10:00:00Z',
  archive_hash: 'sha256:abc123',
  summary: {
    nodes_count: 5,
    branches_count: 4,
    sources_count: 1,
    loads_count: 3,
    snapshots_count: 2,
    sld_diagrams_count: 1,
    study_cases_count: 2,
    operating_cases_count: 0,
    analysis_runs_count: 1,
    study_runs_count: 1,
    results_count: 1,
    proofs_count: 0,
  },
};

describe('exportProject', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should POST to correct export endpoint', async () => {
    const mockBlob = new Blob(['zip content'], { type: 'application/zip' });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    await exportProject('proj-123');

    expect(mockFetch).toHaveBeenCalledWith('/api/projects/proj-123/export', {
      method: 'POST',
    });
  });

  it('should return a Blob on success', async () => {
    const mockBlob = new Blob(['zip content'], { type: 'application/zip' });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const result = await exportProject('proj-123');
    expect(result).toBeInstanceOf(Blob);
  });

  it('should throw on HTTP error with detail message', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ detail: 'Projekt nie znaleziony' }),
    });

    await expect(exportProject('proj-bad')).rejects.toThrow('Projekt nie znaleziony');
  });

  it('should throw generic error when response is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('Not JSON')),
    });

    await expect(exportProject('proj-bad')).rejects.toThrow(/500/);
  });
});

describe('downloadProjectArchive', () => {
  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;

  beforeEach(() => {
    mockFetch.mockReset();
    // Polyfill URL.createObjectURL/revokeObjectURL for jsdom
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => document.body);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => document.body);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('should create download link with correct filename', async () => {
    const mockBlob = new Blob(['zip content'], { type: 'application/zip' });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    let createdLink: HTMLAnchorElement | null = null;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        createdLink = { click: vi.fn(), href: '', download: '' } as unknown as HTMLAnchorElement;
        return createdLink as unknown as HTMLElement;
      }
      return originalCreateElement(tag);
    });

    await downloadProjectArchive('12345678-abcd-efgh', 'Moj Projekt');

    expect(createdLink).not.toBeNull();
    // Name should sanitize special characters and use project ID prefix
    expect(createdLink!.download).toMatch(/Moj_Projekt_12345678\.mvdp\.zip/);
  });

  it('should fallback to "projekt" when no name provided', async () => {
    const mockBlob = new Blob(['zip content'], { type: 'application/zip' });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    let createdLink: HTMLAnchorElement | null = null;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        createdLink = { click: vi.fn(), href: '', download: '' } as unknown as HTMLAnchorElement;
        return createdLink as unknown as HTMLElement;
      }
      return originalCreateElement(tag);
    });

    await downloadProjectArchive('12345678-abcd');

    expect(createdLink!.download).toMatch(/^projekt_/);
  });

  it('should revoke object URL after download', async () => {
    const mockBlob = new Blob(['zip content'], { type: 'application/zip' });
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { click: vi.fn(), href: '', download: '' } as unknown as HTMLElement;
      }
      return originalCreateElement(tag);
    });

    await downloadProjectArchive('12345678-abcd');

    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('importProject', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should POST file as FormData to import endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_IMPORT_RESPONSE),
    });

    const file = new File(['content'], 'test.mvdp.zip', { type: 'application/zip' });
    await importProject(file);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/projects/import');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
  });

  it('should include new_name in FormData when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_IMPORT_RESPONSE),
    });

    const file = new File(['content'], 'test.mvdp.zip');
    await importProject(file, { newName: 'Nowy projekt' });

    const [, options] = mockFetch.mock.calls[0];
    const formData = options.body as FormData;
    expect(formData.get('new_name')).toBe('Nowy projekt');
  });

  it('should include verify_integrity flag when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_IMPORT_RESPONSE),
    });

    const file = new File(['content'], 'test.mvdp.zip');
    await importProject(file, { verifyIntegrity: true });

    const [, options] = mockFetch.mock.calls[0];
    const formData = options.body as FormData;
    expect(formData.get('verify_integrity')).toBe('true');
  });

  it('should return ImportResponse on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_IMPORT_RESPONSE),
    });

    const file = new File(['content'], 'test.mvdp.zip');
    const result = await importProject(file);

    expect(result.status).toBe('SUCCESS');
    expect(result.project_id).toBe('proj-new');
  });

  it('should throw on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ detail: 'Nieprawidlowy format archiwum' }),
    });

    const file = new File(['bad'], 'bad.zip');
    await expect(importProject(file)).rejects.toThrow('Nieprawidlowy format archiwum');
  });
});

describe('previewArchive', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should POST file to preview endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_PREVIEW_RESPONSE),
    });

    const file = new File(['content'], 'test.mvdp.zip');
    await previewArchive(file);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/projects/import/preview');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);
  });

  it('should return ArchivePreviewResponse on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_PREVIEW_RESPONSE),
    });

    const file = new File(['content'], 'test.mvdp.zip');
    const result = await previewArchive(file);

    expect(result.valid).toBe(true);
    expect(result.project_name).toBe('Test Projekt');
    expect(result.summary?.nodes_count).toBe(5);
    expect(result.summary?.branches_count).toBe(4);
  });

  it('should return invalid preview for corrupt archives', async () => {
    const invalidPreview: ArchivePreviewResponse = {
      valid: false,
      error: 'Uszkodzone archiwum',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(invalidPreview),
    });

    const file = new File(['corrupt'], 'bad.zip');
    const result = await previewArchive(file);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Uszkodzone archiwum');
    expect(result.summary).toBeUndefined();
  });

  it('should throw on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ detail: 'Blad serwera' }),
    });

    const file = new File(['content'], 'test.mvdp.zip');
    await expect(previewArchive(file)).rejects.toThrow('Blad serwera');
  });
});
