/**
 * Drugi etap PR — weryfikacja przeciwko standardowi ENEA.
 * Poprzedni atlas: ODRZUCONY przez właściciela (1/10).
 * Ta strona to wizualna próba SZABLONÓW źródłowych, NIE certyfikacja IEC,
 * NIE kopia chronionych rysunków i NIE produkcyjny SLD/ENM.
 */
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {CadSymbol} from './ui/sld/v3/cad/CadSymbol';
import {ENEA_LV_PROFILES, type EneaLvPanelProfile} from './ui/sld/v3/cad/experimental/eneaLvProfiles';

const css=`
:root{font:14px/1.4 'Segoe UI',Arial,sans-serif}*{box-sizing:border-box}
body{margin:0} .page{min-height:100vh;background:var(--bg);color:var(--fg);padding:28px}
.page.light{--bg:#eef2f4;--fg:#152e40;--surface:#fff;--line:#b7cad3;--muted:#4e6674;--accent:#006b81}
.page.dark{--bg:#0c1822;--fg:#e8f1f5;--surface:#142630;--line:#486574;--muted:#bfd0d8;--accent:#50d1dd}
.head{max-width:1380px;margin:0 auto 20px}.eyebrow{font-size:12px;letter-spacing:.12em;color:var(--accent);font-weight:700}
h1{font-size:27px;line-height:1.2;margin:7px 0 12px}h2{font-size:17px;margin:0 0 10px}
p{margin:7px 0;color:var(--muted)}button{font:inherit;border:1px solid var(--line);background:var(--surface);color:var(--fg);padding:10px 14px;cursor:pointer;border-radius:5px}
button[aria-pressed=true]{border-color:var(--accent);box-shadow:inset 0 -2px var(--accent)}
.toolbar{display:flex;align-items:center;gap:9px;margin-top:17px;flex-wrap:wrap}.layout{max-width:1380px;margin:auto;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:15px}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:18px}
.viz{overflow-x:auto}.viz svg{width:100%;min-width:970px;height:auto;display:block}
aside table{border-collapse:collapse;width:100%;font-size:12px}td{vertical-align:top;border-bottom:1px solid var(--line);padding:9px 5px}
td:first-child{color:var(--muted);width:45%}.reject{border-left:4px solid #b84646;background:var(--surface);padding:14px 17px;margin:12px 0 18px;max-width:1380px}
.error{color:#c43d3d;font-weight:700}.notes{max-width:1380px;margin:16px auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.notes article{border:1px solid var(--line);background:var(--surface);padding:15px;border-radius:6px;font-size:12px}
a{color:var(--accent)}@media(max-width:1050px){.layout{display:block}.layout aside{margin-top:15px}.notes{grid-template-columns:1fr}}
@media print{.page{padding:4px;background:white!important;color:black!important}.toolbar{display:none}.layout{display:block}.notes{display:none}.viz svg{min-width:0}}
`;
function Schema({profile,dark}:{profile:EneaLvPanelProfile;dark:boolean}) {
 const ink=dark?'#d4e8ed':'#1b3440',paper=dark?'#142630':'white';
 const N=profile.outgoingPositions;const start=N===12?270:350;const pitch=N===12?83:151;const end=start+(N-1)*pitch;
 const line=(x1:number,y1:number,x2:number,y2:number,w=1.8)=><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink} strokeWidth={w} strokeLinecap="butt"/>;
 const Txt=({x,y,children,fs=13}:{x:number,y:number,children:string,fs?:number})=><text x={x} y={y} fontSize={fs} fill={ink}>{children}</text>;
 const cad=(id:'cad.transformator2u'|'cad.rozlacznik'|'cad.przekladnikPradowy'|'cad.rozlacznikBezpiecznikowy',x:number,y:number,scale=2.1)=>
   <CadSymbol id={id} x={x} y={y} ink={ink} paper={paper} scale={scale} strokePx={1.6} nonScalingStroke={true} state="closed"/>;
 return <svg viewBox="0 0 1320 650" aria-label={`Źródłowa projekcja rozdzielnicy nN ${profile.maxTransformerKva} kVA`}>
  <rect x={20} y={18} width={1280} height={612} rx="2" fill="none" stroke={ink} strokeWidth=".9"/>
  <Txt x={37} y={43} fs={19}>{`RG nN — profil stacji SN/nN do ${profile.maxTransformerKva} kVA`}</Txt>
  <Txt x={37} y={65} fs={12}>Schemat jednokreskowy, konstrukcja autorska na podstawie wymagań ENEA — nie kopia rysunku</Txt>
  <line x1={35} y1={79} x2={1283} y2={79} stroke={ink} strokeWidth=".8"/>
  {/* Od strony transformatora do wyłącznika głównego: nie wprowadzać fikcyjnego ACB */}
  <Txt x={43} y={105}>Przyłączenie SN/nn</Txt>
  {cad('cad.transformator2u',108,112)}
  {line(124,171,124,190)}
  <Txt x={145} y={180}>T1</Txt>
  <Txt x={145} y={196} fs={11}>SN / 0,4 kV</Txt>
  {cad('cad.rozlacznik',107,191)}
  <Txt x={145} y={223}>{`QS0 · rozłącznik izolacyjny 3P · ${profile.mainDeviceRatingA} A`}</Txt>
  {line(124,242,124,258)}
  {cad('cad.przekladnikPradowy',107,259)}
  <Txt x={145} y={273}>{`3 × CT 800:5 A, kl. ${profile.currentTransformerAccuracy}, 5 VA, FS5`}</Txt>
  <Txt x={145} y={292} fs={11}>Przekładniki za QS0, na szynach; połączenia do listwy kontrolno-pomiarowej i AMI</Txt>
  {line(124,309,124,336)}
  {line(124,336,end+31,336,3.5)}
  <Txt x={44} y={322} fs={11}>L1, L2, L3</Txt>
  <Txt x={470} y={315} fs={12}>{`Szyny Cu cyn. ${profile.busWidthMm}×10 mm (parametr fizyczny)`}</Txt>
  <Txt x={470} y={329} fs={10}>{`Iₙ szyn = ${profile.busRatedCurrentA} A · rozstaw faz 185 mm (montaż)`}</Txt>
  {/* Jeden znak odpływu reprezentuje złożenie trójfazowe w schemacie jednokreskowym */}
  {Array.from({length:N},(_,i)=>{
   const x=start+i*pitch;
   return <g key={i} data-outgoing-position={i+1}>
    {line(x,336,x,359)}
    {cad('cad.rozlacznikBezpiecznikowy',x-16,359,2.0)}
    {line(x,407,x,448)}
    <circle cx={x} cy={448} r={2} fill={ink}/>
    <text x={x} y={469} fontSize={11} textAnchor="middle" fill={ink}>{`F${i+1}`}</text>
    <text x={x} y={483} fontSize={10} textAnchor="middle" fill={ink}>3 × NH2</text>
    <text x={x} y={503} fontSize={10} textAnchor="middle" fill={ink}>{i===N-1?'rezerwa*':'odpływ'}</text>
   </g>
  })}
  <line x1={start-35} y1={548} x2={end+35} y2={548} stroke={ink} strokeWidth={3}/>
  <Txt x={55} y={551}>PEN — osobna szyna ochronno-neutralna</Txt>
  <Txt x={55} y={568} fs={11}>{`Cu cyn. ${profile.penBusWidthMm}×10 mm · zaciski V i punkt uziemienia według projektu`}</Txt>
  <line x1={start-35} y1={548} x2={start-35} y2={581} stroke={ink} strokeWidth={1.6}/>
  <line x1={start-47} y1={581} x2={start-23} y2={581} stroke={ink} strokeWidth={1.6}/>
  <line x1={start-42} y1={586} x2={start-28} y2={586} stroke={ink} strokeWidth={1.6}/>
  <line x1={start-38} y1={591} x2={start-32} y2={591} stroke={ink} strokeWidth={1.6}/>
  <Txt x={35} y={609} fs={11}>* Rezerwa to miejsce montażowe z osłoną szyn. Liczba obsadzonych pól zależy od ENM.</Txt>
 </svg>;
}
function App(){
 const [id,setId]=useState<EneaLvPanelProfile['id']>('ENEA_SN_NN_630_2025');
 const [dark,setDark]=useState(false);
 const profile=ENEA_LV_PROFILES.find(p=>p.id===id)!;
 return <div className={`page ${dark?'dark':'light'}`}><style>{css}</style>
  <div className="head"><div className="eyebrow">MV-DESIGN PRO / REWIZJA PO ODRZUCENIU 1/10 / ENEA</div>
   <h1>Weryfikacja źródłowa rozdzielnic nN</h1>
   <p>Weryfikowane profile standardowe, nie uniwersalny układ z arbitralnym ACB i sprzęgłem szyn.</p>
   <div className="toolbar">{ENEA_LV_PROFILES.map(p=><button key={p.id} aria-pressed={p.id===id} onClick={()=>setId(p.id)}>SN/nN do {p.maxTransformerKva} kVA · {p.outgoingPositions} pól</button>)}
    <button onClick={()=>setDark(!dark)}>Motyw: {dark?'ciemny':'jasny'}</button><button onClick={()=>window.print()}>Wydruk</button></div>
  </div>
  <div className="reject"><b>REWIZJA ROBINOCZA · NIE DO ZATWIERDZENIA.</b> Poprzedni atlas 1/10 został odrzucony. Ten rysunek służy kontroli topologii i przypisania symboli. Nie przedstawia schematu zweryfikowanego IEC ani kompletnej dokumentacji wykonawczej. B-02 odrzucone.</div>
  <div className="layout"><section className="panel viz"><Schema profile={profile} dark={dark}/></section>
   <aside className="panel"><h2>Dowód źródłowy</h2><table><tbody>
    <tr><td>Standard</td><td>{profile.documentTitle}</td></tr>
    <tr><td>Od</td><td>01.01.2025</td></tr>
    <tr><td>Łącznik główny</td><td>Rozłącznik izolacyjny {profile.mainDeviceRatingA} A · 3P</td></tr>
    <tr><td>Miejsca odpływowe</td><td>{profile.outgoingPositions} × listwowy rozłącznik bezpiecznikowy NH 2</td></tr>
    <tr><td>Szyny główne</td><td>Cu cyn. {profile.busWidthMm}×10 mm, Iₙ {profile.busRatedCurrentA} A</td></tr>
    <tr><td>Rozstaw faz</td><td>{profile.busPitchMm} mm — parametr montażowy, nie odległość pikseli w SLD</td></tr>
    <tr><td>Pomiary</td><td>3× CT {profile.currentTransformerRatio} A, kl. {profile.currentTransformerAccuracy}; za łącznikiem</td></tr>
    <tr><td>Przebieg PEN</td><td>Osobna szyna PEN, nie symbol uziemienia w miejscu przewodu N</td></tr>
    <tr><td>Kondensator</td><td>Tylko gdy wymagany; zabezpieczony rozłącznikiem bezpiecznikowym</td></tr>
   </tbody></table>
   <p><a href={profile.sourceUrl} target="_blank" rel="noreferrer">Oryginalny dokument ENEA</a></p>
   <p><b>{profile.sourceClause}</b></p>
   <p>W schemacie jednokreskowym „3 × NH2” reprezentuje trzy jednobiegunowo rozłączane fazy. Nie jest dowodem poprawności modelu wielobiegunowego — porty i sprzężenia wymagają dalszej pracy.</p>
   </aside></div>
  <div className="notes">
   <article><h2>Poziom I — symbol IEC</h2>Glif aparatu, jego funkcja, zaciski, geometria stanu. Identyfikacja i weryfikacja w IEC 60617 DB, której tu nie wykonano.</article>
   <article><h2>Poziom II — urządzenie ENEA</h2>Rozłącznik izolacyjny 1250/910 A, listwowy rozłącznik bezpiecznikowy wielkości 2, przekładnik prądowy, listwa kontrolno-pomiarowa, PEN.</article>
   <article><h2>Poziom III — układ i projekcja ENM</h2>Właściwa liczba pól, aparaty z danych, wydzielenie szyn, stany rzeczywiste, pełen tor SN→TR→nN; bez zmyślonego sprzęgła.</article>
  </div>
 </div>;
}
const root=document.getElementById('root');if(!root)throw new Error('Brak kontenera');
createRoot(root).render(<App/>);
