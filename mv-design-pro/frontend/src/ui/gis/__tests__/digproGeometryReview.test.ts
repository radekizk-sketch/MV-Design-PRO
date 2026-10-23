import {describe,it,expect} from 'vitest';
import {sprawdzPropozycjeGIS,dlugoscPodgladowaM,BladPropozycjiGIS,type LiniaGeoJSON} from '../digproGeometryReview';
const line:LiniaGeoJSON={type:'LineString',coordinates:[[19,53.265],[19.001,53.266]]};
const edited:LiniaGeoJSON={type:'LineString',coordinates:[[19,53.265],[19.002,53.266]]};
const source={sourceImportDigest:'a'.repeat(64),synthetic:true as const,topologyVerified:false as const,sourceLines:{'EXISTING-1':line}};
const base=()=>({schema:'MV-DIGPRO-GIS-GEOMETRY-PROPOSALS-V1',synthetic:true,read_only_export:true,
  enm_write_allowed:false,electrical_topology_verified:false,source_import_digest:source.sourceImportDigest,
  changes:[{change_type:'NEW_ROUTE_GEOMETRY_REVIEW',id:'LAB-DRAFT-0001',source_id:null as null|string,
    geometry_before:null as null|LiniaGeoJSON,geometry_after:line as LiniaGeoJSON,
    approximate_length_m:dlugoscPodgladowaM(line),requires_topology_review:true,
    requires_engineering_length_review:true}]});
function reject(change:(p:ReturnType<typeof base>)=>void){
  const p=base();change(p);expect(()=>sprawdzPropozycjeGIS(p,source)).toThrow(BladPropozycjiGIS);
}
describe('GIS/DIGPRO: geometria nie jest topologią elektryczną',()=>{
  it('przyjmuje szkic wyłącznie do przeglądu',()=>{
    const r=sprawdzPropozycjeGIS(base(),source);
    expect(r.canWriteToEnm).toBe(false);expect(r.electricLengthM).toBeNull();
  });
  it('odrzuca dodatkową komendę ENM',()=>reject(p=>Object.assign(p,{enm_commands:[{type:'delete_branch'}]})));
  it('odrzuca potwierdzenie topologii',()=>reject(p=>{p.electrical_topology_verified=true;}));
  it('odrzuca niezgodny odcisk źródła',()=>reject(p=>{p.source_import_digest='0'.repeat(64);}));
  it('odrzuca pustą listę zmian',()=>reject(p=>{p.changes=[];}));
  it('odrzuca brak potwierdzenia przeglądu',()=>reject(p=>{p.changes[0].requires_topology_review=false;}));
  it('odrzuca fałszywą długość',()=>reject(p=>{p.changes[0].approximate_length_m=1;}));
  it('odrzuca geometrię jednopunktową',()=>reject(p=>{p.changes[0].geometry_after={type:'LineString',coordinates:[[19,53.265]]};}));
  it('odrzuca powielony identyfikator',()=>reject(p=>{p.changes.push({...p.changes[0]});}));
  it('odrzuca próbę usunięcia połączenia',()=>reject(p=>{p.changes[0].change_type='DELETE_BRANCH';}));
  it('kontroluje stan przed edycją istniejącej linii',()=>{
    const p=base();Object.assign(p.changes[0],{change_type:'EXISTING_ROUTE_GEOMETRY_REVIEW',id:'EXISTING-1',
      source_id:'EXISTING-1',geometry_before:line,geometry_after:edited,approximate_length_m:dlugoscPodgladowaM(edited)});
    expect(sprawdzPropozycjeGIS(p,source).ids).toEqual(['EXISTING-1']);
    p.changes[0].geometry_before=edited;
    expect(()=>sprawdzPropozycjeGIS(p,source)).toThrow(BladPropozycjiGIS);
  });
});
