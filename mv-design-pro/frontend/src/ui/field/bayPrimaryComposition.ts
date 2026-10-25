/**
 * GPZ SN — projekcja wyłącznie DO ODCZYTU istniejącego BayBaseModel.
 *
 * Wydzielenie toru pierwotnego, odgałęzień i funkcji sterowniczych:
 *  - CT leży w torze pierwotnym (dwa zaciski);
 *  - VT NIGDY nie jest wstawiany szeregowo w tor prądowy;
 *  - ES nigdy nie zastępuje DS i wymaga odgałęzienia do ziemi;
 *  - żadne połączenie gałęzi bocznej NIE powstaje z samego "linked_ref"
 *    (linked_ref może oznaczać także powiązanie pomiarowe);
 *  - kolejność i rodzaj urządzeń pochodzą z ENM, bez sortowania lub dorabiania
 *    brakujących urządzeń według domyślnego szablonu.
 *
 * To walidator prezentacji, nie silnik blokad; backend/interlock_rules.py
 * jest jedyną prawdą dla operacji, ten plik nie wydaje poleceń.
 */
import type {
  BayBaseModel, BayPrimaryDevice, BayPrimaryDeviceKind, BayDeviceState,
} from '../../types/enm';
import type { CadSymbolId } from '../sld/v3/cad/cadSymbolRegistry';

export type PozycjaSn = 'ZAMKNIETY'|'OTWARTY'|null;
export type TorPolaSn = 'PIERWOTNY'|'ODG_UZIEMIENIA'|'ODG_POMIARU'|'POZA_TOREM';
export interface ElementPolaSn {
  readonly ref:string;
  readonly kind:BayPrimaryDeviceKind;
  readonly cadId:CadSymbolId|null;
  readonly tor:TorPolaSn;
  readonly polozenie:PozycjaSn;
  readonly designation:string;
  readonly x:number;
  readonly y:number;
  readonly width:number;
  readonly height:number;
  readonly podlaczeniePotwierdzone:boolean;
}
export interface ProblemPolaSn {
  readonly kod:string;
  readonly ref:string;
  readonly opis:string;
  readonly blokujeOdbior:boolean;
}
export interface ProjekcjaPolaSn {
  readonly bayRef:string;
  readonly direction:'OD_SZYN'|'DO_SZYN';
  readonly role:BayBaseModel['bay_role'];
  readonly width:number;
  readonly height:number;
  readonly busY:number;
  readonly fieldX:number;
  readonly primary:readonly ElementPolaSn[];
  readonly lateral:readonly ElementPolaSn[];
  readonly issues:readonly ProblemPolaSn[];
  readonly kompletna:boolean;
}

/** Nie zgaduj stanu: awaria/nieznany/brak rekordu to błąd danych. */
export function stanEnmDoRamki(state:BayDeviceState|null|undefined):PozycjaSn {
  if(state==='zamkniety'||state==='zamkniety_naped_rozbrojony')return 'ZAMKNIETY';
  if(state==='otwarty'||state==='otwarty_naped_rozbrojony')return 'OTWARTY';
  return null;
}
export function jestLacznikiemSn(kind:BayPrimaryDeviceKind):boolean {
  return kind==='CB'||kind==='DS'||kind==='ES'||kind==='LOAD_SWITCH';
}
const MAP: Partial<Record<BayPrimaryDeviceKind,CadSymbolId>>={
  CB:'cad.wylacznik',DS:'cad.odlacznik',
  LOAD_SWITCH:'cad.rozlacznik',ES:'cad.uziemnik',
  CT:'cad.przekladnikPradowy',VT:'cad.przekladnikNapieciowy',
  FUSE:'cad.bezpiecznik',TRANSFORMER_DEVICE:'cad.transformator2u',
  PCS:'cad.przeksztaltnik',GENERATOR_PV:'cad.zrodloPvZPrzeksztaltnikiem',
  GENERATOR_BESS:'cad.magazynZPrzeksztaltnikiem',
  GENERATOR_FW:'cad.generator',
};
/**
 * Nie wszystkie rodzaje mają poprawny glif (np. głowica SN), więc nie rysuj
 * "zamiennika" jako symbolu pomiarowego lub pustego koła.
 */
export function rodzinaCadDlaAparatu(kind:BayPrimaryDeviceKind):CadSymbolId|null{
  return MAP[kind]??null;
}
export function torFunkcjonalny(device:BayPrimaryDevice):TorPolaSn{
  if(device.kind==='ES')return 'ODG_UZIEMIENIA';
  if(device.kind==='VT')return 'ODG_POMIARU';
  if(device.placement==='GROUND_BRANCH')return 'ODG_UZIEMIENIA';
  if(device.placement==='OFF_PATH')return 'POZA_TOREM';
  return 'PIERWOTNY';
}

const X_MAIN=114,X_LATERAL=264,TOP=75,SLOT=88,GLYPH_W=32,GLYPH_H=48;
export function zlozPoleSn(model:BayBaseModel):ProjekcjaPolaSn {
  const issues:ProblemPolaSn[]=[];
  const input=model.primary_devices??[];
  const refs=new Set<string>();
  const prim:BayPrimaryDevice[]=[];
  const lateral:BayPrimaryDevice[]=[];
  for(const device of input) {
    if(refs.has(device.device_ref)){
      issues.push({kod:'DUPLIKAT_REF',ref:device.device_ref,
        opis:'Powtórzona referencja aparatu w ENM.',blokujeOdbior:true});
    }
    refs.add(device.device_ref);
    const tor=torFunkcjonalny(device);
    (tor==='PIERWOTNY'?prim:lateral).push(device);
    if(!rodzinaCadDlaAparatu(device.kind)){
      issues.push({kod:'BRAK_SYMBOLU_CAD',ref:device.device_ref,
        opis:`Brak zatwierdzonego odwzorowania CAD dla ${device.kind}; nie zastępuj inną ikoną.`,
        blokujeOdbior:true});
    }
    if(device.kind==='ES'&&device.placement!=='GROUND_BRANCH'){
      issues.push({kod:'ES_POZA_ODGALEZIENIEM',ref:device.device_ref,
        opis:'Uziemnik wymaga deklaracji odgałęzienia do ziemi.',blokujeOdbior:true});
    }
    if(device.kind==='VT'&&device.placement!=='OFF_PATH'){
      issues.push({kod:'VT_NIE_ODGALEZIENIE',ref:device.device_ref,
        opis:'VT wymaga jawnego odgałęzienia pomiarowego; nie umieszczaj na torze głównym.',
        blokujeOdbior:true});
    }
    if(jestLacznikiemSn(device.kind)&&!stanEnmDoRamki(device.switch_state?.actual_state)){
      issues.push({kod:'NIEOKRESLONY_STAN_LACZNIKA',ref:device.device_ref,
        opis:'Brak jednoznacznego położenia aparatu w danych ENM.',blokujeOdbior:true});
    }
  }
  if(!prim.length)issues.push({kod:'BRAK_TORU',ref:model.bay_ref,
    opis:'Brak zadeklarowanych urządzeń toru pierwotnego.',blokujeOdbior:true});
  // BayBaseModel.primary_devices dostarcza sekwencję i funkcje, ale nie
  // dostarcza kompletu rzeczywistych węzłów zaciskowych. Przewody widoku są
  // szkicem kompozycyjnym, nie DOWODEM ciągłości ENM ani gotowości LF/SC.
  if(prim.length>0)issues.push({kod:'PORTY_PIERWOTNE_NIEPOTWIERDZONE',
    ref:model.bay_ref,
    opis:'Odczyt pola nie zawiera pełnego grafu portów pierwotnych. Sekwencja aparatów wymaga weryfikacji z kanoniczną topologią ENM.',
    blokujeOdbior:true});

  // Kolejność w input jest JEDYNĄ kolejnością aparatu; nie zamieniamy jej
  // heurystyką wizualną, bo groziłoby to podmianą CT/wyłącznik/odłącznik.
  const busFromTop=model.bay_role!=='TRANSFORMATOROWE';
  const height=Math.max(295,175+Math.max(prim.length,lateral.length)*SLOT);
  const busY=busFromTop?42:height-42;

  // Sprzęgło dwucelkowe musi posiadać jawne dane sekcji / celi w ENM.
  // Nie renderujemy sztucznego "sprzęgła" z dwóch domyślnych pól.
  if(model.bay_role==='SPRZEGLO'&&(!model.gpz_section_id ||
     !input.some(d=>d.section_side==='LEFT')||
     !input.some(d=>d.section_side==='RIGHT'))){
     issues.push({kod:'SPRZEGLO_NIEPELNE',ref:model.bay_ref,
       opis:'Nie określono obu stron sprzęgła (LEFT/RIGHT) i sekcji SN w ENM.',
       blokujeOdbior:true});
  }
  const place=(d:BayPrimaryDevice,i:number,side:boolean):ElementPolaSn=>({
    ref:d.device_ref,kind:d.kind,cadId:rodzinaCadDlaAparatu(d.kind),
    tor:torFunkcjonalny(d),
    polozenie:jestLacznikiemSn(d.kind)?stanEnmDoRamki(d.switch_state?.actual_state):null,
    designation:d.designation??d.device_ref,
    x:side?X_LATERAL:X_MAIN,
    y:busFromTop?TOP+i*SLOT:height-TOP-GLYPH_H-i*SLOT,
    width:GLYPH_W,height:GLYPH_H,
    // Niezależnie od linked_ref źródło nie ma portu konkretnego odgałęzienia.
    // Wyłącznie tor pierwotny jest schematycznym uporządkowanym stosem.
    podlaczeniePotwierdzone:!side,
  });
  const primary=prim.map((d,i)=>place(d,i,false));
  const branches=lateral.map((d,i)=>place(d,i,true));
  for(const branch of branches){
    issues.push({kod:'BRAK_PORTU_ODGALEZIENIA',ref:branch.ref,
      opis:'Brak jawnego portu połączenia odgałęzienia w odczycie pola ENM. Nie rysować pozornej ciągłości.',
      blokujeOdbior:true});
  }
  return {bayRef:model.bay_ref,direction:busFromTop?'OD_SZYN':'DO_SZYN',
    role:model.bay_role,width:390,height,busY,fieldX:X_MAIN+GLYPH_W/2,
    primary,lateral:branches,issues,
    kompletna:issues.every(i=>!i.blokujeOdbior)};
}
