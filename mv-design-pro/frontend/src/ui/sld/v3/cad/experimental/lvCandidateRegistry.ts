/**
 * P0 / REWIZJA WŁAŚCICIELSKA — kandydaci nN. NIE PODŁĄCZAĆ DO PRODUKCJI.
 * Istniejące 20 geometrii pozostają w ../cadSymbolRegistry.ts;
 * nie duplikować semantyki urządzeń ACB/MCCB (ten sam znak funkcji wyłącznika).
 *
 * Przyjęto tę samą siatkę i prymitywy co CadSymbol. Status każdego nowego
 * symbolu: DRAFT. Weryfikacja normatywna dopiero po licencjonowanym
 * porównaniu z bazą IEC 60617 DB i zatwierdzeniu przez właściciela.
 */
import type { CadPrimitive, CadSwitchState, CadSymbolId } from '../cadSymbolRegistry';
import type { SymbolPort } from '../../core/grid';

export type CandidateLvId =
  | 'nn.wylacznikPowietrzny' | 'nn.wylacznikKompaktowy'
  | 'nn.wylacznikRóżnicowoNadpradowy' | 'nn.ogranicznikPrzepiec'
  | 'nn.cewkaStycznika' | 'nn.stykZwierny' | 'nn.stykRozwierny'
  | 'nn.stykPrzelaczny' | 'nn.licznikEnergii' | 'nn.amperomierz'
  | 'nn.woltomierz' | 'nn.kondensator' | 'nn.silnik3F'
  | 'nn.listwaZaciskowa';

export interface LvCandidate {
  readonly id: CandidateLvId;
  readonly namePl: string;
  readonly classCode: string;
  readonly modelBinding: string;
  readonly normativeStatus: 'DRAFT';
  readonly baseSymbol?: CadSymbolId;
  readonly width: number;
  readonly height: number;
  readonly ports: readonly SymbolPort[];
  readonly body: readonly CadPrimitive[];
  readonly states?: Readonly<Record<CadSwitchState, readonly CadPrimitive[]>>;
  readonly reviewerNote: string;
}

/** Gdy dany aparat pełni tę samą funkcję IEC, jego wykonanie katalogowe nie
 * powinno wymuszać alternatywnego symbolu normowego. */
const TERM_2: readonly SymbolPort[] = [
  { name: 'a', x: 8, y: 0, dir: 'N' },
  { name: 'b', x: 8, y: 24, dir: 'S' },
];
const L = (x1: number,y1: number,x2: number,y2: number): CadPrimitive =>
  ({k:'line',x1,y1,x2,y2});
const C = (cx: number,cy: number,r: number): CadPrimitive =>
  ({k:'circle',cx,cy,r,fill:'none'});
const P = (d: string): CadPrimitive => ({k:'path',d,fill:'none'});
const T = (x: number,y: number,t: string,size=4): CadPrimitive => ({k:'letter',x,y,t,size});
const BASE = [L(8,0,8,4),L(8,20,8,24)];
const CANDIDATE_STATUS = 'DRAFT' as const;
const KNIFE = (deg:number): CadPrimitive => ({k:'pivot',cx:8,cy:16,deg,prims:[{k:'line',x1:8,y1:16,x2:8,y2:5,nozStanu:true}]});
const styk=(normallyClosed:boolean): Readonly<Record<CadSwitchState,readonly CadPrimitive[]>> => ({
  closed:[KNIFE(0),...(normallyClosed?[L(4,7,12,11)]:[])],
  open:[KNIFE(-30),...(normallyClosed?[L(4,7,12,11)]:[])],
  unknown:[KNIFE(-15),...(normallyClosed?[L(4,7,12,11)]:[])],
});
const ZD=TERM_2;
const make=(id:CandidateLvId,namePl:string,classCode:string,modelBinding:string,
 body: readonly CadPrimitive[], options: {
  baseSymbol?:CadSymbolId; ports?:readonly SymbolPort[];
  states?:Readonly<Record<CadSwitchState,readonly CadPrimitive[]>>;
  reviewerNote:string;
 }): LvCandidate => ({
 id,namePl,classCode,modelBinding,normativeStatus:CANDIDATE_STATUS,
 width:16,height:24,ports:options.ports??ZD,body,
 ...(options.baseSymbol?{baseSymbol:options.baseSymbol}:{}),
 ...(options.states?{states:options.states}:{}),
 reviewerNote:options.reviewerNote,
});
export const LV_CANDIDATE_SYMBOLS: readonly LvCandidate[] = [
  make('nn.wylacznikPowietrzny','Wyłącznik powietrzny (ACB)','QF','APARAT_NN / ACB',[],{
    baseSymbol:'cad.wylacznik',
    reviewerNote:'Funkcja wyłącznika; ACB to wykonanie, oznaczenie i nastawy w modelu aparatu.'
  }),
  make('nn.wylacznikKompaktowy','Wyłącznik kompaktowy (MCCB)','QF','APARAT_NN / MCCB',[],{
    baseSymbol:'cad.wylacznik',
    reviewerNote:'Ten sam znak normowy funkcji wyłącznika co ACB; różnica w parametrach katalogu.'
  }),
  make('nn.wylacznikRóżnicowoNadpradowy','Wyłącznik różnicowonadprądowy (RCBO)','QF','APARAT_NN_RCBO',
    [L(8,0,8,6),L(8,19,8,24),P('M 4 17 q 4 -5 8 0 q -4 4 -8 0'),L(12,17,14,11)],{
      baseSymbol:'cad.wylacznikRoznicowopradowy',
      reviewerNote:'Złożenie funkcji RCD i zabezpieczenia nadprądowego; projekt symbolu szczegółowego wymaga potwierdzenia IEC.'
    }),
  make('nn.ogranicznikPrzepiec','Ogranicznik przepięć (SPD)','FV','APARAT_NN_SPD',
    [L(8,0,8,4),P('M 3 4 H 13 V 17 H 3 Z'),P('M 10 6 L 6 10 H 10 L 6 15'),L(8,17,8,20),
     L(4,20,12,20),L(5,22,11,22),L(6,24,10,24)],{
      ports:[{name:'L',x:8,y:0,dir:'N'},{name:'PE',x:8,y:24,dir:'S'}],
      reviewerNote:'Przyłączenie SPD do PE wymaga portów i potencjałów modelu; typ SPD nie wynika z samego glifu.'
    }),
  make('nn.cewkaStycznika','Cewka stycznika','KM','STYCZNIK / cewka',
    [L(8,0,8,4),P('M 3 4 H 13 V 20 H 3 Z'),T(8,12,'A',6),L(8,20,8,24)],{
      ports:[{name:'A1',x:8,y:0,dir:'N'},{name:'A2',x:8,y:24,dir:'S'}],
      reviewerNote:'Cewka aparatu wielofunkcyjnego; schemat szczegółowy nie jest automatycznie reprezentacją SLD.'
    }),
  make('nn.stykZwierny','Styk zwierny NO','KM','STYK_NO',[L(8,0,8,7),L(8,17,8,24)],{
      states:styk(false),reviewerNote:'Ocena funkcji styków według stanu spoczynkowego.'
    }),
  make('nn.stykRozwierny','Styk rozwierny NC','KM','STYK_NC',[L(8,0,8,7),L(8,17,8,24)],{
      states:styk(true),reviewerNote:'Ocena funkcji styków według stanu spoczynkowego.'
    }),
  make('nn.stykPrzelaczny','Styk przełączny','KA','STYK_CO',
    [L(8,0,8,5),L(8,18,8,24),L(12,7,16,7),L(0,7,4,7)],{
      ports:[{name:'11',x:8,y:24,dir:'S'},{name:'12',x:0,y:7,dir:'W'},{name:'14',x:16,y:7,dir:'E'}],
      states:{
       open:[{k:'pivot',cx:8,cy:18,deg:25,prims:[L(8,18,8,5)]}],
       closed:[{k:'pivot',cx:8,cy:18,deg:-25,prims:[L(8,18,8,5)]}],
       unknown:[{k:'pivot',cx:8,cy:18,deg:0,prims:[L(8,18,8,5)]}],
      },reviewerNote:'Trzy porty, jawny styk wspólny; nie reprezentować jako gałęzi ENM dwuportowej.'
    }),
  make('nn.licznikEnergii','Licznik energii','P','LICZNIK_ENERGII',
    [L(8,0,8,4),P('M 2 4 H 14 V 20 H 2 Z'),T(8,12,'kWh',3.4),L(8,20,8,24)],{
      reviewerNote:'Schemat blokowy; pomiary wielofazowe wymagają macierzy portów i danych pomiaru.'
    }),
  make('nn.amperomierz','Amperomierz','PA','POMIAR_PRADU',
    [L(8,0,8,4),C(8,12,8),T(8,12,'A',6),L(8,20,8,24)],{reviewerNote:'Schemat funkcjonalny, zaciski pomiarowe z modelu.'}),
  make('nn.woltomierz','Woltomierz','PV','POMIAR_NAPIECIA',
    [L(8,0,8,4),C(8,12,8),T(8,12,'V',6),L(8,20,8,24)],{reviewerNote:'Połączenie równoległe ma wynikać z topologii, nie symbolu.'}),
  make('nn.kondensator','Kondensator','C','BKR_NN',
    [L(8,0,8,10),L(3,10,13,10),L(3,14,13,14),L(8,14,8,24)],{
      reviewerNote:'Element kondensatora; bateria 3-fazowa to grupa z parametrami i aparaturą.'
    }),
  make('nn.silnik3F','Silnik trójfazowy','M','ODBIOR_SILNIK',
    [L(8,0,8,4),C(8,12,8),T(8,10,'M',5),T(8,16,'3~',3.4),L(8,20,8,24)],{
      reviewerNote:'Wypadkowy tor odpływu; przekroje i zabezpieczenia oddzielnie.'
    }),
  make('nn.listwaZaciskowa','Zacisk listwy','X','ZACISK',
    [L(0,12,5,12),C(8,12,3),L(11,12,16,12)],{
      ports:[{name:'we',x:0,y:12,dir:'W'},{name:'wy',x:16,y:12,dir:'E'}],
      reviewerNote:'Zacisk to obiekt oznaczony numerem, nie kropka połączeniowa.'
    }),
] as const;

/** Kandydat nie nadpisuje geometrii bazowej. ACB/MCCB są aliasami funkcji. */
export function geometriaPropozycji(s: LvCandidate, state: CadSwitchState): readonly CadPrimitive[] {
  if (s.baseSymbol) return s.body; // body = dodatkowy kwalifikator; główny glif pochodzi z CadSymbol
  return [...s.body,...(s.states?.[state]??[])];
}

export const LV_CANDIDATE_IDS=LV_CANDIDATE_SYMBOLS.map(x=>x.id);
