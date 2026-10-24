/**
 * Ekran właścicielski QET-SCADA Frame 1.0.
 * Wykorzystuje zaakceptowane siedem oryginalnych geometrii QET.
 * Kolorowa ramka jest niezależna od symbolu CAD i wyniku z solvera.
 * Przełączenia: WYŁĄCZNIE stan lokalnej demonstracji, bez połączeń z SCADA.
 */
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CadPrimitiveLayer } from './ui/sld/v3/cad/CadSymbol';
import { fitQetSymbol } from './ui/sld/v3/cad/scada-frame/qetSymbolBounds';
import { SldSymbolLibraryAtlas } from './ui/sld/v3/cad/scada-frame/SldSymbolLibraryAtlas';
import type { CadPrimitive } from './ui/sld/v3/cad/cadSymbolRegistry';
import { QetScadaFrame } from './ui/sld/v3/cad/scada-frame/QetScadaFrame';
import {
  ocenStanRamki,
  type JakoscDanych,
  type PolozenieMechaniczne,
  type ScadaFrameInput,
  type StanEksploatacyjny,
} from './ui/sld/v3/cad/scada-frame/scadaFrameState';
import {
  QET_PILOT_SYMBOLS,
  type QetPilotSymbol,
} from './ui/sld/v3/cad/scada-frame/qetPilotSourceGeometry';

type LocalState = {
  readonly polozenie: PolozenieMechaniczne | null;
  readonly jakosc: JakoscDanych;
  readonly eksploatacja: StanEksploatacyjny;
  readonly przepalony: boolean;
};

const wersja = { scenarioId: 'DEMO-POGLADOWE', enmVersion: 'DEMO',
  topologyHash: 'POKAZOWE', resultSnapshotId: null, resultTopologyHash: null,
  resultEnmVersion: null, resultScenarioId: null } as const;

const start: Readonly<Record<string, LocalState>> = Object.fromEntries(
  QET_PILOT_SYMBOLS.map((s,i) => [
    s.id,
    { polozenie: (i === 0 || i === 3 || i === 5) ? 'ZAMKNIETY' : 'OTWARTY',
      jakosc:'PRAWIDLOWE', eksploatacja:'NORMALNY', przepalony:false },
  ]),
);

const style = `
*{box-sizing:border-box}html{font-family:Inter,'Segoe UI',Arial,sans-serif}
body{margin:0}
.root{--bg:#0b1824;--panel:#102939;--panel2:#0e2332;--fg:#dfedf5;--muted:#92acba;--line:#294657;--accent:#4bd0ec;background:var(--bg);color:var(--fg);min-height:100vh}
.root.light{--bg:#eff5f7;--panel:#fff;--panel2:#f5f9fa;--fg:#162e3b;--muted:#617987;--line:#c5d4da;--accent:#007fa8}
header{padding:22px 30px;border-bottom:1px solid var(--line);background:var(--panel)}
h1{font-size:25px;margin:5px 0;letter-spacing:-.03em}
small{font-size:11px;color:var(--muted)}
.eyebrow{font-weight:800;letter-spacing:.13em;font-size:11px;color:var(--accent)}
.intro{font-size:12px;line-height:1.6;color:var(--muted);max-width:1150px}
main{padding:24px;max-width:1600px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px}
main.main-catalog{display:block}
section,aside{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:17px}
.notice{border-left:3px solid #f8ae42;padding:12px;background:var(--panel2);color:var(--muted);font-size:12px;line-height:1.55;margin:10px 0 16px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(155px,1fr));gap:12px}
.card{display:block;width:100%;height:290px;border:1px solid var(--line);border-radius:7px;background:var(--panel2);padding:12px;color:inherit;cursor:pointer;text-align:left}
.card[aria-pressed=true]{border:2px solid var(--accent)}
.card strong{font-size:12px}.card small{display:block}
.card svg{width:100%;height:196px;overflow:visible;display:block;margin:auto}
h2{font-size:19px;margin:7px 0}
button,input,select{font:inherit}
button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.action{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:5px;padding:10px;margin:4px 0;color:var(--fg);text-align:left;cursor:pointer;font-size:13px}
.action:hover{border-color:var(--accent)}.action:disabled{opacity:.4;cursor:not-allowed}
.choose{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:5px;color:var(--fg);padding:9px;margin-top:6px}
label{display:block;font-size:12px;font-weight:650;margin-top:16px}
hr{border:0;border-top:1px solid var(--line);margin:17px 0}
.stat{display:grid;grid-template-columns:90px 1fr;gap:9px;padding:10px 0;border-bottom:1px solid var(--line);font-size:11px}
.stat span{color:var(--muted)}
.caption{color:var(--muted);font-size:10px;line-height:1.6}
.toolbar{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.toolbar button{border:1px solid var(--line);background:var(--panel2);color:var(--fg);border-radius:5px;padding:9px 12px;cursor:pointer}
.legend{margin-top:17px;color:var(--muted);display:flex;gap:15px;flex-wrap:wrap;font-size:11px}
.swatch{display:inline-block;width:12px;height:12px;border:2px solid;vertical-align:middle;border-radius:2px;margin-right:5px}
@media(max-width:1030px){main{grid-template-columns:1fr}.grid{grid-template-columns:repeat(3,minmax(155px,1fr))}}
@media(max-width:660px){main{padding:10px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.card{height:280px;padding:7px}}
`;

function itemInput(symbol: QetPilotSymbol, local: LocalState): ScadaFrameInput {
  return {
    elementRef: symbol.id,
    rodzaj: symbol.rodzaj,
    polozenie: local.polozenie,
    eksploatacja: local.eksploatacja,
    jakosc: local.jakosc,
    zrodlo: 'SYMULACJA',
    zasilenie: 'NIEUSTALONY',
    wkladka: symbol.rodzaj === 'BEZPIECZNIK'
      ? (local.przepalony ? 'PRZEPALONA' : 'SPRAWNA') : undefined,
    wersjaStanu: wersja,
    wersjaWidoku: wersja,
  };
}

function geometria(symbol: QetPilotSymbol, stan: 'open'|'closed'|null): readonly CadPrimitive[] {
  if (symbol.rodzaj === 'BEZPIECZNIK') return symbol.open;
  if (stan === 'closed') return symbol.closed;
  if (stan === 'open') return symbol.open;
  // BŁĄD WALIDACJI: nie podpowiadaj położenia; wariant nie istnieje.
  return [];
}

function Glyph({symbol, local, theme}:{symbol:QetPilotSymbol;local:LocalState;theme:'light'|'dark'}) {
  const input=itemInput(symbol,local);
  const r=ocenStanRamki(input);
  const ink=theme==='dark'?'#dfedf5':'#1b3545';
  const paper=theme==='dark'?'#0e2332':'#f5f9fa';
  const frame={x:8,y:7,width:84,height:100} as const;
  const fit=fitQetSymbol(symbol,frame,12);
  return (
    <svg viewBox="0 0 100 114" role="img"
      data-qet-bounds-version="union-ports-both-positions"
      aria-label={symbol.namePl+', '+r.etykieta}>
      <QetScadaFrame input={input}
        x={frame.x} y={frame.y}
        width={frame.width} height={frame.height}
        showStateLabel={false}>
        <g transform={`translate(${fit.offsetX} ${fit.offsetY}) scale(${fit.scale})`}
          data-qet-centered="true">
          <CadPrimitiveLayer primitives={geometria(symbol,r.stanGeometryczny)}
            ink={ink} paper={paper} strokePx={0.85} nonScalingStroke={false}/>
          {r.poprawnyDlaTopologii && symbol.ports.map((p,i)=>
            <circle key={i} cx={p.x} cy={p.y} r={1.3}
              fill={paper} stroke={theme==='dark'?'#4bd0ec':'#007fa8'}
              strokeWidth={0.5}/>)}
        </g>
      </QetScadaFrame>
    </svg>
  );
}

function App(){
  const [theme,setTheme]=useState<'light'|'dark'>('dark');
  const [tab,setTab]=useState<'qet'|'full'>('qet');
  const [active,setActive]=useState('breaker');
  const [values,setValues]=useState<Readonly<Record<string,LocalState>>>(start);
  const curr=QET_PILOT_SYMBOLS.find(s=>s.id===active)!;
  const input=itemInput(curr,values[active]);
  const state=ocenStanRamki(input);
  const selected=values[active];
  const change=(next: Partial<LocalState>)=>setValues(old=>({
    ...old,[active]:{...old[active],...next},
  }));
  const all=useMemo(()=>QET_PILOT_SYMBOLS,[ ]);
  return <div className={'root '+theme}><style>{style}</style>
    <header>
      <div className="eyebrow">MV-DESIGN PRO / QElectroTech / QET-SCADA Frame 1.0</div>
      <h1>Dynamiczna biblioteka symboli nN</h1>
      <p className="intro">Rzeczywiste geometrie QET, tylko dwa położenia: ZAMKNIĘTY (czerwona ramka) i OTWARTY (zielona).
        Alarmy i blokady wyłącznie w inspektorze. Przełączanie jest lokalną demonstracją — bez sterowania SCADA, zmian ENM i wyników solvera.</p>
      <div className="toolbar">
        <button aria-pressed={tab==='qet'} onClick={()=>setTab('qet')}>Źródłowe QET (7)</button>
        <button aria-pressed={tab==='full'} onClick={()=>setTab('full')}>Katalog nN / SN</button>
        <button onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}>Motyw: {theme==='dark'?'ciemny':'jasny'}</button>
        <button onClick={()=>{setValues(start);setActive('breaker');}}>Przywróć przykład</button>
      </div>
    </header>
    <main className={tab==='full'?'main-catalog':''}>
      <section>
        <div className="eyebrow">ATLAS DO ODBIORU / PR #499 / 7 SYMBOLI QET</div>
        <p className="notice"><b>Wersja do oceny właścicielskiej.</b> Źródła QET dla położenia OTWARTY są zaakceptowane wizualnie.
          Warianty ZAMKNIĘTY nadal wymagają osobnej kontroli geometrii; brak zatwierdzenia normowego IEC.
          B-02 pozostaje odrzucone.</p>
        {tab==='qet' ? (<>
        <div className="grid">
          {all.map(s=>{
            const local=values[s.id];
            const status=ocenStanRamki(itemInput(s,local));
            return <button key={s.id} type="button" className="card"
              aria-pressed={active===s.id}
              onClick={()=>setActive(s.id)} data-qet-review-id={s.id}>
              <strong>{s.namePl}</strong><small>{s.id} · QElectroTech</small>
              <Glyph symbol={s} local={local} theme={theme}/>
              <small style={{textAlign:'center'}}>{status.etykieta} / SYMULACJA</small>
            </button>;
          })}
        </div>
        <div className="legend">
          <span><i className="swatch" style={{borderColor:'#F05260'}}/>Zamknięty</span>
          <span><i className="swatch" style={{borderColor:'#2CCF93'}}/>Otwarty</span>

        </div>
        <p className="caption">Ramki nie kodują napięcia, przepływu prądu ani wyników rozpływu.
          Błąd walidacji nie otrzymuje trzeciej ramki ani fikcyjnego symbolu. Położenie OTWARTY ≠ brak napięcia.
          Stan wyników: NIEOBLICZONE.</p>
        </>) : <SldSymbolLibraryAtlas theme={theme}/>}
      </section>
      {tab==='qet' && <aside>
        <div className="eyebrow">INSPEKTOR APARATU</div><h2>{curr.namePl}</h2>
        <div className="stat"><span>Identyfikator</span><b>{curr.id}</b></div>
        <div className="stat"><span>Położenie</span><b>{state.etykieta}</b></div>
        <div className="stat"><span>Źródło</span><b>SYMULACJA</b></div>
        <div className="stat"><span>Jakość</span><b>{selected.jakosc}</b></div>
        <div className="stat"><span>Wyniki</span><b>NIEOBLICZONE</b></div>
        <div className="stat"><span>Blokada</span><b>{state.blokada?'TAK':'NIE'}</b></div>
        <div className="stat"><span>Eksploatacja</span><b>{selected.eksploatacja}</b></div>
        {!state.poprawnyDlaTopologii && curr.rodzaj==='LACZNIK' &&
          <div className="notice" role="alert">
            <b>Błąd walidacji aparatu.</b>
            {state.komunikaty.filter(x=>!x.startsWith('Wyniki obliczeniowe')).map(x=>
              <p key={x}>{x}</p>)}
            <p>Obliczenia wymagające jednoznacznej topologii są zablokowane.</p>
          </div>}
        <hr/>
        <label htmlFor="qet-quality">Jakość danych</label>
        <select id="qet-quality" className="choose" value={selected.jakosc}
          onChange={e=>change({jakosc:e.target.value as JakoscDanych})}>
          <option value="PRAWIDLOWE">Prawidłowe</option>
          <option value="PRZESTARZALE">Przestarzałe</option>
          <option value="NIEWIARYGODNE">Niewiarygodne</option>
          <option value="BRAK">Brak danych</option>
        </select>
        <label>Operacje wyłącznie demonstracyjne</label>
        <button className="action" disabled={curr.rodzaj!=='LACZNIK'}
          onClick={()=>change({polozenie:'OTWARTY'})}>Otwórz w symulacji</button>
        <button className="action" disabled={curr.rodzaj!=='LACZNIK'}
          onClick={()=>change({polozenie:'ZAMKNIETY',eksploatacja:'NORMALNY'})}>Zamknij w symulacji</button>
        <button className="action" onClick={()=>{
          if(curr.rodzaj==='BEZPIECZNIK') change({przepalony:!selected.przepalony});
          else change({polozenie:'OTWARTY',
            eksploatacja:selected.eksploatacja==='WYZWOLONY'?'NORMALNY':'WYZWOLONY'});
        }}>Zmień status wyzwolenia / wkładki</button>
        <button className="action" disabled={curr.rodzaj!=='LACZNIK'}
          onClick={()=>change({eksploatacja:selected.eksploatacja==='ZABLOKOWANY'?'NORMALNY':'ZABLOKOWANY'})}>
          Zmień blokadę</button>
        <hr/>
        <p className="caption">Bez podłączenia ENM i solvera. Bramka K-S2 pozostaje obowiązująca.
          Nie są wykonywane żadne rzeczywiste operacje łączeniowe.</p>
      </aside>}
    </main>
  </div>;
}

const root=document.getElementById('root');
if(!root)throw new Error('Brak korzenia QET SCADA');
createRoot(root).render(<App/>);
