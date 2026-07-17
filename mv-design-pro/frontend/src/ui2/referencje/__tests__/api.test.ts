/**
 * Testy klienta Reference Engine V1 (mock fetch na kontrakcie HANDOFF §1.1 —
 * wzorzec `ui/enm-inspector/__tests__/referencePanel.test.tsx`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  fetchReferencePacks,
  fetchReferencePack,
  REFERENCE_PACK_KIND_LABELS_PL,
  type ReferencePackSummary,
} from '../api';

const PACKS: ReferencePackSummary[] = [
  {
    pack_id: 'iec62271',
    kind: 'norm',
    name_pl: 'IEC 62271 — profile pól',
    version: '1.0.0',
    status: 'active',
    switchgear_family_ref: null,
    source_document_refs: ['IEC 62271-200'],
  },
  {
    pack_id: 'schneider_sm6',
    kind: 'manufacturer',
    name_pl: 'Schneider SM6-24',
    version: '1.0.0',
    status: 'active',
    switchgear_family_ref: 'SM6_24',
    source_document_refs: ['Katalog SM6'],
  },
  {
    pack_id: 'osd_enea',
    kind: 'osd',
    name_pl: 'OSD Enea — stacje SN/nN',
    version: '1.0.0',
    status: 'active',
    switchgear_family_ref: null,
    source_document_refs: ['Zeszyt 1'],
  },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).endsWith('/reference/packs')) {
        return { ok: true, json: async () => PACKS } as Response;
      }
      if (String(url).includes('/reference/packs/schneider_sm6')) {
        return {
          ok: true,
          json: async () => ({
            ...PACKS[1],
            cell_configurations: [
              { cell_code: 'QM', name_pl: 'Celka QM', standard: true, apparatus: ['LBS', 'FUSE'] },
            ],
          }),
        } as Response;
      }
      return { ok: false, statusText: 'Not Found', json: async () => ({}) } as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('klient Reference Engine (ui2/referencje)', () => {
  it('pobiera listę pakietów bez filtra (kontrakt §1.1)', async () => {
    const packs = await fetchReferencePacks();
    expect(packs).toHaveLength(3);
    expect(packs[0].pack_id).toBe('iec62271');
  });

  it('filtr kind=manufacturer zwraca wyłącznie pakiety producentów', async () => {
    const packs = await fetchReferencePacks('manufacturer');
    expect(packs).toHaveLength(1);
    expect(packs[0].switchgear_family_ref).toBe('SM6_24');
  });

  it('pobiera pełny pakiet z konfiguracjami celek (kody celek = notacja katalogowa)', async () => {
    const pack = await fetchReferencePack('schneider_sm6');
    expect(pack.cell_configurations?.[0].cell_code).toBe('QM');
    expect(pack.cell_configurations?.[0].standard).toBe(true);
  });

  it('błąd HTTP → komunikat PL', async () => {
    await expect(fetchReferencePack('brak')).rejects.toThrow(
      'Błąd pobierania pakietu referencyjnego',
    );
  });

  it('etykiety rodzajów pakietów PL z jednego źródła (reeksport, zakaz drugiej definicji)', () => {
    expect(REFERENCE_PACK_KIND_LABELS_PL.norm).toBe('Norma');
    expect(REFERENCE_PACK_KIND_LABELS_PL.manufacturer).toBe('Producent');
    expect(REFERENCE_PACK_KIND_LABELS_PL.osd).toBe('OSD');
  });
});
