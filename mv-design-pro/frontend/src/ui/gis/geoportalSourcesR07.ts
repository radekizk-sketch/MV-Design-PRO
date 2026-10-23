/**
 * MV-DESIGN PRO GIS R07 — państwowe i samorządowe źródła WMS.
 * Odczyt obrazów mapowych, NIGDY połączeń elektrycznych ENM.
 * Brak automatycznych połączeń do zewnętrznych serwisów i kafelków.
 * Każdy identyfikator LAYERS należy najpierw potwierdzić przez GetCapabilities.
 */
export type ZrodloPodkladu = Readonly<{
  id: string; etykieta: string; instytucja: string; endpoint: string;
  charakter: 'ORTOFOTO' | 'DZIALKI' | 'UZBROJENIE' | 'MPZP' | 'SRODOWISKO';
  wektoroweDaneZrodlowe: false;
  dowodPolaczeniaElektrycznego: false;
}>;
export const ZRODLA_PODKLADOW: readonly ZrodloPodkladu[] = [
  {id:'orto',etykieta:'Ortofotomapa GUGiK',instytucja:'GUGiK',endpoint:'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution',charakter:'ORTOFOTO',wektoroweDaneZrodlowe:false,dowodPolaczeniaElektrycznego:false},
  {id:'kieg',etykieta:'Działki i budynki — KIEG',instytucja:'GUGiK / powiaty',endpoint:'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow',charakter:'DZIALKI',wektoroweDaneZrodlowe:false,dowodPolaczeniaElektrycznego:false},
  {id:'kiut',etykieta:'Sieci uzbrojenia terenu — KIUT',instytucja:'GUGiK / powiaty',endpoint:'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',charakter:'UZBROJENIE',wektoroweDaneZrodlowe:false,dowodPolaczeniaElektrycznego:false},
  {id:'tarnowo-mpzp',etykieta:'MPZP — gmina Tarnowo Podgórne',instytucja:'Gmina Tarnowo Podgórne',endpoint:'https://mpzp.igeomap.pl/cgi-bin/302117',charakter:'MPZP',wektoroweDaneZrodlowe:false,dowodPolaczeniaElektrycznego:false},
  {id:'tarnowo-pog',etykieta:'Plan ogólny — Tarnowo Podgórne',instytucja:'Gmina Tarnowo Podgórne',endpoint:'https://wms.e-mapa.net/cgi-bin/pog/302117',charakter:'MPZP',wektoroweDaneZrodlowe:false,dowodPolaczeniaElektrycznego:false},
  {id:'gdos',etykieta:'Obszary ochrony przyrody — GDOŚ',instytucja:'GDOŚ',endpoint:'https://sdi.gdos.gov.pl/wms',charakter:'SRODOWISKO',wektoroweDaneZrodlowe:false,dowodPolaczeniaElektrycznego:false},
];
export class OdmowaPodkladu extends Error {
  constructor(public readonly kod: string) { super(kod); }
}
export type WarstwaWms = {
  idZrodla: string; nazwaWarstwy: string; wersja: '1.1.1' | '1.3.0';
  przezroczystosc: number;
  zgodaNaWyslanieZasiegu: boolean; potwierdzenieWarunkowUzycia: boolean;
  zweryfikowanaNazwaWarstwy: boolean;
};
export type PlanRastra = {
  id: string; tiles: readonly string[]; przypisanie: string;
  przezroczystosc: number; tylkoPodklad: true; zapisEnmDozwolony: false;
};
/** WMS zawiera obraz, a nie topologię; wytwarza jedynie konfigurację rastra dla MapLibre. */
export function przygotujRasterWms(w: WarstwaWms): PlanRastra {
  const z = ZRODLA_PODKLADOW.find(v => v.id === w.idZrodla);
  if (!z) throw new OdmowaPodkladu('NIEZNANE_ZRODLO');
  if (!w.zgodaNaWyslanieZasiegu) throw new OdmowaPodkladu('BRAK_ZGODY_NA_ZEWNETRZNE_ZAPYTANIE');
  if (!w.potwierdzenieWarunkowUzycia) throw new OdmowaPodkladu('NIEZWERYFIKOWANE_WARUNKI_DANYCH');
  if (!w.zweryfikowanaNazwaWarstwy || !/^[A-Za-z0-9_.:,-]{1,160}$/.test(w.nazwaWarstwy)) {
    throw new OdmowaPodkladu('BRAK_POTWIERDZONEJ_NAZWY_WARSTWY');
  }
  if (!['1.1.1','1.3.0'].includes(w.wersja)) throw new OdmowaPodkladu('WERSJA_WMS_NIEDOZWOLONA');
  if (!Number.isFinite(w.przezroczystosc) || w.przezroczystosc < 0 || w.przezroczystosc > 1) {
    throw new OdmowaPodkladu('ZLA_PRZEZROCZYSTOSC');
  }
  const axis = w.wersja === '1.3.0' ? '&CRS=EPSG%3A3857' : '&SRS=EPSG%3A3857';
  const tiles = z.endpoint+'?SERVICE=WMS&REQUEST=GetMap&VERSION='+w.wersja
    +'&LAYERS='+encodeURIComponent(w.nazwaWarstwy)
    +'&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=TRUE'
    +axis+'&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256';
  return {id:'gis-podklad-'+z.id,tiles:[tiles],przypisanie:z.instytucja,
    przezroczystosc:w.przezroczystosc,tylkoPodklad:true,zapisEnmDozwolony:false};
}
export function opisWms(idZrodla: string): string {
  const z=ZRODLA_PODKLADOW.find(v=>v.id===idZrodla);
  if (!z) throw new OdmowaPodkladu('NIEZNANE_ZRODLO');
  return z.endpoint+'?SERVICE=WMS&REQUEST=GetCapabilities';
}
/** MapLibre narrow presentation contract — no model writes. */
export interface RasterMapLibre {
  getSource(id: string): unknown;
  addSource(id: string, args: {type:'raster';tiles:readonly string[];tileSize:256;attribution:string}):void;
  getLayer(id:string):unknown;
  addLayer(args:{id:string;type:'raster';source:string;paint:{'raster-opacity':number}},beforeId?:string):void;
  setLayoutProperty(id:string,key:'visibility',value:'visible'|'none'):void;
}
export function ustawPodklad(
  map:RasterMapLibre,plan:PlanRastra,wlaczony:boolean,przedWarstwaSieci?:string
):void {
  if(!map.getSource(plan.id)){
    map.addSource(plan.id,{type:'raster',tiles:plan.tiles,tileSize:256,attribution:plan.przypisanie});
  }
  if(!map.getLayer(plan.id)){
    map.addLayer({id:plan.id,type:'raster',source:plan.id,
      paint:{'raster-opacity':plan.przezroczystosc}},przedWarstwaSieci);
  }
  map.setLayoutProperty(plan.id,'visibility',wlaczony?'visible':'none');
}
