import { describe, expect, it } from 'vitest';
import {
  BAZA_SYMBOLI_SLD, pokrycieBiblioteki, pozycjeDoAkceptacji,
} from '../sldSymbolLibraryCatalog';
import { ELECTRICAL_CAD_SYMBOL_REGISTRY } from '../../cadSymbolRegistry';
import { QET_PILOT_SYMBOLS } from '../qetPilotSourceGeometry';

describe('Biblioteka SLD nN/SN — tylko rzeczywiste źródła',()=>{
  it('każda pozycja ma unikalny identyfikator i właściwy poziom',()=>{
    const ids=BAZA_SYMBOLI_SLD.map(x=>x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pozycjeDoAkceptacji('nN').length).toBeGreaterThan(20);
    expect(pozycjeDoAkceptacji('SN').length).toBeGreaterThan(16);
    expect(BAZA_SYMBOLI_SLD.every(x=>x.poziom==='nN'||x.poziom==='SN')).toBe(true);
  });
  it('dostępna geometria zawsze prowadzi do istniejącego symbolu CAD/QET',()=>{
    for(const entry of BAZA_SYMBOLI_SLD){
      const ready=entry.status==='CAD_ISTNIEJACY'||entry.status==='QET_ZRODLOWY';
      if(ready){
        if(entry.cadId)expect(ELECTRICAL_CAD_SYMBOL_REGISTRY[entry.cadId]).toBeDefined();
        if(entry.qetId)expect(QET_PILOT_SYMBOLS.some(s=>s.id===entry.qetId)).toBe(true);
        expect(Boolean(entry.cadId||entry.qetId)).toBe(true);
      }else{
        expect(entry.cadId).toBeNull();
        expect(entry.qetId).toBeNull();
      }
    }
  });
  it('pola SN i rozdzielnice ENEA są złożeniami, nie podrabianymi glifami',()=>{
    for(const e of BAZA_SYMBOLI_SLD.filter(x=>x.status==='ZLOZENIE_ENM')){
      expect(e.rodzaj).toBe('ZLOZENIE');
      expect(e.cadId).toBeNull();
      expect(e.qetId).toBeNull();
      expect(e.czyLacznik).toBe(false);
    }
  });
  it('własność ramki wynika tylko z występowania łącznika',()=>{
    for(const e of BAZA_SYMBOLI_SLD.filter(x=>x.cadId)){
      const qet=QET_PILOT_SYMBOLS.find(x=>x.id===e.qetId);
      const def=ELECTRICAL_CAD_SYMBOL_REGISTRY[e.cadId!];
      expect(e.czyLacznik).toBe(Boolean(def.states));
      if(qet && qet.rodzaj==='BEZPIECZNIK')expect(e.czyLacznik).toBe(false);
    }
  });
  it('katalog raportuje luki oddzielnie od zrealizowanych symboli',()=>{
    for(const level of ['nN','SN'] as const){
      const c=pokrycieBiblioteki(level);
      expect(c.razem).toBe(c.geometriaIstnieje+c.brakZrodla+c.zlozenia);
      expect(c.brakZrodla).toBeGreaterThan(0);
      expect(c.zlozenia).toBeGreaterThan(0);
    }
  });
});
