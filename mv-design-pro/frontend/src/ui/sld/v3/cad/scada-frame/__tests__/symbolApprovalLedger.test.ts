import { describe, expect, it } from 'vitest';
import {
  BAZA_SYMBOLI_SLD,
} from '../sldSymbolLibraryCatalog';
import {
  zmienDecyzje,utworzEksport,wczytajEksport,podsumowanieOdbioru,csvOdbioru,
} from '../symbolApprovalLedger';

describe('Rejestr 73 indywidualnych decyzji właściciela',()=>{
  const a=BAZA_SYMBOLI_SLD[0],b=BAZA_SYMBOLI_SLD.at(-1)!;
  const t='2026-10-24T19:00:00.000Z';
  it('startuje jako 73 nieocenione i nie przypisuje B-02 akceptacji',()=>{
    expect(BAZA_SYMBOLI_SLD.length).toBe(73);
    expect(podsumowanieOdbioru(BAZA_SYMBOLI_SLD,{})).toEqual({
      zaakceptowane:0,odrzucone:0,doPoprawy:0,nieocenione:73,
    });
    const ex=utworzEksport(BAZA_SYMBOLI_SLD,{},t);
    expect(ex.b02).toBe('ODRZUCONE');
    expect(ex.symbolCount).toBe(73);
    expect(ex.decisions).toHaveLength(73);
  });
  it('wspiera osobne akceptacje, odrzucenia i uwagi, również dla brakujących źródeł',()=>{
    let state=zmienDecyzje({},a.id,'AKCEPTUJE','Geometria czytelna',t);
    state=zmienDecyzje(state,b.id,'ODRZUCAM','Brak poprawnego źródła',t);
    const sum=podsumowanieOdbioru(BAZA_SYMBOLI_SLD,state);
    expect(sum.zaakceptowane).toBe(1);
    expect(sum.odrzucone).toBe(1);
    expect(sum.nieocenione).toBe(71);
    const exported=utworzEksport(BAZA_SYMBOLI_SLD,state,t);
    expect(wczytajEksport(exported,BAZA_SYMBOLI_SLD)).toEqual(state);
    expect(csvOdbioru(exported)).toContain('Geometria czytelna');
  });
  it('czyta decyzje z pobranego samodzielnego HTML',()=>{
    const standalone={
      schema:'MVDesignProSymbolApprovalV1',basePR:500,
      records:[
        {id:a.id,approval:{status:'zaakceptowany',uwagi:'Akceptacja geometrii',updatedAt:t}},
        {id:b.id,approval:{status:'do_poprawy',uwagi:'Źródła ENEA',updatedAt:t}},
        {id:'NIE-ISTNIEJE',approval:{status:'odrzucony',uwagi:'',updatedAt:t}},
      ],
    };
    const state=wczytajEksport(standalone,BAZA_SYMBOLI_SLD);
    expect(state[a.id]?.decyzja).toBe('AKCEPTUJE');
    expect(state[b.id]?.decyzja).toBe('DO_POPRAWY');
    expect(Object.keys(state)).toHaveLength(2);
  });
  it('odrzuca nieuprawniony format i wadliwą decyzję',()=>{
    expect(()=>wczytajEksport({schema:'random'},BAZA_SYMBOLI_SLD)).toThrow();
    expect(()=>zmienDecyzje({},a.id,'NIEWIADOMO' as never,'',t)).toThrow();
  });
});
