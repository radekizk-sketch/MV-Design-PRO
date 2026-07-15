import { describe, it, expect } from 'vitest';
import { mapujProjekty } from '../adapters/projektyAdapter';
import type { Project } from '../../../../../ui/projects/api';

function projekt(overrides: Partial<Project> = {}): Project {
  return {
    id: 'PR1',
    name: 'Sieć SN Rejon Wschód',
    description: null,
    created_at: '2026-06-01T08:00:00Z',
    updated_at: '2026-07-10T09:15:00Z',
    ...overrides,
  };
}

describe('projektyAdapter — mapujProjekty (czysta projekcja Project → ProjektWiersz)', () => {
  it('mapuje pojedynczy projekt na wiersz (id, nazwa, ostatniaZmianaISO)', () => {
    const wynik = mapujProjekty([projekt()]);
    expect(wynik).toEqual([
      { id: 'PR1', nazwa: 'Sieć SN Rejon Wschód', ostatniaZmianaISO: '2026-07-10T09:15:00Z' },
    ]);
  });

  it('zachowuje kolejność wielu projektów', () => {
    const wynik = mapujProjekty([
      projekt({ id: 'PR1', name: 'Pierwszy' }),
      projekt({ id: 'PR2', name: 'Drugi' }),
    ]);
    expect(wynik.map((w) => w.id)).toEqual(['PR1', 'PR2']);
    expect(wynik.map((w) => w.nazwa)).toEqual(['Pierwszy', 'Drugi']);
  });

  it('pusta lista wejściowa → pusta lista wyjściowa', () => {
    expect(mapujProjekty([])).toEqual([]);
  });
});
