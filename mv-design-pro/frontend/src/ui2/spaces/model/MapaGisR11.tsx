/** R11: prawdziwy silnik MapLibre WebGL, pracujący domyślnie BEZ sieci.
 * Mapa jest WYŁĄCZNIE projekcją; nie zapisuje topologii ani parametrów ENM.
 * Funkcja występuje tylko po jawnym włączeniu VITE_MV_GIS_R11.
 */
import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike, type FilterSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { ZRODLA_PODKLADOW, przygotujRasterWms, type PlanRastra } from '../../../ui/gis/geoportalSourcesR07';
import { wczytajGeoJSON, przykładowaSiecSN, wszystkiePunkty, type ZbiorGIS, type ElementGIS } from '../../../ui/gis/gisLocalDataR11';
import { odczytajWarstwyWms, type NazwaWarstwyR11 } from '../../../ui/gis/gisWmsR11';
import { dopasujIdDoEnm } from '../../../ui/gis/gisEnmReadOnlyR11';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useAppStateStore } from '../../../ui/app-state';
import { emituj, subskrybuj } from '../../events';
import './mapaGisR11.css';

setWorkerUrl(workerUrl);

const MAPA_PUSTA = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'tlo-puste', type: 'background' as const, paint: { 'background-color': '#0d1b2b' } }],
};
const EMPTY: ZbiorGIS = { type: 'FeatureCollection', features: [] };
const GIS_SOURCE = 'mvd-gis-geometria';
const GIS_LINE = 'mvd-gis-linie';
const GIS_POINT = 'mvd-gis-punkty';
const GIS_SELECTED_LINE = 'mvd-gis-wybrana-linia';
const GIS_SELECTED_POINT = 'mvd-gis-wybrany-punkt';

function dopasujWidok(map: MapLibreMap, zbior: ZbiorGIS): void {
  const points = wszystkiePunkty(zbior);
  if (!points.length) return;
  let west = 180, east = -180, south = 90, north = -90;
  for (const [lon, lat] of points) {
    west = Math.min(west, lon); east = Math.max(east, lon);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  const deltaLon = Math.max(0.001, (east - west) * 0.08);
  const deltaLat = Math.max(0.001, (north - south) * 0.08);
  const bounds: LngLatBoundsLike = [[west - deltaLon, south - deltaLat], [east + deltaLon, north + deltaLat]];
  map.fitBounds(bounds, { padding: 42, maxZoom: 16, duration: 0 });
}

export default function MapaGisR11({ onShowSld }: { onShowSld?: () => void }) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const snapshotEnm = useSnapshotStore((s) => s.snapshot);
  const refreshEnm = useSnapshotStore((s) => s.refreshFromBackend);
  const aktywnyPrzypadekId = useAppStateStore((s) => s.activeCaseId);
  const snapshotRef = useRef(snapshotEnm);
  useEffect(() => { snapshotRef.current = snapshotEnm; }, [snapshotEnm]);
  const rewizjaEnm = useSnapshotStore((s) => s.rewizjaBiezacegoModelu);
  const [ready, setReady] = useState(false);
  const [objects, setObjects] = useState<ZbiorGIS>(EMPTY);
  const [fileStatus, setFileStatus] = useState('Brak danych projektu. Importuj GeoJSON lub użyj syntetycznej próbki.');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState('orto');
  const [layerXml, setLayerXml] = useState('');
  const [wmsLayers, setWmsLayers] = useState<NazwaWarstwyR11[]>([]);
  const [layerName, setLayerName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [allowNetwork, setAllowNetwork] = useState(false);
  const [raster, setRaster] = useState<PlanRastra | null>(null);

  const element: ElementGIS | undefined = objects.features.find((f) => f.id === selected);
  const matches = element ? dopasujIdDoEnm(snapshotEnm, element.id) : [];

  async function pokazBiezacySld(): Promise<void> {
    if (!aktywnyPrzypadekId) {
      setError('Wybierz przypadek obliczeniowy przed otwarciem schematu.');
      return;
    }
    const response = await refreshEnm(aktywnyPrzypadekId);
    if (!response?.snapshot || response.error) {
      setError('Nie udało się odczytać aktualnego ENM. Schemat pozostaje nieotwarty.');
      return;
    }
    setError(null);
    onShowSld?.();
  }

  function wybierzNaMapie(id: string) {
    setSelected(id);
    // Zgodne ref_id może zasilić wspólną selekcję widoków, ale NIE potwierdza
    // żadnego terminala, topologii ani parametrów elektrycznych.
    if (dopasujIdDoEnm(snapshotRef.current, id).length === 1) {
      emituj({ typ: 'selekcja', obiektId: id, zrodlo: 'gis-mapa' });
    }
  }

  useEffect(() => subskrybuj('selekcja', (zdarzenie) => {
    if (zdarzenie.zrodlo === 'gis-mapa') return;
    if (zdarzenie.obiektId === null) {
      setSelected(null);
    } else if (objects.features.some((f) => f.id === zdarzenie.obiektId)) {
      setSelected(zdarzenie.obiektId);
    }
  }), [objects]);

  useEffect(() => {
    if (!container.current) return;
    let active = true;
    let instance: MapLibreMap | null = null;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: MAPA_PUSTA,
        center: [16.9, 52.4],
        zoom: 12,
        attributionControl: true,
        renderWorldCopies: false,
      });
      map.current = instance;
      instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
      instance.on('load', () => {
        if (!active || !instance) return;
        instance.addSource(GIS_SOURCE, { type: 'geojson', data: EMPTY });
        instance.addLayer({
          id: GIS_LINE, type: 'line', source: GIS_SOURCE,
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: { 'line-color': '#00e5ff', 'line-width': 3.2 },
        });
        instance.addLayer({
          id: GIS_POINT, type: 'circle', source: GIS_SOURCE,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 6, 'circle-color': '#ff9100', 'circle-stroke-width': 2, 'circle-stroke-color': '#e9f6ff' },
        });
        instance.addLayer({
          id: GIS_SELECTED_LINE, type: 'line', source: GIS_SOURCE,
          filter: ['==', ['get', 'id'], '___brak___'],
          paint: { 'line-color': '#ff9100', 'line-width': 6 },
        });
        instance.addLayer({
          id: GIS_SELECTED_POINT, type: 'circle', source: GIS_SOURCE,
          filter: ['==', ['get', 'id'], '___brak___'],
          paint: { 'circle-radius': 10, 'circle-color': '#00e5ff', 'circle-stroke-width': 3, 'circle-stroke-color': '#ff9100' },
        });
        const choose = (event: { features?: Array<{ properties?: { id?: string } }> }) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === 'string') wybierzNaMapie(id);
        };
        instance.on('click', GIS_LINE, choose);
        instance.on('click', GIS_POINT, choose);
        setReady(true);
      });
      instance.on('error', (event) => {
        const message = event.error instanceof Error ? event.error.message : 'Błąd mapy WebGL';
        if (active) setError(message);
      });
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Nie udało się uruchomić MapLibre WebGL');
    }
    return () => {
      active = false;
      setReady(false);
      instance?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    const source = map.current.getSource(GIS_SOURCE) as GeoJSONSource | undefined;
    source?.setData(objects);
    dopasujWidok(map.current, objects);
  }, [objects, ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const filter: FilterSpecification = ['==', ['get', 'id'], selected ?? '___brak___'];
    if (map.current.getLayer(GIS_SELECTED_LINE)) map.current.setFilter(GIS_SELECTED_LINE, filter);
    if (map.current.getLayer(GIS_SELECTED_POINT)) map.current.setFilter(GIS_SELECTED_POINT, filter);
  }, [selected, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !raster) return;
    try {
      m.addSource(raster.id, {
        type: 'raster', tiles: [...raster.tiles], tileSize: 256,
        attribution: raster.przypisanie,
      });
      m.addLayer({
        id: raster.id, type: 'raster', source: raster.id,
        paint: { 'raster-opacity': raster.przezroczystosc },
      }, GIS_LINE);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Nie udało się uruchomić warstwy WMS');
    }
    return () => {
      if (m.getLayer(raster.id)) m.removeLayer(raster.id);
      if (m.getSource(raster.id)) m.removeSource(raster.id);
    };
  }, [raster, ready]);

  async function importujGeoJSON(file: File | undefined) {
    if (!file) return;
    if (file.size > 5_000_000) { setError('Plik przekracza 5 MB.'); return; }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const normalized = wczytajGeoJSON(parsed);
      setObjects(normalized);
      setSelected(null);
      setFileStatus('Lokalnie: ' + file.name + ', obiektów: ' + normalized.features.length + '. Brak połączeń ENM.');
      setError(null);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Niepoprawny GeoJSON');
    }
  }

  async function wczytajXml(file: File | undefined) {
    if (!file) return;
    if (file.size > 250_000) { setError('GetCapabilities przekracza limit 250 kB'); return; }
    const text = await file.text();
    setLayerXml(text);
    try {
      const layers = odczytajWarstwyWms(text);
      setWmsLayers(layers);
      setLayerName(layers[0]?.name ?? '');
      setError(null);
    } catch (exc) {
      setWmsLayers([]); setLayerName('');
      setError(exc instanceof Error ? exc.message : 'Niepoprawny dokument WMS');
    }
  }

  function wlaczWms() {
    if (!layerXml || !layerName) { setError('Brak zweryfikowanej nazwy warstwy w GetCapabilities.'); return; }
    try {
      const plan = przygotujRasterWms({
        idZrodla: sourceId, nazwaWarstwy: layerName, wersja: '1.3.0',
        przezroczystosc: 0.65, zgodaNaWyslanieZasiegu: allowNetwork,
        potwierdzenieWarunkowUzycia: acceptTerms,
        zweryfikowanaNazwaWarstwy: wmsLayers.some((l) => l.name === layerName),
      });
      setRaster(plan);
      setError(null);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : 'Nie można włączyć WMS');
    }
  }

  return (
    <div className="mvd-gis-r11" data-testid="mvd-gis-r11">
      <aside className="mvd-gis-r11-panel">
        <h2>Mapa sieci SN</h2>
        <button type="button" onClick={() => { void pokazBiezacySld(); }} disabled={!onShowSld || !aktywnyPrzypadekId} data-testid="gis-otworz-sld">Odśwież ENM i pokaż schemat SLD</button>
        <p className="mvd-gis-r11-notice">Projektowa projekcja przestrzenna — bez zatwierdzania ENM.</p>
        <button type="button" onClick={() => {
          setObjects(przykładowaSiecSN()); setSelected(null);
          setFileStatus('PRÓBKA SYNTETYCZNA — brak rzeczywistych urządzeń.');
        }}>Załaduj sieć demonstracyjną</button>
        <label>GeoJSON WGS 84 — lokalny plik
          <input aria-label="Import GeoJSON" type="file" accept=".geojson,.json" onChange={(e) => { void importujGeoJSON(e.target.files?.[0]); }} />
        </label>
        <p className="mvd-gis-r11-info">{fileStatus}</p>
        <h3>Obiekty</h3>
        <div className="mvd-gis-r11-items">
          {objects.features.map((f) => (
            <button type="button" key={f.id} className={selected === f.id ? 'selected' : ''}
              onClick={() => wybierzNaMapie(f.id)}>{f.properties.name}</button>
          ))}
        </div>
        <h3>Warstwa z geoportalu WMS</h3>
        <label>Usługa
          <select value={sourceId} onChange={(e) => {
            setRaster(null); setLayerXml(''); setWmsLayers([]);
            setLayerName(''); setAllowNetwork(false); setAcceptTerms(false); setSourceId(e.target.value);
          }}>
            {ZRODLA_PODKLADOW.map((s) => <option key={s.id} value={s.id}>{s.etykieta}</option>)}
          </select>
        </label>
        <label>Dokument GetCapabilities z wybranej usługi (XML)
          <input aria-label="Dokument GetCapabilities" type="file" accept=".xml" onChange={(e) => { void wczytajXml(e.target.files?.[0]); }} />
        </label>
        <label>Warstwa
          <select value={layerName} onChange={(e) => setLayerName(e.target.value)}>
            {wmsLayers.map((s) => <option key={s.name} value={s.name}>{s.title}</option>)}
          </select>
        </label>
        <label className="mvd-gis-r11-check">
          <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
          Potwierdzam sprawdzenie warunków wykorzystania tej usługi.
        </label>
        <label className="mvd-gis-r11-check">
          <input type="checkbox" checked={allowNetwork} onChange={(e) => setAllowNetwork(e.target.checked)} />
          Zezwalam na połączenie z usługą i przekazanie zakresu mapy (BBOX).
        </label>
        <div className="mvd-gis-r11-actions">
          <button type="button" onClick={wlaczWms} disabled={!ready || !layerName || !acceptTerms || !allowNetwork}>Włącz warstwę WMS</button>
          <button type="button" onClick={() => { setRaster(null); setAllowNetwork(false); }}>Wyłącz WMS</button>
        </div>
        <p className="mvd-gis-r11-info">WMS to obraz. Analiza kolizji wymaga danych wektorowych i weryfikacji geodezyjnej.</p>
      </aside>
      <section className="mvd-gis-r11-map-area">
        <div className="mvd-gis-r11-toolbar">
          <span>{ready ? 'MapLibre WebGL — gotowy' : 'Inicjalizacja MapLibre…'}</span>
          <span>{raster ? 'WMS włączony — wysyłanie zapytań do dostawcy' : 'Tryb bez podkładu sieciowego — offline'}</span>
        </div>
        <div className="mvd-gis-r11-map" ref={container} aria-label="Mapa projektu sieci SN" />
        <div className="mvd-gis-r11-detail">
          {element ? <><strong>{element.properties.name}</strong><span>{element.id} · {element.properties.kind}</span></> : 'Wskaż element na mapie lub na liście.'}
          <span>Powiązanie ENM: {matches.length ? `ID odnaleziony (${matches.map((m) => m.kolekcja).join(', ')}) — do weryfikacji` : 'brak potwierdzonego powiązania'} · Rewizja: {rewizjaEnm ?? 'nieustalona'} · Topologia: niepotwierdzona</span>
        </div>
        {error && <div role="alert" className="mvd-gis-r11-error">{error}</div>}
      </section>
    </div>
  );
}
