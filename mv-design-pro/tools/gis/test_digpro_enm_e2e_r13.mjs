import test from 'node:test';
import assert from 'node:assert/strict';
import { zweryfikujPakiet, weryfikujSnapshot, wykonajE2E, klientApi, OdmowaR13, stagedDigest }
  from './digpro_enm_e2e_r13.mjs';
const A='a'.repeat(64), B='b'.repeat(64), C='c'.repeat(64);
const ID='12345678-1234-1234-1234-123456789abc';
function fixture(){
  const geojson={type:'FeatureCollection',features:[
    {type:'Feature',id:'SYN-1',geometry:{type:'Point',coordinates:[16.9,52.4]},
      properties:{id:'SYN-1',name:'Stacja',kind:'station'}}]};
  const manifest={schema:'MV-GIS-GPKG-PREVIEW-R12',source_sha256:A,source_epsg:2180,
    output_epsg:4326,source_layer:'network',source_count:1,accepted_count:1,
    skipped_count:0,can_write_to_enm:false};
  const plan={schema:'MV-DIGPRO-ENM-R13',project_id:ID,case_id:ID,base_enm_hash:B,
    source:{system:'DIGPRO',format:'GPKG',sha256:A,staged_geojson_sha256:stagedDigest(geojson),
      layer:'network',partial_export:false,geometry_clipped:false},
    approval:{authorized:true,sanitized:true,connections_reviewed:true,engineer_ref:'SYN-ENGINEER'},
    operations:[{step_id:'SYN-OP-1',source_id:'SYN-1',
      operation:{name:'add_grid_source_sn',idempotency_key:'SYN-R13-KEY-01',
        payload:{source_id:'SYN-SRC-1',voltage_kv:15,catalog_ref:'SYN-CATALOG'}},
      confirmed_terminals:true,confirmed_electrical_length:true,confirmed_catalog:true,
      expected_refs:['SYN-SRC-1']}]
  };
  return {geojson,manifest,plan};
}
function fails(code,change){
  const z=fixture();change(z);
  assert.throws(()=>zweryfikujPakiet(z.plan,z.geojson,z.manifest),
    e=>e instanceof OdmowaR13&&e.code===code);
}
test('jawny pakiet tylko waliduje, nigdy nie zapisuje ENM',()=>{
  const {geojson,manifest,plan}=fixture();const x=zweryfikujPakiet(plan,geojson,manifest);
  assert.equal(x.status,'PLAN_VALIDATED_NOT_APPLIED');assert.equal(x.enm_write,false);
});
test('brak zgody operatora → odmowa',()=>fails('APPROVAL_REQUIRED',z=>z.plan.approval.authorized=false));
test('brak potwierdzonych terminali → odmowa',()=>fails('DOMAIN_EVIDENCE_MISSING',
  z=>z.plan.operations[0].confirmed_terminals=false));
test('brak katalogu → odmowa',()=>fails('DOMAIN_EVIDENCE_MISSING',
  z=>z.plan.operations[0].confirmed_catalog=false));
test('brak dowodu długości elektrycznej → odmowa',()=>fails('DOMAIN_EVIDENCE_MISSING',
  z=>z.plan.operations[0].confirmed_electrical_length=false));
test('ucięta geometria → odmowa',()=>fails('SOURCE_SCOPE_UNVERIFIED',z=>z.plan.source.geometry_clipped=true));
test('niepełny eksport GPKG → odmowa',()=>fails('SOURCE_INCOMPLETE',
  z=>{z.manifest.skipped_count=1;z.manifest.source_count=2}));
test('zły odcisk eksportu DIGPRO → odmowa',()=>fails('SOURCE_DIGEST',
  z=>z.plan.source.sha256='e'.repeat(64)));
test('podmiana geometrii po akceptacji → odmowa',()=>fails('STAGING_TAMPERED',
  z=>z.geojson.features[0].geometry.coordinates[0]=17.8));
test('brak źródłowego ID → odmowa',()=>fails('SOURCE_OBJECT_NOT_FOUND',
  z=>z.plan.operations[0].source_id='SYN-UNKNOWN'));
test('dwa identyczne ID → odmowa',()=>fails('GEOJSON_SOURCE_ID',
  z=>{z.geojson.features.push({...z.geojson.features[0]});
    z.plan.source.staged_geojson_sha256=stagedDigest(z.geojson);
    z.manifest.source_count=2;z.manifest.accepted_count=2}));
test('operacja poza rejestrem domenowym → odmowa',()=>fails('ENM_OPERATION_UNKNOWN',
  z=>z.plan.operations[0].operation.name='publish_enm_direct'));
test('nieznany PPE w payload → odmowa',()=>fails('SENSITIVE_PAYLOAD',
  z=>z.plan.operations[0].operation.payload.ppe='SYN-PPE'));
test('obce atrybuty GIS nie są publikowane',()=>fails('GEOJSON_UNTRUSTED_ATTRIBUTE',
  z=>{z.geojson.features[0].properties.customer='private';
    z.plan.source.staged_geojson_sha256=stagedDigest(z.geojson)}));
test('odrzuca obcy układ EPSG',()=>fails('SOURCE_CRS',z=>z.manifest.source_epsg=4326));
test('odmowa zdalnego serwera',()=>{
  assert.throws(()=>klientApi('https://operator.invalid'),e=>e.code==='BACKEND_MUST_BE_LOCAL');
  assert.equal(typeof klientApi('http://127.0.0.1:8000'),'function');
});
test('przeczytana ENM musi mieć nową rewizję, hash i identyfikatory',()=>{
  const enm={header:{revision:5,hash_sha256:C},sources:[{ref_id:'SYN-SRC-1'}]};
  assert.deepEqual(weryfikujSnapshot(enm,{snapshot:enm},{revision:4,hash:B},['SYN-SRC-1']),
    {revision:5,hash:C});
  assert.throws(()=>weryfikujSnapshot(enm,{snapshot:enm},{revision:5,hash:B},[]),
    e=>e.code==='ENM_REVISION_NOT_ADVANCED');
  assert.throws(()=>weryfikujSnapshot(enm,{snapshot:enm},{revision:4,hash:B},['SYN-OTHER']),
    e=>e.code==='ENM_EXPECTED_REF_MISSING');
});
function fakeApi({badRunHash=false,opFailure=false,missingResult=false}={}){
  const calls=[];
  const base={header:{revision:4,hash_sha256:B},sources:[]};
  const latest={header:{revision:5,hash_sha256:C},sources:[{ref_id:'SYN-SRC-1'}]};
  let writes=0;
  const api=async(method,route,body)=>{
    calls.push({method,route,body});
    if(route.endsWith('/enm')&&method==='GET')return writes?latest:base;
    if(route.endsWith('/domain-ops')){
      if(opFailure)return{error_code:'CATALOG_INVALID'};
      writes++;return{snapshot:latest};
    }
    if(route.includes('/study-cases/')&&method==='POST')return{id:ID,model_revision:5};
    if(route.endsWith('/execute'))return{status:'QUEUED'};
    if(route.endsWith('/snapshot'))return{snapshot:badRunHash?base:latest};
    if(route.endsWith('/results'))return missingResult?{}:
      {run_id:ID,deterministic_signature:'SIGNATURE-1',
        element_results:[{element_ref:'SYN-SRC-1'}]};
    if(route.includes('/execution/runs/')&&method==='GET')return{status:'FINISHED',model_revision:5};
    throw new Error('Unexpected request: '+route);
  };
  return {api,calls};
}
test('pełny łańcuch kanonicznych API ENM → LF → SC i uczciwy status SLD',async()=>{
  const x=fixture(),fake=fakeApi();
  const r=await wykonajE2E(x.plan,fake.api,{
    publish:true,confirm:'ZATWIERDZAM_ZAPIS_ENM',intervalMs:0,pollCount:1});
  assert.equal(r.status,'COMPUTATION_COMPLETE_SLD_REVIEW_REQUIRED');
  assert.equal(r.changes_applied,1);assert.equal(r.final_model.hash,C);
  assert.deepEqual(r.runs.map(v=>v.analysis_type),['LOAD_FLOW','SC_3F']);
  assert.equal(r.sld.verification,'NOT_RENDERED');
  assert.equal(fake.calls.filter(x=>x.route.endsWith('/execute')).length,2);
  assert.equal(fake.calls.find(x=>x.route.endsWith('/domain-ops')).body.snapshot_base_hash,B);
  assert.equal(fake.calls.length,13);
});
test('bez jawnego zatwierdzenia API nie zostaje wywołane',async()=>{
  const x=fixture(),fake=fakeApi();
  await assert.rejects(()=>wykonajE2E(x.plan,fake.api,{publish:true,confirm:'NO'}),
    e=>e.code==='PUBLISH_NOT_CONFIRMED');
  assert.equal(fake.calls.length,0);
});
test('stary hash blokuje każdą zmianę',async()=>{
  const x=fixture(),fake=fakeApi();x.plan.base_enm_hash='f'.repeat(64);
  await assert.rejects(()=>wykonajE2E(x.plan,fake.api,{
    publish:true,confirm:'ZATWIERDZAM_ZAPIS_ENM'}),e=>e.code==='BASE_REVISION_CONFLICT');
  assert.equal(fake.calls.filter(x=>x.method==='POST').length,0);
});
test('nieudana komenda ENM zatrzymuje LF i SC',async()=>{
  const x=fixture(),fake=fakeApi({opFailure:true});
  const r=await wykonajE2E(x.plan,fake.api,{
    publish:true,confirm:'ZATWIERDZAM_ZAPIS_ENM'});
  assert.equal(r.status,'FAILED_POSSIBLE_PARTIAL_ENM_CHANGE');
  assert.equal(r.failure_code,'DOMAIN_OPERATION_REJECTED');
  assert.equal(fake.calls.filter(x=>x.route.includes('/runs')).length,0);
});
test('wyniki o innej rewizji ENM nie przechodzą',async()=>{
  const x=fixture(),fake=fakeApi({badRunHash:true});
  const r=await wykonajE2E(x.plan,fake.api,{
    publish:true,confirm:'ZATWIERDZAM_ZAPIS_ENM',pollCount:1});
  assert.equal(r.status,'FAILED_POSSIBLE_PARTIAL_ENM_CHANGE');
  assert.equal(r.failure_code,'RUN_SNAPSHOT_NOT_SAME_ENM');
});
test('brak podpisu wyniku jest jawną odmową',async()=>{
  const x=fixture(),fake=fakeApi({missingResult:true});
  const r=await wykonajE2E(x.plan,fake.api,{
    publish:true,confirm:'ZATWIERDZAM_ZAPIS_ENM',pollCount:1});
  assert.equal(r.failure_code,'RESULT_SET_INVALID');
});
test('natywne DIGPRO SHP ma własny manifest, nie jest GPKG',()=>{
  const z=fixture();
  z.plan.source.format='SHP';
  z.manifest.schema='MV-DIGPRO-SHP-PREVIEW-R13';
  assert.equal(zweryfikujPakiet(z.plan,z.geojson,z.manifest).status,'PLAN_VALIDATED_NOT_APPLIED');
  z.plan.source.format='GPKG';
  assert.throws(()=>zweryfikujPakiet(z.plan,z.geojson,z.manifest),
    e=>e.code==='SOURCE_FORMAT');
});
