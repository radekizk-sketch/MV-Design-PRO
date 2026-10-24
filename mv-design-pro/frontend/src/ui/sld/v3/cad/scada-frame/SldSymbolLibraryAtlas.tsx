/**
 * Zakładka istniejącego atlasu QET — pełny inwentarz nN/SN do akceptacji.
 * Jeden renderer CadSymbol/CadPrimitiveLayer; nie generuje nowych glifów.
 *
 * Wpis bez źródła ma status BLOKADA, a pole SN/RGnN jest złożeniem ENM.
 * Ramkę czerwony/zielony rysuj WYŁĄCZNIE dla urządzeń z mechanicznym stykiem.
 */
import { useMemo, useState } from 'react';
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

const frame={x:8,y:7,width:84,height:100} as const;
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
  const stats=pokrycieBiblioteki(level);
  const entries=useMemo(()=>BAZA_SYMBOLI_SLD.filter(e=>{
    if(e.poziom!==level)return false;
    if(query&&!([e.id,e.nazwa,e.rodzina,e.uwagi].join(' ').toLocaleLowerCase('pl')
      .includes(query.toLocaleLowerCase('pl'))))return false;
    if(status==='Dostępna geometria')
      return e.status==='QET_ZRODLOWY'||e.status==='CAD_ISTNIEJACY';
    if(status==='Braki i złożenia')
      return e.status==='WYMAGA_ZRODLA'||e.status==='ZLOZENIE_ENM';
    return true;
  }),[level,query,status]);

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
          return (
            <article key={entry.id} className="qet-full-card"
              data-library-id={entry.id} data-source-status={entry.status}>
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
