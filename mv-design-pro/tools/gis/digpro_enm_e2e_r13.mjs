#!/usr/bin/env node
/** R13: zatwierdzony import DIGPRO → operacje ENM → LF/SC → dowód wersji SLD.
 * Wymaga jawnego mapowania operatora. Domyślnie OFFLINE / TYLKO KONTROLA.
 * Ani topologia, ani kabel, ani długość nie powstają z przecięcia geometrii.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export class OdmowaR13 extends Error {
  constructor(code, message=code) { super(message); this.name='OdmowaR13'; this.code=code; }
}
const OPS = new Set([
  'add_grid_source_sn','add_gpz_section','add_sn_bay',
  'continue_trunk_segment_sn','insert_station_on_segment_sn','start_branch_segment_sn',
  'insert_section_switch_sn','connect_secondary_ring_sn','set_normal_open_point',
  'add_transformer_sn_nn','add_nn_outgoing_field','add_nn_load',
  'assign_catalog_to_element','update_element_parameters','rename_element',
]);
export const stagedDigest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const demand=(ok,code)=>{if(!ok)throw new OdmowaR13(code);};
const ref=v=>typeof v==='string'&&/^[\w:./-]{1,160}$/.test(v);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);

/** Jedynym nośnikiem topologii jest zatwierdzona operacja ENM, nie WMS i nie GIS. */
export function zweryfikujPakiet(plan,geojson,manifest) {
  demand(obj(plan)&&plan.schema==='MV-DIGPRO-ENM-R13','PLAN_SCHEMA');
  demand(obj(manifest)&&manifest.schema==='MV-GIS-GPKG-PREVIEW-R12','MANIFEST_SCHEMA');
  demand(obj(plan.source)&&plan.source.system==='DIGPRO','SOURCE_SYSTEM');
  demand(plan.source.format==='GPKG','SOURCE_FORMAT');
  demand(hex(plan.source.sha256)&&plan.source.sha256===manifest.source_sha256,'SOURCE_DIGEST');
  demand(plan.source.layer===manifest.source_layer,'SOURCE_LAYER');
  demand([2180,2176,2177,2178,2179].includes(manifest.source_epsg),'SOURCE_CRS');
  demand(manifest.output_epsg===4326&&manifest.can_write_to_enm===false,'STAGING_NOT_ISOLATED');
  demand(manifest.accepted_count===geojson?.features?.length,'STAGING_COUNT');
  demand(hex(plan.source.staged_geojson_sha256)&&plan.source.staged_geojson_sha256===stagedDigest(geojson),'STAGING_TAMPERED');
  demand(manifest.skipped_count===0&&manifest.source_count===manifest.accepted_count,'SOURCE_INCOMPLETE');
  demand(plan.source.partial_export===false&&plan.source.geometry_clipped===false,'SOURCE_SCOPE_UNVERIFIED');
  demand(plan.approval?.authorized===true&&plan.approval?.sanitized===true&&plan.approval?.connections_reviewed===true,
    'APPROVAL_REQUIRED');
  demand(typeof plan.approval.engineer_ref==='string'&&plan.approval.engineer_ref.length>=3,'ENGINEER_MISSING');
  demand(obj(geojson)&&geojson.type==='FeatureCollection'&&!('crs' in geojson),'GEOJSON_INVALID');
  demand(Array.isArray(geojson.features)&&geojson.features.length<=50000,'GEOJSON_LIMIT');
  demand(Array.isArray(plan.operations)&&plan.operations.length>0&&plan.operations.length<=500,'OPERATIONS_REQUIRED');
  const sourceIds=new Set();
  for(const feature of geojson.features) {
    demand(obj(feature)&&feature.type==='Feature'&&ref(feature.id)&&!sourceIds.has(feature.id),'GEOJSON_SOURCE_ID');
    demand(['Point','LineString'].includes(feature.geometry?.type),'GEOJSON_GEOMETRY');
    const p=feature.properties;
    demand(obj(p)&&p.id===feature.id,'GEOJSON_ID_MISMATCH');
    demand(Object.keys(p).every(k=>['id','name','kind','topologyVerified'].includes(k)),
      'GEOJSON_UNTRUSTED_ATTRIBUTE');
    sourceIds.add(feature.id);
  }
  const keys=new Set();
  for(const step of plan.operations) {
    demand(obj(step)&&ref(step.step_id)&&!keys.has(step.step_id),'STEP_ID');
    keys.add(step.step_id);
    demand(ref(step.source_id)&&sourceIds.has(step.source_id),'SOURCE_OBJECT_NOT_FOUND');
    demand(obj(step.operation)&&OPS.has(step.operation.name),'ENM_OPERATION_UNKNOWN');
    demand(obj(step.operation.payload)&&Object.keys(step.operation.payload).length>0,'ENM_PAYLOAD_MISSING');
    demand(step.confirmed_terminals===true&&step.confirmed_electrical_length===true&&
      step.confirmed_catalog===true,'DOMAIN_EVIDENCE_MISSING');
    demand(typeof step.operation.idempotency_key==='string'&&/^[\w-]{8,120}$/.test(step.operation.idempotency_key),
      'IDEMPOTENCY_KEY_MISSING');
    demand(Array.isArray(step.expected_refs)&&step.expected_refs.length>0&&step.expected_refs.every(ref),
      'EXPECTED_REFS_MISSING');
    demand(!Object.keys(step.operation.payload).some(k=>/^(ppe|pesel|name_customer|phone|email)$/i.test(k)),
      'SENSITIVE_PAYLOAD');
  }
  demand(uuid(plan.project_id)&&uuid(plan.case_id),'CASE_OR_PROJECT_ID');
  return {schema:'MV-DIGPRO-ENM-VALIDATION-R13',status:'PLAN_VALIDATED_NOT_APPLIED',
    source_sha256:plan.source.sha256,source_count:manifest.source_count,
    operations:plan.operations.length,planned_analyses:['LOAD_FLOW','SC_3F'],
    topology_status:'ENGINEER_DECLARED_NOT_INDEPENDENTLY_VERIFIED',
    authorization_status:'ENGINEER_DECLARED_NOT_EXTERNALLY_VERIFIED',enm_write:false};
}
function refsInEnm(enm) {
  const refs=new Set();
  for(const value of Object.values(enm)) {
    if(!Array.isArray(value))continue;
    for(const item of value)if(obj(item)&&typeof item.ref_id==='string')refs.add(item.ref_id);
  }
  return refs;
}
export function weryfikujSnapshot(enm,result,previous,expectedRefs) {
  demand(obj(enm?.header)&&Number.isSafeInteger(enm.header.revision),'ENM_HEADER_INVALID');
  demand(enm.header.revision>previous.revision,'ENM_REVISION_NOT_ADVANCED');
  demand(hex(enm.header.hash_sha256)&&enm.header.hash_sha256!==previous.hash,'ENM_HASH_NOT_ADVANCED');
  demand(result?.snapshot?.header?.hash_sha256===enm.header.hash_sha256,'ENM_RESULT_DIFFERS_FROM_READBACK');
  const refs=refsInEnm(enm);
  for(const expected of expectedRefs)demand(refs.has(expected),'ENM_EXPECTED_REF_MISSING');
  return {revision:enm.header.revision,hash:enm.header.hash_sha256};
}
export function klientApi(baseUrl,fetcher=fetch) {
  const u=new URL(baseUrl);
  demand(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname),'BACKEND_MUST_BE_LOCAL');
  demand(!u.username&&!u.password&&!u.search&&!u.hash,'BACKEND_URL_INVALID');
  return async(method,route,payload) => {
    const r=await fetcher(u.origin+route,{method,headers:{'Content-Type':'application/json','Cache-Control':'no-store'},
      body:payload===undefined?undefined:JSON.stringify(payload),redirect:'error'});
    const raw=await r.text();
    let result;
    try{result=raw?JSON.parse(raw):null;}catch{throw new OdmowaR13('RESPONSE_NOT_JSON');}
    if(!r.ok)throw new OdmowaR13('HTTP_'+r.status);
    return result;
  };
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** Publikacja nie jest transakcją na całym planie; w razie błędu raportuj rewizje.
 * Nie wykonuj resetów/rollbacku, które mogłyby skasować cudzą pracę.
 */
export async function wykonajE2E(plan,api,{publish=false,confirm='',intervalMs=200,pollCount=240}={}) {
  demand(publish===true&&confirm==='ZATWIERDZAM_ZAPIS_ENM','PUBLISH_NOT_CONFIRMED');
  const path='/api/cases/'+encodeURIComponent(plan.case_id);
  const current=await api('GET',path+'/enm');
  demand(obj(current?.header)&&hex(current.header.hash_sha256),'INITIAL_ENM_UNKNOWN');
  demand(plan.base_enm_hash===current.header.hash_sha256,'BASE_REVISION_CONFLICT');
  const report={schema:'MV-DIGPRO-E2E-EVIDENCE-R13',status:'INCOMPLETE',source_sha256:plan.source.sha256,
    case_id:plan.case_id,revisions:[],runs:[],changes_applied:0,
    sld:{engine:'SldCanvasV3',consumer:'useSnapshotStore.snapshot',verification:'NOT_RENDERED'}};
  let previous={revision:current.header.revision,hash:current.header.hash_sha256};
  try{
    for(const step of plan.operations){
      const answer=await api('POST',path+'/enm/domain-ops',{
        project_id:plan.project_id,snapshot_base_hash:previous.hash,
        operation:{name:step.operation.name,idempotency_key:step.operation.idempotency_key,
          payload:step.operation.payload}});
      demand(!answer?.error_code&&!answer?.error&&obj(answer?.snapshot),'DOMAIN_OPERATION_REJECTED');
      const readback=await api('GET',path+'/enm');
      previous=weryfikujSnapshot(readback,answer,previous,step.expected_refs);
      report.revisions.push({step_id:step.step_id,revision:previous.revision,hash:previous.hash});
      report.changes_applied++;
    }
    report.final_model={...previous};
    for(const analysis_type of ['LOAD_FLOW','SC_3F']){
      const created=await api('POST','/api/execution/study-cases/'+plan.case_id+'/runs',
        {analysis_type,solver_input:{}});
      demand(uuid(created?.id)&&created.model_revision===previous.revision,'RUN_REVISION_MISMATCH');
      const runId=created.id;
      await api('POST','/api/execution/runs/'+runId+'/execute');
      let run=null;
      for(let n=0;n<pollCount;n++){
        run=await api('GET','/api/execution/runs/'+runId);
        if(['FINISHED','FAILED','CANCELLED'].includes(run?.status))break;
        await sleep(intervalMs);
      }
      demand(run?.status==='FINISHED','ANALYSIS_NOT_FINISHED');
      demand(run.model_revision===previous.revision,'ANALYSIS_STALE');
      const evidence=await api('GET','/api/analysis-runs/'+runId+'/snapshot');
      demand(evidence?.snapshot?.header?.hash_sha256===previous.hash,'RUN_SNAPSHOT_NOT_SAME_ENM');
      const results=await api('GET','/api/execution/runs/'+runId+'/results');
      demand(results?.run_id===runId&&typeof results?.deterministic_signature==='string'&&
        results.deterministic_signature.length>0,'RESULT_SET_INVALID');
      report.runs.push({run_id:runId,analysis_type,status:run.status,
        model_revision:run.model_revision,model_hash:previous.hash,
        result_signature:results.deterministic_signature});
    }
    report.sld={engine:'SldCanvasV3',consumer:'useSnapshotStore.snapshot',
      verification:'NOT_RENDERED',model_hash:previous.hash};
    report.status='COMPUTATION_COMPLETE_SLD_REVIEW_REQUIRED';
    return report;
  }catch(err){
    report.status='FAILED_POSSIBLE_PARTIAL_ENM_CHANGE';
    report.failure_code=err instanceof OdmowaR13?err.code:'UNEXPECTED_FAILURE';
    return report;
  }
}
export function czytajArgumenty(argv){
  const args={};
  for(let i=0;i<argv.length;i+=2){
    demand(argv[i]?.startsWith('--')&&i+1<argv.length,'ARGUMENTS_INVALID');
    args[argv[i].slice(2)]=argv[i+1];
  }
  for(const k of ['plan','geojson','manifest','report'])demand(typeof args[k]==='string','FILE_ARGUMENT_MISSING');
  return args;
}
export async function main(argv){
  const args=czytajArgumenty(argv);
  const [plan,geojson,manifest]=await Promise.all(['plan','geojson','manifest'].map(async k=>
    JSON.parse(await readFile(args[k],'utf8'))));
  const validated=zweryfikujPakiet(plan,geojson,manifest);
  let report=validated;
  if(args.apply==='true'){
    demand(args.confirm==='ZATWIERDZAM_ZAPIS_ENM','PUBLISH_NOT_CONFIRMED');
    report=await wykonajE2E(plan,klientApi(args.backend||'http://127.0.0.1:8000'),{
      publish:true,confirm:args.confirm});
  }
  await writeFile(args.report,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({status:report.status,source_sha256:plan.source.sha256,
    revision:report.final_model?.revision??null,run_count:report.runs?.length??0}));
  if(report.status.startsWith('FAILED'))process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main(process.argv.slice(2)).catch(err=>{
    console.error(JSON.stringify({error:err instanceof OdmowaR13?err.code:'INVALID_OR_UNREACHABLE'}));
    process.exitCode=2;
  });
}