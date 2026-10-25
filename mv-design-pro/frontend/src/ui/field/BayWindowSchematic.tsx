/**
 * Schemat pola SN GPZ: projekcja ENM bez sztucznych ikon.
 *
 * CT — DWUPORTOWY ELEMENT TORU PIERWOTNEGO.
 * VT — ELEMENT ODGAŁĘZIENIA POMIAROWEGO; nigdy szeregowo z CT.
 * ES — UZIEMNIK, nie zamiennik odłącznika; bez portu połączenia z ENM
 *      przedstawiany jako nieprzyłączony, nigdy jako gotowy tor ochronny.
 *
 * Nie wydaje poleceń operacji; backend posiada właściwe reguły blokad.
 */
import { useMemo } from 'react';
import type { FieldReadModelItem } from './useFieldReadModel';
import { fieldRoleLabelPl } from '../sld/v2/station-rozdzielnia/contract';
import { deviceKindLabel } from './fieldLabels';
import { CadSymbol } from '../sld/v3/cad/CadSymbol';
import { ELECTRICAL_CAD_SYMBOL_REGISTRY } from '../sld/v3/cad/cadSymbolRegistry';
import {
  zlozPoleSn, jestLacznikiemSn, type ElementPolaSn,
} from './bayPrimaryComposition';

interface BayWindowSchematicProps {
  item: FieldReadModelItem;
}
const PAPER='#102533',INK='#e2eef7',BUS='#4acbe2';
const FRAME:Readonly<Record<'ZAMKNIETY'|'OTWARTY',string>>={
  ZAMKNIETY:'#F05260',OTWARTY:'#2CCF93',
};

function geometraCad(device:ElementPolaSn){
  if(!device.cadId)return null;
  const def=ELECTRICAL_CAD_SYMBOL_REGISTRY[device.cadId];
  const k=Math.min(device.width/def.nominalWidth,device.height/def.nominalHeight);
  const x=device.x+(device.width-def.nominalWidth*k)/2;
  const y=device.y+(device.height-def.nominalHeight*k)/2;
  const port=(name:'a'|'b')=>{
    const t=def.terminals.find(p=>p.name===name);
    return t?{x:x+t.x*k,y:y+t.y*k}:null;
  };
  return {x,y,k,a:port('a'),b:port('b')};
}
function AparatCad({element}: {element:ElementPolaSn}):JSX.Element{
  const g=geometraCad(element);
  const lacznik=jestLacznikiemSn(element.kind);
  const rysuj=!!g && (!lacznik||element.polozenie!==null);
  return (
    <g data-device-ref={element.ref} data-device-kind={element.kind}
       data-testid={`bay-device-${element.kind.toLowerCase()}`}
       data-tor={element.tor}
       data-position={element.polozenie??'BRAK_DANYCH'}>
      {lacznik&&element.polozenie&&(
        <rect x={element.x-7} y={element.y-6} rx={5}
          width={element.width+14} height={element.height+12}
          stroke={FRAME[element.polozenie]} strokeWidth={1.7}
          fill={FRAME[element.polozenie]} fillOpacity={0.07}
          data-cad-overlay="mechanical-position"/>
      )}
      {rysuj&&g&&element.cadId&&(
        <CadSymbol id={element.cadId}
          x={g.x} y={g.y} scale={g.k}
          state={element.polozenie==='OTWARTY'?'open':'closed'}
          ink={INK} paper={PAPER}
          strokePx={0.85} nonScalingStroke={false}
          testId={`bay-cad-${element.ref}`}/>
      )}
      {!rysuj&&(
        <text x={element.x-20} y={element.y+20}
          fontSize={10} fill="#f6bd75">Brak danych CAD/stanu</text>
      )}
      <text x={element.x+element.width+20}
        y={element.y+element.height/2+3}
        fontSize={10} fill="#bfd6e4">
        {element.designation}
      </text>
    </g>
  );
}
function Wires({items,busY,x,direction,height}:{
  items:readonly ElementPolaSn[];
  busY:number;x:number;height:number;
  direction:'OD_SZYN'|'DO_SZYN';
}):JSX.Element {
  const ports=items.map(d=>({
    d,g:geometraCad(d),
    valid:!!d.cadId&&(!jestLacznikiemSn(d.kind)||d.polozenie!==null),
  }));
  const lines:JSX.Element[]=[];
  const join=(key:string,a:number,b:number)=>{
    if(Math.abs(a-b)>0.01)lines.push(
      <line key={key} x1={x} x2={x} y1={a} y2={b}
        stroke={INK} strokeWidth={1.75} data-primary-wire="true"/>
    );
  };
  const first=ports[0];
  if(first?.valid){
    const t=direction==='OD_SZYN'?first.g?.a:first.g?.b;
    if(t)join('bus',busY,t.y);
  }
  for(let i=0;i<ports.length-1;i++){
    const a=ports[i],b=ports[i+1];
    if(!a.valid||!b.valid)continue;
    const from=direction==='OD_SZYN'?a.g?.b:a.g?.a;
    const to=direction==='OD_SZYN'?b.g?.a:b.g?.b;
    if(from&&to)join(`seg-${i}`,from.y,to.y);
  }
  const last=ports[ports.length-1];
  if(last?.valid){
    const t=direction==='OD_SZYN'?last.g?.b:last.g?.a;
    if(t)join('end',t.y,direction==='OD_SZYN'?height-24:24);
  }
  return <g data-testid="bay-primary-wires">{lines}</g>;
}
export function BayWindowSchematic({item}:BayWindowSchematicProps):JSX.Element{
  const source=item.canonical_model.base_model;
  const plan=useMemo(()=>zlozPoleSn(source),[source]);
  return (
    <section aria-label="Schemat kanoniczny pola SN"
      className="mx-4 mb-4 rounded-lg border border-slate-200 bg-white p-3 text-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
            Schemat kanoniczny · ENM
          </h4>
          <p className="mt-1 text-xs text-slate-600">{item.bay_name}</p>
        </div>
        <span className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600">
          {fieldRoleLabelPl(source.bay_role)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg data-testid="bay-svg-renderer"
          viewBox={`0 0 ${plan.width} ${plan.height}`}
          style={{width:'100%',minWidth:340,maxHeight:900}}
          role="img" aria-label={`Schemat pola ${item.bay_name}`}>
          <rect x={1} y={1} width={plan.width-2} height={plan.height-2}
            rx={6} fill={PAPER} stroke="#385468"/>
          <line x1={45} x2={225} y1={plan.busY} y2={plan.busY}
            stroke={BUS} strokeWidth={3} data-testid="bay-busbar"/>
          <Wires items={plan.primary} busY={plan.busY} x={plan.fieldX}
            height={plan.height} direction={plan.direction}/>
          {plan.primary.map(d=><AparatCad key={d.ref} element={d}/>)}
          {plan.lateral.length>0&&(
            <g data-testid="bay-side-devices">
              <text x={256} y={38} fontSize={10} fill="#9cc5d7">
                Odgałęzienia
              </text>
              {plan.lateral.map(d=><AparatCad key={d.ref} element={d}/>)}
            </g>
          )}
          {plan.primary.length===0&&(
            <text x={plan.fieldX} y={plan.height/2}
              fill="#f6bd75" textAnchor="middle" fontSize={12}>
              Nie zdefiniowano toru
            </text>
          )}
        </svg>
      </div>
      {plan.issues.length>0&&(
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950"
          data-testid="bay-readiness-gaps" role="status">
          <strong>Niekompletne dane aparatury i połączeń — odbiór wstrzymany</strong>
          <ul className="mt-1 list-inside list-disc">
            {plan.issues.map((p,i)=>(
              <li key={`${p.kod}-${p.ref}-${i}`}>{p.ref}: {p.opis}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        Podgląd z istniejącego ENM. Brak portu odgałęzienia nie uprawnia
        do narysowania fikcyjnego połączenia. Kolor ramki oznacza wyłącznie
        położenie mechaniczne aparatu. Brak poleceń do rzeczywistego GPZ.
      </p>
    </section>
  );
}
