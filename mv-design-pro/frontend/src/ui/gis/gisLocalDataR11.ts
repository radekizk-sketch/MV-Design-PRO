/** R11 — bezpieczna projekcja WYŁĄCZNIE lokalnej geometrii GeoJSON na MapLibre.
 * Nie wykonuje żadnej mutacji ENM, nie tworzy połączeń przez przecięcia geometrii.
 */
export type Punkt = [number, number];
export type Geometria = { type: 'Point'; coordinates: Punkt } |
  { type: 'LineString'; coordinates: Punkt[] };
export type ElementGIS = {
  type: 'Feature';
  id: string;
  geometry: Geometria;
  properties: { id: string; name: string; kind: string; topologyVerified: false };
};
export type ZbiorGIS = { type: 'FeatureCollection'; features: ElementGIS[] };
export class BladDanychGIS extends Error {
  constructor(public readonly kod: string) { super(kod); }
}
const LIMIT = 20_000;
const MAX_VERTEX = 20_000;
const ID = /^[\p{L}\p{N}_:.-]{1,120}$/u;
const SENSITIVE = /^(pesel|ppe|email|phone|telefon|nazwisko|odbiorca|klient|customer_id|meter_id)$/i;
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function punkt(v: unknown): v is Punkt {
  return Array.isArray(v) && v.length === 2 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    v[0] >= -180 && v[0] <= 180 && v[1] >= -85 && v[1] <= 85;
}
function geometria(v: unknown): v is Geometria {
  if (!record(v)) return false;
  const c = v.coordinates;
  if (v.type === 'Point') return punkt(c);
  return v.type === 'LineString' && Array.isArray(c) &&
    c.length >= 2 && c.length <= MAX_VERTEX && c.every(punkt) &&
    c.some((p, i) => i > 0 && (p[0] !== c[0][0] || p[1] !== c[0][1]));
}
/** Nie przyjmuje CRSs innych niż GeoJSON RFC 7946 (WGS 84).
 * EPSG:2180 należy przed importem jawnie transformować z dowodem.
 */
export function wczytajGeoJSON(raw: unknown): ZbiorGIS {
  if (!record(raw) || raw.type !== 'FeatureCollection' ||
      !Array.isArray(raw.features) || raw.features.length > LIMIT ||
      'crs' in raw) {
    throw new BladDanychGIS('NIEPOPRAWNA_KOLEKCJA_LUB_CRS');
  }
  const ids = new Set<string>();
  const features: ElementGIS[] = [];
  for (const rawFeature of raw.features) {
    if (!record(rawFeature) || rawFeature.type !== 'Feature' ||
        !record(rawFeature.properties)) throw new BladDanychGIS('NIEPOPRAWNY_OBIEKT');
    const id = rawFeature.id ?? rawFeature.properties.id;
    if (typeof id !== 'string' || !ID.test(id) || ids.has(id)) {
      throw new BladDanychGIS('ID_BRAK_LUB_POWIELONE');
    }
    if (!geometria(rawFeature.geometry)) throw new BladDanychGIS('NIEPOPRAWNA_GEOMETRIA');
    if (Object.keys(rawFeature.properties).some((k) => SENSITIVE.test(k))) {
      throw new BladDanychGIS('DANE_OSOBOWE_W_IMPORCIE');
    }
    ids.add(id);
    const name = rawFeature.properties.name;
    const kind = rawFeature.properties.kind;
    features.push({
      type: 'Feature', id,
      geometry: rawFeature.geometry.type === 'Point'
        ? { type: 'Point', coordinates: [...rawFeature.geometry.coordinates] as Punkt }
        : { type: 'LineString', coordinates: rawFeature.geometry.coordinates.map((p) => [...p] as Punkt) },
      properties: {
        id, name: typeof name === 'string' ? name.slice(0, 120) : id,
        kind: typeof kind === 'string' ? kind.slice(0, 60) : 'nieokreślony',
        topologyVerified: false,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
export function przykładowaSiecSN(): ZbiorGIS {
  // Syntetyczne współrzędne — NIE lokalizacja rzeczywistej infrastruktury.
  return wczytajGeoJSON({ type: 'FeatureCollection', features: [
    {type:'Feature',id:'SYN-ST-01',properties:{name:'Stacja SN/nN A',kind:'station'},
      geometry:{type:'Point',coordinates:[16.9,52.4]}},
    {type:'Feature',id:'SYN-ST-02',properties:{name:'Stacja SN/nN B',kind:'station'},
      geometry:{type:'Point',coordinates:[16.911,52.408]}},
    {type:'Feature',id:'SYN-RZ-01',properties:{name:'Rozłącznik SN',kind:'switch'},
      geometry:{type:'Point',coordinates:[16.905,52.403]}},
    {type:'Feature',id:'SYN-LN-01',properties:{name:'Kabel SN 15 kV',kind:'line_sn'},
      geometry:{type:'LineString',coordinates:[[16.9,52.4],[16.905,52.403],[16.911,52.408]]}},
  ]});
}
export function wszystkiePunkty(z: ZbiorGIS): Punkt[] {
  return z.features.flatMap((f) => f.geometry.type === 'Point'
    ? [f.geometry.coordinates] : f.geometry.coordinates);
}
