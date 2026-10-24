/**
 * Atlas do przeglądu właścicielskiego — NIE jest alternatywną kanwą SLD.
 * Kanoniczne symbole rysuje istniejący CadSymbol; nowe prymitywy rysuje
 * CadPrimitivesPreview z TEGO SAMEGO renderera. Brak zapisów w ENM.
 * Dostęp przez /nn-cad-atlas-review.html — nie podłączać do nawigacji produkcyjnej.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { CadSymbol, CadPrimitivesPreview } from './ui/sld/v3/cad/CadSymbol';
import { CAD_SYMBOL_IDS, ELECTRICAL_CAD_SYMBOL_REGISTRY, maStanLaczeniowy,
  type CadSwitchState, type CadSymbolId } from './ui/sld/v3/cad/cadSymbolRegistry';
import { LV_CANDIDATE_SYMBOLS, geometriaPropozycji, type LvCandidate } from './ui/sld/v3/cad/experimental/lvCandidateRegistry';

type Pozycja = {kind:'existing';id:CadSymbolId;name:string;section:string;status:string} |
 {kind:'candidate';id:string;name:string;section:string;status:string;def:LvCandidate};
const POZYCJE:readonly Pozycja[] = [
  ...CAD_SYMBOL_IDS.map(id=>({
    kind:'existing' as const,id,name:ELECTRICAL_CAD_SYMBOL_REGISTRY[id].polishName,
    section:'Biblioteka istniejąca',status:ELECTRICAL_CAD_SYMBOL_REGISTRY[id].verificationStatus
  })),
  ...LV_CANDIDATE_SYMBOLS.map(def=>({
    kind:'candidate' as const,id:def.id,name:def.namePl,section:'Propozycja nN',status:def.normativeStatus,def
  })),
];
const styl = `
:root {font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg)}
body.light{--bg:#f2f5f8;--panel:#fff;--fg:#182b3a;--muted:#546b7c;--line:#cbd6de;--accent:#007ba3;--selected:#e7f5f8}
body.dark{--bg:#0b1421;--panel:#111f2b;--fg:#e3edf4;--muted:#9aaebd;--line:#2b4252;--accent:#61d7ef;--selected:#163c48}
button,input{font:inherit;color:var(--fg);background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:9px 11px}
button{cursor:pointer}button:hover,button.current{border-color:var(--accent);background:var(--selected)}
button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
header{background:var(--panel);padding:18px 24px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.brand{font-size:11px;letter-spacing:.16em;color:var(--accent);font-weight:750}.title{font-weight:750;font-size:23px;letter-spacing:-.04em;margin:5px 0}
.sub{font-size:12px;color:var(--muted)}.toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:14px}
.toolbar input{min-width:235px;flex:1;max-width:390px}
.layout{display:grid;grid-template-columns:170px minmax(0,1fr);min-height:80vh}
nav{background:var(--panel);border-right:1px solid var(--line);padding:18px 11px}
nav button{display:block;border:0;width:100%;text-align:left;margin-bottom:5px}
main{padding:22px;min-width:0}.notice{border:1px solid var(--line);border-left:3px solid var(--accent);padding:13px 15px;background:var(--panel);font-size:12px;line-height:1.55;margin-bottom:18px}
h2{font-size:16px;margin:10px 0 14px}.chipline{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px}
.view{display:grid;grid-template-columns:minmax(0,1fr) 298px;gap:15px;align-items:start}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(172px,1fr));gap:11px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:6px;cursor:pointer;padding:12px;min-height:206px;display:flex;flex-direction:column}
.card.active,.card:hover{border-color:var(--accent)}
.headcard{display:flex;justify-content:space-between;gap:4px;font-size:10px;color:var(--muted)}
.drawing{height:128px;display:grid;place-items:center}.drawing svg{height:115px;max-width:124px}
.name{font-size:12px;font-weight:650;line-height:1.3;min-height:31px}
.caption{color:var(--muted);font-size:10px}
aside{position:sticky;top:159px;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:16px}
ins{color:var(--accent)}.large{background:var(--bg);height:230px;display:grid;place-items:center;margin:12px 0}
.large svg{height:202px;width:170px}
table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid var(--line);padding:10px;text-align:left}
dl{display:grid;grid-template-columns:95px auto;gap:9px;font-size:12px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
.sheet{background:var(--panel);border:1px solid var(--line);padding:18px;overflow:auto;max-width:1220px}
.sheet svg{min-width:750px;width:100%}a{color:var(--accent)}
@media(max-width:900px){.layout{display:block}nav{display:flex;overflow:auto}nav button{white-space:nowrap} .view{display:block}aside{position:relative;top:0;margin-top:15px}header{position:relative}}
@media print{header,.layout nav,aside,.chipline{display:none!important}.layout{display:block}.cards{grid-template-columns:repeat(5,1fr)}.card{break-inside:avoid}body{background:white}}
`;
const G:CSSProperties={display:'block'};
function mini(p:Pozycja,stan:CadSwitchState,dark:boolean,big=false,porty=false) {
 const ink=dark?'#e3edf4':'#182b3a',paper=dark?'#0b1421':'#f2f5f8';
 const scale=big?6.0:3.1, x=12,y=8;
 const w=p.kind==='existing'?ELECTRICAL_CAD_SYMBOL_REGISTRY[p.id].nominalWidth:p.def.width;
 const h=p.kind==='existing'?ELECTRICAL_CAD_SYMBOL_REGISTRY[p.id].nominalHeight:p.def.height;
 const ports=p.kind==='existing'?ELECTRICAL_CAD_SYMBOL_REGISTRY[p.id].terminals:p.def.ports;
 return <svg viewBox={`0 0 ${Math.max(40,w+24)} ${Math.max(48,h+20)}`} role="img" aria-label={p.name} style={G}>
    {porty && Array.from({length:Math.floor((w+24)/4)+1},(_,i)=><line key={'x'+i} x1={i*4} y1={0} x2={i*4} y2={h+20} stroke={dark?'#284456':'#d9e2e9'} strokeWidth={.25}/>)}
    {porty && Array.from({length:Math.floor((h+20)/4)+1},(_,i)=><line key={'y'+i} x1={0} y1={i*4} x2={w+24} y2={i*4} stroke={dark?'#284456':'#d9e2e9'} strokeWidth={.25}/>)}
    {p.kind==='existing'
      ?<CadSymbol id={p.id} x={x} y={y} ink={ink} paper={paper} state={stan} nonScalingStroke={false} strokePx={big?.38:.48}/>
      :<>
        {p.def.baseSymbol && <CadSymbol id={p.def.baseSymbol} x={x} y={y} ink={ink} paper={paper} state={stan} nonScalingStroke={false} strokePx={big?.38:.48}/>}
        <CadPrimitivesPreview primitives={geometriaPropozycji(p.def,stan)} x={x} y={y} ink={ink} paper={paper} strokePx={big?.38:.48} state={stan}/>
       </>}
    {porty && ports.map(t=><circle key={t.name} cx={x+t.x} cy={y+t.y} r={.8} fill={paper} stroke="#00a5c6" strokeWidth={.5}/>)}
 </svg>;
}
function Rozdzielnica({dark}:{dark:boolean}) {
 const ink=dark?'#d8e7ef':'#20384c',paper=dark?'#111f2b':'#fff';
 const symbol=(id:CadSymbolId,x:number,y:number,stan:CadSwitchState='closed',obrot:'pozioma'|'pionowa'='pionowa')=>
   <CadSymbol id={id} x={x} y={y} scale={2} state={stan} orientation={obrot} ink={ink} paper={paper} nonScalingStroke={true} strokePx={1.75}/>;
 const lin=(x1:number,y1:number,x2:number,y2:number,w=1.8)=><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink} strokeWidth={w}/>;
 return <div className="sheet"><svg viewBox="0 0 1180 500" aria-label="Przykładowy schemat jednokreskowy rozdzielnicy 400 V">
  <text x={70} y={25} fontSize={18} fontWeight={700} fill={ink}>RG nN · 400 V</text>
  <text x={70} y={46} fontSize={11} fill={ink}>Przykład demonstracyjny — aparatura i dane fikcyjne, bez wyniku solvera</text>
  {symbol('cad.transformator2u',144,60)}{lin(160,116,160,150)}
  {symbol('cad.wylacznik',144,150)}{lin(160,198,160,255)}
  <text x={192} y={170} fontSize={12} fill={ink}>QF1 · ACB 1000 A</text>
  {lin(75,255,540,255,4)}{lin(638,255,1105,255,4)}
  <text x={260} y={240} fontSize={14} fill={ink}>SEKCJA A</text><text x={840} y={240} fontSize={14} fill={ink}>SEKCJA B</text>
  {lin(540,255,561,255)}{symbol('cad.wylacznik',574,231,'open','pozioma')}{lin(610,255,638,255)}
  <text x={546} y={213} fontSize={12} fill={ink}>QBC · OTWARTY</text>
  <text x={897} y={71} fontSize={12} fill={ink}>Rezerwa</text>{lin(920,87,920,151)}
  {symbol('cad.wylacznik',904,151,'open')}{lin(920,199,920,255)}
  {([
    {x:268,id:'cad.wylacznikInstalacyjny' as const,name:'QF2 · MCB B16'},
    {x:393,id:'cad.wylacznikRoznicowopradowy' as const,name:'QF3 · RCD'},
    {x:496,id:'cad.rozlacznikBezpiecznikowy' as const,name:'QS4 · RLB'},
    {x:730,id:'cad.wylacznik' as const,name:'QF5 · MCCB'},
    {x:853,id:'cad.bezpiecznik' as const,name:'FU6 · gG'},
    {x:1020,id:'cad.wylacznikInstalacyjny' as const,name:'QF7 · MCB'}
   ]).map((a,i)=><g key={i}>{lin(a.x,255,a.x,290)}{symbol(a.id,a.x-16,290)}{lin(a.x,338,a.x,402)}<text x={a.x} y={426} textAnchor="middle" fontSize={11} fill={ink}>{a.name}</text></g>)}
  <text x={70} y={472} fontSize={12} fill={ink}>Uwaga: demonstracja sposobu zestawiania z istniejących symboli CAD. Nie jest to projekt wykonawczy ani potwierdzenie zgodności EPLAN/IEC.</text>
 </svg></div>;
}
function App(){
 const [dark,setDark]=useState(false),[state,setState]=useState<CadSwitchState>('open'),
 [q,setQ]=useState(''),[section,setSection]=useState('Wszystkie'),[active,setActive]=useState<string>('cad.wylacznik'),
 [page,setPage]=useState<'atlas'|'rozdzielnica'|'porownanie'>('atlas'),[ports,setPorts]=useState(false);
 const cats=['Wszystkie','Biblioteka istniejąca','Propozycja nN'];
 const filtered=useMemo(()=>POZYCJE.filter(p=>(section==='Wszystkie'||p.section===section)&&
   (p.name+' '+p.id).toLowerCase().includes(q.toLowerCase())),[q,section]);
 const selected=POZYCJE.find(p=>p.id===active)??POZYCJE[0];
 const handleCard=(p:Pozycja)=>setActive(p.id);
 return <div className={dark?'dark':'light'}>
  <style>{styl}</style>
  <header><div className="brand">MV-DESIGN PRO / SYMBOLIKA nN / PRZEGLĄD WŁAŚCICIELSKI</div>
    <div className="title">Atlas CAD — symbole elektroenergetyczne nN</div>
    <div className="sub">{CAD_SYMBOL_IDS.length} istniejących + {LV_CANDIDATE_SYMBOLS.length} propozycji · jeden renderer prymitywów CAD · bez zmiany symboli produkcyjnych</div>
    <div className="toolbar">
      <input placeholder="Znajdź symbol lub aparat…" aria-label="Znajdź symbol" value={q} onChange={e=>setQ(e.target.value)}/>
      <button className={state==='open'?'current':''} onClick={()=>setState('open')}>OTWARTY</button>
      <button className={state==='closed'?'current':''} onClick={()=>setState('closed')}>ZAMKNIĘTY</button>
      <button onClick={()=>setDark(!dark)}>Motyw: {dark?'ciemny':'jasny'}</button>
      <button onClick={()=>window.print()}>Drukuj atlas</button>
    </div>
  </header>
  <div className="layout"><nav>{([
    {id:'atlas' as const,label:'Biblioteka symboli'},
    {id:'rozdzielnica' as const,label:'Rozdzielnica 0,4 kV'},
    {id:'porownanie' as const,label:'Źródła i zgodność'},
   ]).map(s=><button key={s.id} className={page===s.id?'current':''} onClick={()=>setPage(s.id)}>{s.label}</button>)}</nav>
   <main><div className="notice"><b>STATUS: DEMONSTRACJA DO ZATWIERDZENIA.</b> Nowe symbole mają status DRAFT. Nie są kopią biblioteki EPLAN ani nie mają zweryfikowanej geometrii IEC 60617. Dane rozdzielnicy to przykład, nie projekcja ENM. B-02 pozostaje odrzucone.</div>
   {page==='atlas' && <>
     <div className="chipline">{cats.map(c=><button className={section===c?'current':''} key={c} onClick={()=>setSection(c)}>{c}</button>)}</div>
     <div className="view">
      <section><h2>Pozycje biblioteki ({filtered.length}/{POZYCJE.length})</h2>
        <div className="cards">{filtered.map((p,i)=><div key={p.id} className={'card '+(p.id===active?'active':'')} role="button" tabIndex={0} onClick={()=>handleCard(p)} onKeyDown={e=>{if(e.key==='Enter')handleCard(p)}}>
          <div className="headcard"><span>{p.section}</span><span>{String(i+1).padStart(2,'0')}</span></div>
          <div className="drawing">{mini(p,state,dark)}</div>
          <div className="name">{p.name}</div><div className="caption">{p.id}</div>
         </div>)}</div>
      </section>
      <aside><span className="brand">KARTA SYMBOLU</span><h2>{selected.name}</h2>
       <div className="sub">{selected.id} · {selected.status}</div>
       <div className="large">{mini(selected,state,dark,true,ports)}</div>
       <button onClick={()=>setPorts(!ports)}>{ports?'Ukryj':'Pokaż'} siatkę i punkty przyłączeniowe</button>
       <dl><dt>Pochodzenie</dt><dd>{selected.kind==='existing'?'Rejestr CAD R2 / repo':'Nowy kandydat — bez wdrożenia'}</dd>
        <dt>Status normowy</dt><dd>{selected.status} — nie NORMATIVE_VERIFIED</dd>
        <dt>Punkty</dt><dd>{selected.kind==='existing'?ELECTRICAL_CAD_SYMBOL_REGISTRY[selected.id].terminals.map(p=>p.name+' ('+p.x+','+p.y+')').join(', '):selected.def.ports.map(p=>p.name+' ('+p.x+','+p.y+')').join(', ')}</dd>
        <dt>Uwagi</dt><dd>{selected.kind==='existing'?ELECTRICAL_CAD_SYMBOL_REGISTRY[selected.id].notes:selected.def.reviewerNote}</dd>
       </dl>
      </aside>
     </div></>}
   {page==='rozdzielnica'&&<><h2>Przykładowa rozdzielnica nN</h2><p className="sub">Wykorzystuje kanoniczne symbole z rejestru CAD, stany oraz składowe połączeń. Bez nowych fikcyjnych elementów ENM.</p><Rozdzielnica dark={dark}/></>}
   {page==='porownanie'&&<><h2>Macierz odniesień i ograniczeń</h2><table><thead><tr><th>Wzorzec</th><th>Zweryfikowano</th><th>Oczekuje</th></tr></thead><tbody>
    <tr><td>EPLAN Electric P8</td><td>Warianty symboli, edytor, logiczne punkty przyłączenia, organizacja bibliotek.</td><td>Pomiar geometrii na licencjonowanych plikach/wzorcach — brak podstaw do „piksel w piksel”.</td></tr>
    <tr><td>IEC 60617 DB</td><td>Oficjalne źródło referencyjne symboli graficznych.</td><td>Licencjonowana weryfikacja geometrii każdego nowego symbolu.</td></tr>
    <tr><td>MV-DESIGN PRO</td><td>20 symboli i ten sam renderer SVG prymitywów, 14 kandydatów bez ingerencji w mapowanie ENM.</td><td>Integracja po odbiorze, E2E na rzeczywistej projekcji SN–TR–nN.</td></tr>
   </tbody></table><p>Źródła: <a href="https://www.eplan.help/en-us/Infoportal/Content/Plattform/2022/Content/htm/xsbgui_k_arbeitsweise.htm">EPLAN — biblioteka symboli</a>, <a href="https://www.eplan.help/en-US/Infoportal/Content/Plattform/2025/Content/htm/xsbgui_h_symbolvarianteausw.htm">EPLAN — warianty symboli</a>, <a href="https://webstore.iec.ch/en/publication/2723">IEC 60617 DB</a>.</p></>}
   </main></div>
 </div>;
}
const el=document.getElementById('root');
if(!el)throw new Error('Brak korzenia atlasu');
createRoot(el).render(<App/>);
