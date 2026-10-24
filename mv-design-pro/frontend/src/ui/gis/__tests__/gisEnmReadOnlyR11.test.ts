import { describe, expect, it } from 'vitest';
import { dopasujIdDoEnm } from '../gisEnmReadOnlyR11';

describe('GIS R11: geometria i ENM pozostają odrębnymi projekcjami', () => {
  const snapshot = {
    header: { revision: 42 },
    buses: [{ref_id:'SYN-BUS-1'}],
    branches: [{ref_id:'SYN-LN-1',length_km:0.12}],
    substations: [{ref_id:'SYN-ST-1'}],
  };
  it('odczytuje rzeczywisty ref_id z przekazanej migawki', () => {
    const found=dopasujIdDoEnm(snapshot,'SYN-LN-1');
    expect(found).toHaveLength(1);
    expect(found[0].kolekcja).toBe('branches');
  });
  it('nie ogłasza potwierdzenia topologii', () => {
    expect(dopasujIdDoEnm(snapshot,'SYN-LN-1')[0].stan)
      .toBe('ZGODNY_IDENTYFIKATOR_NIEZWERYFIKOWANA_TOPOLOGIA');
  });
  it('nie tworzy elementu ENM, gdy ID nie pasuje', () =>
    expect(dopasujIdDoEnm(snapshot,'SYN-LN-999')).toEqual([]));
  it('puste, niekompletne migawki nie tworzą domyślnych połączeń', () => {
    expect(dopasujIdDoEnm(null,'SYN-LN-1')).toEqual([]);
    expect(dopasujIdDoEnm({branches:null},'SYN-LN-1')).toEqual([]);
  });
  it('nie zmienia migawki ENM', () => {
    const before=JSON.stringify(snapshot);
    dopasujIdDoEnm(snapshot,'SYN-LN-1');
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
