import { describe, expect, it } from 'vitest';
import { wczytajGeoJSON, przykładowaSiecSN, wszystkiePunkty, BladDanychGIS } from '../gisLocalDataR11';

const base = () => ({
  type: 'FeatureCollection', features: [
    { type: 'Feature', id: 'SYN-L1', geometry: {
      type: 'LineString', coordinates: [[16.9, 52.4], [16.91, 52.41]],
    }, properties: { name: 'Linia SN', kind: 'line_sn', untrusted: 'nigdy nie przenosić' } },
  ],
});

describe('GIS R11: wejściowa geometria lokalna bez modelu ENM', () => {
  it('ładuje wyłącznie geometrię WGS84', () => {
    const z = wczytajGeoJSON(base());
    expect(z.features).toHaveLength(1);
    expect(z.features[0].properties.topologyVerified).toBe(false);
  });
  it('usuwa nieznane atrybuty, nie przechowuje ich w projekcji', () => {
    expect(wczytajGeoJSON(base()).features[0].properties).not.toHaveProperty('untrusted');
  });
  it('nie modyfikuje źródłowego importu', () => {
    const before = base();
    wczytajGeoJSON(before);
    expect(before.features[0].properties.untrusted).toBe('nigdy nie przenosić');
  });
  it('odrzuca CRS deklarowany poza GeoJSON', () =>
    expect(() => wczytajGeoJSON({ ...base(), crs: { type: 'name', properties: { name: 'EPSG:2180' } } }))
      .toThrow(BladDanychGIS));
  it('odrzuca błędne współrzędne', () => {
    const z = base();
    z.features[0].geometry.coordinates[1] = [300, 1000];
    expect(() => wczytajGeoJSON(z)).toThrow('NIEPOPRAWNA_GEOMETRIA');
  });
  it('odrzuca zduplikowany identyfikator', () => {
    const z = base();
    z.features.push({ ...z.features[0] });
    expect(() => wczytajGeoJSON(z)).toThrow('ID_BRAK_LUB_POWIELONE');
  });
  it('odrzuca podejrzane dane osobowe', () => {
    const z = base();
    Object.assign(z.features[0].properties, { pesel: 'synthetic' });
    expect(() => wczytajGeoJSON(z)).toThrow('DANE_OSOBOWE_W_IMPORCIE');
  });
  it('odrzuca linie zerowej długości', () => {
    const z = base();
    z.features[0].geometry.coordinates[1] = [16.9, 52.4];
    expect(() => wczytajGeoJSON(z)).toThrow('NIEPOPRAWNA_GEOMETRIA');
  });
  it('próbka jest jawnie syntetyczna', () => {
    const z = przykładowaSiecSN();
    expect(z.features.every((f) => f.id.startsWith('SYN-'))).toBe(true);
    expect(wszystkiePunkty(z).length).toBeGreaterThan(3);
  });
});
