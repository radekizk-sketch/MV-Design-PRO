import {REPO,PLAN,MAPA,parse,status} from './tracker.mjs';
const $=id=>document.getElementById(id);
const repository='https://github.com/'+REPO;
const source='https://raw.githubusercontent.com/'+REPO+'/main/';
const api='https://api.github.com/repos/'+REPO;
const expected=['Architectural And Repo Hygiene Guard','Docs Integrity Guard','Frontend checks','Frontend E2E smoke','Frontend E2E full','P0 Extended Guards (V12K invariants)','Physics Label Guard (Catalog-First)','Python tests','SLD Determinism Guards','Postęp inżynierski MV-DESIGN PRO'];
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const anchor=(u,s)=>'<a href="'+escape(u)+'" target="_blank" rel="noopener noreferrer">'+escape(s)+'</a>';
const badge=(s,kind='')=>'<span class="pill '+kind+'">'+escape(s)+'</span>';
let data=null,view='ab',ci='nieustalone';
async function get(url,asText=false){
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok)throw Error('Nie można pobrać źródła: '+response.status);
  return asText?response.text():response.json();
}
const fraction=(a,b)=>b?Math.round(a/b*100):0;
function draw(){
 if(!data)return;
 const tasks=data.przyrosty;
 const accepted=tasks.filter(x=>status(x,ci)==='odebrane').length;
 const traced=tasks.filter(x=>x.wpisy.some(y=>y.sha)).length;
 const ratio=fraction(accepted,tasks.length);
 $('percent').textContent=ratio+'%';
 $('dial').style.setProperty('--percent',ratio+'%');
 $('accepted-number').textContent=accepted+' / '+tasks.length;
 $('traced-number').textContent=traced+' / '+tasks.length;
 $('accepted-bar').style.width=ratio+'%';
 $('traced-bar').style.width=fraction(traced,tasks.length)+'%';
 $('m-items').textContent=tasks.length;
 $('m-waves').textContent=data.wycinki.length;
 $('m-abilities').textContent=[...data.domeny,...data.rodziny].reduce((s,g)=>s+g.zdolnosci.length,0);
 const all=view==='ab'?tasks:view==='w'?data.wycinki:view==='d'?data.domeny:data.rodziny;
 const q=$('search').value.toLocaleLowerCase('pl').trim(),filter=$('filter').value;
 const visible=all.filter(x=>{
  const content=[x.id,x.nazwa,x.opis,x.wymagania,...(x.zdolnosci||[]).map(z=>z.nazwa)].join(' ').toLocaleLowerCase('pl');
  if(!content.includes(q))return false;
  if(view==='ab'&&filter!=='all'){
   const s=status(x,ci);
   return filter==='accept'?s==='odebrane':filter==='trace'?s==='ślad wdrożenia'||s==='odebrane':s==='bez odbioru';
  }
  return true;
 });
 $('count').textContent='Widoczne: '+visible.length+' / '+all.length;
 $('items').innerHTML=visible.map(card).join('')||'<div class="item wide">Brak pasujących pozycji. Zmień filtr wyszukiwania.</div>';
}
function card(x){
 if(view==='ab'){
  const s=status(x,ci),kind=s==='odebrane'?'ok':s==='ślad wdrożenia'?'pending':'';
  const evidence=x.wpisy.slice(-6).reverse().map(w=>'<p>'+escape(w.data)+' · '+(w.sha?anchor(repository+'/commit/'+w.sha,w.sha.slice(0,8)):'bez commita')+' · '+escape(w.opis)+'</p>').join('');
  return '<article class="item"><div class="item-head"><span class="item-id">'+escape(x.id)+'</span>'+badge(s,kind)+'</div><h3>'+escape(x.opis.slice(0,145))+'</h3><details><summary>Wymagania i dowody</summary><p>'+escape(x.wymagania)+'</p>'+evidence+
  (x.odbior?'<p>'+anchor(x.odbior.przeglad,'Protokół przeglądu')+'</p>':'')+
  '<p>'+anchor(repository+'/blob/main/'+PLAN,'Źródło: plan A/B §5, §7 ↗')+'</p></details></article>';
 }
 if(view==='w')return '<article class="item"><div class="item-head"><span class="item-id">'+escape(x.id)+'</span>'+badge('Wycinek produktu')+'</div><h3>'+escape(x.nazwa)+'</h3><p>'+escape(x.opis)+'</p><details><summary>Zależności i źródło</summary><p>'+escape(x.zaleznosc)+'</p><p>'+anchor(repository+'/blob/main/'+MAPA,'Mapa produktu §8 ↗')+'</p></details></article>';
 const old=x.zdolnosci.filter(z=>z.klasa.startsWith('ISTNIEJE-ZWERYFIKOWANE')).length;
 const rows=x.zdolnosci.map(z=>'<div class="check"><span class="label">'+escape(z.id+' · '+z.nazwa)+'</span><span class="state">'+escape(z.klasa)+'</span></div><p class="evidence">'+escape(z.dowod)+'</p>').join('');
 return '<article class="item"><div class="item-head"><span class="item-id">'+escape(x.id)+'</span>'+badge(x.zdolnosci.length+' zdolności')+'</div><h3>'+escape(x.nazwa)+'</h3><div class="barwrap"><div class="bar-label"><span>Historycznie zweryfikowane</span><strong>'+old+' / '+x.zdolnosci.length+'</strong></div><div class="progress-mini"><span style="width:'+fraction(old,x.zdolnosci.length)+'%"></span></div></div><p>Wynik historycznej mapy, nie aktualny odbiór CI.</p><details><summary>Rozwiń zdolności i dowody</summary>'+rows+anchor(repository+'/blob/main/'+MAPA,'Źródło ↗')+'</details></article>';
}
async function refresh(){
 $('refresh').disabled=true;
 $('error').classList.add('hidden');
 try{
  const [plan,map,record,head]=await Promise.all([
   get(source+PLAN+'?v='+Date.now(),true),
   get(source+MAPA+'?v='+Date.now(),true),
   get(source+'docs/progress/odbior.json?v='+Date.now(),true),
   get(api+'/commits/main')]);
  data=parse(plan,map,JSON.parse(record));
  const sha=head.sha;
  $('sha').textContent=sha.slice(0,12);
  $('updated').textContent='Odczyt: '+new Date().toLocaleString('pl-PL')+' · main';
  $('live').textContent='Połączono z GitHub';
  const statuses=new Map(expected.map(x=>[x,'brak przebiegu']));
  try{
   const runs=await get(api+'/actions/runs?head_sha='+sha+'&per_page=100');
   for(const run of (runs.workflow_runs||[]).sort((a,b)=>b.created_at.localeCompare(a.created_at))){
    if(statuses.get(run.name)==='brak przebiegu')statuses.set(run.name,run.conclusion||run.status||'nieustalony');
   }
   ci=[...statuses.values()].every(x=>x==='success')?'zaliczone':
    [...statuses.values()].some(x=>['failure','cancelled','timed_out'].includes(x))?'niezaliczone':'w toku';
  }catch{ci='nieustalone';}
  $('ci-status').className='pill '+(ci==='zaliczone'?'ok':ci==='niezaliczone'?'bad':'pending');
  $('ci-status').textContent=ci==='zaliczone'?'10/10 zaliczone':ci==='niezaliczone'?'Wykryto błąd':ci==='w toku'?'Weryfikacja trwa':'Brak odczytu';
  $('checks').innerHTML=[...statuses].map(([name,s])=>'<div class="check" data-state="'+escape(s)+'"><span class="label">'+escape(name)+'</span><span class="state">'+escape(s)+'</span></div>').join('');
  draw();
  try{
   const commits=await get(api+'/commits?sha=main&per_page=7');
   $('commits').innerHTML=commits.map(c=>'<div class="commit"><span class="commit-code">'+anchor(repository+'/commit/'+c.sha,c.sha.slice(0,9))+'</span><div><span class="commit-msg">Zmiana w repozytorium</span><span class="commit-time">'+escape(new Date(c.commit.committer.date).toLocaleString('pl-PL'))+'</span></div></div>').join('');
  }catch{$('commits').textContent='Historia commitów niedostępna.';}
 }catch(e){
  $('error').textContent='Brak wiarygodnych danych: '+e.message+'. Panel nie szacuje brakujących wyników.';
  $('error').classList.remove('hidden');
 }finally{$('refresh').disabled=false;}
}
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{
 view=btn.dataset.view;
 document.querySelectorAll('[data-view]').forEach(x=>x.setAttribute('aria-selected',String(x===btn)));
 $('filter').value='all';$('filter').classList.toggle('hidden',view!=='ab');draw();
}));
$('search').addEventListener('input',draw);
$('filter').addEventListener('change',draw);
$('refresh').addEventListener('click',refresh);
refresh();
setInterval(()=>{if(!document.hidden)refresh();},120000);
