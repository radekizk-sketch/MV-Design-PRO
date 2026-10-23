/** MV-DESIGN PRO · GIS / DIGPRO · tylko projekcja geometryczna, zero mutacji ENM.
 * Nie stwierdza zgodności topologicznej ani długości elektrycznej.
 */
export type PunktWgs84 = readonly [number,number];
export interface LiniaGeoJSON { type:'LineString'; coordinates:PunktWgs84[] }
export interface MigawkaGIS {
  readonly sourceImportDigest:string;
  readonly synthetic:true;
  readonly topologyVerified:false;
  readonly sourceLines:Readonly<Record<string,LiniaGeoJSON>>;
}
export interface WynikPrzegladuGeometrii {
  readonly status:'DO_WERYFIKACJI_INZYNIERSKIEJ';
  readonly sourceImportDigest:string;
  readonly ids:readonly string[];
  readonly lengthPreviewM:Readonly<Record<string,number>>;
  readonly electricLengthM:null;
  readonly topologyVerified:false;
  readonly canWriteToEnm:false;
}
const NAGLOWEK=['schema','synthetic','read_only_export','enm_write_allowed','electrical_topology_verified','source_import_digest','changes'] as const;
const POLA_ZMIANY=['change_type','id','source_id','geometry_before','geometry_after','approximate_length_m','requires_topology_review','requires_engineering_length_review'] as const;
const WERSJA='MV-DIGPRO-GIS-GEOMETRY-PROPOSALS-V1';
export class BladPropozycjiGIS extends Error {
  constructor(public readonly code:string){super(code);this.name='BladPropozycjiGIS';}
}
function odmowa(gdy:boolean,code:string):void {if(gdy)throw new BladPropozycjiGIS(code);}
function obiekt(value:unknown):value is Record<string,unknown> {
  return typeof value==='object' && value!==null && !Array.isArray(value);
}
function polaDokladne(value:unknown,names:readonly string[]):value is Record<string,unknown> {
  return obiekt(value) && Object.keys(value).sort().join('|')===[...names].sort().join('|');
}
function punkt(raw:unknown):raw is PunktWgs84 {
  return Array.isArray(raw) && raw.length===2 && raw.every(v=>typeof v==='number' && Number.isFinite(v)) &&
    raw[0]>=-180 && raw[0]<=180 && raw[1]>=-85 && raw[1]<=85;
}
function linia(raw:unknown):raw is LiniaGeoJSON {
  return obiekt(raw) && Object.keys(raw).sort().join('|')==='coordinates|type' &&
    raw.type==='LineString' && Array.isArray(raw.coordinates) &&
    raw.coordinates.length>=2 && raw.coordinates.length<=20000 && raw.coordinates.every(punkt) &&
    raw.coordinates.some((p,i,a)=>i>0&&(p[0]!==a[0][0]||p[1]!==a[0][1]));
}
/** Podgląd GIS na kuli; NIE służy do ustalania parametrów elektrycznych linii. */
export function dlugoscPodgladowaM(line:LiniaGeoJSON):number {
  let total=0;
  for(let i=1;i<line.coordinates.length;i++){
    const [lon1,lat1]=line.coordinates[i-1], [lon2,lat2]=line.coordinates[i];
    const p=Math.PI/180;
    const a=Math.sin((lat2-lat1)*p/2)**2+
      Math.cos(lat1*p)*Math.cos(lat2*p)*Math.sin((lon2-lon1)*p/2)**2;
    total+=2*6371008.8*Math.asin(Math.min(1,Math.sqrt(a)));
  }
  return total;
}
/** Wyłącznie walidacja propozycji; brak importów z backendu i brak operacji ENM. */
export function sprawdzPropozycjeGIS(raw:unknown,source:MigawkaGIS):WynikPrzegladuGeometrii {
  odmowa(!polaDokladne(raw,NAGLOWEK),'INVALID_ENVELOPE');
  const doc=raw as Record<string,unknown>;
  odmowa(doc.schema!==WERSJA,'WRONG_SCHEMA');
  odmowa(doc.synthetic!==true||source.synthetic!==true,'SYNTHETIC_ONLY');
  odmowa(doc.read_only_export!==true||doc.enm_write_allowed!==false||
    doc.electrical_topology_verified!==false||source.topologyVerified!==false,'ENM_FORBIDDEN');
  odmowa(doc.source_import_digest!==source.sourceImportDigest,'SOURCE_DIGEST_MISMATCH');
  odmowa(!Array.isArray(doc.changes)||doc.changes.length===0||doc.changes.length>5000,'INVALID_CHANGE_COUNT');
  const changes=doc.changes as unknown[],ids=new Set<string>(), lengths:Record<string,number>={};
  for(const candidate of changes){
    odmowa(!polaDokladne(candidate,POLA_ZMIANY),'INVALID_CHANGE_FIELDS');
    const ch=candidate as Record<string,unknown>,id=ch.id;
    odmowa(typeof id!=='string'||id.length>256||ids.has(id),'INVALID_OR_DUPLICATE_ID');
    const key=id as string;
    odmowa(ch.requires_topology_review!==true||ch.requires_engineering_length_review!==true,'REVIEW_MISSING');
    odmowa(!linia(ch.geometry_after),'INVALID_LINE_GEOMETRY');
    const geom=ch.geometry_after as LiniaGeoJSON,preview=dlugoscPodgladowaM(geom);
    odmowa(!Number.isFinite(preview)||preview<=0,'ZERO_LENGTH');
    odmowa(typeof ch.approximate_length_m!=='number'||!Number.isFinite(ch.approximate_length_m)||
      Math.abs(ch.approximate_length_m-preview)/preview>0.02,'LENGTH_PREVIEW_INCONSISTENT');
    if(ch.change_type==='EXISTING_ROUTE_GEOMETRY_REVIEW'){
      const original=source.sourceLines[key];
      odmowa(!original||ch.source_id!==key||
        JSON.stringify(ch.geometry_before)!==JSON.stringify(original),'BASELINE_MISMATCH');
      odmowa(JSON.stringify(geom)===JSON.stringify(original),'NO_CHANGE');
    }else if(ch.change_type==='NEW_ROUTE_GEOMETRY_REVIEW'){
      odmowa(!/^LAB-DRAFT-[0-9]{4}$/.test(key)||key in source.sourceLines||
        ch.source_id!==null||ch.geometry_before!==null,'NEW_ROUTE_INVALID');
    }else{throw new BladPropozycjiGIS('CHANGE_TYPE_FORBIDDEN');}
    ids.add(key);lengths[key]=preview;
  }
  return {status:'DO_WERYFIKACJI_INZYNIERSKIEJ',sourceImportDigest:source.sourceImportDigest,
    ids:[...ids].sort(),lengthPreviewM:lengths,electricLengthM:null,
    topologyVerified:false,canWriteToEnm:false};
}
