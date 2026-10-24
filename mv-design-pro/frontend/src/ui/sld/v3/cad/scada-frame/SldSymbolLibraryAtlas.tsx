/**
 * Zakładka istniejącego atlasu QET — pełny inwentarz nN/SN do akceptacji.
 * Jeden renderer CadSymbol/CadPrimitiveLayer; nie generuje nowych glifów.
 *
 * Wpis bez źródła ma status BLOKADA, a pole SN/RGnN jest złożeniem ENM.
 * Ramkę czerwony/zielony rysuj WYŁĄCZNIE dla urządzeń z mechanicznym stykiem.
 */
import { useEffect, useMemo, useState } from 'react';
import { CadSymbol, CadPrimitiveLayer } from '../CadSymbol';
import { ELECTRICAL_CAD_SYMBOL_REGISTRY } from '../cadSymbolRegistry';
import { ocenStanRamki, type ScadaFrameInput, type PolozenieMechaniczne } from './scadaFrameState';
import { QetScadaFrame } from './QetScadaFrame';
import { QET_PILOT_SYMBOLS } from './qetPilotSourceGeometry';
import { fitQetSymbol } from './qetSymbolBounds';
import {
  BAZA_SYMBOLI_SLD, pokrycieBiblioteki, type PoziomBiblioteki,
  type PozycjaBiblioteki,
} from './sldSymbolLibraryCatalog';
import {
  KLUCZ_ODBIORU_SYMBOLI, zmienDecyzje, utworzEksport,
  csvOdbioru, wczytajEksport, podsumowanieOdbioru,
  type DecyzjaSymbolu, type RejestrOdbioru,
} from './symbolApprovalLedger';

const frame={x:8,y:7,width:84,height:100} as const;
function zapiszPlik(nazwa:string,typ:string,dane:string):void{
  const url=URL.createObjectURL(new Blob([dane],{type:typ}));
  const link=document.createElement('a');
  link.href=url;
  link.download=nazwa;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function wczytajRejestrLokalny():RejestrOdbioru{
  try{
    if(typeof window==='undefined')return {};
    const raw=window.localStorage.getItem(KLUCZ_ODBIORU_SYMBOLI);
    if(!raw)return {};
    const obj=JSON.parse(raw) as unknown;
    if(!obj||typeof obj!=='object'||Array.isArray(obj))return {};
    return obj as RejestrOdbioru;
  }catch{return {};}
}

const WERSJA={
  scenarioId:'ATLAS-DOWODOWY',enmVersion:'ATLAS',topologyHash:'BRAK-SOLVERA',
  resultSnapshotId:null,resultTopologyHash:null,
  resultScenarioId:null,resultEnmVersion:null,
} as const;
const STYLE=`
.qet-full-atlas{margin-top:14px}
.qet-full-controls{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}
.qet-full-controls button,.qet-full-controls input,.qet-full-controls select{padding:9px 12px;
  background:var(--panel2);border:1px solid var(--line);color:var(--fg);border-radius:6px;font-size:13px}
.qet-full-controls button[aria-pressed=true]{border-color:var(--accent);color:var(--accent);font-weight:700}
.qet-full-controls input{flex:1;min-width:160px}
.qet-full-summary{font-size:12px;color:var(--muted);margin:10px 0 15px;line-height:1.6}
.qet-full-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:12px}
.qet-full-card{background:var(--panel2);border:1px solid var(--line);border-radius:8px;min-height:280px;
  padding:13px;display:flex;flex-direction:column;gap:5px}
.qet-full-card strong{font-size:12px;line-height:1.45;min-height:33px}
.qet-full-card svg{display:block;width:100%;max-height:176px;flex:1}
.qet-full-card small{font-size:10px;color:var(--muted);line-height:1.45}
.qet-full-card .qet-pending{flex:1;display:flex;justify-content:center;align-items:center;
  text-align:center;color:var(--muted);border:1px dashed var(--line);
  border-radius:7px;margin:14px 0;font-size:12px;padding:12px}
.qet-full-source{margin-top:auto;border-top:1px solid var(--line);padding-top:9px}
.qet-full-card[data-source-status=QET_ZRODLOWY]{border-top:2px solid #2ccf93}
.qet-full-card[data-source-status=CAD_ISTNIEJACY]{border-top:2px solid #4bd0ec}
.qet-full-card[data-decision=AKCEPTUJE]{border-left:3px solid #2ccf93}
.qet-full-card[data-decision=ODRZUCAM]{border-left:3px solid #f05260}
.qet-full-card[data-decision=DO_POPRAWY]{border-left:3px solid #e5af47}
.qet-review-select{display:flex;gap:5px;align-items:center;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:10px}
.qet-review-select label{display:flex;align-items:center;gap:4px;border:1px solid var(--line);border-radius:4px;padding:5px 7px;cursor:pointer;font-size:10px}
.qet-review-select label:has(input:checked){border-color:var(--accent);background:rgba(0,190,219,.11)}
.qet-review-select input{min-width:auto;flex:none;accent-color:var(--accent);margin:0}
.qet-review-note{display:block;width:100%;resize:vertical;min-height:53px;padding:7px;
  background:var(--panel2);color:var(--fg);border:1px solid var(--line);border-radius:5px;font-size:11px}
.qet-approval-summary{padding:10px;border:1px solid var(--line);border-radius:6px;
 font-size:12px;color:var(--muted);display:flex;gap:13px;flex-wrap:wrap;align-items:center}
`;

function sourceInput(position:PozycjaBiblioteki,state:PolozenieMechaniczne):ScadaFrameInput{
  return {
    elementRef:position.id,
    rodzaj:position.czyLacznik?'LACZNIK':'ELEMENT_STALY',
    polozenie:state,eksploatacja:'NORMALNY',jakosc:'PRAWIDLOWE',
    zrodlo:'SYMULACJA',zasilenie:'NIEUSTALONY',
    wersjaStanu:WERSJA,wersjaWidoku:WERSJA,
  };
}

function LibraryGlyph({entry,state,theme}:{
  readonly entry:PozycjaBiblioteki;
  readonly state:PolozenieMechaniczne;
  readonly theme:'dark'|'light';
}):JSX.Element|null{
  const qet=QET_PILOT_SYMBOLS.find(s=>s.id===entry.qetId);
  const cad=entry.cadId?ELECTRICAL_CAD_SYMBOL_REGISTRY[entry.cadId]:null;
  if(!qet&&!cad)return null;

  const input=sourceInput(entry,state);
  const wynik=ocenStanRamki(input);
  const ink=theme==='dark'?'#dfedf5':'#152f3f';
  const paper=theme==='dark'?'#0e2332':'#f5f9fa';
  const qetFit=qet?fitQetSymbol(qet,frame,12):null;
  const cadScale=cad?Math.min((frame.width-24)/cad.nominalWidth,
    (frame.height-24)/cad.nominalHeight):1;

  return (
    <svg viewBox="0 0 100 114" role="img"
      data-library-glif={entry.id}
      aria-label={entry.nazwa}>
      <QetScadaFrame input={input} x={frame.x} y={frame.y}
        width={frame.width} height={frame.height} showStateLabel={false}>
        {qet && qetFit ? (
          <g data-glyph-source="QET"
            transform={`translate(${qetFit.offsetX} ${qetFit.offsetY}) scale(${qetFit.scale})`}>
            <CadPrimitiveLayer
              primitives={wynik.stanGeometryczny==='closed'?qet.closed:qet.open}
              ink={ink} paper={paper} strokePx={0.85} nonScalingStroke={false}/>
            {qet.ports.map((p,i)=><circle
              key={i} cx={p.x} cy={p.y} r={1.3}
              fill={paper} stroke="#00a4cf" strokeWidth=".65"/>)}
          </g>
        ) : cad&&entry.cadId ? (
          <g data-glyph-source="REGISTRY">
            <CadSymbol id={entry.cadId}
              x={frame.x+frame.width/2-cad.anchors.center.x*cadScale}
              y={frame.y+frame.height/2-cad.anchors.center.y*cadScale}
              scale={cadScale} ink={ink} paper={paper}
              state={state==='ZAMKNIETY'?'closed':'open'}
              nonScalingStroke={false} strokePx={0.85}/>
          </g>
        ) : null}
      </QetScadaFrame>
    </svg>
  );
}

export function SldSymbolLibraryAtlas({theme}:{
  readonly theme:'dark'|'light';
}):JSX.Element{
  const [level,setLevel]=useState<PoziomBiblioteki>('nN');
  const [position,setPosition]=useState<PolozenieMechaniczne>('OTWARTY');
  const [status,setStatus]=useState<'Wszystkie'|'Dostępna geometria'|'Braki i złożenia'>('Wszystkie');
  const [query,setQuery]=useState('');
  const [decyzjaFiltr,setDecyzjaFiltr]=useState<'*'|DecyzjaSymbolu>('*');
  const [rejestr,setRejestr]=useState<RejestrOdbioru>(wczytajRejestrLokalny);
  const [bladImportu,setBladImportu]=useState<string|null>(null);
  useEffect(()=>{
    try{window.localStorage.setItem(KLUCZ_ODBIORU_SYMBOLI,JSON.stringify(rejestr));}
    catch{/* Eksport JSON pozostaje dostępną ścieżką zapisu. */}
  },[rejestr]);
  const updateApproval=(id:string,decyzja:DecyzjaSymbolu,uwagi:string)=>{
    setRejestr(old=>zmienDecyzje(old,id,decyzja,uwagi,new Date().toISOString()));
  };
  const eksport=()=>utworzEksport(BAZA_SYMBOLI_SLD,rejestr,new Date().toISOString());
  const totals=podsumowanieOdbioru(BAZA_SYMBOLI_SLD,rejestr);
  const stats=pokrycieBiblioteki(level);
  const entries=useMemo(()=>BAZA_SYMBOLI_SLD.filter(e=>{
    if(e.poziom!==level)return false;
    if(decyzjaFiltr!=='*' && (rejestr[e.id]?.decyzja??'NIEOCENIONY')!==decyzjaFiltr)
      return false;
    if(query&&!([e.id,e.nazwa,e.rodzina,e.uwagi].join(' ').toLocaleLowerCase('pl')
      .includes(query.toLocaleLowerCase('pl'))))return false;
    if(status==='Dostępna geometria')
      return e.status==='QET_ZRODLOWY'||e.status==='CAD_ISTNIEJACY';
    if(status==='Braki i złożenia')
      return e.status==='WYMAGA_ZRODLA'||e.status==='ZLOZENIE_ENM';
    return true;
  }),[level,query,status,decyzjaFiltr,rejestr]);

  return (
    <div className="qet-full-atlas" data-testid="sld-library-atlas">
      <style>{STYLE}</style>
      <div className="qet-full-controls">
        <button type="button" aria-pressed={level==='nN'} onClick={()=>setLevel('nN')}>
          Biblioteka nN
        </button>
        <button type="button" aria-pressed={level==='SN'} onClick={()=>setLevel('SN')}>
          Biblioteka SN
        </button>
        <button type="button" aria-pressed={position==='OTWARTY'}
          onClick={()=>setPosition('OTWARTY')}>Otwarty</button>
        <button type="button" aria-pressed={position==='ZAMKNIETY'}
          onClick={()=>setPosition('ZAMKNIETY')}>Zamknięty</button>
        <input value={query} aria-label="Szukaj symbolu"
          placeholder="Szukaj nazwy, aparatu, rodziny…"
          onChange={e=>setQuery(e.target.value)}/>
        <select value={status} onChange={e=>setStatus(e.target.value as typeof status)}
          aria-label="Status źródła symbolu">
          <option>Wszystkie</option>
          <option>Dostępna geometria</option>
          <option>Braki i złożenia</option>
        </select>
        <select value={decyzjaFiltr} aria-label="Filtr decyzji właścicielskiej"
          onChange={e=>setDecyzjaFiltr(e.target.value as typeof decyzjaFiltr)}>
          <option value="*">Wszystkie decyzje</option>
          <option value="NIEOCENIONY">Nieocenione</option>
          <option value="AKCEPTUJE">Zaakceptowane</option>
          <option value="ODRZUCAM">Odrzucone</option>
          <option value="DO_POPRAWY">Do poprawy</option>
        </select>
      </div>
      <div className="qet-approval-summary" data-testid="sld-approval-summary">
        <span>Zaakceptowano: <b>{totals.zaakceptowane}</b></span>
        <span>Odrzucono: <b>{totals.odrzucone}</b></span>
        <span>Do poprawy: <b>{totals.doPoprawy}</b></span>
        <span>Nieocenione: <b>{totals.nieocenione}</b></span>
        <button type="button" onClick={()=>zapiszPlik(
          'MV_DESIGN_PRO_ODBIOR_SYMBOLI_73.json','application/json;charset=utf-8',
          JSON.stringify(eksport(),null,2),
        )}>Pobierz JSON</button>
        <button type="button" onClick={()=>zapiszPlik(
          'MV_DESIGN_PRO_ODBIOR_SYMBOLI_73.csv','text/csv;charset=utf-8',
          csvOdbioru(eksport()),
        )}>Pobierz CSV</button>
        <label>Wczytaj rejestr JSON
          <input aria-label="Importuj decyzje z pliku JSON" type="file"
            accept="application/json,.json" onChange={async e=>{
              const file=e.target.files?.[0];if(!file)return;
              try{
                setRejestr(wczytajEksport(JSON.parse(await file.text()),BAZA_SYMBOLI_SLD));
                setBladImportu(null);
              }catch(err){
                setBladImportu(err instanceof Error?err.message:'Nieprawidłowy plik');
              }
              e.target.value='';
            }}/>
        </label>
        {bladImportu && <span role="alert">{bladImportu}</span>}
      </div>
      <div className="qet-full-summary" data-testid="sld-library-coverage">
        <b>{level}: {stats.razem} pozycji katalogowych.</b>
        {' '}Geometria dostępna: {stats.geometriaIstnieje}.
        {' '}Brak źródłowego symbolu: {stats.brakZrodla}.
        {' '}Złożenia ENM do przygotowania: {stats.zlozenia}.
        {' '}Nie oznacza to zatwierdzenia IEC 60617.
      </div>
      <div className="qet-full-grid">
        {entries.map(entry=>{
          const geometry=entry.status==='QET_ZRODLOWY'||entry.status==='CAD_ISTNIEJACY';
          const approval=rejestr[entry.id];
          const current=approval?.decyzja??'NIEOCENIONY';
          return (
            <article key={entry.id} className="qet-full-card"
              data-library-id={entry.id} data-source-status={entry.status}
              data-decision={current}>
              <strong>{entry.id} · {entry.nazwa}</strong>
              <small>{entry.rodzina} · {entry.rodzaj==='ZLOZENIE'?'Złożenie ENM':'Symbol'}</small>
              {geometry?(
                <LibraryGlyph entry={entry} state={position} theme={theme}/>
              ):(
                <div className="qet-pending">
                  {entry.status==='ZLOZENIE_ENM'
                    ? 'DO ZŁOŻENIA Z ELEMENTÓW ENM'
                    : 'BRAK GEOMETRII ŹRÓDŁOWEJ'}
                </div>
              )}
              <small className="qet-full-source">
                {entry.status==='QET_ZRODLOWY'?'QElectroTech · CC BY 3.0 · źródło .elmt':
                  entry.status==='CAD_ISTNIEJACY'?'Kanoniczny rejestr CAD repozytorium':
                  entry.status==='ZLOZENIE_ENM'?'Brak gotowego złożenia ENM':
                  'Wymagane pozyskanie i weryfikacja źródła'}
              </small>
              {entry.czyLacznik&&geometry?
                <small>Stan demonstracyjny: {position}. Nie jest telemetrią.</small>:null}
              <div className="qet-review-select"
                role="group" aria-label={`Decyzja dla ${entry.id}`}>
                {([
                  ['AKCEPTUJE','Akceptuję'],
                  ['ODRZUCAM','Odrzucam'],
                  ['DO_POPRAWY','Do poprawy'],
                ] as const).map(([key,label])=>(
                  <label key={key}>
                    <input type="checkbox" checked={current===key}
                      aria-label={`${label}: ${entry.id}`}
                      onChange={e=>updateApproval(entry.id,
                        e.target.checked?key:'NIEOCENIONY',
                        approval?.uwagi??'')}/>
                    {label}
                  </label>
                ))}
              </div>
              <textarea className="qet-review-note"
                aria-label={`Uwagi do ${entry.id}`}
                placeholder="Uwagi do geometrii, normy, portów lub kompletności"
                value={approval?.uwagi??''}
                onChange={e=>updateApproval(entry.id,current,e.target.value)}/>
            </article>
          );
        })}
      </div>
      <p className="qet-full-summary">
        Puste karty są celowe: brak zweryfikowanego symbolu nie uprawnia do
        rysowania zastępczego znaku. Pola liniowe, pomiarowe, transformatorowe
        i całe rozdzielnice powstają z rzeczywistych aparatów oraz topologii ENM.
      </p>
    </div>
  );
}
