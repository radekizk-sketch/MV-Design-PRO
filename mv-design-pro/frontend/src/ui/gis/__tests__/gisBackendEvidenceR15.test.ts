import { describe, it, expect } from 'vitest';
import { zweryfikujWynikiBackendR15 } from '../gisBackendEvidenceR15';

const CASE='11111111-1111-4111-8111-111111111111';
const LF='22222222-2222-4222-8222-222222222222';
const SC='33333333-3333-4333-8333-333333333333';
const HASH='a'.repeat(64);
type Obj=Record<string, unknown>;
function report(){
  return {
    schema:'MV-DIGPRO-E2E-EVIDENCE-R13',
    status:'COMPUTATION_COMPLETE_SLD_REVIEW_REQUIRED',
    atomic_single_commit:true,case_id:CASE,
    final_model:{revision:5,hash:HASH},
    runs:[
      {run_id:LF,analysis_type:'LOAD_FLOW',model_revision:5,model_hash:HASH,result_signature:'LF-SIG'},
      {run_id:SC,analysis_type:'SC_3F',model_revision:5,model_hash:HASH,result_signature:'SC-SIG'},
    ],
  };
}
function server(overrides:Record<string,Obj>={}){
  const calls:string[]=[];
  const objects:Record<string,Obj>={
    ['/api/cases/'+CASE+'/enm']:{header:{revision:5,hash_sha256:HASH}},
  };
  for(const [id,analysis,sig] of [[LF,'LOAD_FLOW','LF-SIG'],[SC,'SC_3F','SC-SIG']]){
    objects['/api/execution/runs/'+id]={
      id,study_case_id:CASE,analysis_type:analysis,status:'FINISHED',model_revision:5,
    };
    objects['/api/analysis-runs/'+id+'/snapshot']={
      run_id:id,snapshot:{header:{revision:5,hash_sha256:HASH}},
    };
    objects['/api/execution/runs/'+id+'/results']={
      run_id:id,analysis_type:analysis,deterministic_signature:sig,
    };
  }
  Object.assign(objects,overrides);
  const fetcher=async(input:string):Promise<Response>=>{
    calls.push(input);
    const result=objects[input];
    return new Response(JSON.stringify(result??{error:'unknown'}),{
      status:result?200:404,headers:{'Content-Type':'application/json'},
    });
  };
  return {fetcher,calls};
}
describe('R15 GIS — dowód biegów sprawdzony w backendzie, a nie lokalnym JSON',()=>{
  it('akceptuje wyłącznie dwa rzeczywiste biegi tej samej rewizji',async()=>{
    const api=server();
    const result=await zweryfikujWynikiBackendR15(report(),CASE,api.fetcher);
    expect(result).toEqual({
      verified:true,caseId:CASE,modelRevision:5,modelHash:HASH,checkedRunIds:[LF,SC],
    });
    expect(api.calls).toHaveLength(7);
    expect(api.calls.every(x=>x.startsWith('/api/'))).toBe(true);
  });
  it('odrzuca raport z nieistniejącym biegiem',async()=>{
    const api=server({['/api/execution/runs/'+SC]:{error:'not found'}});
    await expect(zweryfikujWynikiBackendR15(report(),CASE,api.fetcher))
      .rejects.toThrow('BACKEND_RUN_INCONSISTENT');
  });
  it('odrzuca różny podpis rzeczywistego wyniku',async()=>{
    const api=server({['/api/execution/runs/'+SC+'/results']:{
      run_id:SC,analysis_type:'SC_3F',deterministic_signature:'OTHER',
    }});
    await expect(zweryfikujWynikiBackendR15(report(),CASE,api.fetcher))
      .rejects.toThrow('BACKEND_RESULT_SIGNATURE_MISMATCH');
  });
  it('odrzuca przestarzałą rewizję na serwerze',async()=>{
    const api=server({['/api/cases/'+CASE+'/enm']:{header:{revision:6,hash_sha256:'b'.repeat(64)}}});
    await expect(zweryfikujWynikiBackendR15(report(),CASE,api.fetcher))
      .rejects.toThrow('BACKEND_MODEL_STALE');
  });
  it('odrzuca migawkę SC inną niż ENM bieżące',async()=>{
    const api=server({['/api/analysis-runs/'+SC+'/snapshot']:{
      run_id:SC,snapshot:{header:{revision:5,hash_sha256:'b'.repeat(64)}},
    }});
    await expect(zweryfikujWynikiBackendR15(report(),CASE,api.fetcher))
      .rejects.toThrow('BACKEND_RUN_SNAPSHOT_MISMATCH');
  });
  it('odrzuca powielenie tego samego ID biegu dla LF i SC',async()=>{
    const e=report();e.runs[1].run_id=LF;
    const api=server();
    await expect(zweryfikujWynikiBackendR15(e,CASE,api.fetcher))
      .rejects.toThrow('REPORT_RUN_ID_INVALID');
  });
  it('odrzuca raport innego przypadku przed żądaniem HTTP',async()=>{
    const api=server();
    await expect(zweryfikujWynikiBackendR15(report(),'44444444-4444-4444-8444-444444444444',api.fetcher))
      .rejects.toThrow('REPORT_CASE_MISMATCH');
    expect(api.calls).toHaveLength(0);
  });
  it('odmawia przy niedostępnym backendzie',async()=>{
    const api=server({['/api/cases/'+CASE+'/enm']:undefined as unknown as Obj});
    await expect(zweryfikujWynikiBackendR15(report(),CASE,api.fetcher))
      .rejects.toThrow('BACKEND_READ_FAILED');
  });
});
