/*
 * Testy czystych adapterów mapowania moduł→węzeł (P47b): `busRefModuluSily`
 * (po `modules[].ref` widoku siły sieci) oraz `busRefModuluQ` (po `sources[].ref`
 * widoku adekwatności Q, reużycie istniejącego pola `bus_ref`). Bez zgadywania:
 * brak dopasowania → null.
 */

import { describe, expect, it } from 'vitest';

import { busRefModuluQ, busRefModuluSily } from '../pulpitModel';
import { adekwatnoscQFixture, silaSieciFixture } from './analizyFixtures';

describe('busRefModuluSily — węzeł modułu z widoku siły sieci (kryterium 2)', () => {
  it('zwraca bus_ref wiersza, którego modules zawiera moduł o danym ref', () => {
    expect(busRefModuluSily(silaSieciFixture(), 'src-1')).toBe('bus-pcc-1');
    expect(busRefModuluSily(silaSieciFixture(), 'src-2')).toBe('bus-pcc-2');
  });

  it('moduł na wierszu „brak danych" nadal mapuje na węzeł', () => {
    expect(busRefModuluSily(silaSieciFixture(), 'src-3')).toBe('bus-pcc-3');
  });

  it('brak modułu o danym ref → null (węzeł nieodnaleziony)', () => {
    expect(busRefModuluSily(silaSieciFixture(), 'nieistniejacy')).toBeNull();
  });
});

describe('busRefModuluQ — węzeł modułu z widoku adekwatności Q (kryterium 2)', () => {
  it('zwraca bus_ref źródła o danym ref (reużycie istniejącego pola)', () => {
    expect(busRefModuluQ(adekwatnoscQFixture(), 'src-1')).toBe('bus-pcc-1');
    expect(busRefModuluQ(adekwatnoscQFixture(), 'src-2')).toBe('bus-pcc-2');
  });

  it('brak źródła o danym ref → null', () => {
    expect(busRefModuluQ(adekwatnoscQFixture(), 'nieistniejacy')).toBeNull();
  });
});
