/**
 * ENEA profile constraints for composing genuine RGnN equipment from existing
 * ENM references. NO fictitious devices and NO drawing/mixed SN/nn canvas.
 *
 * Standard źródłowy: ENEA Operator, Stacje SN/nn, zeszyt 1 §4.4–4.5
 * (01.01.2025), zeszyt 2 §4.4–4.5 (01.01.2025).
 *
 * Uwaga: "12/5 pól" to dostępne miejsca, NIE koniecznie zainstalowane aparaty.
 * Rozstaw 185 mm to parametr fizycznego ułożenia szyn, NIE piksele SLD.
 */
export type WariantNnEnea = 'KOMPAKT_630'|'UPROSZCZONA_400';
export type TypAparatuNn =
  'ROZLACZNIK_IZOLACYJNY'|'LISTWOWY_ROZLACZNIK_BEZPIECZNIKOWY'|
  'APARAT_INNY_Z_PROJEKTU';
export type NnPhase = 'L1'|'L2'|'L3'|'N'|'PE'|'PEN';

export interface WymaganiaNnEnea {
  readonly id: WariantNnEnea;
  readonly standard: string;
  readonly clause: string;
  readonly maxSnKva: number;
  readonly mainInA: number;
  readonly capacity: number;
  readonly nominalBusCurrentA: number;
  readonly physicalPhasePitchMm: 185;
  readonly busbarCuMm: readonly [60|40,10];
  readonly requiredBusPhases:readonly ['L1','L2','L3','PEN'];
}
export const WYMAGANIA_ENEA_NN: Readonly<Record<WariantNnEnea,WymaganiaNnEnea>> = {
  KOMPAKT_630:{
    id:'KOMPAKT_630',standard:'ENEA SN/nn Zeszyt 1 2025',clause:'§4.4-4.5, rys. 1/2',
    maxSnKva:630,mainInA:1250,capacity:12,nominalBusCurrentA:910,
    physicalPhasePitchMm:185,busbarCuMm:[60,10],
    requiredBusPhases:['L1','L2','L3','PEN']
  },
  UPROSZCZONA_400:{
    id:'UPROSZCZONA_400',standard:'ENEA SN/nn Zeszyt 2 2025',clause:'§4.4-4.5, rys. 1/2',
    maxSnKva:400,mainInA:910,capacity:5,nominalBusCurrentA:630,
    physicalPhasePitchMm:185,busbarCuMm:[40,10],
    requiredBusPhases:['L1','L2','L3','PEN']
  }
} as const;

export interface RozlacznikGlownyNn {
  readonly enmRef:string;
  readonly typ:TypAparatuNn;
  readonly znamionowyA:number;
  readonly bieguny:3;
}
export interface OdpylwEneaNn {
  readonly slot:number; // 1-based, tylko realnie zajęte pozycje
  readonly enmBranchRef:string;
  readonly aparatRef:string;
  readonly typ:TypAparatuNn;
  readonly fuseSize: '2'|string;
  readonly fazy:readonly ['L1','L2','L3'];
  readonly operacjeJednobiegunowe:boolean;
}
export interface EnmNnStationContract {
  readonly transformerRef:string;
  readonly transformerKva:number;
  readonly mainSwitch?:RozlacznikGlownyNn;
  readonly outgoing:readonly OdpylwEneaNn[];
  readonly ctRefs:readonly string[];
  readonly ctLocation?:'ZA_LACZNIKIEM_GLOWNYM'|'PRZED_LACZNIKIEM_GLOWNYM';
  readonly busPhaseRefs:Readonly<Partial<Record<NnPhase,string>>>;
  /** Jeśli sprzęgło występuje w ENM, nie wolno go ukryć ani arbitralnie "usunąć".
   * Profile ENEA 630/400 nie przewidują go w schemacie referencyjnym. */
  readonly couplerRef?:string;
}
export interface SlotNnEnea{
  readonly slot:number;
  readonly occupied:boolean;
  readonly modelRef:string|null;
  readonly deviceRef:string|null;
}
export interface WynikKontroliNnEnea{
  readonly profile:WymaganiaNnEnea;
  readonly zgodny:boolean;
  readonly bledy:readonly string[];
  readonly rezerwowaneMiejsca:readonly SlotNnEnea[];
}
function reference(x:string|undefined):boolean{return Boolean(x&&x.trim().length>0)}

export function zweryfikujKompozycjeNnEnea(
  wariant:WariantNnEnea,
  model:EnmNnStationContract
):WynikKontroliNnEnea{
  const req=WYMAGANIA_ENEA_NN[wariant];
  const errors:string[]=[];
  if(!reference(model.transformerRef)||!(model.transformerKva>0)||
     model.transformerKva>req.maxSnKva)errors.push('Nieprawidłowy transformator SN/nN.');
  if(!model.mainSwitch||!reference(model.mainSwitch.enmRef)){
    errors.push('Brak rozłącznika głównego jako jawnego obiektu ENM.');
  }else{
    if(model.mainSwitch.typ!=='ROZLACZNIK_IZOLACYJNY')
      errors.push('Nieprawidłowa funkcja łącznika głównego.');
    if(model.mainSwitch.znamionowyA!==req.mainInA)
      errors.push('Niezgodny prąd znamionowy łącznika głównego.');
  }
  if(model.couplerRef)errors.push('Sprzęgło spoza wzorca ENEA — odrębny projekt wymagany.');
  if(model.ctLocation!=='ZA_LACZNIKIEM_GLOWNYM' ||
     model.ctRefs.length!==3 || model.ctRefs.some(x=>!reference(x)))
    errors.push('Brak trzech przekładników prądowych za rozłącznikiem głównym.');
  if(new Set(model.ctRefs).size!==model.ctRefs.length)
    errors.push('Zduplikowany identyfikator przekładnika.');
  for(const phase of req.requiredBusPhases){
    if(!reference(model.busPhaseRefs[phase]))
      errors.push('Brak rzeczywistej szyny: '+phase+'.');
  }
  // PEN nie wolno przełączać w powiązanym łączniku; model potwierdza go jako
  // osobny potencjał, nie jako biegun 4P.
  const present=new Map<number,OdpylwEneaNn>();
  for(const d of model.outgoing){
    if(!Number.isInteger(d.slot)||d.slot<1||d.slot>req.capacity)
      errors.push('Pozycja odpływu poza zakresem.');
    if(present.has(d.slot))errors.push('Zduplikowane miejsce odpływowe.');
    present.set(d.slot,d);
    if(!reference(d.enmBranchRef)||!reference(d.aparatRef))
      errors.push('Odpływ bez jawnych identyfikatorów ENM.');
    if(d.typ!=='LISTWOWY_ROZLACZNIK_BEZPIECZNIKOWY'||
       d.fuseSize!=='2'||!d.operacjeJednobiegunowe||
       d.fazy.join('/')!=='L1/L2/L3')
      errors.push('Nieprawidłowy listwowy rozłącznik odpływu '+d.slot+'.');
  }
  const occupied = Array.from({length:req.capacity},(_,i)=>{
    const d=present.get(i+1);
    return {slot:i+1,occupied:!!d,modelRef:d?.enmBranchRef??null,deviceRef:d?.aparatRef??null};
  });
  return {profile:req,zgodny:errors.length===0,bledy:errors,rezerwowaneMiejsca:occupied};
}
