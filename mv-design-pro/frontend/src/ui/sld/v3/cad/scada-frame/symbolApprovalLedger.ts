/**
 * Rejestr decyzji właściciela dla biblioteki nN/SN PR #500.
 * Dane lokalne użytkownika, NIE zmieniają statusu normatywnego,
 * nie są zatwierdzeniem B-02 i nie oznaczają scalania PR.
 */
import type { PozycjaBiblioteki } from './sldSymbolLibraryCatalog';

export type DecyzjaSymbolu = 'NIEOCENIONY' | 'AKCEPTUJE' | 'ODRZUCAM' | 'DO_POPRAWY';
export interface ZapisOdbioru {
  readonly decyzja: DecyzjaSymbolu;
  readonly uwagi: string;
  readonly zmieniono: string;
}
export type RejestrOdbioru = Readonly<Record<string, ZapisOdbioru>>;
export const KLUCZ_ODBIORU_SYMBOLI = 'mv-design-pro/approval/sld-library/PR-500/v1';

export interface EksportOdbioru {
  readonly schema: 'MvDesignProSldApprovalV1';
  readonly repoPr: 500;
  readonly b02: 'ODRZUCONE';
  readonly symbolCount: number;
  readonly exportedAt: string;
  readonly decisions: readonly {
    readonly id: string;
    readonly level: string;
    readonly symbolName: string;
    readonly sourceStatus: string;
    readonly decision: DecyzjaSymbolu;
    readonly note: string;
    readonly changedAt: string;
  }[];
}

const DECYZJE = new Set<DecyzjaSymbolu>([
  'NIEOCENIONY','AKCEPTUJE','ODRZUCAM','DO_POPRAWY',
]);
export function czyPrawidlowaDecyzja(v:unknown):v is DecyzjaSymbolu {
  return typeof v==='string' && DECYZJE.has(v as DecyzjaSymbolu);
}
export function zmienDecyzje(
  current:RejestrOdbioru,
  id:string,
  decyzja:DecyzjaSymbolu,
  uwagi:string,
  timestamp:string,
):RejestrOdbioru{
  if(!id || !czyPrawidlowaDecyzja(decyzja) || typeof uwagi!=='string' ||
    uwagi.length>20000 || !Number.isFinite(Date.parse(timestamp)))
    throw new Error('Odmowa zapisu nieprawidłowej decyzji odbiorowej');
  return {...current,[id]:{decyzja,uwagi,zmieniono:timestamp}};
}
export function utworzEksport(
  symbols:readonly PozycjaBiblioteki[],
  current:RejestrOdbioru,
  timestamp:string,
):EksportOdbioru{
  if(!Number.isFinite(Date.parse(timestamp)))throw new Error('Błędna data eksportu');
  return {
    schema:'MvDesignProSldApprovalV1',
    repoPr:500,
    b02:'ODRZUCONE',
    symbolCount:symbols.length,
    exportedAt:timestamp,
    decisions:symbols.map(item=>({
      id:item.id,level:item.poziom,symbolName:item.nazwa,
      sourceStatus:item.status,
      decision:current[item.id]?.decyzja??'NIEOCENIONY',
      note:current[item.id]?.uwagi??'',
      changedAt:current[item.id]?.zmieniono??'',
    })),
  };
}
export function wczytajEksport(
  unknownPayload:unknown,
  catalog:readonly PozycjaBiblioteki[],
):RejestrOdbioru {
  if(!unknownPayload||typeof unknownPayload!=='object')
    throw new Error('Nieprawidłowy plik odbioru');
  const p=unknownPayload as Partial<EksportOdbioru>;
  // Samodzielny HTML do odbioru może zostać zaimportowany do atlasu React.
  // Zachowujemy dwa formaty zgodne z PR #500, bez domniemania akceptacji B-02.
  const external=unknownPayload as {
    schema?:unknown;
    basePR?:unknown;
    records?:readonly {
      id?:unknown;
      approval?:{status?:unknown;uwagi?:unknown;updatedAt?:unknown};
    }[];
  };
  if(external.schema==='MVDesignProSymbolApprovalV1' &&
    external.basePR===500 && Array.isArray(external.records) &&
    external.records.length<=2000){
    const ids=new Set(catalog.map(x=>x.id));
    let result:RejestrOdbioru={};
    const map:Record<string,DecyzjaSymbolu>={
      zaakceptowany:'AKCEPTUJE',odrzucony:'ODRZUCAM',
      do_poprawy:'DO_POPRAWY',nieoceniony:'NIEOCENIONY',
    };
    for(const entry of external.records){
      if(typeof entry.id!=='string'||!ids.has(entry.id)||!entry.approval)continue;
      const status=entry.approval.status;
      const decision=typeof status==='string'?map[status]:undefined;
      if(!decision||typeof entry.approval.uwagi!=='string')continue;
      const timestamp=typeof entry.approval.updatedAt==='string' &&
        Number.isFinite(Date.parse(entry.approval.updatedAt))
        ? entry.approval.updatedAt : new Date(0).toISOString();
      result=zmienDecyzje(result,entry.id,decision,entry.approval.uwagi,timestamp);
    }
    return result;
  }
  if(p.schema!=='MvDesignProSldApprovalV1'||p.repoPr!==500||
    !Array.isArray(p.decisions)||p.decisions.length>2000)
    throw new Error('Niezgodny format rejestru odbioru');
  const ids=new Set(catalog.map(x=>x.id));
  let result:RejestrOdbioru={};
  for(const e of p.decisions){
    if(!e||typeof e!=='object'||!ids.has(e.id)||!czyPrawidlowaDecyzja(e.decision)||
      typeof e.note!=='string'||e.note.length>20000||
      typeof e.changedAt!=='string')continue;
    result=zmienDecyzje(result,e.id,e.decision,e.note,
      Number.isFinite(Date.parse(e.changedAt))?e.changedAt:new Date(0).toISOString());
  }
  return result;
}
export function podsumowanieOdbioru(symbols:readonly PozycjaBiblioteki[],state:RejestrOdbioru){
  const result={zaakceptowane:0,odrzucone:0,doPoprawy:0,nieocenione:0};
  for(const sym of symbols){
    const s=state[sym.id]?.decyzja??'NIEOCENIONY';
    if(s==='AKCEPTUJE')result.zaakceptowane++;
    else if(s==='ODRZUCAM')result.odrzucone++;
    else if(s==='DO_POPRAWY')result.doPoprawy++;
    else result.nieocenione++;
  }
  return result;
}
export function csvOdbioru(payload:EksportOdbioru):string{
  const quoted=(v:string|number)=>'"'+String(v).replace(/"/g,'""')+'"';
  return '\uFEFF'+[
    ['ID','Poziom','Nazwa','Status źródła','Decyzja','Uwagi','Data'],
    ...payload.decisions.map(e=>[
      e.id,e.level,e.symbolName,e.sourceStatus,e.decision,e.note,e.changedAt,
    ]),
  ].map(row=>row.map(quoted).join(';')).join('\r\n');
}
