import { afterEach, describe, expect, it, vi } from 'vitest';

import { DerPersistenceApiError, postDerGeneratorConfig } from '../derPersistenceApi';

const validBody = {
  station_ref: 'stacja-testowa',
  der_kind: 'PV' as const,
  power_mw: 0.5,
  connection_variant: 'nn_side' as const,
  catalog_ref: 'conv-pv-nn-0p5mw-0p4kv',
};

describe('derPersistenceApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ukrywa endpointy i identyfikatory techniczne w komunikacie błędu DER', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      detail: {
        message_pl: 'Przypadek obliczeniowy nie należy do wskazanego projektu.',
        code: 'case_project_mismatch',
      },
    }), {
      status: 409,
      statusText: 'Conflict',
      headers: { 'Content-Type': 'application/json' },
    })));

    let caught: unknown = null;
    try {
      await postDerGeneratorConfig(
        '70a99b32-abb8-4249-bf17-96f6d85183b9',
        'a889f26d-7f3b-425e-a5ec-94b2d45569c8',
        validBody,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DerPersistenceApiError);
    const message = (caught as Error).message;
    expect(message).toBe(
      'Aktywny przypadek obliczeniowy nie jest powiązany z wybranym projektem. Wybierz właściwy projekt albo aktywny przypadek.',
    );
    expect(message).not.toContain('/api/');
    expect(message).not.toContain('70a99b32');
    expect(message).not.toContain('a889f26d');
  });
});
